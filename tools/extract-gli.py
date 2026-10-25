#!/usr/bin/env python3
"""
One-off extraction of GLI reference-equation inputs into JSON under src/reference/data/.

Inputs (not committed; sha256 recorded in src/reference/sources.json):
  GLI-2012-spirometry.xls            coefficients and spline tables, five ethnic categories
  GLI-Global-2022-spirometry.xlsx    spline tables; coefficient strings in the sheet
  GLI-2021-volumes.xlsx              spline tables only
  GLI-2017-TLCO-traditional-corrected2020.xlsx   spline tables only
The volume and TLCO workbooks contain no regression coefficients. Those are read from the
published-equation implementation in pft_interpreter (calculations.js, lookup-data-config.js),
and they are NOT checked against Hall 2021 or Stanojevic 2017 here. See SPEC.md.

Usage: python3 tools/extract-gli.py SOURCES_DIR PFT_INTERPRETER_DIR
SOURCES_DIR holds the five source files under their sources.json names.
"""
import hashlib, json, math, re, sys
from pathlib import Path
import openpyxl, xlrd

src_dir, interp_dir = Path(sys.argv[1]), Path(sys.argv[2])
out_dir = Path(__file__).resolve().parent.parent / 'src' / 'reference' / 'data'
sources = json.loads((Path(__file__).resolve().parent.parent / 'src' / 'reference' / 'sources.json').read_text())
for s in sources:
    h = hashlib.sha256((src_dir / s['file']).read_bytes()).hexdigest()
    assert h == s['sha256'], f"{s['file']}: sha256 {h} does not match sources.json"

def num(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool)

def splines(rows, age_col, m_col, s_col, l_col):
    out = {'age': [], 'm': [], 's': [], 'l': []}
    for r in rows:
        if num(r[age_col]) and num(r[m_col]):
            out['age'].append(float(r[age_col])); out['m'].append(float(r[m_col]))
            out['s'].append(float(r[s_col] or 0.0)); out['l'].append(float(r[l_col] or 0.0))
    ages = out['age']
    assert all(b > a for a, b in zip(ages, ages[1:])), 'ages must increase'
    return out

KEYS = {'ln(age)': 'ageLn', 'Math.log(age)': 'ageLn', 'age': 'age', 'ln(height)': 'htLn',
        'Math.log(height_cm)': 'htLn', 'height_cm': 'ht', 'height': 'ht'}
TERM = re.compile(r'([+-]?\s*\d*\.?\d+)\s*\*\s*(ln\((?:age|height)\)|Math\.log\((?:age|height_cm)\)|age|height_cm|height)')

def terms(expr):
    """Parse 'c + k1*ln(age) + k2*age + k3*ln(height) + k4*height' into a dict of coefficients."""
    expr = expr.replace('\u2013', '-').replace('\u2212', '-')
    t = {'const': 0.0, 'ageLn': 0.0, 'age': 0.0, 'htLn': 0.0, 'ht': 0.0}
    for m in TERM.finditer(expr):
        t[KEYS[m.group(2)]] += float(m.group(1).replace(' ', ''))
    rest = TERM.sub(' ', expr)
    rest = re.sub(r'(exp|ln|Math\.\w+)\(', '(', rest)
    nums = [float(c.replace(' ', '')) for c in re.findall(r'(?<![\w.])([+-]?\s*\d*\.\d+|[+-]?\s*\d+)(?![\w.*])', rest)]
    assert len(nums) == 1, f'expected one constant in {expr!r}, got {nums}'
    t['const'] = nums[0]
    return t

data = {}
# ---------------- GLI-2012 ----------------
wb = xlrd.open_workbook(src_dir / 'GLI-2012-spirometry.xls')
sheets = {('fev1', 'male'): 'FEV1 males', ('fvc', 'male'): 'FVC males', ('fev1_fvc', 'male'): 'FEV1FVC males',
          ('fev1', 'female'): 'FEV1 females', ('fvc', 'female'): 'FVC females', ('fev1_fvc', 'female'): 'FEV1FVC females'}
g2012 = {}
for (measure, sex), name in sheets.items():
    sh = wb.sheet_by_name(name)
    rows = [sh.row_values(i) for i in range(sh.nrows)]
    labels = {rows[i][7]: rows[i][8] for i in range(3, 10) if rows[i][7]}
    plabels = {rows[i][10]: rows[i][11] for i in range(3, 10) if rows[i][10]}
    qlabels = {rows[i][13]: rows[i][14] for i in range(3, 6) if rows[i][13] in ('q0', 'q1')}
    a = [labels[f'a{k}'] for k in range(7)]
    p = [plabels[f'p{k}'] for k in range(6)]
    q = [qlabels['q0'], qlabels['q1']]
    assert all(num(x) for x in a + p + q), (name, a, p, q)
    g2012.setdefault(measure, {})[sex] = {
        'a': a, 'p': p, 'q': q,
        'splines': splines(rows, 1, 3, 4, 2),
    }
data['gli2012.json'] = {'id': 'GLI2012', 'ethnicityCodes': {'1': 'Caucasian', '2': 'African American', '3': 'North-East Asian', '4': 'South-East Asian', '5': 'Other or mixed'},
                         'sourceFile': 'GLI-2012-spirometry.xls', 'measures': g2012}

# ---------------- GLI Global 2022 ----------------
wb = openpyxl.load_workbook(src_dir / 'GLI-Global-2022-spirometry.xlsx', data_only=True)
gsheets = {('fev1', 'male'): 'Male FEV1', ('fvc', 'male'): 'Male FVC', ('fev1_fvc', 'male'): 'Male FEV1 FVC',
           ('fev1', 'female'): 'Female FEV1', ('fvc', 'female'): 'Female FVC', ('fev1_fvc', 'female'): 'Female FEV1 FVC'}
gl = {}
for (measure, sex), name in gsheets.items():
    ws = wb[name]
    rows = list(ws.iter_rows(values_only=True))
    eq = {}
    for r in rows:
        if r[5] in ('M', 'S', 'L') and r[6] is not None:
            eq[r[5]] = r[6]
    assert set(eq) == {'M', 'S', 'L'}, (name, eq)
    m = terms(str(eq['M']))
    s = terms(str(eq['S']))
    l = terms(str(eq['L'])) if isinstance(eq['L'], str) else {'const': float(eq['L']), 'ageLn': 0.0, 'age': 0.0, 'htLn': 0.0, 'ht': 0.0}
    gl.setdefault(measure, {})[sex] = {'m': m, 's': s, 'l': l, 'sSpline': True, 'equations': {k: str(v) for k, v in eq.items()},
                                       'splines': splines(rows, 0, 1, 2, 3)}
data['gli_global.json'] = {'id': 'GLIglobal', 'sourceFile': 'GLI-Global-2022-spirometry.xlsx', 'measures': gl}

# ---------------- pft_interpreter coefficient source for volumes and TLCO ----------------
calc = (interp_dir / 'src' / 'js' / 'calculations.js').read_text()
cfg = (interp_dir / 'src' / 'js' / 'lookup-data-config.js').read_text()
pred_fn = calc[calc.index('function calculatePredicted'):calc.index('// Calculate Z-score')]
def section(text, sex):
    start = text.index(f"genderLower === '{sex}'")
    end = text.index("genderLower === 'female'", start + 1) if sex == 'male' else text.index('} else {', start)
    return text[start:end] if sex == 'male' else text[start:]
pred = {}
for sex in ('male', 'female'):
    sec = section(pred_fn, sex)
    for m in re.finditer(r"case '(\w+)':\s*pred = Math\.exp\((.*?)\);", sec, re.S):
        pred.setdefault(m.group(1), {})[sex] = m.group(2)
getlms = calc[calc.index('function getLMS'):calc.index('// Calculate predicted value')]
sform = {}
for sex in ('male', 'female'):
    start = getlms.index("if (g === 'male')") if sex == 'male' else getlms.index('} else { // Female')
    end = getlms.index('} else { // Female') if sex == 'male' else getlms.index('return { m:')
    for m in re.finditer(r"type === '(\w+)'\) \{ s = Math\.exp\((.*?)\); \}", getlms[start:end]):
        sform.setdefault(m.group(1), {})[sex] = m.group(2)
lcfg = {}
for sex in ('male', 'female'):
    block = cfg[cfg.index(f'lookupDataConfig.{sex} = {{'):]
    block = block[:block.index('};')]
    for m in re.finditer(r"(\w+): \{ table: [^,]+, (l|lDynamic): ([^}]+) \}", block):
        lcfg.setdefault(m.group(1), {})[sex] = (m.group(2), m.group(3).strip())

def build(measure_key, sex):
    mexpr = pred[measure_key][sex].replace('m_spline', '0')
    mterms = terms(mexpr.replace('+ 0', ''))
    sexpr = sform[measure_key][sex]
    uses_spline = 's_spline' in sexpr
    sterms = terms(sexpr.replace('+ s_spline', '').replace('s_spline', '0'))
    kind, lexpr = lcfg[measure_key][sex]
    if kind == 'l':
        lterms = {'const': float(lexpr), 'ageLn': 0.0, 'age': 0.0, 'htLn': 0.0, 'ht': 0.0}
    else:
        lterms = terms(lexpr.split('=>')[1].strip())
    return {'m': mterms, 's': sterms, 'l': lterms, 'sSpline': uses_spline,
            'equations': {'M': pred[measure_key][sex], 'S': sexpr, 'L': lexpr}}

def workbook_measures(path, sheet_map, measure_names):
    wb = openpyxl.load_workbook(path, data_only=True)
    out = {}
    for (measure, sex), name in sheet_map.items():
        rows = list(wb[name].iter_rows(values_only=True))
        header = [str(c).lower() if c is not None else '' for c in rows[0]]
        a = header.index('age')
        spl = splines(rows, a, header.index('mspline'), header.index('sspline'), header.index('lspline'))
        entry = build(measure_names[measure], sex)
        if not entry['sSpline']:
            assert all(abs(x) < 1e-12 for x in spl['s']), f'{name}: sheet has an S spline but the equation source ignores it'
        out.setdefault(measure, {})[sex] = {**entry, 'splines': spl}
    return out

vol_names = ['tlc', 'rv', 'vc', 'ic', 'erv', 'frc', 'rvtlc']
vsheets = {(('rv_tlc' if v == 'rvtlc' else v), sx): f"{v}_{sx[0]}_lookuptable" for v in vol_names for sx in ('male', 'female')}
data['gli_volumes.json'] = {'id': 'GLI2021vol', 'sourceFile': 'GLI-2021-volumes.xlsx', 'coefficientSource': 'Prior coefficient transcription (pft_interpreter); local comparison confirms transcription agreement, not independent printed-table verification. Splines checked against archived original workbooks; see docs/verification/coefficient-source-request.md for remaining primary-table and official-output gaps.',
                            'measures': workbook_measures(src_dir / 'GLI-2021-volumes.xlsx', vsheets, {k: k for k in ['tlc', 'rv', 'vc', 'ic', 'erv', 'frc', 'rv_tlc']})}
tsheets = {('dlco', 'male'): 'DLCO_m', ('dlco', 'female'): 'DLCO_f', ('kco', 'male'): 'KCO_m', ('kco', 'female'): 'KCO_f', ('va', 'male'): 'VA_m', ('va', 'female'): 'VA_f'}
data['gli_tlco.json'] = {'id': 'GLI2017tlco', 'units': 'traditional (DLCO mL/min/mmHg, KCO mL/min/mmHg/L, VA L)', 'sourceFile': 'GLI-2017-TLCO-traditional-corrected2020.xlsx',
                         'coefficientSource': 'Prior coefficient transcription (pft_interpreter); local comparison confirms transcription agreement, not independent printed-table verification. Splines checked against archived original workbooks; see docs/verification/coefficient-source-request.md for remaining primary-table and official-output gaps.',
                         'measures': workbook_measures(src_dir / 'GLI-2017-TLCO-traditional-corrected2020.xlsx', tsheets, {k: k for k in ['dlco', 'kco', 'va']})}

for name, payload in data.items():
    (out_dir / name).write_text(json.dumps(payload, separators=(',', ':')) + '\n')
    print('wrote', name, (out_dir / name).stat().st_size, 'bytes')

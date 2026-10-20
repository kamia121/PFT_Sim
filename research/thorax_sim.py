#!/usr/bin/env python3
"""
Scaffold for a first-principles thoracic model of spirometry by ancestry group.

Design rules
  1. No spirometry enters the model. Inputs are anthropometric (standing height,
     sitting height ratio, chest dimensions) and physiologic priors.
  2. Every parameter is a prior. One draw of all parameters is a "universe".
     The output is a distribution over universes, never a point estimate.
  3. GLI is touched only in the compare step, so group ratios are out-of-sample.

All numeric priors below are PLACEHOLDERS from rough recollection. Replace each
with a cited value (body-measurement surveys, CT lung and thoracic volumes,
autopsy data) before interpreting any output.

Sex coding 1 = male, 2 = female. Group order EUR, AFR, NEA, SEA.

Usage
  python thorax_sim.py grid   --out grid.csv
  (run the R snippet at the bottom to make gli.csv from grid.csv)
  python thorax_sim.py prior  --universes 20000 --gli gli.csv --out ratios.csv
  python thorax_sim.py cohort --n 5000000 --out cohort.npz
"""
import argparse
import time

import numpy as np

GROUPS = ["EUR", "AFR", "NEA", "SEA"]
G = len(GROUPS)

# ---- placeholder anthropometric inputs (replace with cited survey values) ----
SHR_MEAN = np.array([0.520, 0.505, 0.525, 0.525])          # sitting height / height
HADULT = {1: np.array([177, 176, 171, 165.0]),
          2: np.array([163, 163, 159, 153.0])}              # cm
HSD = {1: 6.7, 2: 6.2}
PHV_BASE = {1: 13.5, 2: 11.5}                               # age at midpoint of height gain
SHR_REF = 0.52


def sig(x):
    return 1.0 / (1.0 + np.exp(-x))


def draw_priors(U, rng):
    """One row per universe. Group offsets for EUR are fixed at 0."""
    th = dict(
        kappa=rng.normal(0.60, 0.06, U),       # lung volume / thoracic cavity volume at TLC
        shape=rng.normal(0.55, 0.05, U),       # cavity shape factor (dome, taper)
        tfrac=rng.normal(0.62, 0.03, U),       # thoracic height / sitting height
        cb=rng.normal(0.150, 0.008, U),        # internal chest breadth / height, EUR male
        db=rng.normal(0.67, 0.04, U),          # chest depth / breadth
        iso=rng.beta(2, 2, U),                 # how strongly chest width tracks trunk length
        sexcb=rng.normal(-0.08, 0.02, U),      # female chest breadth offset
        rv0=rng.normal(0.20, 0.02, U),         # RV/TLC at age 20
        rv_up=rng.normal(0.0033, 0.0006, U),   # RV/TLC rise per year after 20
        rv_child=rng.normal(0.004, 0.001, U),  # RV/TLC rise per year below 20
        rho0=rng.normal(0.85, 0.015, U),       # FEV1/FVC at age 20
        rho_dn=rng.normal(0.0016, 0.0003, U),  # FEV1/FVC decline per year after 20
        shr=SHR_MEAN[None, :] + rng.normal(0, 0.006, (U, G)),
        cb_g=rng.normal(0, 0.03, (U, G)),      # group chest breadth offset, mean 0
        db_g=rng.normal(0, 0.03, (U, G)),      # group depth/breadth offset, mean 0
        dys_g=rng.normal(0, 0.02, (U, G)),     # group airway-size (dysanapsis) offset on FEV1/FVC
        phv_g=rng.normal(0, 0.5, (U, G)),      # group growth timing offset, years
    )
    for k in ("cb_g", "db_g", "dys_g", "phv_g"):
        th[k][:, 0] = 0.0
    return th


def mean_model(th, g, sex, age, H):
    """Mean spirometry at given age and standing height for group g.
    th arrays have U rows, age and H are length K. Returns dict of (U, K)."""
    c = lambda k: th[k][:, None]
    cg = lambda k: th[k][:, g][:, None]
    age = np.asarray(age, float)[None, :]
    H = np.asarray(H, float)[None, :]

    s = sig((age - (PHV_BASE[sex] + cg("phv_g"))) / 1.8)
    shr = cg("shr") + 0.045 * (1 - s)                      # trunk matures later than legs
    sh = shr * H
    sexterm = (1 + c("sexcb")) if sex == 2 else 1.0
    B = c("cb") * (1 + cg("cb_g")) * sexterm * H * (shr / SHR_REF) ** c("iso")
    D = c("db") * (1 + cg("db_g")) * B
    Vth = np.pi / 4 * B * D * (c("tfrac") * sh) * c("shape") / 1000.0   # litres
    TLC = c("kappa") * Vth * (1 - 0.0008 * np.clip(age - 40, 0, None))

    rvt = c("rv0") + np.where(age >= 20, c("rv_up") * (age - 20), c("rv_child") * (20 - age))
    rvt = np.clip(rvt, 0.10, 0.60)
    FVC = TLC * (1 - rvt)
    rho = c("rho0") - c("rho_dn") * np.clip(age - 20, 0, None) + cg("dys_g")
    rho = np.clip(rho, 0.40, 0.95)
    return dict(TLC=TLC, RV=TLC * rvt, FVC=FVC, FEV1=FVC * rho, rvt=rvt, rho=rho)


def typical_height(age, sex, g=0, phv_off=0.0):
    age = np.asarray(age, float)
    frac = 0.64 + 0.36 * sig((age - (PHV_BASE[sex] + phv_off)) / 1.8)
    return HADULT[sex][g] * frac * (1 - 0.0008 * np.clip(age - 50, 0, None))


AGES = np.array([8, 10, 12, 14, 16, 18, 25, 35, 45, 55, 65, 75], float)


def make_grid():
    rows = []
    for sex in (1, 2):
        h = typical_height(AGES, sex)          # EUR height, shared by all groups
        for gname in GROUPS:
            for a, hh in zip(AGES, h):
                rows.append((gname, sex, a, round(float(hh), 1)))
    return rows


def cmd_grid(a):
    with open(a.out, "w") as f:
        f.write("group,sex,age,height\n")
        for r in make_grid():
            f.write(",".join(map(str, r)) + "\n")
    print(f"wrote {a.out}. Run the R snippet to add GLI fvc and fev1 columns.")


def cmd_prior(a):
    rng = np.random.default_rng(a.seed)
    th = draw_priors(a.universes, rng)
    rows = []
    gli = None
    if a.gli:
        import csv
        gli = {(r["group"], int(r["sex"]), float(r["age"])): (float(r["fvc"]), float(r["fev1"]))
               for r in csv.DictReader(open(a.gli))}
    print("grp sex age  FVC ratio median [2.5,97.5]   FEV1 ratio   GLI FVC ratio   gap explained")
    for sex in (1, 2):
        h = typical_height(AGES, sex)
        ref = mean_model(th, 0, sex, AGES, h)
        for gi in range(1, G):
            m = mean_model(th, gi, sex, AGES, h)
            rf = m["FVC"] / ref["FVC"]
            r1 = m["FEV1"] / ref["FEV1"]
            for k, ag in enumerate(AGES):
                lo, med, hi = np.percentile(rf[:, k], [2.5, 50, 97.5])
                med1 = np.median(r1[:, k])
                obs, expl = float("nan"), ""
                if gli:
                    obs = gli[(GROUPS[gi], sex, ag)][0] / gli[("EUR", sex, ag)][0]
                    if abs(1 - obs) > 0.03:
                        e = np.percentile((1 - rf[:, k]) / (1 - obs), [50, 2.5, 97.5])
                        expl = "%.2f [%.2f,%.2f]" % tuple(e)
                rows.append((GROUPS[gi], sex, ag, med, lo, hi, med1, obs, expl))
                if ag in (18, 25, 55):
                    print(f"{GROUPS[gi]:4s} {sex}  {ag:3.0f}  {med:.3f} [{lo:.3f},{hi:.3f}]   {med1:.3f}   {obs:.3f}   {expl}")
    with open(a.out, "w") as f:
        f.write("group,sex,age,fvc_ratio_med,fvc_lo,fvc_hi,fev1_ratio_med,gli_fvc_ratio,gap_explained\n")
        for r in rows:
            f.write(",".join(f"{x:.4f}" if isinstance(x, float) else str(x) for x in r) + "\n")
    print("wrote", a.out)


def central_theta(rng, n=2000):
    d = draw_priors(n, rng)
    return {k: np.median(v, axis=0, keepdims=True) for k, v in d.items()}


def cmd_cohort(a):
    rng = np.random.default_rng(a.seed)
    th = central_theta(rng)
    t0 = time.time()
    n = a.n
    grp = rng.choice(G, n, p=[0.4, 0.2, 0.2, 0.2])
    sex = rng.integers(1, 3, n)
    age = rng.uniform(6, 85, n)
    out = {k: np.empty(n, np.float32) for k in ("height", "fvc", "fev1", "tlc", "rv")}
    for g in range(G):
        for sx in (1, 2):
            idx = np.where((grp == g) & (sex == sx))[0]
            m = idx.size
            ag = age[idx]
            Ha = rng.normal(HADULT[sx][g], HSD[sx], m)
            H = Ha * (0.64 + 0.36 * sig((ag - (PHV_BASE[sx] + th["phv_g"][0, g])) / 1.8)) \
                * (1 - 0.0008 * np.clip(ag - 50, 0, None))
            mm = mean_model(th, g, sx, ag, H)
            tlc = mm["TLC"][0] * np.exp(0.08 * rng.normal(size=m))
            rvt = np.clip(mm["rvt"][0] + 0.03 * rng.normal(size=m), 0.08, 0.65)
            fvc = tlc * (1 - rvt)
            rho = np.clip(mm["rho"][0] + 0.04 * rng.normal(size=m), 0.30, 0.97)
            out["height"][idx], out["fvc"][idx] = H, fvc
            out["fev1"][idx], out["tlc"][idx], out["rv"][idx] = fvc * rho, tlc, tlc * rvt
    viol = int((out["fev1"] > out["fvc"]).sum() + (out["fvc"] > out["tlc"]).sum())
    np.savez_compressed(a.out, group=grp.astype(np.int8), sex=sex.astype(np.int8),
                        age=age.astype(np.float32), **out)
    print(f"{n:,} cases in {time.time() - t0:.1f}s, constraint violations {viol}, wrote {a.out}")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    sp = p.add_subparsers(dest="cmd", required=True)
    s = sp.add_parser("grid"); s.add_argument("--out", default="grid.csv"); s.set_defaults(f=cmd_grid)
    s = sp.add_parser("prior")
    s.add_argument("--universes", type=int, default=20000)
    s.add_argument("--gli"); s.add_argument("--out", default="ratios.csv")
    s.add_argument("--seed", type=int, default=1); s.set_defaults(f=cmd_prior)
    s = sp.add_parser("cohort")
    s.add_argument("--n", type=int, default=1_000_000)
    s.add_argument("--out", default="cohort.npz")
    s.add_argument("--seed", type=int, default=1); s.set_defaults(f=cmd_cohort)
    a = p.parse_args()
    a.f(a)

# ---- R snippet to build gli.csv (verify rspiro argument conventions first) ----
# library(rspiro)
# g <- read.csv("grid.csv")
# eth <- c(EUR = 1, AFR = 2, NEA = 3, SEA = 4)[g$group]
# g$fvc  <- pred_GLI(g$age, g$height / 100, g$sex, eth, "FVC")
# g$fev1 <- pred_GLI(g$age, g$height / 100, g$sex, eth, "FEV1")
# write.csv(g, "gli.csv", row.names = FALSE)

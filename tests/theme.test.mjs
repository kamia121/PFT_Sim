import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

/** Runs src/ui/theme-boot.js against a minimal DOM stub and returns the stub. */
function boot({ saved = null, systemDark = false, storageBlocked = false } = {}) {
  const store = new Map(saved ? [['pft-theme', saved]] : []);
  const listeners = {};
  const button = { textContent: '' };
  const root = { dataset: {} };
  const document = {
    documentElement: root,
    getElementById: (id) => (id === 'theme-toggle' ? button : null),
    addEventListener: (t, f) => { listeners[t] = f; },
  };
  const localStorage = {
    getItem: (k) => { if (storageBlocked) throw new Error('blocked'); return store.get(k) ?? null; },
    setItem: (k, v) => { if (storageBlocked) throw new Error('blocked'); store.set(k, v); },
  };
  const matchMedia = () => ({ matches: systemDark, addEventListener: () => {} });
  const window = { matchMedia, addEventListener: (t, f) => { listeners['w:' + t] = f; } };
  vm.runInNewContext(fs.readFileSync(new URL('../src/ui/theme-boot.js', import.meta.url), 'utf8'), { document, window, localStorage, matchMedia });
  const storage = (key, newValue) => listeners['w:storage']({ key, newValue });
  const click = () => listeners.click({ target: { closest: (sel) => (sel === '#theme-toggle' ? button : null) } });
  return { root, button, store, click, storage, listeners };
}

test('the saved choice wins over the system preference; anything else is ignored', () => {
  assert.equal(boot({ saved: 'light', systemDark: true }).root.dataset.theme, 'light');
  assert.equal(boot({ saved: 'dark' }).root.dataset.theme, 'dark');
  assert.equal(boot({ saved: 'sepia', systemDark: true }).root.dataset.theme, undefined);
  assert.equal(boot({ systemDark: true }).button.textContent, 'Light mode');
  assert.equal(boot({ systemDark: false }).button.textContent, 'Dark mode');
});

test('the toggle switches to the opposite of the theme in force, saves it and relabels the button', () => {
  const a = boot({ systemDark: true });
  a.click();
  assert.equal(a.root.dataset.theme, 'light');
  assert.equal(a.store.get('pft-theme'), 'light');
  assert.equal(a.button.textContent, 'Dark mode');
  a.click();
  assert.equal(a.root.dataset.theme, 'dark');
  assert.equal(a.button.textContent, 'Light mode');
});

test('a change in another tab is followed, and storage.clear() (null key) returns to the system preference', () => {
  const a = boot({ saved: 'dark', systemDark: false });
  a.storage('pft-theme', 'light');
  assert.equal(a.root.dataset.theme, 'light');
  assert.equal(a.button.textContent, 'Dark mode');
  a.storage('unrelated', 'x');
  assert.equal(a.root.dataset.theme, 'light');
  a.storage('pft-theme', 'dark');
  assert.equal(a.root.dataset.theme, 'dark');
  a.storage(null, null);
  assert.equal(a.root.dataset.theme, undefined);
  assert.equal(a.button.textContent, 'Dark mode');
  const b = boot({ saved: 'light', systemDark: true });
  b.storage(null, null);
  assert.equal(b.button.textContent, 'Light mode');
  b.storage('pft-theme', null);
  assert.equal(b.root.dataset.theme, undefined);
});

test('blocked storage does not stop the toggle', () => {
  const a = boot({ storageBlocked: true });
  a.click();
  assert.equal(a.root.dataset.theme, 'dark');
});

test('every page loads the theme script as a classic head script and the page modules leave the theme alone', () => {
  for (const page of ['index.html', 'quiz.html', 'report.html']) {
    const html = fs.readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
    assert.match(html, /<script src="\.\/src\/ui\/theme-boot\.js"><\/script>/, `${page} loads the theme script as a classic script`);
    assert.match(html, /id="theme-toggle"/, `${page} toggle`);
  }
  for (const f of ['src/app/main.js', 'src/quiz/app.js', 'src/report-page/main.js']) {
    const js = fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(js, /pft-theme/, `${f} keeps no theme storage of its own`);
  }
});

test('the print rule restates every color token of the light theme', () => {
  const css = fs.readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
  const light = css.slice(css.indexOf(':root {'), css.indexOf('@media (prefers-color-scheme'));
  const print = css.slice(css.indexOf('@media print'), css.indexOf('/* Dark "monitor"'));
  const lightVars = new Map([...light.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  const printVars = new Map([...print.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  for (const [k, v] of lightVars) {
    if (k === '--mcw-green' || k === '--mcw-navy') continue;
    assert.equal(printVars.get(k), v, `print ${k}`);
  }
});

/**
 * Shared startup and teardown of the browser harnesses: the static server (polled until it answers, bounded, killed on every
 * exit path) and the browser (Playwright's own, or an executable named by PFT_CHROMIUM; PFT_BROWSER selects chromium, firefox or
 * webkit). PFT_ARTIFACT_DIR names a directory that keeps PDFs, screenshots and logs for a CI upload.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, firefox, webkit } from 'playwright';

export const ENGINE = process.env.PFT_BROWSER || 'chromium';

/** @returns {Promise<import('node:child_process').ChildProcess>} the server, once it answers on `port` (rejects after `timeoutMs`) */
export async function startServer(port, { timeoutMs = 10000 } = {}) {
  const server = spawn(process.execPath, ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(port) }, stdio: 'inherit' });
  const stop = () => { try { server.kill(); } catch { /* already gone */ } };
  process.once('exit', stop);
  for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => { stop(); process.exit(130); });
  const t0 = Date.now();
  for (;;) {
    try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) return server; } catch { /* not yet */ }
    if (Date.now() - t0 > timeoutMs) { stop(); throw new Error(`the server did not answer on port ${port} within ${timeoutMs} ms`); }
    await new Promise((r) => setTimeout(r, 100));
  }
}

export async function launchBrowser() {
  const type = { chromium, firefox, webkit }[ENGINE];
  if (!type) throw new Error(`PFT_BROWSER must be chromium, firefox or webkit, not ${ENGINE}`);
  const executablePath = ENGINE === 'chromium' ? (process.env.PFT_CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)) : undefined;
  return type.launch({ executablePath });
}

/** A directory for the files a run leaves behind: PFT_ARTIFACT_DIR (created) or a fresh temporary one. */
export function artifactDir(label) {
  const base = process.env.PFT_ARTIFACT_DIR;
  if (base) { const d = path.join(base, label); fs.mkdirSync(d, { recursive: true }); return d; }
  return fs.mkdtempSync(path.join(os.tmpdir(), `pft-${label}-`));
}

/** Loads the GLI datasets in the browser (fetch) or in Node (fs). */
const FILES = { GLI2012: 'gli2012.json', GLIglobal: 'gli_global.json', GLI2021vol: 'gli_volumes.json', GLI2017tlco: 'gli_tlco.json' };

export async function loadDatasets() {
  const out = {};
  if (typeof window === 'undefined') {
    const fs = await import('node:fs/promises');
    for (const [id, file] of Object.entries(FILES)) out[id] = JSON.parse(await fs.readFile(new URL(`./data/${file}`, import.meta.url), 'utf8'));
    return out;
  }
  await Promise.all(Object.entries(FILES).map(async ([id, file]) => {
    const res = await fetch(new URL(`./data/${file}`, import.meta.url));
    if (!res.ok) throw new Error(`could not load ${file}: ${res.status}`);
    out[id] = await res.json();
  }));
  return out;
}

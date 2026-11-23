/**
 * Baut index.json für ein lernstoff-Verzeichnis.
 * Aufruf: npx tsx scripts/build-index.ts <root> [--fix]
 * Exit 1, wenn Fehler gefunden wurden; index.json wird immer geschrieben.
 */
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { buildIndex } from '../src/format/buildIndex';

const args = process.argv.slice(2);
const root = args.find((a) => !a.startsWith('--'));
if (!root) {
  console.error('Aufruf: build-index <lernstoff-ordner> [--fix]');
  process.exit(2);
}

const { index, changedFiles } = await buildIndex(resolve(root), { fix: args.includes('--fix') });
await writeFile(join(resolve(root), 'index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8');

for (const f of changedFiles) console.log(`IDs ergänzt: ${f}`);
for (const s of index.faecher) {
  for (const e of s.fehler) console.error(`FEHLER ${s.pfad}: ${e}`);
  for (const t of [...s.kapitel.flatMap((k) => k.themen), ...s.nichtZugeordnet, ...s.proben]) {
    for (const e of t.fehler) console.error(`FEHLER ${t.pfad}: ${e}`);
  }
}
console.log(`${index.faecher.length} Fächer, ${index.fehlerAnzahl} Fehler, ${index.rueckfragen} Rückfragen`);
process.exit(index.fehlerAnzahl > 0 ? 1 : 0);

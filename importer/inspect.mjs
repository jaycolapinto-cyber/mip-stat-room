import XLSX from 'xlsx';
import { readdirSync } from 'node:fs';
const DIR = '/mnt/user-data/uploads/Downloads';
for (const f of readdirSync(DIR).filter((x) => x.endsWith('.xlsx'))) {
  const wb = XLSX.readFile(`${DIR}/${f}`);
  console.log('\n=== ' + f);
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false, defval: null });
    console.log(`  [${name}] rows=${rows.length} cols=${Math.max(...rows.map(r=>r.length), 0)}`);
    rows.slice(0, 3).forEach((r, i) => console.log('    r' + i, JSON.stringify(r).slice(0, 220)));
  }
}

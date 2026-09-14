import xlsx from 'xlsx';
const wb = xlsx.readFile('/root/.claude/uploads/c0bba36f-3c21-549e-ab0a-ef27e1e9114c/9d1bc916-Matchlog-lMFLQ14a6PQdtFLojKWt.xlsx');
console.log('sheets:', wb.SheetNames);
for (const n of wb.SheetNames) {
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', raw: false });
  console.log(`\n===== ${n} : ${rows.length} rows =====`);
  rows.slice(0, 12).forEach((r, i) => console.log(String(i).padStart(3), JSON.stringify(r)));
  if (rows.length > 12) { console.log('  ...'); rows.slice(-3).forEach((r,i)=>console.log(String(rows.length-3+i).padStart(3), JSON.stringify(r))); }
}

import { format } from 'date-fns';

interface ExportConfig {
  headers: string[];
  rows: (string | number)[][];
  totalsRow?: (string | number | null)[];
  filename: string;
}

// xlsx is large (~400 kB), so it is only downloaded when someone exports.
export async function exportXLSX({ headers, rows, totalsRow, filename }: ExportConfig) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const allRows = [headers, ...rows];
  if (totalsRow) allRows.push(totalsRow.map((v) => v ?? ''));
  const ws = XLSX.utils.aoa_to_sheet(allRows);

  // Header style (SheetJS community edition has limited styling, but we set column widths)
  const colWidths = headers.map((h, i) => {
    let max = h.length;
    rows.forEach((r) => {
      const cellLen = String(r[i] ?? '').length;
      if (cellLen > max) max = cellLen;
    });
    return { wch: Math.min(max + 4, 40) };
  });
  ws['!cols'] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, filename);
}

export function todaySuffix() {
  return format(new Date(), 'dd-MM-yyyy');
}

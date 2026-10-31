// Reads .xlsx / .xls / .csv in the browser. Nothing is uploaded here; only
// the cleaned records are sent to the database when the person confirms.

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS_PER_SHEET = 5000;
export const ACCEPTED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];

export interface SheetData {
  name: string;
  headers: string[];
  /** Data rows only, aligned with headers. */
  rows: unknown[][];
  /** Spreadsheet row number of each data row, for messages ("row 14"). */
  rowNumbers: number[];
}

export class ImportFileError extends Error {}

function isEmpty(cell: unknown) {
  return cell === null || cell === undefined || String(cell).trim() === '';
}

const TOTAL_WORDS = new Set(['total', 'totals', 'grandtotal', 'subtotal', 'sum', 'মোট', 'সর্বমোট']);

function isTotalRow(row: unknown[]) {
  const first = row.find((c) => !isEmpty(c));
  return TOTAL_WORDS.has(String(first ?? '').toLowerCase().replace(/[^\p{L}\p{M}]+/gu, ''));
}

/**
 * Many sheets start with a title, a shop name or a blank line before the
 * real header. The header is the first of the opening rows that is mostly
 * text and about as wide as the table.
 */
function findHeaderRow(rows: unknown[][]) {
  const width = Math.max(0, ...rows.slice(0, 30).map((r) => r.filter((c) => !isEmpty(c)).length));
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cells = rows[i].filter((c) => !isEmpty(c));
    const text = cells.filter((c) => typeof c === 'string' && !/^\s*[\d০-৯.,৳/-]+\s*$/.test(c));
    if (cells.length >= 2 && cells.length >= Math.ceil(width * 0.6) && text.length >= Math.ceil(cells.length * 0.6)) {
      return i;
    }
  }
  return rows.findIndex((r) => r.some((c) => !isEmpty(c)));
}

function toSheet(name: string, grid: unknown[][], firstRow: number): SheetData | null {
  const headerIndex = findHeaderRow(grid);
  if (headerIndex < 0) return null;

  const rawHeaders = grid[headerIndex];
  // Columns with a header or with any data below it.
  const width = Math.max(rawHeaders.length, ...grid.slice(headerIndex + 1).map((r) => r.length));
  const keep: number[] = [];
  for (let c = 0; c < width; c++) {
    const used = !isEmpty(rawHeaders[c]) || grid.slice(headerIndex + 1).some((r) => !isEmpty(r[c]));
    if (used) keep.push(c);
  }
  const headers = keep.map((c, i) => (isEmpty(rawHeaders[c]) ? `Column ${i + 1}` : String(rawHeaders[c]).trim()));

  const rows: unknown[][] = [];
  const rowNumbers: number[] = [];
  grid.slice(headerIndex + 1).forEach((r, i) => {
    const row = keep.map((c) => r[c] ?? '');
    if (row.every(isEmpty) || isTotalRow(row)) return;
    rows.push(row);
    rowNumbers.push(firstRow + headerIndex + i + 2);
  });
  if (!rows.length) return null;
  if (rows.length > MAX_ROWS_PER_SHEET) {
    throw new ImportFileError(
      `The sheet "${name}" has ${rows.length.toLocaleString()} rows. Lumina imports up to ${MAX_ROWS_PER_SHEET.toLocaleString()} per sheet, so please split it into smaller files.`,
    );
  }
  return { name, headers, rows, rowNumbers };
}

// Blob.text()/arrayBuffer() are missing in some older browsers.
function readBlob(file: File, as: 'text'): Promise<string>;
function readBlob(file: File, as: 'buffer'): Promise<ArrayBuffer>;
function readBlob(file: File, as: 'text' | 'buffer'): Promise<string | ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string | ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    if (as === 'text') reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  });
}

export async function readSpreadsheet(file: File): Promise<SheetData[]> {
  const lower = file.name.toLowerCase();
  if (!ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    throw new ImportFileError('Please choose an Excel (.xlsx, .xls) or CSV file.');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new ImportFileError('That file is larger than 5 MB. Please remove unused sheets or split it.');
  }

  // xlsx is large, so it only loads when someone imports.
  const XLSX = await import('xlsx');
  let workbook;
  try {
    workbook = lower.endsWith('.csv')
      // raw keeps CSV cells as typed text, so "05/01/2024" isn't guessed as US format.
      ? XLSX.read(await readBlob(file, 'text'), { type: 'string', raw: true })
      : XLSX.read(await readBlob(file, 'buffer'), { type: 'array', cellDates: false });
  } catch {
    throw new ImportFileError("Lumina couldn't open that file. If it has a password, remove it and try again.");
  }

  const sheets: SheetData[] = [];
  for (const name of workbook.SheetNames) {
    const ws = workbook.Sheets[name];
    if (!ws) continue;
    // Blank rows are kept so row numbers match what people see in Excel.
    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '', blankrows: true });
    const firstRow = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']).s.r : 0;
    const sheet = toSheet(name, grid, firstRow);
    if (sheet) sheets.push(sheet);
  }
  if (!sheets.length) throw new ImportFileError('That file has no rows to import.');
  return sheets;
}

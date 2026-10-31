import { FIELDS, type Entity, type FieldDef, type Mapping } from './fields';
import {
  CellError, mapExpenseType, mapSource, mapStatus, parseAmount, parseCount, parseDate, parseText,
} from './normalize';
import type { SheetData } from './readFile';

export interface CellIssue {
  /** Index into sheet.rows. */
  index: number;
  /** Spreadsheet row number shown to people. */
  row: number;
  column: number;
  field: string;
  label: string;
  message: string;
  value: string;
}

export interface BuiltRecords {
  records: Record<string, unknown>[];
  /** Rows that can't be imported until fixed or skipped. */
  issues: CellIssue[];
  /** Rows that import, with something worth knowing (unknown channel). */
  notes: CellIssue[];
  invalidRows: number;
}

/** key `${index}:${column}` → replacement text typed in the preview. */
export type Overrides = Record<string, string>;

function parseField(field: FieldDef, value: unknown) {
  switch (field.kind) {
    case 'amount': return parseAmount(value);
    case 'count': return parseCount(value);
    case 'date': return parseDate(value);
    case 'source': return mapSource(value);
    case 'status': return mapStatus(value);
    case 'expense_type': return mapExpenseType(value);
    default: return parseText(value, field.key === 'notes' ? 500 : 200);
  }
}

export function buildRecords(entity: Entity, sheet: SheetData, mapping: Mapping, overrides: Overrides = {}): BuiltRecords {
  const fields = FIELDS[entity];
  const records: Record<string, unknown>[] = [];
  const issues: CellIssue[] = [];
  const notes: CellIssue[] = [];
  const invalid = new Set<number>();

  sheet.rows.forEach((row, index) => {
    const out: Record<string, unknown> = {};
    const problem = (field: FieldDef, column: number, message: string, value: unknown) => {
      issues.push({ index, row: sheet.rowNumbers[index], column, field: field.key, label: field.label, message, value: String(value ?? '') });
      invalid.add(index);
    };

    mapping.forEach((key, column) => {
      if (!key) return;
      const field = fields.find((f) => f.key === key);
      if (!field) return;
      const override = overrides[`${index}:${column}`];
      const value = override !== undefined ? override : row[column];
      try {
        out[key] = parseField(field, value);
        if (field.kind === 'source' && out[key] === null && parseText(value)) {
          notes.push({ index, row: sheet.rowNumbers[index], column, field: key, label: field.label,
            message: `"${parseText(value)}" isn't a channel Lumina tracks, so it's saved as not specified`, value: String(value) });
        }
      } catch (e) {
        problem(field, column, e instanceof CellError ? e.message : 'could not be read', value);
      }
    });

    const col = (key: string) => mapping.indexOf(key);
    for (const f of fields) {
      if (f.required && (out[f.key] === null || out[f.key] === undefined) && !issues.some((i) => i.index === index && i.field === f.key)) {
        problem(f, col(f.key), 'is empty', '');
      }
    }

    if (entity === 'orders') {
      const qty = (out.quantity as number | null) ?? 1;
      if (qty === 0) problem(fields.find((f) => f.key === 'quantity')!, col('quantity'), 'is 0', '0');
      if (out.selling_price == null && out.total != null && qty > 0) {
        out.selling_price = Math.round(((out.total as number) / qty) * 100) / 100;
      }
      if (out.selling_price == null && !invalid.has(index)) {
        const priceCol = col('selling_price') >= 0 ? col('selling_price') : col('total');
        problem(fields.find((f) => f.key === (col('selling_price') >= 0 ? 'selling_price' : 'total'))!, priceCol,
          'needs a price or a total', '');
      }
      if (!out.product_name && !out.sku && !invalid.has(index)) {
        problem(fields.find((f) => f.key === 'product_name')!, col('product_name'), 'is empty', '');
      }
      out.quantity = qty;
      delete out.total;
    }
    if (entity === 'expenses' && mapping.indexOf('type') < 0) {
      // No category column: guess from the notes ("Facebook boost" → Ad Spend).
      out.type = mapExpenseType(out.notes);
    }

    if (!invalid.has(index)) {
      for (const k of Object.keys(out)) if (out[k] === null) delete out[k];
      records.push(out);
    }
  });

  return { records, issues, notes, invalidRows: invalid.size };
}

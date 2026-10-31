import { describe, it, expect, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { mapExpenseType, mapSource, mapStatus, parseAmount, parseCount, parseDate, parseNumber } from '@/lib/import/normalize';
import { autoMap, guessEntity, missingRequired } from '@/lib/import/fields';
import { buildRecords } from '@/lib/import/build';
import { readSpreadsheet } from '@/lib/import/readFile';

describe('number cleaning', () => {
  it.each([
    ['৳1,200', 1200], ['1200 tk', 1200], ['1,200/-', 1200], ['১২০০', 1200], ['Tk. 950.50', 950.5],
    ['(500)', -500], ['BDT 3,000', 3000], [1450, 1450], ['১,২৫০ টাকা', 1250],
  ])('%s → %s', (input, out) => expect(parseNumber(input)).toBe(out));

  it('treats blanks as empty and rejects words', () => {
    expect(parseNumber('  ')).toBeNull();
    expect(() => parseNumber('free')).toThrow(/not a number/);
  });

  it('keeps counts whole and prices non-negative', () => {
    expect(parseCount('3')).toBe(3);
    expect(() => parseCount('2.5')).toThrow(/whole number/);
    expect(() => parseAmount('-20')).toThrow(/negative/);
  });
});

describe('date cleaning', () => {
  it.each([
    ['2024-01-05', '2024-01-05'],
    ['05/01/2024', '2024-01-05'], // day first, as in Bangladesh
    ['5-1-24', '2024-01-05'],
    ['05.01.2024', '2024-01-05'],
    ['01/25/2024', '2024-01-25'], // only an impossible month flips it
    ['5 Jan 2024', '2024-01-05'],
    ['Jan 5, 2024', '2024-01-05'],
    ['৫ জানুয়ারি ২০২৪', '2024-01-05'],
    ['০৫/০১/২০২৪', '2024-01-05'],
    [45296, '2024-01-05'], // Excel serial
    ['2024-01-05 14:30', '2024-01-05'],
  ])('%s → %s', (input, out) => expect(parseDate(input)).toBe(out));

  it('rejects dates that do not exist', () => {
    expect(() => parseDate('31/02/2024')).toThrow(/real date/);
    expect(() => parseDate('next week')).toThrow(/not a date/);
  });
});

describe('value mapping', () => {
  it('maps channels, leaving unknown ones unset', () => {
    expect(mapSource('FB Page')).toBe('Facebook');
    expect(mapSource('insta')).toBe('Instagram');
    expect(mapSource('Whatsapp')).toBe('WhatsApp');
    expect(mapSource('Daraz')).toBeNull();
  });

  it('maps statuses, with unpaid staying pending', () => {
    expect(mapStatus('Delivered ✓')).toBe('Delivered');
    expect(mapStatus('Returned')).toBe('Cancelled');
    expect(mapStatus('Unpaid')).toBe('Pending');
    expect(mapStatus('Paid')).toBe('Delivered');
    expect(mapStatus('')).toBe('Delivered');
  });

  it('maps expense categories on whole words', () => {
    expect(mapExpenseType('Facebook boost')).toBe('Ad Spend');
    expect(mapExpenseType('Pathao courier bill')).toBe('Shipping');
    expect(mapExpenseType('Bread for staff')).toBe('Miscellaneous');
  });
});

describe('column matching', () => {
  it('matches common, Banglish and Bangla headers', () => {
    const m = autoMap('orders', ['Date', 'Customer Name', 'Item', 'Qty', 'Total Amount', 'Order ID', 'From']);
    expect(m).toEqual(['date', 'customer_name', 'product_name', 'quantity', 'total', 'external_ref', 'source']);
    expect(autoMap('inventory', ['পণ্যের নাম', 'কেনা দাম', 'দাম', 'স্টক'])).toEqual(['product_name', 'cost_price', 'selling_price', 'stock_quantity']);
  });

  it('never uses one field twice', () => {
    const m = autoMap('inventory', ['Product', 'Product Name']);
    expect(m.filter((f) => f === 'product_name')).toHaveLength(1);
  });

  it('guesses the sheet type from its name or columns', () => {
    expect(guessEntity('Sales 2024', ['A', 'B'])).toBe('orders');
    expect(guessEntity('Sheet1', ['Product', 'Cost', 'Price', 'Stock'])).toBe('inventory');
    expect(guessEntity('Sheet1', ['Date', 'Customer', 'Product', 'Qty', 'Price'])).toBe('orders');
  });

  it('reports required fields that are not matched', () => {
    expect(missingRequired('expenses', ['date', null]).map((f) => f.key)).toEqual(['amount']);
  });
});

describe('Banglish shop files', () => {
  it('reads a "Khoroch" sheet as expenses', () => {
    expect(guessEntity('Khoroch', ['Date', 'Khat', 'Taka', 'Details'])).toBe('expenses');
    expect(autoMap('expenses', ['Date', 'Khat', 'Taka', 'Details'])).toEqual(['date', 'type', 'amount', 'notes']);
  });

  it('matches "Kotha theke" and "Payment" on a "Bikri" sheet', () => {
    expect(guessEntity('Bikri', ['Tarikh', 'Item', 'Total taka'])).toBe('orders');
    expect(autoMap('orders', ['Tarikh', 'Item', 'Total taka', 'Kotha theke', 'Payment']))
      .toEqual(['date', 'product_name', 'total', 'source', 'status']);
  });

  it('leaves out a sheet that only holds notes when the AI is unavailable', async () => {
    vi.resetModules();
    vi.doMock('@/integrations/supabase/client', () => ({
      supabase: { functions: { invoke: async () => ({ data: null, error: new Error('off') }) } },
    }));
    const { planSheets } = await import('@/lib/import/matcher');
    const sheet = (name: string, headers: string[]) => ({ name, headers, rows: [headers.map(() => 'x')], rowNumbers: [2] });
    const plans = await planSheets([sheet('Notes', ['Notes']), sheet('Khoroch', ['Date', 'Khat', 'Taka'])]);
    expect(plans.map((p) => p.target)).toEqual(['skip', 'expenses']);
    vi.doUnmock('@/integrations/supabase/client');
  });
});

describe('building records', () => {
  const sheet = {
    name: 'Orders',
    headers: ['Date', 'Customer', 'Product', 'Qty', 'Total', 'Channel'],
    rows: [
      ['05/01/2024', 'Rahim', 'Panjabi', 2, '৳2,400', 'FB'],
      ['bad date', 'Karim', 'Saree', 1, 2000, 'Daraz'],
      ['06/01/2024', 'Walk-in', 'Saree', 1, '', 'Shop'],
    ],
    rowNumbers: [2, 3, 4],
  };
  const mapping = ['date', 'customer_name', 'product_name', 'quantity', 'total', 'source'];

  it('works out unit price from the total and flags problem rows', () => {
    const built = buildRecords('orders', sheet, mapping);
    expect(built.records).toEqual([
      { date: '2024-01-05', customer_name: 'Rahim', product_name: 'Panjabi', quantity: 2, selling_price: 1200, source: 'Facebook' },
    ]);
    expect(built.invalidRows).toBe(2);
    expect(built.issues.map((i) => [i.row, i.field])).toEqual([[3, 'date'], [4, 'total']]);
    expect(built.notes.some((n) => n.row === 3 && /Daraz/.test(n.message))).toBe(true);
  });

  it('uses fixes typed in the preview', () => {
    const built = buildRecords('orders', sheet, mapping, { '1:0': '07/01/2024', '2:4': '1500' });
    expect(built.invalidRows).toBe(0);
    expect(built.records).toHaveLength(3);
    expect(built.records[2]).toMatchObject({ date: '2024-01-06', selling_price: 1500 });
  });

  it('guesses expense categories from notes when there is no category column', () => {
    const built = buildRecords('expenses',
      { name: 'Costs', headers: ['Date', 'Amount', 'Details'], rows: [['01/02/2024', 3000, 'Facebook boost']], rowNumbers: [2] },
      ['date', 'amount', 'notes']);
    expect(built.records[0]).toMatchObject({ type: 'Ad Spend', amount: 3000, date: '2024-02-01' });
  });
});

describe('reading files', () => {
  function xlsxFile(sheets: Record<string, unknown[][]>, name = 'shop.xlsx') {
    const wb = XLSX.utils.book_new();
    for (const [sheetName, rows] of Object.entries(sheets)) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName);
    }
    const data = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    return new File([data], name);
  }

  it('skips title rows, blank rows and totals', async () => {
    const file = xlsxFile({
      Sales: [
        ['Rahim Fashion — Sales 2024'],
        [],
        ['Date', 'Customer', 'Product', 'Qty', 'Price'],
        ['05/01/2024', 'Rahim', 'Panjabi', 1, 1200],
        [],
        ['06/01/2024', 'Karim', 'Saree', 2, 2000],
        ['Total', '', '', 3, 3200],
      ],
      Empty: [],
    });
    const [sheet, ...rest] = await readSpreadsheet(file);
    expect(rest).toHaveLength(0);
    expect(sheet.headers).toEqual(['Date', 'Customer', 'Product', 'Qty', 'Price']);
    expect(sheet.rows).toHaveLength(2);
    expect(sheet.rowNumbers).toEqual([4, 6]);
  });

  it('keeps CSV dates as written', async () => {
    const file = new File(['Date,Amount,Notes\n05/01/2024,3000,Boost\n'], 'costs.csv', { type: 'text/csv' });
    const [sheet] = await readSpreadsheet(file);
    expect(sheet.rows[0][0]).toBe('05/01/2024');
  });

  it('refuses other file types', async () => {
    await expect(readSpreadsheet(new File(['x'], 'notes.pdf'))).rejects.toThrow(/Excel/);
  });
});

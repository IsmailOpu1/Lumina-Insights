// What each kind of record can hold, and the built-in column matcher used
// when the AI matcher is unavailable (or to fill in what it left out).

export type Entity = 'inventory' | 'orders' | 'expenses';

export type FieldKind = 'text' | 'amount' | 'count' | 'date' | 'source' | 'status' | 'expense_type';

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  /** Header words that mean this field, compared after normalising. */
  synonyms: string[];
}

export const ENTITY_LABELS: Record<Entity, string> = {
  inventory: 'Products',
  orders: 'Orders',
  expenses: 'Expenses',
};

export const FIELDS: Record<Entity, FieldDef[]> = {
  inventory: [
    { key: 'product_name', label: 'Product name', kind: 'text', required: true,
      synonyms: ['product', 'productname', 'item', 'itemname', 'name', 'title', 'description', 'article', 'model', 'পণ্য', 'পণ্যেরনাম', 'মাল', 'নাম', 'আইটেম'] },
    { key: 'sku', label: 'SKU / code', kind: 'text',
      synonyms: ['sku', 'code', 'productcode', 'itemcode', 'barcode', 'id', 'productid', 'কোড'] },
    { key: 'cost_price', label: 'Cost price', kind: 'amount',
      synonyms: ['cost', 'costprice', 'buyprice', 'buyingprice', 'purchaseprice', 'purchase', 'unitcost', 'cp', 'kenadam', 'কেনাদাম', 'ক্রয়মূল্য', 'খরচ'] },
    { key: 'selling_price', label: 'Selling price', kind: 'amount',
      synonyms: ['price', 'sellingprice', 'saleprice', 'salesprice', 'sellprice', 'mrp', 'rate', 'sp', 'retailprice', 'bechadam', 'দাম', 'বিক্রয়মূল্য', 'মূল্য'] },
    { key: 'stock_quantity', label: 'Stock', kind: 'count',
      synonyms: ['stock', 'qty', 'quantity', 'instock', 'available', 'onhand', 'units', 'pcs', 'pieces', 'balance', 'স্টক', 'পরিমাণ'] },
    { key: 'low_stock_threshold', label: 'Low-stock alert at', kind: 'count',
      synonyms: ['reorder', 'reorderlevel', 'minstock', 'minimum', 'alert', 'threshold', 'lowstock', 'safetystock'] },
    { key: 'supplier', label: 'Supplier', kind: 'text',
      synonyms: ['supplier', 'vendor', 'seller', 'source', 'manufacturer', 'brand', 'সাপ্লায়ার'] },
  ],
  orders: [
    { key: 'date', label: 'Order date', kind: 'date', required: true,
      synonyms: ['date', 'orderdate', 'saledate', 'day', 'createdat', 'created', 'time', 'tarikh', 'তারিখ'] },
    { key: 'customer_name', label: 'Customer', kind: 'text',
      synonyms: ['customer', 'customername', 'client', 'buyer', 'name', 'clientname', 'কাস্টমার', 'ক্রেতা', 'গ্রাহক'] },
    { key: 'product_name', label: 'Product', kind: 'text',
      synonyms: ['product', 'productname', 'item', 'itemname', 'items', 'description', 'পণ্য', 'মাল', 'আইটেম'] },
    { key: 'sku', label: 'SKU / code', kind: 'text',
      synonyms: ['sku', 'code', 'productcode', 'itemcode', 'barcode'] },
    { key: 'quantity', label: 'Quantity', kind: 'count',
      synonyms: ['qty', 'quantity', 'pcs', 'pieces', 'units', 'unit', 'count', 'পরিমাণ', 'সংখ্যা'] },
    { key: 'selling_price', label: 'Unit price', kind: 'amount',
      synonyms: ['price', 'unitprice', 'sellingprice', 'saleprice', 'rate', 'priceperunit', 'দাম', 'মূল্য'] },
    { key: 'total', label: 'Order total', kind: 'amount',
      synonyms: ['total', 'amount', 'totalamount', 'totalprice', 'subtotal', 'grandtotal', 'bill', 'value', 'revenue', 'sales', 'মোট', 'টাকা'] },
    { key: 'unit_cost', label: 'Unit cost', kind: 'amount',
      synonyms: ['cost', 'unitcost', 'costprice', 'buyprice', 'purchaseprice', 'cp', 'কেনাদাম'] },
    { key: 'shipping_cost', label: 'Delivery cost', kind: 'amount',
      synonyms: ['shipping', 'shippingcost', 'delivery', 'deliverycharge', 'deliverycost', 'courier', 'couriercharge', 'ডেলিভারি'] },
    { key: 'ad_cost', label: 'Ad cost', kind: 'amount',
      synonyms: ['adcost', 'ads', 'adspend', 'boost', 'marketing', 'marketingcost'] },
    { key: 'source', label: 'Channel', kind: 'source',
      synonyms: ['source', 'channel', 'platform', 'via', 'from', 'medium', 'salechannel', 'orderfrom'] },
    { key: 'status', label: 'Status', kind: 'status',
      synonyms: ['status', 'orderstatus', 'state', 'deliverystatus', 'অবস্থা'] },
    { key: 'external_ref', label: 'Your order no.', kind: 'text',
      synonyms: ['orderid', 'orderno', 'ordernumber', 'invoice', 'invoiceno', 'invoicenumber', 'ref', 'reference', 'billno', 'memo', 'memono', 'অর্ডারনং', 'ইনভয়েস'] },
  ],
  expenses: [
    { key: 'date', label: 'Date', kind: 'date', required: true,
      synonyms: ['date', 'day', 'paidon', 'expensedate', 'তারিখ'] },
    { key: 'amount', label: 'Amount', kind: 'amount', required: true,
      synonyms: ['amount', 'cost', 'total', 'expense', 'spent', 'paid', 'value', 'টাকা', 'খরচ', 'পরিমাণ'] },
    { key: 'type', label: 'Category', kind: 'expense_type',
      synonyms: ['type', 'category', 'head', 'expensetype', 'purpose', 'for', 'খাত'] },
    { key: 'platform', label: 'Platform', kind: 'text',
      synonyms: ['platform', 'channel', 'where', 'vendor', 'paidto'] },
    { key: 'notes', label: 'Notes', kind: 'text',
      synonyms: ['notes', 'note', 'details', 'description', 'remarks', 'comment', 'particulars', 'বিবরণ', 'মন্তব্য'] },
  ],
};

export function normaliseHeader(header: string) {
  return String(header ?? '').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, '');
}

/** column index → field key (or null to ignore the column) */
export type Mapping = (string | null)[];

function score(header: string, field: FieldDef) {
  const h = normaliseHeader(header);
  if (!h) return 0;
  if (field.synonyms.includes(h)) return 3;
  // "Product Name (English)" or "Total Amount Tk" still match.
  if (field.synonyms.some((s) => s.length >= 3 && (h.startsWith(s) || h.endsWith(s)))) return 2;
  if (field.synonyms.some((s) => s.length >= 4 && h.includes(s))) return 1;
  return 0;
}

/** Best guess for each column, never using one field twice. */
export function autoMap(entity: Entity, headers: string[]): Mapping {
  const candidates: { col: number; field: string; s: number }[] = [];
  headers.forEach((h, col) =>
    FIELDS[entity].forEach((f) => {
      const s = score(h, f);
      if (s > 0) candidates.push({ col, field: f.key, s });
    }),
  );
  candidates.sort((a, b) => b.s - a.s || a.col - b.col);
  const mapping: Mapping = headers.map(() => null);
  const used = new Set<string>();
  for (const c of candidates) {
    if (mapping[c.col] !== null || used.has(c.field)) continue;
    mapping[c.col] = c.field;
    used.add(c.field);
  }
  return mapping;
}

const SHEET_HINTS: [RegExp, Entity][] = [
  [/(order|sale|sell|invoice|বিক্রি|বিক্রয়|অর্ডার)/i, 'orders'],
  [/(expense|cost|spend|খরচ|ব্যয়)/i, 'expenses'],
  [/(product|inventory|stock|item|catalog|মাল|পণ্য|স্টক)/i, 'inventory'],
];

/** Which kind of records a sheet most likely holds. */
export function guessEntity(sheetName: string, headers: string[]): Entity {
  const byName = SHEET_HINTS.find(([re]) => re.test(sheetName))?.[1];
  if (byName) return byName;
  const fit = (e: Entity) => {
    const m = autoMap(e, headers);
    const required = FIELDS[e].filter((f) => f.required).every((f) => m.includes(f.key));
    return m.filter(Boolean).length + (required ? 2 : 0);
  };
  const scores = (['orders', 'inventory', 'expenses'] as Entity[]).map((e) => [e, fit(e)] as const);
  // An order sheet has a date; a product list usually doesn't.
  return scores.sort((a, b) => b[1] - a[1])[0][0];
}

export function missingRequired(entity: Entity, mapping: Mapping) {
  return FIELDS[entity].filter((f) => f.required && !mapping.includes(f.key));
}

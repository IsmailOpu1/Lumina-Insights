// Turns the messy values people keep in spreadsheets into what Lumina
// stores. Every parser returns null for an empty cell and throws a short,
// human message when a value can't be understood.

const BANGLA_DIGITS = '০১২৩৪৫৬৭৮৯';

/** "১২০০" → "1200". Leaves every other character alone. */
export function toLatinDigits(value: string) {
  return value.replace(/[০-৯]/g, (d) => String(BANGLA_DIGITS.indexOf(d)));
}

function isBlank(value: unknown) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

export class CellError extends Error {}

/** "৳1,200", "1200 tk", "1,200/-", "(500)", "১২০০" → 1200 (or -500). */
export function parseNumber(value: unknown): number | null {
  if (isBlank(value)) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new CellError('is not a number');
    return value;
  }
  let s = toLatinDigits(String(value)).trim().toLowerCase();
  const negative = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s
    .replace(/\/-$/, '')
    .replace(/৳|tk\.?|taka|bdt|rs\.?|টাকা/g, '')
    .replace(/[,\s()]/g, '')
    .replace(/^-/, '');
  if (s === '' || !/^\d*\.?\d+$/.test(s)) throw new CellError(`"${String(value).trim()}" is not a number`);
  const n = Number(s);
  return negative ? -n : n;
}

/** Like parseNumber but must be a whole number of at least zero. */
export function parseCount(value: unknown): number | null {
  const n = parseNumber(value);
  if (n === null) return null;
  if (n < 0) throw new CellError('cannot be negative');
  if (!Number.isInteger(n)) {
    if (Math.abs(n - Math.round(n)) < 1e-9) return Math.round(n);
    throw new CellError(`${n} is not a whole number`);
  }
  return n;
}

/** Like parseNumber but must not be negative (prices, costs, amounts). */
export function parseAmount(value: unknown): number | null {
  const n = parseNumber(value);
  if (n !== null && n < 0) throw new CellError('cannot be negative');
  return n === null ? null : Math.round(n * 100) / 100;
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  জানুয়ারি: 1, জানুয়ারী: 1, ফেব্রুয়ারি: 2, ফেব্রুয়ারী: 2, মার্চ: 3, এপ্রিল: 4, মে: 5, জুন: 6,
  জুলাই: 7, আগস্ট: 8, সেপ্টেম্বর: 9, অক্টোবর: 10, নভেম্বর: 11, ডিসেম্বর: 12,
};

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function toIso(y: number, m: number, d: number): string {
  if (y < 100) y += 2000;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    throw new CellError('is not a real date');
  }
  if (y < 2000 || y > 2100) throw new CellError(`year ${y} looks wrong`);
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Spreadsheet dates in every common shape, returned as YYYY-MM-DD.
 * Bangladesh writes day first, so "05/01/2024" is 5 January.
 */
export function parseDate(value: unknown): string | null {
  if (isBlank(value)) return null;

  // Excel stores dates as days since 1899-12-30.
  if (typeof value === 'number') {
    if (value < 20000 || value > 80000) throw new CellError(`${value} is not a date`);
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
    return toIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  if (value instanceof Date) {
    return toIso(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  const raw = String(value).trim();
  const s = toLatinDigits(raw).toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  let m: RegExpMatchArray | null;

  // 2024-01-05, 2024/1/5, 2024.01.05 (optionally followed by a time)
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ t].*)?$/))) return toIso(+m[1], +m[2], +m[3]);
  // 05/01/2024, 5-1-24, 05.01.2024 → day first
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?: .*)?$/))) {
    let day = +m[1];
    let month = +m[2];
    // Only an impossible month means it was written month first (01/25/2024).
    if (month > 12 && day <= 12) [day, month] = [month, day];
    return toIso(+m[3], month, day);
  }
  // 5 Jan 2024, 5-jan-24, ৫ জানুয়ারি ২০২৪
  if ((m = s.match(/^(\d{1,2})[ -]?([\p{L}\p{M}]+)\.?[ -]?(\d{2}|\d{4})$/u)) && MONTHS[m[2]]) {
    return toIso(+m[3], MONTHS[m[2]], +m[1]);
  }
  // Jan 5 2024, January 5, 2024
  if ((m = s.match(/^([\p{L}\p{M}]+)\.? (\d{1,2})(?:st|nd|rd|th)? (\d{2}|\d{4})$/u)) && MONTHS[m[1]]) {
    return toIso(+m[3], MONTHS[m[1]], +m[2]);
  }
  throw new CellError(`"${raw}" is not a date Lumina understands`);
}

export function parseText(value: unknown, max = 200): string | null {
  if (isBlank(value)) return null;
  const s = String(value).replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
}

function key(value: unknown) {
  return String(value ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

export const ORDER_SOURCES = ['Facebook', 'Instagram', 'WhatsApp', 'Website', 'TikTok'] as const;
export const ORDER_STATUSES = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'] as const;
export const EXPENSE_TYPES = ['Ad Spend', 'Shipping', 'Miscellaneous'] as const;

const SOURCE_WORDS: [RegExp, (typeof ORDER_SOURCES)[number]][] = [
  [/^(fb|facebook|fbpage|facebookpage|messenger|fbmessenger|ফেসবুক)/, 'Facebook'],
  [/^(ig|insta|instagram|ইনস্টাগ্রাম)/, 'Instagram'],
  [/^(wa|whatsapp|whatsap|whatsup|হোয়াটসঅ্যাপ)/, 'WhatsApp'],
  [/^(web|website|site|online|shopify|woocommerce|wordpress|ওয়েবসাইট)/, 'Website'],
  [/^(tiktok|tik|টিকটক)/, 'TikTok'],
];

/** Sales channel, or null when it isn't one Lumina tracks (shop, Daraz...). */
export function mapSource(value: unknown): (typeof ORDER_SOURCES)[number] | null {
  const k = key(value);
  if (!k) return null;
  return SOURCE_WORDS.find(([re]) => re.test(k))?.[1] ?? null;
}

const STATUS_WORDS: [RegExp, (typeof ORDER_STATUSES)[number]][] = [
  [/(cancel|return|refund|reject|failed|বাতিল|ফেরত)/, 'Cancelled'],
  // Before "paid" below, which these contain.
  [/(unpaid|notpaid|due|বাকি)/, 'Pending'],
  [/(deliver|complete|done|paid|received|success|closed|ডেলিভারি|সম্পন্ন|পরিশোধ)/, 'Delivered'],
  [/(ship|courier|dispatch|transit|sent|onway|পাঠানো)/, 'Shipped'],
  [/(process|packing|packed|confirm|preparing|প্রসেস)/, 'Processing'],
  [/(pending|new|hold|waiting|unpaid|অপেক্ষ)/, 'Pending'],
];

/** Order status; history without a status is treated as delivered. */
export function mapStatus(value: unknown): (typeof ORDER_STATUSES)[number] {
  const k = key(value);
  if (!k) return 'Delivered';
  return STATUS_WORDS.find(([re]) => re.test(k))?.[1] ?? 'Delivered';
}

const EXPENSE_WORDS: [string[], (typeof EXPENSE_TYPES)[number]][] = [
  [['ad', 'ads', 'advert', 'advertising', 'advertisement', 'boost', 'boosting', 'marketing', 'promotion', 'promo', 'campaign', 'বিজ্ঞাপন'], 'Ad Spend'],
  [['shipping', 'delivery', 'courier', 'transport', 'parcel', 'pathao', 'steadfast', 'redx', 'paperfly', 'ডেলিভারি', 'কুরিয়ার'], 'Shipping'],
];

/** Expense category, matched on whole words so "bread" isn't an ad. */
export function mapExpenseType(value: unknown): (typeof EXPENSE_TYPES)[number] {
  const words = String(value ?? '').toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);
  return EXPENSE_WORDS.find(([list]) => words.some((w) => list.includes(w)))?.[1] ?? 'Miscellaneous';
}

import { corsHeaders, getCaller, json } from "../_shared/business.ts";
import { generate } from "../_shared/gemini.ts";

// Suggests which Lumina field each spreadsheet column holds. Only column
// names and a few sample rows are sent, never the whole file. It doesn't use
// the plan's AI quota: the app falls back to its own matcher if this fails,
// and the input is too small to be useful for anything else.

const FIELDS: Record<string, Record<string, string>> = {
  inventory: {
    product_name: "product or item name",
    sku: "product code, SKU or barcode",
    cost_price: "price the shop paid per unit",
    selling_price: "price the shop sells one unit for",
    stock_quantity: "units in stock now",
    low_stock_threshold: "reorder level / minimum stock",
    supplier: "supplier or vendor",
  },
  orders: {
    date: "order or sale date",
    customer_name: "customer name",
    product_name: "product sold",
    sku: "product code",
    quantity: "units sold",
    selling_price: "price per unit",
    total: "total amount of the order line",
    unit_cost: "cost per unit to the shop",
    shipping_cost: "delivery or courier charge paid by the shop",
    ad_cost: "ad cost for the order",
    source: "sales channel (Facebook, Instagram, WhatsApp, website...)",
    status: "order status (delivered, pending, cancelled...)",
    external_ref: "the shop's own order or invoice number",
  },
  expenses: {
    date: "date paid",
    amount: "amount spent",
    type: "category (ads, delivery, other)",
    platform: "where it was spent",
    notes: "description",
  },
};

const MAX_SHEETS = 6;
const MAX_COLUMNS = 60;
const MAX_SAMPLE_ROWS = 5;

const clip = (v: unknown) => String(v ?? "").slice(0, 60);

const SCHEMA = {
  type: "OBJECT",
  properties: {
    sheets: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          entity: { type: "STRING", enum: ["inventory", "orders", "expenses", "skip"] },
          columns: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: { index: { type: "INTEGER" }, field: { type: "STRING" } },
              required: ["index", "field"],
            },
          },
        },
        required: ["entity", "columns"],
      },
    },
  },
  required: ["sheets"],
};

const SYSTEM = `You map spreadsheet columns from small Bangladeshi businesses to Lumina's fields.
Headers may be English, Banglish or Bangla, abbreviated or misspelled. Use the sample values to decide (a column of dates is a date, "৳1,200" is money, "FB"/"Insta" is a channel).

For each sheet, in the same order as given:
- entity: "inventory" for a product or stock list, "orders" for sales or orders, "expenses" for costs paid, "skip" if it is none of these (notes, summaries, charts).
- columns: one entry per column you are confident about, with its zero-based index and a field from that entity's list. Leave out columns that match nothing. Never use a field twice in one sheet.

Fields:
${Object.entries(FIELDS).map(([e, f]) => `${e}: ${Object.entries(f).map(([k, d]) => `${k} (${d})`).join("; ")}`).join("\n")}

Return JSON only.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const caller = await getCaller(req);
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) return json({ error: "AI matching is not configured" }, 503);

    const body = await req.json();
    if (!Array.isArray(body?.sheets) || !body.sheets.length) return json({ error: "sheets are required" }, 400);

    const sheets = body.sheets.slice(0, MAX_SHEETS).map((s: { name?: unknown; headers?: unknown; sample?: unknown }) => {
      const headers = (Array.isArray(s.headers) ? s.headers : []).slice(0, MAX_COLUMNS).map(clip);
      const sample = (Array.isArray(s.sample) ? s.sample : []).slice(0, MAX_SAMPLE_ROWS)
        .map((r: unknown) => (Array.isArray(r) ? r.slice(0, MAX_COLUMNS).map(clip) : []));
      return { name: clip(s.name), headers, sample };
    });

    const prompt = sheets.map((s: { name: string; headers: string[]; sample: string[][] }, i: number) =>
      `SHEET ${i + 1}: "${s.name}"\n` +
      s.headers.map((h, c) => `  [${c}] "${h}" e.g. ${s.sample.map((r) => JSON.stringify(r[c] ?? "")).join(", ")}`).join("\n")
    ).join("\n\n");

    const result = await generate({
      apiKey: GEMINI_API_KEY,
      system: SYSTEM,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      temperature: 0,
      maxOutputTokens: 2048,
      responseSchema: SCHEMA,
    });
    if (!result.ok) return json({ error: "AI matching is unavailable right now" }, 503);

    let parsed: { sheets?: { entity?: string; columns?: { index?: number; field?: string }[] }[] };
    try {
      parsed = JSON.parse(result.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, ""));
    } catch {
      return json({ error: "AI matching returned an unreadable answer" }, 502);
    }

    // Only fields that exist, on columns that exist, each used once.
    const out = sheets.map((s: { headers: string[] }, i: number) => {
      const answer = parsed.sheets?.[i];
      const entity = answer?.entity && (answer.entity === "skip" || answer.entity in FIELDS) ? answer.entity : null;
      const mapping: (string | null)[] = s.headers.map(() => null);
      if (entity && entity !== "skip") {
        const used = new Set<string>();
        for (const c of answer?.columns ?? []) {
          const idx = Number(c.index);
          const field = String(c.field ?? "");
          if (!Number.isInteger(idx) || idx < 0 || idx >= s.headers.length) continue;
          if (!(field in FIELDS[entity]) || used.has(field) || mapping[idx]) continue;
          mapping[idx] = field;
          used.add(field);
        }
      }
      return { entity, mapping };
    });

    return json({ sheets: out });
  } catch (e) {
    console.error("map-import-columns error:", e);
    return json({ error: "AI matching failed" }, 500);
  }
});

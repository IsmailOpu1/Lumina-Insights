import { cleanText, consumeQuota, corsHeaders, getCaller, json, refundQuota, todayInDhaka } from "../_shared/business.ts";
import { generate } from "../_shared/gemini.ts";

// Reads an order out of a pasted chat (Messenger, WhatsApp, comments) or a
// screenshot of one, and matches it to the shop's own products. Nothing is
// saved here: the app fills the order form with the result and the seller
// checks it before saving.

const MAX_TEXT_CHARS = 6000;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
// 5 MB of image once decoded, matching the limit on the page.
const MAX_IMAGE_BASE64_CHARS = 7_000_000;
const MAX_PRODUCTS = 400;
const MAX_ITEMS = 10;
const SOURCES = ["Facebook", "Instagram", "WhatsApp", "Website", "TikTok"];

const SCHEMA = {
  type: "OBJECT",
  properties: {
    found: { type: "BOOLEAN", description: "False when the input holds no order at all." },
    customer_name: { type: "STRING" },
    customer_phone: { type: "STRING" },
    customer_address: { type: "STRING" },
    source: { type: "STRING", enum: [...SOURCES, ""] },
    delivery_charge: { type: "NUMBER", description: "Delivery charge stated in the chat, 0 if none." },
    date: { type: "STRING", description: "YYYY-MM-DD, or empty for today." },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          product_id: { type: "STRING", description: "id from the PRODUCTS list, or empty if none matches." },
          product_text: { type: "STRING", description: "The product as the customer wrote it." },
          quantity: { type: "INTEGER" },
          unit_price: { type: "NUMBER", description: "Price per unit agreed in the chat, 0 if not stated." },
        },
        required: ["product_id", "product_text", "quantity", "unit_price"],
      },
    },
  },
  required: ["found", "customer_name", "customer_phone", "customer_address", "source", "delivery_charge", "date", "items"],
};

const SYSTEM = `You read customer orders for small online shops in Bangladesh. The input is a chat or a screenshot of one, from Facebook Messenger, Instagram, WhatsApp, Facebook comments or a website, often in Bangla, Banglish or mixed English.

Extract the order the customer placed:
- customer_name: the customer's name as given in the order details or chat header. Empty if not shown.
- customer_phone: the customer's mobile number, digits only (Bangladeshi numbers look like 01XXXXXXXXX). Convert Bangla digits (০-৯) to 0-9. Empty if none.
- customer_address: the full delivery address as one line. Empty if none.
- source: where the chat comes from, judged from the app shown or named (Messenger or a Facebook page = "Facebook"). Empty if you can't tell.
- delivery_charge: the delivery charge mentioned (for example 60 inside Dhaka, 120 outside), 0 if none.
- date: only if the chat states the order date; otherwise empty.
- items: each product ordered, with quantity (default 1) and the agreed price per unit. If a total is given for several units, divide it. Match each to the shop's PRODUCTS by meaning (name, colour, size, Bangla or English spelling) and give its id; leave product_id empty if nothing clearly matches. Never invent a product id.

Use only what is in the input. Never make up names, numbers or addresses. If the input contains no order, set found to false.
Return JSON only.`;

interface Product { id: string; product_name: string; selling_price: number; sku: string | null }
interface Answer {
  found?: boolean;
  customer_name?: string;
  customer_phone?: string;
  customer_address?: string;
  source?: string;
  delivery_charge?: number;
  date?: string;
  items?: { product_id?: string; product_text?: string; quantity?: number; unit_price?: number }[];
}

const BANGLA_DIGITS = "০১২৩৪৫৬৭৮৯";

/** 01XXXXXXXXX for Bangladeshi mobiles, otherwise the digits as given. */
function cleanPhone(value: unknown) {
  const digits = String(value ?? "")
    .replace(/[০-৯]/g, (d) => String(BANGLA_DIGITS.indexOf(d)))
    .replace(/\D/g, "");
  const local = digits.replace(/^(?:00)?880?(?=1\d{9}$)/, "0");
  return local.slice(0, 20);
}

const money = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Set once a use has been counted, so failures after that can give it back.
  let chargedUser: string | null = null;
  const fail = async (body: unknown, status: number) => {
    if (chargedUser) await refundQuota(chargedUser, "order_reader");
    return json(body, status);
  };

  try {
    const caller = await getCaller(req);
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) return json({ error: "AI order reading is not configured" }, 503);

    const body = await req.json();
    const text = cleanText(body?.text, MAX_TEXT_CHARS);
    const image = typeof body?.image_base64 === "string" ? body.image_base64 : "";
    if (!text && !image) return json({ error: "Paste a chat or add a screenshot first." }, 400);
    if (image && !IMAGE_TYPES.includes(body.image_type)) {
      return json({ error: "Please use a JPG, PNG, WebP or HEIC screenshot." }, 400);
    }
    if (image.length > MAX_IMAGE_BASE64_CHARS) {
      return json({ error: "That screenshot is too large. Please use one under 5 MB." }, 400);
    }

    const quotaError = await consumeQuota(caller.client, "order_reader");
    if (quotaError) return quotaError;
    chargedUser = caller.user.id;

    // The shop's products, so the order can be matched to real ones. Row
    // level security limits this to the caller's workspace.
    const { data: rows } = await caller.client
      .from("inventory")
      .select("id, product_name, selling_price, sku")
      .order("product_name")
      .limit(MAX_PRODUCTS);
    const products = (rows ?? []) as Product[];
    const byId = new Map(products.map((p) => [p.id, p]));
    const catalogue = products.length
      ? products.map((p) => `${p.id} | ${p.product_name}${p.sku ? ` (${p.sku})` : ""} | ${p.selling_price}`).join("\n")
      : "(the shop has no products yet)";

    const parts: Record<string, unknown>[] = [{
      text: `Today is ${todayInDhaka()}.\n\nPRODUCTS (id | name | usual price):\n${catalogue}\n\nCHAT:\n${text || "(see the screenshot)"}`,
    }];
    if (image) parts.push({ inline_data: { mime_type: body.image_type, data: image } });

    const result = await generate({
      apiKey: GEMINI_API_KEY,
      system: SYSTEM,
      contents: [{ role: "user", parts }],
      temperature: 0,
      maxOutputTokens: 2048,
      responseSchema: SCHEMA,
    });
    if (!result.ok) {
      if (result.status === 429) return fail({ error: "Rate limit reached. Please wait a minute and try again." }, 429);
      return fail({ error: "Could not read the order. Please try again." }, 502);
    }

    let answer: Answer;
    try {
      answer = JSON.parse(result.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, ""));
    } catch {
      return fail({ error: "Could not read the order. Please try again." }, 502);
    }

    // Keep only what the form can use: real product ids, sane numbers.
    const items = (answer.items ?? []).slice(0, MAX_ITEMS).map((it) => {
      const product = it.product_id ? byId.get(it.product_id) : undefined;
      const quantity = Math.max(1, Math.min(10_000, Math.round(Number(it.quantity) || 1)));
      return {
        product_id: product?.id ?? null,
        product_text: cleanText(it.product_text, 200) || product?.product_name || "",
        quantity,
        unit_price: money(it.unit_price) || product?.selling_price || 0,
      };
    });
    const date = /^\d{4}-\d{2}-\d{2}$/.test(answer.date ?? "") ? answer.date : null;

    return json({
      found: answer.found !== false && (items.length > 0 || Boolean(answer.customer_name || answer.customer_phone)),
      customer_name: cleanText(answer.customer_name, 120),
      customer_phone: cleanPhone(answer.customer_phone),
      customer_address: cleanText(answer.customer_address, 500),
      source: SOURCES.includes(answer.source ?? "") ? answer.source : null,
      delivery_charge: money(answer.delivery_charge),
      date,
      items,
    });
  } catch (e) {
    console.error("read-order error:", e);
    return fail({ error: "Could not read the order. Please try again." }, 500);
  }
});

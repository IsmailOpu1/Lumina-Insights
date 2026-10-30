import { consumeQuota, corsHeaders, currencySymbol, describeBusiness, fetchSnapshot, getCaller, json, refundQuota, todayInDhaka } from "../_shared/business.ts";
import { generate } from "../_shared/gemini.ts";

const PLATFORM_GUIDES: Record<string, string> = {
  Instagram: `Instagram feed post plus a Reel.
- caption: 60-150 words. The first line must work on its own before "more" cuts it off. Short lines, a few relevant emojis, no walls of text.
- hashtags: 12-15. Mix product, category, style and Bangladesh or city tags. No generic spam like #love or #instagood.
- script: a 15-30 second Reel.`,
  Facebook: `Facebook page post plus a short video.
- caption: 120-250 words, conversational, like a trusted local shop talking to customers. Short paragraphs. Invite comments or an inbox message (for example "Comment 'price' or inbox us").
- hashtags: 4-6, specific to the product and Bangladesh.
- script: a 30-45 second video for the page or a Reel.`,
  TikTok: `TikTok video.
- caption: 1-2 short lines, under 150 characters, that make people watch.
- hashtags: 4-6, a mix of niche and broad tags, including Bangladesh ones.
- script: a 30-60 second video. The first 3 seconds must stop the scroll.`,
};

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    hook: { type: "STRING", description: "One scroll-stopping opening line, under 15 words." },
    value_proposition: { type: "STRING", description: "Why this customer should buy, in 2-3 sentences, built on the real features given." },
    cta: { type: "STRING", description: "One clear action telling the customer exactly how to order." },
    caption: { type: "STRING", description: "The full post caption, ready to paste, without hashtags." },
    script: { type: "STRING", description: "The video script with timed scenes." },
    hashtags: { type: "ARRAY", items: { type: "STRING" }, description: "Hashtags without the # sign." },
  },
  required: ["hook", "value_proposition", "cta", "caption", "script", "hashtags"],
  propertyOrdering: ["hook", "value_proposition", "cta", "caption", "script", "hashtags"],
};

const SYSTEM_PROMPT = `You are a senior social media copywriter who has run marketing for hundreds of small online shops in Bangladesh. You write content that sells, and you never mislead customers.

TRUTH RULES (most important):
1. Use only the facts given: product name, features, the shop's own price and stock, and the business profile. Never invent prices, discounts, offers, free delivery, warranties, certifications, ingredients, sizes, ratings, review counts or customer numbers.
2. If a fact would help but was not given (for example price or delivery terms), write around it (for example "Inbox us for today's price") instead of making one up.
3. No false urgency or scarcity. Say "limited stock" only if the stock given is low. No exaggerated medical, health or "best in Bangladesh" claims.
4. Never mention competitors by name.

WHAT GOOD LOOKS LIKE:
- Speak to the target audience's real problem or desire first, then show how this product solves it. Turn each feature into a benefit ("hand-woven cotton" becomes "stays cool on a long, hot office day").
- Be specific and concrete. Avoid empty words like "premium quality", "best", "amazing" or "unique" unless a real detail backs them up.
- Write for Bangladeshi buyers: they trust real photos and clear prices, they like cash on delivery and bKash or Nagad, they care about delivery time inside and outside Dhaka, and they often order by Messenger, WhatsApp or by commenting. Mention a season or occasion (Eid, Pohela Boishakh, winter, weddings) only if it fits the product and today's date.
- The CTA tells people exactly what to do: inbox, comment a keyword, WhatsApp, or tap the link. Keep it to one action.
- Write in natural, simple English that Bangladeshi customers read easily.

VIDEO SCRIPT FORMAT:
Write it as timed scenes, one per line, like:
[0-3s] HOOK: what is on screen + what is said or shown as text
[3-10s] ...
Each scene says what the camera shows (marked "Visual:") and the voice-over or on-screen text (marked "Say:"). Show the product in real use. End with the CTA on screen. Keep it filmable with a phone and no budget.

Return JSON only, matching the schema.`;

interface InventoryRow { product_name: string; selling_price: number; stock_quantity: number; low_stock_threshold: number }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Set once a use has been counted, so failures after that can give it back.
  let chargedUser: string | null = null;
  const fail = async (body: unknown, status: number) => {
    if (chargedUser) await refundQuota(chargedUser, "marketing");
    return json(body, status);
  };

  try {
    const caller = await getCaller(req);
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const { product_name, platform: requested, product_features, target_audience } = await req.json();
    if (!product_name || typeof product_name !== "string") return json({ error: "product_name is required" }, 400);
    const platform = typeof requested === "string" && Object.hasOwn(PLATFORM_GUIDES, requested) ? requested : "Instagram";

    const quotaError = await consumeQuota(caller.client, "marketing");
    if (quotaError) return quotaError;
    chargedUser = caller.user.id;

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("Gemini API key is not configured");

    // The business profile comes from the database; today's range keeps the
    // snapshot query cheap since only the profile is used here. The shop's own
    // price and stock for this product, if it is in the inventory, keep the
    // copy honest.
    const today = new Date().toISOString().slice(0, 10);
    const [snapshot, { data: inventory }] = await Promise.all([
      fetchSnapshot(caller.client, today, today),
      caller.client.from("inventory").select("product_name, selling_price, stock_quantity, low_stock_threshold").limit(500),
    ]);
    const sym = currencySymbol(snapshot);
    const wanted = product_name.trim().toLowerCase();
    const item = ((inventory ?? []) as InventoryRow[]).find((p) => p.product_name.trim().toLowerCase() === wanted);
    const shopFacts = item
      ? `From the shop's inventory: selling price ${sym}${Math.round(item.selling_price).toLocaleString("en-US")}, ${item.stock_quantity} in stock${item.stock_quantity <= item.low_stock_threshold ? " (low stock)" : ""}.`
      : "Price and stock: not given.";

    const userPrompt = `Write ${platform} marketing content.

PRODUCT: ${product_name.trim()}
FEATURES AND OFFER DETAILS: ${product_features?.trim() || "Not given. Keep claims general and true."}
TARGET AUDIENCE: ${target_audience?.trim() || "Not given. Pick the most likely Bangladeshi buyers for this product and write for them."}
${shopFacts}
Today's date: ${todayInDhaka()}

${describeBusiness(snapshot)}

PLATFORM GUIDE:
${PLATFORM_GUIDES[platform]}`;

    const result = await generate({
      apiKey: GEMINI_API_KEY,
      system: SYSTEM_PROMPT,
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      temperature: 0.8,
      maxOutputTokens: 4096,
      responseSchema: RESPONSE_SCHEMA,
    });

    if (!result.ok) {
      if (result.status === 429) return fail({ error: "Rate limit reached. Please wait a minute and try again." }, 429);
      return fail({ error: "AI generation failed. Try again." }, 500);
    }

    // JSON mode should return a bare object; strip fences just in case.
    const text = result.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");

    let parsed;
    try {
      if (start === -1 || end === -1 || end <= start) throw new Error("No JSON object found");
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
      console.error("Failed to parse Gemini response:", text.slice(0, 500));
      return fail({ error: "Failed to parse AI response. Try again." }, 500);
    }

    return json(parsed);
  } catch (e) {
    console.error("generate-marketing-content error:", e);
    return fail({ error: "AI generation failed. Try again." }, 500);
  }
});

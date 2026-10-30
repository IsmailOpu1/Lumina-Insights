import { consumeQuota, corsHeaders, currencySymbol, daysAgo, describeKeyFigures, describeSnapshot, fetchSnapshot, getCaller, json, refundQuota, todayInDhaka } from "../_shared/business.ts";
import { generate, historyToTurns } from "../_shared/gemini.ts";

const MAX_HISTORY_MESSAGES = 20;
const CONTEXT_DAYS = 30;

function systemPrompt(sym: string, data: string) {
  return `You are Lumina, the business advisor built into Lumina Insights. You work for the owner of a small online or retail business in Bangladesh, most likely selling through Facebook, Instagram, WhatsApp, a website or a shop. Today is ${todayInDhaka()}.

Your job is to give the most accurate, logical and useful answer a sharp, experienced business consultant would give, then make it easy to act on.

ACCURACY RULES (most important):
1. Numbers about this business come ONLY from the BUSINESS DATA and KEY FIGURES below. Quote them exactly. Never invent, round up or "estimate" a figure about this business that is not there.
2. The KEY FIGURES are already calculated. Use them instead of doing your own arithmetic. If you must calculate something new, show the working in one short line (for example: ${sym}45,000 ÷ 30 orders = ${sym}1,500).
3. If the data cannot answer the question (for example, it has no customer ages, no website traffic, or the period is too short), say plainly what is missing and what the owner could track to answer it next time. Then give your best advice and label it as general advice.
4. Keep facts and opinions apart. Say "your data shows" for facts and "I'd suggest" or "my guess is" for judgement.
5. When the data is thin (only a few orders or days), say the sample is small and that conclusions are tentative.
6. If the question is ambiguous and the answer would change a lot depending on the meaning, ask one short clarifying question instead of guessing.
7. Never guarantee results. Give realistic ranges and say what they depend on.

HOW TO THINK before answering a business question:
- What is the owner really trying to decide?
- What does the data say, and what is the most likely cause behind it?
- What are the two or three options, and their trade-offs in money, time and risk?
- What is the single best next step?

BANGLADESH CONTEXT to use when it is relevant:
- Cash on delivery is common, and so are failed deliveries and returns, which cost courier fees both ways. Advance payment by bKash or Nagad reduces this.
- Delivery inside Dhaka is cheaper and faster than outside Dhaka. Pathao, Steadfast, RedX and Paperfly are common couriers.
- Most selling happens through Facebook pages, groups and Messenger, plus Instagram, WhatsApp and Daraz.
- Demand peaks around Eid-ul-Fitr, Eid-ul-Adha, Pohela Boishakh, Puja, winter and the wedding season, and around salary days at the start of the month.
- Price-sensitive buyers respond to bundles, free delivery thresholds and trust signals (real photos, reviews, a clear return policy).

HOW TO ANSWER:
- Lead with the direct answer or conclusion in the first sentence or two. No warm-up.
- Then give the reasons, backed by the owner's own numbers when they apply.
- End practical questions with concrete next steps: what to do, roughly how much it costs, and how to tell whether it worked.
- Match length to the question. A quick question gets a few sentences. A strategy question gets a structured answer with short headings or bullets. Do not pad.
- Use plain words a busy shop owner understands. If you use a term like ROAS or margin, explain it in a few words the first time.
- Be honest and direct, even when the news is bad. Be warm, not flattering.
- If an image is attached, describe what matters in it for the business (product photo quality, a receipt, an ad, a chart) and base your advice on it.
- Use ${sym} for money with thousands separators, for example ${sym}12,500.
- Reply in English.

${data}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Set once a use has been counted, so failures after that can give it back.
  let chargedUser: string | null = null;
  const fail = async (body: unknown, status: number) => {
    if (chargedUser) await refundQuota(chargedUser, "ai_chat");
    return json(body, status);
  };

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY not set" }, 500);

    const caller = await getCaller(req);
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const { message, conversation_history, image_base64, image_type } = await req.json();
    if (!message || typeof message !== "string") return json({ error: "message is required" }, 400);

    const quotaError = await consumeQuota(caller.client, "ai_chat");
    if (quotaError) return quotaError;
    chargedUser = caller.user.id;

    // Business numbers come from the database, never from the request. The
    // period before is fetched too so the model can talk about trends.
    const [snapshot, previous] = await Promise.all([
      fetchSnapshot(caller.client, daysAgo(CONTEXT_DAYS - 1)),
      fetchSnapshot(caller.client, daysAgo(CONTEXT_DAYS * 2 - 1), daysAgo(CONTEXT_DAYS)),
    ]);
    const sym = currencySymbol(snapshot);
    const data = `${describeSnapshot(snapshot)}\n\n${describeKeyFigures(snapshot, previous)}`;

    // The image, if any, goes alongside the latest message.
    const parts: Record<string, unknown>[] = [{ text: message }];
    if (image_base64 && image_type) {
      parts.push({ inline_data: { mime_type: image_type, data: image_base64 } });
    }
    const contents = [...historyToTurns(conversation_history, MAX_HISTORY_MESSAGES), { role: "user" as const, parts }];
    // The latest message must stand alone after the history.
    if (contents.length > 1 && contents[contents.length - 2].role === "user") {
      const latest = contents.pop()!;
      contents[contents.length - 1].parts.push(...latest.parts);
    }

    const result = await generate({
      apiKey: GEMINI_API_KEY,
      system: systemPrompt(sym, data),
      contents,
      temperature: 0.4,
      maxOutputTokens: 2048,
    });

    if (!result.ok) {
      if (result.status === 429) return fail({ error: "Rate limit reached. Please wait a minute and try again." }, 429);
      if (result.status === 502) return fail({ error: "I could not generate a response. Please try again." }, 502);
      return fail({ error: "Failed to generate response" }, 500);
    }
    return json({ response: result.text });
  } catch (err) {
    console.error("business-ai-chat error:", err);
    return fail({ error: "Failed to generate response" }, 500);
  }
});

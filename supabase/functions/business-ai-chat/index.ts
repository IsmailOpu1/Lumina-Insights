import { corsHeaders, currencySymbol, daysAgo, describeSnapshot, fetchSnapshot, getCaller, json } from "../_shared/business.ts";

const MAX_HISTORY_MESSAGES = 20;
const CONTEXT_DAYS = 30;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY not set" }, 500);

    const caller = await getCaller(req);
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const { message, conversation_history, image_base64, image_type } = await req.json();
    if (!message || typeof message !== "string") return json({ error: "message is required" }, 400);

    // Business numbers come from the database, never from the request.
    const snapshot = await fetchSnapshot(caller.client, daysAgo(CONTEXT_DAYS - 1));
    const sym = currencySymbol(snapshot);

    const systemPrompt = `You are a brilliant, insightful personal advisor and business consultant for a small Bangladeshi SMB owner. Think of yourself as a smart friend who knows everything about business, marketing, strategy, finance, and life.

You have their live business data for the last ${CONTEXT_DAYS} days. Use it naturally when relevant — never force it into every answer. If they ask about something the data does not cover, say so instead of guessing numbers.

HOW TO RESPOND:
- Talk like a real smart person not like a template or report
- Vary style based on question:
  Simple = direct answer
  Complex = deep analysis
  Emotional = empathetic
  Strategy = think out loud with them
  Creative = be imaginative
- NEVER use same structure twice
- Sometimes lists, sometimes paragraphs
- Sometimes ask smart follow-up
- Challenge their thinking when needed
- Be honest even when uncomfortable
- Reference ${sym} numbers naturally
- Analyze images deeply if uploaded

PERSONALITY:
  Direct and confident
  Warm but never fake
  Genuinely curious
  Zero jargon
  Thinks creatively

RESPONSE LENGTH:
  Match question complexity
  Minimum 2-3 solid paragraphs for any real question
  Never pad simple answers

GOAL: Every response feels like a smart human thought deeply about this specific person and situation. Never robotic. Never templated.

Use ${sym} for currency.
English only. No Bengali.`;

    let historyText = "";
    if (Array.isArray(conversation_history) && conversation_history.length > 0) {
      historyText = "\n\nCONVERSATION HISTORY:\n" + conversation_history.slice(-MAX_HISTORY_MESSAGES).map((m: { role: string; content: string }) =>
        `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`
      ).join("\n");
    }

    const prompt = `${systemPrompt}\n\n${describeSnapshot(snapshot)}${historyText}\n\nUser: ${message}`;

    // The image, if any, goes alongside the text.
    const parts: Record<string, unknown>[] = [{ text: prompt }];
    if (image_base64 && image_type) {
      parts.push({ inline_data: { mime_type: image_type, data: image_base64 } });
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 2048 },
        }),
      }
    );

    if (!res.ok) {
      console.error("Gemini API error:", res.status, await res.text());
      if (res.status === 429) return json({ error: "Rate limit reached. Please wait a minute and try again." }, 429);
      return json({ error: "Failed to generate response" }, 500);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "I could not generate a response. Please try again.";
    return json({ response: text });
  } catch (err) {
    console.error("business-ai-chat error:", err);
    return json({ error: "Failed to generate response" }, 500);
  }
});

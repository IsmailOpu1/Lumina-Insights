import { consumeQuota, corsHeaders, describeSnapshot, fetchSnapshot, getCaller, json } from "../_shared/business.ts";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const caller = await getCaller(req);
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

    // Only the date range and an optional question come from the client;
    // the numbers are computed by the database for the caller's workspace.
    const { from, to, focusQuestion } = await req.json();
    if ((from && !DATE_RE.test(from)) || (to && !DATE_RE.test(to))) {
      return json({ error: "from/to must be YYYY-MM-DD" }, 400);
    }

    const quotaError = await consumeQuota(caller.client, "insights");
    if (quotaError) return quotaError;

    const snapshot = await fetchSnapshot(caller.client, from, to);

    const systemPrompt = `You are a sharp business advisor for a small business owner. Analyze this exact business data and give exactly 5 bold, specific, numbered, actionable insights. Use the currency symbol provided. Reference the actual numbers provided. Be direct — no fluff, no generic advice. Each insight must be 1-2 sentences maximum.`;

    const userPrompt = focusQuestion
      ? `${describeSnapshot(snapshot)}\n\nFocus on this question: ${focusQuestion}\n\nGive 5 insights with emphasis on the question.`
      : `${describeSnapshot(snapshot)}\n\nGive me 5 actionable insights.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return json({ error: "Rate limit reached. Please wait 1 minute and try again." }, 429);
      }
      console.error("Gemini API error:", response.status, await response.text());
      return json({ error: "AI generation failed" }, 500);
    }

    const data = await response.json();
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text || "No insights generated.";
    return json({ insights: content });
  } catch (e) {
    console.error("generate-dashboard-insights error:", e);
    return json({ error: "AI generation failed" }, 500);
  }
});

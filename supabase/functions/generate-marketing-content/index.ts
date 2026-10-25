import { consumeQuota, corsHeaders, describeBusiness, fetchSnapshot, getCaller, json } from "../_shared/business.ts";

const platformPrompts: Record<string, string> = {
  Instagram: "Short punchy caption, under 150 words, 15 hashtags relevant to the product and Bangladesh market.",
  Facebook: "Conversational tone, 150-300 words, 5-8 hashtags. Encourage engagement and sharing.",
  TikTok: "Video script with hook (first 3 seconds), engaging middle section, and clear CTA. Designed for a 30-60 second video.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const caller = await getCaller(req);
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const { product_name, platform, product_features, target_audience } = await req.json();
    if (!product_name) return json({ error: "product_name is required" }, 400);

    const quotaError = await consumeQuota(caller.client, "marketing");
    if (quotaError) return quotaError;

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("Gemini API key is not configured");

    const platformGuide = platformPrompts[platform] || platformPrompts.Instagram;

    // The business profile comes from the database; today's range keeps the
    // snapshot query cheap since only the profile is used here.
    const today = new Date().toISOString().slice(0, 10);
    const snapshot = await fetchSnapshot(caller.client, today, today);

    const systemPrompt = `You are an expert social media marketer for small Bangladeshi businesses. Generate marketing content for ${platform}. Be specific, persuasive, culturally relevant to Bangladesh. Return ONLY valid JSON with keys: hook, value_proposition, cta, caption, script, hashtags (array of strings without # prefix). No markdown, no code fences, pure JSON only.`;

    const userPrompt = `Product: ${product_name}
Platform: ${platform}
Features: ${product_features || "Not specified"}
Target Audience: ${target_audience || "General Bangladeshi consumers"}

${describeBusiness(snapshot)}

Platform guidelines: ${platformGuide}

${platform === "TikTok" ? "Include a detailed video script in the 'script' field." : "Set 'script' to null since this is not TikTok."}

Generate compelling marketing content now.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }],
          generationConfig: { temperature: 0.9, maxOutputTokens: 4096 },
        }),
      }
    );

    if (!response.ok) {
      console.error("Gemini API error:", response.status, await response.text());
      if (response.status === 429) return json({ error: "Rate limit reached. Please wait a minute and try again." }, 429);
      return json({ error: "AI generation failed. Try again." }, 500);
    }

    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Strip markdown fences and extract the JSON object
    text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");

    let parsed;
    try {
      if (start === -1 || end === -1 || end <= start) throw new Error("No JSON object found");
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
      console.error("Failed to parse Gemini response:", text.slice(0, 500));
      return json({ error: "Failed to parse AI response. Try again." }, 500);
    }

    return json(parsed);
  } catch (e) {
    console.error("generate-marketing-content error:", e);
    return json({ error: "AI generation failed. Try again." }, 500);
  }
});

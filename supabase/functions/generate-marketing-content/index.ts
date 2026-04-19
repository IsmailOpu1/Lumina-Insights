import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const platformPrompts: Record<string, string> = {
  Instagram: "Short punchy caption, under 150 words, 15 hashtags relevant to the product and Bangladesh market.",
  Facebook: "Conversational tone, 150-300 words, 5-8 hashtags. Encourage engagement and sharing.",
  TikTok: "Video script with hook (first 3 seconds), engaging middle section, and clear CTA. Designed for a 30-60 second video.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { product_name, platform, product_features, target_audience, business_context } = await req.json();

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("Gemini API key is not configured");

    const platformGuide = platformPrompts[platform] || platformPrompts.Instagram;

    const contextBlock = business_context ? `\n\nBUSINESS PROFILE:\nName: ${business_context.business_name || 'N/A'}\nType: ${business_context.business_type || 'N/A'}\nDescription: ${business_context.business_description || 'N/A'}\nCurrency: ${business_context.currency || 'BDT'}\n` : '';

    const systemPrompt = `You are an expert social media marketer for small Bangladeshi businesses. Generate marketing content for ${platform}. Be specific, persuasive, culturally relevant to Bangladesh. Return ONLY valid JSON with keys: hook, value_proposition, cta, caption, script, hashtags (array of strings without # prefix). No markdown, no code fences, pure JSON only.`;

    const userPrompt = `Product: ${product_name}
Platform: ${platform}
Features: ${product_features || "Not specified"}
Target Audience: ${target_audience || "General Bangladeshi consumers"}
${contextBlock}
Platform guidelines: ${platformGuide}

${platform === "TikTok" ? "Include a detailed video script in the 'script' field." : "Set 'script' to null since this is not TikTok."}

Generate compelling marketing content now.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: systemPrompt + "\n\n" + userPrompt }] },
          ],
          generationConfig: { temperature: 0.9, maxOutputTokens: 4096 },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error:", response.status, errText);
      return new Response(JSON.stringify({ error: "AI generation failed. Check API key or try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Strip markdown fences and extract JSON object
    text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");

    let parsed;
    try {
      if (start === -1 || end === -1 || end <= start) throw new Error("No JSON object found");
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
      console.error("Failed to parse Gemini response:", text.slice(0, 500));
      return new Response(JSON.stringify({ error: "Failed to parse AI response. Try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Edge function error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

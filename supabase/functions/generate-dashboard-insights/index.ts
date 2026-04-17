import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { context, focusQuestion, business_context } = await req.json();
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

    const contextStr = Object.entries(context || {})
      .map(([k, v]) => {
        if (Array.isArray(v)) return `${k}: ${v.length > 0 ? v.map((i: any) => typeof i === 'object' ? JSON.stringify(i) : i).join(', ') : 'none'}`;
        return `${k}: ${v}`;
      })
      .join('\n');

    const contextBlock = business_context ? `\n\nBUSINESS PROFILE:\nName: ${business_context.business_name || 'N/A'}\nType: ${business_context.business_type || 'N/A'}\nDescription: ${business_context.business_description || 'N/A'}\nCurrency: ${business_context.currency || 'BDT'}\n\nLIVE BUSINESS DATA:\nRevenue: ${business_context.currency === 'INR' ? '₹' : business_context.currency === 'USD' ? '$' : '৳'}${business_context.revenue || 0}\nProfit: ${business_context.currency === 'INR' ? '₹' : business_context.currency === 'USD' ? '$' : '৳'}${business_context.profit || 0}\nMargin: ${business_context.margin || 0}%\nTop Product: ${business_context.top_product || 'N/A'}\nLow Stock: ${business_context.low_stock || 0}\nBest Channel: ${business_context.top_sales_source || 'N/A'}\nTotal Orders: ${business_context.total_orders || 0}\nAd Spend: ${business_context.currency === 'INR' ? '₹' : business_context.currency === 'USD' ? '$' : '৳'}${business_context.total_ad_spend || 0}\n` : '';

    const systemPrompt = `You are a sharp business advisor for a small business owner. Analyze this exact business data and give exactly 5 bold, specific, numbered, actionable insights. Use the currency symbol provided. Reference the actual numbers provided. Be direct — no fluff, no generic advice. Each insight must be 1-2 sentences maximum.`;

    const userPrompt = focusQuestion
      ? `Here is my current business data:\n${contextStr}${contextBlock}\n\nFocus on this question: ${focusQuestion}\n\nGive 5 insights with emphasis on the question.`
      : `Here is my current business data:\n${contextStr}${contextBlock}\n\nGive me 5 actionable insights.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: systemPrompt + "\n\n" + userPrompt }],
            },
          ],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("Gemini API error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text || "No insights generated.";

    return new Response(JSON.stringify({ insights: content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Edge function error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

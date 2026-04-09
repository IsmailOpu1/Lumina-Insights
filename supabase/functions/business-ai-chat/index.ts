const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not set' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { message, conversation_history, business_context, image_base64, image_type } = await req.json();

    const systemPrompt = `You are a brilliant, insightful personal advisor and business consultant for a small Bangladeshi SMB owner. Think of yourself as a smart friend who knows everything about business, marketing, strategy, finance, and life.

You have their live business data. Use it naturally when relevant — never force it into every answer.

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
- Reference ৳ numbers naturally
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

Use ৳ for currency.
English only. No Bengali.`;

    const contextBlock = business_context ? `\n\nBUSINESS PROFILE:\nName: ${business_context.business_name || 'N/A'}\nType: ${business_context.business_type || 'N/A'}\nDescription: ${business_context.business_description || 'N/A'}\nCurrency: ${business_context.currency || 'BDT'}\n\nLIVE BUSINESS DATA:\nRevenue: ${business_context.currency === 'INR' ? '₹' : business_context.currency === 'USD' ? '$' : '৳'}${business_context.revenue || 0}\nProfit: ${business_context.currency === 'INR' ? '₹' : business_context.currency === 'USD' ? '$' : '৳'}${business_context.profit || 0}\nMargin: ${business_context.margin || 0}%\nTop Product: ${business_context.top_product || 'N/A'}\nLow Stock: ${business_context.low_stock || 0}\nBest Channel: ${business_context.top_sales_source || 'N/A'}\nTotal Orders: ${business_context.total_orders || 0}\nAd Spend: ${business_context.currency === 'INR' ? '₹' : business_context.currency === 'USD' ? '$' : '৳'}${business_context.total_ad_spend || 0}\n` : '';

    let historyText = '';
    if (conversation_history && conversation_history.length > 0) {
      historyText = '\n\nCONVERSATION HISTORY:\n' + conversation_history.map((m: { role: string; content: string }) =>
        `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
      ).join('\n');
    }

    const fullPrompt = systemPrompt + contextBlock + historyText + '\n\nUser: ' + message;

    // Build parts array
    const parts: any[] = [{ text: fullPrompt }];
    if (image_base64 && image_type) {
      parts.push({
        inline_data: {
          mime_type: image_type,
          data: image_base64,
        },
      });
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 2048 },
        }),
      }
    );

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'I could not generate a response. Please try again.';

    return new Response(JSON.stringify({ response: text }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to generate response' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

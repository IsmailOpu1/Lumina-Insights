import { adminClient, corsHeaders, currencySymbol, describeKeyFigures, describeSnapshot, fetchSnapshot, getCaller, json } from "../_shared/business.ts";
import { generate } from "../_shared/gemini.ts";

/**
 * The dashboard's weekly summary: a few plain sentences on how last week
 * (Monday to Sunday, Dhaka time) went against the week before, the likely
 * reason, and one thing to do this week. Written by AI once per workspace,
 * week and language, stored, and served from storage after that, so it
 * costs one AI call a week and no one's daily AI questions. Pro and trial
 * workspaces only, like the Monday summary notification.
 */

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Monday of this week in Dhaka, and last week's and the week before's dates. */
export function weeks(now = new Date()) {
  const today = new Date(`${now.toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" })}T00:00:00Z`);
  const monday = new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * DAY);
  const at = (days: number) => iso(new Date(monday.getTime() + days * DAY));
  return { weekStart: iso(monday), last: { from: at(-7), to: at(-1) }, before: { from: at(-14), to: at(-8) } };
}

const LANGUAGE = {
  en: "Write in plain English.",
  bn: "Write in natural, everyday Bangla (বাংলা script) that a shop owner in Bangladesh speaks. Keep product names and common business words people say in English (profit, margin, ROAS, Facebook, courier) in English. Write numbers as digits.",
};

function systemPrompt(sym: string, language: "en" | "bn") {
  return `You write the weekly business summary that opens the dashboard of Lumina Insights, for the owner of a small online shop in Bangladesh.

Write 3 or 4 short sentences, as one paragraph. No greeting, no heading, no bullet points, no markdown.
1. How last week went: revenue, net profit and orders, and how they moved against the week before.
2. The most likely reason, from the data (a product, a channel, cancels or returns, expenses or ad spend).
3. One concrete thing to do this week, specific to this shop.

Rules:
- Use only the figures in the data below, exactly as given. Never invent a number. Use the KEY FIGURES instead of doing arithmetic.
- If last week had very few orders, say the week was quiet and keep it short.
- Be direct and honest about bad news, without drama.
- Money as ${sym} with thousands separators, for example ${sym}12,500.
- ${LANGUAGE[language]}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY not set" }, 500);

    const caller = await getCaller(req);
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const language: "en" | "bn" = body?.language === "bn" ? "bn" : "en";

    // The caller's workspace: their own if they own it, else the one they joined.
    const admin = adminClient();
    const { data: settings } = await admin
      .from("user_settings").select("role, owner_id").eq("user_id", caller.user.id).maybeSingle();
    const owner = settings && settings.role !== "owner" && settings.owner_id ? settings.owner_id : caller.user.id;

    const { data: plan } = await admin.rpc("workspace_plan", { p_owner: owner }).maybeSingle();
    const p = plan as { plan_id: string; state: string } | null;
    if (!p || !(p.state === "trialing" || (p.state === "active" && p.plan_id === "pro"))) {
      return json({ summary: null, reason: "not_pro" });
    }

    const { weekStart, last, before } = weeks();
    const stored = () => admin.from("weekly_summaries").select("summary")
      .eq("owner_id", owner).eq("week_start", weekStart).eq("language", language).maybeSingle();

    const { data: existing } = await stored();
    if (existing) return json({ summary: existing.summary, from: last.from, to: last.to });

    const [now, previous] = await Promise.all([
      fetchSnapshot(caller.client, last.from, last.to),
      fetchSnapshot(caller.client, before.from, before.to),
    ]);
    if (now.orders + now.cancelled_orders + (now.returned_orders ?? 0) === 0 && previous.orders === 0) {
      return json({ summary: null, reason: "quiet" });
    }

    const sym = currencySymbol(now);
    const result = await generate({
      apiKey: GEMINI_API_KEY,
      system: systemPrompt(sym, language),
      contents: [{
        role: "user",
        parts: [{ text: `${describeSnapshot(now)}\n\n${describeKeyFigures(now, previous)}\n\nWrite last week's summary.` }],
      }],
      temperature: 0.4,
      maxOutputTokens: 400,
    });
    if (!result.ok) return json({ error: "The AI could not write the summary right now." }, 502);

    const summary = result.text.replace(/[*#_`]/g, "").replace(/\s+/g, " ").trim().slice(0, 2000);
    // Two tabs opening at once both write; the first one wins and both show it.
    await admin.from("weekly_summaries")
      .upsert({ owner_id: owner, week_start: weekStart, language, summary }, { onConflict: "owner_id,week_start,language", ignoreDuplicates: true });
    const { data: saved } = await stored();
    return json({ summary: saved?.summary ?? summary, from: last.from, to: last.to });
  } catch (error) {
    console.error("weekly-summary error:", error);
    return json({ error: "Something went wrong writing the summary." }, 500);
  }
});

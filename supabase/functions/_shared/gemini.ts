/** The model every AI feature uses; set GEMINI_MODEL to try another one. */
export const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash-lite";

export interface GeminiTurn {
  role: "user" | "model";
  parts: Record<string, unknown>[];
}

/**
 * Turns the app's chat history into Gemini turns: roles mapped, empty
 * messages dropped, back-to-back messages from the same side merged, and the
 * conversation made to start with the user as Gemini expects.
 */
export function historyToTurns(history: unknown, limit: number): GeminiTurn[] {
  if (!Array.isArray(history)) return [];
  const turns: GeminiTurn[] = [];
  for (const m of history.slice(-limit)) {
    const text = typeof m?.content === "string" ? m.content.trim() : "";
    if (!text) continue;
    const role = m.role === "user" ? "user" : "model";
    const last = turns[turns.length - 1];
    if (last?.role === role) last.parts.push({ text });
    else turns.push({ role, parts: [{ text }] });
  }
  while (turns[0]?.role === "model") turns.shift();
  return turns;
}

export type GeminiResult = { ok: true; text: string } | { ok: false; status: number };

/** One generateContent call with a proper system instruction. */
export async function generate(opts: {
  apiKey: string;
  system: string;
  contents: GeminiTurn[];
  temperature: number;
  maxOutputTokens: number;
  responseSchema?: Record<string, unknown>;
}): Promise<GeminiResult> {
  const generationConfig: Record<string, unknown> = {
    temperature: opts.temperature,
    maxOutputTokens: opts.maxOutputTokens,
  };
  if (opts.responseSchema) {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseSchema = opts.responseSchema;
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${opts.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.system }] },
        contents: opts.contents,
        generationConfig,
      }),
    }
  );
  if (!res.ok) {
    console.error("Gemini API error:", res.status, await res.text());
    return { ok: false, status: res.status };
  }
  const data = await res.json();
  const text = (data?.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? "")
    .join("")
    .trim();
  return text ? { ok: true, text } : { ok: false, status: 502 };
}

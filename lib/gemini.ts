// ═══════════════════════════════════════════════════════════════════════════
// N-Guard: AI Provider Helper
// Supports: Google Gemini → Groq → Template fallback
// ═══════════════════════════════════════════════════════════════════════════

// ── Provider config ──────────────────────────────────────────────────────
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const GROQ_API_KEY = process.env.GROQ_API_KEY ?? "";

const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const GROQ_MODEL = "llama-3.3-70b-versatile";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export type AIProvider = "gemini" | "groq" | "none";

export function availableProviders(): AIProvider[] {
  const providers: AIProvider[] = [];
  if (GEMINI_API_KEY) providers.push("gemini");
  if (GROQ_API_KEY) providers.push("groq");
  return providers;
}

export function isAIAvailable(): boolean {
  return GEMINI_API_KEY.length > 0 || GROQ_API_KEY.length > 0;
}

// ── Gemini call ──────────────────────────────────────────────────────────
async function callGemini(
  userPrompt: string,
  systemPrompt?: string,
  options?: { temperature?: number; maxTokens?: number }
): Promise<string | null> {
  if (!GEMINI_API_KEY) return null;

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: options?.temperature ?? 0.4,
      maxOutputTokens: options?.maxTokens ?? 4096,
      topP: 0.95,
    },
  };

  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[Gemini] ${res.status}:`, errText.substring(0, 200));
    return null;
  }

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
}

// ── Groq call (OpenAI-compatible) ────────────────────────────────────────
async function callGroq(
  userPrompt: string,
  systemPrompt?: string,
  options?: { temperature?: number; maxTokens?: number }
): Promise<string | null> {
  if (!GROQ_API_KEY) return null;

  const messages: { role: string; content: string }[] = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: userPrompt });

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: options?.temperature ?? 0.4,
      max_tokens: options?.maxTokens ?? 4096,
      messages,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[Groq] ${res.status}:`, errText.substring(0, 200));
    return null;
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? null;
}

// ── Unified ask function with automatic fallback ─────────────────────────
/**
 * Try Gemini → Groq → null (template fallback).
 * Returns { text, provider } so the UI can show which AI responded.
 */
export async function askAI(
  userPrompt: string,
  systemPrompt?: string,
  options?: { temperature?: number; maxTokens?: number }
): Promise<{ text: string; provider: AIProvider } | null> {
  // Try Gemini first
  if (GEMINI_API_KEY) {
    try {
      const text = await callGemini(userPrompt, systemPrompt, options);
      if (text) return { text, provider: "gemini" };
    } catch (err) {
      console.error("[Gemini] exception:", err);
    }
  }

  // Fallback to Groq
  if (GROQ_API_KEY) {
    try {
      const text = await callGroq(userPrompt, systemPrompt, options);
      if (text) return { text, provider: "groq" };
    } catch (err) {
      console.error("[Groq] exception:", err);
    }
  }

  // Both failed
  return null;
}

// ── Backwards-compatible exports ─────────────────────────────────────────
/** @deprecated Use askAI instead */
export function isGeminiAvailable(): boolean {
  return isAIAvailable();
}

/** @deprecated Use askAI instead */
export async function askGemini(
  userPrompt: string,
  systemPrompt?: string,
  options?: { temperature?: number; maxTokens?: number }
): Promise<string | null> {
  const result = await askAI(userPrompt, systemPrompt, options);
  return result?.text ?? null;
}

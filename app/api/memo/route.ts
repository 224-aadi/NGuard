import { NextResponse } from "next/server";
import { validateInputs, computeNGuard, generateMemo } from "@/lib/nguard";

// Groq: free tier, no credit card, OpenAI-compatible API
// Sign up at https://console.groq.com → get free API key
const GROQ_API_KEY = process.env.GROQ_API_KEY ?? "";

/**
 * POST /api/memo
 *
 * Always generates a template-based compliance memo.
 * If GROQ_API_KEY is set in .env.local, enhances with Llama 3.3 70B (free).
 */
export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const inputs = validateInputs(raw);
    const outputs = computeNGuard(inputs);

    // 1. Template memo (always works, zero dependencies)
    const templateMemo = generateMemo(inputs, outputs);

    // 2. If Groq key is available, enhance with LLM
    if (GROQ_API_KEY) {
      try {
        const enhanced = await enhanceWithGroq(templateMemo, inputs, outputs);
        if (enhanced) {
          return NextResponse.json({
            memo: enhanced,
            source: "ai-enhanced",
          });
        }
      } catch {
        // LLM failed — fall through to template
      }
    }

    return NextResponse.json({
      memo: templateMemo,
      source: "template",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// ── Groq LLM Enhancement (free tier — Llama 3.3 70B) ────────────────────
async function enhanceWithGroq(
  templateMemo: string,
  inputs: { crop: string; soil: string; fertilizerForm: string },
  outputs: {
    riskCategory: string;
    leachingProb: number;
    varDollars: number;
    airborneFlag: string | null;
  }
): Promise<string | null> {
  const systemPrompt = `You are an agricultural compliance analyst specializing in nitrogen management and nutrient runoff risk assessment.

Your task: take the following template-generated nitrogen risk assessment memo and rewrite it into polished, professional prose. You MUST:
- Preserve ALL numerical values, calculations, cost breakdowns, and data EXACTLY as given
- Keep the economic breakdown table formatted exactly as-is
- Improve prose quality, flow, and professional tone
- Add relevant regulatory citations where appropriate (Clean Water Act, state nutrient management laws)
- Maintain the same section structure
- Make it suitable for a regulatory filing or compliance documentation

Output ONLY the rewritten memo text. No commentary, no preamble.`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      temperature: 0.3,
      max_tokens: 4000,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Here is the template memo to enhance:\n\n${templateMemo}\n\nContext:\n- Crop: ${inputs.crop}\n- Soil: ${inputs.soil}\n- Fertilizer: ${inputs.fertilizerForm}\n- Risk: ${outputs.riskCategory}\n- Leaching probability: ${(outputs.leachingProb * 100).toFixed(1)}%\n- VaR: $${outputs.varDollars.toFixed(2)}/acre\n- Airborne flag: ${outputs.airborneFlag || "none"}`,
        },
      ],
    }),
  });

  if (!res.ok) return null;

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  return content || null;
}

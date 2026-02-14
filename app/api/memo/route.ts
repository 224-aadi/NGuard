import { NextResponse } from "next/server";
import { validateInputs, computeNGuard, generateMemo } from "@/lib/nguard";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";

/**
 * POST /api/memo
 *
 * Always generates a template-based compliance memo.
 * If OPENAI_API_KEY is set, optionally enhances it with GPT-4o-mini
 * for more natural language and deeper regulatory analysis.
 */
export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const inputs = validateInputs(raw);
    const outputs = computeNGuard(inputs);

    // 1. Always generate the template memo (zero-dependency baseline)
    const templateMemo = generateMemo(inputs, outputs);

    // 2. If OpenAI key is available, enhance with LLM
    if (OPENAI_API_KEY) {
      try {
        const enhanced = await enhanceWithLLM(templateMemo, inputs, outputs);
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

// ── LLM Enhancement ──────────────────────────────────────────────────────
async function enhanceWithLLM(
  templateMemo: string,
  inputs: { crop: string; soil: string; fertilizerForm: string },
  outputs: { riskCategory: string; leachingProb: number; varDollars: number; airborneFlag: string | null },
): Promise<string | null> {
  const systemPrompt = `You are an agricultural compliance analyst writing for the California Regional Water Quality Control Board. You specialize in CV-SALTS and ILRP nitrogen management.

Your task: take the following template-generated compliance memo and rewrite it into polished, professional prose. Preserve ALL numerical values, calculations, and data exactly as given. Do not invent numbers. Improve:
- Prose quality and flow
- Regulatory citations (add relevant CA Water Code sections where appropriate)
- Professional tone suitable for a regulatory filing
- Clear section structure

Keep the same sections. Keep the economic breakdown table formatted exactly. Output only the memo text, no commentary.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 3000,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Here is the template memo to enhance:\n\n${templateMemo}\n\nAdditional context:\n- Crop: ${inputs.crop}\n- Soil: ${inputs.soil}\n- Fertilizer: ${inputs.fertilizerForm}\n- Risk: ${outputs.riskCategory}\n- Leaching probability: ${(outputs.leachingProb * 100).toFixed(1)}%\n- VaR: $${outputs.varDollars.toFixed(2)}/acre\n- Airborne flag: ${outputs.airborneFlag || "none"}`,
        },
      ],
    }),
  });

  if (!res.ok) return null;

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  return content || null;
}

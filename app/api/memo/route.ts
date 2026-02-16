import { NextResponse } from "next/server";
import { validateInputs, computeNGuard, generateMemo } from "@/lib/nguard";
import { GoogleGenerativeAI } from "@google/generative-ai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

/**
 * POST /api/memo
 *
 * Always generates a template-based compliance memo.
 * If GEMINI_API_KEY is set in .env.local, enhances with Gemini 1.5 Flash.
 */
export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const inputs = validateInputs(raw);
    const outputs = computeNGuard(inputs);

    // 1. Template memo (always works, zero dependencies)
    const templateMemo = generateMemo(inputs, outputs);

    // 2. If Gemini key is available, enhance with LLM
    if (GEMINI_API_KEY) {
      try {
        const enhanced = await enhanceWithGemini(templateMemo, inputs, outputs);
        if (enhanced) {
          return NextResponse.json({
            memo: enhanced,
            source: "ai-enhanced",
          });
        }
      } catch (error) {
        console.error("Gemini API Error:", error);
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

// ── Gemini LLM Enhancement ──────────────────────────────────────────────
async function enhanceWithGemini(
  templateMemo: string,
  inputs: { crop: string; soil: string; fertilizerForm: string },
  outputs: {
    riskCategory: string;
    leachingProb: number;
    varDollars: number;
    airborneFlag: string | null;
  }
): Promise<string | null> {
  // Use gemini-flash-latest for best free tier availability
  const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

  const systemPrompt = `You are an agricultural compliance analyst. Rewrite the provided memo into a professional Markdown document.

Your task: take the provided template-generated nitrogen risk assessment memo and rewrite it into a polished, professional document using Markdown formatting.

You MUST:
- Preserve ALL numerical values, calculations, and financial figures EXACTLY as given in the template. Do not recalculate.
- Use Markdown headers (###), bolding (**text**), and bullet points to improve readability.
- Maintain a professional, authoritative tone suitable for regulatory filing.
- Include a specific "Regulatory Context" section citing relevant frameworks (e.g., Nitrogen Management Plan guidelines).
- Keep the economic breakdown clear and easy to read.

Output ONLY the rewritten markdown text. Do not include any introductory or concluding remarks outside the report content.`;

  const userPrompt = `Here is the template memo to enhance: \n\n${templateMemo} \n\nContext: \n - Crop: ${inputs.crop} \n - Soil: ${inputs.soil} \n - Fertilizer: ${inputs.fertilizerForm} \n - Risk: ${outputs.riskCategory} \n - Leaching probability: ${(outputs.leachingProb * 100).toFixed(1)}%\n - VaR: $${outputs.varDollars.toFixed(2)}/acre`;

  const result = await model.generateContent([systemPrompt, userPrompt]);
  const response = await result.response;
  return response.text();
}

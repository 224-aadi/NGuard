import { NextResponse } from "next/server";
import { askAI, isAIAvailable } from "@/lib/gemini";

/**
 * POST /api/insights
 *
 * Takes the full calculation results + inputs + weather and returns
 * AI-generated analysis, recommendations, and risk interpretation.
 * Tries Gemini → Groq → template fallback.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { inputs, outputs, weather } = body;

    if (!inputs || !outputs) {
      return NextResponse.json({ error: "Missing inputs or outputs" }, { status: 400 });
    }

    const contextBlock = buildContext(inputs, outputs, weather);

    if (isAIAvailable()) {
      try {
        const result = await generateAIInsights(contextBlock);
        if (result) {
          return NextResponse.json({
            insights: result.text,
            source: result.provider,
          });
        }
      } catch {
        // AI failed — fall through to template
      }
    }

    return NextResponse.json({
      insights: generateTemplateInsights(inputs, outputs, weather),
      source: "template",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function buildContext(
  inputs: Record<string, unknown>,
  outputs: Record<string, unknown>,
  weather?: Record<string, unknown>
): string {
  return `FIELD PARAMETERS:
- Crop: ${inputs.crop}
- Planned Yield: ${inputs.plannedYield} tons/acre
- Field Size: ${inputs.acreage} acres
- Previous N Applied: ${inputs.prevN} lbs/acre
- Fertilizer: ${inputs.fertilizerForm}
- Soil: ${inputs.soil}
- Irrigation: ${inputs.irrigation}

LIVE WEATHER CONDITIONS:
- Location: ${weather?.locationName ?? "Unknown"}
- Temperature: ${weather?.tempC ?? "N/A"}°C
- Wind: ${weather?.windMph ?? "N/A"} mph
- Precipitation (48h): ${weather?.rainMm ?? "N/A"} mm
- Humidity: ${weather?.humidity ?? "N/A"}%

CALCULATION RESULTS:
- Base Nitrogen Demand: ${(outputs.baseN as number)?.toFixed?.(2) ?? outputs.baseN} lbs/acre
- Adjusted Nitrogen: ${(outputs.adjustedN as number)?.toFixed?.(2) ?? outputs.adjustedN} lbs/acre
- Leaching Probability: ${(((outputs.leachingProb as number) ?? 0) * 100).toFixed(1)}%
- Risk Category: ${outputs.riskCategory}
- Directive: ${outputs.directive}
- Airborne Risk Flag: ${outputs.airborneFlag ?? "None"}
- Monte Carlo p95 Rainfall: ${(outputs.p95Rainfall as number)?.toFixed?.(1) ?? outputs.p95Rainfall} mm
- VaR ($/acre): $${(outputs.varDollars as number)?.toFixed?.(2) ?? outputs.varDollars}
- Total Field Exposure: $${(outputs.totalFieldExposure as number)?.toFixed?.(2) ?? outputs.totalFieldExposure}
- N Loss at p95: ${(outputs.varNLoss95 as number)?.toFixed?.(2) ?? outputs.varNLoss95} lbs/acre`;
}

const SYSTEM_PROMPT = `You are an expert agricultural scientist and nitrogen management consultant. You analyze real-time field data, weather conditions, and nitrogen risk calculations to provide actionable insights to farmers.

Your analysis should be practical, specific, and data-driven. Reference the actual numbers provided. Write in clear, professional language that a farmer or farm manager can act on immediately.

Format your response in these sections using plain text (NOT markdown headers — use ALL CAPS with a line break):

RISK INTERPRETATION
(2-3 sentences interpreting what the risk level means for this specific field, crop, and conditions)

KEY CONCERNS
(Bullet points using "•" of the top 2-4 specific issues based on the data — soil + rain interaction, wind risk, etc.)

RECOMMENDED ACTIONS
(Numbered list of 3-5 specific, actionable steps the farmer should take right now)

TIMING GUIDANCE
(When to apply, when to delay, and what weather window to look for — be specific based on the forecast data)

COST-SAVING OPPORTUNITIES
(1-2 specific ways to reduce the VaR exposure based on the data — e.g. switching irrigation, splitting application, etc.)

Keep total response under 400 words. Be direct and useful, not generic.`;

async function generateAIInsights(context: string) {
  return askAI(
    `Analyze this nitrogen application scenario and provide actionable insights:\n\n${context}\n\nGive me your analysis.`,
    SYSTEM_PROMPT,
    { temperature: 0.4, maxTokens: 2048 }
  );
}

function generateTemplateInsights(
  inputs: Record<string, unknown>,
  outputs: Record<string, unknown>,
  weather?: Record<string, unknown>
): string {
  const risk = outputs.riskCategory as string;
  const leachProb = ((outputs.leachingProb as number) ?? 0) * 100;
  const airborne = outputs.airborneFlag as string | null;
  const rainMm = (weather?.rainMm as number) ?? 0;
  const windMph = (weather?.windMph as number) ?? 0;
  const varDollars = (outputs.varDollars as number) ?? 0;
  const adjustedN = (outputs.adjustedN as number) ?? 0;
  const crop = inputs.crop as string;
  const soil = inputs.soil as string;
  const irrigation = inputs.irrigation as string;

  let riskInterpretation: string;
  if (risk === "High Liability") {
    riskInterpretation = `Your ${crop} field is currently classified as HIGH LIABILITY with a ${leachProb.toFixed(1)}% leaching probability. Under these conditions, nitrogen application poses significant environmental and financial risk. Immediate action is required before proceeding.`;
  } else if (risk === "Moderate") {
    riskInterpretation = `Your ${crop} field shows MODERATE risk with a ${leachProb.toFixed(1)}% leaching probability. While not critical, current conditions warrant caution and a modified application strategy to reduce exposure.`;
  } else {
    riskInterpretation = `Your ${crop} field is classified as LOW RISK with a ${leachProb.toFixed(1)}% leaching probability. Current conditions are favorable for nitrogen application at the recommended rate of ${adjustedN.toFixed(1)} lbs/acre.`;
  }

  const concerns: string[] = [];
  if (rainMm > 20) concerns.push(`• Elevated precipitation forecast (${rainMm} mm in 48h) increases leaching risk on ${soil} soil`);
  if (windMph > 10) concerns.push(`• High wind speeds (${windMph} mph) increase airborne nitrogen loss risk`);
  if (leachProb > 50) concerns.push(`• Leaching probability above 50% — significant groundwater contamination risk`);
  if (airborne) concerns.push(`• ${airborne} — take immediate precautions`);
  if (irrigation === "Flood") concerns.push("• Flood irrigation multiplies leaching exposure — consider switching to drip");
  if (soil === "Sandy") concerns.push("• Sandy soil has low nitrogen retention — losses will be higher than average");
  if (concerns.length === 0) concerns.push("• No critical concerns identified under current conditions");

  const actions: string[] = [];
  if (risk === "High Liability") {
    actions.push("1. HALT all nitrogen application until conditions improve");
    actions.push("2. Implement split-application protocol (50/50) once conditions clear");
    actions.push("3. Monitor weather forecasts for a dry window of 48+ hours");
  } else if (risk === "Moderate") {
    actions.push("1. Delay application by 24-48 hours if rain is forecast");
    actions.push("2. Consider splitting application into two passes");
    actions.push("3. Monitor soil moisture before application");
  } else {
    actions.push("1. Proceed with planned application at the adjusted rate");
    actions.push("2. Apply during morning hours when wind is typically lowest");
    actions.push("3. Maintain standard monitoring and record-keeping");
  }

  return `RISK INTERPRETATION
${riskInterpretation}

KEY CONCERNS
${concerns.join("\n")}

RECOMMENDED ACTIONS
${actions.join("\n")}

TIMING GUIDANCE
${rainMm > 10 ? `With ${rainMm} mm of precipitation forecast, consider waiting for a dry window. Ideal application conditions: <5mm forecast rain, wind <8 mph, temperatures between 10-25°C.` : `Current precipitation levels (${rainMm} mm) are manageable. Apply during calm morning hours for best results.`}

COST-SAVING OPPORTUNITIES
${varDollars > 20 ? `Your per-acre VaR of $${varDollars.toFixed(2)} can be reduced by ${irrigation === "Flood" ? "switching to drip irrigation (reduces leaching multiplier by ~50%)" : "splitting the application into two passes to reduce single-event loss exposure"}.` : `Current exposure is relatively low at $${varDollars.toFixed(2)}/acre. Maintain current practices.`}`;
}

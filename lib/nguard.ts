// ═══════════════════════════════════════════════════════════════════════════
// N-Guard: Core Math Engine
// CV-SALTS / ILRP Nitrate Risk Mitigation Calculator
// ═══════════════════════════════════════════════════════════════════════════

// ── Constants ──────────────────────────────────────────────────────────────
export const CROP_COEFF: Record<string, number> = {
  Corn: 1.2,
  Wheat: 1.5,
  Almonds: 0.068,
  Lettuce: 1.8,
};

export const SOIL_RETENTION: Record<string, number> = {
  Clay: 0.85,
  Loam: 0.7,
  Sandy: 0.4,
};

export const IRRIGATION_MULTIPLIER: Record<string, number> = {
  Drip: 0.8,
  Sprinkler: 1.1,
  Flood: 1.5,
};

// ── Types ─────────────────────────────────────────────────────────────────
export interface NGuardInputs {
  crop: string;
  plannedYield: number;
  prevN: number;
  fertilizerForm: string; // "Liquid UAN (Spray)" | "Dry Urea (Broadcast)"
  soil: string;
  irrigation: string;
  ndvi: number;
  rainMm: number;
  tempC: number;
  windMph: number;
}

export interface NGuardOutputs {
  adjustedYield: number;
  baseN: number;
  leachingProb: number;
  airborneFlag: string | null;
  riskCategory: "Low" | "Moderate" | "High Liability";
  adjustedN: number;
  directive: string;
  varNLoss95: number;
  varDollars: number;
  p95Rainfall: number;
  rainSim: number[];
}

// ── Helpers ───────────────────────────────────────────────────────────────
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Box-Muller transform for normal random variate */
function normalRandom(mean: number, std: number): number {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return mean + z * std;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// ── Validation ────────────────────────────────────────────────────────────
export function validateInputs(raw: Record<string, unknown>): NGuardInputs {
  const crop = String(raw.crop ?? "Corn");
  if (!CROP_COEFF[crop]) throw new Error(`Unknown crop: ${crop}`);

  const soil = String(raw.soil ?? "Loam");
  if (!SOIL_RETENTION[soil]) throw new Error(`Unknown soil: ${soil}`);

  const irrigation = String(raw.irrigation ?? "Drip");
  if (!IRRIGATION_MULTIPLIER[irrigation])
    throw new Error(`Unknown irrigation: ${irrigation}`);

  const fertilizerForm = String(raw.fertilizerForm ?? "Liquid UAN (Spray)");
  if (
    fertilizerForm !== "Liquid UAN (Spray)" &&
    fertilizerForm !== "Dry Urea (Broadcast)"
  )
    throw new Error(`Unknown fertilizer form: ${fertilizerForm}`);

  const plannedYield = Math.max(0, Number(raw.plannedYield) || 0);
  const prevN = Math.max(0, Number(raw.prevN) || 0);
  const ndvi = clamp(Number(raw.ndvi) ?? 0.8, 0, 1);
  const rainMm = Math.max(0, Number(raw.rainMm) || 0);
  const tempC = Number(raw.tempC) || 0;
  const windMph = Math.max(0, Number(raw.windMph) || 0);

  return {
    crop,
    plannedYield,
    prevN,
    fertilizerForm,
    soil,
    irrigation,
    ndvi,
    rainMm,
    tempC,
    windMph,
  };
}

// ── Core Computation ──────────────────────────────────────────────────────
export function computeNGuard(inputs: NGuardInputs): NGuardOutputs {
  const { crop, plannedYield, prevN, fertilizerForm, soil, irrigation, ndvi, rainMm, tempC, windMph } = inputs;

  const cropCoef = CROP_COEFF[crop];
  const soilRet = SOIL_RETENTION[soil];
  const irrMult = IRRIGATION_MULTIPLIER[irrigation];

  // ── Sensing adjustment ───────────────────────────────────────────────
  const adjustedYield = ndvi < 0.5 ? plannedYield * 0.85 : plannedYield;

  // ── Base demand ──────────────────────────────────────────────────────
  const baseN = Math.max(0, adjustedYield * cropCoef - prevN * soilRet);

  // ── Leaching probability ─────────────────────────────────────────────
  const rawRisk = (1 - soilRet) * (rainMm * 0.5) * irrMult;
  const leachingProb = sigmoid(0.2 * (rawRisk - 15));

  // ── Airborne risk ────────────────────────────────────────────────────
  let airborneFlag: string | null = null;
  if (fertilizerForm === "Liquid UAN (Spray)" && windMph > 10) {
    airborneFlag = "High Drift Risk";
  } else if (
    fertilizerForm === "Dry Urea (Broadcast)" &&
    windMph > 8 &&
    tempC > 25 &&
    rainMm < 5
  ) {
    airborneFlag = "High Volatilization Risk";
  }

  // ── Risk category & adjusted N ───────────────────────────────────────
  let riskCategory: "Low" | "Moderate" | "High Liability";
  let adjustedN: number;
  let directive: string;

  if (leachingProb >= 0.7 || airborneFlag !== null) {
    riskCategory = "High Liability";
    adjustedN = baseN * 0.8;
    directive = "Mandatory split application / HALT";
  } else if (leachingProb >= 0.3) {
    riskCategory = "Moderate";
    adjustedN = baseN * 0.9;
    directive = "Delay or split 50/50";
  } else {
    riskCategory = "Low";
    adjustedN = baseN;
    directive = "Proceed as planned";
  }

  // ── Monte Carlo VaR ──────────────────────────────────────────────────
  const N_SIM = 1000;
  const rainSim: number[] = [];
  for (let i = 0; i < N_SIM; i++) {
    rainSim.push(Math.max(0, normalRandom(rainMm, 10)));
  }
  rainSim.sort((a, b) => a - b);

  const p95Index = Math.floor(N_SIM * 0.95);
  const p95Rainfall = rainSim[p95Index];

  // Compute leaching at p95 rainfall
  const rawRisk95 = (1 - soilRet) * (p95Rainfall * 0.5) * irrMult;
  const leachProb95 = sigmoid(0.2 * (rawRisk95 - 15));
  const varNLoss95 = adjustedN * leachProb95;
  const varDollars = varNLoss95 * 0.6;

  return {
    adjustedYield,
    baseN,
    leachingProb,
    airborneFlag,
    riskCategory,
    adjustedN,
    directive,
    varNLoss95,
    varDollars,
    p95Rainfall,
    rainSim,
  };
}

// ── Memo Generator ────────────────────────────────────────────────────────
export function generateMemo(
  inputs: NGuardInputs,
  outputs: NGuardOutputs
): string {
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const riskColor =
    outputs.riskCategory === "High Liability"
      ? "HIGH LIABILITY"
      : outputs.riskCategory === "Moderate"
      ? "MODERATE RISK"
      : "LOW RISK";

  return `NITROGEN APPLICATION COMPLIANCE MEMO
=====================================
Date: ${today}
To: California Regional Water Quality Control Board
From: N-Guard Automated Compliance System
Re: Nitrogen Management Risk Assessment — ${inputs.crop} Operation
Classification: ${riskColor}

---

EXECUTIVE SUMMARY

This memorandum presents the findings of an automated nitrogen risk assessment conducted under the Central Valley Salinity Alternatives for Long-Term Sustainability (CV-SALTS) and Irrigated Lands Regulatory Program (ILRP) framework. The analysis evaluates the planned nitrogen application for a ${inputs.crop} field with a target yield of ${inputs.plannedYield.toFixed(1)} units under current forecast and environmental conditions.

FIELD AND ENVIRONMENTAL CONDITIONS

The subject parcel is characterized by ${inputs.soil} soil (retention factor: ${SOIL_RETENTION[inputs.soil].toFixed(2)}) under ${inputs.irrigation} irrigation (system multiplier: ${IRRIGATION_MULTIPLIER[inputs.irrigation].toFixed(1)}x). Current Normalized Difference Vegetation Index (NDVI) remote sensing data indicates a canopy reflectance value of ${inputs.ndvi.toFixed(2)}.${inputs.ndvi < 0.5 ? " Because NDVI is below the 0.50 stress threshold, planned yield has been reduced by 15% to account for observed crop stress, resulting in an adjusted yield of " + outputs.adjustedYield.toFixed(1) + " units." : ""} The operator has reported ${inputs.prevN.toFixed(1)} lbs/acre of previously applied nitrogen using ${inputs.fertilizerForm}.

FORECAST CONDITIONS

Current meteorological forecasts indicate ${inputs.rainMm.toFixed(1)} mm of expected rainfall, ambient temperatures of ${inputs.tempC.toFixed(1)}°C, and wind speeds of ${inputs.windMph.toFixed(1)} mph. These parameters are critical inputs for both leaching probability estimation and airborne nitrogen loss risk evaluation.

NITROGEN DEMAND ANALYSIS

Based on crop-specific coefficients (${CROP_COEFF[inputs.crop]} lbs N per unit yield for ${inputs.crop}), the base nitrogen demand is calculated at ${outputs.baseN.toFixed(2)} lbs/acre. After applying risk-based adjustments for the assessed ${outputs.riskCategory} classification, the recommended adjusted nitrogen application rate is ${outputs.adjustedN.toFixed(2)} lbs/acre, representing a ${outputs.riskCategory === "Low" ? "0%" : outputs.riskCategory === "Moderate" ? "10%" : "20%"} reduction from baseline demand.

LEACHING RISK ASSESSMENT

The computed leaching probability is ${(outputs.leachingProb * 100).toFixed(1)}%, derived from the interaction of soil permeability (1 − ${SOIL_RETENTION[inputs.soil].toFixed(2)} = ${(1 - SOIL_RETENTION[inputs.soil]).toFixed(2)} loss fraction), forecast precipitation (${inputs.rainMm.toFixed(1)} mm), and irrigation system characteristics. This places the operation in the ${outputs.riskCategory} category under the N-Guard risk framework.

${outputs.airborneFlag ? `AIRBORNE NITROGEN RISK

WARNING: The assessment has identified a ${outputs.airborneFlag} condition. ${outputs.airborneFlag === "High Drift Risk" ? "The combination of Liquid UAN (Spray) application and wind speeds exceeding 10 mph creates an unacceptable risk of spray drift, potentially impacting adjacent parcels and water bodies." : "The combination of Dry Urea (Broadcast) application, elevated temperatures (>" + "25°C), high wind speeds (>8 mph), and minimal rainfall (<5 mm) creates conditions favorable for ammonia volatilization, leading to airborne nitrogen losses and potential air quality violations."} Immediate mitigation is required.

` : ""}MONTE CARLO VALUE-AT-RISK ANALYSIS

A 1,000-iteration Monte Carlo simulation was conducted to quantify financial exposure under rainfall variability (normal distribution, mean = ${inputs.rainMm.toFixed(1)} mm, σ = 10 mm). The 95th percentile rainfall scenario yields ${outputs.p95Rainfall.toFixed(1)} mm of precipitation. Under this stress scenario, the estimated nitrogen loss is ${outputs.varNLoss95.toFixed(2)} lbs/acre, translating to a Value-at-Risk (VaR) of $${outputs.varDollars.toFixed(2)}/acre at current nitrogen replacement costs ($0.60/lb).

COMPLIANCE DIRECTIVE

Based on the foregoing analysis, this operation is classified as: **${riskColor}**

Recommended action: **${outputs.directive}**

${outputs.riskCategory === "High Liability" ? "The operator MUST implement split application protocols or HALT all nitrogen application until conditions improve. Failure to comply may result in enforcement action under the ILRP and potential fines under the Porter-Cologne Water Quality Control Act." : outputs.riskCategory === "Moderate" ? "The operator is advised to delay application or implement a 50/50 split-application strategy to reduce leaching exposure. Continued monitoring of weather forecasts is recommended before proceeding." : "Current conditions support the planned nitrogen application. The operator should maintain standard record-keeping and monitoring protocols as required under the ILRP General Order."}

This assessment was generated by N-Guard v0.1.0, an automated compliance tool. Results should be verified by a certified Crop Adviser (CCA) or qualified agronomist before implementation.

---
N-Guard Automated Compliance System | CV-SALTS/ILRP Framework | ${today}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// N-Guard: Core Math Engine
// Agricultural Nitrogen Risk Analysis Calculator
// ═══════════════════════════════════════════════════════════════════════════

import {
  computeCostBreakdown,
  FERTILIZER_ECONOMICS,
  type CostBreakdown,
} from "./economics";

// ── Constants (yield in TONS) ────────────────────────────────────────────
// lbs N required per ton of crop yield
// Sources: UC Cooperative Extension, CDFA Nitrogen Management guidelines
export const CROP_COEFF: Record<string, number> = {
  Corn: 40,       // ~1.2 lbs N/bu × 33 bu/ton
  Wheat: 70,      // ~2.1 lbs N/bu × 33 bu/ton
  Almonds: 100,   // UC ANR Publication 3364
  Lettuce: 160,   // UC Davis Vegetable Research
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
  plannedYield: number;   // tons/acre
  acreage: number;        // total field acres
  prevN: number;          // lbs/acre previously applied
  fertilizerForm: string; // "Liquid UAN (Spray)" | "Dry Urea (Broadcast)"
  soil: string;
  irrigation: string;
  rainMm: number;
  tempC: number;
  windMph: number;
}

export interface NGuardOutputs {
  baseN: number;
  leachingProb: number;
  airborneFlag: string | null;
  riskCategory: "Low" | "Moderate" | "High Liability";
  adjustedN: number;
  directive: string;
  varDollars: number;          // per acre
  totalFieldExposure: number;  // varDollars × acreage
  costBreakdown: CostBreakdown;
}

// ── Helpers ───────────────────────────────────────────────────────────────
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function normalRandom(mean: number, std: number): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return mean + z * std;
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
  const acreage = Math.max(0, Number(raw.acreage) || 0);
  const prevN = Math.max(0, Number(raw.prevN) || 0);
  const rainMm = Math.max(0, Number(raw.rainMm) || 0);
  const tempC = Number(raw.tempC) || 0;
  const windMph = Math.max(0, Number(raw.windMph) || 0);

  return {
    crop,
    plannedYield,
    acreage,
    prevN,
    fertilizerForm,
    soil,
    irrigation,
    rainMm,
    tempC,
    windMph,
  };
}

// ── Core Computation ──────────────────────────────────────────────────────
export function computeNGuard(inputs: NGuardInputs): NGuardOutputs {
  const { crop, plannedYield, acreage, prevN, fertilizerForm, soil, irrigation, rainMm, tempC, windMph } = inputs;

  const cropCoef = CROP_COEFF[crop];
  const soilRet = SOIL_RETENTION[soil];
  const irrMult = IRRIGATION_MULTIPLIER[irrigation];

  // ── Base demand (lbs N / acre) ─────────────────────────────────────────
  // plannedYield is tons/acre, cropCoef is lbs N per ton
  const baseN = Math.max(0, plannedYield * cropCoef - prevN * soilRet);

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

  // ── Economic exposure ────────────────────────────────────────────────
  const varNLoss = adjustedN * leachingProb;

  const costBreakdown = computeCostBreakdown(fertilizerForm, varNLoss, leachingProb);
  const varDollars = costBreakdown.totalVarPerAcre;
  const totalFieldExposure = Math.round(varDollars * acreage * 100) / 100;

  return {
    baseN,
    leachingProb,
    airborneFlag,
    riskCategory,
    adjustedN,
    directive,
    varDollars,
    totalFieldExposure,
    costBreakdown,
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

  const cb = outputs.costBreakdown;
  const fert = FERTILIZER_ECONOMICS[inputs.fertilizerForm];

  const riskLabel =
    outputs.riskCategory === "High Liability"
      ? "HIGH LIABILITY"
      : outputs.riskCategory === "Moderate"
      ? "MODERATE RISK"
      : "LOW RISK";

  return `NITROGEN APPLICATION RISK ASSESSMENT
=====================================
Date: ${today}
Prepared by: N-Guard Automated Analysis System
Re: Nitrogen Management Risk Assessment — ${inputs.crop} Operation (${inputs.acreage.toFixed(0)} acres)
Classification: ${riskLabel}

---

EXECUTIVE SUMMARY

This report presents the findings of an automated nitrogen risk assessment for agricultural compliance and nutrient management planning. The analysis evaluates the planned nitrogen application for a ${inputs.acreage.toFixed(0)}-acre ${inputs.crop} field with a target yield of ${inputs.plannedYield.toFixed(1)} tons/acre under current forecast and environmental conditions.

FIELD AND ENVIRONMENTAL CONDITIONS

The subject parcel comprises ${inputs.acreage.toFixed(0)} acres characterized by ${inputs.soil} soil (retention factor: ${SOIL_RETENTION[inputs.soil].toFixed(2)}) under ${inputs.irrigation} irrigation (system multiplier: ${IRRIGATION_MULTIPLIER[inputs.irrigation].toFixed(1)}x). The operator has reported ${inputs.prevN.toFixed(1)} lbs/acre of previously applied nitrogen using ${inputs.fertilizerForm}.

FORECAST CONDITIONS

Live meteorological data indicates ${inputs.rainMm.toFixed(1)} mm of forecast precipitation (48h), ambient temperatures of ${inputs.tempC.toFixed(1)}°C, and wind speeds of ${inputs.windMph.toFixed(1)} mph. These parameters are critical inputs for both leaching probability estimation and airborne nitrogen loss risk evaluation. Weather data sourced from Open-Meteo API in real time.

NITROGEN DEMAND ANALYSIS

Based on crop-specific coefficients (${CROP_COEFF[inputs.crop]} lbs N per ton of yield for ${inputs.crop}), the base nitrogen demand is calculated at ${outputs.baseN.toFixed(2)} lbs/acre. After applying risk-based adjustments for the assessed ${outputs.riskCategory} classification, the recommended adjusted nitrogen application rate is ${outputs.adjustedN.toFixed(2)} lbs/acre, representing a ${outputs.riskCategory === "Low" ? "0%" : outputs.riskCategory === "Moderate" ? "10%" : "20%"} reduction from baseline demand.

Total field nitrogen requirement: ${(outputs.adjustedN * inputs.acreage).toFixed(0)} lbs across ${inputs.acreage.toFixed(0)} acres.

LEACHING RISK ASSESSMENT

The computed leaching probability is ${(outputs.leachingProb * 100).toFixed(1)}%, derived from the interaction of soil permeability (1 − ${SOIL_RETENTION[inputs.soil].toFixed(2)} = ${(1 - SOIL_RETENTION[inputs.soil]).toFixed(2)} loss fraction), forecast precipitation (${inputs.rainMm.toFixed(1)} mm), and irrigation system characteristics. This places the operation in the ${outputs.riskCategory} category under the N-Guard risk framework.

${outputs.airborneFlag ? `AIRBORNE NITROGEN RISK

WARNING: The assessment has identified a ${outputs.airborneFlag} condition. ${outputs.airborneFlag === "High Drift Risk" ? "The combination of Liquid UAN (Spray) application and wind speeds exceeding 10 mph creates an unacceptable risk of spray drift, potentially impacting adjacent parcels and water bodies." : "The combination of Dry Urea (Broadcast) application, elevated temperatures (>25°C), high wind speeds (>8 mph), and minimal rainfall (<5 mm) creates conditions favorable for ammonia volatilization, leading to airborne nitrogen losses and potential air quality violations."} Immediate mitigation is required.

` : ""}ECONOMIC EXPOSURE BREAKDOWN

  Fertilizer product:      ${fert?.productName ?? inputs.fertilizerForm}
  N content:               ${((fert?.nContentPct ?? 0.32) * 100).toFixed(0)}%
  Market price:            $${(fert?.pricePerTon ?? 320).toFixed(0)}/ton (${cb.fertilizerSource})
  Cost per lb N:           $${cb.costPerLbN.toFixed(2)}/lb

  N lost:                  ${cb.nLossLbs.toFixed(2)} lbs/acre
  Replacement cost:        $${cb.replacementCost.toFixed(2)}/acre  (${cb.nLossLbs.toFixed(2)} lbs × $${cb.costPerLbN.toFixed(2)}/lb)
  Re-application cost:     $${cb.reapplicationCost.toFixed(2)}/acre  (custom rate, ${fert?.productName ?? "broadcast"})
  Regulatory exposure:     $${cb.regulatoryExposure.toFixed(2)}/acre  (expected penalty, ${cb.regulatorySource})
  ─────────────────────────────────────
  PER-ACRE EXPOSURE:       $${cb.totalVarPerAcre.toFixed(2)}/acre
  TOTAL FIELD EXPOSURE:    $${outputs.totalFieldExposure.toFixed(2)} (${inputs.acreage.toFixed(0)} acres × $${cb.totalVarPerAcre.toFixed(2)}/acre)

RECOMMENDED ACTION

Based on the foregoing analysis, this operation is classified as: **${riskLabel}**

Directive: **${outputs.directive}**

${outputs.riskCategory === "High Liability" ? "The operator MUST implement split application protocols or HALT all nitrogen application until conditions improve. Failure to comply may result in enforcement action under applicable water quality regulations, with potential penalties up to $10,000/day per violation under the Clean Water Act and state nutrient management laws." : outputs.riskCategory === "Moderate" ? "The operator is advised to delay application or implement a 50/50 split-application strategy to reduce leaching exposure. Continued monitoring of weather forecasts is recommended before proceeding." : "Current conditions support the planned nitrogen application. The operator should maintain standard record-keeping and monitoring protocols as required under applicable nutrient management regulations."}

DATA SOURCES

• Fertilizer pricing: ${cb.fertilizerSource}
• Regulatory framework: ${cb.regulatorySource}
• Weather data: Open-Meteo API (open-meteo.com), live forecast at time of analysis
• Crop N coefficients: University extension guidelines (lbs N per ton yield)

This assessment was generated by N-Guard v1.0, an automated nitrogen risk analysis tool. Results should be verified by a certified Crop Adviser (CCA) or qualified agronomist before implementation.

---
N-Guard Automated Analysis System | ${today}`;
}

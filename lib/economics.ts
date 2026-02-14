// ═══════════════════════════════════════════════════════════════════════════
// N-Guard: Nitrogen Economics Engine
// Real cost-per-lb-N by fertilizer type, sourced from USDA/Illinois Extension
// ═══════════════════════════════════════════════════════════════════════════

/**
 * SOURCING NOTES (as of 2025):
 *
 * 1. Fertilizer product prices from USDA-AMS "Fertilizer Use and Prices"
 *    and Illinois Extension "Weekly Fertilizer Review"
 *    https://farmdocdaily.illinois.edu/
 *
 * 2. UAN-32 (32% N): market ~$290-350/ton → $0.45-0.55 per lb N
 *    Urea 46-0-0 (46% N): market ~$420-520/ton → $0.46-0.57 per lb N
 *
 * 3. Application cost: USDA-ERS custom rate surveys
 *    Liquid spray: ~$8-12/acre  |  Broadcast dry: ~$5-8/acre
 *
 * 4. California ILRP regulatory penalties:
 *    - Porter-Cologne Water Quality Control Act §13350:
 *      Up to $10,000/day per violation for waste discharge
 *    - CV-SALTS Nitrogen Management Plan violations:
 *      $1,000-$5,000 first offense, escalating
 *    - We model a probabilistic "expected penalty" = P(violation) × avg fine
 */

// ── Fertilizer price per lb of actual N ──────────────────────────────────
export interface FertilizerEconomics {
  productName: string;
  nContentPct: number;       // e.g. 0.32 for UAN-32
  pricePerTon: number;       // $/ton of product
  costPerLbN: number;        // derived: $/lb of actual N
  applicationCostPerAcre: number; // $/acre to apply
  source: string;
}

export const FERTILIZER_ECONOMICS: Record<string, FertilizerEconomics> = {
  "Liquid UAN (Spray)": {
    productName: "UAN-32 Solution",
    nContentPct: 0.32,
    pricePerTon: 320,        // mid-range 2024-25
    costPerLbN: 0.50,        // $320/ton ÷ 2000 lbs ÷ 0.32 = $0.50/lb N
    applicationCostPerAcre: 10.00,
    source: "USDA-AMS / Illinois Extension Weekly Fertilizer Review (2024-25 avg)",
  },
  "Dry Urea (Broadcast)": {
    productName: "Urea 46-0-0",
    nContentPct: 0.46,
    pricePerTon: 470,        // mid-range 2024-25
    costPerLbN: 0.51,        // $470/ton ÷ 2000 lbs ÷ 0.46 = $0.51/lb N
    applicationCostPerAcre: 6.50,
    source: "USDA-AMS / Illinois Extension Weekly Fertilizer Review (2024-25 avg)",
  },
};

// ── Regulatory penalty model ─────────────────────────────────────────────
export interface RegulatoryExposure {
  expectedPenaltyPerAcre: number;  // $/acre weighted by P(violation)
  maxPenaltyPerDay: number;
  framework: string;
  citation: string;
}

/**
 * Estimate expected regulatory penalty based on leaching probability.
 *
 * Logic:
 * - If leachingProb > 0.7 → "likely violation" → P(enforcement) ≈ 0.15
 * - If leachingProb 0.3-0.7 → "possible" → P(enforcement) ≈ 0.05
 * - If leachingProb < 0.3 → "unlikely" → P(enforcement) ≈ 0.005
 *
 * Average first-offense fine: $2,500 (CV-SALTS NMP violation)
 * Assume avg affected acreage per citation: 40 acres
 * Per-acre expected penalty = P(enforcement) × $2,500 / 40
 */
export function estimateRegulatoryExposure(leachingProb: number): RegulatoryExposure {
  let pEnforcement: number;
  if (leachingProb >= 0.7) {
    pEnforcement = 0.15;
  } else if (leachingProb >= 0.3) {
    pEnforcement = 0.05;
  } else {
    pEnforcement = 0.005;
  }

  const avgFine = 2500;
  const avgAcresPerCitation = 40;
  const expectedPenaltyPerAcre = (pEnforcement * avgFine) / avgAcresPerCitation;

  return {
    expectedPenaltyPerAcre: Math.round(expectedPenaltyPerAcre * 100) / 100,
    maxPenaltyPerDay: 10000,
    framework: "CV-SALTS / ILRP Nitrogen Management Plan",
    citation: "Cal. Water Code §13350; CV-SALTS Phase II NMP Requirements",
  };
}

// ── Full VaR cost breakdown ──────────────────────────────────────────────
export interface CostBreakdown {
  // Direct N replacement
  nLossLbs: number;           // lbs N lost at p95
  costPerLbN: number;         // $/lb from fertilizer type
  replacementCost: number;    // nLossLbs × costPerLbN

  // Application cost to re-apply
  reapplicationCost: number;

  // Regulatory
  regulatoryExposure: number;

  // Total
  totalVarPerAcre: number;

  // Sourcing
  fertilizerSource: string;
  regulatorySource: string;
}

export function computeCostBreakdown(
  fertilizerForm: string,
  varNLoss95: number,
  leachProb95: number,
): CostBreakdown {
  const fert = FERTILIZER_ECONOMICS[fertilizerForm] || FERTILIZER_ECONOMICS["Liquid UAN (Spray)"];
  const reg = estimateRegulatoryExposure(leachProb95);

  const replacementCost = varNLoss95 * fert.costPerLbN;
  const reapplicationCost = fert.applicationCostPerAcre * (varNLoss95 > 0 ? 1 : 0);
  const regulatoryExposure = reg.expectedPenaltyPerAcre;

  return {
    nLossLbs: varNLoss95,
    costPerLbN: fert.costPerLbN,
    replacementCost: Math.round(replacementCost * 100) / 100,
    reapplicationCost,
    regulatoryExposure,
    totalVarPerAcre:
      Math.round((replacementCost + reapplicationCost + regulatoryExposure) * 100) / 100,
    fertilizerSource: fert.source,
    regulatorySource: reg.citation,
  };
}

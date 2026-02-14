"use client";

import { useState, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────
interface FormState {
  crop: string;
  plannedYield: string;
  prevN: string;
  fertilizerForm: string;
  soil: string;
  irrigation: string;
  ndvi: number;
  rainMm: string;
  tempC: string;
  windMph: string;
}

interface CalcResult {
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

// ── Defaults ──────────────────────────────────────────────────────────────
const defaultForm: FormState = {
  crop: "Corn",
  plannedYield: "180",
  prevN: "40",
  fertilizerForm: "Liquid UAN (Spray)",
  soil: "Loam",
  irrigation: "Sprinkler",
  ndvi: 0.8,
  rainMm: "12",
  tempC: "20",
  windMph: "5",
};

// ── Histogram helper ──────────────────────────────────────────────────────
function buildHistogram(data: number[], bins: number) {
  if (data.length === 0) return [];
  const min = Math.min(...data);
  const max = Math.max(...data);
  const binWidth = (max - min) / bins || 1;
  const hist = Array.from({ length: bins }, (_, i) => ({
    binStart: min + i * binWidth,
    binLabel: (min + (i + 0.5) * binWidth).toFixed(1),
    count: 0,
  }));
  for (const v of data) {
    let idx = Math.floor((v - min) / binWidth);
    if (idx >= bins) idx = bins - 1;
    if (idx < 0) idx = 0;
    hist[idx].count++;
  }
  return hist;
}

// ═══════════════════════════════════════════════════════════════════════════
// Dashboard Component
// ═══════════════════════════════════════════════════════════════════════════
export default function Dashboard() {
  const [form, setForm] = useState<FormState>(defaultForm);
  const [result, setResult] = useState<CalcResult | null>(null);
  const [memo, setMemo] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [memoLoading, setMemoLoading] = useState(false);
  const [error, setError] = useState<string>("");

  // ── Input helpers ──────────────────────────────────────────────────────
  const set = useCallback(
    (key: keyof FormState, value: string | number) =>
      setForm((prev) => ({ ...prev, [key]: value })),
    []
  );

  const payload = useCallback(
    () => ({
      crop: form.crop,
      plannedYield: parseFloat(form.plannedYield) || 0,
      prevN: parseFloat(form.prevN) || 0,
      fertilizerForm: form.fertilizerForm,
      soil: form.soil,
      irrigation: form.irrigation,
      ndvi: form.ndvi,
      rainMm: parseFloat(form.rainMm) || 0,
      tempC: parseFloat(form.tempC) || 0,
      windMph: parseFloat(form.windMph) || 0,
    }),
    [form]
  );

  // ── Run Analysis ───────────────────────────────────────────────────────
  const runAnalysis = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/calc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Calculation failed");
      setResult(data as CalcResult);
      setMemo("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [payload]);

  // ── Generate Memo ──────────────────────────────────────────────────────
  const genMemo = useCallback(async () => {
    setMemoLoading(true);
    setError("");
    try {
      const res = await fetch("/api/memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Memo generation failed");
      setMemo(data.memo);
      // Also refresh the calc result so numbers are in sync
      const res2 = await fetch("/api/calc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const data2 = await res2.json();
      if (res2.ok) setResult(data2 as CalcResult);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setMemoLoading(false);
    }
  }, [payload]);

  // ── Export PDF ──────────────────────────────────────────────────────────
  const exportPDF = useCallback(() => window.print(), []);

  // ── Histogram data ─────────────────────────────────────────────────────
  const histData = result ? buildHistogram(result.rainSim, 30) : [];

  // ── Risk colour class ──────────────────────────────────────────────────
  const riskClass = result
    ? result.riskCategory === "High Liability"
      ? "risk-high"
      : result.riskCategory === "Moderate"
      ? "risk-moderate"
      : "risk-low"
    : "";

  // ═════════════════════════════════════════════════════════════════════════
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* ── Title ─────────────────────────────────────────────────────── */}
      <header className="mb-8 text-center no-print">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          🛡️ N-Guard: Forecast-Adjusted Nitrogen Compliance
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          CV-SALTS / ILRP Nitrate Risk Mitigation Engine
        </p>
      </header>

      {/* ── Input Panel (3-column) ────────────────────────────────────── */}
      <section className="no-print mb-8 grid gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-3">
        {/* Col 1: Field */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
            Field
          </h2>

          <label className="block">
            <span className="text-xs font-medium text-slate-600">Crop</span>
            <select
              value={form.crop}
              onChange={(e) => set("crop", e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option>Corn</option>
              <option>Wheat</option>
              <option>Almonds</option>
              <option>Lettuce</option>
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-600">
              Planned Yield (units)
            </span>
            <input
              type="number"
              min="0"
              value={form.plannedYield}
              onChange={(e) => set("plannedYield", e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-600">
              Previous N Applied (lbs/acre)
            </span>
            <input
              type="number"
              min="0"
              value={form.prevN}
              onChange={(e) => set("prevN", e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-600">
              Fertilizer Form
            </span>
            <select
              value={form.fertilizerForm}
              onChange={(e) => set("fertilizerForm", e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option>Liquid UAN (Spray)</option>
              <option>Dry Urea (Broadcast)</option>
            </select>
          </label>
        </div>

        {/* Col 2: Environment */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
            Environment
          </h2>

          <label className="block">
            <span className="text-xs font-medium text-slate-600">
              Soil Type
            </span>
            <select
              value={form.soil}
              onChange={(e) => set("soil", e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option>Clay</option>
              <option>Loam</option>
              <option>Sandy</option>
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-600">
              Irrigation
            </span>
            <select
              value={form.irrigation}
              onChange={(e) => set("irrigation", e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option>Drip</option>
              <option>Sprinkler</option>
              <option>Flood</option>
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-600">
              NDVI: {form.ndvi.toFixed(2)}
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={form.ndvi}
              onChange={(e) => set("ndvi", parseFloat(e.target.value))}
              className="mt-2 w-full accent-blue-600"
            />
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>0.00 (Bare)</span>
              <span>1.00 (Dense)</span>
            </div>
          </label>
        </div>

        {/* Col 3: Forecast */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
            Forecast
          </h2>

          <label className="block">
            <span className="text-xs font-medium text-slate-600">
              Rain (mm)
            </span>
            <input
              type="number"
              min="0"
              value={form.rainMm}
              onChange={(e) => set("rainMm", e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-600">
              Temperature (°C)
            </span>
            <input
              type="number"
              value={form.tempC}
              onChange={(e) => set("tempC", e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-600">
              Wind (mph)
            </span>
            <input
              type="number"
              min="0"
              value={form.windMph}
              onChange={(e) => set("windMph", e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </label>
        </div>
      </section>

      {/* ── Buttons ───────────────────────────────────────────────────── */}
      <div className="no-print mb-8 flex flex-wrap gap-3 justify-center">
        <button
          onClick={runAnalysis}
          disabled={loading}
          className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Computing..." : "Run Analysis"}
        </button>
        <button
          onClick={genMemo}
          disabled={memoLoading}
          className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {memoLoading ? "Generating..." : "Generate Compliance Memo"}
        </button>
        <button
          onClick={exportPDF}
          className="rounded-lg border border-slate-300 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          Export PDF
        </button>
      </div>

      {/* ── Error ─────────────────────────────────────────────────────── */}
      {error && (
        <div className="no-print mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Results ───────────────────────────────────────────────────── */}
      {result && (
        <div id="results-section">
          {/* Metric Cards */}
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="metric-card">
              <div className="label">Base N (lbs/acre)</div>
              <div className="value">{result.baseN.toFixed(2)}</div>
            </div>
            <div className="metric-card">
              <div className="label">Adjusted N (lbs/acre)</div>
              <div className="value text-blue-700">
                {result.adjustedN.toFixed(2)}
              </div>
            </div>
            <div className="metric-card">
              <div className="label">Leaching Probability</div>
              <div className="value">
                {(result.leachingProb * 100).toFixed(1)}%
              </div>
            </div>
            <div className="metric-card">
              <div className="label">VaR 95% ($/acre)</div>
              <div className="value text-amber-700">
                ${result.varDollars.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Risk Banner */}
          <div
            className={`mb-6 rounded-xl p-5 shadow-md ${riskClass}`}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="text-lg font-extrabold uppercase tracking-wide">
                  {result.riskCategory}
                </span>
                <p className="mt-1 text-sm font-medium opacity-90">
                  {result.directive}
                </p>
              </div>
              {result.airborneFlag && (
                <div className="rounded-lg bg-white/20 px-4 py-2 text-sm font-bold backdrop-blur">
                  ⚠️ {result.airborneFlag}
                </div>
              )}
            </div>
          </div>

          {/* Histogram */}
          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-400">
              Monte Carlo Rainfall Simulation (1,000 iterations)
            </h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={histData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                <XAxis
                  dataKey="binLabel"
                  tick={{ fontSize: 10 }}
                  label={{
                    value: "Rainfall (mm)",
                    position: "insideBottom",
                    offset: -10,
                    style: { fontSize: 11, fill: "#64748b" },
                  }}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  label={{
                    value: "Frequency",
                    angle: -90,
                    position: "insideLeft",
                    offset: 10,
                    style: { fontSize: 11, fill: "#64748b" },
                  }}
                />
                <Tooltip
                  formatter={(val: number) => [val, "Count"]}
                  labelFormatter={(l) => `~${l} mm`}
                />
                <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                  {histData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={
                        parseFloat(entry.binLabel) >= result.p95Rainfall
                          ? "#ef4444"
                          : "#3b82f6"
                      }
                    />
                  ))}
                </Bar>
                <ReferenceLine
                  x={histData.find(
                    (h) => parseFloat(h.binLabel) >= result.p95Rainfall
                  )?.binLabel}
                  stroke="#dc2626"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  label={{
                    value: `p95 = ${result.p95Rainfall.toFixed(1)} mm`,
                    position: "top",
                    style: {
                      fontSize: 11,
                      fontWeight: 700,
                      fill: "#dc2626",
                    },
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Memo Panel ────────────────────────────────────────────────── */}
      {memo && (
        <div className="memo-panel" id="memo-section">
          {memo}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
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

const LocationMap = dynamic(() => import("@/components/LocationMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400">
      Loading map...
    </div>
  ),
});

// ── Types ─────────────────────────────────────────────────────────────────
interface FormState {
  crop: string;
  plannedYield: string;  // tons/acre
  acreage: string;       // total field acres
  prevN: string;
  fertilizerForm: string;
  soil: string;
  irrigation: string;
}

interface CostBreakdown {
  nLossLbs: number;
  costPerLbN: number;
  replacementCost: number;
  reapplicationCost: number;
  regulatoryExposure: number;
  totalVarPerAcre: number;
  fertilizerSource: string;
  regulatorySource: string;
}

interface CalcResult {
  baseN: number;
  leachingProb: number;
  airborneFlag: string | null;
  riskCategory: "Low" | "Moderate" | "High Liability";
  adjustedN: number;
  directive: string;
  varNLoss95: number;
  varDollars: number;
  totalFieldExposure: number;
  p95Rainfall: number;
  leachProb95: number;
  rainSim: number[];
  costBreakdown: CostBreakdown;
}

interface WeatherInfo {
  latitude: number;
  longitude: number;
  locationName: string;
  rainMm: number;
  tempC: number;
  windMph: number;
  humidity: number;
  fetchedAt: string;
}

// ── Defaults ──────────────────────────────────────────────────────────────
const defaultForm: FormState = {
  crop: "Corn",
  plannedYield: "5",
  acreage: "80",
  prevN: "40",
  fertilizerForm: "Liquid UAN (Spray)",
  soil: "Loam",
  irrigation: "Sprinkler",
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
export default function Dashboard() {
  const [form, setForm] = useState<FormState>(defaultForm);
  const [result, setResult] = useState<CalcResult | null>(null);
  const [memo, setMemo] = useState<string>("");
  const [memoSource, setMemoSource] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [memoLoading, setMemoLoading] = useState(false);
  const [error, setError] = useState<string>("");

  // ── Weather & location ─────────────────────────────────────────────────
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");
  const [cityInput, setCityInput] = useState("");
  const [stateInput, setStateInput] = useState("");
  const [locationStatus, setLocationStatus] = useState<string>("Detecting location...");
  const [coords, setCoords] = useState<{ lat: number; lon: number }>({ lat: 36.7378, lon: -119.7871 });
  const autoRanRef = useRef(false);

  // ── Helpers ────────────────────────────────────────────────────────────
  const set = useCallback(
    (key: keyof FormState, value: string) =>
      setForm((prev) => ({ ...prev, [key]: value })),
    []
  );

  // Build API payload — merges form fields + live weather data
  const payload = useCallback(
    () => ({
      crop: form.crop,
      plannedYield: parseFloat(form.plannedYield) || 0,
      acreage: parseFloat(form.acreage) || 0,
      prevN: parseFloat(form.prevN) || 0,
      fertilizerForm: form.fertilizerForm,
      soil: form.soil,
      irrigation: form.irrigation,
      rainMm: weather?.rainMm ?? 0,
      tempC: weather?.tempC ?? 20,
      windMph: weather?.windMph ?? 0,
    }),
    [form, weather]
  );

  // ── Weather fetch ──────────────────────────────────────────────────────
  const fetchWeatherByCoords = useCallback(async (lat: number, lon: number) => {
    setWeatherLoading(true);
    setWeatherError("");
    setCoords({ lat, lon });
    try {
      const res = await fetch("/api/weather", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lon }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Weather fetch failed");
      setWeather(data as WeatherInfo);
      setCoords({ lat: data.latitude, lon: data.longitude });
      setLocationStatus(data.locationName || `${lat.toFixed(2)}, ${lon.toFixed(2)}`);
    } catch (e: unknown) {
      setWeatherError(e instanceof Error ? e.message : "Weather fetch failed");
      setLocationStatus("Weather unavailable");
    } finally {
      setWeatherLoading(false);
    }
  }, []);

  const fetchWeatherByCity = useCallback(async (city: string, state: string) => {
    const query = [city, state].filter(Boolean).join(", ");
    if (!query.trim()) return;
    setWeatherLoading(true);
    setWeatherError("");
    try {
      const res = await fetch("/api/weather", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: query }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Weather fetch failed");
      setWeather(data as WeatherInfo);
      setCoords({ lat: data.latitude, lon: data.longitude });
      setLocationStatus(data.locationName || query);
    } catch (e: unknown) {
      setWeatherError(e instanceof Error ? e.message : "Weather fetch failed");
      setLocationStatus("Weather unavailable");
    } finally {
      setWeatherLoading(false);
    }
  }, []);

  // ── Auto-detect on mount ───────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationStatus("Geolocation not supported — enter city below");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => fetchWeatherByCoords(pos.coords.latitude, pos.coords.longitude),
      () => {
        setLocationStatus("Location denied — using default");
        fetchWeatherByCoords(36.7378, -119.7871);
      },
      { timeout: 8000 }
    );
  }, [fetchWeatherByCoords]);

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

  // ── Auto-run once weather arrives ──────────────────────────────────────
  useEffect(() => {
    if (weather && !autoRanRef.current) {
      autoRanRef.current = true;
      const t = setTimeout(() => runAnalysis(), 300);
      return () => clearTimeout(t);
    }
  }, [weather, runAnalysis]);

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
      setMemoSource(data.source || "template");
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

  const exportPDF = useCallback(() => window.print(), []);

  // ── Map click → fetch weather at clicked point ─────────────────────────
  const handleMapClick = useCallback(
    (clickLat: number, clickLon: number) => {
      fetchWeatherByCoords(clickLat, clickLon);
    },
    [fetchWeatherByCoords]
  );

  const histData = result ? buildHistogram(result.rainSim, 30) : [];
  const riskClass = result
    ? result.riskCategory === "High Liability"
      ? "risk-high"
      : result.riskCategory === "Moderate"
      ? "risk-moderate"
      : "risk-low"
    : "";

  const inputClass = "mt-1 block w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500";

  // ═════════════════════════════════════════════════════════════════════════
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* ── Title ─────────────────────────────────────────────────────── */}
      <header className="mb-6 text-center no-print">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          🛡️ N-Guard: Nitrogen Risk Analysis
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Agricultural Nitrogen Management & Compliance Engine
        </p>
      </header>

      {/* ── Location / Weather Bar + Map ─────────────────────────────── */}
      <div className="no-print mb-6 grid gap-4 md:grid-cols-[1fr_280px]">
        <div className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-sky-50 p-4 shadow-sm">
          <div className="flex flex-col gap-3">
            {/* Live weather readout */}
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-lg">📍</span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-700 truncate">
                  {weatherLoading ? "Fetching forecast..." : locationStatus}
                </div>
                {weather && (
                  <div className="text-xs text-slate-500">
                    Live: {weather.tempC}°C · {weather.windMph} mph wind · {weather.rainMm} mm rain (48h) · {weather.humidity}% humidity
                    <span className="ml-2 text-slate-400">
                      Updated {new Date(weather.fetchedAt).toLocaleTimeString()}
                    </span>
                  </div>
                )}
                {weatherError && (
                  <div className="text-xs text-red-500">{weatherError}</div>
                )}
              </div>
            </div>

            {/* City + State search */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="City (e.g. Davis, Paris, Tokyo)"
                value={cityInput}
                onChange={(e) => setCityInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") fetchWeatherByCity(cityInput, stateInput);
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm flex-1 focus:border-blue-500 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="State / Country (optional)"
                value={stateInput}
                onChange={(e) => setStateInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") fetchWeatherByCity(cityInput, stateInput);
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm w-44 focus:border-blue-500 focus:ring-blue-500"
              />
              <button
                onClick={() => fetchWeatherByCity(cityInput, stateInput)}
                disabled={weatherLoading || !cityInput.trim()}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                {weatherLoading ? "..." : "Fetch"}
              </button>
              <button
                onClick={() => {
                  navigator.geolocation?.getCurrentPosition(
                    (pos) => fetchWeatherByCoords(pos.coords.latitude, pos.coords.longitude),
                    () => setWeatherError("Location access denied")
                  );
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                title="Use my location"
              >
                📍 GPS
              </button>
            </div>

            <div className="text-[10px] text-slate-400">
              {coords.lat.toFixed(4)}, {coords.lon.toFixed(4)} · Type a city, use GPS, or click/drag on the map
            </div>
          </div>
        </div>

        {/* Map — click anywhere to select a location */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden" style={{ minHeight: "240px" }}>
          <LocationMap
            lat={coords.lat}
            lon={coords.lon}
            locationName={locationStatus}
            onMapClick={handleMapClick}
          />
        </div>
      </div>

      {/* ── Input Panel (2-column: Field + Environment) ───────────────── */}
      <section className="no-print mb-8 grid gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
        {/* Col 1: Field */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
            Field
          </h2>

          <label className="block">
            <span className="text-xs font-medium text-slate-600">Crop</span>
            <select value={form.crop} onChange={(e) => set("crop", e.target.value)} className={inputClass}>
              <option>Corn</option>
              <option>Wheat</option>
              <option>Almonds</option>
              <option>Lettuce</option>
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">
                Planned Yield (tons/acre)
              </span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={form.plannedYield}
                onChange={(e) => set("plannedYield", e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">
                Field Size (acres)
              </span>
              <input
                type="number"
                min="0"
                step="1"
                value={form.acreage}
                onChange={(e) => set("acreage", e.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-slate-600">
              Previous N Applied (lbs/acre)
            </span>
            <input
              type="number"
              min="0"
              value={form.prevN}
              onChange={(e) => set("prevN", e.target.value)}
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-600">Fertilizer Form</span>
            <select value={form.fertilizerForm} onChange={(e) => set("fertilizerForm", e.target.value)} className={inputClass}>
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
            <span className="text-xs font-medium text-slate-600">Soil Type</span>
            <select value={form.soil} onChange={(e) => set("soil", e.target.value)} className={inputClass}>
              <option>Clay</option>
              <option>Loam</option>
              <option>Sandy</option>
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-600">Irrigation</span>
            <select value={form.irrigation} onChange={(e) => set("irrigation", e.target.value)} className={inputClass}>
              <option>Drip</option>
              <option>Sprinkler</option>
              <option>Flood</option>
            </select>
          </label>

          {/* Live weather summary (read-only) */}
          {weather && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3">
              <div className="mb-1 text-[10px] font-semibold uppercase text-green-600">
                Live Forecast (auto-fetched)
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <div className="text-[10px] text-green-500">Rain (48h)</div>
                  <div className="font-bold text-slate-800">{weather.rainMm} mm</div>
                </div>
                <div>
                  <div className="text-[10px] text-green-500">Temp</div>
                  <div className="font-bold text-slate-800">{weather.tempC}°C</div>
                </div>
                <div>
                  <div className="text-[10px] text-green-500">Wind</div>
                  <div className="font-bold text-slate-800">{weather.windMph} mph</div>
                </div>
              </div>
            </div>
          )}
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
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="metric-card">
              <div className="label">Base N (lbs/acre)</div>
              <div className="value">{result.baseN.toFixed(2)}</div>
            </div>
            <div className="metric-card">
              <div className="label">Adjusted N (lbs/acre)</div>
              <div className="value text-blue-700">{result.adjustedN.toFixed(2)}</div>
            </div>
            <div className="metric-card">
              <div className="label">Leaching Probability</div>
              <div className="value">{(result.leachingProb * 100).toFixed(1)}%</div>
            </div>
            <div className="metric-card">
              <div className="label">VaR 95% ($/acre)</div>
              <div className="value text-amber-700">${result.varDollars.toFixed(2)}</div>
            </div>
            <div className="metric-card">
              <div className="label">Total Field Exposure</div>
              <div className="value text-red-700">${result.totalFieldExposure.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{parseFloat(form.acreage) || 0} acres</div>
            </div>
          </div>

          {/* Cost Breakdown */}
          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-400">
              Economic Exposure Breakdown (95th percentile)
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-[10px] font-semibold uppercase text-slate-400">N Replacement</div>
                <div className="mt-1 text-lg font-bold text-slate-800">
                  ${result.costBreakdown.replacementCost.toFixed(2)}
                </div>
                <div className="text-[10px] text-slate-500">
                  {result.costBreakdown.nLossLbs.toFixed(1)} lbs × ${result.costBreakdown.costPerLbN.toFixed(2)}/lb
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-[10px] font-semibold uppercase text-slate-400">Re-Application</div>
                <div className="mt-1 text-lg font-bold text-slate-800">
                  ${result.costBreakdown.reapplicationCost.toFixed(2)}
                </div>
                <div className="text-[10px] text-slate-500">Custom rate survey</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-[10px] font-semibold uppercase text-slate-400">Regulatory Risk</div>
                <div className="mt-1 text-lg font-bold text-amber-700">
                  ${result.costBreakdown.regulatoryExposure.toFixed(2)}
                </div>
                <div className="text-[10px] text-slate-500">Expected penalty (regulatory)</div>
              </div>
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
                <div className="text-[10px] font-semibold uppercase text-blue-500">Per-Acre VaR</div>
                <div className="mt-1 text-lg font-extrabold text-blue-800">
                  ${result.costBreakdown.totalVarPerAcre.toFixed(2)}
                </div>
                <div className="text-[10px] text-blue-500">95th percentile</div>
              </div>
              <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                <div className="text-[10px] font-semibold uppercase text-red-500">Total Field</div>
                <div className="mt-1 text-lg font-extrabold text-red-800">
                  ${result.totalFieldExposure.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] text-red-500">{parseFloat(form.acreage) || 0} acres</div>
              </div>
            </div>
            <div className="mt-3 text-[10px] text-slate-400">
              Sources: {result.costBreakdown.fertilizerSource} · {result.costBreakdown.regulatorySource}
            </div>
          </div>

          {/* Risk Banner */}
          <div className={`mb-6 rounded-xl p-5 shadow-md ${riskClass}`}>
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
                  label={{ value: "Rainfall (mm)", position: "insideBottom", offset: -10, style: { fontSize: 11, fill: "#64748b" } }}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  label={{ value: "Frequency", angle: -90, position: "insideLeft", offset: 10, style: { fontSize: 11, fill: "#64748b" } }}
                />
                <Tooltip formatter={(val: number) => [val, "Count"]} labelFormatter={(l) => `~${l} mm`} />
                <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                  {histData.map((entry, i) => (
                    <Cell key={i} fill={parseFloat(entry.binLabel) >= result.p95Rainfall ? "#ef4444" : "#3b82f6"} />
                  ))}
                </Bar>
                <ReferenceLine
                  x={histData.find((h) => parseFloat(h.binLabel) >= result.p95Rainfall)?.binLabel}
                  stroke="#dc2626"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  label={{ value: `p95 = ${result.p95Rainfall.toFixed(1)} mm`, position: "top", style: { fontSize: 11, fontWeight: 700, fill: "#dc2626" } }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Memo Panel ────────────────────────────────────────────────── */}
      {memo && (
        <div id="memo-section">
          <div className="no-print mb-2 flex items-center gap-2">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
              Compliance Memo
            </h3>
            {memoSource === "ai-enhanced" ? (
              <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">
                AI-Enhanced
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                Template
              </span>
            )}
          </div>
          <div className="memo-panel">{memo}</div>
        </div>
      )}
    </div>
  );
}

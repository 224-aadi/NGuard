"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { FormState, CalcResult, WeatherInfo, StreamFeature, FieldFilesEstimate } from "./types";
import Header from "@/components/layout/Header";
import WeatherWidget from "@/components/dashboard/WeatherWidget";
import InputForm from "@/components/dashboard/InputForm";
import ResultsPanel from "@/components/dashboard/ResultsPanel";
import MemoPanel from "@/components/dashboard/MemoPanel";
import InsightsPanel from "@/components/dashboard/InsightsPanel";

const LocationMap = dynamic(() => import("@/components/LocationMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[300px] items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-400 border border-slate-100 animate-pulse">
      Loading map engine...
    </div>
  ),
});

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

export default function Dashboard() {
  const [form, setForm] = useState<FormState>(defaultForm);
  const [result, setResult] = useState<CalcResult | null>(null);
  const [memo, setMemo] = useState<string>("");
  const [memoSource, setMemoSource] = useState<string>("");
  const [insights, setInsights] = useState<string>("");
  const [insightsSource, setInsightsSource] = useState<string>("");
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [tiffFile, setTiffFile] = useState<File | null>(null);
  const [polygonFile, setPolygonFile] = useState<File | null>(null);
  const [fieldFilesLoading, setFieldFilesLoading] = useState(false);
  const [fieldFilesError, setFieldFilesError] = useState("");
  const [fieldFilesEstimate, setFieldFilesEstimate] = useState<FieldFilesEstimate | null>(null);
  const [loading, setLoading] = useState(false);
  const [memoLoading, setMemoLoading] = useState(false);
  const [error, setError] = useState<string>("");

  // ── Weather & location ─────────────────────────────────────────────────
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");
  const [locationStatus, setLocationStatus] = useState<string>("Waiting for field files...");
  const [coords, setCoords] = useState<{ lat: number; lon: number }>({ lat: 36.7378, lon: -119.7871 });
  const autoRanRef = useRef(false);

  // Streams / waterways lookup
  const [streams, setStreams] = useState<StreamFeature[]>([]);
  const [streamsLoading, setStreamsLoading] = useState(false);
  const runoffFraction = 0.3; // default fraction of leached N reaching surface water

  // ── Helpers ────────────────────────────────────────────────────────────
  const handleFormChange = useCallback(
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

  const processFieldFiles = useCallback(async () => {
    if (!tiffFile || !polygonFile) {
      setFieldFilesError("Please select both TIFF and polygon files.");
      return;
    }
    setFieldFilesLoading(true);
    setFieldFilesError("");
    setFieldFilesEstimate(null);
    try {
      const fd = new FormData();
      fd.append("tiffFile", tiffFile);
      fd.append("polygonFile", polygonFile);
      const res = await fetch("/api/field-area", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to process field files.");
      const estimate = data as FieldFilesEstimate;
      setFieldFilesEstimate(estimate);
      setForm((prev) => ({ ...prev, acreage: String(estimate.chosenAreaAcres) }));
      setCoords(estimate.centroid);
      setLocationStatus(`Derived from files (${estimate.centroid.lat.toFixed(4)}, ${estimate.centroid.lon.toFixed(4)})`);
      autoRanRef.current = false;
      await fetchWeatherByCoords(estimate.centroid.lat, estimate.centroid.lon);
    } catch (e: unknown) {
      setFieldFilesError(e instanceof Error ? e.message : "Failed to process field files.");
    } finally {
      setFieldFilesLoading(false);
    }
  }, [tiffFile, polygonFile, fetchWeatherByCoords]);

  // ── Run Analysis ───────────────────────────────────────────────────────
  const runAnalysis = useCallback(async () => {
    setLoading(true);
    setInsightsLoading(true);
    setError("");
    const payloadData = payload();
    try {
      const res = await fetch("/api/calc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Calculation failed");
      setResult(data as CalcResult);
      setMemo("");

      try {
        const insightsRes = await fetch("/api/insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inputs: payloadData,
            outputs: data,
            weather: weather ?? undefined,
          }),
        });
        const insightsData = await insightsRes.json();
        if (insightsRes.ok) {
          setInsights(insightsData.insights || "");
          setInsightsSource(insightsData.source || "template");
        } else {
          setInsights("");
          setInsightsSource("");
        }
      } catch {
        setInsights("");
        setInsightsSource("");
      }

      // smooth scroll to results
      setTimeout(() => {
        const el = document.getElementById("results-section");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);

    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
      setInsightsLoading(false);
    }
  }, [payload, weather]);

  // ── Auto-run once weather arrives ──────────────────────────────────────
  useEffect(() => {
    if (weather && !autoRanRef.current) {
      autoRanRef.current = true;
      const t = setTimeout(() => runAnalysis(), 300);
      return () => clearTimeout(t);
    }
  }, [weather, runAnalysis]);

  // Fetch nearby streams when we have a result and coords
  useEffect(() => {
    if (!result || !coords) return;
    let cancelled = false;
    (async () => {
      setStreamsLoading(true);
      try {
        const res = await fetch(`/api/streams?lat=${coords.lat}&lon=${coords.lon}&radius=5000`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Streams lookup failed');

        const features = data.features || [];
        const acreageVal = parseFloat(form.acreage) || 0;
        const totalLossLbs = (result.costBreakdown.nLossLbs || 0) * acreageVal;
        const runoffToSurface = totalLossLbs * runoffFraction;

        const weights = features.map((f: any) => 1 / (f.distanceMeters || 1));
        const sumW = weights.reduce((s: number, v: number) => s + v, 0) || 1;

        const annotated = features.map((f: any, i: number) => ({
          id: f.id,
          name: f.name || 'unnamed',
          distanceMeters: Math.round(f.distanceMeters),
          estNlbs: Math.round((runoffToSurface * (weights[i] / sumW)) * 100) / 100,
        }));

        if (!cancelled) setStreams(annotated);
      } catch (e: unknown) {
        setStreams([]);
      } finally {
        if (!cancelled) setStreamsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [result, coords, form.acreage, runoffFraction]);

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

      // smooth scroll to memo
      setTimeout(() => {
        const el = document.getElementById("memo-section");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);

    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setMemoLoading(false);
    }
  }, [payload]);

  return (
    <div className="min-h-screen bg-slate-50/50 pb-20">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

        <Header />

        {/* ── Top Section: Map & Weather ─────────────────────────────── */}
        <div className="no-print mb-8 grid gap-6 lg:grid-cols-[2fr_1fr]">
          {/* Map Column */}
          <div className="order-2 lg:order-1 h-[400px] rounded-xl border border-slate-200 shadow-sm overflow-hidden bg-white relative group">
            <LocationMap
              lat={coords.lat}
              lon={coords.lon}
              locationName={locationStatus}
              editable={false}
            />
            <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1 text-xs font-semibold rounded-md shadow-sm border border-slate-200 pointer-events-none">
              field_view_sat_v4
            </div>
            <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur px-3 py-1 text-[10px] text-slate-500 rounded-md shadow-sm border border-slate-200 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
              Center is derived from uploaded files
            </div>
          </div>

          {/* Weather Column */}
          <div className="order-1 lg:order-2">
            <WeatherWidget
              weather={weather}
              loading={weatherLoading}
              error={weatherError}
              locationStatus={locationStatus}
            />
          </div>
        </div>

        {/* ── Input Section ───────────────────────────────────────────── */}
        <div className="no-print mb-10">
          <InputForm
            form={form}
            onChange={handleFormChange}
            loading={loading}
            weather={weather}
            onRunAnalysis={runAnalysis}
            onGenerateMemo={genMemo}
            memoLoading={memoLoading}
            tiffFileName={tiffFile?.name || ""}
            polygonFileName={polygonFile?.name || ""}
            onTiffFileSelected={setTiffFile}
            onPolygonFileSelected={setPolygonFile}
            onProcessFieldFiles={processFieldFiles}
            fieldFilesLoading={fieldFilesLoading}
            fieldFilesEstimate={fieldFilesEstimate}
            fieldFilesError={fieldFilesError}
          />
        </div>

        {/* ── Error Banner ────────────────────────────────────────────── */}
        {error && (
          <div className="no-print mb-8 rounded-xl border border-red-200 bg-red-50 p-4 flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
            <div className="text-red-500">❌</div>
            <div className="text-sm font-medium text-red-700">{error}</div>
          </div>
        )}

        {/* ── Results & Memo ──────────────────────────────────────────── */}
        <div className="space-y-12">
          {result && (
            <ResultsPanel
              result={result}
              streams={streams}
              streamsLoading={streamsLoading}
              acreage={form.acreage}
              soil={form.soil}
              irrigation={form.irrigation}
              rainMm={weather?.rainMm ?? 0}
              windMph={weather?.windMph ?? 0}
            />
          )}

          {result && (
            <InsightsPanel
              insights={insights}
              source={insightsSource}
              loading={insightsLoading}
            />
          )}

          {memo && (
            <MemoPanel
              memo={memo}
              source={memoSource}
            />
          )}
        </div>

      </div>
    </div>
  );
}

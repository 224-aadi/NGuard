import React from "react";

interface InsightsPanelProps {
  insights: string;
  source: string;
  loading: boolean;
}

export default function InsightsPanel({ insights, source, loading }: InsightsPanelProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-2">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
          Actionable Suggestions
        </h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
          {source ? `Source: ${source}` : "Source: pending"}
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Generating recommendations...</p>
      ) : insights ? (
        <div className="whitespace-pre-line text-sm leading-6 text-slate-700">
          {insights}
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          Run analysis to get location-aware farming suggestions.
        </p>
      )}
    </div>
  );
}

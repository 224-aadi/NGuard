import React from 'react';
import { CalcResult, StreamFeature } from '@/app/types';

interface ResultsPanelProps {
    result: CalcResult;
    streams: StreamFeature[];
    streamsLoading: boolean;
    acreage: string;
    soil: string;
    irrigation: string;
    rainMm: number;
    windMph: number;
}

export default function ResultsPanel({
    result,
    streams,
    streamsLoading,
    acreage,
    soil,
    irrigation,
    rainMm,
    windMph,
}: ResultsPanelProps) {
    const riskClass = result.riskCategory === "High Liability"
        ? "risk-high"
        : result.riskCategory === "Moderate"
            ? "risk-moderate"
            : "risk-low";
    const enforcementProbability = result.leachingProb >= 0.7 ? 0.15 : result.leachingProb >= 0.3 ? 0.05 : 0.005;

    return (
        <div id="results-section" className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* Risk Banner */}
            <div className={`rounded-xl p-6 shadow-md ${riskClass} transition-all`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <div className="text-sm font-medium opacity-80 uppercase tracking-wide mb-1">
                            Risk Assessment
                        </div>
                        <div className="text-3xl font-extrabold uppercase tracking-tight">
                            {result.riskCategory}
                        </div>
                        <p className="mt-2 text-base font-medium opacity-95 max-w-2xl text-white/90">
                            {result.directive}
                        </p>
                    </div>
                    {result.airborneFlag && (
                        <div className="rounded-lg bg-white/20 px-4 py-3 text-sm font-bold backdrop-blur border border-white/30 text-white shadow-sm">
                            ⚠️ {result.airborneFlag}
                        </div>
                    )}
                </div>
            </div>

            {/* Metric Cards Grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div className="metric-card bg-white hover:border-blue-300 transition-colors">
                    <div className="label">N Likely Lost</div>
                    <div className="value text-red-600">{result.costBreakdown.nLossLbs.toFixed(2)} <span className="text-sm font-normal text-slate-400">lbs/acre</span></div>
                    <div className="text-[10px] text-slate-400 mt-1">Total: {(result.costBreakdown.nLossLbs * (parseFloat(acreage) || 0)).toFixed(0)} lbs</div>
                </div>
                <div className="metric-card bg-white hover:border-blue-300 transition-colors">
                    <div className="label">Crop Need (Base N)</div>
                    <div className="value text-slate-700">{result.baseN.toFixed(0)} <span className="text-sm font-normal text-slate-400">lbs/acre</span></div>
                </div>
                <div className="metric-card bg-white hover:border-blue-300 transition-colors">
                    <div className="label">Suggested N Rate</div>
                    <div className="value text-blue-600">{result.adjustedN.toFixed(0)} <span className="text-sm font-normal text-slate-400">lbs/acre</span></div>
                </div>
                <div className="metric-card bg-white hover:border-blue-300 transition-colors">
                    <div className="label">Loss Chance</div>
                    <div className="value text-slate-700">{(result.leachingProb * 100).toFixed(1)}%</div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2">
                        <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${result.leachingProb * 100}%` }}></div>
                    </div>
                </div>
                <div className="metric-card bg-white hover:border-blue-300 transition-colors">
                    <div className="label">Estimated Cost Risk</div>
                    <div className="value text-amber-600">${result.varDollars.toFixed(2)} <span className="text-sm font-normal text-slate-400">/acre</span></div>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Cost Breakdown */}
                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-2">
                        Cost Breakdown
                    </h3>
                    <div className="space-y-3">
                        <div className="flex justify-between items-center p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                            <div>
                                <div className="text-xs font-semibold text-slate-500 uppercase">Input Loss</div>
                                <div className="text-xs text-slate-400">{result.costBreakdown.nLossLbs.toFixed(1)} lbs × ${result.costBreakdown.costPerLbN.toFixed(2)}/lb</div>
                            </div>
                            <div className="text-lg font-bold text-slate-700">
                                ${result.costBreakdown.replacementCost.toFixed(2)}
                            </div>
                        </div>

                        <div className="flex justify-between items-center p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                            <div>
                                <div className="text-xs font-semibold text-slate-500 uppercase">Re-Application</div>
                                <div className="text-xs text-slate-400">Operational cost</div>
                            </div>
                            <div className="text-lg font-bold text-slate-700">
                                ${result.costBreakdown.reapplicationCost.toFixed(2)}
                            </div>
                        </div>

                        <div className="flex justify-between items-center p-3 rounded-lg bg-red-50 hover:bg-red-100 transition-colors border border-red-100">
                            <div>
                                <div className="text-xs font-semibold text-red-600 uppercase">Regulatory Risk</div>
                                <div className="text-xs text-red-400">Expected penalty cost</div>
                            </div>
                            <div className="text-lg font-bold text-red-700">
                                ${result.costBreakdown.regulatoryExposure.toFixed(2)}
                            </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-end">
                            <div>
                                <div className="text-xs font-bold text-slate-400 uppercase">Total Field Exposure</div>
                                <div className="text-xs text-slate-400">{parseFloat(acreage) || 0} acres</div>
                            </div>
                            <div className="text-2xl font-extrabold text-slate-800">
                                ${result.totalFieldExposure.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Nearby Streams */}
                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm h-full flex flex-col">
                    <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-2">
                        Environmental Impact
                    </h3>

                    {streamsLoading ? (
                        <div className="flex-1 flex items-center justify-center text-sm text-slate-400 italic">
                            <span className="animate-pulse">Scaning local waterways...</span>
                        </div>
                    ) : streams.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center p-4">
                            <div className="text-center text-slate-400 text-sm">
                                <div className="text-2xl mb-2">🌊</div>
                                No major waterways detected within 5km
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto max-h-[250px] space-y-2 pr-1 custom-scrollbar">
                            {streams.map((s) => (
                                <div key={s.id} className="group flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-3 hover:border-blue-200 hover:bg-blue-50 transition-colors">
                                    <div>
                                        <div className="text-sm font-semibold text-slate-700 group-hover:text-blue-700">{s.name}</div>
                                        <div className="text-[11px] text-slate-400 group-hover:text-blue-400">{(s.distanceMeters / 1000).toFixed(2)} km away</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm font-bold text-red-600">{(s.estNlbs || 0).toFixed(2)} lbs</div>
                                        <div className="text-[10px] text-red-400">Est. Runoff</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="mt-4 text-[10px] text-slate-400 italic">
                        *Estimates based on distance decay and surface runoff fractions.
                    </div>
                </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-6 shadow-sm">
                <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-amber-700 border-b border-amber-200 pb-2">
                    How Penalty Risk Is Estimated
                </h3>
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-lg border border-amber-200 bg-white p-4">
                        <p className="text-xs font-semibold text-amber-800 mb-2">Formula used</p>
                        <p className="text-sm text-slate-700">
                            Expected penalty per acre = Enforcement probability × $2,500 average fine ÷ 40 acres.
                        </p>
                        <p className="mt-3 text-xs text-slate-500">
                            Current enforcement probability: {(enforcementProbability * 100).toFixed(1)}%
                        </p>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-white p-4">
                        <p className="text-xs font-semibold text-amber-800 mb-2">What is driving this risk</p>
                        <ul className="space-y-1 text-sm text-slate-700">
                            <li>Leaching probability: {(result.leachingProb * 100).toFixed(1)}%</li>
                            <li>Rain forecast: {rainMm.toFixed(1)} mm (48h)</li>
                            <li>Soil type: {soil} (retention affects N movement)</li>
                            <li>Irrigation system: {irrigation}</li>
                            <li>Wind speed: {windMph.toFixed(1)} mph {result.airborneFlag ? `(airborne warning: ${result.airborneFlag})` : ""}</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}

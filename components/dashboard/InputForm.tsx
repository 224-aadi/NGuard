import React from 'react';
import { FormState, WeatherInfo } from '@/app/types';

interface InputFormProps {
    form: FormState;
    onChange: (key: keyof FormState, value: string) => void;
    loading: boolean;
    weather: WeatherInfo | null;
    onRunAnalysis: () => void;
    onGenerateMemo: () => void;
    memoLoading: boolean;
}

export default function InputForm({
    form,
    onChange,
    loading,
    weather,
    onRunAnalysis,
    onGenerateMemo,
    memoLoading,
}: InputFormProps) {
    const inputClass = "w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500 transition-colors";

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="grid gap-6 md:grid-cols-2">
                {/* Field Details */}
                <div className="space-y-4">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-2 mb-4">
                        Field Setup
                    </h2>

                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Crop</label>
                        <select
                            value={form.crop}
                            onChange={(e) => onChange("crop", e.target.value)}
                            className={inputClass}
                        >
                            <option>Corn</option>
                            <option>Wheat</option>
                            <option>Almonds</option>
                            <option>Lettuce</option>
                        </select>
                        <p className="text-[10px] text-slate-400 mt-1">
                            Choose the crop you are planning to fertilize.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Expected Yield (tons/acre)</label>
                            <input
                                type="number"
                                min="0"
                                step="0.1"
                                value={form.plannedYield}
                                onChange={(e) => onChange("plannedYield", e.target.value)}
                                className={inputClass}
                            />
                            <p className="text-[10px] text-slate-400 mt-1">
                                Expected harvest level for this field.
                            </p>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Field Area (acres)</label>
                            <input
                                type="number"
                                min="0"
                                step="1"
                                value={form.acreage}
                                onChange={(e) => onChange("acreage", e.target.value)}
                                className={inputClass}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Nitrogen Already Applied (lbs/acre)</label>
                        <input
                            type="number"
                            min="0"
                            value={form.prevN}
                            onChange={(e) => onChange("prevN", e.target.value)}
                            className={inputClass}
                        />
                        <p className="text-[10px] text-slate-400 mt-1">
                            Enter N already on the field before this decision.
                        </p>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Application Method</label>
                        <select
                            value={form.fertilizerForm}
                            onChange={(e) => onChange("fertilizerForm", e.target.value)}
                            className={inputClass}
                        >
                            <option>Liquid UAN (Spray)</option>
                            <option>Dry Urea (Broadcast)</option>
                        </select>
                    </div>
                </div>

                {/* Environmental Factors */}
                <div className="space-y-4">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-2 mb-4">
                        Field Conditions
                    </h2>

                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Soil</label>
                        <select
                            value={form.soil}
                            onChange={(e) => onChange("soil", e.target.value)}
                            className={inputClass}
                        >
                            <option>Clay</option>
                            <option>Loam</option>
                            <option>Sandy</option>
                        </select>
                        <p className="text-[10px] text-slate-400 mt-1">
                            Soil affects how quickly nitrogen moves downward.
                        </p>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Irrigation</label>
                        <select
                            value={form.irrigation}
                            onChange={(e) => onChange("irrigation", e.target.value)}
                            className={inputClass}
                        >
                            <option>Drip</option>
                            <option>Sprinkler</option>
                            <option>Flood</option>
                        </select>
                        <p className="text-[10px] text-slate-400 mt-1">
                            Water method changes runoff and loss risk.
                        </p>
                    </div>

                    {weather && (
                        <div className="mt-6 rounded-lg bg-green-50 border border-green-100 p-4">
                            <div className="flex items-center gap-2 mb-2 text-green-700 font-semibold text-sm">
                                <span>🌱 Live Weather Integration</span>
                            </div>
                            <p className="text-xs text-green-800 leading-relaxed">
                                Real-time weather data (rain: {weather.rainMm}mm) is included automatically in risk and penalty estimates.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-8 flex flex-wrap gap-4 pt-6 border-t border-slate-100">
                <button
                    onClick={onRunAnalysis}
                    disabled={loading}
                    className="flex-1 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 hover:shadow-md transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
                >
                    {loading ? (
                        <span className="flex items-center justify-center gap-2">
                            <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Running Analysis...
                        </span>
                    ) : (
                        "Calculate Risk + Cost"
                    )}
                </button>

                <button
                    onClick={onGenerateMemo}
                    disabled={memoLoading}
                    className="flex-1 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 hover:shadow-md transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
                >
                    {memoLoading ? "Generating Report..." : "Generate Compliance Memo"}
                </button>
            </div>
        </div>
    );
}

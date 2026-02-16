import React, { useState } from 'react';
import { WeatherInfo } from '@/app/types';

interface WeatherWidgetProps {
    weather: WeatherInfo | null;
    loading: boolean;
    error: string;
    locationStatus: string;
    onCitySearch: (city: string, state: string) => void;
    onGpsClick: () => void;
}

export default function WeatherWidget({
    weather,
    loading,
    error,
    locationStatus,
    onCitySearch,
    onGpsClick,
}: WeatherWidgetProps) {
    const [cityInput, setCityInput] = useState("");
    const [stateInput, setStateInput] = useState("");

    const handleSearch = () => {
        onCitySearch(cityInput, stateInput);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") handleSearch();
    };

    return (
        <div className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm h-full flex flex-col">
            <div className="flex items-start gap-4 mb-4">
                <div className="p-3 bg-blue-50 rounded-lg text-2xl">📍</div>
                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-1">
                        Location & Weather
                    </h3>
                    <div className="font-semibold text-slate-800 truncate text-lg">
                        {loading ? "Fetching forecast..." : locationStatus}
                    </div>
                    {weather && (
                        <div className="text-xs text-slate-500 mt-1">
                            Updated {new Date(weather.fetchedAt).toLocaleTimeString()}
                        </div>
                    )}
                    {error && <div className="text-sm text-red-600 mt-1">{error}</div>}
                </div>
            </div>

            {weather && (
                <div className="grid grid-cols-2 gap-4 mb-5 p-4 bg-slate-50 rounded-lg">
                    <div>
                        <div className="text-xs text-slate-500 uppercase font-semibold">Temperature</div>
                        <div className="text-xl font-bold text-slate-800">{weather.tempC}°C</div>
                    </div>
                    <div>
                        <div className="text-xs text-slate-500 uppercase font-semibold">Rain (48h)</div>
                        <div className="text-xl font-bold text-blue-600">{weather.rainMm} mm</div>
                    </div>
                    <div>
                        <div className="text-xs text-slate-500 uppercase font-semibold">Wind</div>
                        <div className="text-lg font-medium text-slate-700">{weather.windMph} mph</div>
                    </div>
                    <div>
                        <div className="text-xs text-slate-500 uppercase font-semibold">Humidity</div>
                        <div className="text-lg font-medium text-slate-700">{weather.humidity}%</div>
                    </div>
                </div>
            )}

            <div className="mt-auto">
                <div className="flex gap-2 mb-2">
                    <input
                        type="text"
                        placeholder="City"
                        value={cityInput}
                        onChange={(e) => setCityInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm flex-1 focus:border-blue-500 focus:ring-blue-500 outline-none transition-colors"
                    />
                    <input
                        type="text"
                        placeholder="State"
                        value={stateInput}
                        onChange={(e) => setStateInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm w-24 focus:border-blue-500 focus:ring-blue-500 outline-none transition-colors"
                    />
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleSearch}
                        disabled={loading || !cityInput.trim()}
                        className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? "Searching..." : "Search Location"}
                    </button>
                    <button
                        onClick={onGpsClick}
                        className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-blue-600"
                        title="Use my location"
                    >
                        GPS
                    </button>
                </div>
            </div>
        </div>
    );
}

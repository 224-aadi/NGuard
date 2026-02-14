// ═══════════════════════════════════════════════════════════════════════════
// Open-Meteo Weather Integration (free, no API key)
// + Nominatim reverse geocoding (free, no API key)
// ═══════════════════════════════════════════════════════════════════════════

export interface GeoResult {
  name: string;
  admin1?: string; // state / region
  country: string;
  latitude: number;
  longitude: number;
}

export interface WeatherData {
  latitude: number;
  longitude: number;
  locationName: string;
  rainMm: number;       // total precipitation forecast next 48 h (mm)
  tempC: number;        // current temperature (°C)
  windMph: number;      // current wind speed (mph)
  humidity: number;     // current relative humidity (%)
  fetchedAt: string;    // ISO timestamp
}

// ── Geocoding: city name → coordinates ────────────────────────────────────
// Priority: California > other US states > international
// This is a CV-SALTS tool — California results should always win.
export async function geocodeCity(query: string): Promise<GeoResult | null> {
  // Request more results so we have a good pool to pick from
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=10&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.results || data.results.length === 0) return null;

  const results = data.results as Array<{
    name: string;
    admin1?: string;
    country: string;
    country_code: string;
    latitude: number;
    longitude: number;
    population?: number;
  }>;

  // 1. Prefer California results (CV-SALTS context)
  const california = results.find(
    (r) => r.country_code === "US" && r.admin1 === "California"
  );
  if (california) {
    return {
      name: california.name,
      admin1: california.admin1,
      country: california.country,
      latitude: california.latitude,
      longitude: california.longitude,
    };
  }

  // 2. Prefer other Central Valley / western US ag states
  const agStates = ["Arizona", "Oregon", "Washington", "Nevada", "Idaho", "Colorado", "Texas"];
  const westernAg = results.find(
    (r) => r.country_code === "US" && agStates.includes(r.admin1 ?? "")
  );
  if (westernAg) {
    return {
      name: westernAg.name,
      admin1: westernAg.admin1,
      country: westernAg.country,
      latitude: westernAg.latitude,
      longitude: westernAg.longitude,
    };
  }

  // 3. Any US result
  const us = results.find((r) => r.country_code === "US");
  if (us) {
    return {
      name: us.name,
      admin1: us.admin1,
      country: us.country,
      latitude: us.latitude,
      longitude: us.longitude,
    };
  }

  // 4. Fallback: first result
  const first = results[0];
  return {
    name: first.name,
    admin1: first.admin1,
    country: first.country,
    latitude: first.latitude,
    longitude: first.longitude,
  };
}

// ── Reverse geocoding: coords → place name (Nominatim, free) ─────────────
export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10`;
    const res = await fetch(url, {
      headers: { "User-Agent": "NGuard-CV-SALTS/0.2 (compliance tool)" },
    });
    if (res.ok) {
      const data = await res.json();
      const addr = data.address;
      if (addr) {
        const city = addr.city || addr.town || addr.village || addr.county || "";
        const state = addr.state || "";
        const country = addr.country || "";
        return [city, state, country].filter(Boolean).join(", ");
      }
      if (data.display_name) return data.display_name;
    }
  } catch {
    // fallback below
  }
  return `${lat.toFixed(4)}°N, ${Math.abs(lon).toFixed(4)}°W`;
}

// ── Fetch current weather + 48h precipitation ─────────────────────────────
export async function fetchWeather(lat: number, lon: number, locationName?: string): Promise<WeatherData> {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation` +
    `&daily=precipitation_sum` +
    `&wind_speed_unit=mph` +
    `&timezone=auto` +
    `&forecast_days=2`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo API error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();

  const current = data.current;
  const daily = data.daily;

  const todayPrecip: number = daily?.precipitation_sum?.[0] ?? 0;
  const tomorrowPrecip: number = daily?.precipitation_sum?.[1] ?? 0;
  const forecastRain = todayPrecip + tomorrowPrecip;

  // If no location name given, reverse-geocode the coords
  let resolvedName = locationName;
  if (!resolvedName) {
    resolvedName = await reverseGeocode(lat, lon);
  }

  return {
    latitude: lat,
    longitude: lon,
    locationName: resolvedName || `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
    rainMm: Math.round(forecastRain * 10) / 10,
    tempC: Math.round((current?.temperature_2m ?? 20) * 10) / 10,
    windMph: Math.round((current?.wind_speed_10m ?? 0) * 10) / 10,
    humidity: Math.round(current?.relative_humidity_2m ?? 50),
    fetchedAt: new Date().toISOString(),
  };
}

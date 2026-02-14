import { NextResponse } from "next/server";
import { geocodeCity, fetchWeather } from "@/lib/weather";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { lat, lon, city } = body as {
      lat?: number;
      lon?: number;
      city?: string;
    };

    let latitude = lat;
    let longitude = lon;
    let locationName: string | undefined;

    // If city name provided, geocode first
    if (city && (!latitude || !longitude)) {
      const geo = await geocodeCity(city);
      if (!geo) {
        return NextResponse.json(
          { error: `Could not find location: ${city}` },
          { status: 404 }
        );
      }
      latitude = geo.latitude;
      longitude = geo.longitude;
      locationName = `${geo.name}${geo.admin1 ? ", " + geo.admin1 : ""}, ${geo.country}`;
    }

    if (latitude == null || longitude == null) {
      return NextResponse.json(
        { error: "Provide lat/lon or city name" },
        { status: 400 }
      );
    }

    const weather = await fetchWeather(latitude, longitude, locationName);
    return NextResponse.json(weather);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Weather fetch failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

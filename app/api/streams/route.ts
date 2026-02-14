import type { NextRequest } from 'next/server';

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371000; // meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const lat = parseFloat(url.searchParams.get('lat') || '0');
    const lon = parseFloat(url.searchParams.get('lon') || '0');
    const radius = parseInt(url.searchParams.get('radius') || '5000');

    if (!lat || !lon) {
      return new Response(JSON.stringify({ error: 'lat & lon required' }), { status: 400 });
    }

    const query = `[out:json][timeout:25];(way(around:${radius},${lat},${lon})["waterway"];relation(around:${radius},${lat},${lon})["waterway"];);out body;>;out skel qt;`;

    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: query,
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'Overpass query failed' }), { status: 502 });
    }

    const data = await res.json();
    const elements: any[] = data.elements || [];

    const nodeMap = new Map<number, { lat: number; lon: number }>();
    for (const el of elements) {
      if (el.type === 'node') nodeMap.set(el.id, { lat: el.lat, lon: el.lon });
    }

    const ways = elements.filter((e) => e.type === 'way' || e.type === 'relation');

    const waterways = ways.map((w) => {
      const nodeIds: number[] = w.nodes || (w.members ? w.members.filter((m: any) => m.type === 'node').map((m: any) => m.ref) : []);
      const coords = nodeIds.map((id) => nodeMap.get(id)).filter(Boolean) as { lat: number; lon: number }[];
      let centroid = { lat: lat, lon: lon };
      if (coords.length) {
        const sum = coords.reduce((acc, c) => ({ lat: acc.lat + c.lat, lon: acc.lon + c.lon }), { lat: 0, lon: 0 });
        centroid = { lat: sum.lat / coords.length, lon: sum.lon / coords.length };
      }
      const distanceMeters = haversine(lat, lon, centroid.lat, centroid.lon);
      return {
        id: w.id,
        name: (w.tags && (w.tags.name || w.tags.waterway)) || 'unnamed',
        centroid,
        distanceMeters,
      };
    });

    waterways.sort((a, b) => a.distanceMeters - b.distanceMeters);
    const top = waterways.slice(0, 10);

    return new Response(JSON.stringify({ features: top }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
}

export const runtime = 'edge';

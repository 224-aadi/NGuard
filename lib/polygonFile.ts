import { inflateRawSync } from "zlib";

const EARTH_RADIUS_METERS = 6378137;
const SQ_METERS_PER_ACRE = 4046.8564224;

export interface PolygonFileResult {
  areaSqMeters: number;
  areaAcres: number;
  centroidLat: number;
  centroidLon: number;
  ringCount: number;
  pointCount: number;
  source: "geojson" | "shp" | "zip-shp" | "table";
}

interface XY {
  x: number;
  y: number;
}

interface LonLat {
  lon: number;
  lat: number;
}

function toRad(v: number): number {
  return (v * Math.PI) / 180;
}

function closeRingXY(points: XY[]): XY[] {
  if (points.length === 0) return points;
  const a = points[0];
  const b = points[points.length - 1];
  if (a.x === b.x && a.y === b.y) return points;
  return [...points, a];
}

function isLikelyLonLat(rings: XY[][]): boolean {
  for (const ring of rings) {
    for (const p of ring) {
      if (!(p.x >= -180 && p.x <= 180 && p.y >= -90 && p.y <= 90)) {
        return false;
      }
    }
  }
  return true;
}

function ringGeodesicSignedAreaSqMeters(ringIn: XY[]): number {
  const ring = closeRingXY(ringIn);
  let area = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const p1 = ring[i];
    const p2 = ring[i + 1];
    area += toRad(p2.x - p1.x) * (2 + Math.sin(toRad(p1.y)) + Math.sin(toRad(p2.y)));
  }
  return (area * EARTH_RADIUS_METERS * EARTH_RADIUS_METERS) / 2;
}

function ringPlanarSignedArea(ringIn: XY[]): number {
  const ring = closeRingXY(ringIn);
  let area = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const a = ring[i];
    const b = ring[i + 1];
    area += (a.x * b.y) - (b.x * a.y);
  }
  return area / 2;
}

function ringPlanarCentroid(ringIn: XY[]): XY {
  const ring = closeRingXY(ringIn);
  let a2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const x1 = ring[i].x;
    const y1 = ring[i].y;
    const x2 = ring[i + 1].x;
    const y2 = ring[i + 1].y;
    const cross = x1 * y2 - x2 * y1;
    a2 += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  if (a2 === 0) return ring[0] ?? { x: 0, y: 0 };
  return { x: cx / (3 * a2), y: cy / (3 * a2) };
}

function combineRings(
  rings: XY[][],
  source: PolygonFileResult["source"],
  options?: { prjText?: string; dbfLonLat?: LonLat | null }
): PolygonFileResult {
  if (rings.length === 0) throw new Error("No polygon rings found.");

  let pointCount = 0;
  for (const ring of rings) pointCount += ring.length;

  const lonLatMode = isLikelyLonLat(rings);
  let signedAreaSum = 0;
  let centroidXWeighted = 0;
  let centroidYWeighted = 0;

  if (lonLatMode) {
    for (const ring of rings) {
      if (ring.length < 3) continue;
      const area = ringGeodesicSignedAreaSqMeters(ring);
      const c = ringPlanarCentroid(ring);
      const w = Math.abs(area);
      signedAreaSum += area;
      centroidXWeighted += c.x * w;
      centroidYWeighted += c.y * w;
    }
    const absArea = Math.abs(signedAreaSum);
    if (absArea === 0) throw new Error("Polygon area is zero.");
    return {
      areaSqMeters: Math.round(absArea * 100) / 100,
      areaAcres: Math.round((absArea / SQ_METERS_PER_ACRE) * 100) / 100,
      centroidLon: Math.round((centroidXWeighted / absArea) * 1e6) / 1e6,
      centroidLat: Math.round((centroidYWeighted / absArea) * 1e6) / 1e6,
      ringCount: rings.length,
      pointCount,
      source,
    };
  }

  let unitToMeters = 1;
  const prj = (options?.prjText || "").toLowerCase();
  if (prj.includes("foot_us") || prj.includes("us survey foot")) {
    unitToMeters = 0.3048006096012192;
  } else if (prj.includes("foot")) {
    unitToMeters = 0.3048;
  } else if (prj && !prj.includes("meter")) {
    throw new Error("Projected shapefile units are unknown. Include .prj with meter/foot units.");
  }

  for (const ring of rings) {
    if (ring.length < 3) continue;
    const areaNative = ringPlanarSignedArea(ring);
    const areaM2 = areaNative * unitToMeters * unitToMeters;
    const c = ringPlanarCentroid(ring);
    const w = Math.abs(areaM2);
    signedAreaSum += areaM2;
    centroidXWeighted += c.x * w;
    centroidYWeighted += c.y * w;
  }

  const absArea = Math.abs(signedAreaSum);
  if (absArea === 0) throw new Error("Polygon area is zero.");

  let centroidLon: number | undefined;
  let centroidLat: number | undefined;
  if (options?.dbfLonLat) {
    centroidLon = options.dbfLonLat.lon;
    centroidLat = options.dbfLonLat.lat;
  }

  if (centroidLon == null || centroidLat == null) {
    throw new Error("Polygon is projected. Add longitude/latitude columns in DBF or use WGS84 geometry.");
  }

  return {
    areaSqMeters: Math.round(absArea * 100) / 100,
    areaAcres: Math.round((absArea / SQ_METERS_PER_ACRE) * 100) / 100,
    centroidLon: Math.round(centroidLon * 1e6) / 1e6,
    centroidLat: Math.round(centroidLat * 1e6) / 1e6,
    ringCount: rings.length,
    pointCount,
    source,
  };
}

function parseGeoJsonText(text: string): PolygonFileResult {
  const parsed = JSON.parse(text) as any;
  const rings: XY[][] = [];

  const handleGeom = (geom: any) => {
    if (!geom) return;
    if (geom.type === "Polygon" && Array.isArray(geom.coordinates)) {
      for (const ring of geom.coordinates) {
        if (!Array.isArray(ring)) continue;
        const pts: XY[] = [];
        for (const pair of ring) {
          if (!Array.isArray(pair) || pair.length < 2) continue;
          pts.push({ x: Number(pair[0]), y: Number(pair[1]) });
        }
        if (pts.length >= 3) rings.push(pts);
      }
    } else if (geom.type === "MultiPolygon" && Array.isArray(geom.coordinates)) {
      for (const poly of geom.coordinates) {
        for (const ring of poly) {
          const pts: XY[] = [];
          for (const pair of ring) {
            if (!Array.isArray(pair) || pair.length < 2) continue;
            pts.push({ x: Number(pair[0]), y: Number(pair[1]) });
          }
          if (pts.length >= 3) rings.push(pts);
        }
      }
    }
  };

  if (parsed?.type === "FeatureCollection" && Array.isArray(parsed.features)) {
    for (const f of parsed.features) handleGeom(f?.geometry);
  } else if (parsed?.type === "Feature") {
    handleGeom(parsed.geometry);
  } else {
    handleGeom(parsed);
  }

  return combineRings(rings, "geojson");
}

function readInt32BE(view: DataView, offset: number): number {
  return view.getInt32(offset, false);
}

function readInt32LE(view: DataView, offset: number): number {
  return view.getInt32(offset, true);
}

function readUInt32LE(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function readUInt16LE(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readFloat64LE(view: DataView, offset: number): number {
  return view.getFloat64(offset, true);
}

function parseShpRings(buffer: ArrayBuffer): XY[][] {
  const view = new DataView(buffer);
  if (view.byteLength < 100) throw new Error("Invalid .shp file.");
  const fileCode = readInt32BE(view, 0);
  if (fileCode !== 9994) throw new Error("Invalid shapefile header.");

  let offset = 100;
  const rings: XY[][] = [];

  while (offset + 8 <= view.byteLength) {
    const contentLengthWords = readInt32BE(view, offset + 4);
    const contentBytes = contentLengthWords * 2;
    const contentStart = offset + 8;
    if (contentStart + contentBytes > view.byteLength) break;

    const shapeType = readInt32LE(view, contentStart);
    if (shapeType === 5 || shapeType === 15 || shapeType === 25) {
      const numParts = readInt32LE(view, contentStart + 36);
      const numPoints = readInt32LE(view, contentStart + 40);
      const partsStart = contentStart + 44;
      const pointsStart = partsStart + numParts * 4;

      const parts: number[] = [];
      for (let p = 0; p < numParts; p += 1) {
        parts.push(readInt32LE(view, partsStart + p * 4));
      }
      for (let p = 0; p < numParts; p += 1) {
        const start = parts[p];
        const end = p + 1 < numParts ? parts[p + 1] : numPoints;
        const ring: XY[] = [];
        for (let i = start; i < end; i += 1) {
          const pointOffset = pointsStart + i * 16;
          ring.push({
            x: readFloat64LE(view, pointOffset),
            y: readFloat64LE(view, pointOffset + 8),
          });
        }
        if (ring.length >= 3) rings.push(ring);
      }
    }

    offset = contentStart + contentBytes;
  }

  return rings;
}

function parseDbfLonLat(buffer: ArrayBuffer): LonLat | null {
  const view = new DataView(buffer);
  if (view.byteLength < 33) return null;

  const numRecords = readUInt32LE(view, 4);
  const headerLength = readUInt16LE(view, 8);
  const recordLength = readUInt16LE(view, 10);

  type Field = { name: string; length: number };
  const fields: Field[] = [];
  let off = 32;
  while (off + 32 <= headerLength) {
    const marker = view.getUint8(off);
    if (marker === 0x0d) break;
    const nameBytes = new Uint8Array(view.buffer, view.byteOffset + off, 11);
    const name = new TextDecoder("ascii").decode(nameBytes).replace(/\0/g, "").trim().toLowerCase();
    const length = view.getUint8(off + 16);
    fields.push({ name, length });
    off += 32;
  }

  const normalize = (v: string) => v.replace(/[\s_\-]/g, "");
  const lonIdx = fields.findIndex((f) => ["longitude", "lon", "lng", "x"].includes(normalize(f.name)));
  const latIdx = fields.findIndex((f) => ["latitude", "lat", "y"].includes(normalize(f.name)));
  if (lonIdx < 0 || latIdx < 0) return null;

  let lonSum = 0;
  let latSum = 0;
  let count = 0;

  for (let r = 0; r < numRecords; r += 1) {
    const recStart = headerLength + r * recordLength;
    if (recStart + recordLength > view.byteLength) break;
    if (view.getUint8(recStart) === 0x2a) continue;
    let cursor = recStart + 1;
    let lonStr = "";
    let latStr = "";
    for (let f = 0; f < fields.length; f += 1) {
      const field = fields[f];
      const raw = new Uint8Array(view.buffer, view.byteOffset + cursor, field.length);
      const value = new TextDecoder("ascii").decode(raw).trim();
      if (f === lonIdx) lonStr = value;
      if (f === latIdx) latStr = value;
      cursor += field.length;
    }
    const lon = Number(lonStr);
    const lat = Number(latStr);
    if (Number.isFinite(lon) && Number.isFinite(lat) && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90) {
      lonSum += lon;
      latSum += lat;
      count += 1;
    }
  }

  if (count === 0) return null;
  return { lon: lonSum / count, lat: latSum / count };
}

function parseShpWithContext(
  shpBuffer: ArrayBuffer,
  source: PolygonFileResult["source"],
  options?: { prjText?: string; dbfBuffer?: ArrayBuffer }
): PolygonFileResult {
  const rings = parseShpRings(shpBuffer);
  const dbfLonLat = options?.dbfBuffer ? parseDbfLonLat(options.dbfBuffer) : null;
  return combineRings(rings, source, { prjText: options?.prjText, dbfLonLat });
}

function parseZipEntries(zipBuffer: ArrayBuffer): Map<string, Uint8Array> {
  const view = new DataView(zipBuffer);
  const bytes = new Uint8Array(zipBuffer);

  let eocd = -1;
  const min = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= min; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Invalid ZIP file.");

  const cdOffset = readUInt32LE(view, eocd + 16);
  const totalEntries = readUInt16LE(view, eocd + 10);
  let ptr = cdOffset;
  const files = new Map<string, Uint8Array>();

  for (let i = 0; i < totalEntries; i += 1) {
    if (readUInt32LE(view, ptr) !== 0x02014b50) break;
    const compression = readUInt16LE(view, ptr + 10);
    const compressedSize = readUInt32LE(view, ptr + 20);
    const fileNameLen = readUInt16LE(view, ptr + 28);
    const extraLen = readUInt16LE(view, ptr + 30);
    const commentLen = readUInt16LE(view, ptr + 32);
    const localHeaderOffset = readUInt32LE(view, ptr + 42);

    const nameBytes = bytes.slice(ptr + 46, ptr + 46 + fileNameLen);
    const name = new TextDecoder("utf-8").decode(nameBytes).replace(/\\/g, "/").split("/").pop() || "";

    const localSig = readUInt32LE(view, localHeaderOffset);
    if (localSig !== 0x04034b50) {
      ptr += 46 + fileNameLen + extraLen + commentLen;
      continue;
    }

    const localNameLen = readUInt16LE(view, localHeaderOffset + 26);
    const localExtraLen = readUInt16LE(view, localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const compData = bytes.slice(dataStart, dataStart + compressedSize);

    let out: Uint8Array;
    if (compression === 0) {
      out = compData;
    } else if (compression === 8) {
      out = new Uint8Array(inflateRawSync(Buffer.from(compData)));
    } else {
      ptr += 46 + fileNameLen + extraLen + commentLen;
      continue;
    }

    if (name) files.set(name.toLowerCase(), out);
    ptr += 46 + fileNameLen + extraLen + commentLen;
  }

  return files;
}

function toArrayBufferCopy(bytes: Uint8Array): ArrayBuffer {
  const out = new Uint8Array(bytes.byteLength);
  out.set(bytes);
  return out.buffer;
}

export async function parsePolygonUpload(file: File): Promise<PolygonFileResult> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".geojson") || name.endsWith(".json")) {
    return parseGeoJsonText(await file.text());
  }

  if (name.endsWith(".shp")) {
    return parseShpWithContext(await file.arrayBuffer(), "shp");
  }

  if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt")) {
    return parseLonLatTable(await file.text());
  }

  if (name.endsWith(".zip")) {
    const entries = parseZipEntries(await file.arrayBuffer());
    const shpEntry = [...entries.entries()].find(([k]) => k.endsWith(".shp"));
    if (!shpEntry) throw new Error("ZIP must contain a .shp file.");
    const base = shpEntry[0].replace(/\.shp$/, "");
    const dbf = entries.get(`${base}.dbf`);
    const prjBytes = entries.get(`${base}.prj`);
    const prjText = prjBytes ? new TextDecoder("utf-8").decode(prjBytes) : undefined;
    return parseShpWithContext(toArrayBufferCopy(shpEntry[1]), "zip-shp", {
      dbfBuffer: dbf ? toArrayBufferCopy(dbf) : undefined,
      prjText,
    });
  }

  throw new Error("Unsupported polygon file type. Use .zip, .shp, .geojson, .json, .csv, .tsv, or .txt.");
}

function parseLonLatTable(text: string): PolygonFileResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error("Coordinate table is empty.");

  const headerLine = lines[0];
  const delimiter = headerLine.includes("\t") ? "\t" : headerLine.includes(";") ? ";" : ",";
  const headers = headerLine.split(delimiter).map((h) => h.trim().toLowerCase());
  const normalize = (v: string) => v.replace(/[\s_\-]/g, "");
  const lonIdx = headers.findIndex((h) => ["longitude", "lon", "lng", "x"].includes(normalize(h)));
  const latIdx = headers.findIndex((h) => ["latitude", "lat", "y"].includes(normalize(h)));
  if (lonIdx < 0 || latIdx < 0) {
    throw new Error("Could not find longitude/latitude columns in coordinate table.");
  }

  const ring: XY[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const row = lines[i].split(delimiter).map((v) => v.trim());
    if (Math.max(lonIdx, latIdx) >= row.length) continue;
    const lon = Number(row[lonIdx]);
    const lat = Number(row[latIdx]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    ring.push({ x: lon, y: lat });
  }
  if (ring.length < 3) throw new Error("Need at least 3 valid longitude/latitude rows.");
  return combineRings([ring], "table");
}

const SQ_METERS_PER_ACRE = 4046.8564224;

type Endian = "LE" | "BE";

interface TiffEntry {
  tag: number;
  type: number;
  count: number;
  valueOffset: number;
  entryOffset: number;
}

function typeSize(type: number): number {
  switch (type) {
    case 1: return 1;
    case 2: return 1;
    case 3: return 2;
    case 4: return 4;
    case 5: return 8;
    case 12: return 8;
    default: return 0;
  }
}

function getU16(view: DataView, offset: number, endian: Endian): number {
  return view.getUint16(offset, endian === "LE");
}

function getU32(view: DataView, offset: number, endian: Endian): number {
  return view.getUint32(offset, endian === "LE");
}

function getF64(view: DataView, offset: number, endian: Endian): number {
  return view.getFloat64(offset, endian === "LE");
}

function parseEntries(view: DataView, firstIfdOffset: number, endian: Endian): TiffEntry[] {
  const entryCount = getU16(view, firstIfdOffset, endian);
  const entries: TiffEntry[] = [];
  const offset = firstIfdOffset + 2;
  for (let i = 0; i < entryCount; i += 1) {
    const entryOffset = offset + i * 12;
    entries.push({
      tag: getU16(view, entryOffset, endian),
      type: getU16(view, entryOffset + 2, endian),
      count: getU32(view, entryOffset + 4, endian),
      valueOffset: getU32(view, entryOffset + 8, endian),
      entryOffset,
    });
  }
  return entries;
}

function parseEntryValues(view: DataView, entry: TiffEntry, endian: Endian): number[] {
  const tSize = typeSize(entry.type);
  if (!tSize) return [];

  const totalBytes = tSize * entry.count;
  let sourceOffset = entry.valueOffset;
  let sourceView = view;

  if (totalBytes <= 4) {
    const temp = new ArrayBuffer(4);
    const src = new Uint8Array(view.buffer, view.byteOffset + entry.entryOffset + 8, 4);
    new Uint8Array(temp).set(src);
    sourceView = new DataView(temp);
    sourceOffset = 0;
  }

  const out: number[] = [];
  for (let i = 0; i < entry.count; i += 1) {
    const off = sourceOffset + i * tSize;
    if (entry.type === 1) out.push(sourceView.getUint8(off));
    else if (entry.type === 3) out.push(getU16(sourceView, off, endian));
    else if (entry.type === 4) out.push(getU32(sourceView, off, endian));
    else if (entry.type === 5) {
      const n = getU32(sourceView, off, endian);
      const d = getU32(sourceView, off + 4, endian);
      out.push(d === 0 ? 0 : n / d);
    } else if (entry.type === 12) out.push(getF64(sourceView, off, endian));
  }
  return out;
}

function parseGeoKeys(values: number[]): Map<number, number> {
  const keys = new Map<number, number>();
  if (values.length < 4) return keys;
  const count = values[3];
  let i = 4;
  for (let k = 0; k < count; k += 1) {
    const keyId = values[i];
    const tiffTagLocation = values[i + 1];
    const valCount = values[i + 2];
    const valueOffset = values[i + 3];
    i += 4;
    if (tiffTagLocation === 0 && valCount === 1) keys.set(keyId, valueOffset);
  }
  return keys;
}

export interface GeoTiffAreaResult {
  areaSqMeters: number;
  areaAcres: number;
  width: number;
  height: number;
  pixelSizeX: number;
  pixelSizeY: number;
  units: string;
  centroid?: { lat: number; lon: number };
  warnings: string[];
}

export function estimateAreaFromGeoTiff(arrayBuffer: ArrayBuffer): GeoTiffAreaResult {
  const view = new DataView(arrayBuffer);
  if (view.byteLength < 8) throw new Error("Invalid TIFF: file too small.");

  const byteOrder = String.fromCharCode(view.getUint8(0), view.getUint8(1));
  const endian: Endian = byteOrder === "II" ? "LE" : byteOrder === "MM" ? "BE" : (() => {
    throw new Error("Invalid TIFF byte order.");
  })();

  const magic = getU16(view, 2, endian);
  if (magic !== 42) throw new Error("Unsupported TIFF format.");

  const firstIfdOffset = getU32(view, 4, endian);
  const entries = parseEntries(view, firstIfdOffset, endian);
  const entryMap = new Map<number, TiffEntry>();
  entries.forEach((e) => entryMap.set(e.tag, e));

  const width = parseEntryValues(view, entryMap.get(256) as TiffEntry, endian)[0];
  const height = parseEntryValues(view, entryMap.get(257) as TiffEntry, endian)[0];
  if (!width || !height) throw new Error("Could not read TIFF width/height.");

  const pixelScale = entryMap.get(33550) ? parseEntryValues(view, entryMap.get(33550) as TiffEntry, endian) : [];
  let pixelSizeX = Math.abs(pixelScale[0] ?? 0);
  let pixelSizeY = Math.abs(pixelScale[1] ?? 0);

  const modelTransform = entryMap.get(34264) ? parseEntryValues(view, entryMap.get(34264) as TiffEntry, endian) : [];
  if ((!pixelSizeX || !pixelSizeY) && modelTransform.length >= 16) {
    pixelSizeX = Math.abs(modelTransform[0]);
    pixelSizeY = Math.abs(modelTransform[5]);
  }
  if (!pixelSizeX || !pixelSizeY) throw new Error("GeoTIFF missing pixel scale metadata.");

  const warnings: string[] = [];
  const geoKeys = entryMap.get(34735)
    ? parseGeoKeys(parseEntryValues(view, entryMap.get(34735) as TiffEntry, endian))
    : new Map<number, number>();
  const modelType = geoKeys.get(1024); // 2 => geographic
  const linearUnitCode = geoKeys.get(3076);

  let unitFactor = 1;
  let units = "meters";
  if (linearUnitCode === 9002) {
    unitFactor = 0.3048;
    units = "international feet";
  } else if (linearUnitCode === 9003) {
    unitFactor = 0.3048006096012192;
    units = "US survey feet";
  } else if (linearUnitCode && linearUnitCode !== 9001) {
    units = `code:${linearUnitCode} (assumed meters)`;
    warnings.push(`Unknown unit code ${linearUnitCode}; assuming meters.`);
  }

  const pixelAreaSqMeters = (pixelSizeX * unitFactor) * (pixelSizeY * unitFactor);
  const areaSqMeters = width * height * pixelAreaSqMeters;
  const areaAcres = areaSqMeters / SQ_METERS_PER_ACRE;

  let centroid: { lat: number; lon: number } | undefined;
  const tiePoint = entryMap.get(33922) ? parseEntryValues(view, entryMap.get(33922) as TiffEntry, endian) : [];
  if (modelType === 2 && tiePoint.length >= 6 && pixelScale.length >= 2) {
    const i0 = tiePoint[0];
    const j0 = tiePoint[1];
    const x0 = tiePoint[3];
    const y0 = tiePoint[4];
    const cx = x0 + ((width / 2) - i0) * pixelScale[0];
    const cy = y0 - ((height / 2) - j0) * pixelScale[1];
    if (cy >= -90 && cy <= 90 && cx >= -180 && cx <= 180) {
      centroid = { lat: cy, lon: cx };
    }
  }

  return {
    areaSqMeters: Math.round(areaSqMeters * 100) / 100,
    areaAcres: Math.round(areaAcres * 100) / 100,
    width,
    height,
    pixelSizeX: Math.round(pixelSizeX * 10000) / 10000,
    pixelSizeY: Math.round(pixelSizeY * 10000) / 10000,
    units,
    centroid,
    warnings,
  };
}

import { NextResponse } from "next/server";
import { estimateAreaFromGeoTiff } from "@/lib/geotiffArea";
import { parsePolygonUpload } from "@/lib/polygonFile";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const tiffFile = form.get("tiffFile");
    const polygonFile = form.get("polygonFile");

    if (!(tiffFile instanceof File)) {
      return NextResponse.json({ error: "Missing TIFF file in form field 'tiffFile'." }, { status: 400 });
    }
    if (!(polygonFile instanceof File)) {
      return NextResponse.json({ error: "Missing polygon file in form field 'polygonFile'." }, { status: 400 });
    }

    const tiffName = tiffFile.name.toLowerCase();
    if (!(tiffName.endsWith(".tif") || tiffName.endsWith(".tiff"))) {
      return NextResponse.json({ error: "TIFF input must be .tif or .tiff." }, { status: 400 });
    }

    const tiff = estimateAreaFromGeoTiff(await tiffFile.arrayBuffer());
    const polygon = await parsePolygonUpload(polygonFile);

    return NextResponse.json({
      chosenAreaAcres: polygon.areaAcres,
      chosenAreaSqMeters: polygon.areaSqMeters,
      centroid: {
        lat: polygon.centroidLat,
        lon: polygon.centroidLon,
      },
      tiff: {
        fileName: tiffFile.name,
        areaAcres: tiff.areaAcres,
        areaSqMeters: tiff.areaSqMeters,
        width: tiff.width,
        height: tiff.height,
        pixelSizeX: tiff.pixelSizeX,
        pixelSizeY: tiff.pixelSizeY,
        units: tiff.units,
        warnings: tiff.warnings,
      },
      polygon: {
        fileName: polygonFile.name,
        source: polygon.source,
        areaAcres: polygon.areaAcres,
        areaSqMeters: polygon.areaSqMeters,
        ringCount: polygon.ringCount,
        pointCount: polygon.pointCount,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to process field files.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

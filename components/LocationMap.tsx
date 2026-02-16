"use client";

import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface LocationMapProps {
  lat: number;
  lon: number;
  locationName: string;
  /** Called when user clicks anywhere on the map to drop a pin */
  onMapClick?: (lat: number, lon: number) => void;
  editable?: boolean;
}

export default function LocationMap({ lat, lon, locationName, onMapClick, editable = true }: LocationMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onMapClickRef = useRef(onMapClick);

  // Keep callback ref current without re-binding the map listener
  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  // Fix Leaflet default icon path issue in bundlers
  useEffect(() => {
    delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
  }, []);

  // Stable click handler that reads from ref
  const handleClick = useCallback((e: L.LeafletMouseEvent) => {
    const { lat: clickLat, lng: clickLon } = e.latlng;

    // Immediately move marker to clicked location
    if (markerRef.current && mapInstanceRef.current) {
      markerRef.current.setLatLng([clickLat, clickLon]);
      markerRef.current
        .setPopupContent(`<b>Selected Location</b><br/>📍 ${clickLat.toFixed(4)}, ${clickLon.toFixed(4)}<br/><i>Fetching weather...</i>`)
        .openPopup();
    }

    onMapClickRef.current?.(clickLat, clickLon);
  }, []);

  // Initialize map (once)
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      zoomControl: true,
      scrollWheelZoom: true,
    }).setView([lat, lon], 10);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map);

    const marker = L.marker([lat, lon], { draggable: editable })
      .addTo(map)
      .bindPopup(`<b>${locationName}</b><br/>📍 ${lat.toFixed(4)}, ${lon.toFixed(4)}`)
      .openPopup();

    // Click on map → drop pin
    if (editable) {
      map.on("click", handleClick);
    }

    // Drag marker → same as click
    if (editable) {
      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        marker
          .setPopupContent(`<b>Selected Location</b><br/>📍 ${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}<br/><i>Fetching weather...</i>`)
          .openPopup();
        onMapClickRef.current?.(pos.lat, pos.lng);
      });
    }

    mapInstanceRef.current = map;
    markerRef.current = marker;

    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update position when coords change from outside (search, GPS)
  useEffect(() => {
    if (mapInstanceRef.current && markerRef.current) {
      const latlng = L.latLng(lat, lon);
      mapInstanceRef.current.setView(latlng, mapInstanceRef.current.getZoom(), { animate: true });
      markerRef.current.setLatLng(latlng);
      markerRef.current
        .setPopupContent(`<b>${locationName}</b><br/>📍 ${lat.toFixed(4)}, ${lon.toFixed(4)}`)
        .openPopup();
    }
  }, [lat, lon, locationName]);

  return (
    <div className="relative h-full w-full">
      <div
        ref={mapRef}
        className="h-full w-full rounded-lg"
        style={{ minHeight: "200px" }}
      />
      <div className="absolute bottom-2 left-2 z-[1000] rounded bg-white/90 px-2 py-1 text-[9px] text-slate-500 shadow-sm pointer-events-none">
        {editable ? "Click map or drag pin to select location" : "Location is derived from uploaded field files"}
      </div>
    </div>
  );
}

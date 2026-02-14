"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface LocationMapProps {
  lat: number;
  lon: number;
  locationName: string;
}

export default function LocationMap({ lat, lon, locationName }: LocationMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // Fix Leaflet default icon path issue in bundlers
  useEffect(() => {
    delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapRef.current, {
        zoomControl: true,
        scrollWheelZoom: true,
      }).setView([lat, lon], 10);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);

      const marker = L.marker([lat, lon])
        .addTo(map)
        .bindPopup(`<b>${locationName}</b><br/>📍 ${lat.toFixed(4)}, ${lon.toFixed(4)}`)
        .openPopup();

      mapInstanceRef.current = map;
      markerRef.current = marker;

      // Force resize after mount (fixes grey tiles in dynamic containers)
      setTimeout(() => map.invalidateSize(), 100);
    }

    return () => {
      // Don't destroy on every re-render, only on unmount
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update position when coords change
  useEffect(() => {
    if (mapInstanceRef.current && markerRef.current) {
      const latlng = L.latLng(lat, lon);
      mapInstanceRef.current.setView(latlng, 10, { animate: true });
      markerRef.current.setLatLng(latlng);
      markerRef.current
        .setPopupContent(`<b>${locationName}</b><br/>📍 ${lat.toFixed(4)}, ${lon.toFixed(4)}`)
        .openPopup();
    }
  }, [lat, lon, locationName]);

  return (
    <div
      ref={mapRef}
      className="h-full w-full rounded-lg"
      style={{ minHeight: "200px" }}
    />
  );
}

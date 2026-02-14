import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "N-Guard: Nitrogen Risk Analysis & Compliance",
  description:
    "Agricultural nitrogen management — risk assessment, leaching probability, Monte Carlo VaR, and compliance memo generator.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Leaflet CSS — must load before map renders or tiles stack/break */}
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}

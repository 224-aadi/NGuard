import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "N-Guard: Forecast-Adjusted Nitrogen Compliance",
  description:
    "CV-SALTS / ILRP nitrate risk mitigation — nitrogen recommendation, leaching probability, Monte Carlo VaR, and compliance memo generator.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}

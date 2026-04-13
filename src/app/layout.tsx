import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "QuantEdge — Intraday Options Signal Dashboard",
  description: "Real-time intraday signal scanner for options trading on your quant watchlist",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#00d4a1" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="min-h-screen bg-bg-primary grid-bg">
        {children}
      </body>
    </html>
  );
}

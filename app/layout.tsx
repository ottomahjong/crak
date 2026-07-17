import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorker } from "./sw-register";

export const metadata: Metadata = {
  applicationName: "CRAK!",
  title: "CRAK! — A tiny mahjong puzzle",
  description:
    "Swipe the board, combine mahjong-inspired tiles into pairs, pungs and runs, and complete a small target hand. A calm, tactile, offline-friendly puzzle.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CRAK!",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1c2230",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}

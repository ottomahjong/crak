import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { ServiceWorker } from "./sw-register";

// Real "Google Sans" is Google's proprietary brand font (not web-distributable),
// so it leads the CSS stack for devices that have it. Poppins — an open (OFL),
// geometric sans in the same family of shapes — is self-hosted here as the
// concrete fallback, so the type looks Google-Sans-like everywhere and offline.
const googleSans = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-gsans",
  display: "swap",
});

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
    <html lang="en" data-theme="dark" className={googleSans.variable} suppressHydrationWarning>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}

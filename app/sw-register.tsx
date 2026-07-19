"use client";

import { useEffect } from "react";

/** Registers the offline service worker. Safe no-op during SSR / dev reloads. */
export function ServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Register after load so it never competes with first paint. The base path
    // matters on GitHub Pages, where the app is served under /<repo>/.
    const bp = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    const register = () => {
      navigator.serviceWorker.register(`${bp}/sw.js`, { scope: `${bp}/` }).catch(() => {
        /* offline support is best-effort */
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}

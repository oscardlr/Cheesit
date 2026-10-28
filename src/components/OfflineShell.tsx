"use client";

import { useEffect } from "react";

export default function OfflineShell() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Local data remains available, but offline startup has not been prepared.
      });
    }
  }, []);
  return null;
}

import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cheesit — cada rep cuenta",
  description: "Tu zona. Tus reglas. Registra tus series, conquista tus marcas y sube de nivel.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
  appleWebApp: { capable: true, title: "Cheesit", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#110f16", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}

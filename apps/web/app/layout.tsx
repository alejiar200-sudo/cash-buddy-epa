import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Epa — Caja diaria",
  description: "Sistema de gestión de caja diaria para Epa",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

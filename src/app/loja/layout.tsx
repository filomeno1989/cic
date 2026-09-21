import type { Metadata, Viewport } from "next";

// v2.3 PWA: segmento /loja com o SEU manifest - se um cliente guardar
// o portal no ecrã, abre como "CIC Loja" com o tema claro da loja.
export const metadata: Metadata = {
  title: "CIC Fragrâncias & Glamour · Catálogo",
  description:
    "Catálogo online da CIC Fragrâncias & Glamour - perfumes, cremes e acessórios na Beira, Moçambique. Encomende pelo WhatsApp.",
  manifest: "/manifest-loja.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "CIC Loja" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#faf8f3",
};

export default function LojaLayout({ children }: { children: React.ReactNode }) {
  return children;
}

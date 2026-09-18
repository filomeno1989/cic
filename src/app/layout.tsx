import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "CIC Fragrâncias & Glamour · Sistema de Gestão",
  description:
    "Sistema integrado de gestão e PDV para loja de cosméticos e acessórios - Beira, Moçambique. Offline-first, M-Pesa, e-Mola, mKesh, fiação e mais.",
  icons: { icon: "/logo-cic.png", apple: "/apple-touch-icon.png" },
  // v2.3 PWA: "Adicionar ao ecrã principal" no iPhone/tablet abre como app,
  // com o login do pessoal (/gestao) como página inicial
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "CIC Gestão" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-MZ" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}

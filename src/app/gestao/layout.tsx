import type { Metadata } from "next";

// Segmento /gestao: fora dos motores de busca (não é para clientes)
export const metadata: Metadata = {
  title: "CIC",
  robots: { index: false, follow: false },
};

export default function GestaoLayout({ children }: { children: React.ReactNode }) {
  return children;
}

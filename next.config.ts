import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  // v2.5 (S7 da auditoria): flag removida - erros de TypeScript voltam a
  // BLOQUEAR o deploy (o seguro estava desligado; hoje o código tem 0 erros).
  reactStrictMode: false,
};

export default nextConfig;

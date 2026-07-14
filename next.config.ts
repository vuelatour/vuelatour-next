import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // La lectura IA de facturas manda la foto/PDF en base64 a través de una
      // server action (el default de 1 MB se queda corto con fotos de celular).
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;

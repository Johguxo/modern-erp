import type { NextConfig } from 'next';

// El entorno se valida al arrancar el servidor en src/instrumentation.ts.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  typedRoutes: true,
  // Importación de catálogo (E2-H3): el archivo sube por una server action (límite de la historia: 2 MB).
  experimental: { serverActions: { bodySizeLimit: '3mb' } },
};

export default nextConfig;

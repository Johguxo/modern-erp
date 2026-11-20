import type { NextConfig } from 'next';

// El entorno se valida al arrancar el servidor en src/instrumentation.ts.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  typedRoutes: true,
};

export default nextConfig;

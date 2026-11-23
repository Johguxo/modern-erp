// Next.js llama a register() una vez al arrancar el servidor (`next dev` y `next start`).
// Si falta una variable obligatoria, el servidor no arranca.
// En `next build` no se valida, para poder compilar sin .env.local (CI).
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;

  const { validateEnvOnStartup } = await import('./instrumentation-node');
  validateEnvOnStartup();
}

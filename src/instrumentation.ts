// Next.js llama a register() una vez al arrancar el servidor (`next dev` y `next start`).
// Aquí se valida el entorno: si falta una variable obligatoria, el servidor no arranca.
// En `next build` no se valida, para poder compilar sin .env.local (CI).
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;

  try {
    await import('./env');
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

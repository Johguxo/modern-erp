// Proceso de jobs (`pnpm worker`). Arranca pg-boss con las colas y se apaga limpio con SIGTERM
// (Railway) o SIGINT (Ctrl+C). Si falta una variable obligatoria o la base no responde, sale con 1.
import { getLogger } from './shared/adapters/pino-logger';
import { startWorker } from './worker-runtime';

async function main(): Promise<void> {
  const worker = await startWorker();

  let signals = 0;
  const shutdown = (signal: NodeJS.Signals) => {
    signals += 1;
    if (signals > 1) process.exit(1); // segunda señal: salir ya
    getLogger().info({ signal }, 'worker shutting down');
    worker.stop().then(
      () => process.exit(0),
      (error: unknown) => {
        getLogger().error({ err: error }, 'worker stop failed');
        process.exit(1);
      },
    );
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error: unknown) => {
  // El error de entorno (getEnv) ya trae un mensaje legible: va a stderr además del log.
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

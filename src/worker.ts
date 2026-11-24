// Proceso de jobs (`pnpm worker`). Arranca pg-boss con las colas y se apaga limpio con SIGTERM
// (Railway) o SIGINT (Ctrl+C). Si falta una variable obligatoria o la base no responde, sale con 1.
import { getLogger } from './shared/adapters/pino-logger';
import { startWorker } from './worker-runtime';

function logStartFailure(error: unknown): void {
  // El error de entorno (getEnv) trae un mensaje legible para stderr. Si el entorno es válido
  // (por ejemplo, la base no responde), además se registra completo en el log.
  console.error(error instanceof Error ? error.message : error);
  try {
    getLogger().error({ err: error }, 'worker start failed');
  } catch {
    // Sin entorno válido no hay logger: basta con stderr.
  }
}

// Los manejadores de señales se registran ANTES de arrancar: si la señal llega mientras arranca,
// espera a que termine el arranque y luego apaga (sin esto, una señal temprana mata el proceso
// sin cerrar pg-boss ni las conexiones).
const starting = startWorker();

let signals = 0;
const shutdown = (signal: NodeJS.Signals) => {
  signals += 1;
  if (signals > 1) process.exit(1); // segunda señal: salir ya
  starting
    .then(async (worker) => {
      getLogger().info({ signal }, 'worker shutting down');
      await worker.stop();
      process.exit(0);
    })
    .catch((error: unknown) => {
      getLogger().error({ err: error }, 'worker stop failed');
      process.exit(1);
    });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

starting.catch((error: unknown) => {
  logStartFailure(error);
  process.exit(1);
});

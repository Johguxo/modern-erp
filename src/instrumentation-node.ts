// Validación del entorno al arrancar el servidor web (solo runtime Node.js).
// Va en un archivo aparte porque Next también compila instrumentation.ts para Edge,
// donde process.exit no existe.
import { getEnv } from './env';

export function validateEnvOnStartup(): void {
  try {
    getEnv();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

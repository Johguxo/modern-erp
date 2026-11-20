// Proceso de jobs (ADR-001, regla 8). Marcador: E0-H5 arranca pg-boss y registra las colas.
// Valida la configuración al arrancar: si falta una variable obligatoria, el worker no arranca.
import { getEnv } from './env';

getEnv();

console.warn('[worker] entorno válido; pg-boss se configura en E0-H5.');

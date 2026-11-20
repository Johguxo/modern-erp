// Proceso de jobs (ADR-001, regla 8). Marcador: E0-H5 arranca pg-boss y registra las colas.
// Importar env valida la configuración: si falta una variable obligatoria, el worker no arranca.
import './env';

console.warn('[worker] entorno válido; pg-boss se configura en E0-H5.');

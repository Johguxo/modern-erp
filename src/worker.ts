// Proceso de jobs (ADR-001, regla 8). Marcador: E0-H5 arranca pg-boss y registra las colas.
// Valida la configuración al arrancar: si falta una variable obligatoria, el worker no arranca.
import { getEnv } from './env';
import { getLogger } from './shared/adapters/pino-logger';

getEnv();

getLogger().child({ process: 'worker' }).info({}, 'worker env ok; pg-boss arrives in E0-H5');

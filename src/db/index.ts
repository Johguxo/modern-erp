// API de @/db para repositorios (infrastructure/) y la entrega en src/app.
// getDb() y getDbAdmin() se importan explícitamente desde @/db/client y @/db/admin; las tablas,
// desde @/db/schema (solo infrastructure/). src/app solo usa este archivo.
export type { AppDatabase, DbExecutor, DbTransaction } from './client';
export { withTenant, withUser, type TenantScope, type UserScope } from './with-tenant';
export { isUniqueViolation, pgErrorCode, PG_UNIQUE_VIOLATION } from './errors';
export { escapeLike, searchWords } from './like';

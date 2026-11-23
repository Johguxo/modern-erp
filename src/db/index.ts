// API de @/db para repositorios (infrastructure/) y la entrega en src/app.
// getDb() y getDbAdmin() se importan explícitamente desde @/db/client y @/db/admin.
export type { AppDatabase, DbTransaction } from './client';
export * as schema from './schema';
export { withTenant, withUser, type TenantScope, type UserScope } from './with-tenant';

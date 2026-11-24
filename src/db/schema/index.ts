// Esquema Drizzle: una carpeta por módulo (`src/db/schema/<módulo>.ts`) reexportada aquí.
// Toda tabla de negocio lleva tenant_id, índice y RLS (ADR-004 §5 y §11).
export * from './identity';
export * from './catalog';

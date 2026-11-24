// Puertos de la configuración de la empresa (E1-H5). La implementación Drizzle usa la transacción
// de withTenant (RLS de tenant_settings) y además filtra por tenantId.
import type { AfterCommit } from '@/shared/ports/after-commit';
import type { ClientInfo } from '@/shared/ports/client-info';
import type { PublicFileStorage } from '@/shared/ports/file-storage';
import type { IdGenerator } from '@/shared/ports/id-generator';
import type { Logger } from '@/shared/ports/logger';

import type { Brand } from '../domain/company-brand';

import type { AuditLog } from './user-admin-ports';

export type Currency = 'PEN' | 'USD';

export interface SettingsRecord {
  /** tenants.name: lo controla el SuperAdmin. */
  readonly legalName: string;
  readonly currency: Currency;
  /** tenant_settings.brand ya validado (lo inválido se descarta). */
  readonly brand: Brand;
}

export interface SettingsRepository {
  get(tenantId: string): Promise<SettingsRecord | null>;
  /** brand y currency con SELECT … FOR UPDATE (para el "antes" de la auditoría sin carreras). */
  lock(tenantId: string): Promise<{ brand: Brand; currency: Currency } | null>;
  update(tenantId: string, input: { brand: Brand; currency: Currency }): Promise<void>;
}

export interface SettingsDeps {
  readonly settings: SettingsRepository;
  readonly storage: PublicFileStorage;
  readonly audit: AuditLog;
  readonly ids: IdGenerator;
  readonly logger: Logger;
  readonly client: ClientInfo;
  readonly afterCommit: AfterCommit;
}

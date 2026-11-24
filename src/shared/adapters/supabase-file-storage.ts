// Adaptador de FileStorage sobre Supabase Storage (E1-H5, ADR-003). Usa la service role (solo
// servidor), que salta la RLS de Storage: el aislamiento entre tenants lo da la ruta
// `${tenantId}/${key}`, que arma el servidor y que aquí se vuelve a validar.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getEnv } from '../../env';
import type { PublicFileStorage } from '../ports/file-storage';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KEY = /^[a-z0-9][a-z0-9/._-]*$/;

/** `${tenantId}/${key}`, o lanza si el tenant no es un uuid o la clave intenta salirse de su carpeta. */
export function objectPath(tenantId: string, key: string): string {
  if (!UUID.test(tenantId)) throw new Error('Invalid tenant id for storage');
  if (!KEY.test(key) || key.includes('..') || key.includes('//') || key.endsWith('/')) {
    throw new Error('Invalid storage key');
  }
  return `${tenantId}/${key}`;
}

let cached: SupabaseClient | undefined;

function client(): SupabaseClient {
  if (typeof window !== 'undefined') throw new Error('FileStorage solo se usa en el servidor.');
  const env = getEnv();
  cached ??= createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  return cached;
}

export function createSupabaseFileStorage(options: { bucket: string }): PublicFileStorage {
  const bucket = () => client().storage.from(options.bucket);
  return {
    async put({ tenantId, key, body, contentType }) {
      const { error } = await bucket().upload(objectPath(tenantId, key), body, {
        contentType,
        // Cada subida tiene nombre nuevo: se puede cachear un año.
        cacheControl: '31536000',
        upsert: false,
      });
      if (error) throw Object.assign(new Error('Storage upload failed'), { cause: error });
    },
    async getSignedUrl({ tenantId, key, expiresInSeconds }) {
      const { data, error } = await bucket().createSignedUrl(
        objectPath(tenantId, key),
        expiresInSeconds,
      );
      if (error) throw Object.assign(new Error('Storage signed URL failed'), { cause: error });
      return data.signedUrl;
    },
    async remove({ tenantId, key }) {
      const { error } = await bucket().remove([objectPath(tenantId, key)]);
      if (error) throw Object.assign(new Error('Storage remove failed'), { cause: error });
    },
    publicUrl({ tenantId, key }) {
      return bucket().getPublicUrl(objectPath(tenantId, key)).data.publicUrl;
    },
  };
}

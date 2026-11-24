// Storage del proceso web (E1-H5). Perezoso: `next build` compila sin .env.local.
import { createSupabaseFileStorage } from '@/shared/adapters/supabase-file-storage';
import type { PublicFileStorage } from '@/shared/ports/file-storage';

/** Bucket público de logos (supabase/config.toml; en producción se crea desde el Dashboard). */
export const BRAND_BUCKET = 'brand-assets';

let brand: PublicFileStorage | undefined;

export function getBrandStorage(): PublicFileStorage {
  brand ??= createSupabaseFileStorage({ bucket: BRAND_BUCKET });
  return brand;
}

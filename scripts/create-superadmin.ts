// Crea (o asegura) el primer SuperAdmin de la plataforma (E1-H4). Idempotente.
//   pnpm admin:create-superadmin                      → local: SEED_SUPERADMIN_EMAIL + SEED_DEFAULT_PASSWORD
//   pnpm admin:create-superadmin --allow-production   → fuera de local: contraseña aleatoria que no se
//                                                       muestra; el operador la fija con "¿Olvidaste tu contraseña?".
// Lee .env.local (si existe) y las variables del entorno. Nunca imprime contraseñas ni claves.
import { randomBytes } from 'node:crypto';

import { getEnv, parseSeedEnv } from '@/env';
import { bootstrapPlatformAdmin, BootstrapError, createPlatformStore } from '@/modules/identity';
import { createSupabaseAuthAdmin } from '@/shared/adapters/supabase-auth-admin';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function isLocalDatabase(url: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

async function main(): Promise<number> {
  const allowProduction = process.argv.includes('--allow-production');
  const env = getEnv();
  const seed = parseSeedEnv();
  const local = env.NODE_ENV !== 'production' && isLocalDatabase(env.DATABASE_URL_ADMIN);

  if (!local && !allowProduction) {
    process.stderr.write(
      'La base no es local. Si de verdad quieres crear el SuperAdmin ahí, vuelve a correr con --allow-production.\n',
    );
    return 1;
  }

  // Fuera de local nunca se usa la contraseña de demo.
  const password = local ? seed.SEED_DEFAULT_PASSWORD : randomBytes(32).toString('base64url');
  try {
    const result = await bootstrapPlatformAdmin(
      { email: seed.SEED_SUPERADMIN_EMAIL, password, fullName: 'SuperAdmin LinkUs' },
      { store: createPlatformStore(), authAdmin: createSupabaseAuthAdmin() },
    );
    const text = {
      created: 'SuperAdmin creado.',
      granted: 'El usuario ya existía: ahora es SuperAdmin.',
      unchanged: 'El usuario ya era SuperAdmin: no hubo cambios.',
    }[result];
    process.stdout.write(`${text}\n`);
    if (result === 'created' && !local) {
      process.stdout.write(
        'Fija la contraseña con "¿Olvidaste tu contraseña?" en la pantalla de inicio de sesión.\n',
      );
    }
    return 0;
  } catch (error) {
    if (error instanceof BootstrapError) {
      process.stderr.write(`${error.message}\n`);
      return 1;
    }
    throw error;
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(`No se pudo crear el SuperAdmin: ${String(error)}\n`);
    process.exit(1);
  },
);

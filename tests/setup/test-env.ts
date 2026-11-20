// Entorno ficticio y válido para las pruebas unitarias: `src/env.ts` se valida al importarse.
// Ningún valor es real.
export const TEST_ENV = {
  NODE_ENV: 'test',
  APP_URL: 'http://localhost:3000',
  SESSION_SECRET: 'test-session-secret-0123456789abcdef',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  DATABASE_URL: 'postgresql://app_user:app_user_password@127.0.0.1:54322/postgres',
  DATABASE_URL_ADMIN: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  MAIL_FROM: 'LinkUs <notificaciones@linkus.pe>',
  REMINDER_HOURS: '24',
} as const satisfies Record<string, string>;

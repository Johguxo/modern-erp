// Cola de jobs del proceso web (E2-H3): productor de solo envío, perezoso (`next build` compila sin
// .env.local y el proceso no abre conexiones hasta el primer envío).
import { getEnv } from '@/env';
import { createPgBossProducer, type JobProducer } from '@/shared/adapters/pg-boss-job-queue';
import { getLogger } from '@/shared/adapters/pino-logger';
import type { JobQueue } from '@/shared/ports/job-queue';

let producer: JobProducer | undefined;

export function getJobQueue(): JobQueue {
  producer ??= createPgBossProducer({
    connectionString: getEnv().DATABASE_URL_ADMIN,
    logger: getLogger().child({ process: 'web' }),
  });
  return producer;
}

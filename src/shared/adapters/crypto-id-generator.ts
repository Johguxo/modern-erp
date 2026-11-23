import { randomUUID } from 'node:crypto';

import type { IdGenerator } from '../ports/id-generator';

export const cryptoIdGenerator: IdGenerator = { newId: () => randomUUID() };

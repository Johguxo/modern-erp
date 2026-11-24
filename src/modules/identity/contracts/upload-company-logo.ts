import { z } from 'zod';

/** El archivo llega en FormData; el tipo y el tamaño los revisa el caso de uso por sus bytes. */
export const inputSchema = z.object({ logo: z.instanceof(File) });

export const outputSchema = z.object({ logoUrl: z.url() });

/**
 * Validación y saneamiento de entradas del módulo Bienes (zod).
 * El ID natural (matrícula / nº de serie) es OBLIGATORIO.
 */
import { z } from 'zod';
import { contactSchema } from './people';

const emptyToNull = (v: unknown) => (v === '' || v === undefined ? null : v);

export const createGoodSchema = z.object({
  goodType: z.enum(['vehicle', 'machinery', 'other']),
  naturalId: z.string().trim().min(2).max(40),
  direction: z.enum(['found', 'lost']),
  zone: z.preprocess(emptyToNull, z.string().trim().max(120).nullable()),
  description: z.preprocess(emptyToNull, z.string().trim().max(1000).nullable()),
  contact: contactSchema,
});

export const similarGoodsSchema = z.object({
  naturalId: z.preprocess(emptyToNull, z.string().trim().max(40).nullable()),
  goodType: z.preprocess(emptyToNull, z.enum(['vehicle', 'machinery', 'other']).nullable()),
  zone: z.preprocess(emptyToNull, z.string().trim().max(120).nullable()),
});

export type CreateGoodPayload = z.infer<typeof createGoodSchema>;

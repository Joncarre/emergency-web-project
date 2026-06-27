/**
 * Validación y saneamiento de entradas del módulo Ofertas/Necesidades (zod).
 */
import { z } from 'zod';
import { ALL_OFFER_CATEGORIES } from '@/lib/engine/types';
import { contactSchema } from './people';

const emptyToNull = (v: unknown) => (v === '' || v === undefined ? null : v);
const categoryEnum = z.enum(ALL_OFFER_CATEGORIES);

export const createOfferSchema = z.object({
  kind: z.enum(['offer', 'need']),
  category: categoryEnum,
  quantity: z.preprocess(emptyToNull, z.string().trim().max(80).nullable()),
  expiresAt: z.preprocess(
    emptyToNull,
    z
      .string()
      .nullable()
      .transform((v) => {
        if (!v) return null;
        const d = new Date(v);
        return Number.isNaN(d.getTime()) ? null : d.toISOString();
      }),
  ),
  zone: z.preprocess(emptyToNull, z.string().trim().max(120).nullable()),
  description: z.preprocess(emptyToNull, z.string().trim().max(1000).nullable()),
  contact: contactSchema,
});

export const matchOffersSchema = z.object({
  kind: z.enum(['offer', 'need']),
  category: categoryEnum,
  zone: z.preprocess(emptyToNull, z.string().trim().max(120).nullable()),
});

export type CreateOfferPayload = z.infer<typeof createOfferSchema>;

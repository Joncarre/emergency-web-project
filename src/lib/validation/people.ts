/**
 * Validación y saneamiento de entradas del módulo Personas (zod).
 * Toda escritura pasa por aquí: defensa frente a datos basura/XSS y base para
 * mensajes de error claros. `.trim()` + recortes de longitud = saneamiento básico.
 */
import { z } from 'zod';

const emptyToNull = (v: unknown) => (v === '' || v === undefined ? null : v);

export const contactSchema = z
  .preprocess(
    emptyToNull,
    z
      .object({
        method: z.enum(['phone', 'email', 'other']),
        value: z.string().trim().min(3).max(200),
      })
      .nullable(),
  )
  .nullable()
  .default(null);

export const createPersonSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  ageApprox: z.preprocess(
    emptyToNull,
    z.coerce.number().int().min(0).max(120).nullable(),
  ),
  lastSeenAt: z.preprocess(
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
  medicalNotes: z.preprocess(emptyToNull, z.string().trim().max(500).nullable()),
  direction: z.enum(['searching', 'found']),
  zone: z.preprocess(emptyToNull, z.string().trim().max(120).nullable()),
  description: z.preprocess(emptyToNull, z.string().trim().max(1000).nullable()),
  contact: contactSchema,
});

export const similarPeopleSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  zone: z.preprocess(emptyToNull, z.string().trim().max(120).nullable()),
  ageApprox: z.preprocess(emptyToNull, z.coerce.number().int().min(0).max(120).nullable()),
});

export const sightingSchema = z.object({
  note: z.preprocess(emptyToNull, z.string().trim().max(500).nullable()),
  zone: z.preprocess(emptyToNull, z.string().trim().max(120).nullable()),
  contact: contactSchema,
});

export const transitionSchema = z.object({
  to: z.string().trim().min(1).max(40),
});

export type CreatePersonPayload = z.infer<typeof createPersonSchema>;

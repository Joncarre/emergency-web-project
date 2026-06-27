/**
 * Validación y saneamiento de entradas del módulo Mascotas (zod).
 * Reutiliza el contacto protegido del módulo Personas.
 */
import { z } from 'zod';
import { contactSchema } from './people';

const emptyToNull = (v: unknown) => (v === '' || v === undefined ? null : v);

export const createPetSchema = z.object({
  species: z.enum(['dog', 'cat', 'other']),
  name: z.preprocess(emptyToNull, z.string().trim().max(80).nullable()),
  chipId: z.preprocess(emptyToNull, z.string().trim().max(40).nullable()),
  breed: z.preprocess(emptyToNull, z.string().trim().max(80).nullable()),
  direction: z.enum(['lost', 'found']),
  zone: z.preprocess(emptyToNull, z.string().trim().max(120).nullable()),
  description: z.preprocess(emptyToNull, z.string().trim().max(1000).nullable()),
  contact: contactSchema,
});

export const similarPetsSchema = z.object({
  species: z.preprocess(emptyToNull, z.enum(['dog', 'cat', 'other']).nullable()),
  name: z.preprocess(emptyToNull, z.string().trim().max(80).nullable()),
  breed: z.preprocess(emptyToNull, z.string().trim().max(80).nullable()),
  chipId: z.preprocess(emptyToNull, z.string().trim().max(40).nullable()),
  zone: z.preprocess(emptyToNull, z.string().trim().max(120).nullable()),
});

export type CreatePetPayload = z.infer<typeof createPetSchema>;

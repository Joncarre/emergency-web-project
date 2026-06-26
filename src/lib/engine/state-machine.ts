/**
 * Máquina de estados genérica del motor. Las reglas viven en el registro de
 * módulos (modules.ts); aquí solo se evalúan. Esto concilia el principio
 * "no cualquiera puede resolver" con "cualquiera puede aportar una pista".
 */
import type { Actor, ModuleId } from './types';
import { getModule, type TransitionDef } from './modules';

export function getTransition(
  moduleId: ModuleId,
  from: string,
  to: string,
): TransitionDef | undefined {
  return getModule(moduleId).transitions.find((t) => t.from === from && t.to === to);
}

/** Transiciones que `actor` puede ejecutar desde el estado `from`. */
export function availableTransitions(
  moduleId: ModuleId,
  from: string,
  actor: Actor,
): TransitionDef[] {
  return getModule(moduleId).transitions.filter(
    (t) => t.from === from && t.by.includes(actor),
  );
}

export function canTransition(
  moduleId: ModuleId,
  from: string,
  to: string,
  actor: Actor,
): boolean {
  const t = getTransition(moduleId, from, to);
  return !!t && t.by.includes(actor);
}

export class TransitionError extends Error {
  constructor(
    public readonly code: 'invalid_transition' | 'forbidden',
    message: string,
  ) {
    super(message);
    this.name = 'TransitionError';
  }
}

/**
 * Valida una transición y devuelve el estado destino. Lanza TransitionError si
 * la transición no existe o el actor no está autorizado.
 */
export function assertTransition(
  moduleId: ModuleId,
  from: string,
  to: string,
  actor: Actor,
): string {
  const t = getTransition(moduleId, from, to);
  if (!t) {
    throw new TransitionError('invalid_transition', `No existe transición ${from} → ${to}`);
  }
  if (!t.by.includes(actor)) {
    throw new TransitionError('forbidden', `El actor "${actor}" no puede ${from} → ${to}`);
  }
  return to;
}

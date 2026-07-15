import { Effect, Option } from "effect";
import { SessionStore, type WizardState } from "../services/SessionStore.js";
import { runtime } from "./runtime.js";

export type { WizardState };

export function createWizard(state: WizardState): string {
  return runtime.runSync(Effect.flatMap(SessionStore, (s) => s.createWizard(state)));
}

export function getWizard(id: string): WizardState | null {
  return Option.getOrNull(runtime.runSync(Effect.flatMap(SessionStore, (s) => s.getWizard(id))));
}

export function updateWizard(id: string, patch: Partial<WizardState>): boolean {
  return runtime.runSync(Effect.flatMap(SessionStore, (s) => s.updateWizard(id, patch)));
}

export function deleteWizard(id: string): void {
  runtime.runSync(Effect.flatMap(SessionStore, (s) => s.deleteWizard(id)));
}

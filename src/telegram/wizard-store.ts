// Wizard state store for multi-step create flow.
const TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface WizardState {
  poolAddress: string;
  poolName: string;
  binStep: number;
  currentPrice: number;
  strategy?: string;
  mode?: "two-sided" | "single-x" | "single-y";
}

interface Entry {
  state: WizardState;
  expiresAt: number;
}

const store = new Map<string, Entry>();
let counter = 0;

export function createWizard(state: WizardState): string {
  const id = `w${++counter}`;
  store.set(id, { state, expiresAt: Date.now() + TTL_MS });
  return id;
}

export function getWizard(id: string): WizardState | null {
  const entry = store.get(id);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(id);
    return null;
  }
  return entry.state;
}

export function updateWizard(id: string, patch: Partial<WizardState>): boolean {
  const entry = store.get(id);
  if (!entry || Date.now() > entry.expiresAt) return false;
  Object.assign(entry.state, patch);
  entry.expiresAt = Date.now() + TTL_MS; // refresh TTL on update
  return true;
}

export function deleteWizard(id: string): void {
  store.delete(id);
}

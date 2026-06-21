// Short-lived store mapping a compact ID to a pool+position pair.
// Used by inline keyboard buttons to avoid the 64-byte callback_data limit.
const TTL_MS = 10 * 60 * 1000; // 10 minutes

interface Entry {
  poolAddress: string;
  positionPubkey: string;
  expiresAt: number;
}

const store = new Map<string, Entry>();
let counter = 0;

export function registerAction(poolAddress: string, positionPubkey: string): string {
  const id = `a${++counter}`;
  store.set(id, { poolAddress, positionPubkey, expiresAt: Date.now() + TTL_MS });
  return id;
}

export function resolveAction(id: string): { poolAddress: string; positionPubkey: string } | null {
  const entry = store.get(id);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(id);
    return null;
  }
  return { poolAddress: entry.poolAddress, positionPubkey: entry.positionPubkey };
}

export function deleteAction(id: string): void {
  store.delete(id);
}

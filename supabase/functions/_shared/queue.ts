export function stableHash(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function retryDelaySeconds(attemptNumber: number, idempotencyKey: string): number {
  const exponential = Math.min(900, 15 * 2 ** Math.max(0, attemptNumber - 1));
  const jitter = stableHash(idempotencyKey) % Math.max(1, Math.floor(exponential * 0.2));
  return exponential + jitter;
}

export function nextRetryAt(attemptNumber: number, idempotencyKey: string, retryAfterSeconds?: number): string {
  const delay = Math.max(retryDelaySeconds(attemptNumber, idempotencyKey), retryAfterSeconds ?? 0);
  return new Date(Date.now() + delay * 1000).toISOString();
}

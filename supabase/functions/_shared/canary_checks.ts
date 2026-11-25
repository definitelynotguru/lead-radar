export type CanaryCheckStatus = { ok: boolean; detail: string };

export function evaluateQueueCounts(
  counts: Record<string, number>,
  deadLetters: number,
): Record<string, CanaryCheckStatus> {
  const backlog = (counts.pending ?? 0) + (counts.failed ?? 0);
  const ambiguous = counts.ambiguous ?? 0;
  return {
    queue_backlog: {
      ok: backlog < 100,
      detail: `${backlog} pending/failed job(s), ${ambiguous} ambiguous, ${deadLetters} dead-lettered`,
    },
    queue_dead_letters: {
      ok: deadLetters === 0,
      detail: deadLetters === 0 ? "dead-letter queue empty" : `${deadLetters} job(s) require requeue or cancellation`,
    },
    queue_ambiguous: {
      ok: ambiguous === 0,
      detail: ambiguous === 0
        ? "no ambiguous deliveries"
        : `${ambiguous} uncertain Discord delivery(ies) require inspection`,
    },
  };
}

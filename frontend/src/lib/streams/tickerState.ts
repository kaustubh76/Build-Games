/**
 * Module-scope SSE subscriber state for /api/markets/ticker/stream.
 * Mirror of whaleAlertsState.ts — separate module so the two streams have
 * independent counters (a saturated whale-alerts cap shouldn't block the ticker).
 */

export const MAX_TOTAL_SUBSCRIBERS = 1000;
export const MAX_PER_IP = 4;

let totalSubscribers = 0;
const perIpSubscribers = new Map<string, number>();

export function getTotalSubscribers(): number {
  return totalSubscribers;
}

export function tryReserveSlot(ip: string): {
  ok: true;
} | {
  ok: false;
  reason: 'max_total' | 'max_per_ip';
} {
  if (totalSubscribers >= MAX_TOTAL_SUBSCRIBERS) {
    return { ok: false, reason: 'max_total' };
  }
  const ipCount = perIpSubscribers.get(ip) ?? 0;
  if (ipCount >= MAX_PER_IP) {
    return { ok: false, reason: 'max_per_ip' };
  }
  totalSubscribers += 1;
  perIpSubscribers.set(ip, ipCount + 1);
  return { ok: true };
}

export function releaseSlot(ip: string): void {
  totalSubscribers = Math.max(0, totalSubscribers - 1);
  const next = (perIpSubscribers.get(ip) ?? 1) - 1;
  if (next <= 0) perIpSubscribers.delete(ip);
  else perIpSubscribers.set(ip, next);
}

function assertNotProduction(name: string): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${name} is unavailable in production`);
  }
}

export function __getTickerStreamState(): {
  totalSubscribers: number;
  perIpEntries: Array<{ ip: string; count: number }>;
} {
  assertNotProduction('__getTickerStreamState');
  return {
    totalSubscribers,
    perIpEntries: Array.from(perIpSubscribers.entries()).map(([ip, count]) => ({
      ip,
      count,
    })),
  };
}

export function __resetTickerStreamState(): void {
  assertNotProduction('__resetTickerStreamState');
  totalSubscribers = 0;
  perIpSubscribers.clear();
}

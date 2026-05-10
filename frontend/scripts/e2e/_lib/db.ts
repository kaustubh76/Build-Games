/**
 * Shared Prisma client + helpers for the e2e harness.
 *
 * `waitForRow` polls until the indexer (or our seeder) has written the
 * row we're expecting — useful when a script triggers a chain tx and
 * needs to confirm the indexer caught it.
 */
import './env';
import { PrismaClient } from '@prisma/client';

let _prisma: PrismaClient | null = null;
export function getPrisma(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient({ log: ['error', 'warn'] });
  }
  return _prisma;
}

export async function disconnect(): Promise<void> {
  if (_prisma) await _prisma.$disconnect();
}

export async function waitFor<T>(
  fn: () => Promise<T | null | undefined>,
  opts: { label: string; timeoutMs?: number; intervalMs?: number } = { label: 'waitFor' }
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const intervalMs = opts.intervalMs ?? 500;
  const deadline = Date.now() + timeoutMs;
  let last: T | null | undefined = null;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms: ${opts.label}`);
}

/**
 * Minimal assertion helpers. Throws so the script exits non-zero on failure.
 * Coloured output so a quick scroll of the orchestrator log reads at a glance.
 */
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';

export function step(msg: string): void {
  console.log(`\n${BOLD}${CYAN}▸ ${msg}${RESET}`);
}

export function info(msg: string): void {
  console.log(`  ${msg}`);
}

export function pass(msg: string): void {
  console.log(`  ${GREEN}✔${RESET} ${msg}`);
}

export function warn(msg: string): void {
  console.log(`  ${YELLOW}⚠${RESET} ${msg}`);
}

export function fail(msg: string): never {
  console.error(`  ${RED}✘${RESET} ${msg}`);
  process.exit(1);
}

export function expectEq<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    fail(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
  pass(label);
}

export function expectTrue(cond: unknown, label: string): asserts cond {
  if (!cond) fail(label);
  pass(label);
}

export function expectGte(actual: number | bigint, min: number | bigint, label: string): void {
  const a = typeof actual === 'bigint' ? actual : BigInt(actual);
  const m = typeof min === 'bigint' ? min : BigInt(min);
  if (a < m) fail(`${label}: expected >= ${m}, got ${a}`);
  pass(`${label} (${actual} >= ${min})`);
}

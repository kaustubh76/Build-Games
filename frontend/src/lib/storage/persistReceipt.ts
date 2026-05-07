/**
 * persistReceipt — standardised wrapper around zgUpload for the Prisma → 0G
 * migration. Every replacement Prisma write (audit logs, event-sourced
 * receipts, transcript bundles) flows through this single helper so we get:
 *
 *   - Versioned, typed envelope (callers can't forget `version` / `type` / `ts`)
 *   - Single metric surface (`zg_receipt_persisted_total{type=...}`,
 *     `zg_receipt_failed_total{type=...,reason=...}`)
 *   - Graceful no-op when 0G isn't configured (returns null with metric, never
 *     throws — so dual-write callers can keep their Prisma row as the
 *     load-bearing path during rollout)
 *   - Structured logger entry with the rootHash, so operators can grep logs
 *     to find historical receipts
 *
 * See `src/lib/storage/README.md` for the rollout sequence.
 */

import { upload as zgUpload, isZgConfigured } from '@/services/zgStorageService';
import { chainMetrics } from '@/lib/metrics';
import { log } from '@/lib/api/logger';

export interface ReceiptEnvelope<T extends string, P> {
  /** Schema version of the envelope itself. Bump when the envelope shape changes. */
  version: string;
  /** Receipt category — used as a metric label, must be a stable string literal. */
  type: T;
  /** Server timestamp at persist time (ms). */
  ts: number;
  /** The actual data being persisted. Shape is up to the caller. */
  payload: P;
}

export interface ReceiptResult {
  rootHash: string;
  /** Empty string when the SDK didn't surface a tx hash. */
  txHash: string;
}

/**
 * Persist a versioned receipt to 0G Storage. Returns the result on success,
 * or null when 0G isn't configured / the upload failed. Never throws — the
 * idea is that the calling route's primary path (Prisma row, on-chain tx,
 * etc.) is unaffected by 0G-side trouble.
 *
 * The filename is purely a hint passed to the SDK — the rootHash is the
 * actual handle. Keep filenames human-grep-able (`synclog-${ts}.json` style).
 */
export async function persistReceipt<T extends string, P>(
  envelope: ReceiptEnvelope<T, P>,
  filename: string
): Promise<ReceiptResult | null> {
  if (!isZgConfigured()) {
    chainMetrics.incrementCounter('zg_receipt_failed_total', 1, {
      type: envelope.type,
      reason: 'not_configured',
    });
    return null;
  }

  let buf: Buffer;
  try {
    buf = Buffer.from(JSON.stringify(envelope));
  } catch (e) {
    chainMetrics.incrementCounter('zg_receipt_failed_total', 1, {
      type: envelope.type,
      reason: 'serialize_error',
    });
    log.warn('[persistReceipt] failed to serialize envelope', {
      type: envelope.type,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }

  try {
    const { rootHash, txHash } = await zgUpload(buf, filename);
    chainMetrics.incrementCounter('zg_receipt_persisted_total', 1, {
      type: envelope.type,
    });
    log.info('[persistReceipt] persisted', {
      type: envelope.type,
      rootHash,
      txHash: txHash || null,
      bytes: buf.length,
    });
    return { rootHash, txHash };
  } catch (e) {
    chainMetrics.incrementCounter('zg_receipt_failed_total', 1, {
      type: envelope.type,
      reason: 'upload_error',
    });
    log.warn('[persistReceipt] upload failed', {
      type: envelope.type,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/**
 * Convenience builder so callers don't have to repeat `version: '1.0.0'`.
 * Use `buildEnvelope({ type: 'sync-log', payload: {...} })`.
 */
export function buildEnvelope<T extends string, P>(args: {
  type: T;
  payload: P;
  version?: string;
  ts?: number;
}): ReceiptEnvelope<T, P> {
  return {
    version: args.version ?? '1.0.0',
    type: args.type,
    ts: args.ts ?? Date.now(),
    payload: args.payload,
  };
}

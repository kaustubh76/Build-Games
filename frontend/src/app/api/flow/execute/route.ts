/**
 * DEPRECATED — kept as a thin alias.
 *
 * Renamed to /api/mirror/execute. The legacy "flow" path name does NOT mean
 * the Flow blockchain — every action targets the Avalanche-deployed
 * ExternalMarketMirror contract. New code should call /api/mirror/execute.
 */
export { POST } from '@/app/api/mirror/execute/route';

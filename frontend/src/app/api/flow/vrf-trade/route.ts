/**
 * DEPRECATED — kept as a thin alias.
 *
 * Renamed to /api/mirror/positions. The "vrf-trade" name was misleading; this
 * endpoint returns aggregated mirror-market positions sourced from on-chain
 * `MirrorTradeExecuted` events on Avalanche. Some positions originated via
 * `vrfCopyTrade` (randomness-driven copy trades) and are flagged with usedVRF=true.
 *
 * Use /api/mirror/positions in new code.
 */
export { GET } from '@/app/api/mirror/positions/route';

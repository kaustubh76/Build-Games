/**
 * Wire the in-process whale-alert callback into the Telegram bot.
 *
 * Mounted from src/app/providers.tsx via a server-only import (it touches
 * `whaleTrackerService` which holds WS connections). Idempotent — re-imports
 * during dev hot-reload are guarded.
 */

import { whaleTrackerService } from '@/services/externalMarkets/whaleTrackerService';
import type { WhaleTrade } from '@/types/externalMarket';
import { findMatchingSubscribers } from '@/lib/telegram/subscriptions';
import { sendTelegramMessage } from '@/lib/telegram/sendMessage';
import { chainMetrics } from '@/lib/metrics';

let wired = false;

function formatAlert(trade: WhaleTrade): string {
  const amountUsd = parseFloat(trade.amountUsd);
  const formatted = amountUsd >= 1_000_000
    ? `$${(amountUsd / 1_000_000).toFixed(2)}M`
    : amountUsd >= 1_000
    ? `$${(amountUsd / 1_000).toFixed(1)}K`
    : `$${amountUsd.toFixed(0)}`;
  return (
    `🐋 *Whale Alert* (${trade.source})\n` +
    `${trade.side.toUpperCase()} ${trade.outcome.toUpperCase()} for ${formatted}\n` +
    `${trade.marketQuestion}\n` +
    (trade.traderAddress ? `Trader: ${trade.traderAddress.slice(0, 8)}…\n` : '')
  );
}

export function wireTelegramWhaleAlerts(): void {
  if (wired) return;
  wired = true;
  whaleTrackerService.onWhaleAlert(async (trade) => {
    try {
      const amountUsd = parseFloat(trade.amountUsd);
      // trade.source is the MarketSource enum; cast through unknown to the
      // string-literal union the subscription registry uses.
      const sourceStr = String(trade.source).toUpperCase() as 'POLYMARKET' | 'KALSHI';
      if (sourceStr !== 'POLYMARKET' && sourceStr !== 'KALSHI') return;
      const subs = findMatchingSubscribers(amountUsd, sourceStr);
      if (subs.length === 0) return;
      const message = formatAlert(trade);
      const results = await Promise.allSettled(
        subs.map((s) => sendTelegramMessage(s.telegramChatId, message))
      );
      const sent = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length;
      const failed = results.length - sent;
      chainMetrics.incrementCounter('telegram_alerts_sent_total', sent);
      if (failed > 0) {
        chainMetrics.incrementCounter('telegram_alerts_failed_total', failed);
      }
    } catch (e) {
      console.error('[telegram] whale-alert fan-out failed', e);
      chainMetrics.incrementCounter('telegram_alerts_handler_errors_total');
    }
  });
}

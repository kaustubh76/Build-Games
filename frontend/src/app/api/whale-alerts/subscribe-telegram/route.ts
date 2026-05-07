import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';
import { requireSessionForAddress } from '@/lib/auth/requireSession';
import {
  getSubscription,
  upsertSubscription,
  removeSubscription,
  getSnapshotRootHash,
} from '@/lib/telegram/subscriptions';
import { sendTelegramMessage } from '@/lib/telegram/sendMessage';

/**
 * Telegram whale-alert subscription endpoint.
 *
 *  POST   { userAddress, telegramChatId, thresholdUsd?, sources? }  → upsert
 *  GET    ?address=…                                                 → status
 *  DELETE ?address=…                                                 → unsubscribe
 *
 * Subscribers are stored in-process (with best-effort 0G persistence).
 * The bot sends a confirmation message via TELEGRAM_BOT_TOKEN on subscribe;
 * if the token isn't set, the endpoint still records the subscription but
 * marks `botEnabled: false` so the UI can warn.
 */

const PostSchema = z.object({
  userAddress: z.string().regex(/^0[xX][0-9a-fA-F]{40}$/),
  telegramChatId: z.string().min(1).max(64),
  thresholdUsd: z.number().int().min(100).max(10_000_000).optional(),
  sources: z
    .array(z.union([z.literal('POLYMARKET'), z.literal('KALSHI')]))
    .min(1)
    .max(2)
    .optional(),
});

const DEFAULT_THRESHOLD_USD = 10_000;

export async function POST(request: NextRequest) {
  try {
    applyRateLimit(request, {
      prefix: 'telegram-subscribe',
      maxRequests: 10,
      windowMs: 60_000,
    });
    const raw = await request.json().catch(() => null);
    const parsed = PostSchema.safeParse(raw);
    if (!parsed.success) {
      throw ErrorResponses.badRequest(
        `Invalid body: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`
      );
    }
    const { userAddress, telegramChatId, thresholdUsd, sources } = parsed.data;

    // SIWE guard: a user can't bind THEIR telegram chat to someone else's wallet.
    requireSessionForAddress(request, userAddress);

    const sub = await upsertSubscription({
      userAddress,
      telegramChatId,
      thresholdUsd: thresholdUsd ?? DEFAULT_THRESHOLD_USD,
      sources: sources ?? ['POLYMARKET', 'KALSHI'],
    });

    // Best-effort confirmation.
    const send = await sendTelegramMessage(
      telegramChatId,
      `🐋 Whale alerts subscribed for ${userAddress.slice(0, 6)}…${userAddress.slice(-4)}\n` +
        `Threshold: $${sub.thresholdUsd.toLocaleString()}\n` +
        `Sources: ${sub.sources.join(', ')}\n\n` +
        `You'll get a message when a whale trade matches.`
    );

    return NextResponse.json({
      success: true,
      subscription: sub,
      botEnabled: send.ok,
      botStatus: send.reason,
      snapshotRootHash: getSnapshotRootHash(),
    });
  } catch (error) {
    return handleAPIError(error, 'API:WhaleAlerts:SubscribeTelegram:POST');
  }
}

export async function GET(request: NextRequest) {
  try {
    applyRateLimit(request, {
      prefix: 'telegram-subscribe-get',
      maxRequests: 60,
      windowMs: 60_000,
    });
    const address = request.nextUrl.searchParams.get('address');
    if (!address || !/^0[xX][0-9a-fA-F]{40}$/.test(address)) {
      throw ErrorResponses.badRequest('Missing or invalid address');
    }
    const sub = getSubscription(address);
    return NextResponse.json({
      subscribed: !!sub,
      subscription: sub,
      botEnabled: !!process.env.TELEGRAM_BOT_TOKEN,
    });
  } catch (error) {
    return handleAPIError(error, 'API:WhaleAlerts:SubscribeTelegram:GET');
  }
}

export async function DELETE(request: NextRequest) {
  try {
    applyRateLimit(request, {
      prefix: 'telegram-subscribe-delete',
      maxRequests: 10,
      windowMs: 60_000,
    });
    const address = request.nextUrl.searchParams.get('address');
    if (!address || !/^0[xX][0-9a-fA-F]{40}$/.test(address)) {
      throw ErrorResponses.badRequest('Missing or invalid address');
    }
    // SIWE guard: only the wallet owner may delete their own subscription.
    requireSessionForAddress(request, address);
    const removed = await removeSubscription(address);
    return NextResponse.json({ removed });
  } catch (error) {
    return handleAPIError(error, 'API:WhaleAlerts:SubscribeTelegram:DELETE');
  }
}

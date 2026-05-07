/**
 * Integration tests for /api/whale-alerts/subscribe-telegram.
 *
 * No real Telegram bot is configured in CI (TELEGRAM_BOT_TOKEN unset), so
 * `botEnabled: false` is the expected steady-state. Tests assert the registry
 * does its job (upsert / get / delete) regardless of bot availability.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const ROUTE_PATH = '@/app/api/whale-alerts/subscribe-telegram/route';
const ADDR = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/whale-alerts/subscribe-telegram', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function makeGet(addr: string): NextRequest {
  return new NextRequest(`http://test/api/whale-alerts/subscribe-telegram?address=${addr}`);
}
function makeDelete(addr: string): NextRequest {
  return new NextRequest(
    `http://test/api/whale-alerts/subscribe-telegram?address=${addr}`,
    { method: 'DELETE' }
  );
}

beforeEach(() => {
  // Reset registry state between tests
  vi.resetModules();
});

describe('/api/whale-alerts/subscribe-telegram', () => {
  it('POST upserts a subscription and reports botEnabled false when no token', async () => {
    const { POST } = await import(ROUTE_PATH);
    const res = await POST(
      makePost({ userAddress: ADDR, telegramChatId: '12345', thresholdUsd: 25_000 })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.subscription).toMatchObject({
      userAddress: ADDR,
      telegramChatId: '12345',
      thresholdUsd: 25_000,
      sources: ['POLYMARKET', 'KALSHI'],
    });
    // No TELEGRAM_BOT_TOKEN in test env → botEnabled false but still records sub
    expect(body.botEnabled).toBe(false);
    expect(body.botStatus).toMatch(/TELEGRAM_BOT_TOKEN not configured/);
  });

  it('POST rejects malformed userAddress', async () => {
    const { POST } = await import(ROUTE_PATH);
    const res = await POST(makePost({ userAddress: '0xnope', telegramChatId: '1' }));
    expect(res.status).toBe(400);
  });

  it('POST rejects missing telegramChatId', async () => {
    const { POST } = await import(ROUTE_PATH);
    const res = await POST(makePost({ userAddress: ADDR }));
    expect(res.status).toBe(400);
  });

  it('POST rejects threshold below 100 or above 10M', async () => {
    const { POST } = await import(ROUTE_PATH);
    const r1 = await POST(
      makePost({ userAddress: ADDR, telegramChatId: '1', thresholdUsd: 1 })
    );
    expect(r1.status).toBe(400);
    const r2 = await POST(
      makePost({ userAddress: ADDR, telegramChatId: '1', thresholdUsd: 99_999_999 })
    );
    expect(r2.status).toBe(400);
  });

  it('POST defaults thresholdUsd to 10_000 + sources to both', async () => {
    const { POST } = await import(ROUTE_PATH);
    const res = await POST(makePost({ userAddress: ADDR, telegramChatId: '777' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subscription.thresholdUsd).toBe(10_000);
    expect(body.subscription.sources).toEqual(['POLYMARKET', 'KALSHI']);
  });

  it('GET returns subscribed:false for unknown address', async () => {
    const { GET } = await import(ROUTE_PATH);
    const res = await GET(makeGet('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subscribed).toBe(false);
    expect(body.subscription).toBeNull();
  });

  it('GET reflects an upserted subscription within the same module instance', async () => {
    const mod = await import(ROUTE_PATH);
    await mod.POST(makePost({ userAddress: ADDR, telegramChatId: 'abc', thresholdUsd: 50000 }));
    const res = await mod.GET(makeGet(ADDR));
    const body = await res.json();
    expect(body.subscribed).toBe(true);
    expect(body.subscription.telegramChatId).toBe('abc');
    expect(body.subscription.thresholdUsd).toBe(50000);
  });

  it('DELETE removes a subscription', async () => {
    const mod = await import(ROUTE_PATH);
    await mod.POST(makePost({ userAddress: ADDR, telegramChatId: 'x' }));
    const del = await mod.DELETE(makeDelete(ADDR));
    expect(del.status).toBe(200);
    const body = await del.json();
    expect(body.removed).toBe(true);
    // Confirm via GET
    const get = await mod.GET(makeGet(ADDR));
    const getBody = await get.json();
    expect(getBody.subscribed).toBe(false);
  });

  it('DELETE returns removed:false when nothing was there', async () => {
    const { DELETE } = await import(ROUTE_PATH);
    const res = await DELETE(makeDelete('0xcccccccccccccccccccccccccccccccccccccccc'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.removed).toBe(false);
  });

  it('DELETE rejects malformed address', async () => {
    const { DELETE } = await import(ROUTE_PATH);
    const res = await DELETE(makeDelete('0xnope'));
    expect(res.status).toBe(400);
  });

  it('treats addresses case-insensitively', async () => {
    const mod = await import(ROUTE_PATH);
    await mod.POST(makePost({ userAddress: ADDR.toUpperCase(), telegramChatId: 'caps' }));
    const get = await mod.GET(makeGet(ADDR.toLowerCase()));
    const body = await get.json();
    expect(body.subscribed).toBe(true);
    expect(body.subscription.telegramChatId).toBe('caps');
  });
});

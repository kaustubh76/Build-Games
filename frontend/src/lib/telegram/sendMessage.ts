/**
 * Minimal Telegram Bot API wrapper. No external deps.
 *
 * Returns { ok: true } on success, { ok: false, reason } on missing token
 * or API error so callers can decide how loud to be (subscribe endpoint
 * surfaces the reason in the response so the UI can warn).
 */

interface SendResult {
  ok: boolean;
  reason?: string;
}

export async function sendTelegramMessage(
  chatId: string,
  text: string
): Promise<SendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return { ok: false, reason: 'TELEGRAM_BOT_TOKEN not configured' };
  }
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => 'unknown');
      return { ok: false, reason: `Telegram API ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : 'Telegram send failed',
    };
  }
}

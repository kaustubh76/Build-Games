/**
 * HTTP helper for hitting local dev API routes.
 * Uses the running dev server (default http://localhost:3000) so we
 * exercise the real handler chain (validation, error handling, auth).
 */
import { API_BASE } from './env';

export async function apiGet<T = unknown>(path: string): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API_BASE}${path}`);
  const text = await res.text();
  let body: T;
  try {
    body = JSON.parse(text) as T;
  } catch {
    body = text as unknown as T;
  }
  return { status: res.status, body };
}

export async function apiPost<T = unknown>(
  path: string,
  payload: unknown,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body: T;
  try {
    body = JSON.parse(text) as T;
  } catch {
    body = text as unknown as T;
  }
  return { status: res.status, body };
}

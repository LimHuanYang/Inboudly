import { createSupabaseBrowserClient } from './supabase/client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function authHeader(): Promise<HeadersInit> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * NestJS error responses use the shape:
 *   { message: "...", error: "Forbidden", statusCode: 403 }
 * Sometimes `message` is itself a string array (validation errors).
 * This extracts the human-readable string so the toast is clean.
 */
function extractErrorMessage(status: number, body: string): string {
  try {
    const j = JSON.parse(body);
    if (Array.isArray(j.message)) return j.message.join(' · ');
    if (typeof j.message === 'string') return j.message;
    if (typeof j.error === 'string') return j.error;
  } catch {
    // body wasn't JSON, fall through
  }
  return `API ${status}: ${body.slice(0, 200)}`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(await authHeader()),
    ...(init.headers ?? {}),
  };
  const res = await fetch(`${API_URL}/api/v1${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(extractErrorMessage(res.status, text));
  }

  // NestJS sometimes returns 200 OK with an empty body when a handler
  // returns `null` or `undefined` — calling `res.json()` on that throws
  // "Unexpected end of JSON input". Treat empty/whitespace body and
  // 204 No Content as `null` so callers can do `data ?? fallback`.
  if (res.status === 204) return null as T;
  const text = await res.text();
  if (!text.trim()) return null as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `Invalid JSON response (status ${res.status}): ${text.slice(0, 200)}`,
    );
  }
}

export const api = {
  get: <T>(p: string) => request<T>(p),
  post: <T>(p: string, body?: unknown) => request<T>(p, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(p: string, body?: unknown) =>
    request<T>(p, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(p: string, body?: unknown) =>
    request<T>(p, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(p: string) => request<T>(p, { method: 'DELETE' }),
};

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
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(p: string) => request<T>(p),
  post: <T>(p: string, body?: unknown) => request<T>(p, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(p: string, body?: unknown) =>
    request<T>(p, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(p: string) => request<T>(p, { method: 'DELETE' }),
};

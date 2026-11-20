export type AuthUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

export type AuthSession = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: AuthUser;
};

declare global {
  interface Window {
    __MESTRE_INTERIOR_CONFIG__?: {
      supabaseUrl?: string;
      supabaseAnonKey?: string;
    };
  }
}

type SupabaseConfig = { supabaseUrl?: string; supabaseAnonKey?: string };
let runtimeConfig: SupabaseConfig = typeof window !== "undefined" ? (window.__MESTRE_INTERIOR_CONFIG__ ?? {}) : {};
let configPromise: Promise<boolean> | null = null;
const SESSION_KEY = "mestre-interior:auth-session";

export function getSupabaseConfig() {
  return { url: (import.meta.env.VITE_SUPABASE_URL || runtimeConfig.supabaseUrl || "").replace(/\/$/, ""), anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || runtimeConfig.supabaseAnonKey || "" };
}
export function isAuthConfigured() { const c = getSupabaseConfig(); return Boolean(c.url && c.anonKey); }
export function initializeAuthConfig(): Promise<boolean> {
  if (isAuthConfigured()) return Promise.resolve(true);
  if (!configPromise) configPromise = fetch("/api/runtime-config", { cache: "no-store" }).then(async r => { if (!r.ok) throw new Error("Configuração indisponível."); runtimeConfig = await r.json() as SupabaseConfig; if (typeof window !== "undefined") window.__MESTRE_INTERIOR_CONFIG__ = runtimeConfig; return isAuthConfigured(); }).catch(e => { console.error("Falha ao carregar configuração Supabase.", e); return false; });
  return configPromise;
}

function headers(token?: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    apikey: getSupabaseConfig().anonKey,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function getStoredSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as AuthSession;
    if (!session.access_token || !session.refresh_token || !session.user?.id) return null;
    return session;
  } catch {
    return null;
  }
}

function storeSession(session: AuthSession | null) {
  if (typeof window === "undefined") return;
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

async function authRequest(path: string, body: Record<string, unknown>) {
  const config = getSupabaseConfig();
  if (!isAuthConfigured()) throw new Error("O sistema de contas ainda não foi configurado.");
  const response = await fetch(`${config.url}/auth/v1/${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload.msg === "string" ? payload.msg
      : typeof payload.message === "string" ? payload.message
      : typeof payload.error_description === "string" ? payload.error_description
      : "Não foi possível concluir a autenticação.";
    throw new Error(message);
  }
  return payload;
}

export async function signUp(email: string, password: string) {
  // Explicitly send confirmation emails back to the current site origin.
  // This avoids Supabase falling back to a stale localhost Site URL.
  const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/` : undefined;
  const signupPath = redirectTo
    ? `signup?redirect_to=${encodeURIComponent(redirectTo)}`
    : "signup";
  const payload = await authRequest(signupPath, { email, password });
  if (payload.access_token && payload.refresh_token && payload.user) {
    storeSession({
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      expires_at: payload.expires_at,
      user: payload.user,
    });
  }
  return payload as { access_token?: string; user?: AuthUser };
}

export async function signIn(email: string, password: string) {
  const payload = await authRequest("token?grant_type=password", { email, password });
  const session: AuthSession = {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at: payload.expires_at,
    user: payload.user,
  };
  storeSession(session);
  return session;
}

export async function signOut() {
  const session = getStoredSession();
  if (session && isAuthConfigured()) {
    await fetch(`${getSupabaseConfig().url}/auth/v1/logout`, {
      method: "POST",
      headers: headers(session.access_token),
    }).catch(() => undefined);
  }
  storeSession(null);
}

export async function getSession(): Promise<AuthSession | null> {
  const session = getStoredSession();
  if (!session) return null;
  if (session.expires_at && session.expires_at * 1000 > Date.now() + 60_000) return session;
  if (!isAuthConfigured()) return session;

  try {
    const payload = await authRequest("token?grant_type=refresh_token", {
      refresh_token: session.refresh_token,
    });
    const refreshed: AuthSession = {
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      expires_at: payload.expires_at,
      user: payload.user,
    };
    storeSession(refreshed);
    return refreshed;
  } catch {
    storeSession(null);
    return null;
  }
}

export function getCurrentUser(): AuthUser | null {
  return getStoredSession()?.user ?? null;
}

/**
 * Restores the implicit-flow session after the user confirms their email.
 * Supabase redirects back to the configured Site URL with tokens in the URL fragment.
 */
export async function restoreSessionFromUrl(): Promise<boolean> {
  if (typeof window === "undefined" || !isAuthConfigured()) return false;
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const accessToken = fragment.get("access_token");
  const refreshToken = fragment.get("refresh_token");
  if (!accessToken || !refreshToken) return false;

  try {
    const response = await fetch(`${getSupabaseConfig().url}/auth/v1/user`, {
      method: "GET",
      headers: headers(accessToken),
    });
    if (!response.ok) throw new Error("Não foi possível validar a confirmação do e-mail.");
    const user = await response.json() as AuthUser;
    const expiresIn = Number(fragment.get("expires_in") ?? 3600);
    storeSession({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: Math.floor(Date.now() / 1000) + expiresIn,
      user,
    });
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
    return true;
  } catch (error) {
    console.error("Falha ao restaurar a sessão após confirmação de e-mail.", error);
    return false;
  }
}

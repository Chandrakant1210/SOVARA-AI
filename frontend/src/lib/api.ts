// src/lib/api.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const TOKEN_KEY = "sovara_token";

export function getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
}

/**
 * fetch wrapper that automatically attaches the JWT Authorization header.
 * Use this for every request to a protected /api/* endpoint instead of
 * calling fetch() directly.
 */
export async function authFetch(path: string, options: RequestInit = {}) {
    const token = getToken();

    const headers = new Headers(options.headers);

    if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
        headers.set("Content-Type", "application/json");
    }

    if (token) {
        headers.set("Authorization", `Bearer ${token}`);
    }

    const res = await fetch(`${API_URL}${path}`, { ...options, headers });

    // Token missing/expired/invalid — clear it and force a re-login instead
    // of leaving the user staring at a cryptic "Could not validate
    // credentials" error with no path forward.
    if (res.status === 401) {
        clearToken();
        if (typeof window !== "undefined") {
            window.location.reload();
        }
    }

    return res;
}

export async function login(email: string, password: string) {
    const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ?? "Login failed");
    }

    const data = await res.json();
    setToken(data.access_token);
    return data;
}

export async function register(email: string, password: string) {
    const res = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ?? "Registration failed");
    }

    return res.json();
}
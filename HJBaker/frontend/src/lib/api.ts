const BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

// Current user (drives the X-User header). Mutable via the header switcher.
let currentUser = "Ivy Chen";
export function setCurrentUser(name: string) {
  currentUser = name;
}
export function getCurrentUser() {
  return currentUser;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-User": currentUser,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = data.detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const api = {
  base: BASE,
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};

/** POST that returns a Blob (for Export to Excel). */
export async function postBlob(path: string, body: unknown): Promise<Blob> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User": currentUser },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.blob();
}

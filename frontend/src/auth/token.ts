export type UserRole = "kitchen" | "foh" | "online";

type TokenPayload = {
  email?: string;
  role?: string;
  exp?: number;
};

const TOKEN_KEY = "accessToken";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem("activeReservationId");
}

export function parseTokenRole(token: string): UserRole | null {
  const payload = parseTokenPayload(token);
  if (!payload) {
    return null;
  }
  if (payload.role === "kitchen" || payload.role === "foh" || payload.role === "online") {
    return payload.role;
  }
  return null;
}

function parseTokenPayload(token: string): TokenPayload | null {
  const sections = token.split(".");
  if (sections.length !== 3) {
    return null;
  }

  try {
    const payload = JSON.parse(atob(sections[1])) as TokenPayload;
    if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function getCurrentUser(): { role: UserRole; email: string | null } | null {
  const token = getToken();
  if (!token) {
    return null;
  }
  const payload = parseTokenPayload(token);
  if (!payload) {
    return null;
  }
  if (payload.role !== "kitchen" && payload.role !== "foh" && payload.role !== "online") {
    return null;
  }
  return {
    role: payload.role,
    email: typeof payload.email === "string" ? payload.email : null,
  };
}

export function getCurrentRole(): UserRole | null {
  return getCurrentUser()?.role || null;
}

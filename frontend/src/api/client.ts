import { getToken } from "../auth/token";
import { logger } from "../logging/logger";

const API_BASE_URL = "http://localhost:5000";

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const method = init.method || "GET";
  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const startedAt = performance.now();
  logger.debug("api request", { method, path });
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
    });
    logger.info("api response", {
      method,
      path,
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt),
    });
    return response;
  } catch (error) {
    logger.error("api network error", {
      method,
      path,
      durationMs: Math.round(performance.now() - startedAt),
      error,
    });
    throw error;
  }
}

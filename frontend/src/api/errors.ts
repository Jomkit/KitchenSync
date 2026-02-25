export type ApiErrorPayload = {
  error?: string;
  code?: string;
  request_id?: string;
};

export function isAuthErrorStatus(status: number): boolean {
  return status === 401 || status === 403;
}

export async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    return payload.error || fallback;
  } catch {
    return fallback;
  }
}

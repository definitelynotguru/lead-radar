export class FetchError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "FetchError";
    this.status = status;
  }
}

export interface FetchJsonOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export async function fetchJson<T>(
  url: string,
  options: FetchJsonOptions = {},
): Promise<{ data: T; status: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  const hostPath = (() => {
    try {
      const parsed = new URL(url);
      return `${parsed.host}${parsed.pathname}`;
    } catch {
      return "external-api";
    }
  })();

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "accept": "application/json",
        "user-agent": "lead-radar/0.1 (+https://github.com/definitelynotguru/lead-radar)",
        ...(options.headers ?? {}),
      },
    });

    if (!response.ok) {
      throw new FetchError(`${hostPath} returned HTTP ${response.status}`, response.status);
    }

    return { data: await response.json() as T, status: response.status };
  } catch (error) {
    if (error instanceof FetchError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new FetchError(`${hostPath} timed out`);
    }
    throw new FetchError(`${hostPath} request failed before a response`);
  } finally {
    clearTimeout(timeout);
  }
}

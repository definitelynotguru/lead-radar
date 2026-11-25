import type { FetchJsonOptions } from "../fetch_json.ts";

export type FetchJsonFn = <T>(url: string, options?: FetchJsonOptions) => Promise<{ data: T; status: number }>;

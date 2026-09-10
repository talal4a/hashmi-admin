import type { ProviderImageResult } from "@/types";

export interface ProviderSearchParams {
  query: string;
  page: number;
  perPage: number;
  signal?: AbortSignal;
}

export interface ProviderSearchResponse {
  provider: ProviderImageResult["provider"];
  results: ProviderImageResult[];
  total: number;
  /** Set when the provider is unavailable or unconfigured; results stay empty. */
  error: string | null;
}

export class ProviderNotConfiguredError extends Error {
  constructor(provider: string) {
    super(`${provider} is not configured on the server.`);
    this.name = "ProviderNotConfiguredError";
  }
}

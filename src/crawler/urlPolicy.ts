import type { SourceConfig } from "../types/source.js";

const stripTrailingSlash = (path: string): string =>
  path.length > 1 ? path.replace(/\/+$/, "") : path;

export class UrlPolicy {
  private readonly allowedDomains: ReadonlySet<string>;

  public constructor(private readonly source: SourceConfig) {
    this.allowedDomains = new Set(source.allowedDomains.map((domain) => domain.toLowerCase()));
  }

  public normalize(input: string, baseUrl?: string): string | null {
    try {
      const url = baseUrl === undefined ? new URL(input) : new URL(input, baseUrl);

      if (!["http:", "https:"].includes(url.protocol)) {
        return null;
      }

      url.hash = "";
      url.username = "";
      url.password = "";
      url.hostname = url.hostname.toLowerCase();

      const removableParams = [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
        "fbclid",
        "gclid"
      ];
      for (const param of removableParams) {
        url.searchParams.delete(param);
      }

      url.pathname = stripTrailingSlash(url.pathname);
      return url.toString();
    } catch {
      return null;
    }
  }

  public isAllowed(input: string, depth: number): boolean {
    const normalized = this.normalize(input);
    if (normalized === null || depth > this.source.maxDepth) {
      return false;
    }

    const url = new URL(normalized);
    if (!this.allowedDomains.has(url.hostname)) {
      return false;
    }

    if (this.source.includePaths.length > 0) {
      const included = this.source.includePaths.some((path) => url.pathname.startsWith(path));
      if (!included) {
        return false;
      }
    }

    const excluded = this.source.excludePaths.some((path) => url.pathname.startsWith(path));
    if (excluded) {
      return false;
    }

    if (this.source.languages.length > 0) {
      const pathSegments = url.pathname.split("/").filter(Boolean);
      const language = pathSegments[0]?.toLowerCase();
      if (language !== undefined && !this.source.languages.includes(language)) {
        return false;
      }
    }

    return true;
  }
}

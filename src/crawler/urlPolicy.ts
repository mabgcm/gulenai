import type { SourceConfig } from "../types/source.js";

const stripTrailingSlash = (path: string): string =>
  path.length > 1 ? path.replace(/\/+$/, "") : path;

const blockedExactPaths = new Set([
  "/privacy-policy",
  "/privacy",
  "/terms-of-use",
  "/terms",
  "/search",
  "/login",
  "/logout",
  "/feed",
  "/rss",
  "/bize-yazin"
]);

const blockedPathPrefixes = ["/component/", "/tag/"];

const blockedQueryParams = new Set([
  "page",
  "start",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid"
]);

const blockedQueryParamPrefixes = ["utm_"];

const blockedUrlPattern = /(?:^|[/_.-])(?:click|banner|adclick|advert|share|print)(?:[/_.-]|$)/i;

export class UrlPolicy {
  private readonly allowedDomains: ReadonlySet<string>;
  private readonly includePatterns: readonly RegExp[];
  private readonly excludePatterns: readonly RegExp[];

  public constructor(private readonly source: SourceConfig) {
    this.allowedDomains = new Set(source.allowedDomains.map((domain) => domain.toLowerCase()));
    this.includePatterns = source.includePatterns.map((pattern) => new RegExp(pattern));
    this.excludePatterns = source.excludePatterns.map((pattern) => new RegExp(pattern));
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
        "gclid",
        "tmpl",
        "print",
        "layout"
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

    if (this.isInfrastructureUrl(url)) {
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

    const urlText = normalized;
    if (this.includePatterns.length > 0) {
      const included = this.includePatterns.some((pattern) => pattern.test(urlText));
      if (!included) {
        return false;
      }
    }

    const patternExcluded = this.excludePatterns.some((pattern) => pattern.test(urlText));
    if (patternExcluded) {
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

  private isInfrastructureUrl(url: URL): boolean {
    const path = stripTrailingSlash(url.pathname).toLowerCase();
    if (blockedExactPaths.has(path)) {
      return true;
    }

    if (blockedPathPrefixes.some((prefix) => path.startsWith(prefix))) {
      return true;
    }

    if (blockedUrlPattern.test(path)) {
      return true;
    }

    for (const key of url.searchParams.keys()) {
      const normalizedKey = key.toLowerCase();
      if (
        blockedQueryParams.has(normalizedKey) ||
        blockedQueryParamPrefixes.some((prefix) => normalizedKey.startsWith(prefix))
      ) {
        return true;
      }
    }

    return false;
  }
}

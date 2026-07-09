import type { Logger } from "../config/logger.js";

interface RobotsGroup {
  readonly agents: readonly string[];
  readonly disallow: readonly string[];
  readonly allow: readonly string[];
  readonly crawlDelayMs: number | null;
  readonly sitemaps: readonly string[];
}

export interface RobotsRules {
  readonly sitemaps: readonly string[];
  readonly crawlDelayMs: number | null;
  isAllowed(url: string): boolean;
}

const parseRobots = (text: string): readonly RobotsGroup[] => {
  const groups: RobotsGroup[] = [];
  let currentAgents: string[] = [];
  let currentDisallow: string[] = [];
  let currentAllow: string[] = [];
  let currentDelay: number | null = null;
  const sitemaps: string[] = [];

  const flush = (): void => {
    if (currentAgents.length === 0) {
      return;
    }

    groups.push({
      agents: currentAgents,
      disallow: currentDisallow,
      allow: currentAllow,
      crawlDelayMs: currentDelay,
      sitemaps
    });
    currentAgents = [];
    currentDisallow = [];
    currentAllow = [];
    currentDelay = null;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#", 1)[0]?.trim() ?? "";
    if (line.length === 0) {
      flush();
      continue;
    }

    const separator = line.indexOf(":");
    if (separator < 0) {
      continue;
    }

    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (key === "user-agent") {
      if (currentDisallow.length > 0 || currentAllow.length > 0 || currentDelay !== null) {
        flush();
      }
      currentAgents.push(value.toLowerCase());
    } else if (key === "disallow") {
      currentDisallow.push(value);
    } else if (key === "allow") {
      currentAllow.push(value);
    } else if (key === "crawl-delay") {
      const seconds = Number.parseFloat(value);
      currentDelay = Number.isFinite(seconds)
        ? Math.max(0, Math.round(seconds * 1000))
        : currentDelay;
    } else if (key === "sitemap") {
      sitemaps.push(value);
    }
  }

  flush();
  return groups;
};

const pathMatches = (path: string, rule: string): boolean => {
  if (rule.length === 0) {
    return false;
  }

  const escaped = rule
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", ".*")
    .replace(/\\\$$/, "$");
  return new RegExp(`^${escaped}`).test(path);
};

export class RobotsClient {
  public constructor(
    private readonly userAgent: string,
    private readonly logger: Logger,
    private readonly fetchText: (url: string) => Promise<string>
  ) {}

  public async load(origin: string): Promise<RobotsRules> {
    const robotsUrl = new URL("/robots.txt", origin).toString();
    try {
      const text = await this.fetchText(robotsUrl);
      const groups = parseRobots(text);
      return this.buildRules(groups);
    } catch (error: unknown) {
      this.logger.warn({ err: error, robotsUrl }, "Unable to load robots.txt; allowing crawl");
      return { sitemaps: [], crawlDelayMs: null, isAllowed: () => true };
    }
  }

  private buildRules(groups: readonly RobotsGroup[]): RobotsRules {
    const agent = this.userAgent.toLowerCase().split("/", 1)[0] ?? this.userAgent.toLowerCase();
    const matching =
      groups.find((group) => group.agents.some((item) => item === agent)) ??
      groups.find((group) => group.agents.includes("*"));

    if (matching === undefined) {
      return {
        sitemaps: groups.flatMap((group) => group.sitemaps),
        crawlDelayMs: null,
        isAllowed: () => true
      };
    }

    return {
      sitemaps: matching.sitemaps,
      crawlDelayMs: matching.crawlDelayMs,
      isAllowed: (input: string) => {
        const path = new URL(input).pathname;
        const allowed = matching.allow
          .filter((rule) => pathMatches(path, rule))
          .sort((a, b) => b.length - a.length)[0];
        const disallowed = matching.disallow
          .filter((rule) => pathMatches(path, rule))
          .sort((a, b) => b.length - a.length)[0];

        if (allowed === undefined && disallowed === undefined) {
          return true;
        }

        return (allowed?.length ?? 0) >= (disallowed?.length ?? 0);
      }
    };
  }
}

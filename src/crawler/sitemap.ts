import * as cheerio from "cheerio";
import type { Logger } from "../config/logger.js";

export class SitemapClient {
  public constructor(
    private readonly logger: Logger,
    private readonly fetchText: (url: string) => Promise<string>
  ) {}

  public async discover(
    origin: string,
    robotsSitemaps: readonly string[]
  ): Promise<readonly string[]> {
    const sitemapUrls =
      robotsSitemaps.length > 0 ? robotsSitemaps : [new URL("/sitemap.xml", origin).toString()];
    const discovered = new Set<string>();

    for (const sitemapUrl of sitemapUrls) {
      await this.collect(sitemapUrl, discovered, 0);
    }

    return [...discovered];
  }

  private async collect(url: string, discovered: Set<string>, depth: number): Promise<void> {
    if (depth > 3) {
      return;
    }

    try {
      const xml = await this.fetchText(url);
      const $ = cheerio.load(xml, { xmlMode: true });
      const nested = $("sitemap loc")
        .map((_, element) => $(element).text().trim())
        .get()
        .filter((item) => item.length > 0);

      if (nested.length > 0) {
        for (const nestedUrl of nested) {
          await this.collect(nestedUrl, discovered, depth + 1);
        }
        return;
      }

      $("url loc").each((_, element) => {
        const loc = $(element).text().trim();
        if (loc.length > 0) {
          discovered.add(loc);
        }
      });
    } catch (error: unknown) {
      this.logger.warn({ err: error, url }, "Unable to load sitemap");
    }
  }
}

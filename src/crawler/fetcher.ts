import { chromium, type Browser, type BrowserContext } from "playwright";
import type { CrawledPage } from "../types/source.js";
import { parseHtmlLinks } from "./htmlLinks.js";

export interface Fetcher {
  fetchPage(url: string): Promise<CrawledPage>;
  fetchText(url: string): Promise<string>;
  close(): Promise<void>;
}

export class PlaywrightFetcher implements Fetcher {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  public constructor(private readonly userAgent: string) {}

  public async fetchPage(url: string): Promise<CrawledPage> {
    const context = await this.getContext();
    const page = await context.newPage();

    try {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      if (response === null) {
        throw new Error(`No response received for ${url}`);
      }

      const html = await page.content();
      const parsed = parseHtmlLinks(html);

      return {
        url,
        finalUrl: page.url(),
        canonicalUrl: parsed.canonicalUrl,
        status: response.status(),
        contentType: response.headers()["content-type"] ?? "",
        html,
        title: parsed.title,
        discoveredUrls: parsed.links,
        fetchedAt: new Date().toISOString()
      };
    } finally {
      await page.close();
    }
  }

  public async fetchText(url: string): Promise<string> {
    const response = await fetch(url, {
      headers: {
        "user-agent": this.userAgent,
        accept: "text/plain, application/xml, text/xml, */*"
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }

    return response.text();
  }

  public async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
    this.context = null;
    this.browser = null;
  }

  private async getContext(): Promise<BrowserContext> {
    if (this.context !== null) {
      return this.context;
    }

    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext({
      userAgent: this.userAgent,
      ignoreHTTPSErrors: true
    });
    return this.context;
  }
}

import { describe, expect, it } from "vitest";
import { ArticleExtractor } from "../../src/extract/articleExtractor.js";
import { buildMetadata } from "../../src/extract/metadata.js";
import type { RawDocument } from "../../src/extract/types.js";

const extractor = new ArticleExtractor();

const rawDocument = (html: string, url = "https://fgulen.com/en/example"): RawDocument => ({
  id: "example",
  rawPath: "data/raw/example.html",
  relativePath: "example.html",
  html,
  url,
  crawlDate: "2026-07-09T00:00:00.000Z"
});

describe("ArticleExtractor", () => {
  it("extracts semantic article content and removes boilerplate", () => {
    const html = `
      <html lang="en">
        <head><title>Keep This Article</title></head>
        <body>
          <header>Site header</header>
          <nav>Navigation</nav>
          <article>
            <h1>Keep This Article</h1>
            <p>This is the meaningful paragraph with <strong>important</strong> emphasis.</p>
            <blockquote>A preserved quote.</blockquote>
            <ul><li>First item</li><li>Second item</li></ul>
          </article>
          <footer>Footer text</footer>
          <section class="related">Related article</section>
        </body>
      </html>
    `;

    const result = extractor.extract(html, "https://fgulen.com/en/article");

    expect(result.method).toBe("semantic");
    expect(result.cleanedHtml).toContain("<h1>Keep This Article</h1>");
    expect(result.cleanedHtml).toContain("<strong>important</strong>");
    expect(result.cleanedHtml).toContain("<blockquote>A preserved quote.</blockquote>");
    expect(result.cleanedHtml).not.toContain("Navigation");
    expect(result.cleanedHtml).not.toContain("Related article");
  });

  it("falls back to Readability when semantic selectors are absent", () => {
    const html = `
      <html>
        <head><title>Fallback Story</title></head>
        <body>
          <div class="top-menu">menu links</div>
          <div id="page">
            <h1>Fallback Story</h1>
            <p>This article has enough narrative text for readability to identify it correctly.</p>
            <p>Another paragraph continues the actual article and should be preserved.</p>
            <p>A third paragraph adds enough signal for the fallback extractor.</p>
          </div>
        </body>
      </html>
    `;

    const result = extractor.extract(html, "https://fgulen.com/en/fallback");

    expect(result.method).toBe("readability");
    expect(result.cleanedHtml).toContain("Fallback Story");
    expect(result.cleanedHtml).toContain("Another paragraph continues");
  });

  it("handles malformed HTML", () => {
    const html = "<html><body><article><h1>Broken<p>Still readable <strong>content";
    const result = extractor.extract(html, "https://fgulen.com/en/broken");

    expect(result.cleanedHtml).toContain("Broken");
    expect(result.cleanedHtml).toContain("Still readable");
  });

  it("builds stable metadata without duplicate metadata fields", () => {
    const html = `
      <html lang="en">
        <head>
          <title>Metadata Article</title>
          <meta name="author" content="Fethullah Gülen" />
          <meta property="article:published_time" content="2020-01-02T03:04:05Z" />
        </head>
        <body><article><h1>Metadata Article</h1><p>Clear article body text.</p></article></body>
      </html>
    `;
    const raw = rawDocument(html);
    const result = extractor.extract(html, raw.url);
    const metadata = buildMetadata(raw, html, result.cleanedHtml);
    const keys = Object.keys(metadata);

    expect(new Set(keys).size).toBe(keys.length);
    expect(metadata.title).toBe("Metadata Article");
    expect(metadata.author).toBe("Fethullah Gülen");
    expect(metadata.publishedDate).toBe("2020-01-02T03:04:05.000Z");
    expect(metadata.wordCount).toBeGreaterThan(0);
  });

  it("preserves Turkish characters and language metadata", () => {
    const html = `
      <html lang="tr">
        <head><title>Gönül Dünyası</title></head>
        <body>
          <article>
            <h1>Gönül Dünyası</h1>
            <p>İnsan, şefkat ve merhametle yücelir; çağın çilesi içinde ümit taşır.</p>
          </article>
        </body>
      </html>
    `;
    const raw = rawDocument(html, "https://fgulen.com/tr/gonul");
    const result = extractor.extract(html, raw.url);
    const metadata = buildMetadata(raw, html, result.cleanedHtml);

    expect(result.cleanedHtml).toContain("Gönül Dünyası");
    expect(result.cleanedHtml).toContain("şefkat");
    expect(metadata.language).toBe("tr");
  });

  it("extracts English pages with links, images, and tables preserved", () => {
    const html = `
      <html lang="en">
        <body>
          <main>
            <h1>English Page</h1>
            <p>Read <a href="/en/next">the next article</a> with care.</p>
            <figure><img src="/image.jpg" alt="Book cover" /></figure>
            <table><tr><th>Topic</th><td>Reflection</td></tr></table>
          </main>
        </body>
      </html>
    `;
    const result = extractor.extract(html, "https://fgulen.com/en/page");

    expect(result.cleanedHtml).toContain('<a href="/en/next">the next article</a>');
    expect(result.cleanedHtml).toContain('<img src="/image.jpg" alt="Book cover">');
    expect(result.cleanedHtml).toContain("<table>");
  });
});

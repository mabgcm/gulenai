import TurndownService from "turndown";
import { preprocessHtmlForMarkdown } from "./htmlPreprocessor.js";

const normalizeMarkdown = (markdown: string): string =>
  markdown
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trimEnd())
    .join("\n")
    .trim();

const escapePipes = (value: string): string =>
  value.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

export class MarkdownConverter {
  private readonly turndown: TurndownService;

  public constructor() {
    this.turndown = new TurndownService({
      headingStyle: "atx",
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
      emDelimiter: "*",
      strongDelimiter: "**",
      linkStyle: "inlined",
      hr: "---"
    });

    this.addRules();
  }

  public convert(html: string, baseUrl: string | null = null): string {
    const preprocessed = preprocessHtmlForMarkdown(html, baseUrl);
    return normalizeMarkdown(this.turndown.turndown(preprocessed));
  }

  private addRules(): void {
    this.turndown.keep(["table", "thead", "tbody", "tfoot", "tr", "th", "td"]);

    this.turndown.addRule("imageWithAlt", {
      filter: "img",
      replacement: (_content, node) => {
        const alt = node.getAttribute("alt")?.trim() ?? "";
        const src = node.getAttribute("src")?.trim() ?? "";
        const title = node.getAttribute("title")?.trim();

        if (src.length === 0) {
          return alt.length > 0 ? alt : "";
        }

        const titlePart = title === undefined || title.length === 0 ? "" : ` "${title}"`;
        return `![${alt}](${src}${titlePart})`;
      }
    });

    this.turndown.addRule("table", {
      filter: "table",
      replacement: (_content, node) => this.convertTable(node)
    });
  }

  private convertTable(table: HTMLElement): string {
    const rows = this.collectRows(table)
      .map((row) => this.collectCells(row).map((cell) => escapePipes(cell.textContent ?? "")))
      .filter((cells) => cells.some((cell) => cell.length > 0));

    if (rows.length === 0) {
      return "";
    }

    const columnCount = Math.max(...rows.map((row) => row.length));
    const normalizedRows = rows.map((row) => [
      ...row,
      ...Array.from({ length: columnCount - row.length }, () => "")
    ]);
    const header = normalizedRows[0] ?? [];
    const separator = Array.from({ length: columnCount }, () => "---");
    const body = normalizedRows.slice(1);
    const markdownRows = [header, separator, ...body].map((row) => `| ${row.join(" | ")} |`);

    return `\n\n${markdownRows.join("\n")}\n\n`;
  }

  private collectRows(element: Element): readonly Element[] {
    return this.collectElements(element, "TR");
  }

  private collectCells(element: Element): readonly Element[] {
    return this.collectElements(element, "TH", "TD");
  }

  private collectElements(element: Element, ...tagNames: readonly string[]): readonly Element[] {
    const matches: Element[] = [];
    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType !== 1) {
        continue;
      }

      const childElement = child as Element;
      if (tagNames.includes(childElement.nodeName.toUpperCase())) {
        matches.push(childElement);
      }

      matches.push(...this.collectElements(childElement, ...tagNames));
    }

    return matches;
  }
}

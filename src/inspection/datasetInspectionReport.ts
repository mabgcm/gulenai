import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureDir } from "../utils/fs.js";

interface DocumentEntry {
  readonly documentId: string;
  readonly sourceFile: string;
  readonly url: string;
  readonly title: string;
  readonly language: string;
  readonly contentHash: string;
  readonly totalChunks: number;
}

interface ChunkFile {
  readonly metadata: {
    readonly id: string;
    readonly sourceFile: string;
    readonly tokenCount: number;
    readonly wordCount: number;
  };
  readonly markdown: string;
  readonly plainText: string;
  readonly __file: string;
}

const escapeHtml = (value: string | number | boolean | null | undefined): string =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, "utf8")) as T;

const listFiles = (dir: string, predicate: (file: string) => boolean): readonly string[] => {
  const output: string[] = [];
  const walk = (current: string): void => {
    for (const name of readdirSync(current).sort((left, right) => left.localeCompare(right))) {
      const full = path.join(current, name);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (predicate(full)) {
        output.push(full);
      }
    }
  };
  if (existsSync(dir)) {
    walk(dir);
  }
  return output;
};

const tree = (dir: string): string => {
  const lines = [dir];
  const walk = (current: string, prefix: string): void => {
    const names = readdirSync(current).sort((left, right) => left.localeCompare(right));
    names.forEach((name, index) => {
      const full = path.join(current, name);
      const last = index === names.length - 1;
      lines.push(`${prefix}${last ? "└──" : "├──"} ${name}`);
      if (statSync(full).isDirectory()) {
        walk(full, `${prefix}${last ? "    " : "│   "}`);
      }
    });
  };
  if (existsSync(dir)) {
    walk(dir, "");
  }
  return lines.join("\n");
};

const firstLines = (file: string, count: number): string =>
  existsSync(file) ? readFileSync(file, "utf8").split(/\r?\n/).slice(0, count).join("\n") : "";

export class DatasetInspectionReport {
  public constructor(private readonly reportsDir = "reports") {}

  public async write(): Promise<string> {
    await ensureDir(this.reportsDir);
    const documents = existsSync("data/index/documents.json")
      ? readJson<readonly DocumentEntry[]>("data/index/documents.json")
      : [];
    const chunkFiles = listFiles("data/chunks", (file) => file.endsWith(".json"));
    const chunks = chunkFiles.map((file) => ({
      ...readJson<Omit<ChunkFile, "__file">>(file),
      __file: file
    }));
    const chunksBySource = new Map<string, readonly ChunkFile[]>();
    for (const document of documents) {
      chunksBySource.set(
        document.sourceFile,
        chunks.filter((chunk) => chunk.metadata.sourceFile === document.sourceFile)
      );
    }

    const rows = documents
      .map((document) => {
        const documentChunks = chunksBySource.get(document.sourceFile) ?? [];
        return {
          ...document,
          markdownPath: path.join("data/markdown", document.sourceFile),
          chunks: documentChunks.length || document.totalChunks,
          tokenCount: documentChunks.reduce((sum, chunk) => sum + chunk.metadata.tokenCount, 0),
          wordCount: documentChunks.reduce((sum, chunk) => sum + chunk.metadata.wordCount, 0)
        };
      })
      .sort((left, right) => left.url.localeCompare(right.url));

    const homepage = rows.find((row) => /\/[a-z]{2}\/?$/i.test(row.url)) ?? rows[0];
    const article =
      rows.find((row) => row.wordCount >= 100 && row.url !== homepage?.url) ?? rows[1] ?? rows[0];
    const book =
      rows.find((row) => /\/(veprat|eserler|works|books)\//i.test(row.url)) ?? rows[2] ?? rows[0];

    const duplicateGroups = Object.values(
      rows.reduce<Record<string, typeof rows>>((acc, row) => {
        acc[row.contentHash] = [...(acc[row.contentHash] ?? []), row];
        return acc;
      }, {})
    ).filter((group) => group.length > 1);
    const shortPages = rows.filter((row) => row.wordCount > 0 && row.wordCount < 100);
    const generatedAt = new Date().toISOString();
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dataset Inspection Report</title>
<style>
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;background:#f7f7f4;color:#1d1d1f;line-height:1.45}
header{background:#fff;border-bottom:1px solid #deded8;padding:30px 40px 18px}main{max-width:1320px;margin:0 auto;padding:28px 40px 56px}
h1{margin:0 0 8px;font-size:30px}h2{margin-top:34px;border-bottom:1px solid #deded8;padding-bottom:8px}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #deded8;font-size:13px}th,td{border-bottom:1px solid #deded8;padding:8px 10px;text-align:left;vertical-align:top}th{background:#eeeeea}
pre{background:#f0f2f4;border:1px solid #deded8;border-radius:8px;padding:14px;overflow:auto;max-height:640px;font-size:12px}.num{text-align:right}.muted{color:#666b73}a{color:#275f86;text-decoration:none}code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
</style></head><body>
<header><h1>Dataset Inspection Report</h1><p class="muted">Generated ${escapeHtml(generatedAt)} with clickable source links.</p></header>
<main>
<h2>Documents</h2>
<table><thead><tr><th>#</th><th>URL</th><th>Title</th><th>Language</th><th>Markdown</th><th>Chunks</th><th>Tokens</th><th>Words</th></tr></thead><tbody>
${rows
  .map(
    (row, index) =>
      `<tr><td class="num">${index + 1}</td><td><a href="${escapeHtml(row.url)}">${escapeHtml(row.url)}</a></td><td>${escapeHtml(row.title)}</td><td>${escapeHtml(row.language)}</td><td><code>${escapeHtml(row.markdownPath)}</code></td><td class="num">${row.chunks}</td><td class="num">${row.tokenCount}</td><td class="num">${row.wordCount}</td></tr>`
  )
  .join("\n")}
</tbody></table>
<h2>Directory Trees</h2><h3>data/raw</h3><pre><code>${escapeHtml(tree("data/raw"))}</code></pre><h3>data/clean</h3><pre><code>${escapeHtml(tree("data/clean"))}</code></pre><h3>data/markdown</h3><pre><code>${escapeHtml(tree("data/markdown"))}</code></pre><h3>data/chunks</h3><pre><code>${escapeHtml(tree("data/chunks"))}</code></pre>
<h2>Representative Markdown</h2>
${[
  ["Homepage", homepage],
  ["Article", article],
  ["Book", book]
]
  .filter((item): item is [string, NonNullable<typeof homepage>] => item[1] !== undefined)
  .map(
    ([label, row]) =>
      `<h3>${escapeHtml(label)}: ${escapeHtml(row.title)}</h3><p><a href="${escapeHtml(row.url)}">${escapeHtml(row.url)}</a> · <code>${escapeHtml(row.markdownPath)}</code></p><pre><code>${escapeHtml(firstLines(row.markdownPath, 50))}</code></pre>`
  )
  .join("\n")}
<h2>Example Chunk JSON</h2><pre><code>${escapeHtml(chunks[0] === undefined ? "{}" : JSON.stringify(chunks[0], null, 2))}</code></pre>
<h2>Suspicious Pages</h2>
<h3>Duplicate content hashes</h3>${duplicateGroups.length === 0 ? "<p>None detected.</p>" : duplicateGroups.map((group) => `<ul>${group.map((row) => `<li><a href="${escapeHtml(row.url)}">${escapeHtml(row.title)}</a> (${row.wordCount} words)</li>`).join("")}</ul>`).join("")}
<h3>Fewer than 100 words</h3>${shortPages.length === 0 ? "<p>None detected.</p>" : `<ul>${shortPages.map((row) => `<li><a href="${escapeHtml(row.url)}">${escapeHtml(row.title)}</a> (${row.wordCount} words)</li>`).join("")}</ul>`}
</main></body></html>
`;
    const outputPath = path.join(this.reportsDir, "dataset-inspection.html");
    await writeFile(outputPath, html, "utf8");
    return outputPath;
  }
}

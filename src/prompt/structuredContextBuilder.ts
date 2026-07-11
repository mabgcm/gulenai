import type { SearchResult } from "../search/types.js";

export type ContextSectionName =
  | "Definition"
  | "Core Concepts"
  | "Supporting Evidence"
  | "Complementary Evidence"
  | "Examples"
  | "Related Concepts";

export interface StructuredContextSection {
  readonly label: ContextSectionName;
  readonly chunks: readonly SearchResult[];
}

export interface StructuredContext {
  readonly chunks: readonly SearchResult[];
  readonly sections: readonly StructuredContextSection[];
  readonly sectionByChunkId: Readonly<Record<string, ContextSectionName>>;
}

const SECTION_ORDER: readonly ContextSectionName[] = [
  "Definition",
  "Core Concepts",
  "Supporting Evidence",
  "Complementary Evidence",
  "Examples",
  "Related Concepts"
];

const RULES: readonly {
  readonly section: ContextSectionName;
  readonly patterns: readonly RegExp[];
}[] = [
  { section: "Definition", patterns: [/\bnedir\b/i, /\btanım/i, /\btarif/i, /\bmahiyet/i] },
  { section: "Examples", patterns: [/\b(?:örnek|misal)/i, /\bexample/i] },
  {
    section: "Complementary Evidence",
    patterns: [/\b(?:tamamlayıcı|ayrıca|bununla birlikte|diğer yönden)/i, /\bcomplement/i]
  },
  {
    section: "Related Concepts",
    patterns: [/\b(?:ilgili|ilişki|bağlantı|yakın kavram)/i, /\brelated/i]
  },
  {
    section: "Core Concepts",
    patterns: [/\b(?:temel|esas|ilke|prensip|ana kavram)/i, /\b(?:core|principle)/i]
  }
];

const sectionFor = (chunk: SearchResult): ContextSectionName => {
  const classificationText = [chunk.title ?? "", ...chunk.headingPath, chunk.markdown].join("\n");
  return (
    RULES.find((rule) => rule.patterns.some((pattern) => pattern.test(classificationText)))
      ?.section ?? "Supporting Evidence"
  );
};

export class StructuredContextBuilder {
  public build(chunks: readonly SearchResult[]): StructuredContext {
    const grouped = new Map<ContextSectionName, SearchResult[]>();
    const sectionByChunkId: Record<string, ContextSectionName> = {};
    for (const chunk of chunks) {
      const section = sectionFor(chunk);
      const existing = grouped.get(section) ?? [];
      existing.push(chunk);
      grouped.set(section, existing);
      sectionByChunkId[chunk.chunkId] = section;
    }

    const sections = SECTION_ORDER.flatMap((label) => {
      const sectionChunks = grouped.get(label);
      return sectionChunks === undefined ? [] : [{ label, chunks: sectionChunks }];
    });
    return {
      chunks: sections.flatMap((section) => section.chunks),
      sections,
      sectionByChunkId
    };
  }
}

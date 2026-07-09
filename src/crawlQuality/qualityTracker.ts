import type { CrawledPage } from "../types/source.js";
import { hammingDistance } from "./simHash.js";
import type {
  CrawlQualityAnalysis,
  CrawlQualityDecision,
  CrawlQualityState,
  SelectedDuplicateCandidate
} from "./types.js";

export interface DuplicateResolution {
  readonly decision: CrawlQualityDecision;
  readonly previous: SelectedDuplicateCandidate | null;
}

export class CrawlQualityTracker {
  private readonly decisions = new Map<string, CrawlQualityDecision>();
  private readonly selectedByUrl = new Map<string, SelectedDuplicateCandidate>();

  public constructor(private readonly duplicateSimHashDistance: number) {}

  public restore(state: CrawlQualityState | null): void {
    if (state === null) {
      return;
    }

    for (const decision of state.decisions) {
      this.decisions.set(decision.url, decision);
    }
    for (const selected of state.selected) {
      this.selectedByUrl.set(selected.url, selected);
    }
  }

  public decide(
    page: CrawledPage,
    analysis: CrawlQualityAnalysis,
    rawId: string,
    rawPath: string
  ): DuplicateResolution {
    if (!analysis.indexable) {
      const decision = this.record({
        ...analysis,
        status: "skipped",
        fetchedAt: page.fetchedAt,
        rawPath: null,
        duplicateOf: null
      });
      return { decision, previous: null };
    }

    const duplicate = this.findDuplicate(analysis);
    if (duplicate !== null && duplicate.qualityScore >= analysis.qualityScore) {
      const decision = this.record({
        ...analysis,
        status: "duplicate",
        reason: `duplicate of ${duplicate.url}`,
        fetchedAt: page.fetchedAt,
        rawPath: null,
        duplicateOf: duplicate.url
      });
      return { decision, previous: null };
    }

    const selected: SelectedDuplicateCandidate = {
      url: analysis.url,
      rawId,
      rawPath,
      qualityScore: analysis.qualityScore,
      normalizedTextHash: analysis.normalizedTextHash,
      simHash: analysis.simHash
    };
    this.selectedByUrl.set(analysis.url, selected);

    if (duplicate !== null) {
      this.selectedByUrl.delete(duplicate.url);
      this.record({
        ...this.getAnalysisFromDecision(duplicate.url),
        status: "replaced",
        reason: `replaced by higher-quality duplicate ${analysis.url}`,
        fetchedAt: page.fetchedAt,
        rawPath: null,
        duplicateOf: analysis.url
      });
    }

    const decision = this.record({
      ...analysis,
      status: "indexed",
      fetchedAt: page.fetchedAt,
      rawPath,
      duplicateOf: null
    });
    return { decision, previous: duplicate };
  }

  public state(): CrawlQualityState {
    return {
      decisions: [...this.decisions.values()].sort((left, right) =>
        left.url.localeCompare(right.url)
      ),
      selected: [...this.selectedByUrl.values()].sort((left, right) =>
        left.url.localeCompare(right.url)
      ),
      updatedAt: new Date().toISOString()
    };
  }

  private record(decision: CrawlQualityDecision): CrawlQualityDecision {
    this.decisions.set(decision.url, decision);
    return decision;
  }

  private findDuplicate(analysis: CrawlQualityAnalysis): SelectedDuplicateCandidate | null {
    for (const selected of this.selectedByUrl.values()) {
      if (selected.url === analysis.url) {
        continue;
      }
      if (selected.normalizedTextHash === analysis.normalizedTextHash) {
        return selected;
      }
      if (hammingDistance(selected.simHash, analysis.simHash) <= this.duplicateSimHashDistance) {
        return selected;
      }
    }
    return null;
  }

  private getAnalysisFromDecision(url: string): CrawlQualityDecision {
    const decision = this.decisions.get(url);
    if (decision === undefined) {
      throw new Error(`Missing quality decision for duplicate ${url}`);
    }
    return decision;
  }
}

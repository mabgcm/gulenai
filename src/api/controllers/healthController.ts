import type { ApiRuntimeConfig } from "../types.js";

export class HealthController {
  public constructor(private readonly config: ApiRuntimeConfig) {}

  public async health(): Promise<{ readonly status: "ok"; readonly version: string }> {
    await Promise.resolve();
    return { status: "ok", version: this.config.version };
  }
}

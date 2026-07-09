import { HealthController } from "../controllers/healthController.js";
import type { ApiDependencies, ApiRuntimeConfig } from "../types.js";
import type { RouteRegistrar } from "../types.js";
import { routeErrorResponses } from "./schemas.js";

export const healthRoutes =
  (config: ApiRuntimeConfig): RouteRegistrar =>
  async (server, deps: ApiDependencies): Promise<void> => {
    await Promise.resolve();
    void deps;
    const controller = new HealthController(config);
    server.get(
      "/health",
      {
        schema: {
          tags: ["System"],
          response: {
            200: {
              type: "object",
              properties: {
                status: { type: "string" },
                version: { type: "string" }
              },
              required: ["status", "version"]
            },
            ...routeErrorResponses
          }
        }
      },
      async () => controller.health()
    );
  };

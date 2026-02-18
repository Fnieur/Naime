import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { resolveOpenClawAgentDir } from "./agent-paths.js";
import {
  installModelsConfigTestHooks,
  MODELS_CONFIG_IMPLICIT_ENV_VARS,
  unsetEnv,
  withModelsTempHome as withTempHome,
} from "./models-config.e2e-harness.js";
import { ensureOpenClawModelsJson } from "./models-config.js";

installModelsConfigTestHooks();

describe("models-config", () => {
  it("preserves env-var apiKey references when rewriting models.json", async () => {
    await withTempHome(async () => {
      // Clear all implicit env vars so resolveEnvApiKeyVarName returns undefined,
      // forcing the flow through resolveApiKeyFromProfiles (which returns plaintext).
      unsetEnv(MODELS_CONFIG_IMPLICIT_ENV_VARS);

      const agentDir = resolveOpenClawAgentDir();
      await fs.mkdir(agentDir, { recursive: true });

      // Seed auth-profiles.json with a minimax profile containing a plaintext key.
      await fs.writeFile(
        path.join(agentDir, "auth-profiles.json"),
        JSON.stringify({
          version: 1,
          profiles: {
            "minimax:default": {
              type: "api_key",
              key: "sk-minimax-real-secret-key",
              provider: "minimax",
            },
          },
        }),
        "utf8",
      );

      // Seed models.json with an env-var name as apiKey.
      await fs.writeFile(
        path.join(agentDir, "models.json"),
        JSON.stringify(
          {
            providers: {
              minimax: {
                baseUrl: "https://api.minimax.io/anthropic",
                api: "anthropic-messages",
                apiKey: "MINIMAX_API_KEY",
                models: [
                  {
                    id: "MiniMax-M2.1",
                    name: "MiniMax M2.1",
                    reasoning: false,
                    input: ["text"],
                    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                    contextWindow: 200000,
                    maxTokens: 8192,
                  },
                ],
              },
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const cfg: OpenClawConfig = {
        models: {
          providers: {
            minimax: {
              baseUrl: "https://api.minimax.io/anthropic",
              api: "anthropic-messages",
              models: [
                {
                  id: "MiniMax-M2.1",
                  name: "MiniMax M2.1",
                  reasoning: false,
                  input: ["text"],
                  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                  contextWindow: 200000,
                  maxTokens: 8192,
                },
              ],
            },
          },
        },
      };

      await ensureOpenClawModelsJson(cfg);

      const raw = await fs.readFile(path.join(agentDir, "models.json"), "utf8");
      const parsed = JSON.parse(raw) as {
        providers: Record<string, { apiKey?: string }>;
      };

      // The env-var name should be preserved, NOT replaced with the resolved secret.
      expect(parsed.providers.minimax?.apiKey).toBe("MINIMAX_API_KEY");
      expect(raw).not.toContain("sk-minimax-real-secret-key");
    });
  });
});

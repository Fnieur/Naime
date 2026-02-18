import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Type } from "@sinclair/typebox";
import type { ThinkLevel, VerboseLevel } from "../../auto-reply/thinking.js";
import { resolveRlmOptions } from "../../commands/agent/harness-rlm-options.js";
import { runRlmHarness } from "../../commands/agent/harness-rlm.js";
import type { AgentStreamParams } from "../../commands/agent/types.js";
import type { OpenClawConfig } from "../../config/config.js";
import { loadConfig } from "../../config/config.js";
import { normalizeAgentId, resolveAgentIdFromSessionKey } from "../../routing/session-key.js";
import type { InputProvenance } from "../../sessions/input-provenance.js";
import type { GatewayMessageChannel } from "../../utils/message-channel.js";
import { resolveAgentDir, resolveAgentWorkspaceDir } from "../agent-scope.js";
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from "../defaults.js";
import { isCliProvider, resolveConfiguredModelRef } from "../model-selection.js";
import type { SkillSnapshot } from "../skills.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readNumberParam, readStringParam } from "./common.js";

const RlmCallToolSchema = Type.Object({
  query: Type.String({ minLength: 1 }),
  maxDepth: Type.Optional(Type.Integer({ minimum: 0, maximum: 8 })),
  timeoutSeconds: Type.Optional(Type.Integer({ minimum: 1 })),
});

export function createRlmCallTool(opts?: {
  config?: OpenClawConfig;
  sessionKey?: string;
  agentId?: string;
  messageChannel?: GatewayMessageChannel;
  agentAccountId?: string;
  messageTo?: string;
  messageThreadId?: string | number;
  groupId?: string | null;
  groupChannel?: string | null;
  groupSpace?: string | null;
  currentChannelId?: string;
  currentThreadTs?: string;
  replyToMode?: "off" | "first" | "all";
  hasRepliedRef?: { value: boolean };
  spawnedBy?: string | null;
  modelProvider?: string;
  modelId?: string;
  workspaceDir?: string;
  agentDir?: string;
  authProfileId?: string;
  authProfileIdSource?: "auto" | "user";
  thinkLevel?: ThinkLevel;
  verboseLevel?: VerboseLevel;
  lane?: string;
  abortSignal?: AbortSignal;
  extraSystemPrompt?: string;
  inputProvenance?: InputProvenance;
  streamParams?: AgentStreamParams;
  skillsSnapshot?: SkillSnapshot;
  senderIsOwner?: boolean;
  fallbacksOverride?: string[];
}): AnyAgentTool {
  return {
    label: "Reasoning",
    name: "rlm_call",
    description:
      "Run a recursive language-model program on large/complex context and return its final answer.",
    parameters: RlmCallToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const query = readStringParam(params, "query", { required: true });
      const cfg = opts?.config ?? loadConfig();
      const enabled = cfg.tools?.rlm?.enabled === true;
      if (!enabled) {
        return jsonResult({
          status: "forbidden",
          error: "RLM tool is disabled. Set tools.rlm.enabled=true.",
        });
      }

      const configured = resolveConfiguredModelRef({
        cfg,
        defaultProvider: DEFAULT_PROVIDER,
        defaultModel: DEFAULT_MODEL,
      });
      const provider = opts?.modelProvider ?? configured.provider;
      const model = opts?.modelId ?? configured.model;
      if (isCliProvider(provider, cfg)) {
        return jsonResult({
          status: "error",
          error: "rlm_call does not support CLI-backed providers.",
        });
      }

      const agentId = normalizeAgentId(
        opts?.agentId ?? resolveAgentIdFromSessionKey(opts?.sessionKey ?? "") ?? "main",
      );
      const workspaceDir = opts?.workspaceDir ?? resolveAgentWorkspaceDir(cfg, agentId);
      const agentDir = opts?.agentDir ?? resolveAgentDir(cfg, agentId);

      const reqDepth = readNumberParam(params, "maxDepth", { integer: true });
      const reqTimeoutSeconds = readNumberParam(params, "timeoutSeconds", { integer: true });
      const resolvedRlm = resolveRlmOptions({
        cfg,
        requestedMaxDepth: reqDepth,
        requestedTimeoutSeconds: reqTimeoutSeconds,
      });
      const { maxDepth, maxIterations, maxLlmCalls, extractOnMaxIterations, timeoutMs } =
        resolvedRlm;

      const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-rlm-call-"));
      const sessionId = `rlm-call-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const sessionFile = path.join(tmpRoot, `${sessionId}.jsonl`);

      try {
        try {
          const run = await runRlmHarness({
            cfg,
            provider,
            model,
            agentDir,
            workspaceDir,
            sessionId,
            sessionFile,
            maxDepth,
            maxIterations,
            maxLlmCalls,
            extractOnMaxIterations,
            timeoutMs,
            runId: sessionId,
            userPrompt: query,
            sessionKey: undefined,
            agentId: opts?.agentId,
            messageChannel: opts?.messageChannel,
            agentAccountId: opts?.agentAccountId,
            messageTo: opts?.messageTo,
            messageThreadId: opts?.messageThreadId,
            groupId: opts?.groupId,
            groupChannel: opts?.groupChannel,
            groupSpace: opts?.groupSpace,
            spawnedBy: opts?.spawnedBy,
            currentChannelId: opts?.currentChannelId,
            currentThreadTs: opts?.currentThreadTs,
            replyToMode: opts?.replyToMode,
            hasRepliedRef: opts?.hasRepliedRef,
            authProfileId: opts?.authProfileId,
            authProfileIdSource: opts?.authProfileIdSource,
            thinkLevel: opts?.thinkLevel,
            verboseLevel: opts?.verboseLevel,
            lane: opts?.lane,
            abortSignal: opts?.abortSignal,
            extraSystemPrompt: opts?.extraSystemPrompt,
            inputProvenance: opts?.inputProvenance,
            streamParams: opts?.streamParams,
            skillsSnapshot: opts?.skillsSnapshot,
            senderIsOwner: opts?.senderIsOwner,
            fallbacksOverride: opts?.fallbacksOverride,
          });

          const answer = (run.result.payloads ?? [])
            .map((payload) => payload.text?.trim() ?? "")
            .filter(Boolean)
            .join("\n\n")
            .trim();

          return jsonResult({
            status: "ok",
            answer,
            provider: run.provider,
            model: run.model,
            maxDepth,
            stats: run.stats,
          });
        } catch (err) {
          return jsonResult({
            status: "error",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } finally {
        await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
      }
    },
  };
}

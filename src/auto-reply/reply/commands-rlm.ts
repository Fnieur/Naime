import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveAgentDir } from "../../agents/agent-scope.js";
import { resolveRlmOptions } from "../../commands/agent/harness-rlm-options.js";
import { runRlmHarness } from "../../commands/agent/harness-rlm.js";
import { logVerbose } from "../../globals.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import type { CommandHandler } from "./commands-types.js";

function extractRlmQuery(commandBodyNormalized: string): string | null {
  const trimmed = commandBodyNormalized.trim();
  if (trimmed === "/rlm") {
    return "";
  }
  if (trimmed.startsWith("/rlm ")) {
    return trimmed.slice("/rlm ".length).trim();
  }
  if (trimmed.startsWith("/rlm\n")) {
    return trimmed.slice("/rlm".length).trim();
  }
  return null;
}

export const handleRlmCommand: CommandHandler = async (params, allowTextCommands) => {
  if (!allowTextCommands) {
    return null;
  }
  const query = extractRlmQuery(params.command.commandBodyNormalized);
  if (query === null) {
    return null;
  }

  if (!params.command.isAuthorizedSender) {
    logVerbose(`Ignoring /rlm from unauthorized sender: ${params.command.senderId || "<unknown>"}`);
    return { shouldContinue: false };
  }

  const enabled = params.cfg.tools?.rlm?.enabled === true;
  if (!enabled) {
    return {
      shouldContinue: false,
      reply: {
        text: JSON.stringify(
          {
            status: "forbidden",
            error: "RLM is disabled. Set tools.rlm.enabled=true in config.",
          },
          null,
          2,
        ),
      },
    };
  }

  if (!query) {
    return {
      shouldContinue: false,
      reply: {
        text: [
          "/rlm <query>",
          "",
          "Runs the RLM harness directly (without a separate agent run) and returns JSON.",
        ].join("\n"),
      },
    };
  }

  const resolvedRlm = resolveRlmOptions({ cfg: params.cfg });
  const { maxDepth, maxIterations, maxLlmCalls, extractOnMaxIterations, timeoutMs } = resolvedRlm;

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-rlm-command-"));
  const sessionId = `rlm-command-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const sessionFile = path.join(tmpRoot, `${sessionId}.jsonl`);

  try {
    const agentId = normalizeAgentId(params.agentId ?? "main");
    const agentDir = resolveAgentDir(params.cfg, agentId);

    const run = await runRlmHarness({
      cfg: params.cfg,
      provider: params.provider,
      model: params.model,
      agentDir,
      workspaceDir: params.workspaceDir,
      sessionId,
      sessionFile,
      maxDepth,
      maxIterations,
      maxLlmCalls,
      extractOnMaxIterations,
      timeoutMs,
      runId: sessionId,
      userPrompt: query,
      sessionKey: params.sessionKey,
      agentId,
      messageChannel: params.command.channel,
      agentAccountId: params.ctx.AccountId,
      messageTo: params.command.from,
      messageThreadId: params.ctx.MessageThreadId,
      groupId: undefined,
      groupChannel: undefined,
      groupSpace: undefined,
      spawnedBy: "slash_command:/rlm",
      currentChannelId: params.command.channelId,
      currentThreadTs: undefined,
      replyToMode: "off",
      hasRepliedRef: undefined,
      authProfileId: params.sessionEntry?.authProfileOverride,
      authProfileIdSource: params.sessionEntry?.authProfileOverrideSource,
      thinkLevel: params.resolvedThinkLevel,
      verboseLevel: params.resolvedVerboseLevel,
      lane: params.command.abortKey,
      abortSignal: undefined,
      extraSystemPrompt: undefined,
      inputProvenance: undefined,
      streamParams: undefined,
      skillsSnapshot: undefined,
      senderIsOwner: params.command.senderIsOwner,
      fallbacksOverride: undefined,
    });

    const answer = (run.result.payloads ?? [])
      .map((payload) => payload.text?.trim() ?? "")
      .filter(Boolean)
      .join("\n\n")
      .trim();

    const statsLine = `_(${run.provider}/${run.model} · ${run.stats.steps} steps · ${run.stats.llmCalls} llm calls)_`;

    return {
      shouldContinue: false,
      reply: {
        text: answer ? `${answer}\n\n${statsLine}` : statsLine,
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      shouldContinue: false,
      reply: {
        text: `RLM error: ${errorMsg}`,
      },
    };
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
  }
};

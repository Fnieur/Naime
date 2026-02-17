import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateToolInterruptEmitParams,
  validateToolInterruptResumeParams,
} from "../protocol/index.js";
import type { ToolInterruptManager } from "../tool-interrupt-manager.js";
import type { GatewayRequestHandlers } from "./types.js";

const DEFAULT_INTERRUPT_TIMEOUT_MS = 10 * 60 * 1000;

export function createToolInterruptHandlers(manager: ToolInterruptManager): GatewayRequestHandlers {
  return {
    "tool.interrupt.emit": async ({ params, respond, context }) => {
      if (!validateToolInterruptEmitParams(params)) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `invalid tool.interrupt.emit params: ${formatValidationErrors(
              validateToolInterruptEmitParams.errors,
            )}`,
          ),
        );
        return;
      }

      const p = params as {
        approvalRequestId: string;
        runId: string;
        sessionKey: string;
        toolCallId: string;
        interrupt: Record<string, unknown>;
        timeoutMs?: number;
        twoPhase?: boolean;
      };

      let emitted: Awaited<ReturnType<typeof manager.emit>>;
      try {
        emitted = await manager.emit({
          approvalRequestId: p.approvalRequestId,
          runId: p.runId,
          sessionKey: p.sessionKey,
          toolCallId: p.toolCallId,
          interrupt: p.interrupt,
          timeoutMs: typeof p.timeoutMs === "number" ? p.timeoutMs : DEFAULT_INTERRUPT_TIMEOUT_MS,
        });
      } catch (err) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, String(err)));
        return;
      }

      context.broadcast(
        "tool.interrupt.requested",
        {
          ...emitted.requested,
          created: emitted.created,
        },
        { dropIfSlow: true },
      );

      if (p.twoPhase === true) {
        respond(
          true,
          {
            status: "accepted",
            ...emitted.requested,
            created: emitted.created,
          },
          undefined,
        );
      }

      const waitResult = await emitted.wait;
      if (waitResult.status === "expired") {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "tool interrupt expired before resume"),
        );
        return;
      }

      respond(true, waitResult, undefined);
    },
    "tool.interrupt.resume": async ({ params, respond, context, client }) => {
      if (!validateToolInterruptResumeParams(params)) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `invalid tool.interrupt.resume params: ${formatValidationErrors(
              validateToolInterruptResumeParams.errors,
            )}`,
          ),
        );
        return;
      }

      const p = params as {
        approvalRequestId: string;
        runId: string;
        sessionKey: string;
        toolCallId: string;
        resumeToken: string;
        result: unknown;
      };

      const resolvedBy = client?.connect?.client?.displayName ?? client?.connect?.client?.id;
      const resumed = await manager.resume({
        approvalRequestId: p.approvalRequestId,
        runId: p.runId,
        sessionKey: p.sessionKey,
        toolCallId: p.toolCallId,
        resumeToken: p.resumeToken,
        result: p.result,
        resumedBy: resolvedBy ?? null,
      });

      if (!resumed.ok) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, resumed.message));
        return;
      }

      context.broadcast(
        "tool.interrupt.resumed",
        {
          approvalRequestId: resumed.waitResult.approvalRequestId,
          runId: resumed.waitResult.runId,
          sessionKey: resumed.waitResult.sessionKey,
          toolCallId: resumed.waitResult.toolCallId,
          resumedAtMs: resumed.waitResult.resumedAtMs,
          resumedBy: resumed.waitResult.resumedBy,
          ts: Date.now(),
        },
        { dropIfSlow: true },
      );

      respond(
        true,
        {
          ok: true,
          resumedAtMs: resumed.waitResult.resumedAtMs,
        },
        undefined,
      );
    },
  };
}

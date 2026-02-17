import { Type } from "@sinclair/typebox";
import { NonEmptyString } from "./primitives.js";

export const ToolInterruptEmitParamsSchema = Type.Object(
  {
    approvalRequestId: NonEmptyString,
    runId: NonEmptyString,
    sessionKey: NonEmptyString,
    toolCallId: NonEmptyString,
    interrupt: Type.Record(Type.String(), Type.Unknown()),
    timeoutMs: Type.Optional(Type.Integer({ minimum: 1 })),
    twoPhase: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

export const ToolInterruptResumeParamsSchema = Type.Object(
  {
    approvalRequestId: NonEmptyString,
    runId: NonEmptyString,
    sessionKey: NonEmptyString,
    toolCallId: NonEmptyString,
    resumeToken: NonEmptyString,
    result: Type.Unknown(),
  },
  { additionalProperties: false },
);

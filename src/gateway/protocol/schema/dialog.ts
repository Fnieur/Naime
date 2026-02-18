import { Type } from "@sinclair/typebox";
import { NonEmptyString } from "./primitives.js";

const DialogStepTypeSchema = Type.Union([
  Type.Literal("text"),
  Type.Literal("select"),
  Type.Literal("confirm"),
  Type.Literal("multiselect"),
]);

const DialogStepOptionSchema = Type.Object(
  {
    value: NonEmptyString,
    label: NonEmptyString,
  },
  { additionalProperties: false },
);

const DialogStepSchema = Type.Object(
  {
    id: NonEmptyString,
    type: Type.Optional(DialogStepTypeSchema),
    prompt: NonEmptyString,
    options: Type.Optional(Type.Array(DialogStepOptionSchema)),
  },
  { additionalProperties: false },
);

export const DialogStartParamsSchema = Type.Object(
  {
    sessionKey: NonEmptyString,
    steps: Type.Array(DialogStepSchema, { minItems: 1 }),
    expiresInMinutes: Type.Optional(Type.Number({ minimum: 1 })),
    channel: Type.Optional(Type.String()),
    to: Type.Optional(Type.String()),
    accountId: Type.Optional(Type.String()),
    threadId: Type.Optional(Type.String()),
    intro: Type.Optional(Type.String()),
    outro: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export type DialogStartParams = {
  sessionKey: string;
  steps: Array<{
    id: string;
    type?: "text" | "select" | "confirm" | "multiselect";
    prompt: string;
    options?: Array<{ value: string; label: string }>;
  }>;
  expiresInMinutes?: number;
  channel?: string;
  to?: string;
  accountId?: string;
  threadId?: string;
  intro?: string;
  outro?: string;
};

export const DialogAnswerParamsSchema = Type.Object(
  {
    dialogId: NonEmptyString,
    value: Type.Unknown(),
  },
  { additionalProperties: false },
);

export type DialogAnswerParams = {
  dialogId: string;
  value: unknown;
};

export const DialogCancelParamsSchema = Type.Object(
  {
    dialogId: NonEmptyString,
  },
  { additionalProperties: false },
);

export type DialogCancelParams = {
  dialogId: string;
};

export const DialogStatusParamsSchema = Type.Object(
  {
    dialogId: NonEmptyString,
  },
  { additionalProperties: false },
);

export type DialogStatusParams = {
  dialogId: string;
};

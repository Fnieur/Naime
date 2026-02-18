export type DialogStepType = "text" | "select" | "confirm" | "multiselect";

export type DialogStepOption = {
  value: string;
  label: string;
};

export type DialogStep = {
  id: string;
  type: DialogStepType;
  prompt: string;
  options?: DialogStepOption[];
};

export type DialogAnswer = {
  stepId: string;
  value: unknown;
  answeredAt: number;
};

export type DialogSessionStatus = "running" | "done" | "cancelled" | "expired";

export type DialogState = {
  dialogId: string;
  sessionKey: string;
  steps: DialogStep[];
  answers: DialogAnswer[];
  currentStepIndex: number;
  status: DialogSessionStatus;
  createdAt: number;
  expiresAt: number;
  channel?: string;
  to?: string;
  accountId?: string;
  threadId?: string;
  intro?: string;
  outro?: string;
};

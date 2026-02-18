import { randomUUID } from "node:crypto";
import type { DialogAnswer, DialogSessionStatus, DialogState, DialogStep } from "./types.js";

const DEFAULT_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

export class DialogSession {
  private state: DialogState;

  constructor(params: {
    sessionKey: string;
    steps: DialogStep[];
    expiresInMs?: number;
    channel?: string;
    to?: string;
    accountId?: string;
    threadId?: string;
    intro?: string;
    outro?: string;
  }) {
    const now = Date.now();
    this.state = {
      dialogId: randomUUID(),
      sessionKey: params.sessionKey,
      steps: params.steps,
      answers: [],
      currentStepIndex: 0,
      status: "running",
      createdAt: now,
      expiresAt: now + (params.expiresInMs ?? DEFAULT_EXPIRY_MS),
      channel: params.channel,
      to: params.to,
      accountId: params.accountId,
      threadId: params.threadId,
      intro: params.intro,
      outro: params.outro,
    };
  }

  get dialogId(): string {
    return this.state.dialogId;
  }

  getStatus(): DialogSessionStatus {
    if (this.state.status === "running" && Date.now() >= this.state.expiresAt) {
      this.state.status = "expired";
    }
    return this.state.status;
  }

  getState(): Readonly<DialogState> {
    // Refresh status before returning state
    this.getStatus();
    return this.state;
  }

  currentStep(): DialogStep | null {
    if (this.getStatus() !== "running") {
      return null;
    }
    return this.state.steps[this.state.currentStepIndex] ?? null;
  }

  answer(value: unknown): { next: DialogStep | null; done: boolean } {
    if (this.getStatus() !== "running") {
      throw new Error("dialog: session not running");
    }
    const step = this.state.steps[this.state.currentStepIndex];
    if (!step) {
      throw new Error("dialog: no pending step");
    }

    const coerced = this.coerceAnswer(step, value);
    this.state.answers.push({
      stepId: step.id,
      value: coerced,
      answeredAt: Date.now(),
    });

    this.state.currentStepIndex++;

    const nextStep = this.state.steps[this.state.currentStepIndex] ?? null;
    if (!nextStep) {
      this.state.status = "done";
      return { next: null, done: true };
    }
    return { next: nextStep, done: false };
  }

  cancel(): void {
    if (this.state.status !== "running") {
      return;
    }
    this.state.status = "cancelled";
  }

  getAnswers(): ReadonlyArray<DialogAnswer> {
    return this.state.answers;
  }

  getAnswerMap(): Record<string, unknown> {
    const map: Record<string, unknown> = {};
    for (const answer of this.state.answers) {
      map[answer.stepId] = answer.value;
    }
    return map;
  }

  private coerceAnswer(step: DialogStep, raw: unknown): unknown {
    switch (step.type) {
      case "confirm": {
        if (typeof raw === "boolean") {
          return raw;
        }
        const str = String(raw).trim().toLowerCase();
        return str === "yes" || str === "y" || str === "true" || str === "1";
      }
      case "select": {
        const str = String(raw).trim();
        if (step.options) {
          const match = step.options.find(
            (opt) => opt.value === str || opt.label.toLowerCase() === str.toLowerCase(),
          );
          if (match) {
            return match.value;
          }
          const idx = Number.parseInt(str, 10);
          if (Number.isFinite(idx) && idx >= 1 && idx <= step.options.length) {
            return step.options[idx - 1].value;
          }
        }
        return str;
      }
      case "multiselect": {
        const entries = Array.isArray(raw)
          ? raw.map((entry) => String(entry).trim())
          : String(raw)
              .split(",")
              .map((entry) => entry.trim())
              .filter(Boolean);
        if (!step.options) {
          return entries;
        }
        const options = step.options;
        return entries.map((entry) => {
          const match = options.find(
            (opt) => opt.value === entry || opt.label.toLowerCase() === entry.toLowerCase(),
          );
          if (match) {
            return match.value;
          }
          const idx = Number.parseInt(entry, 10);
          if (Number.isFinite(idx) && idx >= 1 && idx <= options.length) {
            return options[idx - 1].value;
          }
          return entry;
        });
      }
      case "text":
      default:
        return String(raw);
    }
  }
}

import { describe, expect, test } from "vitest";
import { DialogSession } from "./session.js";

function makeSession(overrides?: { expiresInMs?: number }) {
  return new DialogSession({
    sessionKey: "test:session",
    steps: [
      { id: "name", type: "text", prompt: "What is your name?" },
      {
        id: "color",
        type: "select",
        prompt: "Favorite color?",
        options: [
          { value: "red", label: "Red" },
          { value: "blue", label: "Blue" },
        ],
      },
      { id: "agree", type: "confirm", prompt: "Do you agree?" },
    ],
    expiresInMs: overrides?.expiresInMs,
  });
}

describe("DialogSession", () => {
  test("walks through steps and collects answers", () => {
    const session = makeSession();
    expect(session.getStatus()).toBe("running");
    expect(session.currentStep()?.id).toBe("name");

    const r1 = session.answer("Alice");
    expect(r1.done).toBe(false);
    expect(r1.next?.id).toBe("color");

    const r2 = session.answer("blue");
    expect(r2.done).toBe(false);
    expect(r2.next?.id).toBe("agree");

    const r3 = session.answer("yes");
    expect(r3.done).toBe(true);
    expect(r3.next).toBeNull();

    expect(session.getStatus()).toBe("done");
    const answers = session.getAnswerMap();
    expect(answers.name).toBe("Alice");
    expect(answers.color).toBe("blue");
    expect(answers.agree).toBe(true);
  });

  test("select coerces by label (case-insensitive)", () => {
    const session = makeSession();
    session.answer("Alice"); // skip name
    session.answer("Red"); // match by label
    const answers = session.getAnswerMap();
    expect(answers.color).toBe("red");
  });

  test("select coerces by numeric index (1-based)", () => {
    const session = makeSession();
    session.answer("Alice");
    session.answer("2"); // second option = blue
    const answers = session.getAnswerMap();
    expect(answers.color).toBe("blue");
  });

  test("confirm coerces various truthy values", () => {
    for (const truthy of ["yes", "y", "true", "1", "YES", "Y"]) {
      const session = new DialogSession({
        sessionKey: "test:confirm",
        steps: [{ id: "q", type: "confirm", prompt: "Ok?" }],
      });
      session.answer(truthy);
      expect(session.getAnswerMap().q).toBe(true);
    }
  });

  test("confirm coerces falsy values", () => {
    for (const falsy of ["no", "n", "false", "0", "nah"]) {
      const session = new DialogSession({
        sessionKey: "test:confirm",
        steps: [{ id: "q", type: "confirm", prompt: "Ok?" }],
      });
      session.answer(falsy);
      expect(session.getAnswerMap().q).toBe(false);
    }
  });

  test("multiselect splits comma-separated input", () => {
    const session = new DialogSession({
      sessionKey: "test:multi",
      steps: [
        {
          id: "items",
          type: "multiselect",
          prompt: "Pick items",
          options: [
            { value: "a", label: "Alpha" },
            { value: "b", label: "Beta" },
            { value: "c", label: "Charlie" },
          ],
        },
      ],
    });
    session.answer("Alpha, Charlie");
    expect(session.getAnswerMap().items).toEqual(["a", "c"]);
  });

  test("cancel stops the session", () => {
    const session = makeSession();
    session.cancel();
    expect(session.getStatus()).toBe("cancelled");
    expect(session.currentStep()).toBeNull();
  });

  test("answer after cancel throws", () => {
    const session = makeSession();
    session.cancel();
    expect(() => session.answer("Alice")).toThrow(/not running/);
  });

  test("cancel on non-running session is a no-op", () => {
    const session = new DialogSession({
      sessionKey: "test:single",
      steps: [{ id: "q", type: "text", prompt: "Hi?" }],
    });
    session.answer("hello");
    expect(session.getStatus()).toBe("done");
    session.cancel(); // should not throw
    expect(session.getStatus()).toBe("done");
  });

  test("expired session transitions to expired status", () => {
    const session = makeSession({ expiresInMs: -1 });
    expect(session.getStatus()).toBe("expired");
    expect(session.currentStep()).toBeNull();
  });

  test("getAnswers returns immutable list", () => {
    const session = makeSession();
    session.answer("Alice");
    const answers = session.getAnswers();
    expect(answers.length).toBe(1);
    expect(answers[0].stepId).toBe("name");
    expect(answers[0].value).toBe("Alice");
  });

  test("dialogId is set and accessible", () => {
    const session = makeSession();
    expect(session.dialogId).toBeTruthy();
    expect(typeof session.dialogId).toBe("string");
  });

  test("getState returns full state", () => {
    const session = makeSession();
    const state = session.getState();
    expect(state.sessionKey).toBe("test:session");
    expect(state.steps.length).toBe(3);
    expect(state.status).toBe("running");
    expect(state.currentStepIndex).toBe(0);
  });
});

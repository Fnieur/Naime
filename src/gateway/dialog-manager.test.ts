import { describe, expect, test } from "vitest";
import { DialogManager } from "./dialog-manager.js";

function makeSteps() {
  return [
    { id: "q1", type: "text" as const, prompt: "Name?" },
    { id: "q2", type: "text" as const, prompt: "Age?" },
  ];
}

describe("DialogManager", () => {
  test("create and get dialog", () => {
    const manager = new DialogManager();
    const session = manager.create({ sessionKey: "test:key", steps: makeSteps() });
    expect(session.dialogId).toBeTruthy();
    expect(manager.get(session.dialogId)).toBe(session);
  });

  test("getBySessionKey returns running dialog", () => {
    const manager = new DialogManager();
    const session = manager.create({ sessionKey: "test:key", steps: makeSteps() });
    expect(manager.getBySessionKey("test:key")).toBe(session);
  });

  test("getBySessionKey returns null for unknown key", () => {
    const manager = new DialogManager();
    expect(manager.getBySessionKey("unknown")).toBeNull();
  });

  test("getBySessionKey auto-cleans finished dialogs", () => {
    const manager = new DialogManager();
    const session = manager.create({ sessionKey: "test:key", steps: makeSteps() });
    session.answer("Alice");
    session.answer("30");
    // Session is now done
    expect(session.getStatus()).toBe("done");
    expect(manager.getBySessionKey("test:key")).toBeNull();
  });

  test("creating new dialog replaces finished one for same session", () => {
    const manager = new DialogManager();
    const first = manager.create({ sessionKey: "test:key", steps: makeSteps() });
    first.answer("Alice");
    first.answer("30");
    expect(first.getStatus()).toBe("done");

    const second = manager.create({ sessionKey: "test:key", steps: makeSteps() });
    expect(second.dialogId).not.toBe(first.dialogId);
    expect(manager.getBySessionKey("test:key")).toBe(second);
  });

  test("creating dialog while another is running throws", () => {
    const manager = new DialogManager();
    manager.create({ sessionKey: "test:key", steps: makeSteps() });
    expect(() => manager.create({ sessionKey: "test:key", steps: makeSteps() })).toThrow(
      /already active/,
    );
  });

  test("cancel removes dialog from manager", () => {
    const manager = new DialogManager();
    const session = manager.create({ sessionKey: "test:key", steps: makeSteps() });
    const ok = manager.cancel(session.dialogId);
    expect(ok).toBe(true);
    expect(manager.get(session.dialogId)).toBeNull();
    expect(manager.getBySessionKey("test:key")).toBeNull();
  });

  test("cancel returns false for unknown dialog", () => {
    const manager = new DialogManager();
    expect(manager.cancel("nonexistent")).toBe(false);
  });

  test("purge removes dialog", () => {
    const manager = new DialogManager();
    const session = manager.create({ sessionKey: "test:key", steps: makeSteps() });
    manager.purge(session.dialogId);
    expect(manager.get(session.dialogId)).toBeNull();
  });

  test("purge is a no-op for unknown dialog", () => {
    const manager = new DialogManager();
    // Should not throw
    manager.purge("nonexistent");
  });

  test("get returns null for unknown dialogId", () => {
    const manager = new DialogManager();
    expect(manager.get("nonexistent")).toBeNull();
  });

  test("get auto-cleans expired sessions", () => {
    const manager = new DialogManager();
    const session = manager.create({
      sessionKey: "test:key",
      steps: makeSteps(),
      expiresInMs: -1,
    });
    // Session is expired immediately
    expect(manager.get(session.dialogId)).toBeNull();
    expect(manager.getBySessionKey("test:key")).toBeNull();
  });

  test("get auto-cleans done sessions", () => {
    const manager = new DialogManager();
    const session = manager.create({ sessionKey: "test:key", steps: makeSteps() });
    session.answer("Alice");
    session.answer("30");
    expect(session.getStatus()).toBe("done");
    expect(manager.get(session.dialogId)).toBeNull();
  });

  test("multiple sessions with different keys coexist", () => {
    const manager = new DialogManager();
    const a = manager.create({ sessionKey: "key:a", steps: makeSteps() });
    const b = manager.create({ sessionKey: "key:b", steps: makeSteps() });
    expect(manager.get(a.dialogId)).toBe(a);
    expect(manager.get(b.dialogId)).toBe(b);
    expect(manager.getBySessionKey("key:a")).toBe(a);
    expect(manager.getBySessionKey("key:b")).toBe(b);
  });
});

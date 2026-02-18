import { describe, it, expect, beforeEach } from "vitest";
import {
  clearSessionGenerationId,
  getSessionGenerationId,
  incrementSessionGenerationId,
  isGenerationCurrent,
  SESSION_GENERATION_IDS,
} from "./state.js";

describe("session generation id helpers", () => {
  beforeEach(() => {
    SESSION_GENERATION_IDS.clear();
  });

  describe("getSessionGenerationId", () => {
    it("returns 0 for unknown keys", () => {
      expect(getSessionGenerationId("unknown-key")).toBe(0);
    });

    it("returns current value after increment", () => {
      incrementSessionGenerationId("key-1");
      expect(getSessionGenerationId("key-1")).toBe(1);
    });
  });

  describe("incrementSessionGenerationId", () => {
    it("increments from 0 to 1 on first call", () => {
      expect(incrementSessionGenerationId("key-a")).toBe(1);
    });

    it("increments sequentially", () => {
      incrementSessionGenerationId("key-b");
      incrementSessionGenerationId("key-b");
      expect(incrementSessionGenerationId("key-b")).toBe(3);
    });

    it("tracks keys independently", () => {
      incrementSessionGenerationId("key-x");
      incrementSessionGenerationId("key-x");
      incrementSessionGenerationId("key-y");
      expect(getSessionGenerationId("key-x")).toBe(2);
      expect(getSessionGenerationId("key-y")).toBe(1);
    });
  });

  describe("clearSessionGenerationId", () => {
    it("resets generation back to 0", () => {
      incrementSessionGenerationId("c1");
      incrementSessionGenerationId("c1");
      expect(getSessionGenerationId("c1")).toBe(2);
      clearSessionGenerationId("c1");
      expect(getSessionGenerationId("c1")).toBe(0);
    });

    it("returns true when key existed", () => {
      incrementSessionGenerationId("c2");
      expect(clearSessionGenerationId("c2")).toBe(true);
    });

    it("returns false when key did not exist", () => {
      expect(clearSessionGenerationId("nonexistent")).toBe(false);
    });
  });

  describe("isGenerationCurrent", () => {
    it("returns true when generationId matches current", () => {
      expect(isGenerationCurrent("q1", 0)).toBe(true);
      incrementSessionGenerationId("q1");
      expect(isGenerationCurrent("q1", 1)).toBe(true);
    });

    it("returns false when generationId is stale", () => {
      incrementSessionGenerationId("q2");
      expect(isGenerationCurrent("q2", 0)).toBe(false);
    });

    it("returns false for future generationIds", () => {
      expect(isGenerationCurrent("q3", 5)).toBe(false);
    });
  });

  describe("clearSessionGenerationId", () => {
    it("removes the entry so subsequent reads return 0", () => {
      incrementSessionGenerationId("c1");
      incrementSessionGenerationId("c1");
      expect(getSessionGenerationId("c1")).toBe(2);
      clearSessionGenerationId("c1");
      expect(getSessionGenerationId("c1")).toBe(0);
    });

    it("is a no-op for unknown keys", () => {
      clearSessionGenerationId("nonexistent");
      expect(getSessionGenerationId("nonexistent")).toBe(0);
    });

    it("does not affect other keys", () => {
      incrementSessionGenerationId("c2");
      incrementSessionGenerationId("c3");
      clearSessionGenerationId("c2");
      expect(getSessionGenerationId("c2")).toBe(0);
      expect(getSessionGenerationId("c3")).toBe(1);
    });
  });
});

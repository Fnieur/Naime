import { afterEach, expect, test } from "vitest";
import { resetProcessRegistryForTests } from "./bash-process-registry";
import { createExecTool } from "./bash-tools.exec";

afterEach(() => {
  resetProcessRegistryForTests();
});

test("exec truncates oversized command output in tool results", async () => {
  const tool = createExecTool({ allowBackground: false });
  const result = await tool.execute("toolcall", {
    command: 'node -e "process.stdout.write(String.fromCharCode(120).repeat(50000))"',
  });

  const text = result.content?.[0]?.text ?? "";
  expect(text.length).toBeLessThan(20_000);
  expect(text).toContain("[truncated exec output:");

  const details = result.details;
  if (details.status !== "completed") {
    throw new Error("expected completed exec");
  }
  expect(details.aggregated.length).toBeLessThan(20_000);
  expect(details.aggregated).toContain("[truncated exec output:");
});

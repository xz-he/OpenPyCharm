import { describe, expect, it } from "vitest";
import { processGroups } from "./processGroups";

describe("conversation process groups", () => {
  it("keeps previous answers out of the next turn's process", () => {
    expect(
      processGroups([
        { type: "user", text: "First", attachments: [] },
        { type: "thought", text: "First process" },
        { type: "agent", text: "First answer" },
        { type: "user", text: "Second", attachments: [] },
        { type: "thought", text: "Second process" },
        { type: "agent", text: "Second answer" },
      ]).filter((group) => group.process),
    ).toEqual([
      { process: true, indices: [1], current: false },
      { process: true, indices: [4], current: true },
    ]);
  });

  it("leaves errors and permission prompts outside collapsed groups", () => {
    const groups = processGroups([
      { type: "thought", text: "Inspect" },
      { type: "error", message: "Failed" },
      { type: "permission", id: 1, title: "Allow?", options: [], chosen: null },
      { type: "thought", text: "Continue" },
    ]);
    expect(groups.map((group) => group.process)).toEqual([true, false, false, true]);
  });
});

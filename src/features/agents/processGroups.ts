import type { AgentEntry } from "@/bindings";

export function processGroups(entries: readonly AgentEntry[]) {
  const groups: { process: boolean; indices: number[]; current: boolean }[] = [];
  const lastUser = entries.findLastIndex((entry) => entry.type === "user");
  let nextTool = false;
  const intermediate = new Set<number>();
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index]!;
    if (entry.type === "user") nextTool = false;
    if (entry.type === "tool" || entry.type === "thought") nextTool = true;
    if (entry.type === "agent" && nextTool) intermediate.add(index);
  }
  entries.forEach((entry, index) => {
    const process = entry.type === "thought" || entry.type === "tool" || intermediate.has(index);
    const previous = groups.at(-1);
    if (process && previous?.process) previous.indices.push(index);
    else groups.push({ process, indices: [index], current: index > lastUser });
  });
  return groups;
}

import { Channel } from "@tauri-apps/api/core";
import { call, commands, nextRequestId } from "@/platform/ipc";

import { pythonProjectFiles } from "./pythonTemplate";

export async function scaffoldPythonProject(root: string, name: string): Promise<void> {
  const encoder = new TextEncoder();
  for (const file of pythonProjectFiles(name)) {
    await call(commands.fsCreateFileBytes(`${root}/${file.path}`, Array.from(encoder.encode(file.content))));
  }
}

export async function createPythonEnvironment(
  base: string,
  root: string,
  onOutput: (line: string) => void,
): Promise<void> {
  const output = new Channel<string>();
  output.onmessage = onOutput;
  await call(commands.sdkPythonCreateVenv(base.trim(), `${root}/.venv`, nextRequestId(), output));
}

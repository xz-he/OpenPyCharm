import { beforeEach, describe, expect, it, vi } from "vitest";
import { pythonProjectFiles } from "../pythonTemplate";

vi.mock("@tauri-apps/api/core", () => ({
  Channel: class {
    onmessage?: (line: string) => void;
  },
}));

const backend = vi.hoisted(() => ({ write: vi.fn(), createVenv: vi.fn() }));
vi.mock("@/platform/ipc", () => ({
  call: async (result: Promise<unknown>) => result,
  commands: { fsCreateFileBytes: backend.write, sdkPythonCreateVenv: backend.createVenv },
  nextRequestId: () => 42,
}));
import { createPythonEnvironment, scaffoldPythonProject } from "../pythonProject";

beforeEach(() => vi.clearAllMocks());

describe("Python project setup", () => {
  it("creates a runnable example, tests and tool configuration", () => {
    const files = new Map(pythonProjectFiles("My Python App").map((file) => [file.path, file.content]));
    expect(files.get("pyproject.toml")).toContain('name = "my-python-app"');
    expect(files.get("pyproject.toml")).toContain("[tool.ruff]");
    expect(files.get("tests/test_main.py")).toContain("from main import greet");
    expect(files.get("requirements-dev.txt")).toContain("debugpy");
    expect(files.get(".gitignore")).toContain(".venv/");
  });

  it("normalizes Unicode folder names to a valid distribution name", () => {
    expect(pythonProjectFiles("我的项目")[0]?.content).toContain('name = "python-project"');
    expect(pythonProjectFiles("...my app...")[0]?.content).toContain('name = "my-app"');
  });

  it("writes UTF-8 through the exclusive-create backend and stops on conflicts", async () => {
    backend.write.mockRejectedValueOnce(new Error("already exists"));
    await expect(scaffoldPythonProject("C:/Projects/demo", "demo")).rejects.toThrow("already exists");
    expect(backend.write).toHaveBeenCalledTimes(1);
    expect(backend.write.mock.calls[0]?.[0]).toBe("C:/Projects/demo/pyproject.toml");
    expect(new TextDecoder().decode(new Uint8Array(backend.write.mock.calls[0]?.[1]))).toContain('name = "demo"');
  });

  it("passes an executable path with spaces without shell splitting", async () => {
    await createPythonEnvironment(" C:/Program Files/Python/python.exe ", "C:/My Projects/demo", () => {});
    expect(backend.createVenv).toHaveBeenCalledWith(
      "C:/Program Files/Python/python.exe",
      "C:/My Projects/demo/.venv",
      42,
      expect.anything(),
    );
  });
});

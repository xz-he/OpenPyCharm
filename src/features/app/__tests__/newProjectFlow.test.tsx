import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const backend = vi.hoisted(() => ({
  readDir: vi.fn(),
  mkdir: vi.fn(),
  gitInit: vi.fn(),
  scaffold: vi.fn(),
  venv: vi.fn(),
  open: vi.fn(),
}));
vi.mock("@/platform/ipc", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/platform/ipc")>();
  return {
    ...real,
    isTauri: () => true,
    commands: {
      ...real.commands,
      fsReadDir: backend.readDir,
      fsCreateDir: backend.mkdir,
      vcsInit: backend.gitInit,
    },
  };
});
vi.mock("../windows", () => ({ defaultProjectDirectory: () => "D:/Projects", openProjectInWindow: backend.open }));
vi.mock("../pythonProject", () => ({ scaffoldPythonProject: backend.scaffold, createPythonEnvironment: backend.venv }));

import { useProject } from "@/platform/project";
import { NewProjectOverlay, showNewProject } from "../NewProject";

beforeEach(() => {
  vi.resetAllMocks();
  backend.readDir.mockResolvedValue({ status: "ok", data: [] });
  backend.mkdir.mockResolvedValue({ status: "ok", data: null });
  backend.gitInit.mockResolvedValue({ status: "ok", data: null });
  useProject.setState({ project: null });
});

async function showWizard() {
  render(<NewProjectOverlay />);
  await act(async () => showNewProject());
  fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "demo" } });
}

describe("Python project wizard", () => {
  it("scaffolds and creates the environment before opening the project", async () => {
    await showWizard();
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(backend.open).toHaveBeenCalledWith("D:/Projects/demo", false));
    expect(backend.scaffold).toHaveBeenCalledWith("D:/Projects/demo", "demo");
    expect(backend.venv).toHaveBeenCalledWith("python", "D:/Projects/demo", expect.any(Function));
    expect(backend.open.mock.invocationCallOrder[0]).toBeGreaterThan(backend.venv.mock.invocationCallOrder[0]!);
  });

  it("keeps a partially created project accessible after environment failure", async () => {
    backend.venv.mockRejectedValueOnce(new Error("Python executable not found"));
    await showWizard();
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await screen.findByText("Python executable not found");
    expect(backend.open).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Open project" }));
    expect(backend.open).toHaveBeenCalledWith("D:/Projects/demo", false);
  });

  it("refuses to write into an existing nonempty directory", async () => {
    backend.readDir.mockResolvedValue({ status: "ok", data: [{ name: "existing.py" }] });
    await showWizard();
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await screen.findByText("D:/Projects/demo already exists and is not empty");
    expect(backend.scaffold).not.toHaveBeenCalled();
    expect(backend.venv).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  });
});

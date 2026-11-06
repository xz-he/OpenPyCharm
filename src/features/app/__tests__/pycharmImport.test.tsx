import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const backend = vi.hoisted(() => ({ read: vi.fn(), apply: vi.fn() }));
vi.mock("@/platform/ipc", async (original) => {
  const real = await original<typeof import("@/platform/ipc")>();
  return {
    ...real,
    commands: { ...real.commands, settingsReadPycharm: backend.read, settingsImportPycharm: backend.apply },
  };
});
import { PyCharmImportOverlay, previewPyCharmImport } from "../PyCharmImport";

beforeEach(() => {
  vi.resetAllMocks();
  backend.read.mockResolvedValue({
    status: "ok",
    data: {
      files: {
        "options/ide.general.xml":
          '<application><component name="GeneralSettings"><option name="confirmExit" value="false"/></component></application>',
      },
      skipped: ["installed.txt"],
    },
  });
  backend.apply.mockResolvedValue({
    status: "ok",
    data: { settings: {}, storage: {}, backup: "D:/config/settings-before-pycharm.toml" },
  });
});

describe("PyCharm settings import dialog", () => {
  it("previews without writing and cancels without modifying settings", async () => {
    render(<PyCharmImportOverlay />);
    await act(() => previewPyCharmImport("settings.zip"));
    expect(screen.getByText("General settings")).toBeInTheDocument();
    expect(backend.apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("applies the converted preferences and presents the backup path", async () => {
    render(<PyCharmImportOverlay />);
    await act(() => previewPyCharmImport("settings.zip"));
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    await screen.findByText("D:/config/settings-before-pycharm.toml");
    expect(JSON.parse(backend.apply.mock.calls[0]![0])).toEqual({ "general.confirmExit": false });
    fireEvent.click(screen.getAllByRole("button", { name: "Close" }).at(-1)!);
  });

  it("keeps failed imports open for retry", async () => {
    backend.apply.mockResolvedValueOnce({
      status: "error",
      error: { code: "internal", message: "Cannot write backup" },
    });
    render(<PyCharmImportOverlay />);
    await act(() => previewPyCharmImport("settings.zip"));
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Cannot write backup"));
    expect(screen.getByRole("button", { name: "Import" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  });
});

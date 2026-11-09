import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { dragSession, FILES_DRAG } from "@/ui/pointerDrag";
import { Composer } from "./Composer";
import { composerDraft, updateComposer } from "./store";
import { emptyDraft, toPrompt } from "./composerModel";
import styles from "./Composer.module.css";

vi.mock("@/platform/ipc", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/platform/ipc")>()),
  isTauri: () => false,
}));

const ID = "file-drop-test";
const submit = vi.fn();
const originalPoint = document.elementFromPoint;

beforeEach(() => {
  updateComposer(ID, emptyDraft());
  submit.mockClear();
});

afterEach(() => {
  document.elementFromPoint = originalPoint;
});

function setup(root = "D:/project", projectRoot = root) {
  const view = render(
    <Composer
      id={ID}
      placeholder="Message"
      root={root}
      projectRoot={projectRoot}
      commands={[]}
      history={[]}
      config={[]}
      onSubmit={submit}
    />,
  );
  const box = screen.getByRole("textbox") as HTMLTextAreaElement;
  document.elementFromPoint = () => box;
  return { box, ...view };
}

function drop(...paths: string[]) {
  const session = dragSession({ type: FILES_DRAG, payload: paths.join("\n") });
  act(() => {
    expect(session.drop(10, 10)).toBe(true);
  });
}

describe("project files dropped on Agent composer", () => {
  it("references multiple files, normalizes Windows paths and does not send", async () => {
    const { box } = setup();
    drop("D:\\project\\b2w_app\\api.py", "D:/project/my folder/中文.py");
    expect(box.value).toBe("@b2w_app/api.py @my folder/中文.py ");
    expect(toPrompt(composerDraft(ID)).files).toEqual(["D:/project/b2w_app/api.py", "D:/project/my folder/中文.py"]);
    expect(submit).not.toHaveBeenCalled();
    await waitFor(() => expect(box).toHaveFocus());
    drop("D:/project/b2w_app/api.py");
    expect(box.value).toBe("@b2w_app/api.py @my folder/中文.py ");
  });

  it("inserts at the selection and keeps surrounding text", () => {
    const { box } = setup();
    fireEvent.change(box, { target: { value: "Check this please", selectionStart: 6, selectionEnd: 10 } });
    drop("D:/project/api.py");
    expect(box.value).toBe("Check @api.py please");
    expect(toPrompt(composerDraft(ID)).files).toEqual(["D:/project/api.py"]);
  });

  it("maps project files into the task worktree and preserves external paths", () => {
    setup("D:/worktree", "D:/project");
    drop("D:/project/api.py", "D:/project-other/external.py");
    expect(toPrompt(composerDraft(ID)).files).toEqual(["D:/worktree/api.py", "D:/project-other/external.py"]);
  });

  it("highlights the target, cancels cleanly and unregisters on unmount", () => {
    const { box, unmount } = setup();
    const composer = box.parentElement!;
    const session = dragSession({ type: FILES_DRAG, payload: "D:/project/api.py" });
    act(() => {
      expect(session.move(10, 10)).toBe(true);
    });
    expect(composer).toHaveClass(styles.fileOver!);
    act(() => session.cancel());
    expect(composer).not.toHaveClass(styles.fileOver!);
    expect(box.value).toBe("");
    unmount();
    expect(session.drop(10, 10)).toBe(false);
  });
});

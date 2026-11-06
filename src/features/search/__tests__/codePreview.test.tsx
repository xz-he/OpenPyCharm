import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { usePlatform } from "@/platform/platformInfo";

vi.mock("../find/preview", () => ({
  loadPreviewText: async () => "fun a() {}\nval order = 1\norder()\n",
  clearPreviewCache: () => {},
}));

const { CodePreview, previewDecorations } = await import("../find/parts");

describe("CodePreview", () => {
  it("opens the clicked source position and forwards Ctrl-click for definition navigation", async () => {
    const onNavigate = vi.fn();
    const previousOs = usePlatform.getState().os;
    usePlatform.setState({ os: "windows" });
    const { container, unmount } = render(
      <CodePreview path="/p/a.kt" line={1} highlights={[]} onNavigate={onNavigate} />,
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 150)));
    const content = container.querySelector<HTMLElement>(".cm-content")!;
    const view = EditorView.findFromDOM(content)!;
    const coords = vi.spyOn(view, "posAtCoords").mockReturnValue(14);
    try {
      fireEvent.click(content);
      expect(onNavigate).toHaveBeenLastCalledWith({ line: 1, col: 3 }, false);
      fireEvent.click(content, { ctrlKey: true });
      expect(onNavigate).toHaveBeenLastCalledWith({ line: 1, col: 3 }, true);
      onNavigate.mockClear();
      act(() => view.dispatch({ selection: { anchor: 11, head: 16 } }));
      fireEvent.click(content);
      expect(onNavigate).not.toHaveBeenCalled();
    } finally {
      coords.mockRestore();
      unmount();
      usePlatform.setState({ os: previousOs });
    }
  });

  it("marks matches (the current line's as current) and the current line", () => {
    const doc = Text.of(["ab", "order order", "x"]);
    const set = previewDecorations(doc, 1, [
      {
        line: 1,
        ranges: [
          [0, 5],
          [6, 11],
        ],
      },
      { line: 2, ranges: [[0, 9]] },
      { line: 7, ranges: [[0, 1]] },
    ]);
    const out: string[] = [];
    set.between(0, doc.length, (from, to, d) => {
      out.push(`${from}-${to}:${(d.spec as { class: string }).class}`);
    });
    expect(out).toEqual([
      "3-3:cm-activeLine",
      "3-8:cm-openidea-findMatch cm-openidea-findMatch-current",
      "9-14:cm-openidea-findMatch cm-openidea-findMatch-current",
      "15-16:cm-openidea-findMatch",
    ]);
  });

  it("shows the file read-only in an editor view with the matches highlighted", async () => {
    const { container } = render(<CodePreview path="/p/a.kt" line={1} highlights={[{ line: 1, ranges: [[4, 9]] }]} />);
    await act(() => new Promise((r) => setTimeout(r, 150)));
    expect(container.querySelector(".cm-content")?.textContent).toContain("val order = 1");
    expect(container.querySelector(".cm-content")?.getAttribute("contenteditable")).not.toBe("true");
    expect(container.querySelector(".cm-openidea-findMatch")?.textContent).toBe("order");
  });
});

import { describe, expect, it } from "vitest";
import { planPyCharmSettings, pycharmKeystroke } from "../pycharmSettings";

const plan = (files: Record<string, string>) => planPyCharmSettings({ files, skipped: [] });

describe("PyCharm settings migration", () => {
  it("maps the supplied PyCharm 2025.2 export's explicit preferences without applying absent defaults", () => {
    const result = plan({
      "options/ide.general.xml": `<application><component name="GeneralSettings"><option name="confirmExit" value="false"/><option name="confirmOpenNewProject2" value="-1"/></component><component name="LocalizationStateService"><option name="selectedLocale" value="zh-CN"/></component></application>`,
      "options/editor.xml": `<application><component name="CodeInsightSettings"><option name="REFORMAT_ON_PASTE" value="1"/><option name="INDENT_TO_CARET_ON_PASTE" value="true"/></component></application>`,
      "options/ui.lnf.xml": `<application><component name="UISettings"><option name="SCROLL_TAB_LAYOUT_IN_EDITOR" value="false"/><option name="SHOW_TOOL_WINDOW_NAMES" value="true"/></component></application>`,
      "options/terminal.xml": `<application><component name="TerminalOptionsProvider"><option name="useOptionAsMetaKey" value="true"/></component></application>`,
      "options/editor-font.xml": `<application><component name="DefaultFont"><option name="VERSION" value="1"/></component></application>`,
    });
    expect(result.patch).toEqual({
      "general.confirmExit": false,
      "general.openProjectIn": "ask",
      "appearance.locale": "zh",
      "editor.smartKeys.reformatOnPaste": "indentBlock",
      "editor.tabs.multipleRows": true,
      "appearance.showToolWindowNames": true,
      "terminal.optionAsMeta": true,
    });
    expect(result.skipped).toEqual(["options/editor.xml: INDENT_TO_CARET_ON_PASTE"]);
  });

  it("imports selected custom color schemes and reports unmapped color attributes", () => {
    const result = plan({
      "colors/custom.icls": `<scheme name="My scheme" parent_scheme="Darcula"><attributes><option name="DEFAULT_KEYWORD"><value><option name="FOREGROUND" value="ABCDEF"/></value></option><option name="LOG_ERROR_OUTPUT"><value><option name="FOREGROUND" value="ffffff"/></value></option></attributes></scheme>`,
      "options/colors.scheme.xml": `<application><component name="EditorColorsManagerImpl"><global_color_scheme name="My scheme"/></component></application>`,
    });
    expect(result.patch["editor.colorScheme"]).toBe("pycharm-My%20scheme");
    expect(result.patch["editor.customSchemes"]).toMatchObject({
      "pycharm-My%20scheme": { parent: "dark", attributes: { keyword: { foreground: "#abcdef" } } },
    });
    expect(result.skipped).toEqual(["colors/custom.icls: 1"]);
  });

  it("converts shortcuts, chords and explicit unbindings while preserving unsupported actions", () => {
    const result = plan({
      "options/keymap.xml": `<application><component name="KeymapManager"><active_keymap name="Mine"/></component></application>`,
      "keymaps/Mine.xml": `<keymap name="Mine" parent="$default"><action id="Run"><keyboard-shortcut first-keystroke="ctrl shift R" second-keystroke="ctrl ENTER"/></action><action id="Debug"/><action id="SaveAll"><keyboard-shortcut first-keystroke="typed s"/></action><action id="SomePlugin.Action"><keyboard-shortcut first-keystroke="F10"/></action></keymap>`,
    });
    expect(result.patch["keymap"]).toBe("pycharm-Mine");
    expect(result.patch["customKeymaps"]).toEqual({
      "pycharm-Mine": {
        name: "Mine",
        parent: "intellij-windows",
        overrides: { "run.run": ["Ctrl+Shift+R Ctrl+Enter"], "run.debug": [] },
      },
    });
    expect(result.skipped.join(" ")).toContain("SomePlugin.Action");
    expect(result.skipped.join(" ")).toContain("SaveAll");
  });

  it("applies only the selected code style and keeps Python indents separate from other languages", () => {
    const result = plan({
      "options/code.style.schemes.xml": `<application><component name="CodeStyleSchemeSettings"><option name="CURRENT_SCHEME_NAME" value="Mine"/></component></application>`,
      "codestyles/Default.xml": `<code_scheme name="Default"><option name="RIGHT_MARGIN" value="160"/></code_scheme>`,
      "codestyles/Mine.xml": `<code_scheme name="Mine"><option name="RIGHT_MARGIN" value="100"/><codeStyleSettings language="Python"><indentOptions><option name="INDENT_SIZE" value="4"/><option name="TAB_SIZE" value="8"/><option name="USE_TAB_CHARACTER" value="false"/></indentOptions></codeStyleSettings><codeStyleSettings language="Java"><option name="RIGHT_MARGIN" value="140"/></codeStyleSettings></code_scheme>`,
    });
    expect(result.patch["editor.codeStyle.hardWrapAt"]).toBe(100);
    expect(result.patch["editor.codeStyle.languages"]).toEqual({
      python: { indent: 4, tabSize: 8, insertSpaces: true },
    });
    expect(result.patch).not.toHaveProperty("editor.tabSize");
  });

  it("validates numeric and boolean settings and rejects executable XML constructs", () => {
    expect(
      plan({
        "options/editor-font.xml": `<application><component name="DefaultFont"><option name="FONT_SIZE" value="NaN"/><option name="USE_LIGATURES" value="yes"/></component></application>`,
      }).patch,
    ).toEqual({});
    expect(() => plan({ "options/editor.xml": `<application><broken></application>` })).toThrow(
      "Invalid PyCharm settings XML",
    );
    expect(() =>
      plan({ "options/editor.xml": `<!DOCTYPE application [<!ENTITY file SYSTEM "file:///secret">]><application/>` }),
    ).toThrow("Invalid PyCharm settings XML");
  });

  it("reports unknown files and never migrates interpreter or trusted-path state", () => {
    const result = planPyCharmSettings({
      files: {},
      skipped: ["options/jdk.table.xml", "options/trusted-paths.xml", "installed.txt"],
    });
    expect(result.patch).toEqual({});
    expect(result.skipped).toHaveLength(3);
    expect(pycharmKeystroke("ctrl alt DELETE")).toBe("Ctrl+Alt+Delete");
    expect(pycharmKeystroke("released A")).toBeUndefined();
    expect(pycharmKeystroke("ctrl constructor")).toBeUndefined();
  });
});

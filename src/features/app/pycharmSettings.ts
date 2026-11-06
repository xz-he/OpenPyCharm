import { parseIcls } from "@/platform/icls";
import type { CustomColorScheme } from "@/platform/editorSettings";

export interface PyCharmSettingsPlan {
  patch: Record<string, unknown>;
  groups: string[];
  skipped: string[];
}

type Converter = (value: string) => unknown;
type Mapping = readonly [string, string, Converter];
const boolean: Converter = (value) => (value === "true" ? true : value === "false" ? false : undefined);
const text: Converter = (value) => value.trim() || undefined;
const number =
  (min: number, max: number, integer = false): Converter =>
  (value) => {
    const parsed = Number(value);
    return value.trim() &&
      Number.isFinite(parsed) &&
      parsed >= min &&
      parsed <= max &&
      (!integer || Number.isInteger(parsed))
      ? parsed
      : undefined;
  };
const choice =
  (values: Record<string, unknown>): Converter =>
  (value) =>
    Object.hasOwn(values, value) ? values[value] : undefined;

const FONT: Mapping[] = [
  ["FONT_FAMILY", "fontFamily", text],
  ["FONT_SIZE", "fontSize", number(6, 72)],
  ["FONT_SIZE_2D", "fontSize", number(6, 72)],
  ["LINE_SPACING", "lineHeight", number(0.5, 3)],
];
const COMPONENTS: Record<string, { group: string; mappings: Mapping[] }> = {
  DefaultFont: {
    group: "Editor font",
    mappings: [
      ...FONT.map(([name, key, convert]) => [name, `editor.${key}`, convert] as Mapping),
      ["USE_LIGATURES", "editor.ligatures", boolean],
      ["SECONDARY_FONT_FAMILY", "editor.fallbackFont", text],
    ],
  },
  TerminalFontOptions: {
    group: "Terminal font",
    mappings: FONT.map(([name, key, convert]) => [name, `terminal.${key}`, convert]),
  },
  GeneralSettings: {
    group: "General settings",
    mappings: [
      ["confirmExit", "general.confirmExit", boolean],
      ["reopenLastProject", "general.reopenLastProject", boolean],
      ["autoSaveIfInactive", "general.saveOnIdle", boolean],
      ["inactiveTimeout", "general.idleSeconds", number(1, 3600, true)],
      ["confirmOpenNewProject2", "general.openProjectIn", choice({ "-1": "ask", "0": "new", "1": "same" })],
    ],
  },
  LocalizationStateService: {
    group: "Appearance",
    mappings: [
      [
        "selectedLocale",
        "appearance.locale",
        choice({ "zh-CN": "zh", zh: "zh", en: "en", "en-US": "en", fr: "fr", ko: "ko", pl: "pl", pt: "pt" }),
      ],
    ],
  },
  UISettings: {
    group: "Appearance",
    mappings: [
      ["SHOW_TOOL_WINDOW_NAMES", "appearance.showToolWindowNames", boolean],
      [
        "HIDE_TOOL_STRIPES",
        "appearance.showToolWindowBars",
        (value) => (typeof boolean(value) === "boolean" ? !boolean(value) : undefined),
      ],
      [
        "SCROLL_TAB_LAYOUT_IN_EDITOR",
        "editor.tabs.multipleRows",
        (value) => (typeof boolean(value) === "boolean" ? !boolean(value) : undefined),
      ],
      ["EDITOR_TAB_LIMIT", "editor.tabs.tabLimit", number(1, 200, true)],
      ["SHOW_CLOSE_BUTTON", "editor.tabs.showCloseButton", boolean],
      ["FONT_FACE", "appearance.uiFontFamily", text],
      ["FONT_SIZE", "appearance.uiFontSize", number(8, 32)],
      ["OVERRIDE_NONIDEA_LAF_FONTS", "appearance.useCustomFont", boolean],
    ],
  },
  EditorSettings: {
    group: "Editor settings",
    mappings: [
      ["IS_WHITESPACES_SHOWN", "editor.showWhitespace", boolean],
      ["ARE_LINE_NUMBERS_SHOWN", "editor.appearance.lineNumbers", boolean],
      ["IS_INDENT_GUIDES_SHOWN", "editor.appearance.indentGuides", boolean],
      ["IS_CARET_BLINKING", "editor.appearance.caretBlinking", boolean],
      ["CARET_BLINK_PERIOD", "editor.appearance.caretBlinkPeriod", number(100, 2000, true)],
      ["IS_BLOCK_CURSOR", "editor.appearance.blockCaret", boolean],
      ["IS_WHEEL_FONTCHANGE_ENABLED", "editor.general.wheelZoom", boolean],
      ["USE_SOFT_WRAPS", "editor.softWrap", (value) => value.split(";").includes("MAIN_EDITOR")],
      ["SOFT_WRAP_FILE_MASKS", "editor.general.softWrapFiles", text],
      ["IS_CAMEL_WORDS", "editor.smartKeys.camelHumps", boolean],
      ["IS_SMART_HOME", "editor.smartKeys.smartHome", boolean],
      ["ENSURE_NEWLINE_AT_EOF", "files.ensureFinalNewline", boolean],
    ],
  },
  CodeInsightSettings: {
    group: "Code completion and editing",
    mappings: [
      ["AUTO_POPUP_COMPLETION_LOOKUP", "editor.completion.autoPopup", boolean],
      ["AUTO_POPUP_PARAMETER_INFO", "editor.completion.parameterInfo", boolean],
      ["AUTO_POPUP_JAVADOC_INFO", "editor.completion.showDocumentation", boolean],
      ["AUTOCOMPLETE_ON_CODE_COMPLETION", "editor.completion.autoInsertSingle", boolean],
      ["AUTOINSERT_PAIR_BRACKET", "editor.smartKeys.pairBrackets", boolean],
      ["AUTOINSERT_PAIR_QUOTE", "editor.smartKeys.pairQuotes", boolean],
      ["SURROUND_SELECTION_ON_QUOTE_TYPED", "editor.smartKeys.surroundSelection", boolean],
      [
        "REFORMAT_ON_PASTE",
        "editor.smartKeys.reformatOnPaste",
        choice({ "0": "none", "1": "indentBlock", "2": "indentEachLine" }),
      ],
    ],
  },
  TerminalOptionsProvider: {
    group: "Terminal settings",
    mappings: [
      ["useOptionAsMetaKey", "terminal.optionAsMeta", boolean],
      ["audibleBell", "terminal.audibleBell", boolean],
      ["closeSessionOnLogout", "terminal.closeOnExit", boolean],
      ["copyOnSelection", "terminal.copyOnSelection", boolean],
      ["pasteOnMiddleMouseButton", "terminal.pasteOnMiddleClick", boolean],
      ["shellIntegration", "terminal.shellIntegration", boolean],
    ],
  },
};

const ACTIONS: Record<string, string> = {
  GotoDeclaration: "navigate.declaration",
  GotoImplementation: "navigate.implementation",
  GotoTypeDeclaration: "navigate.typeDeclaration",
  GotoTest: "navigate.gotoTest",
  GotoClass: "navigate.gotoClass",
  GotoFile: "navigate.gotoFile",
  GotoSymbol: "navigate.gotoSymbol",
  GotoAction: "navigate.findAction",
  GotoLine: "navigate.gotoLine",
  SearchEverywhere: "navigate.searchEverywhere",
  RecentFiles: "navigate.recentFiles",
  Back: "navigate.back",
  Forward: "navigate.forward",
  FileStructurePopup: "navigate.fileStructure",
  Find: "find.inFile",
  Replace: "find.replaceInFile",
  FindInPath: "find.inPath",
  ReplaceInPath: "find.replaceInPath",
  FindUsages: "find.usages",
  ReformatCode: "code.reformat",
  OptimizeImports: "code.optimizeImports",
  CommentByLineComment: "code.commentLine",
  CommentByBlockComment: "code.commentBlock",
  ShowIntentionActions: "code.showIntentions",
  QuickJavaDoc: "code.quickDocumentation",
  ParameterInfo: "code.parameterInfo",
  CodeCompletion: "code.completion",
  RenameElement: "refactor.rename",
  Run: "run.run",
  Debug: "run.debug",
  RunClass: "run.runContext",
  DebugClass: "run.debugContext",
  Stop: "run.stop",
  Rerun: "run.rerun",
  ToggleLineBreakpoint: "debug.toggleBreakpoint",
  SaveAll: "file.save",
  ShowSettings: "file.settings",
  CloseContent: "editor.closeTab",
  CloseEditor: "editor.closeTab",
  CloseAllEditors: "editor.closeAllTabs",
  NextTab: "editor.nextTab",
  PreviousTab: "editor.prevTab",
  ActivateProjectToolWindow: "toolwindow.project",
};

export function pycharmKeystroke(value: string): string | undefined {
  const tokens = value.trim().toLowerCase().split(/\s+/);
  const key = tokens.pop();
  const modifiers: Record<string, string> = { ctrl: "Ctrl", control: "Ctrl", alt: "Alt", shift: "Shift", meta: "Meta" };
  const keys: Record<string, string> = {
    enter: "Enter",
    escape: "Escape",
    tab: "Tab",
    space: "Space",
    back_space: "Backspace",
    delete: "Delete",
    insert: "Insert",
    home: "Home",
    end: "End",
    page_up: "PageUp",
    page_down: "PageDown",
    up: "Up",
    down: "Down",
    left: "Left",
    right: "Right",
    slash: "/",
    back_slash: "\\",
    comma: ",",
    period: ".",
    semicolon: ";",
    quote: "'",
    open_bracket: "[",
    close_bracket: "]",
    minus: "-",
    equals: "=",
    back_quote: "`",
  };
  if (!key || tokens.some((token) => !Object.hasOwn(modifiers, token))) return undefined;
  const converted = Object.hasOwn(keys, key)
    ? keys[key]
    : /^(?:[a-z0-9]|f(?:[1-9]|1[0-9]|2[0-4]))$/.test(key)
      ? key.toUpperCase()
      : undefined;
  return converted ? [...new Set(tokens.map((token) => modifiers[token])), converted].join("+") : undefined;
}

function preset(name: string): string | undefined {
  const presets: Record<string, string> = {
    $default: "intellij-windows",
    Windows: "intellij-windows",
    Default: "intellij-windows",
    "Mac OS X": "intellij-macos",
    "Mac OS X 10.5+": "intellij-macos",
    macOS: "intellij-macos",
    "Visual Studio Code": "vscode-windows",
    Eclipse: "eclipse-windows",
  };
  return Object.hasOwn(presets, name) ? presets[name] : undefined;
}

export function planPyCharmSettings(archive: {
  files: Record<string, string>;
  skipped: string[];
}): PyCharmSettingsPlan {
  const patch: Record<string, unknown> = {};
  const groups = new Set<string>();
  const skipped = [...archive.skipped];
  const documents = new Map<string, Document>();
  const consumed = new Set<Element>();
  const set = (key: string, value: unknown, group: string, element?: Element) => {
    if (value === undefined) return;
    patch[key] = value;
    groups.add(group);
    if (element) consumed.add(element);
  };
  for (const [path, source] of Object.entries(archive.files)) {
    const document = new DOMParser().parseFromString(source, "application/xml");
    if (
      document.doctype ||
      document.querySelector("parsererror") ||
      !["application", "scheme", "keymap", "code_scheme"].includes(document.documentElement.tagName)
    )
      throw new Error(`Invalid PyCharm settings XML: ${path}`);
    documents.set(path, document);
  }
  for (const document of documents.values()) {
    for (const component of document.querySelectorAll("component")) {
      const name = component.getAttribute("name") ?? "";
      const mapping = Object.hasOwn(COMPONENTS, name) ? COMPONENTS[name] : undefined;
      if (!mapping) continue;
      for (const [source, target, convert] of mapping.mappings) {
        const option = Array.from(component.children).find(
          (child) => child.tagName === "option" && child.getAttribute("name") === source,
        );
        const value = option?.getAttribute("value");
        if (value != null) set(target, convert(value), mapping.group, option);
      }
    }
  }
  if (Object.keys(patch).some((key) => key.startsWith("terminal.font") || key === "terminal.lineHeight"))
    set("terminal.useEditorFont", false, "Terminal font");
  const schemes: Record<string, CustomColorScheme> = {};
  const schemeIds = new Map<string, string>();
  for (const [path, document] of documents) {
    if (!path.startsWith("colors/")) continue;
    const parsed = parseIcls(archive.files[path]!);
    const id = `pycharm-${encodeURIComponent(parsed.scheme.name)}`;
    schemes[id] = parsed.scheme;
    schemeIds.set(parsed.scheme.name, id);
    if (parsed.skipped) skipped.push(`${path}: ${parsed.skipped}`);
    for (const element of document.querySelectorAll("option")) consumed.add(element);
    for (const [source, key, convert] of FONT) {
      const option = Array.from(document.documentElement.children).find(
        (element) => element.getAttribute("name") === `EDITOR_${source}`,
      );
      if (option?.getAttribute("value") != null) {
        const activeName = documents
          .get("options/colors.scheme.xml")
          ?.querySelector("global_color_scheme")
          ?.getAttribute("name");
        if (activeName === parsed.scheme.name)
          set(`editor.${key}`, convert(option.getAttribute("value")!), "Editor font");
      }
    }
  }
  if (Object.keys(schemes).length) set("editor.customSchemes", schemes, "Color schemes");
  const activeScheme = documents.get("options/colors.scheme.xml")?.querySelector("global_color_scheme");
  if (activeScheme) {
    const name = activeScheme.getAttribute("name") ?? "";
    const id =
      schemeIds.get(name) ??
      (/darcula|islands dark/i.test(name) ? "dark" : /^(default|intellij light)$/i.test(name) ? "light" : undefined);
    set("editor.colorScheme", id, "Color schemes", activeScheme);
  }
  const laf = documents.get("options/laf.xml")?.querySelector("laf");
  if (laf) {
    const name = `${laf.getAttribute("class-name")} ${laf.getAttribute("themeId")}`;
    const theme = /darcula|dark/i.test(name) ? "dark" : /light|IntelliJLaf/i.test(name) ? "light" : undefined;
    set("appearance.theme", theme, "Appearance", laf);
    if (theme) set("appearance.syncWithOs", false, "Appearance");
  }
  const selectedStyle = documents
    .get("options/code.style.schemes.xml")
    ?.querySelector('option[name="CURRENT_SCHEME_NAME"]');
  const styleName = selectedStyle?.getAttribute("value") ?? "Default";
  const pythonStyle: Record<string, unknown> = {};
  for (const [path, document] of documents) {
    if (!path.startsWith("codestyles/") || document.documentElement.getAttribute("name") !== styleName) continue;
    if (selectedStyle) consumed.add(selectedStyle);
    for (const option of document.querySelectorAll("option[value]")) {
      const name = option.getAttribute("name");
      const scope = option.closest("codeStyleSettings");
      if (scope && scope.getAttribute("language") !== "Python") continue;
      if (option.closest("PythonCodeStyleSettings")) continue;
      const value = option.getAttribute("value")!;
      const fields: Record<string, [string, Converter]> = {
        TAB_SIZE: ["editor.tabSize", number(1, 16, true)],
        INDENT_SIZE: ["editor.tabSize", number(1, 16, true)],
        USE_TAB_CHARACTER: [
          "editor.insertSpaces",
          (input) => (typeof boolean(input) === "boolean" ? !boolean(input) : undefined),
        ],
        RIGHT_MARGIN: ["editor.codeStyle.hardWrapAt", number(20, 1000, true)],
        LINE_SEPARATOR: ["editor.codeStyle.lineSeparator", choice({ "\n": "lf", "\r\n": "crlf", "\r": "cr" })],
      };
      const mapping = name && Object.hasOwn(fields, name) ? fields[name] : undefined;
      if (mapping) {
        const converted = mapping[1](value);
        if (scope && name !== "LINE_SEPARATOR" && converted !== undefined) {
          const fields: Record<string, string> = {
            TAB_SIZE: "tabSize",
            INDENT_SIZE: "indent",
            USE_TAB_CHARACTER: "useTab",
            RIGHT_MARGIN: "hardWrapAt",
          };
          pythonStyle[fields[name!]!] = name === "USE_TAB_CHARACTER" ? !converted : converted;
          consumed.add(option);
        } else if (!scope) set(mapping[0], converted, "Python code style", option);
      }
    }
  }
  if (Object.keys(pythonStyle).length) set("editor.codeStyle.languages", { python: pythonStyle }, "Python code style");
  const keymaps: Record<string, { name: string; parent: string; overrides: Record<string, string[]> }> = {};
  const activeKeymap = documents.get("options/keymap.xml")?.querySelector("active_keymap");
  for (const [path, document] of documents) {
    if (!path.startsWith("keymaps/")) continue;
    const root = document.documentElement;
    const name = root.getAttribute("name");
    const parent = preset(root.getAttribute("parent") ?? "$default");
    if (!name || !parent) continue;
    const overrides: Record<string, string[]> = {};
    for (const action of root.querySelectorAll("action")) {
      const actionId = action.getAttribute("id") ?? "";
      const target = Object.hasOwn(ACTIONS, actionId) ? ACTIONS[actionId] : undefined;
      if (!target) continue;
      const bindings: string[] = [];
      let valid = true;
      for (const shortcut of action.children) {
        if (shortcut.tagName !== "keyboard-shortcut") {
          valid = false;
          break;
        }
        const first = pycharmKeystroke(shortcut.getAttribute("first-keystroke") ?? "");
        const secondSource = shortcut.getAttribute("second-keystroke");
        const second = secondSource ? pycharmKeystroke(secondSource) : undefined;
        if (!first || (secondSource && !second)) {
          valid = false;
          break;
        }
        bindings.push(second ? `${first} ${second}` : first);
      }
      if (valid) {
        overrides[target] = bindings;
        consumed.add(action);
      }
    }
    const id = `pycharm-${encodeURIComponent(name)}`;
    keymaps[id] = { name, parent, overrides };
    if (activeKeymap?.getAttribute("name") === name) set("keymap", id, "Keymap", activeKeymap);
  }
  if (Object.keys(keymaps).length) set("customKeymaps", keymaps, "Keymap");
  if (activeKeymap && !consumed.has(activeKeymap))
    set("keymap", preset(activeKeymap.getAttribute("name") ?? ""), "Keymap", activeKeymap);
  for (const [path, document] of documents) {
    const remaining = Array.from(
      document.querySelectorAll("option, action, global_color_scheme, active_keymap, laf, entry"),
    ).filter(
      (element) =>
        !consumed.has(element) &&
        element.getAttribute("name") !== "VERSION" &&
        !element.closest("metaInfo") &&
        (element.tagName !== "option" || element.hasAttribute("value") || !element.children.length),
    );
    if (remaining.length)
      skipped.push(
        `${path}: ${remaining.map((element) => element.getAttribute("name") ?? element.getAttribute("id") ?? element.getAttribute("key") ?? element.tagName).join(", ")}`,
      );
  }
  return { patch, groups: [...groups], skipped };
}

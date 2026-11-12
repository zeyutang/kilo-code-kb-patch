// The extension's settings: one table of their off values and bounds, the one
// place the configuration is read from, a reader for each switch, and the
// guards on the values that go into a stylesheet.

import vscode = require("vscode");

// KaTeX's own `.katex` size, and therefore the value at which the math size
// asks for nothing. Kept in step with the schema default in package.json, and
// checked against the shipped stylesheet by the harness rather than read from
// it, so that a KaTeX upgrade cannot silently start overriding the size for
// users who never touched the setting.
export const KATEX_DEFAULT_EM = 1.21;

// Every setting this extension contributes, by its key under the
// `kiloCodeKbPatch` section, with the value that means "off" for it and, for a
// number, its bounds. The off value is also what an unset setting reads as,
// and it is what Restore Originals writes back, so a numeric or textual knob
// is neutralised the same way a boolean one is. The math size's off value is
// KaTeX's own size, so the default asks for no override at all. package.json
// declares the same defaults and bounds, and verify checks that the two agree.
export const SETTINGS = {
  addAttachFileButton: { off: false },
  renameOpenInTab: { off: false },
  chatMathRendering: { off: false },
  chatRawMarkdownButton: { off: false },
  chatHistoryFontSizeEm: { off: 1, min: 0.5, max: 3 },
  chatHistoryFontFamily: { off: "" },
  chatMathFontSizeEm: { off: KATEX_DEFAULT_EM, min: 0.5, max: 2 },
};
type SettingKey = keyof typeof SETTINGS;

// The section, named here and nowhere else. Settings are read when they are
// needed rather than kept, so a reader always sees the current value.
export function config(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration("kiloCodeKbPatch");
}

export function addAttachFileButtonEnabled(): boolean {
  return config().get<boolean>(
    "addAttachFileButton",
    SETTINGS.addAttachFileButton.off,
  );
}

export function renameOpenInTabEnabled(): boolean {
  return config().get<boolean>("renameOpenInTab", SETTINGS.renameOpenInTab.off);
}

export function chatMathRenderingEnabled(): boolean {
  return config().get<boolean>(
    "chatMathRendering",
    SETTINGS.chatMathRendering.off,
  );
}

export function chatRawMarkdownEnabled(): boolean {
  return config().get<boolean>(
    "chatRawMarkdownButton",
    SETTINGS.chatRawMarkdownButton.off,
  );
}

// A number setting can arrive as anything (a hand-edited settings.json is not
// validated against the schema before it reaches us), and it is interpolated
// into a stylesheet, so it is coerced and clamped rather than trusted. Rounded
// to three places so the emitted calc() stays readable and so float noise
// cannot make an unchanged setting look changed.
export function clampSetting(
  key: "chatHistoryFontSizeEm" | "chatMathFontSizeEm",
): number {
  const { off, min, max } = SETTINGS[key];
  const raw = config().get<number>(key, off);
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return off;
  return Number(Math.min(max, Math.max(min, n)).toFixed(3));
}

// The font-family value goes verbatim into Kilo's stylesheet. This is the
// user's own setting rather than a trust boundary, but a stray brace or
// semicolon would corrupt the whole sheet and take the chat's styling with it,
// so anything outside what a font-family list needs disqualifies the value and
// it is ignored. The allowed set covers quoted and unquoted family names,
// commas, and var(--custom-prop) references.
const CHAT_FONT_FAMILY_RE = /^[A-Za-z0-9 \-_,.'"()]+$/;

export function chatFontFamily(): string {
  const raw = config().get<string>(
    "chatHistoryFontFamily",
    SETTINGS.chatHistoryFontFamily.off,
  );
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return "";
  return CHAT_FONT_FAMILY_RE.test(value) ? value : "";
}

// Every bonus setting paired with its off value, in the table's order.
export const BONUS_SETTING_DEFAULTS: [string, boolean | number | string][] = (
  Object.keys(SETTINGS) as SettingKey[]
).map((key) => [key, SETTINGS[key].off]);

// Write a bonus setting back to its off value, but only in the scopes where the
// user has actually set something else (globalValue/workspaceValue/
// workspaceFolderValue defined), so Restore Originals turns the bonus off for
// good without writing settings entries the user never added. An absent or
// already-off entry is left alone.
export async function forceSettingOff(
  key: string,
  off: boolean | number | string,
): Promise<void> {
  const settings = config();
  const info = settings.inspect<boolean | number | string>(key);
  if (!info) return;
  const scopes: [
    boolean | number | string | undefined,
    vscode.ConfigurationTarget,
  ][] = [
    [info.globalValue, vscode.ConfigurationTarget.Global],
    [info.workspaceValue, vscode.ConfigurationTarget.Workspace],
    [info.workspaceFolderValue, vscode.ConfigurationTarget.WorkspaceFolder],
  ];
  for (const [value, target] of scopes) {
    if (value !== undefined && value !== off) {
      await settings.update(key, off, target);
    }
  }
}

// The bonus settings: a reader for each switch, the values Restore Originals
// writes back, and the guards on the values that go into a stylesheet.

import vscode = require("vscode");

export function addAttachFileButtonEnabled(): boolean {
  return vscode.workspace
    .getConfiguration("kiloCodeKbPatch")
    .get<boolean>("addAttachFileButton", false);
}

export function chatMathRenderingEnabled(): boolean {
  return vscode.workspace
    .getConfiguration("kiloCodeKbPatch")
    .get<boolean>("chatMathRendering", false);
}

export function chatRawMarkdownEnabled(): boolean {
  return vscode.workspace
    .getConfiguration("kiloCodeKbPatch")
    .get<boolean>("chatRawMarkdownButton", false);
}

// A number setting can arrive as anything (a hand-edited settings.json is not
// validated against the schema before it reaches us), and it is interpolated
// into a stylesheet, so it is coerced and clamped rather than trusted. Rounded
// to three places so the emitted calc() stays readable and so float noise
// cannot make an unchanged setting look changed.
export function clampSetting(
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = vscode.workspace
    .getConfiguration("kiloCodeKbPatch")
    .get<number>(key, fallback);
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
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
  const raw = vscode.workspace
    .getConfiguration("kiloCodeKbPatch")
    .get<string>("chatHistoryFontFamily", "");
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return "";
  return CHAT_FONT_FAMILY_RE.test(value) ? value : "";
}

// Every bonus setting paired with the value that means "off" for it. Restore
// Originals writes these back, so a numeric or textual knob is neutralised the
// same way a boolean one is.
export const BONUS_SETTING_DEFAULTS: [string, boolean | number | string][] = [
  ["addAttachFileButton", false],
  ["renameOpenInTab", false],
  ["chatMathRendering", false],
  ["chatRawMarkdownButton", false],
  ["chatHistoryFontSizeEm", 1],
  ["chatHistoryFontFamily", ""],
  // KaTeX's own em size, so the default asks for no override at all. Kept in
  // step with the schema default in package.json.
  ["chatMathFontSizeEm", 1.21],
];

// Write a bonus setting back to its off value, but only in the scopes where the
// user has actually set something else (globalValue/workspaceValue/
// workspaceFolderValue defined), so Restore Originals turns the bonus off for
// good without writing settings entries the user never added. An absent or
// already-off entry is left alone.
export async function forceSettingOff(
  key: string,
  off: boolean | number | string,
): Promise<void> {
  const config = vscode.workspace.getConfiguration("kiloCodeKbPatch");
  const info = config.inspect<boolean | number | string>(key);
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
      await config.update(key, off, target);
    }
  }
}

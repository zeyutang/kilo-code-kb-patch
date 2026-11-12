// The editor-title bonus, the one that edits Kilo's manifest.

import fs = require("fs");
import path = require("path");
import { extensionContext } from "../host/context";
import { renameOpenInTabEnabled } from "../host/settings";

// --- Bonus editor-title icon knob -------------------------------------------
// Kilo's editor/title action `kilo-code.new.openInTab` ("Open in Tab") rides on
// every editor's title bar. VSCode sorts same-group, same-order title actions by
// their raw title (localeCompare), so retitling this command relocates the icon.
// "Kilo Code: Open" sorts just after Claude Code's "Claude Code: Open", grouping
// the two AI "Open" icons together.
//
// This is an opt-in bonus setting, declared in the extension's package.json (the
// contributes.configuration block) so VS Code lists it in the Settings UI and
// allows config.update to write it. The status webview lists it only in the
// bonus section, which never feeds the verdict.
export const OPEN_IN_TAB_ORIGINAL = "Open in Tab";
export const OPEN_IN_TAB_RENAMED = "Kilo Code: Open";

// Anchored on the unique command id. The command definition is the only place
// where "title" immediately follows this id (the menu contribution is followed
// by "group"/"when"), so this matches exactly once and stays idempotent no
// matter what the title currently is. Capture group 1 is everything up to and
// including `"title": `, so only the quoted value is rewritten.
export const OPEN_IN_TAB_TITLE_RE =
  /("command":\s*"kilo-code\.new\.openInTab"\s*,\s*"title":\s*)"(?:[^"\\]|\\.)*"/;

function desiredOpenInTabTitle(): string {
  return renameOpenInTabEnabled() ? OPEN_IN_TAB_RENAMED : OPEN_IN_TAB_ORIGINAL;
}

// Rewrite the openInTab title in Kilo's manifest to match the bonus setting.
// Returns true only when the file actually changed. Fails safe: a missing
// manifest or a manifest whose shape a future Kilo has changed (pattern not
// found) is a silent no-op rather than an error.
export function reconcileOpenInTabTitle(extPath: string): boolean {
  const pkgPath = path.join(extPath, "package.json");
  if (!fs.existsSync(pkgPath)) return false;
  const content = fs.readFileSync(pkgPath, "utf8");
  if (!OPEN_IN_TAB_TITLE_RE.test(content)) return false;
  const desired = desiredOpenInTabTitle();
  const updated = content.replace(
    OPEN_IN_TAB_TITLE_RE,
    (_match, prefix: string) => `${prefix}${JSON.stringify(desired)}`,
  );
  if (updated === content) return false;
  fs.writeFileSync(pkgPath, updated, "utf8");
  invalidateExtensionScannerCache();
  return true;
}

// VS Code reads every installed extension's manifest at window startup from a
// cache, <user data>/CachedProfilesData/<profile>/extensions.user.cache, and
// rescans the folders only when that file is missing or the extension list
// changed. A few seconds later it compares the cache with the disk regardless,
// and where they differ it deletes the cache and asks for another reload
// ("Extensions have been modified on disk"). A rewritten manifest would thus
// cost two reloads, so the cache goes with the write, for every profile: the
// scanner treats a missing cache as routine and rebuilds it on the next launch.
//
// The user data folder is found from this extension's own global storage,
// which sits below it (User/globalStorage/<id> on the default profile,
// User/profiles/<id>/globalStorage/<id> on any other). Fails safe: an
// unrecognized layout, or the offline harness's context without storage,
// deletes nothing, and the editor's own second prompt still covers the change.
function invalidateExtensionScannerCache(): void {
  const storage = extensionContext?.globalStorageUri?.fsPath;
  if (!storage) return;
  const parts = storage.split(path.sep);
  const at = parts.lastIndexOf("globalStorage");
  const user = at < 0 ? -1 : parts.lastIndexOf("User", at);
  if (user < 1) return;
  const cacheRoot = path.join(
    parts.slice(0, user).join(path.sep),
    "CachedProfilesData",
  );
  let profiles: string[];
  try {
    profiles = fs.readdirSync(cacheRoot);
  } catch {
    return;
  }
  for (const profile of profiles) {
    try {
      fs.rmSync(path.join(cacheRoot, profile, "extensions.user.cache"), {
        force: true,
      });
    } catch {}
  }
}

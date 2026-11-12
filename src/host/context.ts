// The ExtensionContext activation receives, for the modules that read the
// editor's folders, storage and state through it.

import type * as vscode from "vscode";

// Set at activation. Used to derive the extensions folder this editor loads
// from, so discovery follows the editor rather than a hardcoded path.
export let extensionContext: vscode.ExtensionContext | undefined;

// Activation sets it, and so does the offline harness, which has no extension
// host and supplies a context of its own.
export function setExtensionContext(
  context: vscode.ExtensionContext | undefined,
): void {
  extensionContext = context;
}

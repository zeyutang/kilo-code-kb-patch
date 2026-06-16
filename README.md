# Kilo Code KB Patch

Patches [Kilo Code](https://github.com/Kilo-Org/kilocode) VS Code extension keyboard behavior to match [Claude Code](https://github.com/anthropics/claude-code).

> **Supported versions** (patterns verified against these):
>
> - Kilo Code: **7.3.46** (`kilocode.kilo-code-7.3.46-darwin-arm64`)
> - Claude Code (reference): **2.1.178** (`anthropic.claude-code-2.1.178-darwin-arm64`)

This repo provides two ways to apply the patches:

1. **VS Code extension** (`src/extension.ts`) -- Auto-detection, commands, status checking. Install as a `.vsix`.
2. **Standalone script** (`patch.py`) -- Quick one-liner, no extension needed.

## What it does

| Context                           | Key           | Before (Kilo Code default) | After (patched)                        |
| --------------------------------- | ------------- | -------------------------- | -------------------------------------- |
| Chat input                        | `Enter`       | Send message               | New line                               |
| Chat input                        | `Cmd+Enter`   | N/A                        | Send message                           |
| Chat input                        | `Shift+Enter` | New line                   | New line (unchanged)                   |
| Permission + textarea empty       | `Enter`       | Approve                    | Approve (unchanged)                    |
| Permission + textarea empty       | `Space`       | N/A                        | Approve (unchanged)                    |
| Permission + textarea empty       | `Escape`      | Reject                     | Reject (unchanged)                     |
| Permission + textarea has content | `Enter`       | Approve                    | New line (chat handles it)             |
| Permission + textarea has content | `Cmd+Enter`   | N/A                        | No action (address prompt first)       |
| Permission + textarea has content | `Space`       | N/A                        | Space (chat handles it)                |
| Permission + textarea has content | `Escape`      | Reject                     | Dismiss autocomplete (chat handles it) |
| Permission + textarea has content | `Cmd+Escape`  | N/A                        | Reject permission                      |
| KiloClaw chat                     | `Enter`       | Send message               | New line                               |
| KiloClaw chat                     | `Cmd+Enter`   | N/A                        | Send message                           |

## VS Code Extension

### Install

```bash
npm install
npm run compile
npx @vscode/vsce package
# Install the .vsix in VS Code
code --install-extension kilo-code-kb-patch-*.vsix
```

### Usage

The extension auto-detects when Kilo Code is installed but unpatched and prompts you to apply.

Commands available via Command Palette (`Cmd+Shift+P`):

- **Kilo Code KB Patch: Apply Patches** -- Apply all patches
- **Kilo Code KB Patch: Restore Originals** -- Revert to original behavior
- **Kilo Code KB Patch: Show Status** -- Show which patches are applied/original/missing

After applying or restoring, you will be prompted to reload the VS Code window.

## Standalone Script

```bash
# Apply patches (default)
python3 patch.py

# Revert all patches to original
python3 patch.py restore
```

Then reload the VS Code window: `Cmd+Shift+P` → `Developer: Reload Window`

Re-run `patch.py` after every Kilo Code extension update (the script auto-finds the latest version).

## Detailed Behavior Comparison

### Chat Input (no permission prompt)

| Key           | Claude Code (default)      | Claude Code (`useCtrlEnterToSend=true`) | Kilo Code (native)         | Kilo Code (patched) |
| ------------- | -------------------------- | --------------------------------------- | -------------------------- | ------------------- |
| `Enter`       | Send                       | Newline                                 | Send                       | **Newline**         |
| `Shift+Enter` | Newline                    | Newline                                 | Newline                    | Newline             |
| `Cmd+Enter`   | --                         | Send                                    | --                         | **Send**            |
| `Escape`      | Dismiss autocomplete/abort | Same                                    | Dismiss autocomplete/abort | Same                |

### Permission Prompt -- Textarea Has Content

When the textarea has content, all Enter/Space/Escape keydowns are routed to the chat input. The permission prompt must be addressed first (via mouse click or Cmd+Escape).

| Key          | Claude Code                                                    | Kilo Code (native) | Kilo Code (patched)                  |
| ------------ | -------------------------------------------------------------- | ------------------ | ------------------------------------ |
| `Enter`      | Wait for a short period before switching focus, if stop typing | Approve            | **Newline** (chat handles it)        |
| `Cmd+Enter`  | --                                                             | --                 | **No action** (address prompt first) |
| `Space`      | --                                                             | --                 | **Space** (chat handles it)          |
| `Escape`     | Wait for a short period before switching focus, if stop typing | Reject             | **Dismiss autocomplete only** (chat) |
| `Cmd+Escape` | --                                                             | --                 | **Reject**                           |

### Permission Prompt -- Textarea Empty

(Claude Code hides the input in this case, so focus is on permission buttons)

| Key      | Claude Code | Kilo Code (native) | Kilo Code (patched) |
| -------- | ----------- | ------------------ | ------------------- |
| `Enter`  | Approve     | Approve            | Approve             |
| `Space`  | Approve     | Approve            | Approve             |
| `Escape` | Reject      | Reject             | Reject              |

### Key Architectural Difference

- **Claude Code**: Permission keydown handler is on the container `div` (bubbling phase). Chat input events never reach it since the input is a sibling, not a child. When chat input is empty + permission visible, the input is hidden (`display:none`), so focus shifts to permission buttons and bare Enter/Escape work for approve/reject.

- **Kilo Code (native)**: Permission keydown handler is on `document.addEventListener("keydown", $, true)` -- **capture phase**. It intercepts ALL keydown events before any element handler runs. The `L(z,j)` function decides whether to skip, but for the chat textarea branch it always returned `false` (`H?!1`), meaning bare Enter/Escape always reached the permission handler regardless of chat focus.

- **Kilo Code (patched)**: The `L()` function now checks `document.querySelector("textarea.prompt-input")?.value?.trim()` to determine textarea content regardless of focus. When the textarea has content, it returns `true` for Enter/Space/Escape (the capture-phase handler skips them, chat input handles them). When the textarea is empty, it returns `false` (the permission handler processes Enter/Space/Escape for approve/reject). The `R` handler (element-level Escape on the permission container) is also patched to only reject on bare Escape when the textarea is empty; Cmd+Escape always rejects. This emulates Claude Code's behavior of hiding the input when empty + permission visible.

## Versioning

The extension uses independent semver. The supported Kilo Code version is noted in the header. When Kilo Code updates, verify the patch patterns still work and bump the extension version.

## How it works

The patches do string replacements on the minified JavaScript in Kilo Code's `dist/` directory:

1. **`webview.js` -- Chat input Enter handler**: Changes the condition from `!Pe.shiftKey` (bare Enter) to `Pe.metaKey` (Cmd+Enter) for sending messages.

2. **`webview.js` -- Permission prompt L() function**: The `L(z,j)` function determines whether the global capture-phase keydown handler should skip a key event. The original returns `false` for the chat textarea branch (`H?!1`), meaning the handler never skips. The patch checks textarea content via `document.querySelector("textarea.prompt-input")?.value?.trim()` (focus-independent): when it has text, all Enter/Space/Escape are skipped (chat handles them); when empty, the permission handler processes them normally.

3. **`webview.js` -- Permission $ handler**: Cmd+Enter approves only when textarea is empty; Space also approves when textarea is empty.

4. **`webview.js` -- Permission R handler**: Bare Escape only rejects when textarea is empty; Cmd+Escape always rejects.

5. **`kiloclaw.js` -- KiloClaw chat input**: Same Enter/Cmd+Enter swap for the two KiloClaw chat handlers.

## Troubleshooting

- **Patch has no effect**: Make sure you reloaded the VS Code window after patching.
- **Patterns not found**: The Kilo Code extension may have updated and changed the minified code structure. Check the "Show Status" command output (extension) or `SKIP` messages (script) and update the patch patterns in `src/extension.ts` or `patch.py`.
- **Behavior reverts after update**: Extension updates overwrite `dist/`. Re-apply patches.

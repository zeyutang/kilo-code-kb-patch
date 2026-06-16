# Kilo Code KB Patch

Patches [Kilo Code](https://github.com/Kilo-Org/kilocode) VS Code extension keyboard behavior to match [Claude Code](https://github.com/anthropics/claude-code).

> **Supported versions** (patterns verified against these):
>
> - Kilo Code: **7.3.46** (`kilocode.kilo-code-7.3.46-darwin-arm64`)
> - Claude Code (reference): **2.1.178** (`anthropic.claude-code-2.1.178-darwin-arm64`)
>
> Extension version mirrors the Kilo Code version it patches. Update manually when Kilo Code updates.

This repo provides two ways to apply the patches:

1. **VS Code extension** (`src/extension.ts`) — Auto-detection, commands, status checking. Install as a `.vsix`.
2. **Standalone script** (`patch.py`) — Quick one-liner, no extension needed.

## What it does

| Context                                | Key           | Before (Kilo Code default) | After (matches Claude Code) |
| -------------------------------------- | ------------- | -------------------------- | --------------------------- |
| Chat input                             | `Enter`       | Send message               | New line                    |
| Chat input                             | `Cmd+Enter`   | N/A                        | Send message                |
| Chat input                             | `Shift+Enter` | New line                   | New line (unchanged)        |
| Permission, chat empty + focused       | `Enter`       | Approve                    | Approve (unchanged)         |
| Permission, chat empty + focused       | `Escape`      | Reject                     | Reject (unchanged)          |
| Permission, chat has content + focused | `Enter`       | Approve                    | New line (chat handles it)  |
| Permission, chat has content + focused | `Space`       | Approve                    | Space (chat handles it)     |
| Permission, chat has content + focused | `Escape`      | Reject                     | Dismiss autocomplete/abort  |
| Permission, chat has content + focused | `Cmd+Enter`   | N/A                        | Approve                     |
| Permission, chat has content + focused | `Cmd+Escape`  | N/A                        | Reject                      |
| Permission, chat NOT focused           | `Enter`       | Approve                    | Approve (unchanged)         |
| Permission, chat NOT focused           | `Escape`      | Reject                     | Reject (unchanged)          |
| KiloClaw chat                          | `Enter`       | Send message               | New line                    |
| KiloClaw chat                          | `Cmd+Enter`   | N/A                        | Send message                |

## VS Code Extension

### Install

```bash
npm install
npm run compile
npx vsce package
# Install the .vsix in VS Code
code --install-extension kilo-code-kb-patch-*.vsix
```

### Usage

The extension auto-detects when Kilo Code is installed but unpatched and prompts you to apply.

Commands available via Command Palette (`Cmd+Shift+P`):

- **Kilo Code KB Patch: Apply Patches** — Apply all patches
- **Kilo Code KB Patch: Restore Originals** — Revert to original behavior
- **Kilo Code KB Patch: Show Status** — Show which patches are applied/original/missing

After applying or restoring, you'll be prompted to reload the VS Code window.

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
| `Cmd+Enter`   | —                          | Send                                    | —                          | **Send**            |
| `Escape`      | Dismiss autocomplete/abort | Same                                    | Dismiss autocomplete/abort | Same                |

### Permission Prompt — Chat Input FOCUSED, Has Content

| Key          | Claude Code                            | Kilo Code (native) | Kilo Code (patched)                        |
| ------------ | -------------------------------------- | ------------------ | ------------------------------------------ |
| `Enter`      | Newline (chat handles it)              | **Approve**        | **Newline** (chat handles it)              |
| `Space`      | Space (chat handles it)                | **Approve**        | **Space** (chat handles it)                |
| `Escape`     | Dismiss autocomplete (chat handles it) | **Reject**         | **Dismiss autocomplete** (chat handles it) |
| `Cmd+Enter`  | Approve                                | —                  | **Approve**                                |
| `Cmd+Escape` | Reject                                 | —                  | **Reject**                                 |

### Permission Prompt — Chat Input FOCUSED, Empty

(Claude Code hides the input in this case, so focus is on permission buttons)

| Key      | Claude Code | Kilo Code (native) | Kilo Code (patched) |
| -------- | ----------- | ------------------ | ------------------- |
| `Enter`  | Approve     | Approve            | **Approve**         |
| `Escape` | Reject      | Reject             | **Reject**          |

### Permission Prompt — Chat Input NOT Focused

(e.g. permission button focused)

| Key                     | Claude Code                  | Kilo Code (native) | Kilo Code (patched) |
| ----------------------- | ---------------------------- | ------------------ | ------------------- |
| `Enter`                 | Approve                      | Approve            | Approve             |
| `Escape`                | Reject                       | Reject             | Reject              |
| Number keys `1`,`2`,`3` | Map to buttons (Claude only) | —                  | —                   |

### Key Architectural Difference

- **Claude Code**: Permission keydown handler is on the container `div` (bubbling phase). Chat input events never reach it since the input is a sibling, not a child. When chat input is empty + permission visible, the input is hidden (`display:none`), so focus shifts to permission buttons and bare Enter/Escape work for approve/reject.

- **Kilo Code (native)**: Permission keydown handler is on `document.addEventListener("keydown", $, true)` — **capture phase**. It intercepts ALL keydown events before any element handler runs. The `L(z,j)` function decides whether to skip, but for the chat textarea branch it always returned `false` (`H?!1`), meaning bare Enter/Escape always reached the permission handler regardless of chat focus.

- **Kilo Code (patched)**: The `L(z,j)` function now checks whether the textarea has content. When the textarea has content, it returns `true` for bare Enter/Space/Escape (the capture-phase handler skips them, chat input handles them). When the textarea is empty, it returns `false` (same as original — the permission handler processes Enter/Escape for approve/reject). This emulates Claude Code's behavior of hiding the input when empty + permission visible.

## Versioning

The extension uses independent semver (e.g. `1.0.0`). The supported Kilo Code version is noted in the header. When Kilo Code updates, verify the patch patterns still work and bump the extension version.

## How it works

The patches do string replacements on the minified JavaScript in Kilo Code's `dist/` directory:

1. **`webview.js` — Chat input Enter handler**: Changes the condition from `!Pe.shiftKey` (bare Enter) to `Pe.metaKey` (Cmd+Enter) for sending messages.

2. **`webview.js` — Permission prompt L() function**: The `L(z,j)` function determines whether the global capture-phase keydown handler should skip a key event. The original returns `false` for the chat textarea branch (`H?!1`), meaning the handler never skips — so bare Enter always approves and Escape always rejects, even when the user is typing. The patch checks the textarea's content: when it has text, bare Enter/Space/Escape are skipped (chat handles them); when it's empty, the permission handler processes them normally (Enter approves, Escape rejects). This emulates Claude Code's behavior where the input is hidden when empty + permission visible.

3. **`webview.js` — Permission $ handler**: Adds Space handling so Space also approves when the textarea is empty, matching Claude Code where the empty input is hidden and Space would activate the focused permission button.

4. **`kiloclaw.js` — KiloClaw chat input**: Same Enter/Cmd+Enter swap for the two KiloClaw chat handlers.

## Manual Revert

If you need to manually restore the original patterns in `dist/webview.js` and `dist/kiloclaw.js`:

| File          | Find                                                                                                                                                      | Replace with                                      |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `webview.js`  | `Pe.key==="Enter"&&Pe.metaKey&&!Pe.isComposing`                                                                                                           | `Pe.key==="Enter"&&!Pe.shiftKey&&!Pe.isComposing` |
| `webview.js`  | `H?(j?.closest("textarea.prompt-input")?.value?.trim()?(z.key==="Enter"&&!z.metaKey\|\|z.key===" "\|\|z.key==="Escape"&&!z.metaKey&&!z.ctrlKey):!1):S(j)` | `H?!1:S(j)`                                       |
| `webview.js`  | `if(M(z)\|\|z.key===" "&&!z.metaKey&&!z.ctrlKey&&j?.closest("textarea.prompt-input")?.value?.trim()===""){N(z,"once");return}`                            | `if(M(z)){N(z,"once");return}`                    |
| `kiloclaw.js` | `Q.key==="Enter"&&Q.metaKey?`                                                                                                                             | `Q.key==="Enter"&&!Q.shiftKey?`                   |
| `kiloclaw.js` | `I.key==="Enter"&&I.metaKey&&`                                                                                                                            | `I.key==="Enter"&&!I.shiftKey&&`                  |

## Troubleshooting

- **Patch has no effect**: Make sure you reloaded the VS Code window after patching.
- **Patterns not found**: The Kilo Code extension may have updated and changed the minified code structure. Check the "Show Status" command output (extension) or `SKIP` messages (script) and update the patch patterns in `src/extension.ts` or `patch.py`.
- **Behavior reverts after update**: Extension updates overwrite `dist/`. Re-apply patches.

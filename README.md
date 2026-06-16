# Kilo Code VS Code Extension Patch

Patches for [Kilo Code](https://github.com/Kilo-Org/kilocode) VS Code extension to match Claude Code's keyboard behavior.

> **Supported versions** (patterns verified against these):
>
> - Kilo Code: **7.3.46** (`kilocode.kilo-code-7.3.46-darwin-arm64`)
> - Claude Code (reference): **2.1.178** (`anthropic.claude-code-2.1.178-darwin-arm64`)
>
> If the extension updates and the patch fails with `SKIP` messages, the minified code patterns may have changed. Update the search strings in `patch.py` accordingly.

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

## Detailed Behavior Comparison

### Chat Input (no permission prompt)

| Key           | Claude Code (default)      | Claude Code (`useCtrlEnterToSend=true`) | Kilo Code (native)         | Kilo Code (patched) |
| ------------- | -------------------------- | --------------------------------------- | -------------------------- | ------------------- |
| `Enter`       | Send                       | Newline                                 | Send                       | **Newline**         |
| `Shift+Enter` | Newline                    | Newline                                 | Newline                    | Newline             |
| `Cmd+Enter`   | --                         | Send                                    | --                         | **Send**            |
| `Escape`      | Dismiss autocomplete/abort | Same                                    | Dismiss autocomplete/abort | Same                |

### Permission Prompt -- Chat Input FOCUSED, Has Content

| Key          | Claude Code                            | Kilo Code (native) | Kilo Code (patched)                        |
| ------------ | -------------------------------------- | ------------------ | ------------------------------------------ |
| `Enter`      | Newline (chat handles it)              | **Approve**        | **Newline** (chat handles it)              |
| `Space`      | Space (chat handles it)                | **Approve**        | **Space** (chat handles it)                |
| `Escape`     | Dismiss autocomplete (chat handles it) | **Reject**         | **Dismiss autocomplete** (chat handles it) |
| `Cmd+Enter`  | Approve                                | --                 | **Approve**                                |
| `Cmd+Escape` | Reject                                 | --                 | **Reject**                                 |

### Permission Prompt -- Chat Input FOCUSED, Empty

(Claude Code hides the input in this case, so focus is on permission buttons)

| Key      | Claude Code | Kilo Code (native) | Kilo Code (patched) |
| -------- | ----------- | ------------------ | ------------------- |
| `Enter`  | Approve     | Approve            | **Approve**         |
| `Escape` | Reject      | Reject             | **Reject**          |

### Permission Prompt -- Chat Input NOT Focused

(e.g. permission button focused)

| Key                     | Claude Code                  | Kilo Code (native) | Kilo Code (patched) |
| ----------------------- | ---------------------------- | ------------------ | ------------------- |
| `Enter`                 | Approve                      | Approve            | Approve             |
| `Escape`                | Reject                       | Reject             | Reject              |
| Number keys `1`,`2`,`3` | Map to buttons (Claude only) | --                 | --                  |

### Key Architectural Difference

- **Claude Code**: Permission keydown handler is on the container `div` (bubbling phase). Chat input events never reach it since the input is a sibling, not a child. When chat input is empty + permission visible, the input is hidden (`display:none`), so focus shifts to permission buttons and bare Enter/Escape work for approve/reject.

- **Kilo Code (native)**: Permission keydown handler is on `document.addEventListener("keydown", $, true)` -- **capture phase**. It intercepts ALL keydown events before any element handler runs. The `L(z,j)` function decides whether to skip, but for the chat textarea branch it always returned `false` (`H?!1`), meaning bare Enter/Escape always reached the permission handler regardless of chat focus.

- **Kilo Code (patched)**: The `L(z,j)` function now checks whether the textarea has content. When the textarea has content, it returns `true` for bare Enter/Space/Escape (the capture-phase handler skips them, chat input handles them). When the textarea is empty, it returns `false` (same as original -- the permission handler processes Enter/Escape for approve/reject). This emulates Claude Code's behavior of hiding the input when empty + permission visible.

## Usage

```bash
# Apply patches (default)
python3 patch.py

# Revert all patches to original
python3 patch.py restore
```

Then reload the VS Code window: `Cmd+Shift+P` → `Developer: Reload Window`

Re-run `patch.py` after every Kilo Code extension update (the script auto-finds the latest version).

## Reverting

```bash
python3 patch.py restore
```

Or manually restore the original patterns in `dist/webview.js` and `dist/kiloclaw.js`:

| File          | Find                                                                                                                                                      | Replace with                                      |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `webview.js`  | `Pe.key==="Enter"&&Pe.metaKey&&!Pe.isComposing`                                                                                                           | `Pe.key==="Enter"&&!Pe.shiftKey&&!Pe.isComposing` |
| `webview.js`  | `H?(j?.closest("textarea.prompt-input")?.value?.trim()?(z.key==="Enter"&&!z.metaKey\|\|z.key===" "\|\|z.key==="Escape"&&!z.metaKey&&!z.ctrlKey):!1):S(j)` | `H?!1:S(j)`                                       |
| `webview.js`  | `if(M(z)\|\|z.key===" "&&!z.metaKey&&!z.ctrlKey&&j?.closest("textarea.prompt-input")?.value?.trim()===""){N(z,"once");return}`                            | `if(M(z)){N(z,"once");return}`                    |
| `kiloclaw.js` | `Q.key==="Enter"&&Q.metaKey?`                                                                                                                             | `Q.key==="Enter"&&!Q.shiftKey?`                   |
| `kiloclaw.js` | `I.key==="Enter"&&I.metaKey&&`                                                                                                                            | `I.key==="Enter"&&!I.shiftKey&&`                  |

## How it works

The script does string replacements on the minified JavaScript in the extension's `dist/` directory:

1. **`webview.js` -- Chat input Enter handler**: Changes the condition from `!Pe.shiftKey` (bare Enter) to `Pe.metaKey` (Cmd+Enter) for sending messages.

2. **`webview.js` -- Permission prompt L() function**: The `L(z,j)` function determines whether the global capture-phase keydown handler should skip a key event. The original returns `false` for the chat textarea branch (`H?!1`), meaning the handler never skips -- so bare Enter always approves and Escape always rejects, even when the user is typing. The patch checks the textarea's content: when it has text, bare Enter/Space/Escape are skipped (chat handles them); when it's empty, the permission handler processes them normally (Enter approves, Escape rejects). This emulates Claude Code's behavior where the input is hidden when empty + permission visible.

3. **`kiloclaw.js` -- KiloClaw chat input**: Same Enter/Cmd+Enter swap for the two KiloClaw chat handlers.

## Troubleshooting

- **Patch has no effect**: Make sure you reloaded the VS Code window after patching.
- **Patterns not found**: The extension may have updated and changed the minified code structure. Check the `SKIP` messages in the script output and update the search patterns accordingly.
- **Behavior reverts after update**: Extension updates overwrite `dist/`. Re-run `patch.py`.

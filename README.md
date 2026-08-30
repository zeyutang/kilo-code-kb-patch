# Kilo Code Keyboard Patch

[![VS Marketplace Version](https://badgen.net/vs-marketplace/v/zeyutang.kilo-code-kb-patch?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=zeyutang.kilo-code-kb-patch)
[![VS Marketplace Downloads](https://badgen.net/vs-marketplace/d/zeyutang.kilo-code-kb-patch)](https://marketplace.visualstudio.com/items?itemName=zeyutang.kilo-code-kb-patch)
[![Open VSX Version](https://img.shields.io/open-vsx/v/zeyutang/kilo-code-kb-patch?label=Open%20VSX)](https://open-vsx.org/extension/zeyutang/kilo-code-kb-patch)
[![Open VSX Downloads](https://img.shields.io/open-vsx/dt/zeyutang/kilo-code-kb-patch)](https://open-vsx.org/extension/zeyutang/kilo-code-kb-patch)

Patches [Kilo Code](https://github.com/Kilo-Org/kilocode)'s keyboard behavior: `Enter` starts a new line, `Cmd/Ctrl+Enter` sends, `Cmd/Ctrl+Up` and `Cmd/Ctrl+Down` recall earlier messages, and permission prompts stop hijacking your keystrokes while you are typing.

## Supported versions (latest three)

| Kilo Code | KB Patch |
| --------- | -------- |
| 7.5.6+    | 1.19.x   |
| 7.5.4-5   | 1.18.x   |
| 7.5.0     | 1.17.x   |
| (prev.)   | (prev.)  |

Each patch release keeps the earlier versions' patterns, so a newer patch still works on an older Kilo Code.

## What it does

### Keyboard patches

| Key                    | Before Patched (native Kilo Code)    | After Patched                                      |
| ---------------------- | ------------------------------------ | -------------------------------------------------- |
| `Enter`                | Send / Approve                       | **New line** (approves when the chat box is empty) |
| `Cmd/Ctrl+Enter`       | Send / Save                          | **Send / Approve / Save**                          |
| `Shift+Enter`          | New line                             | New line (unchanged)                               |
| `Escape`               | Reject / Abort                       | Reject / Abort **only when the chat box is empty** |
| `Shift+Escape`         | Reject / Abort                       | **Reject / Abort** (always)                        |
| `Up` / `Down`          | Previous / next message at the edges | **Caret movement only**                            |
| `Cmd/Ctrl+Up` / `Down` | Caret to start / end                 | **Previous / next message**                        |

Applies to the chat input, the permission prompt, and the KiloClaw edit/chat panels.

Native Kilo Code recalls a message when a bare `Up` or `Down` reaches the start or end of what you typed, which is why holding the key can jump away mid-edit.
Patched, recall moves to `Cmd/Ctrl+Up` / `Down` and works from anywhere in the chat box, and stepping forward past the newest message brings your unsent draft back.

### Bonus

Two optional extras, off by default.
Enable either one from the Settings UI (search "Kilo Code KB Patch") or in your `settings.json`, then reload the window (`Cmd+Shift+P` → `Developer: Reload Window`).
To turn one off, set it to `false` (or run **Restore Originals**, which switches both off) and reload.

- **Attach-file button.**
  Adds a `+` button to the prompt toolbar that opens Kilo Code's file picker directly, instead of typing `@` and choosing "Browse files...".

  ```json
  "kiloCodeKbPatch.addAttachFileButton": true
  ```

- **Relocate the "Open in Tab" icon.**
  Retitles Kilo Code's editor-title "Open in Tab" action to "Kilo Code: Open" so its icon sorts next to other AI "Open" icons in the editor title bar.

  ```json
  "kiloCodeKbPatch.renameOpenInTab": true
  ```

## Install

The extension locates Kilo Code by asking the running editor where it is installed, so native VS Code and its forks need no additional configuration: VSCodium, Cursor, Windsurf, remote servers, and custom `--extensions-dir` setups.

### VS Code

Install from the **VS Code Marketplace**: [Kilo Code KB Patch](https://marketplace.visualstudio.com/items?itemName=zeyutang.kilo-code-kb-patch)

### VSCodium, Cursor, Windsurf, and other forks

Install from the **Open VSX Registry**: [Kilo Code KB Patch](https://open-vsx.org/extension/zeyutang/kilo-code-kb-patch)

### Get Kilo Code patched

The extension detects an unpatched Kilo Code and offers to apply. Three commands are available from the Command Palette (`Cmd+Shift+P` → "Kilo Code KB Patch"):

- **Apply Patches**
- **Restore Originals** (also switches the bonus settings off)
- **Show Status**

Reload the window after applying KB Patch: `Cmd+Shift+P` → `Developer: Reload Window`.

## How keystrokes are routed

Kilo Code asks for your input in three ways. The patch rewires only one of them (permission prompts) and decides purely by **whether the chat box contains text**; spaces and newlines do not count.

KB Patch never moves the keyboard focus. Because Kilo Code moves focus on its own, a choice can take over the keyboard even when you have typed something. When that happens your keys act on the highlighted choice (this is intended, with minimal interference with the native Kilo Code experience).

### Permission prompts

Approve or reject a tool or command. The only surface the patch rewires.

- Kilo Code does **not** shift focus here: it leaves focus in the chat box and intercepts keys with a document-level listener, so the patch can read the chat box content and route accordingly.

The chat box content decides where each key goes:

| Key              | Chat box empty | Chat box has text         |
| ---------------- | -------------- | ------------------------- |
| `Enter`          | Approve        | New line                  |
| `Space`          | Approve        | Space                     |
| `Cmd/Ctrl+Enter` | Approve        | Approve                   |
| `Escape`         | Reject         | Dismiss autocomplete only |
| `Shift+Escape`   | Reject         | Reject                    |

Reject and abort use `Shift+Escape` (not `Cmd+Escape`, which is Claude Code's quick-launch shortcut).

### Follow-up questions

Pick a suggested answer or type your own. The patch leaves these alone.

- Kilo Code **auto-focuses the first option** when the prompt appears, so keys act on the highlighted choice regardless of what is in the chat box.
- Arrow keys move between choices, `Enter` selects, and `Cmd/Ctrl+Enter` send the choice.

### Menus and dialogs

Model and mode pickers, confirmations, `@`-mentions. The patch leaves these alone.

- Kilo Code moves focus into them when they open and handles their keys: arrow keys or type-ahead to move, `Enter` to choose, `Escape` to close pop-up menu **without** invoking the permission prompt abort.

## Troubleshooting

- **No effect:** reload the VS Code window after applying.
- **Stopped working after a Kilo Code update:** updates overwrite the patched files and can rename Kilo Code's internal code. Re-apply by `Cmd+Shift+P` → `Kilo Code KB Patch: Apply Patches`.
- **"Could not find a kilocode.kilo-code-\* install":** Kilo Code is not installed in this editor (the message lists every folder searched).
  Install Kilo Code first, then re-run **Apply Patches**.

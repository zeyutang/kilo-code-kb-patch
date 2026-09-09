# Kilo Code Keyboard Patch

[![VS Marketplace Version](https://badgen.net/vs-marketplace/v/zeyutang.kilo-code-kb-patch?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=zeyutang.kilo-code-kb-patch)
[![VS Marketplace Downloads](https://badgen.net/vs-marketplace/d/zeyutang.kilo-code-kb-patch)](https://marketplace.visualstudio.com/items?itemName=zeyutang.kilo-code-kb-patch)
[![Open VSX Version](https://img.shields.io/open-vsx/v/zeyutang/kilo-code-kb-patch?label=Open%20VSX)](https://open-vsx.org/extension/zeyutang/kilo-code-kb-patch)
[![Open VSX Downloads](https://img.shields.io/open-vsx/dt/zeyutang/kilo-code-kb-patch)](https://open-vsx.org/extension/zeyutang/kilo-code-kb-patch)

Patches [Kilo Code](https://github.com/Kilo-Org/kilocode)'s keyboard behavior: `Enter` starts a new line, `Cmd/Ctrl+Enter` sends, `Cmd/Ctrl+Up` and `Cmd/Ctrl+Down` recall earlier messages, and permission prompts stop hijacking your keystrokes while you are typing.
It also keeps the chat history scrolled to the bottom while you type, stops the mouse cursor macOS hides while you type from highlighting menus and buttons, and makes `Escape` dismiss the `@` mention menu for good.

## Supported versions (latest three)

| Kilo Code | KB Patch |
| --------- | -------- |
| 7.5.16+   | 1.23.x   |
| 7.5.11-15 | 1.21.x   |
| 7.5.8-9   | 1.20.x   |
| (prev.)   | (prev.)  |

Each patch release keeps the earlier versions' patterns, so a newer patch still works on an older Kilo Code.

## What it does

### Keyboard patches

| Key                      | Before Patched (native Kilo Code)        | After Patched                                             |
| ------------------------ | ---------------------------------------- | --------------------------------------------------------- |
| `Enter`                  | Send / Approve                           | **New line** (approves when the chat box is empty)        |
| `Cmd/Ctrl+Enter`         | Send / Save                              | **Send / Approve / Save**                                 |
| `Shift+Enter`            | New line                                 | New line (unchanged)                                      |
| `Escape`                 | Reject / Abort                           | Reject / Abort **only when the chat box is empty**        |
| `Escape` (`@` menu open) | Closes the menu until the next keystroke | Closes the menu **and keeps it closed** while you type on |
| `Shift+Escape`           | Reject / Abort                           | **Reject / Abort** (always)                               |
| `Up` / `Down`            | Previous / next message at the edges     | **Caret movement only**                                   |
| `Cmd/Ctrl+Up` / `Down`   | Caret to start / end                     | **Previous / next message**                               |

Applies to the chat input, the permission prompt, and the KiloClaw edit/chat panels.

Native Kilo Code recalls a message when a bare `Up` or `Down` reaches the start or end of what you typed, which is why holding the key can jump away mid-edit.
Patched, recall moves to `Cmd/Ctrl+Up` / `Down` and works from anywhere in the chat box, and stepping forward past the newest message brings your unsent draft back.

Since Kilo Code 7.5.11 an `@` mention query may contain spaces, so ordinary prose typed after a mention can bring the menu back on every keystroke, `Escape` only closes it until the next key, and `Enter` then replaces your text with the highlighted file ([Kilo-Org/kilocode#13961](https://github.com/Kilo-Org/kilocode/issues/13961)).
Patched, `Escape` dismisses the query you were looking at: the menu stays closed while you type on, and comes back when you edit back into a shorter query or retype the `@`.
Earlier Kilo Code releases end a query at the first space and need no such patch, which the status view reports as "not needed".

### Scrolling

Native Kilo Code lets the chat history jump up a couple of lines while you type or delete in the chat box, then snap back on a later keystroke.
Patched, the history stays scrolled to the bottom while you type.

### Hover

macOS hides the mouse cursor while you type, but Kilo Code's webview still treats its last position as pointed at.
When a layout change moves something under that spot, it reacts as if you had moved the mouse there: the `@` menu highlights that row instead of the top pick (and `Enter` then picks it), and a button such as **New Worktree** shows its tooltip once a growing chat box pushes it there.
Patched, menus and tooltips ignore the hidden cursor until you move the mouse.

### Bonus

Optional extras, all off by default.
Enable them from the Settings UI (search "Kilo Code KB Patch") or in your `settings.json`, then reload the window (`Cmd+Shift+P` → `Developer: Reload Window`).
To turn one off, put it back to its default (or run **Restore Originals**, which switches every extra off) and reload.

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

- **Math rendering.**
  Renders `$...$` inline math and `\[...\]` display math in chat.
  Kilo Code already renders `$$...$$` and `\(...\)`.
  The second setting sizes rendered math in `em` relative to the text around it, where `1.21` is KaTeX's own size.

  ```json
  "kiloCodeKbPatch.chatMathRendering": true,
  "kiloCodeKbPatch.chatMathFontSizeEm": 1.0
  ```

- **Size and font of the agent's replies.**
  Scales the agent's rendered response text in chat history, and picks a different font for it.
  The size is a multiplier on Kilo Code's own **Display** font-size setting, so that setting keeps working as before.
  Anything in a monospace font keeps Kilo Code's own size and font: code blocks, inline `code`, and file paths.
  Reasoning blocks, tool output, and your own messages are left alone entirely.

  ```json
  "kiloCodeKbPatch.chatHistoryFontSizeEm": 1.25,
  "kiloCodeKbPatch.chatHistoryFontFamily": "Times"
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

Model and mode pickers, confirmations, `@`-mentions. The patch leaves these alone, except that `Escape` in the `@`-mention menu now dismisses the query for good (see [Keyboard patches](#keyboard-patches)).

- Kilo Code moves focus into them when they open and handles their keys: arrow keys or type-ahead to move, `Enter` to choose, `Escape` to close pop-up menu **without** invoking the permission prompt abort.

## Troubleshooting

- **No effect:** reload the VS Code window after applying.
- **Stopped working after a Kilo Code update:** updates overwrite the patched files and can rename Kilo Code's internal code. Re-apply by `Cmd+Shift+P` → `Kilo Code KB Patch: Apply Patches`.
- **"Could not find a kilocode.kilo-code-\* install":** Kilo Code is not installed in this editor (the message lists every folder searched).
  Install Kilo Code first, then re-run **Apply Patches**.

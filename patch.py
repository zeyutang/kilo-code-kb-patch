#!/usr/bin/env python3
"""
Patch Kilo Code VS Code extension keyboard behavior to match Claude Code.

This is the standalone script. For the VS Code extension version with
auto-detection, commands, and status checking, see:
https://github.com/zeyutang/kilo-code-kb-patch

Claude Code behavior (reference):
  - useCtrlEnterToSend=true: Enter=newline, Cmd+Enter=send
  - When chat input is empty + permission visible: chat input is hidden (display:none),
    focus shifts to permission buttons → bare Enter approves, Escape rejects
  - When chat input has content + permission visible: chat input stays visible,
    bare Enter→newline, bare Escape→dismiss popups, NOT approve/reject
  - Permission handler is on container div (bubbling), so chat input events
    never reach it (siblings, not parent-child)

This patch applies to Kilo Code:
  1. Chat input: Enter=newline, Cmd+Enter=send (always, like useCtrlEnterToSend=true)
  2. Permission prompt behavior depends on chat textarea content:
     - Textarea EMPTY + focused: bare Enter approves, Escape rejects
       (matches Claude Code where empty input is hidden + focus on permission)
     - Textarea HAS CONTENT + focused: bare Enter/Space/Escape go to chat
       (newline/typing/dismiss), NOT to permission handler
       Cmd+Enter CAN approve, Cmd+Escape CAN reject
     - Textarea NOT focused: bare Enter approves, Escape rejects (unchanged)
  3. KiloClaw chat: same Enter/Cmd+Enter swap

Key difference: Claude Code hides the input when empty+permission visible.
Kilo Code doesn't, so we check textarea content to emulate the same behavior.

Re-run after extension updates (auto-finds latest version).
"""

import glob
import os
import sys

EXT_DIR = os.path.expanduser("~/.vscode/extensions")


def find_latest_ext():
    dirs = sorted(glob.glob(os.path.join(EXT_DIR, "kilocode.kilo-code-*")))
    if not dirs:
        print("ERROR: No kilocode.kilo-code-* extension found in ~/.vscode/extensions/")
        sys.exit(1)
    return dirs[-1]


PATCHES = {
    "webview.js": [
        (
            "Fm(je)&&!je.shiftKey&&(je.preventDefault(),Ce())",
            "Fm(je)&&je.metaKey&&(je.preventDefault(),Ce())",
            "Chat input: Enter→newline, Cmd+Enter→send",
        ),
        (
            'if(je.key==="Escape"&&ge()){je.preventDefault(),je.stopPropagation(),t.abort();return}',
            'if(je.key==="Escape"&&ge()&&(je.shiftKey||!je.target?.value)){je.preventDefault(),je.stopPropagation(),t.abort();return}',
            "Chat Escape: bare Escape aborts when textarea empty; "
            "Shift+Escape always aborts",
        ),
        (
            "G?!1:S(j)",
            'z.target?.value?(z.key==="Enter"&&!z.metaKey||z.key===" "||z.key==="Escape"&&!z.shiftKey&&!z.ctrlKey):!1',
            "Permission L(): when textarea has content, skip bare Enter/Space/Escape; "
            "works regardless of focus",
        ),
        (
            'P=z=>{if(z.key==="Escape"){N(z,"reject");return}}',
            'P=z=>{if(z.key==="Escape"&&(z.shiftKey||!z.target?.value)){N(z,"reject");return}}',
            "Permission P: bare Escape rejects only when textarea empty; "
            "Shift+Escape always rejects",
        ),
        (
            'if(M(z)){N(z,"once");return}}};',
            'if(M(z)||z.key===" "&&!z.metaKey&&!z.ctrlKey&&!z.target?.value||z.key==="Enter"&&z.metaKey){N(z,"once");return}if(z.key==="Escape"&&z.shiftKey){N(z,"reject");return}}};',
            "Permission O: Cmd+Enter approves always; Space approves when empty; "
            "Shift+Escape rejects always",
        ),
        (
            'ee.key!=="Escape"||!t.submitting()&&t.status()==="idle"||ee.defaultPrevented||(ee.preventDefault(),t.abort())',
            'ee.key!=="Escape"||!t.submitting()&&t.status()==="idle"||ee.defaultPrevented||!ee.shiftKey&&ee.target?.value||(ee.preventDefault(),t.abort())',
            "Document Escape: bare Escape does not abort; Shift+Escape aborts",
        ),
    ],
    "kiloclaw.js": [
        (
            'LA(Q)&&!Q.shiftKey?(Q.preventDefault(),y()):Q.key==="Escape"&&w()',
            'LA(Q)&&Q.metaKey?(Q.preventDefault(),y()):Q.key==="Escape"&&w()',
            "KiloClaw edit: Enter→newline, Cmd+Enter→save",
        ),
        (
            "LA(D)&&!D.shiftKey&&(D.preventDefault(),v())",
            "LA(D)&&D.metaKey&&(D.preventDefault(),v())",
            "KiloClaw chat: Enter→newline, Cmd+Enter→send",
        ),
    ],
}


def apply_patches(path, patches):
    with open(path, "r") as f:
        content = f.read()

    original = content
    changes = []

    for old, new, desc in patches:
        if old in content:
            content = content.replace(old, new)
            changes.append(desc)
        else:
            changes.append(f"SKIP: {desc} (pattern not found)")

    if content != original:
        with open(path, "w") as f:
            f.write(content)
        print(f"  Patched {os.path.basename(path)}")
    else:
        print(f"  WARNING: No changes made to {os.path.basename(path)}")
    for c in changes:
        print(f"    - {c}")


def restore_patches(path, patches):
    with open(path, "r") as f:
        content = f.read()

    original = content
    changes = []

    for old, new, desc in patches:
        if new in content:
            content = content.replace(new, old)
            changes.append(f"Reverted: {desc}")
        else:
            changes.append(f"SKIP: {desc} (patched pattern not found)")

    if content != original:
        with open(path, "w") as f:
            f.write(content)
        print(f"  Restored {os.path.basename(path)}")
    else:
        print(f"  No patches to restore in {os.path.basename(path)}")
    for c in changes:
        print(f"    - {c}")


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "patch"

    if mode not in ("patch", "restore"):
        print(f"Usage: {sys.argv[0]} [patch|restore]")
        print("  patch   - Apply patches (default)")
        print("  restore - Revert all patches to original")
        sys.exit(1)

    ext_path = find_latest_ext()
    version = os.path.basename(ext_path).split("-")[-1]
    action = "Patching" if mode == "patch" else "Restoring"
    print(f"{action} extension: {os.path.basename(ext_path)} (v{version})")

    dist_dir = os.path.join(ext_path, "dist")
    handler = apply_patches if mode == "patch" else restore_patches

    for name, patches in PATCHES.items():
        fpath = os.path.join(dist_dir, name)
        if os.path.exists(fpath):
            handler(fpath, patches)
        else:
            print(f"  SKIP: {name} not found in dist/")

    print()
    print("Done! Reload the VS Code window for changes to take effect:")
    print("  Cmd+Shift+P → 'Developer: Reload Window'")


if __name__ == "__main__":
    main()

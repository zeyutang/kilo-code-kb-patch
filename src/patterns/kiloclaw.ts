// The reviewed core patterns for dist/kiloclaw.js, newest first.

import type { FilePatches } from "../core/features";

export const KILOCLAW_PATCHES: FilePatches = {
  // Kilo ships this file up to 7.7.2 and not after; see RETIRED_FILES for
  // what its absence means and what it would otherwise cost.
  filename: "kiloclaw.js",
  patches: [
    // --- v7.6.0+ patterns. First kiloclaw re-minify since 7.5.4:
    //     Enter-check helper kf→Cf and edit-box event T→I, so both scopes
    //     now name their event I; save y, cancel k and send v are
    //     unchanged. Re-derived from the 7.6.0 vsix. ---
    {
      feature: "kiloclaw-edit",
      original:
        'Cf(I)&&!I.shiftKey?(I.preventDefault(),y()):I.key==="Escape"&&k()',
      patched:
        'Cf(I)&&(I.metaKey||I.ctrlKey)?(I.preventDefault(),y()):I.key==="Escape"&&k()',
      description:
        "KiloClaw edit: Enter→newline, Cmd/Ctrl+Enter→save (v7.6.0+)",
    },
    {
      feature: "kiloclaw-chat",
      original: "Cf(I)&&!I.shiftKey&&(I.preventDefault(),v())",
      patched: "Cf(I)&&(I.metaKey||I.ctrlKey)&&(I.preventDefault(),v())",
      description:
        "KiloClaw chat: Enter→newline, Cmd/Ctrl+Enter→send (v7.6.0+)",
    },
    // --- v7.5.4+ patterns. 7.5.4 re-minified kiloclaw.js for the first
    //     time since 7.4.21, and more broadly than that release's
    //     single-symbol churn: Enter-check helper RA→kf, edit-box event Q→T
    //     and cancel call w→k, chat event D→I (save y and send v
    //     unchanged). Re-derived from the 7.5.4 vsix. ---
    {
      feature: "kiloclaw-edit",
      original:
        'kf(T)&&!T.shiftKey?(T.preventDefault(),y()):T.key==="Escape"&&k()',
      patched:
        'kf(T)&&(T.metaKey||T.ctrlKey)?(T.preventDefault(),y()):T.key==="Escape"&&k()',
      description:
        "KiloClaw edit: Enter→newline, Cmd/Ctrl+Enter→save (v7.5.4+)",
    },
    {
      feature: "kiloclaw-chat",
      original: "kf(I)&&!I.shiftKey&&(I.preventDefault(),v())",
      patched: "kf(I)&&(I.metaKey||I.ctrlKey)&&(I.preventDefault(),v())",
      description:
        "KiloClaw chat: Enter→newline, Cmd/Ctrl+Enter→send (v7.5.4+)",
    },
    // --- v7.4.21+ patterns. 7.4.21 re-minified only the Enter-check helper
    //     $A→RA; the event variables (Q, D) and the save/send/cancel calls
    //     (y/w, v) are unchanged. First kiloclaw re-minify since 7.4.17.
    //     Re-derived from the 7.4.21 vsix. ---
    {
      feature: "kiloclaw-edit",
      original:
        'RA(Q)&&!Q.shiftKey?(Q.preventDefault(),y()):Q.key==="Escape"&&w()',
      patched:
        'RA(Q)&&(Q.metaKey||Q.ctrlKey)?(Q.preventDefault(),y()):Q.key==="Escape"&&w()',
      description:
        "KiloClaw edit: Enter→newline, Cmd/Ctrl+Enter→save (v7.4.21+)",
    },
    {
      feature: "kiloclaw-chat",
      original: "RA(D)&&!D.shiftKey&&(D.preventDefault(),v())",
      patched: "RA(D)&&(D.metaKey||D.ctrlKey)&&(D.preventDefault(),v())",
      description:
        "KiloClaw chat: Enter→newline, Cmd/Ctrl+Enter→send (v7.4.21+)",
    },
    // --- v7.4.17+ patterns. 7.4.17 re-minified only the Enter-check helper
    //     NA→$A; the event variables (Q, D) and the save/send/abort calls (y/w,
    //     v) are unchanged from v7.4.8+. Re-derived from the 7.4.17 bundle. ---
    {
      feature: "kiloclaw-edit",
      original:
        '$A(Q)&&!Q.shiftKey?(Q.preventDefault(),y()):Q.key==="Escape"&&w()',
      previous:
        '$A(Q)&&Q.metaKey?(Q.preventDefault(),y()):Q.key==="Escape"&&w()',
      patched:
        '$A(Q)&&(Q.metaKey||Q.ctrlKey)?(Q.preventDefault(),y()):Q.key==="Escape"&&w()',
      description:
        "KiloClaw edit: Enter→newline, Cmd/Ctrl+Enter→save (v7.4.17+)",
    },
    {
      feature: "kiloclaw-chat",
      original: "$A(D)&&!D.shiftKey&&(D.preventDefault(),v())",
      previous: "$A(D)&&D.metaKey&&(D.preventDefault(),v())",
      patched: "$A(D)&&(D.metaKey||D.ctrlKey)&&(D.preventDefault(),v())",
      description:
        "KiloClaw chat: Enter→newline, Cmd/Ctrl+Enter→send (v7.4.17+)",
    },
    // --- v7.4.8+ patterns. 7.4.8 renamed only the Enter-check helper LA→NA; the event
    //     variables and the save/send/abort calls are unchanged. ---
    {
      feature: "kiloclaw-edit",
      original:
        'NA(Q)&&!Q.shiftKey?(Q.preventDefault(),y()):Q.key==="Escape"&&w()',
      previous:
        'NA(Q)&&Q.metaKey?(Q.preventDefault(),y()):Q.key==="Escape"&&w()',
      patched:
        'NA(Q)&&(Q.metaKey||Q.ctrlKey)?(Q.preventDefault(),y()):Q.key==="Escape"&&w()',
      description:
        "KiloClaw edit: Enter→newline, Cmd/Ctrl+Enter→save (v7.4.8+)",
    },
    {
      feature: "kiloclaw-chat",
      original: "NA(D)&&!D.shiftKey&&(D.preventDefault(),v())",
      previous: "NA(D)&&D.metaKey&&(D.preventDefault(),v())",
      patched: "NA(D)&&(D.metaKey||D.ctrlKey)&&(D.preventDefault(),v())",
      description:
        "KiloClaw chat: Enter→newline, Cmd/Ctrl+Enter→send (v7.4.8+)",
    },
    // --- pre-7.4.8 patterns (Enter-check helper LA) ---
    {
      feature: "kiloclaw-edit",
      original:
        'LA(Q)&&!Q.shiftKey?(Q.preventDefault(),y()):Q.key==="Escape"&&w()',
      previous:
        'LA(Q)&&Q.metaKey?(Q.preventDefault(),y()):Q.key==="Escape"&&w()',
      patched:
        'LA(Q)&&(Q.metaKey||Q.ctrlKey)?(Q.preventDefault(),y()):Q.key==="Escape"&&w()',
      description: "KiloClaw edit: Enter→newline, Cmd/Ctrl+Enter→save",
    },
    {
      feature: "kiloclaw-chat",
      original: "LA(D)&&!D.shiftKey&&(D.preventDefault(),v())",
      previous: "LA(D)&&D.metaKey&&(D.preventDefault(),v())",
      patched: "LA(D)&&(D.metaKey||D.ctrlKey)&&(D.preventDefault(),v())",
      description: "KiloClaw chat: Enter→newline, Cmd/Ctrl+Enter→send",
    },
  ],
};

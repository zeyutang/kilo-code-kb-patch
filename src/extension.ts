import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const KILO_EXT_ID = "kilocode.kilo-code";

// Last-resort extensions roots by editor fork, relative to the home directory.
// Used only when the running editor cannot be asked (Kilo Code disabled) and
// this extension is not installed next to it. Every fork keeps its own folder,
// which is why no single path can be hardcoded (VSCodium users hit exactly
// that: Kilo-Org/kilocode#8641).
const KNOWN_EXT_DIRS = [
  ".vscode/extensions", // VS Code
  ".vscode-insiders/extensions", // VS Code Insiders
  ".vscode-oss/extensions", // VSCodium and other OSS builds
  ".cursor/extensions", // Cursor
  ".windsurf/extensions", // Windsurf
  ".vscode-server/extensions", // VS Code remote server
  ".vscodium-server/extensions", // VSCodium remote server
];

interface PatchDef {
  // Which logical behavior this pattern implements. Declared rather than
  // inferred from `description`: the status view groups every version's variant
  // of a behavior under one row, and a variant it cannot place is dropped from
  // the view and from the verdict, which would report a feature as fine (or as
  // absent) when it is neither. Typing it against FEATURE_ORDER turns that into
  // a compile error instead.
  feature: FeatureKey;
  original: string;
  patched: string;
  previous?: string;
  // Free-form, for humans and for the apply/restore logs only. Naming the
  // release's minified symbol here is useful documentation, not a classifier.
  description: string;
}

interface FilePatches {
  filename: string;
  patches: PatchDef[];
}

const PATCHES: FilePatches[] = [
  {
    filename: "webview.js",
    patches: [
      // --- v7.5.0+ patterns. 7.5.0 re-minified the chat keydown scope
      //     (Enter-check bg→yg, send tn→an, event Te unchanged), the chat
      //     Escape guard (Ze→We), the document-level Escape event (J→Y, store
      //     t unchanged), and part of the permission scope. That scope kept
      //     every role name except two, which traded letters outright: the
      //     skip-predicate is now O and the interactive-element helper is now
      //     z, exactly reversing 7.4.23's assignment, and the element argument
      //     went Y→J. So the 7.4.23 perm-keys anchor ends ...te?!1:O(Y) while
      //     7.5.0's ends ...te?!1:z(J), naming the same two symbols for the
      //     other role. Nothing else there moved (event U, shortcuts branch W,
      //     in-textarea guard te, dialog branch X, dispatch q, element-level
      //     reject handler H, document handler V, bare-Enter check j), which is
      //     why perm-escape and perm-approve below still match the v7.4.23+
      //     block rather than needing entries here. The exchange also spans
      //     scopes: 7.4.23's document-Escape event J is 7.5.0's permission
      //     element argument, and 7.4.23's permission element argument Y is
      //     7.5.0's document-Escape event. kiloclaw.js is untouched, so it
      //     still matches the v7.4.21+ block. Re-derived from the 7.5.0 vsix. ---
      {
        feature: "chat-input",
        original: "yg(Te)&&!Te.shiftKey&&(Te.preventDefault(),an())",
        patched: "yg(Te)&&(Te.metaKey||Te.ctrlKey)&&(Te.preventDefault(),an())",
        description: "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.5.0+)",
      },
      {
        feature: "chat-escape",
        original:
          'if(Te.key==="Escape"&&We()){Te.preventDefault(),Te.stopPropagation(),t.abort();return}',
        patched:
          'if(Te.key==="Escape"&&We()&&(Te.shiftKey||!Te.target?.value?.trim())){Te.preventDefault(),Te.stopPropagation(),t.abort();return}',
        description:
          "Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v7.5.0+)",
      },
      {
        feature: "perm-keys",
        original: 'U.key==="Enter":X?!0:te?!1:z(J)',
        patched:
          'U.key==="Enter":X?!0:te?U.target?.value?.trim()?(U.key==="Enter"&&!U.metaKey&&!U.ctrlKey||U.key===" "||U.key==="Escape"&&!U.shiftKey&&!U.ctrlKey):!1:z(J)',
        description:
          "Permission skip-predicate: when textarea has non-whitespace content, skip bare Enter/Space/Escape; works regardless of focus (v7.5.0+)",
      },
      {
        feature: "doc-escape",
        original:
          'Y.key!=="Escape"||!t.submitting()&&t.status()==="idle"||Y.defaultPrevented||(Y.preventDefault(),t.abort())',
        patched:
          'Y.key!=="Escape"||!t.submitting()&&t.status()==="idle"||Y.defaultPrevented||!Y.shiftKey&&Y.target?.value?.trim()||(Y.preventDefault(),t.abort())',
        description:
          "Document Escape: bare Escape does not abort when textarea has non-whitespace content; Shift+Escape aborts (v7.5.0+)",
      },
      // --- v7.4.23+ patterns. 7.4.23 re-minified every webview keyboard
      //     scope at once, including the document-level Escape that had held
      //     since 7.4.20 (event me→J, store t unchanged). Chat keydown:
      //     Enter-check Ag→bg, event De→Te, send zt→tn; chat Escape guard
      //     Ve→Ze. The permission scope rotated five names without retiring
      //     any of them: 7.4.22's event H now names the element-level reject
      //     handler, its dispatch O now names the interactive-element helper,
      //     its reject handler q now names the dispatch, its dialog-branch
      //     predicate te now names the in-textarea guard, and its bare-Enter
      //     check z now names the skip-predicate itself (event U, element arg
      //     Y, dialog branch X, bare-Enter check j). Every anchor below
      //     therefore pins each symbol its splice references, which is what
      //     keeps a rotation on this scale from matching a build that binds
      //     those letters to other roles. kiloclaw.js is untouched, so it
      //     still matches the v7.4.21+ block. Re-derived from the 7.4.23
      //     vsix. ---
      {
        feature: "chat-input",
        original: "bg(Te)&&!Te.shiftKey&&(Te.preventDefault(),tn())",
        patched: "bg(Te)&&(Te.metaKey||Te.ctrlKey)&&(Te.preventDefault(),tn())",
        description: "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.4.23+)",
      },
      {
        feature: "chat-escape",
        original:
          'if(Te.key==="Escape"&&Ze()){Te.preventDefault(),Te.stopPropagation(),t.abort();return}',
        patched:
          'if(Te.key==="Escape"&&Ze()&&(Te.shiftKey||!Te.target?.value?.trim())){Te.preventDefault(),Te.stopPropagation(),t.abort();return}',
        description:
          "Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v7.4.23+)",
      },
      {
        feature: "perm-keys",
        original: 'U.key==="Enter":X?!0:te?!1:O(Y)',
        patched:
          'U.key==="Enter":X?!0:te?U.target?.value?.trim()?(U.key==="Enter"&&!U.metaKey&&!U.ctrlKey||U.key===" "||U.key==="Escape"&&!U.shiftKey&&!U.ctrlKey):!1:O(Y)',
        description:
          "Permission skip-predicate: when textarea has non-whitespace content, skip bare Enter/Space/Escape; works regardless of focus (v7.4.23+)",
      },
      {
        feature: "perm-escape",
        original: 'H=U=>{if(U.key==="Escape"){q(U,"reject");return}}',
        patched:
          'H=U=>{if(U.key==="Escape"&&(U.shiftKey||!U.target?.value?.trim())){q(U,"reject");return}}',
        description:
          "Permission reject: bare Escape rejects only when textarea empty/whitespace-only; Shift+Escape always rejects (v7.4.23+)",
      },
      {
        feature: "perm-approve",
        original: 'if(j(U)){q(U,"once");return}}};',
        patched:
          'if(j(U)||U.key===" "&&!U.metaKey&&!U.ctrlKey&&!U.target?.value?.trim()||U.key==="Enter"&&(U.metaKey||U.ctrlKey)){q(U,"once");return}}};',
        description:
          "Permission approve: Cmd/Ctrl+Enter approves always; Space approves when empty/whitespace-only (v7.4.23+)",
      },
      {
        feature: "doc-escape",
        original:
          'J.key!=="Escape"||!t.submitting()&&t.status()==="idle"||J.defaultPrevented||(J.preventDefault(),t.abort())',
        patched:
          'J.key!=="Escape"||!t.submitting()&&t.status()==="idle"||J.defaultPrevented||!J.shiftKey&&J.target?.value?.trim()||(J.preventDefault(),t.abort())',
        description:
          "Document Escape: bare Escape does not abort when textarea has non-whitespace content; Shift+Escape aborts (v7.4.23+)",
      },
      // --- v7.4.22+ patterns. 7.4.22 re-minified the chat scope (Enter-check
      //     mg→Ag, event Me→De, send zt unchanged) and renamed the permission
      //     scope's event U→H while keeping every other name there (guard K,
      //     helper N, arg V, reject q, bare-Enter z, dispatch O). That left the
      //     old tail-only perm-keys anchor K?!1:N(V) matching 7.4.22 while its
      //     splice references U, which 7.4.22 no longer binds there: the first
      //     observed cross-version aliasing. Both the 7.4.21 and 7.4.22
      //     perm-keys anchors therefore start at the event test, pinning the
      //     one symbol the splice references, and this entry's previous carries
      //     the stale-U splice so a 1.14.0-on-7.4.22 install repairs in place.
      //     Document-level Escape still matches the v7.4.20+ block, and
      //     kiloclaw.js is untouched. Re-derived from the 7.4.22 vsix. ---
      {
        feature: "chat-input",
        original: "Ag(De)&&!De.shiftKey&&(De.preventDefault(),zt())",
        patched: "Ag(De)&&(De.metaKey||De.ctrlKey)&&(De.preventDefault(),zt())",
        description: "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.4.22+)",
      },
      {
        feature: "chat-escape",
        original:
          'if(De.key==="Escape"&&Ve()){De.preventDefault(),De.stopPropagation(),t.abort();return}',
        patched:
          'if(De.key==="Escape"&&Ve()&&(De.shiftKey||!De.target?.value?.trim())){De.preventDefault(),De.stopPropagation(),t.abort();return}',
        description:
          "Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v7.4.22+)",
      },
      {
        feature: "perm-keys",
        original: 'H.key==="Enter":te?!0:K?!1:N(V)',
        patched:
          'H.key==="Enter":te?!0:K?H.target?.value?.trim()?(H.key==="Enter"&&!H.metaKey&&!H.ctrlKey||H.key===" "||H.key==="Escape"&&!H.shiftKey&&!H.ctrlKey):!1:N(V)',
        previous:
          'H.key==="Enter":te?!0:K?U.target?.value?.trim()?(U.key==="Enter"&&!U.metaKey&&!U.ctrlKey||U.key===" "||U.key==="Escape"&&!U.shiftKey&&!U.ctrlKey):!1:N(V)',
        description:
          "Permission skip-predicate: when textarea has non-whitespace content, skip bare Enter/Space/Escape; works regardless of focus (v7.4.22+)",
      },
      {
        feature: "perm-escape",
        original: 'q=H=>{if(H.key==="Escape"){O(H,"reject");return}}',
        patched:
          'q=H=>{if(H.key==="Escape"&&(H.shiftKey||!H.target?.value?.trim())){O(H,"reject");return}}',
        description:
          "Permission reject: bare Escape rejects only when textarea empty/whitespace-only; Shift+Escape always rejects (v7.4.22+)",
      },
      {
        feature: "perm-approve",
        original: 'if(z(H)){O(H,"once");return}}};',
        patched:
          'if(z(H)||H.key===" "&&!H.metaKey&&!H.ctrlKey&&!H.target?.value?.trim()||H.key==="Enter"&&(H.metaKey||H.ctrlKey)){O(H,"once");return}}};',
        description:
          "Permission approve: Cmd/Ctrl+Enter approves always; Space approves when empty/whitespace-only (v7.4.22+)",
      },
      // --- v7.4.21+ patterns. 7.4.21 re-minified every webview keyboard scope
      //     except the document-level Escape (event me unchanged, so it still
      //     matches the v7.4.20+ block). Chat keydown: event Le→Me and send
      //     Vt→zt (Enter-check mg unchanged). Permission scope: event G→U,
      //     dispatch z→O, in-textarea guard W→K (helper N, arg V, and reject
      //     handler q unchanged), and the bare-Enter check $→z, so z now names
      //     the check that 7.4.20 used for the dispatch. kiloclaw.js re-minified
      //     its Enter-check helper $A→RA (see that file's block). Re-derived
      //     from the 7.4.21 vsix. ---
      {
        feature: "chat-input",
        original: "mg(Me)&&!Me.shiftKey&&(Me.preventDefault(),zt())",
        patched: "mg(Me)&&(Me.metaKey||Me.ctrlKey)&&(Me.preventDefault(),zt())",
        description: "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.4.21+)",
      },
      {
        feature: "chat-escape",
        original:
          'if(Me.key==="Escape"&&Ve()){Me.preventDefault(),Me.stopPropagation(),t.abort();return}',
        patched:
          'if(Me.key==="Escape"&&Ve()&&(Me.shiftKey||!Me.target?.value?.trim())){Me.preventDefault(),Me.stopPropagation(),t.abort();return}',
        description:
          "Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v7.4.21+)",
      },
      {
        feature: "perm-keys",
        // Widened from the tail-only K?!1:N(V) in 1.15.0: 7.4.22 kept those
        // bytes but renamed the event U→H, so the anchor must include the event
        // test to stay version-unambiguous. Installs patched with the narrow
        // form need no migration: the widened patched text is the narrow one
        // plus untouched surrounding bytes, so it is already present there.
        original: 'U.key==="Enter":te?!0:K?!1:N(V)',
        patched:
          'U.key==="Enter":te?!0:K?U.target?.value?.trim()?(U.key==="Enter"&&!U.metaKey&&!U.ctrlKey||U.key===" "||U.key==="Escape"&&!U.shiftKey&&!U.ctrlKey):!1:N(V)',
        description:
          "Permission skip-predicate: when textarea has non-whitespace content, skip bare Enter/Space/Escape; works regardless of focus (v7.4.21+)",
      },
      {
        feature: "perm-escape",
        original: 'q=U=>{if(U.key==="Escape"){O(U,"reject");return}}',
        patched:
          'q=U=>{if(U.key==="Escape"&&(U.shiftKey||!U.target?.value?.trim())){O(U,"reject");return}}',
        description:
          "Permission reject: bare Escape rejects only when textarea empty/whitespace-only; Shift+Escape always rejects (v7.4.21+)",
      },
      {
        feature: "perm-approve",
        original: 'if(z(U)){O(U,"once");return}}};',
        patched:
          'if(z(U)||U.key===" "&&!U.metaKey&&!U.ctrlKey&&!U.target?.value?.trim()||U.key==="Enter"&&(U.metaKey||U.ctrlKey)){O(U,"once");return}}};',
        description:
          "Permission approve: Cmd/Ctrl+Enter approves always; Space approves when empty/whitespace-only (v7.4.21+)",
      },
      // --- v7.4.20+ patterns. 7.4.20 re-minified every webview keyboard scope,
      //     so all six behaviors needed new patterns. Chat keydown: Enter-check
      //     ng→mg, event $e→Le, send aa→Vt, abort guard ct→We. Permission scope:
      //     in-textarea guard V→W and the interactive-element fall-through L→N,
      //     so V?!1:L(G) became W?!1:N(V); event q→G and dispatch O→z, so reject
      //     (handler j→q) and the document handler's approve branch both call
      //     z(G,…) (bare-Enter check $ unchanged). Note the names rotated rather
      //     than moved: 7.4.17's skip-predicate N, fall-through L, reject j and
      //     dispatch O are 7.4.20's j, N, q and z, so the two blocks look alike
      //     while naming different things. The document-level Escape event went
      //     oe→me, so unlike 7.4.17 it no longer matches the v7.4.13+ block.
      //     kiloclaw.js is untouched; both of its sites still match v7.4.17+.
      //     Re-derived from the 7.4.20 vsix. ---
      {
        feature: "chat-input",
        original: "mg(Le)&&!Le.shiftKey&&(Le.preventDefault(),Vt())",
        patched: "mg(Le)&&(Le.metaKey||Le.ctrlKey)&&(Le.preventDefault(),Vt())",
        description: "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.4.20+)",
      },
      {
        feature: "chat-escape",
        original:
          'if(Le.key==="Escape"&&We()){Le.preventDefault(),Le.stopPropagation(),t.abort();return}',
        patched:
          'if(Le.key==="Escape"&&We()&&(Le.shiftKey||!Le.target?.value?.trim())){Le.preventDefault(),Le.stopPropagation(),t.abort();return}',
        description:
          "Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v7.4.20+)",
      },
      {
        feature: "perm-keys",
        original: "W?!1:N(V)",
        patched:
          'W?G.target?.value?.trim()?(G.key==="Enter"&&!G.metaKey&&!G.ctrlKey||G.key===" "||G.key==="Escape"&&!G.shiftKey&&!G.ctrlKey):!1:N(V)',
        description:
          "Permission skip-predicate: when textarea has non-whitespace content, skip bare Enter/Space/Escape; works regardless of focus (v7.4.20+)",
      },
      {
        feature: "perm-escape",
        original: 'q=G=>{if(G.key==="Escape"){z(G,"reject");return}}',
        patched:
          'q=G=>{if(G.key==="Escape"&&(G.shiftKey||!G.target?.value?.trim())){z(G,"reject");return}}',
        description:
          "Permission reject: bare Escape rejects only when textarea empty/whitespace-only; Shift+Escape always rejects (v7.4.20+)",
      },
      {
        feature: "perm-approve",
        original: 'if($(G)){z(G,"once");return}}};',
        patched:
          'if($(G)||G.key===" "&&!G.metaKey&&!G.ctrlKey&&!G.target?.value?.trim()||G.key==="Enter"&&(G.metaKey||G.ctrlKey)){z(G,"once");return}}};',
        description:
          "Permission approve: Cmd/Ctrl+Enter approves always; Space approves when empty/whitespace-only (v7.4.20+)",
      },
      {
        feature: "doc-escape",
        original:
          'me.key!=="Escape"||!t.submitting()&&t.status()==="idle"||me.defaultPrevented||(me.preventDefault(),t.abort())',
        patched:
          'me.key!=="Escape"||!t.submitting()&&t.status()==="idle"||me.defaultPrevented||!me.shiftKey&&me.target?.value?.trim()||(me.preventDefault(),t.abort())',
        description:
          "Document Escape: bare Escape does not abort when textarea has non-whitespace content; Shift+Escape aborts (v7.4.20+)",
      },
      // --- v7.4.17+ patterns. 7.4.17 re-minified almost every keyboard scope.
      //     Chat keydown: Enter-check Zm→ng, send ua→aa, abort guard st→ct (event
      //     $e unchanged from 7.4.16). Permission scope: skip-predicate N=(q,G)
      //     with in-textarea guard V and fall-through L(G) (was K?!1:L(H)), and the
      //     dispatch fn z→O, so reject j and the document handler's approve branch
      //     both now call O(q,…) (bare-Enter check $ unchanged). The document-level
      //     Escape handler kept event oe, so it still matches the v7.4.13+ block
      //     below and needs no new pattern. kiloclaw.js re-minified its Enter-check
      //     helper NA→$A (see that file's block). Re-derived from the 7.4.17
      //     bundle. ---
      {
        feature: "chat-input",
        original: "ng($e)&&!$e.shiftKey&&($e.preventDefault(),aa())",
        previous: "ng($e)&&$e.metaKey&&($e.preventDefault(),aa())",
        patched: "ng($e)&&($e.metaKey||$e.ctrlKey)&&($e.preventDefault(),aa())",
        description: "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.4.17+)",
      },
      {
        feature: "chat-escape",
        original:
          'if($e.key==="Escape"&&ct()){$e.preventDefault(),$e.stopPropagation(),t.abort();return}',
        patched:
          'if($e.key==="Escape"&&ct()&&($e.shiftKey||!$e.target?.value?.trim())){$e.preventDefault(),$e.stopPropagation(),t.abort();return}',
        description:
          "Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v7.4.17+)",
      },
      {
        feature: "perm-keys",
        original: "V?!1:L(G)",
        previous:
          'V?q.target?.value?.trim()?(q.key==="Enter"&&!q.metaKey||q.key===" "||q.key==="Escape"&&!q.shiftKey&&!q.ctrlKey):!1:L(G)',
        patched:
          'V?q.target?.value?.trim()?(q.key==="Enter"&&!q.metaKey&&!q.ctrlKey||q.key===" "||q.key==="Escape"&&!q.shiftKey&&!q.ctrlKey):!1:L(G)',
        description:
          "Permission N(): when textarea has non-whitespace content, skip bare Enter/Space/Escape; works regardless of focus (v7.4.17+)",
      },
      {
        feature: "perm-escape",
        original: 'j=q=>{if(q.key==="Escape"){O(q,"reject");return}}',
        patched:
          'j=q=>{if(q.key==="Escape"&&(q.shiftKey||!q.target?.value?.trim())){O(q,"reject");return}}',
        description:
          "Permission j: bare Escape rejects only when textarea empty/whitespace-only; Shift+Escape always rejects (v7.4.17+)",
      },
      {
        feature: "perm-approve",
        original: 'if($(q)){O(q,"once");return}}};',
        previous:
          'if($(q)||q.key===" "&&!q.metaKey&&!q.ctrlKey&&!q.target?.value?.trim()||q.key==="Enter"&&q.metaKey){O(q,"once");return}}};',
        patched:
          'if($(q)||q.key===" "&&!q.metaKey&&!q.ctrlKey&&!q.target?.value?.trim()||q.key==="Enter"&&(q.metaKey||q.ctrlKey)){O(q,"once");return}}};',
        description:
          "Permission O: Cmd/Ctrl+Enter approves always; Space approves when empty/whitespace-only (v7.4.17+)",
      },
      // --- v7.4.16+ patterns. 7.4.16 re-minified only the chat keydown scope:
      //     event ze→$e and send pa→ua (Enter-check Zm and abort guard st are
      //     unchanged from 7.4.15), so both chat behaviors needed new patterns.
      //     Everything else matches an existing block: the permission scope is
      //     byte-identical to v7.3.63+/v7.4.7+ (skip-predicate K?!1:L(H) with
      //     event q, reject j, approve $/z) and the document-level Escape event
      //     went back to ie, so it matches the v7.4.7+ block. kiloclaw.js still
      //     matches v7.4.8+. Re-derived from the 7.4.16 bundle. ---
      {
        feature: "chat-input",
        original: "Zm($e)&&!$e.shiftKey&&($e.preventDefault(),ua())",
        previous: "Zm($e)&&$e.metaKey&&($e.preventDefault(),ua())",
        patched: "Zm($e)&&($e.metaKey||$e.ctrlKey)&&($e.preventDefault(),ua())",
        description: "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.4.16+)",
      },
      {
        feature: "chat-escape",
        original:
          'if($e.key==="Escape"&&st()){$e.preventDefault(),$e.stopPropagation(),t.abort();return}',
        patched:
          'if($e.key==="Escape"&&st()&&($e.shiftKey||!$e.target?.value?.trim())){$e.preventDefault(),$e.stopPropagation(),t.abort();return}',
        description:
          "Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v7.4.16+)",
      },
      // --- v7.4.15+ patterns. 7.4.15 re-minified two webview scopes: the chat
      //     keydown handler's abort guard (ot→st; event ze, Enter-check Zm and
      //     send pa unchanged from 7.4.13, so chat input still matches the
      //     v7.4.13 block) and the document-level Escape event variable (oe→le).
      //     Permission key routing (skip-predicate K?!1:L(H) via the v7.3.63+
      //     block, reject j/approve O via the v7.4.7+ block) and kiloclaw.js
      //     (v7.4.8+) still match, so only these two needed new patterns.
      //     Re-derived from the 7.4.15 bundle. ---
      {
        feature: "chat-escape",
        original:
          'if(ze.key==="Escape"&&st()){ze.preventDefault(),ze.stopPropagation(),t.abort();return}',
        patched:
          'if(ze.key==="Escape"&&st()&&(ze.shiftKey||!ze.target?.value?.trim())){ze.preventDefault(),ze.stopPropagation(),t.abort();return}',
        description:
          "Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v7.4.15+)",
      },
      {
        feature: "doc-escape",
        original:
          'le.key!=="Escape"||!t.submitting()&&t.status()==="idle"||le.defaultPrevented||(le.preventDefault(),t.abort())',
        patched:
          'le.key!=="Escape"||!t.submitting()&&t.status()==="idle"||le.defaultPrevented||!le.shiftKey&&le.target?.value?.trim()||(le.preventDefault(),t.abort())',
        description:
          "Document Escape: bare Escape does not abort when textarea has non-whitespace content; Shift+Escape aborts (v7.4.15+)",
      },
      // --- v7.4.13+ patterns. 7.4.13 re-minified three scopes: the chat send
      //     call (ua→pa; Enter-check Zm and event ze unchanged from 7.4.9), the
      //     permission skip-predicate's element arg (Q(U)→Q(H); in-textarea guard
      //     K, element helper Q, and event q unchanged), and the document-level
      //     Escape event (ae→oe). Chat Escape (ze/ot), permission reject (j) and
      //     approve (O/$) still match the v7.4.9+/v7.4.7+ blocks, and kiloclaw.js
      //     matches v7.4.8+, so only these three needed new patterns. Re-derived
      //     from the 7.4.13 bundle. ---
      {
        feature: "chat-input",
        original: "Zm(ze)&&!ze.shiftKey&&(ze.preventDefault(),pa())",
        previous: "Zm(ze)&&ze.metaKey&&(ze.preventDefault(),pa())",
        patched: "Zm(ze)&&(ze.metaKey||ze.ctrlKey)&&(ze.preventDefault(),pa())",
        description: "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.4.13+)",
      },
      {
        feature: "perm-keys",
        original: "K?!1:Q(H)",
        previous:
          'K?q.target?.value?.trim()?(q.key==="Enter"&&!q.metaKey||q.key===" "||q.key==="Escape"&&!q.shiftKey&&!q.ctrlKey):!1:Q(H)',
        patched:
          'K?q.target?.value?.trim()?(q.key==="Enter"&&!q.metaKey&&!q.ctrlKey||q.key===" "||q.key==="Escape"&&!q.shiftKey&&!q.ctrlKey):!1:Q(H)',
        description:
          "Permission N(): when textarea has non-whitespace content, skip bare Enter/Space/Escape; works regardless of focus (v7.4.13+)",
      },
      {
        feature: "doc-escape",
        original:
          'oe.key!=="Escape"||!t.submitting()&&t.status()==="idle"||oe.defaultPrevented||(oe.preventDefault(),t.abort())',
        patched:
          'oe.key!=="Escape"||!t.submitting()&&t.status()==="idle"||oe.defaultPrevented||!oe.shiftKey&&oe.target?.value?.trim()||(oe.preventDefault(),t.abort())',
        description:
          "Document Escape: bare Escape does not abort when textarea has non-whitespace content; Shift+Escape aborts (v7.4.13+)",
      },
      // --- v7.4.11+ patterns. 7.4.11 re-minified only the document-level Escape
      //     handler's event variable (re→ae); every other webview keyboard scope kept
      //     symbols that still match the patterns below — chat input/Escape via the
      //     v7.4.9+ block (Zm/ze/ua/ot), the permission skip predicate via the v7.3.63+
      //     block (K?!1:L(H), event q), and the permission reject/approve handlers via
      //     the v7.4.7+ block (j/O, z-dispatch, $). Re-derived from the 7.4.11 bundle. ---
      {
        feature: "doc-escape",
        original:
          'ae.key!=="Escape"||!t.submitting()&&t.status()==="idle"||ae.defaultPrevented||(ae.preventDefault(),t.abort())',
        patched:
          'ae.key!=="Escape"||!t.submitting()&&t.status()==="idle"||ae.defaultPrevented||!ae.shiftKey&&ae.target?.value?.trim()||(ae.preventDefault(),t.abort())',
        description:
          "Document Escape: bare Escape does not abort when textarea has non-whitespace content; Shift+Escape aborts (v7.4.11+)",
      },
      // --- v7.4.9+ patterns. 7.4.9 re-minified the chat-input scope again and the whole
      //     permission scope. Chat: Enter-check Wm→Zm, chat abort-guard it→ot (event ze and
      //     send ua unchanged from 7.4.8). Permission: the skip-predicate N=(q,U) kept event
      //     q but renamed its in-textarea guard to K (K=!!U?.closest("textarea.prompt-input"))
      //     and its element helper to Q(U); the reject (j) and approve (O) handlers now match
      //     the $-dispatch v7.3.63+ patterns below, so only the skip-predicate is repeated
      //     here. Document-level Escape event ie/Z→re. Re-derived from the 7.4.9 bundle. ---
      {
        feature: "chat-input",
        original: "Zm(ze)&&!ze.shiftKey&&(ze.preventDefault(),ua())",
        previous: "Zm(ze)&&ze.metaKey&&(ze.preventDefault(),ua())",
        patched: "Zm(ze)&&(ze.metaKey||ze.ctrlKey)&&(ze.preventDefault(),ua())",
        description: "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.4.9+)",
      },
      {
        feature: "chat-escape",
        original:
          'if(ze.key==="Escape"&&ot()){ze.preventDefault(),ze.stopPropagation(),t.abort();return}',
        patched:
          'if(ze.key==="Escape"&&ot()&&(ze.shiftKey||!ze.target?.value?.trim())){ze.preventDefault(),ze.stopPropagation(),t.abort();return}',
        description:
          "Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v7.4.9+)",
      },
      {
        feature: "perm-keys",
        original: "K?!1:Q(U)",
        previous:
          'K?q.target?.value?.trim()?(q.key==="Enter"&&!q.metaKey||q.key===" "||q.key==="Escape"&&!q.shiftKey&&!q.ctrlKey):!1:Q(U)',
        patched:
          'K?q.target?.value?.trim()?(q.key==="Enter"&&!q.metaKey&&!q.ctrlKey||q.key===" "||q.key==="Escape"&&!q.shiftKey&&!q.ctrlKey):!1:Q(U)',
        description:
          "Permission N(): when textarea has non-whitespace content, skip bare Enter/Space/Escape; works regardless of focus (v7.4.9+)",
      },
      {
        feature: "doc-escape",
        original:
          're.key!=="Escape"||!t.submitting()&&t.status()==="idle"||re.defaultPrevented||(re.preventDefault(),t.abort())',
        patched:
          're.key!=="Escape"||!t.submitting()&&t.status()==="idle"||re.defaultPrevented||!re.shiftKey&&re.target?.value?.trim()||(re.preventDefault(),t.abort())',
        description:
          "Document Escape: bare Escape does not abort when textarea has non-whitespace content; Shift+Escape aborts (v7.4.9+)",
      },
      // --- v7.4.8+ patterns. 7.4.8 re-minified only the chat-input scope and renamed
      //     one permission symbol; the permission-button and document-level handlers kept
      //     the symbols they had, so those keep matching the v7.3.63+/v7.4.7+ patterns
      //     below and are not repeated here. Changed: chat event $e→ze, Enter-check Vm→Wm,
      //     send da→ua, chat abort-guard ot→it; permission skip-predicate argument H→G.
      //     Re-derived from the 7.4.8 bundle. ---
      {
        feature: "chat-input",
        original: "Wm(ze)&&!ze.shiftKey&&(ze.preventDefault(),ua())",
        previous: "Wm(ze)&&ze.metaKey&&(ze.preventDefault(),ua())",
        patched: "Wm(ze)&&(ze.metaKey||ze.ctrlKey)&&(ze.preventDefault(),ua())",
        description: "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.4.8+)",
      },
      {
        feature: "chat-escape",
        original:
          'if(ze.key==="Escape"&&it()){ze.preventDefault(),ze.stopPropagation(),t.abort();return}',
        patched:
          'if(ze.key==="Escape"&&it()&&(ze.shiftKey||!ze.target?.value?.trim())){ze.preventDefault(),ze.stopPropagation(),t.abort();return}',
        description:
          "Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v7.4.8+)",
      },
      {
        feature: "perm-keys",
        original: "U?!1:L(G)",
        previous:
          'U?q.target?.value?.trim()?(q.key==="Enter"&&!q.metaKey||q.key===" "||q.key==="Escape"&&!q.shiftKey&&!q.ctrlKey):!1:L(G)',
        patched:
          'U?q.target?.value?.trim()?(q.key==="Enter"&&!q.metaKey&&!q.ctrlKey||q.key===" "||q.key==="Escape"&&!q.shiftKey&&!q.ctrlKey):!1:L(G)',
        description:
          "Permission N(): when textarea has non-whitespace content, skip bare Enter/Space/Escape; works regardless of focus (v7.4.8+)",
      },
      // --- v7.4.7+ patterns. 7.4.7 re-minified webview.js wholesale, so every 7.4.0/
      //     7.3.x symbol below stopped matching. New symbols: chat uses Vm (Enter-check),
      //     $e (event), da (send), ot (abort guard); permission uses N (skip predicate),
      //     j/O (handlers), z (dispatch), $ (bare-Enter check), ie (document event).
      //     Re-derived from the 7.4.7 bundle. ---
      {
        feature: "chat-input",
        original: 'Vm($e)&&!$e.shiftKey&&($e.preventDefault(),da())',
        previous: 'Vm($e)&&$e.metaKey&&($e.preventDefault(),da())',
        patched: 'Vm($e)&&($e.metaKey||$e.ctrlKey)&&($e.preventDefault(),da())',
        description: "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.4.7+)",
      },
      {
        feature: "chat-escape",
        original:
          'if($e.key==="Escape"&&ot()){$e.preventDefault(),$e.stopPropagation(),t.abort();return}',
        patched:
          'if($e.key==="Escape"&&ot()&&($e.shiftKey||!$e.target?.value?.trim())){$e.preventDefault(),$e.stopPropagation(),t.abort();return}',
        description:
          "Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v7.4.7+)",
      },
      {
        feature: "perm-keys",
        original: "U?!1:L(H)",
        previous:
          'U?q.target?.value?.trim()?(q.key==="Enter"&&!q.metaKey||q.key===" "||q.key==="Escape"&&!q.shiftKey&&!q.ctrlKey):!1:L(H)',
        patched:
          'U?q.target?.value?.trim()?(q.key==="Enter"&&!q.metaKey&&!q.ctrlKey||q.key===" "||q.key==="Escape"&&!q.shiftKey&&!q.ctrlKey):!1:L(H)',
        description:
          "Permission N(): when textarea has non-whitespace content, skip bare Enter/Space/Escape; works regardless of focus (v7.4.7+)",
      },
      {
        feature: "perm-escape",
        original: 'j=q=>{if(q.key==="Escape"){z(q,"reject");return}}',
        patched:
          'j=q=>{if(q.key==="Escape"&&(q.shiftKey||!q.target?.value?.trim())){z(q,"reject");return}}',
        description:
          "Permission j: bare Escape rejects only when textarea empty/whitespace-only; Shift+Escape always rejects (v7.4.7+)",
      },
      {
        feature: "perm-approve",
        original: 'if($(q)){z(q,"once");return}}};',
        previous:
          'if($(q)||q.key===" "&&!q.metaKey&&!q.ctrlKey&&!q.target?.value?.trim()||q.key==="Enter"&&q.metaKey){z(q,"once");return}}};',
        patched:
          'if($(q)||q.key===" "&&!q.metaKey&&!q.ctrlKey&&!q.target?.value?.trim()||q.key==="Enter"&&(q.metaKey||q.ctrlKey)){z(q,"once");return}}};',
        description:
          "Permission O: Cmd/Ctrl+Enter approves always; Space approves when empty/whitespace-only (v7.4.7+)",
      },
      {
        feature: "doc-escape",
        original:
          'ie.key!=="Escape"||!t.submitting()&&t.status()==="idle"||ie.defaultPrevented||(ie.preventDefault(),t.abort())',
        patched:
          'ie.key!=="Escape"||!t.submitting()&&t.status()==="idle"||ie.defaultPrevented||!ie.shiftKey&&ie.target?.value?.trim()||(ie.preventDefault(),t.abort())',
        description:
          "Document Escape: bare Escape does not abort when textarea has non-whitespace content; Shift+Escape aborts (v7.4.7+)",
      },
      // --- v7.4.0+ chat patterns (Ge event, Om Enter-check, Ea send). 7.4.0 added a
      //     bare-Escape "dismiss autocomplete" branch to the chat keydown handler, which
      //     re-minified this scope's symbols; the permission and document-level patterns
      //     below are unchanged from 7.3.63 and match both releases. ---
      {
        feature: "chat-input",
        original:
          'Om(Ge)&&!Ge.shiftKey&&(Ge.preventDefault(),Ea())',
        previous:
          'Om(Ge)&&Ge.metaKey&&(Ge.preventDefault(),Ea())',
        patched:
          'Om(Ge)&&(Ge.metaKey||Ge.ctrlKey)&&(Ge.preventDefault(),Ea())',
        description: "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.4.0+)",
      },
      {
        feature: "chat-escape",
        original:
          'if(Ge.key==="Escape"&&Fe()){Ge.preventDefault(),Ge.stopPropagation(),t.abort();return}',
        patched:
          'if(Ge.key==="Escape"&&Fe()&&(Ge.shiftKey||!Ge.target?.value?.trim())){Ge.preventDefault(),Ge.stopPropagation(),t.abort();return}',
        description:
          "Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v7.4.0+)",
      },
      // --- v7.3.63 chat patterns (Ne event, $m Enter-check, Oa send) ---
      {
        feature: "chat-input",
        original:
          '$m(Ne)&&!Ne.shiftKey&&(Ne.preventDefault(),Oa())',
        previous:
          '$m(Ne)&&Ne.metaKey&&(Ne.preventDefault(),Oa())',
        patched:
          '$m(Ne)&&(Ne.metaKey||Ne.ctrlKey)&&(Ne.preventDefault(),Oa())',
        description: "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.3.63)",
      },
      {
        feature: "chat-escape",
        original:
          'if(Ne.key==="Escape"&&Fe()){Ne.preventDefault(),Ne.stopPropagation(),t.abort();return}',
        patched:
          'if(Ne.key==="Escape"&&Fe()&&(Ne.shiftKey||!Ne.target?.value?.trim())){Ne.preventDefault(),Ne.stopPropagation(),t.abort();return}',
        description:
          "Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v7.3.63)",
      },
      // --- v7.3.63+ permission and document-level patterns (z, q, H, j, O, Z).
      //     These symbols are unchanged in 7.4.0, so one pattern covers both. ---
      {
        feature: "perm-keys",
        original: "K?!1:L(H)",
        previous:
          'K?q.target?.value?.trim()?(q.key==="Enter"&&!q.metaKey||q.key===" "||q.key==="Escape"&&!q.shiftKey&&!q.ctrlKey):!1:L(H)',
        patched:
          'K?q.target?.value?.trim()?(q.key==="Enter"&&!q.metaKey&&!q.ctrlKey||q.key===" "||q.key==="Escape"&&!q.shiftKey&&!q.ctrlKey):!1:L(H)',
        description:
          "Permission P(): when textarea has non-whitespace content, skip bare Enter/Space/Escape; works regardless of focus (v7.3.63+)",
      },
      {
        feature: "perm-escape",
        original:
          'j=q=>{if(q.key==="Escape"){$(q,"reject");return}}',
        patched:
          'j=q=>{if(q.key==="Escape"&&(q.shiftKey||!q.target?.value?.trim())){$(q,"reject");return}}',
        description:
          "Permission j: bare Escape rejects only when textarea empty/whitespace-only; Shift+Escape always rejects (v7.3.63+)",
      },
      {
        feature: "perm-approve",
        original:
          'if(z(q)){$(q,"once");return}}};',
        previous:
          'if(z(q)||q.key===" "&&!q.metaKey&&!q.ctrlKey&&!q.target?.value?.trim()||q.key==="Enter"&&q.metaKey){$(q,"once");return}}};',
        patched:
          'if(z(q)||q.key===" "&&!q.metaKey&&!q.ctrlKey&&!q.target?.value?.trim()||q.key==="Enter"&&(q.metaKey||q.ctrlKey)){$(q,"once");return}}};',
        description:
          "Permission O: Cmd/Ctrl+Enter approves always; Space approves when empty/whitespace-only (v7.3.63+)",
      },
      {
        feature: "doc-escape",
        original:
          'Z.key!=="Escape"||!t.submitting()&&t.status()==="idle"||Z.defaultPrevented||(Z.preventDefault(),t.abort())',
        patched:
          'Z.key!=="Escape"||!t.submitting()&&t.status()==="idle"||Z.defaultPrevented||!Z.shiftKey&&Z.target?.value?.trim()||(Z.preventDefault(),t.abort())',
        description:
          "Document Escape: bare Escape does not abort when textarea has non-whitespace content; Shift+Escape aborts (v7.3.63+)",
      },
      // --- v7.3.50-7.3.54 patterns (legacy minified symbols: Fm, je, Ce, ge, G, S, P, M, N, ee) ---
      {
        feature: "chat-input",
        original:
          'Fm(je)&&!je.shiftKey&&(je.preventDefault(),Ce())',
        previous:
          'Fm(je)&&je.metaKey&&(je.preventDefault(),Ce())',
        patched:
          'Fm(je)&&(je.metaKey||je.ctrlKey)&&(je.preventDefault(),Ce())',
        description: "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.3.50-54)",
      },
      {
        feature: "chat-escape",
        original:
          'if(je.key==="Escape"&&ge()){je.preventDefault(),je.stopPropagation(),t.abort();return}',
        previous:
          'if(je.key==="Escape"&&ge()&&(je.shiftKey||!je.target?.value)){je.preventDefault(),je.stopPropagation(),t.abort();return}',
        patched:
          'if(je.key==="Escape"&&ge()&&(je.shiftKey||!je.target?.value?.trim())){je.preventDefault(),je.stopPropagation(),t.abort();return}',
        description:
          "Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v7.3.50-54)",
      },
      {
        feature: "perm-keys",
        original: "G?!1:S(j)",
        previous:
          'z.target?.value?.trim()?(z.key==="Enter"&&!z.metaKey||z.key===" "||z.key==="Escape"&&!z.shiftKey&&!z.ctrlKey):!1',
        patched:
          'z.target?.value?.trim()?(z.key==="Enter"&&!z.metaKey&&!z.ctrlKey||z.key===" "||z.key==="Escape"&&!z.shiftKey&&!z.ctrlKey):!1',
        description:
          "Permission L(): when textarea has non-whitespace content, skip bare Enter/Space/Escape; works regardless of focus (v7.3.50-54)",
      },
      {
        feature: "perm-escape",
        original:
          'P=z=>{if(z.key==="Escape"){N(z,"reject");return}}',
        previous:
          'P=z=>{if(z.key==="Escape"&&(z.shiftKey||!z.target?.value)){N(z,"reject");return}}',
        patched:
          'P=z=>{if(z.key==="Escape"&&(z.shiftKey||!z.target?.value?.trim())){N(z,"reject");return}}',
        description:
          "Permission P: bare Escape rejects only when textarea empty/whitespace-only; Shift+Escape always rejects (v7.3.50-54)",
      },
      {
        feature: "perm-approve",
        original:
          'if(M(z)){N(z,"once");return}}};',
        previous:
          'if(M(z)||z.key===" "&&!z.metaKey&&!z.ctrlKey&&!z.target?.value?.trim()||z.key==="Enter"&&z.metaKey){N(z,"once");return}if(z.key==="Escape"&&z.shiftKey){N(z,"reject");return}}};',
        patched:
          'if(M(z)||z.key===" "&&!z.metaKey&&!z.ctrlKey&&!z.target?.value?.trim()||z.key==="Enter"&&(z.metaKey||z.ctrlKey)){N(z,"once");return}if(z.key==="Escape"&&z.shiftKey){N(z,"reject");return}}};',
        description:
          "Permission O: Cmd/Ctrl+Enter approves always; Space approves when empty/whitespace-only; Shift+Escape rejects always (v7.3.50-54)",
      },
      {
        feature: "doc-escape",
        original:
          'ee.key!=="Escape"||!t.submitting()&&t.status()==="idle"||ee.defaultPrevented||(ee.preventDefault(),t.abort())',
        previous:
          'ee.key!=="Escape"||!t.submitting()&&t.status()==="idle"||ee.defaultPrevented||!ee.shiftKey&&ee.target?.value||(ee.preventDefault(),t.abort())',
        patched:
          'ee.key!=="Escape"||!t.submitting()&&t.status()==="idle"||ee.defaultPrevented||!ee.shiftKey&&ee.target?.value?.trim()||(ee.preventDefault(),t.abort())',
        description:
          "Document Escape: bare Escape does not abort when textarea has non-whitespace content; Shift+Escape aborts (v7.3.50-54)",
      },
    ],
  },
  {
    filename: "kiloclaw.js",
    patches: [
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
        description: "KiloClaw edit: Enter→newline, Cmd/Ctrl+Enter→save (v7.4.21+)",
      },
      {
        feature: "kiloclaw-chat",
        original: 'RA(D)&&!D.shiftKey&&(D.preventDefault(),v())',
        patched: 'RA(D)&&(D.metaKey||D.ctrlKey)&&(D.preventDefault(),v())',
        description: "KiloClaw chat: Enter→newline, Cmd/Ctrl+Enter→send (v7.4.21+)",
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
        description: "KiloClaw edit: Enter→newline, Cmd/Ctrl+Enter→save (v7.4.17+)",
      },
      {
        feature: "kiloclaw-chat",
        original: '$A(D)&&!D.shiftKey&&(D.preventDefault(),v())',
        previous: '$A(D)&&D.metaKey&&(D.preventDefault(),v())',
        patched: '$A(D)&&(D.metaKey||D.ctrlKey)&&(D.preventDefault(),v())',
        description: "KiloClaw chat: Enter→newline, Cmd/Ctrl+Enter→send (v7.4.17+)",
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
        description: "KiloClaw edit: Enter→newline, Cmd/Ctrl+Enter→save (v7.4.8+)",
      },
      {
        feature: "kiloclaw-chat",
        original: 'NA(D)&&!D.shiftKey&&(D.preventDefault(),v())',
        previous: 'NA(D)&&D.metaKey&&(D.preventDefault(),v())',
        patched: 'NA(D)&&(D.metaKey||D.ctrlKey)&&(D.preventDefault(),v())',
        description: "KiloClaw chat: Enter→newline, Cmd/Ctrl+Enter→send (v7.4.8+)",
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
        original:
          'LA(D)&&!D.shiftKey&&(D.preventDefault(),v())',
        previous: 'LA(D)&&D.metaKey&&(D.preventDefault(),v())',
        patched: 'LA(D)&&(D.metaKey||D.ctrlKey)&&(D.preventDefault(),v())',
        description: "KiloClaw chat: Enter→newline, Cmd/Ctrl+Enter→send",
      },
    ],
  },
];

// A single logical behavior can have several minified variants (one per Kilo
// version). Collapse them so the status view shows each behavior once, using a
// version-agnostic label, rather than one line per per-version variant.
const FEATURE_ORDER = [
  "chat-input",
  "chat-escape",
  "perm-keys",
  "perm-escape",
  "perm-approve",
  "doc-escape",
  "kiloclaw-edit",
  "kiloclaw-chat",
] as const;

// The set of behaviors the status view knows how to display. Every PatchDef must
// name one of these, so adding a patch for a new behavior without registering it
// here fails to compile rather than vanishing from the status view at runtime.
type FeatureKey = (typeof FEATURE_ORDER)[number];

const FEATURE_LABELS: Record<FeatureKey, string> = {
  "chat-input": "Chat input: Enter adds a newline, Cmd/Ctrl+Enter sends",
  "chat-escape": "Chat Escape: aborts only when the input is empty",
  "perm-keys": "Permission prompt: typing keys stay in the input",
  "perm-escape": "Permission Escape: rejects only when the input is empty",
  "perm-approve": "Permission approve: Cmd/Ctrl+Enter always, Space when empty",
  "doc-escape": "Document Escape: non-empty input is not aborted",
  "kiloclaw-edit": "KiloClaw edit: Cmd/Ctrl+Enter saves",
  "kiloclaw-chat": "KiloClaw chat: Cmd/Ctrl+Enter sends",
};

// "patched": the patched text is present. "unpatched": the original text is
// present (Apply will fix it). "missing": no known variant of this feature was
// found, so its minified symbols changed for this Kilo version and the pattern
// needs re-targeting. "missing" is what the status view must surface rather than
// dropping the row, so an out-of-date pattern is visible instead of silent.
type FeatureState = "patched" | "unpatched" | "missing";
type Verdict =
  | "fully patched"
  | "partially patched"
  | "not patched"
  | "version not recognized";

interface FileStatus {
  filename: string;
  found: boolean;
  features: { label: string; state: FeatureState }[];
}

// Bonus (opt-in) items are reported in their own status section and never feed
// the verdict. "on": enabled and applied. "off": not enabled, drawn as a neutral
// white circle. "pending": enabled but the file does not reflect it yet (reload
// to apply). "unavailable": enabled but this Kilo build has no matching code.
type BonusState = "on" | "off" | "pending" | "unavailable";
interface BonusStatus {
  label: string;
  state: BonusState;
}

// Collapse a file's per-version patch variants into one state per logical
// feature, and list every feature the file is meant to cover (not just the ones
// whose text happens to be present). A feature with a matching patched/original
// variant is "patched"/"unpatched"; a feature whose every variant is absent is
// "missing" so the status view can show it rather than omitting the row.
function statusForFile(
  content: string,
  patches: PatchDef[]
): { label: string; state: FeatureState }[] {
  const byFeature = new Map<FeatureKey, FeatureState>();
  const intended = new Set<FeatureKey>();

  for (const p of patches) {
    const key = p.feature;
    intended.add(key);
    if (
      content.includes(p.patched) ||
      (p.previous && content.includes(p.previous))
    ) {
      byFeature.set(key, "patched");
    } else if (content.includes(p.original)) {
      if (byFeature.get(key) !== "patched") byFeature.set(key, "unpatched");
    }
  }

  return FEATURE_ORDER.filter((k) => intended.has(k)).map((k) => ({
    label: FEATURE_LABELS[k],
    state: byFeature.get(k) ?? "missing",
  }));
}

function computeVerdict(files: FileStatus[]): Verdict {
  const states = files
    .filter((f) => f.found)
    .flatMap((f) => f.features.map((ft) => ft.state));

  if (states.length === 0) return "version not recognized";

  const patched = states.filter((s) => s === "patched").length;
  const missing = states.filter((s) => s === "missing").length;

  // Every intended feature is missing: nothing in this build matches any known
  // pattern, so the whole version is unrecognized (a re-minify we have not caught
  // up to), not merely unpatched.
  if (missing === states.length) return "version not recognized";
  if (patched === states.length) return "fully patched";
  if (patched === 0) return "not patched";
  return "partially patched";
}

function computeStatus(distDir: string): {
  files: FileStatus[];
  verdict: Verdict;
} {
  const files: FileStatus[] = [];
  for (const fp of PATCHES) {
    const fpath = path.join(distDir, fp.filename);
    if (!fs.existsSync(fpath)) {
      files.push({ filename: fp.filename, found: false, features: [] });
      continue;
    }
    const content = fs.readFileSync(fpath, "utf8");
    files.push({
      filename: fp.filename,
      found: true,
      features: statusForFile(content, fp.patches),
    });
  }
  return { files, verdict: computeVerdict(files) };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// The native modal dialog has a fixed, narrow width that wraps long rows, so the
// status view uses a webview panel where the width is under our control and each
// feature stays on one line.
function showStatusPanel(
  version: string,
  verdict: Verdict,
  files: FileStatus[],
  bonuses: BonusStatus[]
): void {
  const panel = vscode.window.createWebviewPanel(
    "kiloCodeKbPatchStatus",
    "Kilo Code KB Patch",
    vscode.ViewColumn.Active,
    { enableScripts: false }
  );

  const verdictClass =
    verdict === "fully patched"
      ? "ok"
      : verdict === "not patched" || verdict === "version not recognized"
      ? "bad"
      : "warn";

  // Each feature state gets a distinct mark, color, and hint so an unpatched or
  // stale-pattern row reads differently from a patched one at a glance.
  const marks: Record<FeatureState, { mark: string; cls: string; hint: string }> =
    {
      patched: { mark: "✓", cls: "ok", hint: "" },
      unpatched: { mark: "○", cls: "warn", hint: "not applied — run Apply" },
      missing: {
        mark: "✗",
        cls: "bad",
        hint: "no matching code — patch needs update",
      },
    };

  const sections = files
    .map((f) => {
      let rows: string;
      if (!f.found) {
        rows = `<div class="row muted">file not found in dist/</div>`;
      } else if (f.features.length === 0) {
        rows = `<div class="row muted">no matching patch points</div>`;
      } else {
        rows = f.features
          .map((ft) => {
            const m = marks[ft.state];
            const hint = m.hint
              ? `<span class="hint">${escapeHtml(m.hint)}</span>`
              : "";
            return `<div class="row"><span class="mark ${
              m.cls
            }">${m.mark}</span><span class="label">${escapeHtml(
              ft.label
            )}</span>${hint}</div>`;
          })
          .join("");
      }
      return `<section><h2>${escapeHtml(f.filename)}</h2>${rows}</section>`;
    })
    .join("");

  // Bonus rows use their own marks. "off" is a neutral white circle (the item is
  // simply not enabled); it never reads as a problem. These rows do not feed the
  // verdict badge above.
  const bonusMarks: Record<BonusState, { mark: string; cls: string; hint: string }> =
    {
      on: { mark: "✓", cls: "ok", hint: "" },
      off: { mark: "○", cls: "off", hint: "" },
      pending: { mark: "○", cls: "warn", hint: "reload to apply" },
      unavailable: {
        mark: "✗",
        cls: "bad",
        hint: "no matching code — patch needs update",
      },
    };
  const bonusRows = bonuses
    .map((b) => {
      const m = bonusMarks[b.state];
      const hint = m.hint
        ? `<span class="hint">${escapeHtml(m.hint)}</span>`
        : "";
      return `<div class="row"><span class="mark ${
        m.cls
      }">${m.mark}</span><span class="label">${escapeHtml(
        b.label
      )}</span>${hint}</div>`;
    })
    .join("");
  const bonusSection = bonusRows
    ? `<section><h2>Bonus <span class="sub">(opt-in, does not affect status)</span></h2>${bonusRows}</section>`
    : "";

  panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>
  body {
    font-family: var(--vscode-font-family);
    font-size: calc(var(--vscode-font-size) * 1.2);
    color: var(--vscode-foreground);
    padding: 28px 32px;
  }
  header {
    display: flex;
    align-items: baseline;
    gap: 14px;
    margin-bottom: 26px;
  }
  header .version { font-size: 1.6em; font-weight: 600; }
  .badge {
    padding: 4px 14px;
    border-radius: 12px;
    font-size: 0.95em;
    font-weight: 600;
    white-space: nowrap;
  }
  .badge.ok { background: #1a7f37; color: #fff; }
  .badge.warn { background: var(--vscode-editorWarning-foreground, #d29922); color: #000; }
  .badge.bad { background: var(--vscode-testing-iconFailed, #f85149); color: #fff; }
  section { margin-bottom: 24px; }
  h2 {
    font-size: 1.05em;
    font-weight: 600;
    opacity: 0.7;
    margin: 0 0 12px;
    font-family: var(--vscode-editor-font-family, monospace);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    white-space: nowrap;
    padding: 5px 0;
  }
  .mark { width: 1em; text-align: center; font-weight: 700; }
  .mark.ok { color: var(--vscode-testing-iconPassed, #3fb950); }
  .mark.warn { color: var(--vscode-editorWarning-foreground, #d29922); }
  .mark.bad { color: var(--vscode-testing-iconFailed, #f85149); }
  .mark.off { color: var(--vscode-foreground); opacity: 0.6; }
  .hint { opacity: 0.6; font-style: italic; font-size: 0.85em; }
  .sub { font-weight: 400; font-size: 0.8em; opacity: 0.85; font-family: var(--vscode-font-family); }
  .muted { opacity: 0.6; font-style: italic; }
</style>
</head>
<body>
  <header>
    <span class="version">Kilo Code v${escapeHtml(version)}</span>
    <span class="badge ${verdictClass}">${escapeHtml(verdict)}</span>
  </header>
  ${sections}
  ${bonusSection}
</body>
</html>`;
}

// Kilo extension dirs are named "kilocode.kilo-code-<version>[-<platform>]",
// e.g. "kilocode.kilo-code-7.4.11-darwin-arm64". Pull out the leading dotted
// numeric version as an array of ints so it can be compared and displayed.
function parseKiloVersion(dirName: string): number[] {
  const m = dirName.match(/kilocode\.kilo-code-(\d+(?:\.\d+)*)/);
  return m ? m[1].split(".").map((n) => parseInt(n, 10)) : [];
}

// Numeric, component-wise version compare. Must NOT be a string sort: as
// strings "7.4.11" < "7.4.9" (they differ at the patch digit, "1" vs "9"), which
// would wrongly rank 7.4.9 above 7.4.11 and pick the older build as "latest".
function compareKiloVersions(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// Set at activation. Used to derive the extensions folder this editor loads
// from, so discovery follows the editor rather than a hardcoded path.
let extensionContext: vscode.ExtensionContext | undefined;

// Candidate extensions roots, most authoritative first:
//   1. The folder the running editor loaded Kilo Code from (host API). Exact
//      for every fork, portable installs, and --extensions-dir.
//   2. The folder this extension itself is installed in. Kilo Code normally
//      sits next to it, and this signal survives Kilo Code being disabled. In
//      a development host it is the checkout's parent, which contains no Kilo
//      install and falls through.
//   3. Known per-fork default folders.
// Deduplicated, existing directories only, priority order preserved.
function candidateExtensionRoots(): string[] {
  const roots: string[] = [];
  const kilo = vscode.extensions.getExtension(KILO_EXT_ID);
  if (kilo) roots.push(path.dirname(kilo.extensionUri.fsPath));
  if (extensionContext) {
    roots.push(path.dirname(extensionContext.extensionUri.fsPath));
  }
  for (const rel of KNOWN_EXT_DIRS) {
    roots.push(path.join(os.homedir(), rel));
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const root of roots) {
    const resolved = path.resolve(root);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    if (fs.existsSync(resolved)) out.push(resolved);
  }
  return out;
}

// The first candidate root containing a Kilo Code install wins, so the running
// editor's own install always beats another fork's leftover copy. Within that
// root, the newest version is chosen (numeric compare; see
// compareKiloVersions). An unreadable root falls through instead of failing
// the whole search.
function findLatestKiloExt(): string | undefined {
  for (const root of candidateExtensionRoots()) {
    let entries: string[];
    try {
      entries = fs.readdirSync(root);
    } catch {
      continue;
    }
    const dirs = entries.filter((d) => d.startsWith("kilocode.kilo-code-"));
    if (dirs.length === 0) continue;
    dirs.sort((a, b) =>
      compareKiloVersions(parseKiloVersion(a), parseKiloVersion(b))
    );
    return path.join(root, dirs[dirs.length - 1]);
  }
  return undefined;
}

function extractVersion(extPath: string): string {
  const parts = parseKiloVersion(path.basename(extPath));
  return parts.length > 0 ? parts.join(".") : "unknown";
}

// Restore Originals flips the bonus settings off and reverts their files in one
// batch. Suspend the config-change listener for the duration so it cannot fire
// mid-batch and re-reconcile a bonus whose setting has not been flipped yet (for
// example re-applying the still-enabled title rename right after its file was
// reverted). Once the batch ends, settings and files agree, so any late change
// event reconciles to a no-op.
let suspendReconcile = false;

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
const OPEN_IN_TAB_ORIGINAL = "Open in Tab";
const OPEN_IN_TAB_RENAMED = "Kilo Code: Open";

// Anchored on the unique command id. The command definition is the only place
// where "title" immediately follows this id (the menu contribution is followed
// by "group"/"when"), so this matches exactly once and stays idempotent no
// matter what the title currently is. Capture group 1 is everything up to and
// including `"title": `, so only the quoted value is rewritten.
const OPEN_IN_TAB_TITLE_RE =
  /("command":\s*"kilo-code\.new\.openInTab"\s*,\s*"title":\s*)"(?:[^"\\]|\\.)*"/;

function desiredOpenInTabTitle(): string {
  const rename = vscode.workspace
    .getConfiguration("kiloCodeKbPatch")
    .get<boolean>("renameOpenInTab", false);
  return rename ? OPEN_IN_TAB_RENAMED : OPEN_IN_TAB_ORIGINAL;
}

// Rewrite the openInTab title in Kilo's manifest to match the bonus setting.
// Returns true only when the file actually changed. Fails safe: a missing
// manifest or a manifest whose shape a future Kilo has changed (pattern not
// found) is a silent no-op rather than an error.
function reconcileOpenInTabTitle(extPath: string): boolean {
  const pkgPath = path.join(extPath, "package.json");
  if (!fs.existsSync(pkgPath)) return false;
  const content = fs.readFileSync(pkgPath, "utf8");
  if (!OPEN_IN_TAB_TITLE_RE.test(content)) return false;
  const desired = desiredOpenInTabTitle();
  const updated = content.replace(
    OPEN_IN_TAB_TITLE_RE,
    (_match, prefix: string) => `${prefix}${JSON.stringify(desired)}`
  );
  if (updated === content) return false;
  fs.writeFileSync(pkgPath, updated, "utf8");
  return true;
}

// --- Bonus: attach-file "+" button ------------------------------------------
// Adds a "+" button to the prompt input's action toolbar
// (.prompt-input-hint-actions) that opens Kilo's file picker directly, instead
// of the type-"@" then "Browse files..." mention flow. It is injected just
// before the indexing (database) button so it lands at the left edge of the icon
// cluster.
//
// The button reuses Kilo's own tooltip, ghost button, and sprite-icon
// components, plus the already-localized "prompt.action.attachFile" label
// (defined in every locale but otherwise unused). onClick reaches four in-scope
// PromptInput locals: the textarea ref, the mention controller, its value setter,
// and the post-input sync. It inserts "@" at the caret (execCommand, so a real
// input event fires) then calls <controller>.selectMention({type:"file-picker"},
// <textarea>,<setter>,<sync>), the exact call the mention menu's own "Browse
// files..." row makes; the host replies with filePickerResult and the chosen path
// is spliced in over the "@".
//
// Opt-in: off unless "kiloCodeKbPatch.addAttachFileButton" is true in
// settings.json. Like every webview.js pattern these symbols are re-minified per
// Kilo release, so each supported version keeps its own variant here (newest
// first); exactly one matches a given build. A build matching none is a silent
// no-op. Per-version symbols: 7.4.20 uses ai/oe/gt/Mn
// (container/when-wrapper/when-pred/tooltip) with insert R and createComponent _,
// ghost button _t, icon component Wi, textarea w (was k in every earlier build),
// setter L, sync bt, icon name "plus"; 7.4.17 uses Pe/ce/Ke/Fn
// (container/when-wrapper/when-pred/tooltip) with insert F and createComponent x,
// ghost button St (was _t), icon component Hi, setter L, sync Ut, icon name
// "plus"; 7.4.16 uses Pe/le/Ue/Pn (container/when/tooltip)
// with insert R and createComponent C, icon component en, setter L, sync nn,
// icon name "plus-small"; 7.4.15 uses Pe/se/Ue/Gn with insert P and
// createComponent _, icon component tn, setter L, sync nn, icon name
// "plus-small"; 7.4.13 uses Pe/ce/Ue/On (insert R, createComponent C, icon tn),
// setter Q, sync an, icon name "plus-small"; 7.4.11 uses Re/de/He/Gn, setter L,
// icon name "plus".
interface AttachButtonDef {
  original: string;
  patched: string;
  // Earlier patched forms of this same variant, newest first. A patched string
  // ends with its own original, so applying original→patched on top of an older
  // form would leave the old button in place and inject a second one. Listing
  // the old forms lets an upgrade rewrite the existing button instead.
  previous?: string[];
}

const ATTACH_FILE_BUTTONS: AttachButtonDef[] = [
  // v7.5.0: insert N→R, container Qa→Nr, create E→C, when-wrapper ce→ne,
  // tooltip Qn→Mn, ghost Et→_t, icon to→ro, sync ht→bt, and the indexing
  // accessor a→r (when-pred pt, setter Q, i18n u, controller h, textarea w
  // unchanged). Six of those spellings are ones 7.4.20/7.4.21 already used
  // (R, C, Mn, _t, bt, r), a reminder that per-release symbols do not advance
  // monotonically, so the older entries below still have to be swept for
  // aliasing rather than assumed stale. Every closure local the injected
  // button calls is pinned to ground truth by Kilo's own mention-menu row,
  // h.selectMention(Va,w,Q,bt), and corroborated per symbol: w=je is the
  // textarea.prompt-input node from template ovr, Q is the text signal setter
  // from [M,Q]=le(""), and bt is the auto-resize. The sprite icon component is
  // function ro(e), reached from the href builder sje=e=>`opencode-icon-${e}`.
  {
    original:
      "R(Nr,C(ne,{get when(){return pt()},get children(){return C(Mn,{get value(){return r.status().message||r.label()}",
    patched:
      'R(Nr,C(Mn,{get value(){return u.t("prompt.action.attachFile")},placement:"top",get children(){return C(_t,{variant:"ghost",size:"small",onClick:()=>{if(!w)return;w.focus();let _v=w.value,_s=w.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");h.selectMention({type:"file-picker"},w,Q,bt)},get"aria-label"(){return u.t("prompt.action.attachFile")},get children(){return C(ro,{name:"plus",size:"small"})}})}}),null),R(Nr,C(ne,{get when(){return pt()},get children(){return C(Mn,{get value(){return r.status().message||r.label()}',
  },
  // v7.4.23: insert P→N, create _→E, when-wrapper se→ce, when-pred mt→pt,
  // tooltip Sn→Qn, icon Ji→to, sync yt→ht (container Qa, ghost Et, setter Q,
  // i18n u, controller h, textarea w, and the indexing accessor a unchanged).
  {
    original:
      "N(Qa,E(ce,{get when(){return pt()},get children(){return E(Qn,{get value(){return a.status().message||a.label()}",
    patched:
      'N(Qa,E(Qn,{get value(){return u.t("prompt.action.attachFile")},placement:"top",get children(){return E(Et,{variant:"ghost",size:"small",onClick:()=>{if(!w)return;w.focus();let _v=w.value,_s=w.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");h.selectMention({type:"file-picker"},w,Q,ht)},get"aria-label"(){return u.t("prompt.action.attachFile")},get children(){return E(to,{name:"plus",size:"small"})}})}}),null),N(Qa,E(ce,{get when(){return pt()},get children(){return E(Qn,{get value(){return a.status().message||a.label()}',
  },
  // v7.4.22: insert R→P, container Ta→Qa, guard oe→se, icon Vi→Ji, setter
  // L→Q (create _, tooltip Sn, ghost Et, i18n u, controller h, textarea w,
  // sync yt, and the indexing accessor a unchanged).
  {
    original:
      'P(Qa,_(se,{get when(){return mt()},get children(){return _(Sn,{get value(){return a.status().message||a.label()}',
    patched:
      'P(Qa,_(Sn,{get value(){return u.t("prompt.action.attachFile")},placement:"top",get children(){return _(Et,{variant:"ghost",size:"small",onClick:()=>{if(!w)return;w.focus();let _v=w.value,_s=w.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");h.selectMention({type:"file-picker"},w,Q,yt)},get"aria-label"(){return u.t("prompt.action.attachFile")},get children(){return _(Ji,{name:"plus",size:"small"})}})}}),null),P(Qa,_(se,{get when(){return mt()},get children(){return _(Sn,{get value(){return a.status().message||a.label()}',
  },
  // v7.4.21: the indexing-status accessor changed for the first time (r→a),
  // alongside the usual churn (container Ta, tooltip Sn, ghost Et, icon Vi,
  // sync yt); Kilo's own tooltips gained openDelay:0, which sits outside the
  // anchor and is not copied into the injected button.
  {
    original:
      'R(Ta,_(oe,{get when(){return mt()},get children(){return _(Sn,{get value(){return a.status().message||a.label()}',
    patched:
      'R(Ta,_(Sn,{get value(){return u.t("prompt.action.attachFile")},placement:"top",get children(){return _(Et,{variant:"ghost",size:"small",onClick:()=>{if(!w)return;w.focus();let _v=w.value,_s=w.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");h.selectMention({type:"file-picker"},w,L,yt)},get"aria-label"(){return u.t("prompt.action.attachFile")},get children(){return _(Vi,{name:"plus",size:"small"})}})}}),null),R(Ta,_(oe,{get when(){return mt()},get children(){return _(Sn,{get value(){return a.status().message||a.label()}',
  },
  {
    original:
      'R(ai,_(oe,{get when(){return gt()},get children(){return _(Mn,{get value(){return r.status().message||r.label()}',
    patched:
      'R(ai,_(Mn,{get value(){return u.t("prompt.action.attachFile")},placement:"top",get children(){return _(_t,{variant:"ghost",size:"small",onClick:()=>{if(!w)return;w.focus();let _v=w.value,_s=w.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");h.selectMention({type:"file-picker"},w,L,bt)},get"aria-label"(){return u.t("prompt.action.attachFile")},get children(){return _(Wi,{name:"plus",size:"small"})}})}}),null),R(ai,_(oe,{get when(){return gt()},get children(){return _(Mn,{get value(){return r.status().message||r.label()}',
  },
  {
    original:
      'F(Pe,x(ce,{get when(){return Ke()},get children(){return x(Fn,{get value(){return r.status().message||r.label()}',
    patched:
      'F(Pe,x(Fn,{get value(){return u.t("prompt.action.attachFile")},placement:"top",get children(){return x(St,{variant:"ghost",size:"small",onClick:()=>{if(!k)return;k.focus();let _v=k.value,_s=k.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");h.selectMention({type:"file-picker"},k,L,Ut)},get"aria-label"(){return u.t("prompt.action.attachFile")},get children(){return x(Hi,{name:"plus",size:"small"})}})}}),null),F(Pe,x(ce,{get when(){return Ke()},get children(){return x(Fn,{get value(){return r.status().message||r.label()}',
    // 1.11.0 and earlier drew the small glyph here. The larger "plus" was always
    // in the sprite map; it only looked absent because minified object keys are
    // quoted just when they must be, so "plus-small" is quoted and plus is bare.
    previous: [
      'F(Pe,x(Fn,{get value(){return u.t("prompt.action.attachFile")},placement:"top",get children(){return x(St,{variant:"ghost",size:"small",onClick:()=>{if(!k)return;k.focus();let _v=k.value,_s=k.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");h.selectMention({type:"file-picker"},k,L,Ut)},get"aria-label"(){return u.t("prompt.action.attachFile")},get children(){return x(Hi,{name:"plus-small",size:"small"})}})}}),null),F(Pe,x(ce,{get when(){return Ke()},get children(){return x(Fn,{get value(){return r.status().message||r.label()}',
    ],
  },
  {
    original:
      'R(Pe,C(le,{get when(){return Ue()},get children(){return C(Pn,{get value(){return r.status().message||r.label()}',
    patched:
      'R(Pe,C(Pn,{get value(){return u.t("prompt.action.attachFile")},placement:"top",get children(){return C(_t,{variant:"ghost",size:"small",onClick:()=>{if(!k)return;k.focus();let _v=k.value,_s=k.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");h.selectMention({type:"file-picker"},k,L,nn)},get"aria-label"(){return u.t("prompt.action.attachFile")},get children(){return C(en,{name:"plus-small",size:"small"})}})}}),null),R(Pe,C(le,{get when(){return Ue()},get children(){return C(Pn,{get value(){return r.status().message||r.label()}',
  },
  {
    original:
      'P(Pe,_(se,{get when(){return Ue()},get children(){return _(Gn,{get value(){return r.status().message||r.label()}',
    patched:
      'P(Pe,_(Gn,{get value(){return u.t("prompt.action.attachFile")},placement:"top",get children(){return _(_t,{variant:"ghost",size:"small",onClick:()=>{if(!k)return;k.focus();let _v=k.value,_s=k.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");h.selectMention({type:"file-picker"},k,L,nn)},get"aria-label"(){return u.t("prompt.action.attachFile")},get children(){return _(tn,{name:"plus-small",size:"small"})}})}}),null),P(Pe,_(se,{get when(){return Ue()},get children(){return _(Gn,{get value(){return r.status().message||r.label()}',
  },
  {
    original:
      'R(Pe,C(ce,{get when(){return Ue()},get children(){return C(On,{get value(){return r.status().message||r.label()}',
    patched:
      'R(Pe,C(On,{get value(){return u.t("prompt.action.attachFile")},placement:"top",get children(){return C(_t,{variant:"ghost",size:"small",onClick:()=>{if(!k)return;k.focus();let _v=k.value,_s=k.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");h.selectMention({type:"file-picker"},k,Q,an)},get"aria-label"(){return u.t("prompt.action.attachFile")},get children(){return C(tn,{name:"plus-small",size:"small"})}})}}),null),R(Pe,C(ce,{get when(){return Ue()},get children(){return C(On,{get value(){return r.status().message||r.label()}',
  },
  {
    original:
      'R(Re,C(de,{get when(){return He()},get children(){return C(Gn,{get value(){return r.status().message||r.label()}',
    patched:
      'R(Re,C(Gn,{get value(){return u.t("prompt.action.attachFile")},placement:"top",get children(){return C(_t,{variant:"ghost",size:"small",onClick:()=>{if(!k)return;k.focus();let _v=k.value,_s=k.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");h.selectMention({type:"file-picker"},k,L,an)},get"aria-label"(){return u.t("prompt.action.attachFile")},get children(){return C(tn,{name:"plus",size:"small"})}})}}),null),R(Re,C(de,{get when(){return He()},get children(){return C(Gn,{get value(){return r.status().message||r.label()}',
  },
];

function addAttachFileButtonEnabled(): boolean {
  return vscode.workspace
    .getConfiguration("kiloCodeKbPatch")
    .get<boolean>("addAttachFileButton", false);
}

// Find the button variant that matches this build. Each patched string contains
// its own original as a suffix, so a patched build makes both includes()-true for
// its variant only; unmatched versions' symbols are absent. Returns undefined
// when no known variant is present (a future Kilo re-minify), which callers treat
// as a silent no-op.
function matchingAttachFileButton(content: string): AttachButtonDef | undefined {
  return ATTACH_FILE_BUTTONS.find(
    (b) =>
      content.includes(b.patched) ||
      content.includes(b.original) ||
      b.previous?.some((p) => content.includes(p))
  );
}

// The button this bundle currently carries, when it is an older form of the
// matched variant rather than the current one.
function stalePatchedForm(
  content: string,
  variant: AttachButtonDef
): string | undefined {
  return variant.previous?.find((p) => content.includes(p));
}

// Apply or remove the attach-file button in Kilo's webview bundle to match the
// setting. Returns true only when the file actually changed. The patched text
// contains the original as a suffix, so "already patched" is tested before "is
// pristine". Fails safe: a missing bundle, or a pattern a future Kilo has
// re-minified (no variant matches), is a silent no-op.
function reconcileAttachFileButton(extPath: string): boolean {
  const webviewPath = path.join(extPath, "dist", "webview.js");
  if (!fs.existsSync(webviewPath)) return false;
  const content = fs.readFileSync(webviewPath, "utf8");
  const variant = matchingAttachFileButton(content);
  if (!variant) return false;
  const enabled = addAttachFileButtonEnabled();
  const isPatched = content.includes(variant.patched);
  // An older form of this variant is a button that is present but out of date.
  // It must be rewritten in place, never treated as pristine, or enabling would
  // add a second button alongside it.
  const stale = isPatched ? undefined : stalePatchedForm(content, variant);
  if (enabled === isPatched && !stale) return false;

  let updated: string;
  if (enabled) {
    updated = stale
      ? content.replace(stale, variant.patched)
      : content.replace(variant.original, variant.patched);
  } else {
    updated = stale
      ? content.replace(stale, variant.original)
      : content.replace(variant.patched, variant.original);
  }
  if (updated === content) return false;
  fs.writeFileSync(webviewPath, updated, "utf8");
  return true;
}

// Which bonus files a reconcile pass actually rewrote. Anything true here is a
// change the running session does not reflect until the window reloads.
interface BonusChanges {
  title: boolean;
  attach: boolean;
}

// One reconcile pass over both bonus knobs. Each reconciler fails safe on its
// own (an unreadable file reads as "unchanged"), so a broken manifest cannot
// stop the webview bundle from reconciling or vice versa.
function reconcileBonuses(extPath: string): BonusChanges {
  let title = false;
  let attach = false;
  try {
    title = reconcileOpenInTabTitle(extPath);
  } catch {}
  try {
    attach = reconcileAttachFileButton(extPath);
  } catch {}
  return { title, attach };
}

// Offer the reload that pending bonus changes still need, as one notification
// however many items changed. Callers decide when: right away on a settings
// change, but at activation only after the apply-patches prompt (if any) is
// settled. A bare "Reload Window" button shown next to that prompt invites
// reloading first, which restarts the extension host before the keyboard
// patches were ever applied.
function notifyBonusReload(changed: BonusChanges): void {
  const items = [
    ...(changed.title ? ["editor title icon"] : []),
    ...(changed.attach ? ["attach-file button"] : []),
  ];
  if (items.length === 0) return;
  vscode.window
    .showInformationMessage(
      `Kilo Code KB Patch: ${items.join(" and ")} updated. Reload window to apply.`,
      "Reload Window"
    )
    .then((choice) => {
      if (choice === "Reload Window") {
        vscode.commands.executeCommand("workbench.action.reloadWindow");
      }
    });
}

// Flip a bonus setting to false, but only in the scopes where the user has
// actually set it (globalValue/workspaceValue/workspaceFolderValue defined), so
// Restore Originals turns the bonus off for good without writing settings
// entries the user never added. An absent or already-false entry is left alone.
async function forceSettingOff(key: string): Promise<void> {
  const config = vscode.workspace.getConfiguration("kiloCodeKbPatch");
  const info = config.inspect<boolean>(key);
  if (!info) return;
  const scopes: [boolean | undefined, vscode.ConfigurationTarget][] = [
    [info.globalValue, vscode.ConfigurationTarget.Global],
    [info.workspaceValue, vscode.ConfigurationTarget.Workspace],
    [info.workspaceFolderValue, vscode.ConfigurationTarget.WorkspaceFolder],
  ];
  for (const [value, target] of scopes) {
    if (value !== undefined && value !== false) {
      await config.update(key, false, target);
    }
  }
}

// Status for the two bonus items, for the status panel only. Each item's state
// comes from its setting first (not enabled -> "off"), then from whether the file
// actually reflects it. Bonus state never affects the verdict.
function computeBonusStatus(extPath: string): BonusStatus[] {
  const cfg = vscode.workspace.getConfiguration("kiloCodeKbPatch");
  const read = (p: string) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");

  let attach: BonusState = "off";
  if (cfg.get<boolean>("addAttachFileButton", false)) {
    const content = read(path.join(extPath, "dist", "webview.js"));
    const variant = matchingAttachFileButton(content);
    attach = !variant
      ? "unavailable"
      : content.includes(variant.patched)
      ? "on"
      : "pending";
  }

  let openInTab: BonusState = "off";
  if (cfg.get<boolean>("renameOpenInTab", false)) {
    const match = read(path.join(extPath, "package.json")).match(
      OPEN_IN_TAB_TITLE_RE
    );
    openInTab = !match
      ? "unavailable"
      : match[0].includes(JSON.stringify(OPEN_IN_TAB_RENAMED))
      ? "on"
      : "pending";
  }

  return [
    { label: "Prompt toolbar: + button opens the file picker", state: attach },
    { label: 'Editor title: group the "Open in Tab" icon', state: openInTab },
  ];
}

interface PatchResult {
  filename: string;
  applied: string[];
  skipped: string[];
  reverted: string[];
  noChanges: boolean;
}

function applyPatches(filePath: string, patches: PatchDef[]): PatchResult {
  const content = fs.readFileSync(filePath, "utf8");
  let modified = content;
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const p of patches) {
    if (modified.includes(p.patched)) {
      skipped.push(`${p.description} (already patched)`);
      continue;
    }
    if (modified.includes(p.original)) {
      modified = modified.replace(p.original, p.patched);
      applied.push(p.description);
      continue;
    }
    if (p.previous && modified.includes(p.previous)) {
      modified = modified.replace(p.previous, p.patched);
      applied.push(`${p.description} (upgraded)`);
      continue;
    }
    skipped.push(`${p.description} (pattern not found)`);
  }

  if (modified !== content) {
    fs.writeFileSync(filePath, modified, "utf8");
  }

  return {
    filename: path.basename(filePath),
    applied,
    skipped,
    reverted: [],
    noChanges: modified === content,
  };
}

function restorePatches(filePath: string, patches: PatchDef[]): PatchResult {
  const content = fs.readFileSync(filePath, "utf8");
  let modified = content;
  const reverted: string[] = [];
  const skipped: string[] = [];

  for (const p of patches) {
    if (modified.includes(p.patched)) {
      modified = modified.replace(p.patched, p.original);
      reverted.push(p.description);
      continue;
    }
    if (p.previous && modified.includes(p.previous)) {
      modified = modified.replace(p.previous, p.original);
      reverted.push(`${p.description} (previous version)`);
      continue;
    }
    if (modified.includes(p.original)) {
      skipped.push(`${p.description} (already original)`);
      continue;
    }
    skipped.push(`${p.description} (neither pattern found)`);
  }

  if (modified !== content) {
    fs.writeFileSync(filePath, modified, "utf8");
  }

  return {
    filename: path.basename(filePath),
    applied: [],
    skipped,
    reverted,
    noChanges: modified === content,
  };
}

// Resolves to whether a Reload Window offer was shown (something was applied
// or restored), so activation's Apply path knows if the held bonus-reload
// notification is already covered by this one or must still be surfaced.
async function runPatch(
  mode: "apply" | "restore" | "status"
): Promise<boolean> {
  const extPath = findLatestKiloExt();
  if (!extPath) {
    const home = os.homedir();
    const searched = candidateExtensionRoots()
      .map((r) => (r.startsWith(home) ? `~${r.slice(home.length)}` : r))
      .join(", ");
    vscode.window.showErrorMessage(
      `Kilo Code KB Patch: Could not find a kilocode.kilo-code-* install. Searched: ${
        searched || "(no extensions folder found)"
      }`
    );
    return false;
  }

  const version = extractVersion(extPath);
  const distDir = path.join(extPath, "dist");

  if (mode === "status") {
    const { files, verdict } = computeStatus(distDir);
    showStatusPanel(version, verdict, files, computeBonusStatus(extPath));
    return false;
  }

  const results: PatchResult[] = [];

  for (const fp of PATCHES) {
    const fpath = path.join(distDir, fp.filename);
    if (!fs.existsSync(fpath)) {
      results.push({
        filename: fp.filename,
        applied: [],
        skipped: ["file not found in dist/"],
        reverted: [],
        noChanges: true,
      });
      continue;
    }

    if (mode === "apply") {
      results.push(applyPatches(fpath, fp.patches));
    } else {
      results.push(restorePatches(fpath, fp.patches));
    }
  }

  // Restore Originals also turns the bonuses off. Flip each present setting to
  // false so it stays off, then reconcile (the reconcilers read the settings, so
  // this reverts the button and title now and stops the next activation from
  // re-applying them). The listener is suspended so its own reconcile cannot
  // double-fire mid-batch; the final settings and files agree.
  let bonusReverted = 0;
  if (mode === "restore") {
    suspendReconcile = true;
    try {
      await forceSettingOff("addAttachFileButton");
      await forceSettingOff("renameOpenInTab");
      if (reconcileAttachFileButton(extPath)) bonusReverted++;
      if (reconcileOpenInTabTitle(extPath)) bonusReverted++;
    } finally {
      suspendReconcile = false;
    }
  }

  const totalApplied =
    results.reduce((s, r) => s + r.applied.length + r.reverted.length, 0) +
    bonusReverted;

  const verb = mode === "apply" ? "Patched" : "Restored";

  if (totalApplied > 0) {
    vscode.window
      .showInformationMessage(
        `Kilo Code KB Patch: ${verb} ${totalApplied} patch(es) on v${version}. Reload window to take effect.`,
        "Reload Window"
      )
      .then((choice) => {
        if (choice === "Reload Window") {
          vscode.commands.executeCommand("workbench.action.reloadWindow");
        }
      });
    return true;
  }
  // Nothing changed. Report it in terms of this build's features, not the raw
  // pattern list: a skipped-pattern count sweeps in every other version's
  // variants (dozens per feature), and on an already patched install it reads
  // as a failure ("No patches applied (74 skipped)") when the true state is
  // that there is nothing left to do.
  const { files, verdict } = computeStatus(distDir);
  if (mode === "restore") {
    vscode.window.showInformationMessage(
      `Kilo Code KB Patch: Nothing to restore on v${version}. Files are already original.`
    );
    return false;
  }
  if (verdict === "fully patched") {
    vscode.window.showInformationMessage(
      `Kilo Code KB Patch: v${version} is already fully patched. Nothing to apply.`
    );
    return false;
  }
  if (verdict === "version not recognized") {
    vscode.window.showWarningMessage(
      `Kilo Code KB Patch: No known patterns match v${version}. Update KB Patch to support it.`
    );
    return false;
  }
  // Apply changed nothing yet the build is not fully patched: the remaining
  // features' patterns do not match this Kilo version.
  const missing = files
    .filter((f) => f.found)
    .flatMap((f) => f.features)
    .filter((ft) => ft.state === "missing").length;
  vscode.window.showWarningMessage(
    `Kilo Code KB Patch: ${missing} feature(s) on v${version} have no matching pattern. Update KB Patch to cover them.`
  );
  return false;
}

export function activate(context: vscode.ExtensionContext): void {
  extensionContext = context;

  context.subscriptions.push(
    vscode.commands.registerCommand("kiloCodeKbPatch.apply", () =>
      runPatch("apply")
    ),
    vscode.commands.registerCommand("kiloCodeKbPatch.restore", () =>
      runPatch("restore")
    ),
    vscode.commands.registerCommand("kiloCodeKbPatch.status", () =>
      runPatch("status")
    )
  );

  // Auto-patch on activation if not yet patched
  const extPath = findLatestKiloExt();
  if (!extPath) return;

  // Reconcile the bonus knobs on startup (self-heals after a Kilo update resets
  // the files) and whenever one of our settings changes. The settings are
  // registered in package.json, so affectsConfiguration reports them reliably and
  // limits the reconcile (which reads the webview bundle) to relevant changes.
  // On the settings path the reload offer shows right away; the startup result
  // is held until the apply-patches decision below is settled.
  const startupBonuses = reconcileBonuses(extPath);
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (suspendReconcile) return;
      if (!e.affectsConfiguration("kiloCodeKbPatch")) return;
      notifyBonusReload(reconcileBonuses(extPath));
    })
  );

  // Read after the bonus reconcile, which may itself rewrite webview.js, so the
  // needs-patching check sees the reconciled bundle.
  const webviewPath = path.join(extPath, "dist", "webview.js");
  const content = fs.existsSync(webviewPath)
    ? fs.readFileSync(webviewPath, "utf8")
    : "";
  const needsPatching = PATCHES[0].patches.some(
    (p) =>
      !content.includes(p.patched) &&
      (content.includes(p.original) ||
        (p.previous && content.includes(p.previous)))
  );

  if (!needsPatching) {
    notifyBonusReload(startupBonuses);
    return;
  }

  // A Kilo update resets every patched file at once, so the apply prompt and
  // the bonus reload offer would land together, and the bonus "Reload Window"
  // button clicked first reloads a window whose keyboard patches were never
  // applied. Show only the Apply/Ignore prompt now. Apply's completion
  // notification carries the reload, which picks up the bonus changes too; on
  // Ignore or dismissal those changes still need their reload, so the held
  // offer surfaces then.
  const version = extractVersion(extPath);
  vscode.window
    .showInformationMessage(
      `Kilo Code KB Patch: v${version} detected, apply keyboard patches?`,
      "Apply",
      "Ignore"
    )
    .then((choice) => {
      if (choice === "Apply") {
        runPatch("apply").then((offeredReload) => {
          if (!offeredReload) notifyBonusReload(startupBonuses);
        });
      } else {
        notifyBonusReload(startupBonuses);
      }
    });
}

export function deactivate(): void {}

// Exposed for the offline test harness only; the extension host ignores extra
// exports, so this has no effect at runtime.
export const __test = {
  PATCHES,
  computeStatus,
  applyPatches,
  restorePatches,
  showStatusPanel,
  reconcileOpenInTabTitle,
  OPEN_IN_TAB_TITLE_RE,
  OPEN_IN_TAB_ORIGINAL,
  OPEN_IN_TAB_RENAMED,
  reconcileAttachFileButton,
  matchingAttachFileButton,
  ATTACH_FILE_BUTTONS,
  forceSettingOff,
  computeBonusStatus,
  parseKiloVersion,
  compareKiloVersions,
  candidateExtensionRoots,
  KNOWN_EXT_DIRS,
  findLatestKiloExt,
  extractVersion,
};

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as vm from "vm";

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

// src/rules.js states each patch point as a shape over identifier placeholders
// and rebuilds the edit from the symbols it captures, which is how every
// literal in PATCHES above was produced. It is plain JS because the offline
// harness loads the same file, so its surface is declared here rather than
// inferred.
interface DeriveResult {
  original?: string;
  patched?: string;
  symbols?: Record<string, string>;
  matches?: number;
  error?: string;
  legacy?: { original: string; patched: string };
}

interface ShapeRule {
  key: string;
  file: string;
  description: (version: string) => string;
  derive: (content: string) => DeriveResult;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const RULES: ShapeRule[] = require("./rules").RULES;

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
      // --- v7.6.1+ patterns. A pure re-minify, unlike 7.6.0: every patch
      //     point kept its shape, so tools/lib/rules.js needed no change,
      //     and the churn is confined to webview.js. kiloclaw.js did not
      //     move at all (Enter-check Cf, event I, save y, cancel k, send v),
      //     so both of its entries read covered.
      //
      //     Chat scope: Enter-check nf→of, event Ve→Je, send ci→Vo. The
      //     Escape chain moved with it, popup zVe→UVe, ghost Qe→Be, goal
      //     T→L and busy Pt→Nt, with the store t holding. The history scope
      //     moved every local it owns again (selectionStart Gt→jt,
      //     selectionEnd mn→gn, caret Qn→fr, direction Jn→Mr, result Tr→or,
      //     text accessor H→U), and this release the two that had held moved
      //     too, textarea w→k and navigator x→w. Mention: text gt→it, match
      //     Bt→mt, close xe→oe, the "@" offset oe→Pe, the dead slot J→Ve and
      //     the query accessor l→p. Document Escape: event ge→ve, plus the
      //     goal accessor p→m inside the "nothing to abort" test the edit
      //     reproduces but never reads.
      //
      //     The permission scope reverted for a second release running, the
      //     event Z→W this time, with the in-textarea guard oe→ie new.
      //     perm-keys anchors on both, so it needs a fresh entry. perm-escape
      //     reads covered off the v7.5.4+ entry and perm-approve off the
      //     v7.5.8+ one, since W is the spelling both already carry and each
      //     pins every symbol it splices (H=W=>{...O(W,"reject")...} and
      //     if(j(W)){O(W,"once");...}), so this block ships neither. Two
      //     variants of one behavior in the array at once is what the
      //     aliasing sweep forbids.
      //
      //     The cross-scope letter recycling continues. Ve, the event that
      //     named chat-input, chat-escape and chat-history in 7.6.0, is now
      //     the mention scope's dead slot. oe, which in 7.6.0 named both the
      //     mention "@" offset and the permission guard, keeps neither job
      //     (those go to Pe and ie) and lands on the mention close instead.
      //     The chat-history textarea w→k is corroborated by the attach
      //     button, whose own rule derives the same rename, and w itself is
      //     reused one slot over as that scope's history navigator. ---
      {
        feature: "chat-input",
        original: "of(Je)&&!Je.shiftKey&&(Je.preventDefault(),Vo())",
        patched: "of(Je)&&(Je.metaKey||Je.ctrlKey)&&(Je.preventDefault(),Vo())",
        description: "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.6.1+)",
      },
      {
        feature: "chat-escape",
        original:
          'Je.key!=="Escape"?!1:UVe()?!0:!Be.text()&&!L.active()&&!Nt()?!1:(Je.preventDefault(),Je.stopPropagation(),Be.text()?Be.dismiss():L.active()?L.cancel():t.abort(),!0)',
        patched:
          'Je.key!=="Escape"?!1:UVe()?!0:!Be.text()&&!L.active()&&(!Nt()||!Je.shiftKey&&Je.target?.value?.trim())?!1:(Je.preventDefault(),Je.stopPropagation(),Be.text()?Be.dismiss():L.active()?L.cancel():t.abort(),!0)',
        description:
          "Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v7.6.1+)",
      },
      {
        feature: "mention-escape",
        original:
          'let mt=it.substring(0,_t).match(MH);if(!mt){oe();return}let Ct=mt[1]??"";if(Pe=(mt.index??0)+(/^\\s/.test(mt[0])?1:0),n9n(Ct,Ne.get(Pe),nn())){oe();return}if(Ve&&Ve.at===Pe&&Ct.startsWith(Ve.query)){oe();return}Ve=void 0,ge=!1,m(Ct);let It=ye(D);if(!Ct){let bt=z("",It);f(bt),h(Jme(bt,"")),be("");return}$e(),f(bt=>{let At=bt.length?bt:z("",It);return z(Ct,j(r9n(Ct,At)))}),h(Jme(g(),Ct)),be(Ct)},ct=(it,_t,qe,mt)=>{if(!ke()||it.isComposing)return!1;if(it.key==="ArrowDown")return it.preventDefault(),ge=!0,h(Ct=>Math.min(Ct+1,Math.max(g().length-1,0))),!0;if(it.key==="ArrowUp")return it.preventDefault(),ge=!0,h(Ct=>Math.max(Ct-1,0)),!0;if(it.key==="Enter"||it.key==="Tab"){let Ct=g()[A()];if(!Ct)return!1;let It=p()??"";return Ct.type==="file-picker"&&/\\s/.test(It)&&!fKe(It)?!1:(it.preventDefault(),_t&&Oe(Ct,_t,qe,mt),!0)}return it.key==="Escape"?(it.preventDefault(),it.stopPropagation(),oe(),!0):!1}',
        patched:
          'let mt=it.substring(0,_t).match(MH);if(!mt){Ve&&it[Ve.at]!=="@"&&(Ve=void 0),oe();return}let Ct=mt[1]??"";if(Pe=(mt.index??0)+(/^\\s/.test(mt[0])?1:0),n9n(Ct,Ne.get(Pe),nn())){oe();return}if(Ve&&Ve.at===Pe&&Ct.startsWith(Ve.query)){oe();return}Ve=void 0,ge=!1,m(Ct);let It=ye(D);if(!Ct){let bt=z("",It);f(bt),h(Jme(bt,"")),be("");return}$e(),f(bt=>{let At=bt.length?bt:z("",It);return z(Ct,j(r9n(Ct,At)))}),h(Jme(g(),Ct)),be(Ct)},ct=(it,_t,qe,mt)=>{if(!ke()||it.isComposing)return!1;if(it.key==="ArrowDown")return it.preventDefault(),ge=!0,h(Ct=>Math.min(Ct+1,Math.max(g().length-1,0))),!0;if(it.key==="ArrowUp")return it.preventDefault(),ge=!0,h(Ct=>Math.max(Ct-1,0)),!0;if(it.key==="Enter"||it.key==="Tab"){let Ct=g()[A()];if(!Ct)return!1;let It=p()??"";return Ct.type==="file-picker"&&/\\s/.test(It)&&!fKe(It)?!1:(it.preventDefault(),_t&&Oe(Ct,_t,qe,mt),!0)}return it.key==="Escape"?(it.preventDefault(),it.stopPropagation(),Ve={at:Pe,query:p()??""},oe(),!0):!1}',
        description:
          "Mention menu Escape: Escape records the dismissed @ query so typing on keeps the menu closed; retyping the @ reopens it (v7.6.1+)",
      },
      {
        feature: "chat-history",
        original:
          'if((Je.key==="ArrowUp"||Je.key==="ArrowDown")&&!Je.altKey&&!Je.ctrlKey&&!Je.metaKey&&!Je.shiftKey){let jt=k?.selectionStart??0,gn=k?.selectionEnd??0;if(jt!==gn)return;let fr=jt,Mr=Je.key==="ArrowUp"?"up":"down",or=w.navigate(Mr,U(),fr)',
        patched:
          'if((Je.key==="ArrowUp"||Je.key==="ArrowDown")&&(Je.metaKey||Je.ctrlKey)&&!Je.altKey&&!Je.shiftKey){let jt=k?.selectionStart??0,gn=k?.selectionEnd??0;if(jt!==gn)return;let fr=Je.key==="ArrowUp"?0:U().length,Mr=Je.key==="ArrowUp"?"up":"down",or=w.navigate(Mr,U(),fr)',
        description:
          "Chat history: plain Up/Down stay in the textarea, Cmd/Ctrl+Up/Down step through sent messages (v7.6.1+)",
      },
      {
        feature: "perm-keys",
        original: 'W.key==="Enter":J?!0:ie?!1:z(Y)',
        patched:
          'W.key==="Enter":J?!0:ie?W.target?.value?.trim()?(W.key==="Enter"&&!W.metaKey&&!W.ctrlKey||W.key===" "||W.key==="Escape"&&!W.shiftKey&&!W.ctrlKey):!1:z(Y)',
        description:
          "Permission skip-predicate: when textarea has non-whitespace content, skip bare Enter/Space/Escape; works regardless of focus (v7.6.1+)",
      },
      {
        feature: "doc-escape",
        original:
          've.key!=="Escape"||!t.submitting()&&t.status()==="idle"&&!m()?.active||ve.defaultPrevented||(ve.preventDefault(),t.abort())',
        patched:
          've.key!=="Escape"||!t.submitting()&&t.status()==="idle"&&!m()?.active||ve.defaultPrevented||!ve.shiftKey&&ve.target?.value?.trim()||(ve.preventDefault(),t.abort())',
        description:
          "Document Escape: bare Escape does not abort when textarea has non-whitespace content; Shift+Escape aborts (v7.6.1+)",
      },
      // --- v7.6.0+ patterns. 7.5.16 and 7.6.0 are adjacent published
      //     versions, both shipped for all eight targets, so there is no
      //     intervening build to attribute the churn to.
      //
      //     This is the first retarget where a patch point changed *shape*
      //     rather than only its symbols, and both cases come from the same
      //     new feature: the goal composed by `/goal`, which is one more
      //     thing Escape can cancel and one more thing that counts as
      //     running. The chat textarea's two consecutive Escape `if`
      //     statements (dismiss the ghost text, then abort) are folded into
      //     one ternary-chain helper that triages four cases: an open
      //     popup-selector zVe(), then ghost text Qe, then goal mode T, then
      //     the abort. The edit still gates the abort alone, so the shipped
      //     contract is unchanged; it now reads as an alternative to the
      //     helper's own !Pt() bail-out, which returns !1 without consuming
      //     the event exactly as the unmatched `if` used to fall through.
      //     Document-level Escape grew a third conjunct, &&!p()?.active where
      //     p=()=>t.currentSession()?.goal, inside the "nothing to abort"
      //     test the edit reproduces but never reads. tools/lib/rules.js
      //     carries both changes (a two-form chat-escape rule, and a
      //     doc-escape that captures that test as a span), the first tooling
      //     change in seven retargets.
      //
      //     The symbol churn underneath: chat keydown Enter-check Ug→nf and
      //     event dt→Ve with the send Wc→ci, and since that helper is shared
      //     with the permission bare-Enter check j, one rename moved
      //     chat-input while leaving perm-approve covered, as in 7.5.16. The
      //     history scope moved every local it owns (selectionStart Et→Gt,
      //     selectionEnd He→mn, caret xt→Qn, direction Nt→Jn, result mn→Tr,
      //     text accessor N→H) while the textarea w and the navigator x held.
      //     Mention: text pt→gt, close Ie→xe and the "@" offset se→oe, with
      //     the dead slot J, the match Bt and the query accessor l holding.
      //     Document Escape: event we→ge, store t unchanged.
      //
      //     The permission scope reverted wholesale to spellings two and
      //     three releases old: the event W→Z (7.5.6's), the shortcuts branch
      //     Z→K (7.5.6's) and the in-textarea guard se→oe (7.5.8's), with
      //     only the document handler V→U being new. The dialog branch J, the
      //     interactive-element helper z, the element argument Y, the
      //     bare-Enter check j, the dispatch O and the element-level reject H
      //     all held. perm-keys anchors on both the event and the guard so it
      //     needs a fresh entry, while perm-escape and perm-approve both read
      //     covered off the v7.5.6+ entries, the release this scope reverted
      //     to, and each of those anchors pins every symbol it splices
      //     (H=Z=>{...O(Z,"reject")...} and if(j(Z)){O(Z,"once");...}), so
      //     this block ships neither. Adding them would put two variants of
      //     one behavior in the array at once, which is what the aliasing
      //     sweep forbids.
      //
      //     The wholesale cross-scope letter collision holds for a fourth
      //     generation: template NSa's chain (Ve, Gt, mn, Qn, Jn, Tr) names
      //     the container, wrapper, ghost-wrapper, highlight-overlay,
      //     textarea and hint row, and in that same order the chat-history
      //     handler's event, selectionStart, selectionEnd, caret, direction
      //     and result. kiloclaw.js re-minified for the first time since
      //     7.5.4: Enter-check kf→Cf and edit event T→I, which makes both of
      //     its scopes name their event I, while save y, cancel k and send v
      //     held. ---
      {
        feature: "chat-input",
        original: "nf(Ve)&&!Ve.shiftKey&&(Ve.preventDefault(),ci())",
        patched: "nf(Ve)&&(Ve.metaKey||Ve.ctrlKey)&&(Ve.preventDefault(),ci())",
        description: "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.6.0+)",
      },
      {
        feature: "chat-escape",
        original:
          'Ve.key!=="Escape"?!1:zVe()?!0:!Qe.text()&&!T.active()&&!Pt()?!1:(Ve.preventDefault(),Ve.stopPropagation(),Qe.text()?Qe.dismiss():T.active()?T.cancel():t.abort(),!0)',
        patched:
          'Ve.key!=="Escape"?!1:zVe()?!0:!Qe.text()&&!T.active()&&(!Pt()||!Ve.shiftKey&&Ve.target?.value?.trim())?!1:(Ve.preventDefault(),Ve.stopPropagation(),Qe.text()?Qe.dismiss():T.active()?T.cancel():t.abort(),!0)',
        description:
          "Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v7.6.0+)",
      },
      {
        feature: "mention-escape",
        original:
          'let Bt=gt.substring(0,wt).match(Vme);if(!Bt){xe();return}let Pt=Bt[1]??"";if(oe=(Bt.index??0)+(/^\\s/.test(Bt[0])?1:0),U7n(Pt,ue.get(oe),Pe())){xe();return}if(J&&J.at===oe&&Pt.startsWith(J.query)){xe();return}J=void 0,le=!1,d(Pt);let It=Ye(w);if(!Pt){let We=S("",It);p(We),g(Kme(We,"")),he("");return}de(),p(We=>{let St=We.length?We:S("",It);return S(Pt,T(V7n(Pt,St)))}),g(Kme(u(),Pt)),he(Pt)},Qe=(gt,wt,De,Bt)=>{if(!ce()||gt.isComposing)return!1;if(gt.key==="ArrowDown")return gt.preventDefault(),le=!0,g(Pt=>Math.min(Pt+1,Math.max(u().length-1,0))),!0;if(gt.key==="ArrowUp")return gt.preventDefault(),le=!0,g(Pt=>Math.max(Pt-1,0)),!0;if(gt.key==="Enter"||gt.key==="Tab"){let Pt=u()[m()];if(!Pt)return!1;let It=l()??"";return Pt.type==="file-picker"&&/\\s/.test(It)&&!lKe(It)?!1:(gt.preventDefault(),wt&&ie(Pt,wt,De,Bt),!0)}return gt.key==="Escape"?(gt.preventDefault(),gt.stopPropagation(),xe(),!0):!1}',
        patched:
          'let Bt=gt.substring(0,wt).match(Vme);if(!Bt){J&&gt[J.at]!=="@"&&(J=void 0),xe();return}let Pt=Bt[1]??"";if(oe=(Bt.index??0)+(/^\\s/.test(Bt[0])?1:0),U7n(Pt,ue.get(oe),Pe())){xe();return}if(J&&J.at===oe&&Pt.startsWith(J.query)){xe();return}J=void 0,le=!1,d(Pt);let It=Ye(w);if(!Pt){let We=S("",It);p(We),g(Kme(We,"")),he("");return}de(),p(We=>{let St=We.length?We:S("",It);return S(Pt,T(V7n(Pt,St)))}),g(Kme(u(),Pt)),he(Pt)},Qe=(gt,wt,De,Bt)=>{if(!ce()||gt.isComposing)return!1;if(gt.key==="ArrowDown")return gt.preventDefault(),le=!0,g(Pt=>Math.min(Pt+1,Math.max(u().length-1,0))),!0;if(gt.key==="ArrowUp")return gt.preventDefault(),le=!0,g(Pt=>Math.max(Pt-1,0)),!0;if(gt.key==="Enter"||gt.key==="Tab"){let Pt=u()[m()];if(!Pt)return!1;let It=l()??"";return Pt.type==="file-picker"&&/\\s/.test(It)&&!lKe(It)?!1:(gt.preventDefault(),wt&&ie(Pt,wt,De,Bt),!0)}return gt.key==="Escape"?(gt.preventDefault(),gt.stopPropagation(),J={at:oe,query:l()??""},xe(),!0):!1}',
        description:
          "Mention menu Escape: Escape records the dismissed @ query so typing on keeps the menu closed; retyping the @ reopens it (v7.6.0+)",
      },
      {
        feature: "chat-history",
        original:
          'if((Ve.key==="ArrowUp"||Ve.key==="ArrowDown")&&!Ve.altKey&&!Ve.ctrlKey&&!Ve.metaKey&&!Ve.shiftKey){let Gt=w?.selectionStart??0,mn=w?.selectionEnd??0;if(Gt!==mn)return;let Qn=Gt,Jn=Ve.key==="ArrowUp"?"up":"down",Tr=x.navigate(Jn,H(),Qn)',
        patched:
          'if((Ve.key==="ArrowUp"||Ve.key==="ArrowDown")&&(Ve.metaKey||Ve.ctrlKey)&&!Ve.altKey&&!Ve.shiftKey){let Gt=w?.selectionStart??0,mn=w?.selectionEnd??0;if(Gt!==mn)return;let Qn=Ve.key==="ArrowUp"?0:H().length,Jn=Ve.key==="ArrowUp"?"up":"down",Tr=x.navigate(Jn,H(),Qn)',
        description:
          "Chat history: plain Up/Down stay in the textarea, Cmd/Ctrl+Up/Down step through sent messages (v7.6.0+)",
      },
      {
        feature: "perm-keys",
        original: 'Z.key==="Enter":J?!0:oe?!1:z(Y)',
        patched:
          'Z.key==="Enter":J?!0:oe?Z.target?.value?.trim()?(Z.key==="Enter"&&!Z.metaKey&&!Z.ctrlKey||Z.key===" "||Z.key==="Escape"&&!Z.shiftKey&&!Z.ctrlKey):!1:z(Y)',
        description:
          "Permission skip-predicate: when textarea has non-whitespace content, skip bare Enter/Space/Escape; works regardless of focus (v7.6.0+)",
      },
      {
        feature: "doc-escape",
        original:
          'ge.key!=="Escape"||!t.submitting()&&t.status()==="idle"&&!p()?.active||ge.defaultPrevented||(ge.preventDefault(),t.abort())',
        patched:
          'ge.key!=="Escape"||!t.submitting()&&t.status()==="idle"&&!p()?.active||ge.defaultPrevented||!ge.shiftKey&&ge.target?.value?.trim()||(ge.preventDefault(),t.abort())',
        description:
          "Document Escape: bare Escape does not abort when textarea has non-whitespace content; Shift+Escape aborts (v7.6.0+)",
      },
      // --- v7.5.16+ patterns. The re-minify landed in 7.5.16 itself, with
      //     no intervening build to attribute it to: 7.5.15 derives every
      //     rule covered off the v7.5.11+ block, so 7.5.11 through 7.5.15 is
      //     one pattern generation and 1.21.x/1.22.x were correct across all
      //     of it. 7.5.15 and 7.5.16 are adjacent published versions, both
      //     shipped for all eight targets, so unlike the 7.5.11 range there
      //     is no gap to reason about.
      //
      //     Chat keydown: Enter-check jg→Ug and event ut→dt, while the send
      //     Wc and the chat Escape guard vn both held. In the history scope
      //     only the caret Ct→xt and the direction $t→Nt moved, with the
      //     textarea w, the navigator x, the text accessor N, the
      //     selectionStart Et and the selectionEnd He all holding.
      //     Document-level Escape: event Ce→we, store t unchanged.
      //     kiloclaw.js changed bytes again yet both of its patch sites still
      //     match the v7.5.4 patterns.
      //
      //     The permission scope moved exactly two letters, as narrow as
      //     7.5.11's, and both are locals of the skip-predicate itself: the
      //     in-textarea guard oe→se and the dialog branch X→J, giving the
      //     tail Z?W.key==="Enter":J?!0:se?!1:z(Y). Everything else held,
      //     namely the shortcuts branch Z, the event W, the
      //     interactive-element helper z, the element argument Y, the
      //     bare-Enter check j, the dispatch O, the element-level reject H
      //     and the document handler V. perm-keys anchors on both moved
      //     letters, so it needs a fresh entry; perm-escape reads covered off
      //     the v7.5.4+ entry and perm-approve off the v7.5.8+ one, the same
      //     pair 7.5.11 rode, and both of those anchors pin every symbol they
      //     splice, so this block ships neither. Adding them would put two
      //     variants of one behavior in the array at once, which is what the
      //     aliasing sweep forbids and what applyPatches would otherwise
      //     resolve silently by array order.
      //
      //     J is a revival with a changed role rather than a fresh spelling:
      //     it named this scope's element argument on 7.5.0, z(J), and now
      //     names its dialog branch. se is new to the guard, whose spelling
      //     has walked te→ce→ie→oe→se since 7.5.0. Ug is the Enter-check
      //     helper shared with the chat keydown, so a single rename moved
      //     chat-input and the bare-Enter check j together; perm-approve
      //     anchors on j rather than on the helper, which is exactly why it
      //     stayed covered. The six elements of template sIa (dt, Et, He, xt,
      //     Nt, mn) are once again, in that same order, the chat-history
      //     handler's event, selectionStart, selectionEnd, caret, direction
      //     and result, so the wholesale cross-scope letter collision first
      //     seen on 7.5.8 now holds for a third generation. ---
      {
        feature: "chat-input",
        original: "Ug(dt)&&!dt.shiftKey&&(dt.preventDefault(),Wc())",
        patched: "Ug(dt)&&(dt.metaKey||dt.ctrlKey)&&(dt.preventDefault(),Wc())",
        description:
          "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.5.16+)",
      },
      {
        feature: "chat-escape",
        original:
          'if(dt.key==="Escape"&&vn()){dt.preventDefault(),dt.stopPropagation(),t.abort();return}',
        patched:
          'if(dt.key==="Escape"&&vn()&&(dt.shiftKey||!dt.target?.value?.trim())){dt.preventDefault(),dt.stopPropagation(),t.abort();return}',
        description:
          "Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v7.5.16+)",
      },
      // The @-mention menu's Escape, added in kb-patch 1.24.0 for a Kilo
      // regression that dates from 7.5.11 (Kilo-Org/kilocode#13961). The
      // anchor runs from the mention controller's onInput trigger test
      // through its onKeyDown Escape branch: that span binds the dead-query
      // slot J, the "@" offset se, the text pt, the close Ie and the query
      // accessor l, every symbol the two edits reference (see rules.js).
      {
        feature: "mention-escape",
        original:
          'let Bt=pt.substring(0,yt).match(Fme);if(!Bt){Ie();return}let Mt=Bt[1]??"";if(se=(Bt.index??0)+(/^\\s/.test(Bt[0])?1:0),u7n(Mt,pe.get(se),Re())){Ie();return}if(J&&J.at===se&&Mt.startsWith(J.query)){Ie();return}J=void 0,ue=!1,d(Mt);let It=We(w);if(!Mt){let Ye=I("",It);p(Ye),g(Rme(Ye,"")),ve("");return}de(),p(Ye=>{let Ft=Ye.length?Ye:I("",It);return I(Mt,D(p7n(Mt,Ft)))}),g(Rme(u(),Mt)),ve(Mt)},Ge=(pt,yt,De,Bt)=>{if(!le()||pt.isComposing)return!1;if(pt.key==="ArrowDown")return pt.preventDefault(),ue=!0,g(Mt=>Math.min(Mt+1,Math.max(u().length-1,0))),!0;if(pt.key==="ArrowUp")return pt.preventDefault(),ue=!0,g(Mt=>Math.max(Mt-1,0)),!0;if(pt.key==="Enter"||pt.key==="Tab"){let Mt=u()[m()];if(!Mt)return!1;let It=l()??"";return Mt.type==="file-picker"&&/\\s/.test(It)&&!jVe(It)?!1:(pt.preventDefault(),yt&&ce(Mt,yt,De,Bt),!0)}return pt.key==="Escape"?(pt.preventDefault(),pt.stopPropagation(),Ie(),!0):!1}',
        patched:
          'let Bt=pt.substring(0,yt).match(Fme);if(!Bt){J&&pt[J.at]!=="@"&&(J=void 0),Ie();return}let Mt=Bt[1]??"";if(se=(Bt.index??0)+(/^\\s/.test(Bt[0])?1:0),u7n(Mt,pe.get(se),Re())){Ie();return}if(J&&J.at===se&&Mt.startsWith(J.query)){Ie();return}J=void 0,ue=!1,d(Mt);let It=We(w);if(!Mt){let Ye=I("",It);p(Ye),g(Rme(Ye,"")),ve("");return}de(),p(Ye=>{let Ft=Ye.length?Ye:I("",It);return I(Mt,D(p7n(Mt,Ft)))}),g(Rme(u(),Mt)),ve(Mt)},Ge=(pt,yt,De,Bt)=>{if(!le()||pt.isComposing)return!1;if(pt.key==="ArrowDown")return pt.preventDefault(),ue=!0,g(Mt=>Math.min(Mt+1,Math.max(u().length-1,0))),!0;if(pt.key==="ArrowUp")return pt.preventDefault(),ue=!0,g(Mt=>Math.max(Mt-1,0)),!0;if(pt.key==="Enter"||pt.key==="Tab"){let Mt=u()[m()];if(!Mt)return!1;let It=l()??"";return Mt.type==="file-picker"&&/\\s/.test(It)&&!jVe(It)?!1:(pt.preventDefault(),yt&&ce(Mt,yt,De,Bt),!0)}return pt.key==="Escape"?(pt.preventDefault(),pt.stopPropagation(),J={at:se,query:l()??""},Ie(),!0):!1}',
        description:
          "Mention menu Escape: Escape records the dismissed @ query so typing on keeps the menu closed; retyping the @ reopens it (v7.5.16+)",
      },
      {
        feature: "chat-history",
        original:
          'if((dt.key==="ArrowUp"||dt.key==="ArrowDown")&&!dt.altKey&&!dt.ctrlKey&&!dt.metaKey&&!dt.shiftKey){let Et=w?.selectionStart??0,He=w?.selectionEnd??0;if(Et!==He)return;let xt=Et,Nt=dt.key==="ArrowUp"?"up":"down",mn=x.navigate(Nt,N(),xt)',
        patched:
          'if((dt.key==="ArrowUp"||dt.key==="ArrowDown")&&(dt.metaKey||dt.ctrlKey)&&!dt.altKey&&!dt.shiftKey){let Et=w?.selectionStart??0,He=w?.selectionEnd??0;if(Et!==He)return;let xt=dt.key==="ArrowUp"?0:N().length,Nt=dt.key==="ArrowUp"?"up":"down",mn=x.navigate(Nt,N(),xt)',
        description:
          "Chat history: plain Up/Down stay in the textarea, Cmd/Ctrl+Up/Down step through sent messages (v7.5.16+)",
      },
      {
        feature: "perm-keys",
        original: 'W.key==="Enter":J?!0:se?!1:z(Y)',
        patched:
          'W.key==="Enter":J?!0:se?W.target?.value?.trim()?(W.key==="Enter"&&!W.metaKey&&!W.ctrlKey||W.key===" "||W.key==="Escape"&&!W.shiftKey&&!W.ctrlKey):!1:z(Y)',
        description:
          "Permission skip-predicate: when textarea has non-whitespace content, skip bare Enter/Space/Escape; works regardless of focus (v7.5.16+)",
      },
      {
        feature: "doc-escape",
        original:
          'we.key!=="Escape"||!t.submitting()&&t.status()==="idle"||we.defaultPrevented||(we.preventDefault(),t.abort())',
        patched:
          'we.key!=="Escape"||!t.submitting()&&t.status()==="idle"||we.defaultPrevented||!we.shiftKey&&we.target?.value?.trim()||(we.preventDefault(),t.abort())',
        description:
          "Document Escape: bare Escape does not abort when textarea has non-whitespace content; Shift+Escape aborts (v7.5.16+)",
      },
      // --- v7.5.11+ patterns. The re-minify landed in 7.5.11, three releases
      //     before the 7.5.14 this retarget was asked for. Every build in
      //     that range derives byte-identical patterns at every site: 7.5.11,
      //     7.5.12 and 7.5.13/7.5.14 ship three distinct webview.js bundles,
      //     but the differences all fall outside the patch sites, and 7.5.13
      //     and 7.5.14 are byte-identical in both bundles. So this block is
      //     labelled from the build that actually moved, the way v7.5.8+
      //     covers 7.5.9 and v7.5.4+ covers 7.5.5, and it follows that 1.20.x
      //     was already degraded from 7.5.11 on rather than only on 7.5.14.
      //     The two gaps in that range are not oversights: 7.5.10 was never
      //     published, and 7.5.13 was published only for the linux and alpine
      //     targets, so darwin and win32 users went from 7.5.12 straight to
      //     7.5.14.
      //
      //     kiloclaw.js changed bytes for the first time since 7.5.6, yet
      //     both of its patch sites still match the v7.5.4 patterns. Chat
      //     keydown: Enter-check VA→jg, event mt→ut, send gs→Wc, chat Escape
      //     guard cn→vn, and in the history scope the text accessor F→N with
      //     all five of its locals renamed (on→Et, Qt→He, We→Ct, yt→$t,
      //     Ht→mn), while the textarea w and the navigator x held.
      //     Document-level Escape: event Ee→Ce, store t unchanged.
      //
      //     The permission scope moved only two letters, and neither is one
      //     that perm-escape or perm-approve reference: the shortcuts branch
      //     went K→Z and the dialog branch ee→X, so the tail now reads
      //     Z?W.key==="Enter":X?!0:oe?!1:z(Y). Everything else there held,
      //     namely the event W, the in-textarea guard oe, the
      //     interactive-element helper z, the element argument Y, the
      //     bare-Enter check j, the dispatch O and the element-level reject
      //     H. perm-keys anchors on the dialog branch, so it needs a fresh
      //     entry; perm-escape reads covered off the v7.5.4+ entry and
      //     perm-approve off the v7.5.8+ one, and both of those anchors pin
      //     every symbol they splice, so this block ships neither. Adding
      //     them would put two variants of one behavior in the array at once,
      //     which is what the aliasing sweep forbids and what applyPatches
      //     would otherwise resolve silently by array order.
      //
      //     Both moved letters are revivals rather than fresh spellings: Z
      //     was 7.5.6's event and X was 7.5.6's dialog branch, so this
      //     permission scope is another mix of earlier releases rather than a
      //     churn. The Enter-check helper jg is still shared between the chat
      //     keydown and the permission bare-Enter check. Derived from the
      //     7.5.14 vsix and cross-checked against 7.5.12 and 7.5.11, all
      //     three of which emit an identical block. ---
      {
        feature: "chat-input",
        original: "jg(ut)&&!ut.shiftKey&&(ut.preventDefault(),Wc())",
        patched: "jg(ut)&&(ut.metaKey||ut.ctrlKey)&&(ut.preventDefault(),Wc())",
        description:
          "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.5.11+)",
      },
      {
        feature: "chat-escape",
        original:
          'if(ut.key==="Escape"&&vn()){ut.preventDefault(),ut.stopPropagation(),t.abort();return}',
        patched:
          'if(ut.key==="Escape"&&vn()&&(ut.shiftKey||!ut.target?.value?.trim())){ut.preventDefault(),ut.stopPropagation(),t.abort();return}',
        description:
          "Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v7.5.11+)",
      },
      // The @-mention menu's Escape, added in kb-patch 1.24.0 (see the
      // v7.5.16+ entry). This scope is the one place where 7.5.11 and 7.5.12
      // differ: the anchor sweeps up two helper spellings the edit never
      // references (K7n/W7n on 7.5.11, W7n/Z7n on 7.5.12 through 7.5.15), so
      // 7.5.11 carries its own entry while 7.5.12, 7.5.14 and 7.5.15 share
      // one. The dead-query slot X, the "@" offset oe, the close Ie and the
      // query accessor l are the same on all four builds.
      {
        feature: "mention-escape",
        original:
          'let Bt=pt.substring(0,yt).match(_me);if(!Bt){Ie();return}let Mt=Bt[1]??"";if(oe=(Bt.index??0)+(/^\\s/.test(Bt[0])?1:0),W7n(Mt,pe.get(oe),Qe())){Ie();return}if(X&&X.at===oe&&Mt.startsWith(X.query)){Ie();return}X=void 0,de=!1,d(Mt);let It=Ve(w);if(!Mt){let Ze=I("",It);p(Ze),g(Eme(Ze,"")),we("");return}le(),p(Ze=>{let Ft=Ze.length?Ze:I("",It);return I(Mt,D(Z7n(Mt,Ft)))}),g(Eme(u(),Mt)),we(Mt)},Ge=(pt,yt,De,Bt)=>{if(!ce()||pt.isComposing)return!1;if(pt.key==="ArrowDown")return pt.preventDefault(),de=!0,g(Mt=>Math.min(Mt+1,Math.max(u().length-1,0))),!0;if(pt.key==="ArrowUp")return pt.preventDefault(),de=!0,g(Mt=>Math.max(Mt-1,0)),!0;if(pt.key==="Enter"||pt.key==="Tab"){let Mt=u()[m()];if(!Mt)return!1;let It=l()??"";return Mt.type==="file-picker"&&/\\s/.test(It)&&!DVe(It)?!1:(pt.preventDefault(),yt&&se(Mt,yt,De,Bt),!0)}return pt.key==="Escape"?(pt.preventDefault(),pt.stopPropagation(),Ie(),!0):!1}',
        patched:
          'let Bt=pt.substring(0,yt).match(_me);if(!Bt){X&&pt[X.at]!=="@"&&(X=void 0),Ie();return}let Mt=Bt[1]??"";if(oe=(Bt.index??0)+(/^\\s/.test(Bt[0])?1:0),W7n(Mt,pe.get(oe),Qe())){Ie();return}if(X&&X.at===oe&&Mt.startsWith(X.query)){Ie();return}X=void 0,de=!1,d(Mt);let It=Ve(w);if(!Mt){let Ze=I("",It);p(Ze),g(Eme(Ze,"")),we("");return}le(),p(Ze=>{let Ft=Ze.length?Ze:I("",It);return I(Mt,D(Z7n(Mt,Ft)))}),g(Eme(u(),Mt)),we(Mt)},Ge=(pt,yt,De,Bt)=>{if(!ce()||pt.isComposing)return!1;if(pt.key==="ArrowDown")return pt.preventDefault(),de=!0,g(Mt=>Math.min(Mt+1,Math.max(u().length-1,0))),!0;if(pt.key==="ArrowUp")return pt.preventDefault(),de=!0,g(Mt=>Math.max(Mt-1,0)),!0;if(pt.key==="Enter"||pt.key==="Tab"){let Mt=u()[m()];if(!Mt)return!1;let It=l()??"";return Mt.type==="file-picker"&&/\\s/.test(It)&&!DVe(It)?!1:(pt.preventDefault(),yt&&se(Mt,yt,De,Bt),!0)}return pt.key==="Escape"?(pt.preventDefault(),pt.stopPropagation(),X={at:oe,query:l()??""},Ie(),!0):!1}',
        description:
          "Mention menu Escape: Escape records the dismissed @ query so typing on keeps the menu closed; retyping the @ reopens it (v7.5.12+)",
      },
      {
        feature: "mention-escape",
        original:
          'let Bt=pt.substring(0,yt).match(_me);if(!Bt){Ie();return}let Mt=Bt[1]??"";if(oe=(Bt.index??0)+(/^\\s/.test(Bt[0])?1:0),K7n(Mt,pe.get(oe),Qe())){Ie();return}if(X&&X.at===oe&&Mt.startsWith(X.query)){Ie();return}X=void 0,de=!1,d(Mt);let It=Ve(w);if(!Mt){let Ze=I("",It);p(Ze),g(Eme(Ze,"")),we("");return}le(),p(Ze=>{let Ft=Ze.length?Ze:I("",It);return I(Mt,D(W7n(Mt,Ft)))}),g(Eme(u(),Mt)),we(Mt)},Ge=(pt,yt,De,Bt)=>{if(!ce()||pt.isComposing)return!1;if(pt.key==="ArrowDown")return pt.preventDefault(),de=!0,g(Mt=>Math.min(Mt+1,Math.max(u().length-1,0))),!0;if(pt.key==="ArrowUp")return pt.preventDefault(),de=!0,g(Mt=>Math.max(Mt-1,0)),!0;if(pt.key==="Enter"||pt.key==="Tab"){let Mt=u()[m()];if(!Mt)return!1;let It=l()??"";return Mt.type==="file-picker"&&/\\s/.test(It)&&!DVe(It)?!1:(pt.preventDefault(),yt&&se(Mt,yt,De,Bt),!0)}return pt.key==="Escape"?(pt.preventDefault(),pt.stopPropagation(),Ie(),!0):!1}',
        patched:
          'let Bt=pt.substring(0,yt).match(_me);if(!Bt){X&&pt[X.at]!=="@"&&(X=void 0),Ie();return}let Mt=Bt[1]??"";if(oe=(Bt.index??0)+(/^\\s/.test(Bt[0])?1:0),K7n(Mt,pe.get(oe),Qe())){Ie();return}if(X&&X.at===oe&&Mt.startsWith(X.query)){Ie();return}X=void 0,de=!1,d(Mt);let It=Ve(w);if(!Mt){let Ze=I("",It);p(Ze),g(Eme(Ze,"")),we("");return}le(),p(Ze=>{let Ft=Ze.length?Ze:I("",It);return I(Mt,D(W7n(Mt,Ft)))}),g(Eme(u(),Mt)),we(Mt)},Ge=(pt,yt,De,Bt)=>{if(!ce()||pt.isComposing)return!1;if(pt.key==="ArrowDown")return pt.preventDefault(),de=!0,g(Mt=>Math.min(Mt+1,Math.max(u().length-1,0))),!0;if(pt.key==="ArrowUp")return pt.preventDefault(),de=!0,g(Mt=>Math.max(Mt-1,0)),!0;if(pt.key==="Enter"||pt.key==="Tab"){let Mt=u()[m()];if(!Mt)return!1;let It=l()??"";return Mt.type==="file-picker"&&/\\s/.test(It)&&!DVe(It)?!1:(pt.preventDefault(),yt&&se(Mt,yt,De,Bt),!0)}return pt.key==="Escape"?(pt.preventDefault(),pt.stopPropagation(),X={at:oe,query:l()??""},Ie(),!0):!1}',
        description:
          "Mention menu Escape: Escape records the dismissed @ query so typing on keeps the menu closed; retyping the @ reopens it (v7.5.11+)",
      },
      {
        feature: "chat-history",
        original:
          'if((ut.key==="ArrowUp"||ut.key==="ArrowDown")&&!ut.altKey&&!ut.ctrlKey&&!ut.metaKey&&!ut.shiftKey){let Et=w?.selectionStart??0,He=w?.selectionEnd??0;if(Et!==He)return;let Ct=Et,$t=ut.key==="ArrowUp"?"up":"down",mn=x.navigate($t,N(),Ct)',
        patched:
          'if((ut.key==="ArrowUp"||ut.key==="ArrowDown")&&(ut.metaKey||ut.ctrlKey)&&!ut.altKey&&!ut.shiftKey){let Et=w?.selectionStart??0,He=w?.selectionEnd??0;if(Et!==He)return;let Ct=ut.key==="ArrowUp"?0:N().length,$t=ut.key==="ArrowUp"?"up":"down",mn=x.navigate($t,N(),Ct)',
        description:
          "Chat history: plain Up/Down stay in the textarea, Cmd/Ctrl+Up/Down step through sent messages (v7.5.11+)",
      },
      {
        feature: "perm-keys",
        original: 'W.key==="Enter":X?!0:oe?!1:z(Y)',
        patched:
          'W.key==="Enter":X?!0:oe?W.target?.value?.trim()?(W.key==="Enter"&&!W.metaKey&&!W.ctrlKey||W.key===" "||W.key==="Escape"&&!W.shiftKey&&!W.ctrlKey):!1:z(Y)',
        description:
          "Permission skip-predicate: when textarea has non-whitespace content, skip bare Enter/Space/Escape; works regardless of focus (v7.5.11+)",
      },
      {
        feature: "doc-escape",
        original:
          'Ce.key!=="Escape"||!t.submitting()&&t.status()==="idle"||Ce.defaultPrevented||(Ce.preventDefault(),t.abort())',
        patched:
          'Ce.key!=="Escape"||!t.submitting()&&t.status()==="idle"||Ce.defaultPrevented||!Ce.shiftKey&&Ce.target?.value?.trim()||(Ce.preventDefault(),t.abort())',
        description:
          "Document Escape: bare Escape does not abort when textarea has non-whitespace content; Shift+Escape aborts (v7.5.11+)",
      },
      // --- v7.5.8+ patterns. The re-minify landed in 7.5.8, not in 7.5.9:
      //     the two releases ship byte-identical bundles (all 1004 dist/
      //     entries match, and the vsixes differ only in
      //     extension/package.json), so 7.5.9 is a version-only republish and
      //     these patterns are labelled from the earlier build, the way the
      //     v7.5.4+ block covers 7.5.5. It follows that 1.19.x was already
      //     partially degraded on 7.5.8 rather than only on 7.5.9.
      //
      //     Every webview keyboard scope moved, while kiloclaw.js has been
      //     byte-identical since 7.5.6 and both of its entries still match
      //     the v7.5.4 patterns. Chat keydown: Enter-check RA→VA, event
      //     lt→mt, send We→gs, chat Escape guard He→cn, and in the history
      //     scope the text accessor T→F with all five of its locals renamed
      //     (Oe→on, Yt→Qt, Vn→We, Tn→yt, gr→Ht), while the textarea w and
      //     the navigator x held. Document-level Escape: event ee→Ee, store t
      //     unchanged, so the v7.3.50-54 entry that served 7.5.6 by revival
      //     no longer applies and this behavior needs a fresh pattern again.
      //
      //     The permission scope is where this release earns its lesson. Its
      //     event reverted Z→W, which is 7.5.4's spelling, and the
      //     element-level reject handler H and the dispatch O both held, so
      //     all three symbols perm-escape's splice references line up with
      //     the v7.5.4+ entry and that entry reads covered here. This block
      //     therefore ships no perm-escape entry, for the same reason 7.5.6
      //     shipped no doc-escape one: two variants of one behavior matching
      //     at once is what the aliasing sweep forbids, and applyPatches
      //     would resolve it silently by array order. Reviving that entry is
      //     safe because its anchor pins every symbol it splices (H, W and O
      //     all appear in it). perm-keys and perm-approve still need new
      //     entries despite sharing the event letter: the dialog branch went
      //     X→ee, the in-textarea guard ie→oe, and the bare-Enter check kept
      //     7.5.6's j rather than reverting to 7.5.4's q, so this permission
      //     scope is a genuinely new mix of two earlier releases' spellings
      //     rather than a revert. The interactive-element helper z and the
      //     element argument Y held. The Enter-check helper VA is still
      //     shared between the chat keydown and the permission bare-Enter
      //     check. Re-derived from the 7.5.9 vsix and cross-checked against
      //     the 7.5.8 one. ---
      {
        feature: "chat-input",
        original: "VA(mt)&&!mt.shiftKey&&(mt.preventDefault(),gs())",
        patched: "VA(mt)&&(mt.metaKey||mt.ctrlKey)&&(mt.preventDefault(),gs())",
        description: "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.5.8+)",
      },
      {
        feature: "chat-escape",
        original:
          'if(mt.key==="Escape"&&cn()){mt.preventDefault(),mt.stopPropagation(),t.abort();return}',
        patched:
          'if(mt.key==="Escape"&&cn()&&(mt.shiftKey||!mt.target?.value?.trim())){mt.preventDefault(),mt.stopPropagation(),t.abort();return}',
        description:
          "Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v7.5.8+)",
      },
      // chat-history, new in 1.19.1 and back-derived for every build down to
      // 7.4.17 (each version block below carries its own variant, so a user on
      // an older Kilo gets it too; nothing older than 7.4.17 was available to
      // derive from, and the status view reports the row as missing there).
      //
      // Kilo routes both arrow keys through its prompt-history navigator, gated
      // by a caret test of its own: an Up only recalls when the caret already
      // sits at offset 0, a Down when it sits at the end. That is what makes a
      // held Up walk to the top of a multi-line draft and then, still
      // repeating, replace it with the previous message. The edit puts the
      // whole behavior behind Cmd/Ctrl and hands the gate the boundary for the
      // direction travelled (0 for up, the draft's length for down) instead of
      // the real caret, so the chord recalls from anywhere in the draft while a
      // bare arrow is caret movement and nothing else. Kilo's own selection
      // guard is left alone: with a range selected the chord falls through to
      // the platform's caret gesture rather than discarding the selection.
      //
      // Nothing is lost by recalling: Kilo stashes the draft on the way out and
      // returns it when you step forward past the newest message. Shift and Alt
      // combinations stay untouched, so native selection and word gestures
      // still work.
      //
      // The anchor stops at the navigate() call because that is where the text
      // accessor is bound and the splice references it; a shorter one would
      // leave a symbol unpinned. `npm run behavior` runs this patch against
      // Kilo's real navigator, which is the only check that can see the caret
      // gate still reading its argument the way this edit assumes.
      {
        feature: "chat-history",
        original:
          'if((mt.key==="ArrowUp"||mt.key==="ArrowDown")&&!mt.altKey&&!mt.ctrlKey&&!mt.metaKey&&!mt.shiftKey){let on=w?.selectionStart??0,Qt=w?.selectionEnd??0;if(on!==Qt)return;let We=on,yt=mt.key==="ArrowUp"?"up":"down",Ht=x.navigate(yt,F(),We)',
        patched:
          'if((mt.key==="ArrowUp"||mt.key==="ArrowDown")&&(mt.metaKey||mt.ctrlKey)&&!mt.altKey&&!mt.shiftKey){let on=w?.selectionStart??0,Qt=w?.selectionEnd??0;if(on!==Qt)return;let We=mt.key==="ArrowUp"?0:F().length,yt=mt.key==="ArrowUp"?"up":"down",Ht=x.navigate(yt,F(),We)',
        description:
          "Chat history: plain Up/Down stay in the textarea, Cmd/Ctrl+Up/Down step through sent messages (v7.5.8+)",
      },
      {
        feature: "perm-keys",
        original: 'W.key==="Enter":ee?!0:oe?!1:z(Y)',
        patched:
          'W.key==="Enter":ee?!0:oe?W.target?.value?.trim()?(W.key==="Enter"&&!W.metaKey&&!W.ctrlKey||W.key===" "||W.key==="Escape"&&!W.shiftKey&&!W.ctrlKey):!1:z(Y)',
        description:
          "Permission skip-predicate: when textarea has non-whitespace content, skip bare Enter/Space/Escape; works regardless of focus (v7.5.8+)",
      },
      {
        feature: "perm-approve",
        original: 'if(j(W)){O(W,"once");return}}};',
        patched:
          'if(j(W)||W.key===" "&&!W.metaKey&&!W.ctrlKey&&!W.target?.value?.trim()||W.key==="Enter"&&(W.metaKey||W.ctrlKey)){O(W,"once");return}}};',
        description:
          "Permission approve: Cmd/Ctrl+Enter approves always; Space approves when empty/whitespace-only (v7.5.8+)",
      },
      {
        feature: "doc-escape",
        original:
          'Ee.key!=="Escape"||!t.submitting()&&t.status()==="idle"||Ee.defaultPrevented||(Ee.preventDefault(),t.abort())',
        patched:
          'Ee.key!=="Escape"||!t.submitting()&&t.status()==="idle"||Ee.defaultPrevented||!Ee.shiftKey&&Ee.target?.value?.trim()||(Ee.preventDefault(),t.abort())',
        description:
          "Document Escape: bare Escape does not abort when textarea has non-whitespace content; Shift+Escape aborts (v7.5.8+)",
      },
      // --- v7.5.6+ patterns. 7.5.6 re-minified every webview keyboard scope
      //     again, but only five of the six behaviors needed a new pattern.
      //     Chat keydown: Enter-check FA→RA, event Oe→lt, send on→We (chat
      //     Escape guard He unchanged). The document-level Escape moved too,
      //     and this is where the non-monotonic churn noted for the attach
      //     button turns up in a keyboard scope: its event went te→ee, and ee
      //     is the spelling the v7.3.50-54 block at the bottom of this array
      //     already carries, so doc-escape ships no 7.5.6 entry and matches
      //     that five-month-old pattern instead. Reviving an old pattern is
      //     safe here for the same reason a new one is: that anchor pins
      //     every symbol its splice references (the event ee and the store t,
      //     via !t.submitting()&&t.status()==="idle"), so it cannot match a
      //     build that binds them differently. Adding a duplicate 7.5.6 entry
      //     would instead make two variants match at once, which is the one
      //     thing the aliasing sweep forbids. Permission scope: the
      //     skip-predicate and the bare-Enter check traded letters outright
      //     (j→q and q→j), the event took the shortcuts-branch letter (W→Z,
      //     shortcuts now K), the in-textarea guard went ce→ie, and the
      //     document handler took the event's old letter (V→W), while the
      //     dispatch O, element-level reject handler H, element argument Y,
      //     dialog branch X, interactive-element helper z, decide N, element
      //     extractor Q, and focusPrompt F all held. Only the event moving is
      //     why perm-escape and perm-approve needed new entries despite their
      //     own handlers keeping their names. The Enter-check helper RA is
      //     still shared between the chat keydown and the permission
      //     bare-Enter check. kiloclaw.js changed bytes in this release but
      //     not at either patch site, so both its entries still match the
      //     v7.5.4 patterns. v7.5.5 needed nothing at all: every shipped
      //     pattern still matched it. Re-derived from the 7.5.6 vsix. ---
      {
        feature: "chat-input",
        original: "RA(lt)&&!lt.shiftKey&&(lt.preventDefault(),We())",
        patched: "RA(lt)&&(lt.metaKey||lt.ctrlKey)&&(lt.preventDefault(),We())",
        description: "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.5.6+)",
      },
      {
        feature: "chat-escape",
        original:
          'if(lt.key==="Escape"&&He()){lt.preventDefault(),lt.stopPropagation(),t.abort();return}',
        patched:
          'if(lt.key==="Escape"&&He()&&(lt.shiftKey||!lt.target?.value?.trim())){lt.preventDefault(),lt.stopPropagation(),t.abort();return}',
        description:
          "Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v7.5.6+)",
      },
      {
        feature: "chat-history",
        original:
          'if((lt.key==="ArrowUp"||lt.key==="ArrowDown")&&!lt.altKey&&!lt.ctrlKey&&!lt.metaKey&&!lt.shiftKey){let Oe=w?.selectionStart??0,Yt=w?.selectionEnd??0;if(Oe!==Yt)return;let Vn=Oe,Tn=lt.key==="ArrowUp"?"up":"down",gr=x.navigate(Tn,T(),Vn)',
        patched:
          'if((lt.key==="ArrowUp"||lt.key==="ArrowDown")&&(lt.metaKey||lt.ctrlKey)&&!lt.altKey&&!lt.shiftKey){let Oe=w?.selectionStart??0,Yt=w?.selectionEnd??0;if(Oe!==Yt)return;let Vn=lt.key==="ArrowUp"?0:T().length,Tn=lt.key==="ArrowUp"?"up":"down",gr=x.navigate(Tn,T(),Vn)',
        description:
          "Chat history: plain Up/Down stay in the textarea, Cmd/Ctrl+Up/Down step through sent messages (v7.5.6+)",
      },
      {
        feature: "perm-keys",
        original: 'Z.key==="Enter":X?!0:ie?!1:z(Y)',
        patched:
          'Z.key==="Enter":X?!0:ie?Z.target?.value?.trim()?(Z.key==="Enter"&&!Z.metaKey&&!Z.ctrlKey||Z.key===" "||Z.key==="Escape"&&!Z.shiftKey&&!Z.ctrlKey):!1:z(Y)',
        description:
          "Permission skip-predicate: when textarea has non-whitespace content, skip bare Enter/Space/Escape; works regardless of focus (v7.5.6+)",
      },
      {
        feature: "perm-escape",
        original: 'H=Z=>{if(Z.key==="Escape"){O(Z,"reject");return}}',
        patched:
          'H=Z=>{if(Z.key==="Escape"&&(Z.shiftKey||!Z.target?.value?.trim())){O(Z,"reject");return}}',
        description:
          "Permission reject: bare Escape rejects only when textarea empty/whitespace-only; Shift+Escape always rejects (v7.5.6+)",
      },
      {
        feature: "perm-approve",
        original: 'if(j(Z)){O(Z,"once");return}}};',
        patched:
          'if(j(Z)||Z.key===" "&&!Z.metaKey&&!Z.ctrlKey&&!Z.target?.value?.trim()||Z.key==="Enter"&&(Z.metaKey||Z.ctrlKey)){O(Z,"once");return}}};',
        description:
          "Permission approve: Cmd/Ctrl+Enter approves always; Space approves when empty/whitespace-only (v7.5.6+)",
      },
      // --- v7.5.4+ patterns. 7.5.4 re-minified every webview keyboard scope,
      //     and kiloclaw.js for the first time since 7.4.21 (see that file's
      //     block). Chat keydown: Enter-check yg→FA, event Te→Oe, send an→on;
      //     chat Escape guard We→He. Document-level Escape: event Y→te (store
      //     t unchanged); te was 7.5.0's permission in-textarea guard, so
      //     minified names keep crossing scopes between releases. The
      //     permission scope rotated three letters in a cycle rather than
      //     trading two: the skip-predicate went O→j, the bare-Enter check
      //     j→q, and the dispatch q→O, each role taking the next letter of
      //     the same three. The event went U→W (W was the shortcuts branch,
      //     which is now Z), the in-textarea guard te→ce, the element
      //     argument J→Y (reviving 7.4.23's spelling), and the decide
      //     function $→N, while the interactive-element helper z, the
      //     element-level reject handler H, and the document handler V held.
      //     Every anchor pins each symbol its splice references, which is
      //     what keeps a rotation like this from matching an entry with stale
      //     bindings. The Enter-check helper FA is still shared between the
      //     chat keydown and the permission bare-Enter check. Re-derived from
      //     the 7.5.4 vsix. ---
      {
        feature: "chat-input",
        original: "FA(Oe)&&!Oe.shiftKey&&(Oe.preventDefault(),on())",
        patched: "FA(Oe)&&(Oe.metaKey||Oe.ctrlKey)&&(Oe.preventDefault(),on())",
        description: "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.5.4+)",
      },
      {
        feature: "chat-escape",
        original:
          'if(Oe.key==="Escape"&&He()){Oe.preventDefault(),Oe.stopPropagation(),t.abort();return}',
        patched:
          'if(Oe.key==="Escape"&&He()&&(Oe.shiftKey||!Oe.target?.value?.trim())){Oe.preventDefault(),Oe.stopPropagation(),t.abort();return}',
        description:
          "Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v7.5.4+)",
      },
      {
        feature: "chat-history",
        original:
          'if((Oe.key==="ArrowUp"||Oe.key==="ArrowDown")&&!Oe.altKey&&!Oe.ctrlKey&&!Oe.metaKey&&!Oe.shiftKey){let _t=w?.selectionStart??0,ze=w?.selectionEnd??0;if(_t!==ze)return;let gn=_t,We=Oe.key==="ArrowUp"?"up":"down",mn=x.navigate(We,T(),gn)',
        patched:
          'if((Oe.key==="ArrowUp"||Oe.key==="ArrowDown")&&(Oe.metaKey||Oe.ctrlKey)&&!Oe.altKey&&!Oe.shiftKey){let _t=w?.selectionStart??0,ze=w?.selectionEnd??0;if(_t!==ze)return;let gn=Oe.key==="ArrowUp"?0:T().length,We=Oe.key==="ArrowUp"?"up":"down",mn=x.navigate(We,T(),gn)',
        description:
          "Chat history: plain Up/Down stay in the textarea, Cmd/Ctrl+Up/Down step through sent messages (v7.5.4+)",
      },
      {
        feature: "perm-keys",
        original: 'W.key==="Enter":X?!0:ce?!1:z(Y)',
        patched:
          'W.key==="Enter":X?!0:ce?W.target?.value?.trim()?(W.key==="Enter"&&!W.metaKey&&!W.ctrlKey||W.key===" "||W.key==="Escape"&&!W.shiftKey&&!W.ctrlKey):!1:z(Y)',
        description:
          "Permission skip-predicate: when textarea has non-whitespace content, skip bare Enter/Space/Escape; works regardless of focus (v7.5.4+)",
      },
      {
        feature: "perm-escape",
        original: 'H=W=>{if(W.key==="Escape"){O(W,"reject");return}}',
        patched:
          'H=W=>{if(W.key==="Escape"&&(W.shiftKey||!W.target?.value?.trim())){O(W,"reject");return}}',
        description:
          "Permission reject: bare Escape rejects only when textarea empty/whitespace-only; Shift+Escape always rejects (v7.5.4+)",
      },
      {
        feature: "perm-approve",
        original: 'if(q(W)){O(W,"once");return}}};',
        patched:
          'if(q(W)||W.key===" "&&!W.metaKey&&!W.ctrlKey&&!W.target?.value?.trim()||W.key==="Enter"&&(W.metaKey||W.ctrlKey)){O(W,"once");return}}};',
        description:
          "Permission approve: Cmd/Ctrl+Enter approves always; Space approves when empty/whitespace-only (v7.5.4+)",
      },
      {
        feature: "doc-escape",
        original:
          'te.key!=="Escape"||!t.submitting()&&t.status()==="idle"||te.defaultPrevented||(te.preventDefault(),t.abort())',
        patched:
          'te.key!=="Escape"||!t.submitting()&&t.status()==="idle"||te.defaultPrevented||!te.shiftKey&&te.target?.value?.trim()||(te.preventDefault(),t.abort())',
        description:
          "Document Escape: bare Escape does not abort when textarea has non-whitespace content; Shift+Escape aborts (v7.5.4+)",
      },
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
        feature: "chat-history",
        original:
          'if((Te.key==="ArrowUp"||Te.key==="ArrowDown")&&!Te.altKey&&!Te.ctrlKey&&!Te.metaKey&&!Te.shiftKey){let kt=w?.selectionStart??0,Le=w?.selectionEnd??0;if(kt!==Le)return;let bn=kt,je=Te.key==="ArrowUp"?"up":"down",fn=x.navigate(je,M(),bn)',
        patched:
          'if((Te.key==="ArrowUp"||Te.key==="ArrowDown")&&(Te.metaKey||Te.ctrlKey)&&!Te.altKey&&!Te.shiftKey){let kt=w?.selectionStart??0,Le=w?.selectionEnd??0;if(kt!==Le)return;let bn=Te.key==="ArrowUp"?0:M().length,je=Te.key==="ArrowUp"?"up":"down",fn=x.navigate(je,M(),bn)',
        description:
          "Chat history: plain Up/Down stay in the textarea, Cmd/Ctrl+Up/Down step through sent messages (v7.5.0+)",
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
        description:
          "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.4.23+)",
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
        feature: "chat-history",
        original:
          'if((Te.key==="ArrowUp"||Te.key==="ArrowDown")&&!Te.altKey&&!Te.ctrlKey&&!Te.metaKey&&!Te.shiftKey){let xt=w?.selectionStart??0,Le=w?.selectionEnd??0;if(xt!==Le)return;let mn=xt,je=Te.key==="ArrowUp"?"up":"down",ln=C.navigate(je,T(),mn)',
        patched:
          'if((Te.key==="ArrowUp"||Te.key==="ArrowDown")&&(Te.metaKey||Te.ctrlKey)&&!Te.altKey&&!Te.shiftKey){let xt=w?.selectionStart??0,Le=w?.selectionEnd??0;if(xt!==Le)return;let mn=Te.key==="ArrowUp"?0:T().length,je=Te.key==="ArrowUp"?"up":"down",ln=C.navigate(je,T(),mn)',
        description:
          "Chat history: plain Up/Down stay in the textarea, Cmd/Ctrl+Up/Down step through sent messages (v7.4.23+)",
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
        description:
          "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.4.22+)",
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
        feature: "chat-history",
        original:
          'if((De.key==="ArrowUp"||De.key==="ArrowDown")&&!De.altKey&&!De.ctrlKey&&!De.metaKey&&!De.shiftKey){let pt=w?.selectionStart??0,Vt=w?.selectionEnd??0;if(pt!==Vt)return;let Le=pt,nn=De.key==="ArrowUp"?"up":"down",Ze=C.navigate(nn,T(),Le)',
        patched:
          'if((De.key==="ArrowUp"||De.key==="ArrowDown")&&(De.metaKey||De.ctrlKey)&&!De.altKey&&!De.shiftKey){let pt=w?.selectionStart??0,Vt=w?.selectionEnd??0;if(pt!==Vt)return;let Le=De.key==="ArrowUp"?0:T().length,nn=De.key==="ArrowUp"?"up":"down",Ze=C.navigate(nn,T(),Le)',
        description:
          "Chat history: plain Up/Down stay in the textarea, Cmd/Ctrl+Up/Down step through sent messages (v7.4.22+)",
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
        description:
          "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.4.21+)",
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
        feature: "chat-history",
        original:
          'if((Me.key==="ArrowUp"||Me.key==="ArrowDown")&&!Me.altKey&&!Me.ctrlKey&&!Me.metaKey&&!Me.shiftKey){let pt=w?.selectionStart??0,Vt=w?.selectionEnd??0;if(pt!==Vt)return;let Le=pt,nn=Me.key==="ArrowUp"?"up":"down",Ze=C.navigate(nn,T(),Le)',
        patched:
          'if((Me.key==="ArrowUp"||Me.key==="ArrowDown")&&(Me.metaKey||Me.ctrlKey)&&!Me.altKey&&!Me.shiftKey){let pt=w?.selectionStart??0,Vt=w?.selectionEnd??0;if(pt!==Vt)return;let Le=Me.key==="ArrowUp"?0:T().length,nn=Me.key==="ArrowUp"?"up":"down",Ze=C.navigate(nn,T(),Le)',
        description:
          "Chat history: plain Up/Down stay in the textarea, Cmd/Ctrl+Up/Down step through sent messages (v7.4.21+)",
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
      //     z(G,...) (bare-Enter check $ unchanged). Note the names rotated rather
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
        description:
          "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.4.20+)",
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
        feature: "chat-history",
        original:
          'if((Le.key==="ArrowUp"||Le.key==="ArrowDown")&&!Le.altKey&&!Le.ctrlKey&&!Le.metaKey&&!Le.shiftKey){let mt=w?.selectionStart??0,Wt=w?.selectionEnd??0;if(mt!==Wt)return;let Fe=mt,an=Le.key==="ArrowUp"?"up":"down",Je=x.navigate(an,T(),Fe)',
        patched:
          'if((Le.key==="ArrowUp"||Le.key==="ArrowDown")&&(Le.metaKey||Le.ctrlKey)&&!Le.altKey&&!Le.shiftKey){let mt=w?.selectionStart??0,Wt=w?.selectionEnd??0;if(mt!==Wt)return;let Fe=Le.key==="ArrowUp"?0:T().length,an=Le.key==="ArrowUp"?"up":"down",Je=x.navigate(an,T(),Fe)',
        description:
          "Chat history: plain Up/Down stay in the textarea, Cmd/Ctrl+Up/Down step through sent messages (v7.4.20+)",
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
      //     both now call O(q,...) (bare-Enter check $ unchanged). The document-level
      //     Escape handler kept event oe, so it still matches the v7.4.13+ block
      //     below and needs no new pattern. kiloclaw.js re-minified its Enter-check
      //     helper NA→$A (see that file's block). Re-derived from the 7.4.17
      //     bundle. ---
      {
        feature: "chat-input",
        original: "ng($e)&&!$e.shiftKey&&($e.preventDefault(),aa())",
        previous: "ng($e)&&$e.metaKey&&($e.preventDefault(),aa())",
        patched: "ng($e)&&($e.metaKey||$e.ctrlKey)&&($e.preventDefault(),aa())",
        description:
          "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.4.17+)",
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
        feature: "chat-history",
        original:
          'if(($e.key==="ArrowUp"||$e.key==="ArrowDown")&&!$e.altKey&&!$e.ctrlKey&&!$e.metaKey&&!$e.shiftKey){let gt=k?.selectionStart??0,yt=k?.selectionEnd??0;if(gt!==yt)return;let Bt=gt,Lt=$e.key==="ArrowUp"?"up":"down",jt=C.navigate(Lt,M(),Bt)',
        patched:
          'if(($e.key==="ArrowUp"||$e.key==="ArrowDown")&&($e.metaKey||$e.ctrlKey)&&!$e.altKey&&!$e.shiftKey){let gt=k?.selectionStart??0,yt=k?.selectionEnd??0;if(gt!==yt)return;let Bt=$e.key==="ArrowUp"?0:M().length,Lt=$e.key==="ArrowUp"?"up":"down",jt=C.navigate(Lt,M(),Bt)',
        description:
          "Chat history: plain Up/Down stay in the textarea, Cmd/Ctrl+Up/Down step through sent messages (v7.4.17+)",
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
        description:
          "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.4.16+)",
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
        description:
          "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.4.13+)",
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
        original: "Vm($e)&&!$e.shiftKey&&($e.preventDefault(),da())",
        previous: "Vm($e)&&$e.metaKey&&($e.preventDefault(),da())",
        patched: "Vm($e)&&($e.metaKey||$e.ctrlKey)&&($e.preventDefault(),da())",
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
        original: "Om(Ge)&&!Ge.shiftKey&&(Ge.preventDefault(),Ea())",
        previous: "Om(Ge)&&Ge.metaKey&&(Ge.preventDefault(),Ea())",
        patched: "Om(Ge)&&(Ge.metaKey||Ge.ctrlKey)&&(Ge.preventDefault(),Ea())",
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
        original: "$m(Ne)&&!Ne.shiftKey&&(Ne.preventDefault(),Oa())",
        previous: "$m(Ne)&&Ne.metaKey&&(Ne.preventDefault(),Oa())",
        patched: "$m(Ne)&&(Ne.metaKey||Ne.ctrlKey)&&(Ne.preventDefault(),Oa())",
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
        original: 'j=q=>{if(q.key==="Escape"){$(q,"reject");return}}',
        patched:
          'j=q=>{if(q.key==="Escape"&&(q.shiftKey||!q.target?.value?.trim())){$(q,"reject");return}}',
        description:
          "Permission j: bare Escape rejects only when textarea empty/whitespace-only; Shift+Escape always rejects (v7.3.63+)",
      },
      {
        feature: "perm-approve",
        original: 'if(z(q)){$(q,"once");return}}};',
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
        original: "Fm(je)&&!je.shiftKey&&(je.preventDefault(),Ce())",
        previous: "Fm(je)&&je.metaKey&&(je.preventDefault(),Ce())",
        patched: "Fm(je)&&(je.metaKey||je.ctrlKey)&&(je.preventDefault(),Ce())",
        description:
          "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.3.50-54)",
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
        original: 'P=z=>{if(z.key==="Escape"){N(z,"reject");return}}',
        previous:
          'P=z=>{if(z.key==="Escape"&&(z.shiftKey||!z.target?.value)){N(z,"reject");return}}',
        patched:
          'P=z=>{if(z.key==="Escape"&&(z.shiftKey||!z.target?.value?.trim())){N(z,"reject");return}}',
        description:
          "Permission P: bare Escape rejects only when textarea empty/whitespace-only; Shift+Escape always rejects (v7.3.50-54)",
      },
      {
        feature: "perm-approve",
        original: 'if(M(z)){N(z,"once");return}}};',
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
  },
];

// A single logical behavior can have several minified variants (one per Kilo
// version). Collapse them so the status view shows each behavior once, using a
// version-agnostic label, rather than one line per per-version variant.
const FEATURE_ORDER = [
  "chat-input",
  "chat-escape",
  "mention-escape",
  "chat-history",
  "chat-scroll",
  "hover-guard",
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
  "mention-escape": "Mention menu Escape: stays closed while you keep typing",
  "chat-history": "Chat history: Cmd/Ctrl+Up/Down, not bare Up/Down",
  "chat-scroll": "Chat scroll: history stays at the bottom while you type",
  "hover-guard":
    "Hover guard: the hidden cursor highlights nothing while you type",
  "perm-keys": "Permission prompt: typing keys stay in the input",
  "perm-escape": "Permission Escape: rejects only when the input is empty",
  "perm-approve": "Permission approve: Cmd/Ctrl+Enter always, Space when empty",
  "doc-escape": "Document Escape: non-empty input is not aborted",
  "kiloclaw-edit": "KiloClaw edit: Cmd/Ctrl+Enter saves",
  "kiloclaw-chat": "KiloClaw chat: Cmd/Ctrl+Enter sends",
};

// The @-mention trigger Kilo has shipped since 7.5.11, which lets a query run
// across spaces (Kilo-Org/kilocode#13592). A regex literal survives
// minification, so it doubles as the fingerprint of the behavior the
// mention-escape feature answers.
const MENTION_SPACED_TRIGGER = "/(?:^|\\s)@(?![^\\n]*\\s@)([^\\n]*)$/";

// A feature that fixes something Kilo only does from a certain release on is
// not "missing" on the builds before it: there is nothing there to patch. A
// gate says whether a build has the Kilo behavior the feature answers, keyed
// on text the minifier cannot rename, and a feature with no gate is wanted on
// every build. The status view reports a gated-out feature as "unneeded",
// which draws neutrally and stays out of the verdict.
const FEATURE_GATES: Partial<Record<FeatureKey, (content: string) => boolean>> =
  {
    "mention-escape": (content) => content.includes(MENTION_SPACED_TRIGGER),
  };

// "patched": the patched text is present. "unpatched": the original text is
// present (Apply will fix it). "missing": no known variant of this feature was
// found, so its minified symbols changed for this Kilo version and the pattern
// needs re-targeting. "missing" is what the status view must surface rather than
// dropping the row, so an out-of-date pattern is visible instead of silent.
// "unneeded": the feature's gate says this build predates the Kilo behavior it
// fixes, so no variant is expected to match.
type FeatureState = "patched" | "unpatched" | "missing" | "unneeded";
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

// What the running session needs before a change on disk shows. Kilo's webview
// bundle and stylesheet are fetched afresh when its sidebar view is rebuilt,
// and an extension-host restart does that: the view is torn down with the host
// and re-resolved once Kilo registers it again, and the webview's resource
// cache revalidates by mtime and size, so a rewritten file is not served stale.
// Its manifest is not re-read: the workbench keeps the description it scanned
// at window startup, and a host restart re-adds extensions from that same
// in-memory copy. So the editor-title bonus needs the window and everything
// else the lighter restart, which leaves editors, terminals and the layout in
// place. (A chat opened with "Open in Tab" is a webview panel, which a host
// restart neither closes nor rebuilds; it shows the new bundle when reopened.)
type RestartScope = "extensions" | "window";

// "Restart Extensions" is the label VS Code puts on its own restart button.
const RESTART_OFFERS: Record<
  RestartScope,
  { verb: string; label: string; command: string }
> = {
  extensions: {
    verb: "Restart extensions",
    label: "Restart Extensions",
    command: "workbench.action.restartExtensionHost",
  },
  window: {
    verb: "Reload window",
    label: "Reload Window",
    command: "workbench.action.reloadWindow",
  },
};

// One notification with the one button that applies `scope`. The message ends
// with the instruction, so callers pass the sentence before it.
function offerRestart(message: string, scope: RestartScope): void {
  const offer = RESTART_OFFERS[scope];
  vscode.window
    .showInformationMessage(`${message} ${offer.verb} to apply.`, offer.label)
    .then((choice) => {
      if (choice === offer.label) {
        vscode.commands.executeCommand(offer.command);
      }
    });
}

// Bonus (opt-in) items are reported in their own status section and never feed
// the verdict. "on": enabled and applied. "off": not enabled, drawn as a neutral
// white circle. "pending": enabled but the file does not reflect it yet.
// "unavailable": enabled but this Kilo build has no matching code. `needs` is
// the restart that shows a change to the item's file; the pending hint names it.
type BonusState = "on" | "off" | "pending" | "unavailable";
interface BonusStatus {
  label: string;
  state: BonusState;
  needs: RestartScope;
}

// Collapse a file's per-version patch variants into one state per logical
// feature, and list every feature the file is meant to cover (not just the ones
// whose text happens to be present). A feature with a matching patched/original
// variant is "patched"/"unpatched"; a feature whose every variant is absent is
// "missing" so the status view can show it rather than omitting the row.
function statusForFile(
  content: string,
  patches: PatchDef[],
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
    state:
      byFeature.get(k) ??
      (FEATURE_GATES[k]?.(content) === false ? "unneeded" : "missing"),
  }));
}

// Rows in FEATURE_ORDER, whichever derivation they came from.
function inFeatureOrder<T extends { label: string }>(rows: T[]): T[] {
  const rank = new Map<string, number>(
    FEATURE_ORDER.map((key, i) => [FEATURE_LABELS[key], i]),
  );
  return [...rows].sort(
    (a, b) => (rank.get(a.label) ?? 0) - (rank.get(b.label) ?? 0),
  );
}

function computeVerdict(files: FileStatus[]): Verdict {
  // A feature this build has no need of neither counts for nor against it.
  const states = files
    .filter((f) => f.found)
    .flatMap((f) => f.features.map((ft) => ft.state))
    .filter((s) => s !== "unneeded");

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

// `version` brings in the derivations recorded for this build, without which a
// feature patched by one would read as "missing" here while working fine.
function computeStatus(distDir: string): {
  files: FileStatus[];
  verdict: Verdict;
} {
  // One record covers every file, and it lives in the bundle, so it is read
  // once here rather than per file.
  const record = readDerivedRecordAt(distDir);
  const files: FileStatus[] = [];
  for (const fp of PATCHES) {
    const fpath = path.join(distDir, fp.filename);
    if (!fs.existsSync(fpath)) {
      files.push({ filename: fp.filename, found: false, features: [] });
      continue;
    }
    const content = fs.readFileSync(fpath, "utf8");
    // A core block has no PatchDef: it is derived from the build at reconcile
    // time, so its row comes from that same derivation, and it takes its place
    // in FEATURE_ORDER among the file's splices.
    const derived = recordedFor(record, fp.filename, content).map(asPatchDef);
    const features = statusForFile(content, [...derived, ...fp.patches]);
    if (fp.filename === CHAT_SCRIPT_FILE) {
      features.push(...chatScriptCoreStatus(content));
    }
    files.push({
      filename: fp.filename,
      found: true,
      features: inFeatureOrder(features),
    });
  }
  const cssPath = path.join(distDir, CHAT_STYLE_FILE);
  files.push(
    fs.existsSync(cssPath)
      ? {
          filename: CHAT_STYLE_FILE,
          found: true,
          features: chatCssCoreStatus(fs.readFileSync(cssPath, "utf8")),
        }
      : { filename: CHAT_STYLE_FILE, found: false, features: [] },
  );
  return { files, verdict: computeVerdict(files) };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// The page itself, as one string. Built apart from the panel that shows it, so
// the same markup serves a page being opened and a page being redrawn.
function statusHtml(
  version: string,
  verdict: Verdict,
  files: FileStatus[],
  bonuses: BonusStatus[],
): string {
  const verdictClass =
    verdict === "fully patched"
      ? "ok"
      : verdict === "not patched" || verdict === "version not recognized"
        ? "bad"
        : "warn";

  // Each feature state gets a distinct mark, color, and hint so an unpatched or
  // stale-pattern row reads differently from a patched one at a glance.
  const marks: Record<
    FeatureState,
    { mark: string; cls: string; hint: string }
  > = {
    patched: { mark: "✓", cls: "ok", hint: "" },
    unpatched: { mark: "○", cls: "warn", hint: "not applied — run Apply" },
    missing: {
      mark: "✗",
      cls: "bad",
      hint: "no matching code — patch needs update",
    },
    unneeded: {
      mark: "○",
      cls: "off",
      hint: "not needed on this Kilo Code build",
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
              ft.label,
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
  const bonusMarks: Record<
    BonusState,
    { mark: string; cls: string; hint: string }
  > = {
    on: { mark: "✓", cls: "ok", hint: "" },
    off: { mark: "○", cls: "off", hint: "" },
    // The pending hint names the restart the row needs, so it is built below.
    pending: { mark: "○", cls: "warn", hint: "" },
    unavailable: {
      mark: "✗",
      cls: "bad",
      hint: "no matching code — patch needs update",
    },
  };
  const bonusRows = bonuses
    .map((b) => {
      const m = bonusMarks[b.state];
      const text =
        b.state === "pending"
          ? `${RESTART_OFFERS[b.needs].verb.toLowerCase()} to apply`
          : m.hint;
      const hint = text ? `<span class="hint">${escapeHtml(text)}</span>` : "";
      return `<div class="row"><span class="mark ${
        m.cls
      }">${m.mark}</span><span class="label">${escapeHtml(
        b.label,
      )}</span>${hint}</div>`;
    })
    .join("");
  const bonusSection = bonusRows
    ? `<section><h2>Bonus <span class="sub">(opt-in, does not affect status)</span></h2>${bonusRows}</section>`
    : "";

  return `<!DOCTYPE html>
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

// The view type given to createWebviewPanel. A tab reports it back through
// TabInputWebview.viewType with the workbench's own "mainThreadWebview-" prefix
// in front of it, so the tab matching below accepts either spelling.
const STATUS_VIEW_TYPE = "kiloCodeKbPatchStatus";

// The one status page this window has open, if any. Held so a second Show
// Status redraws that page instead of stacking another tab beside it, and so
// anything that moves the state the page reports can redraw it in place.
let statusPanel: vscode.WebviewPanel | undefined;

// The native modal dialog has a fixed, narrow width that wraps long rows, so the
// status view uses a webview panel where the width is under our control and each
// feature stays on one line.
function showStatusPanel(
  version: string,
  verdict: Verdict,
  files: FileStatus[],
  bonuses: BonusStatus[],
  show: { column: vscode.ViewColumn; preserveFocus: boolean } = {
    column: vscode.ViewColumn.Active,
    preserveFocus: false,
  },
): void {
  const html = statusHtml(version, verdict, files, bonuses);
  if (statusPanel) {
    statusPanel.webview.html = html;
    statusPanel.reveal(statusPanel.viewColumn, show.preserveFocus);
    return;
  }
  const panel = vscode.window.createWebviewPanel(
    STATUS_VIEW_TYPE,
    "Kilo Code KB Patch",
    { viewColumn: show.column, preserveFocus: show.preserveFocus },
    { enableScripts: false },
  );
  statusPanel = panel;
  panel.onDidDispose(() => {
    if (statusPanel === panel) statusPanel = undefined;
  });
  // The files move without us asking too: a Kilo update resets them, an Apply
  // in another window rewrites them. Redrawing whenever the page comes back
  // into view costs one pass over the bundle, and keeps a page the user tabs
  // back to from reporting whatever happened to be true when it was drawn.
  panel.onDidChangeViewState((e) => {
    if (e.webviewPanel.visible) refreshStatusPanel();
  });
  panel.webview.html = html;
}

// Redraw the open status page from what is on disk now. A no-op when no page is
// open, so callers can say this after anything that rewrites a patched file
// without first checking whether anyone is looking.
function refreshStatusPanel(): void {
  if (!statusPanel) return;
  const extPath = findLatestKiloExt();
  if (!extPath) return;
  const { files, verdict } = computeStatus(path.join(extPath, "dist"));
  statusPanel.webview.html = statusHtml(
    extractVersion(extPath),
    verdict,
    files,
    computeBonusStatus(extPath),
  );
}

// Whether a tab is one of our status pages, in either spelling of the view type
// (see STATUS_VIEW_TYPE).
function isStatusTab(tab: vscode.Tab): boolean {
  const input = tab.input;
  return (
    input instanceof vscode.TabInputWebview &&
    (input.viewType === STATUS_VIEW_TYPE ||
      input.viewType.endsWith(`-${STATUS_VIEW_TYPE}`))
  );
}

// An extension-host restart leaves the status page on screen and takes our
// handle to it: the workbench keeps the webview and the HTML it last rendered,
// and re-resolves only a panel it restored itself, never one an extension
// created. So the page sits there reporting the state from before the restart,
// which is the state the restart was meant to change.
//
// Nothing else leaves a status tab behind. No serializer is registered for the
// view type, which is what tells the workbench the tab cannot be persisted, so
// a window reload drops it instead of restoring it. A status tab present at
// activation therefore belongs to the previous host, and is replaced here by
// one drawn from the state on disk now.
function replaceStaleStatusPanel(): void {
  const stale = vscode.window.tabGroups.all.flatMap((g) =>
    g.tabs.filter(isStatusTab),
  );
  if (stale.length === 0) return;
  const extPath = findLatestKiloExt();
  if (extPath) {
    const { files, verdict } = computeStatus(path.join(extPath, "dist"));
    // Drawn before the old tabs close, and without taking focus. A status tab
    // sitting alone in a split group takes the group with it when it closes,
    // and the column named here would be gone by the time the replacement
    // asked for it.
    showStatusPanel(
      extractVersion(extPath),
      verdict,
      files,
      computeBonusStatus(extPath),
      { column: stale[0].group.viewColumn, preserveFocus: true },
    );
  }
  void vscode.window.tabGroups.close(stale, true);
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
      compareKiloVersions(parseKiloVersion(a), parseKiloVersion(b)),
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

// --- Bonus: attach-file "+" button ------------------------------------------
// Adds a "+" button to the prompt input's action toolbar
// (.prompt-input-hint-actions) that opens Kilo's file picker directly, instead
// of the type-"@" then "Browse files..." mention flow. It is injected just
// before the indexing (database) button so it lands at the left edge of the icon
// cluster.
//
// The button reuses Kilo's own tooltip, ghost button, and sprite-icon
// components. The caption has its own history: the original 7.4.11-era recon
// found a localized "prompt.action.attachFile" key ("Attach file", defined
// per locale but otherwise unused) and every variant reused it via u.t().
// Kilo has since dropped the key. It is absent from every build re-checked
// (7.4.17 through 7.5.4, whole-vsix searches), and the webview's t() falls
// back to String(key) for a missing key, so those tooltips silently rendered
// the raw key string. As of 1.18.0 the 7.4.17+ variants caption with a
// literal English "Attach file" instead, matching Kilo's own current practice
// of hardcoding this row's label in English, and each carries its former u.t
// form in previous[] so an existing install recaptions in place. Entries
// below 7.4.17 keep the u.t call: the key plausibly still existed there, and
// no vsix was pulled to check. onClick reaches four in-scope
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
// One release's form of an opt-in webview.js edit. Both bonuses that splice
// that bundle (the attach button and the math extensions) are lists of these,
// newest first, and share one reconciler below.
interface WebviewVariant {
  original: string;
  patched: string;
  // Earlier patched forms of this same variant, newest first. Applying
  // original→patched on top of an older form would leave the old edit in place
  // and inject a second one (the attach button's patched string even ends with
  // its own original, so it would not be recognised as patched at all).
  // Listing the old forms lets an upgrade rewrite the existing edit instead.
  previous?: string[];
}

type AttachButtonDef = WebviewVariant;

const ATTACH_FILE_BUTTONS: AttachButtonDef[] = [
  // v7.6.1: container ws→dc, tooltip Bn→In, ghost Rt→Lt, icon Vo→Wo,
  // controller h→b, textarea w→k, setter U→W, sync Dr→ta and when-pred
  // It→ot. Insert P, create B, when-wrapper me, indexing accessor a and the
  // glyph "plus" all held. Kilo's own mention-menu row,
  // b.selectMention(uc,k,W,ta), still occurs exactly once and pins all four
  // closure locals the injected button calls, and the textarea k is
  // corroborated by the chat-history rule, which derives the same rename.
  // The caption stays the literal "Attach file": prompt.action.attachFile
  // still scores 0 across the bundle, as it has since 7.4.17.
  {
    original:
      "P(dc,B(me,{get when(){return ot()},get children(){return B(In,{get value(){return a.status().message||a.label()}",
    patched:
      'P(dc,B(In,{get value(){return "Attach file"},placement:"top",get children(){return B(Lt,{variant:"ghost",size:"small",onClick:()=>{if(!k)return;k.focus();let _v=k.value,_s=k.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");b.selectMention({type:"file-picker"},k,W,ta)},get"aria-label"(){return "Attach file"},get children(){return B(Wo,{name:"plus",size:"small"})}})}}),null),P(dc,B(me,{get when(){return ot()},get children(){return B(In,{get value(){return a.status().message||a.label()}',
  },
  // v7.6.0: container fr→ws, insert P held, create B held, tooltip Ln→Bn,
  // ghost Qt→Rt, icon Go→Vo, when-wrapper me held, when-pred cn→It, setter
  // Q→U, sync ln→Dr, indexing accessor a held, glyph "plus" held. Kilo's own
  // mention-menu row, h.selectMention(ns,w,U,Dr), occurs exactly once and
  // pins all four closure locals the injected button calls; each is
  // corroborated separately too. w=Jn is the textarea.prompt-input node from
  // template NSa, whose chain reads Ve→Gt→mn→Qn/Jn→Tr→Ki→ws for the
  // container, wrapper, ghost-wrapper, highlight-overlay, textarea, hint row
  // and the prompt-input-hint-actions toolbar the button joins; U is the
  // setter from [H,U]=ke(""); Dr is the auto-resize. The caption stays the
  // literal "Attach file": prompt.action.attachFile scores 0 across the whole
  // 7.6.0 vsix, as it has since 7.4.17.
  {
    original:
      "P(ws,B(me,{get when(){return It()},get children(){return B(Bn,{get value(){return a.status().message||a.label()}",
    patched:
      'P(ws,B(Bn,{get value(){return "Attach file"},placement:"top",get children(){return B(Rt,{variant:"ghost",size:"small",onClick:()=>{if(!w)return;w.focus();let _v=w.value,_s=w.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");h.selectMention({type:"file-picker"},w,U,Dr)},get"aria-label"(){return "Attach file"},get children(){return B(Vo,{name:"plus",size:"small"})}})}}),null),P(ws,B(me,{get when(){return It()},get children(){return B(Bn,{get value(){return a.status().message||a.label()}',
  },
  // v7.5.16: container Ar→fr, tooltip $n→Ln, when-wrapper ge→me. Only those
  // three moved; insert P, create B, ghost Qt, icon Go, when-pred cn,
  // controller h, textarea w, setter Q, sync ln, indexing accessor a and the
  // glyph "plus" all held, the smallest churn this scope has had. Kilo's own
  // mention-menu row, h.selectMention(So,w,Q,ln), occurs exactly once and
  // pins all four closure locals the injected button calls; each is
  // corroborated separately too. w=Nt is the textarea.prompt-input node from
  // template sIa, whose chain reads dt→Et→He→xt/Nt for the container,
  // wrapper, ghost-wrapper, highlight-overlay and textarea, then mn→nr/fr for
  // hint-selectors and hint-actions, so fr is the toolbar the button joins.
  // Q is the text signal setter, which the selectMention row is the only
  // reliable pin for here because [N,Q]=xe("") occurs three times in this
  // build, and ln is the auto-resize,
  // ()=>{w&&(w.style.height="auto",...)}. The sprite icon component is
  // function Go(e), reached from the href builder oWe=e=>`opencode-icon-${e}`
  // and the only caller of it. Captioned by a literal because attachFile
  // appears nowhere in this build's vsix (0 hits across all 509 js and json
  // entries), so u.t() would still render the raw key; the catalog is
  // unchanged from 7.5.6, shipping only prompt.action.{continue,enhance,
  // enhanceDescription,indexing,send,stop}.
  {
    original:
      "P(fr,B(me,{get when(){return cn()},get children(){return B(Ln,{get value(){return a.status().message||a.label()}",
    patched:
      'P(fr,B(Ln,{get value(){return "Attach file"},placement:"top",get children(){return B(Qt,{variant:"ghost",size:"small",onClick:()=>{if(!w)return;w.focus();let _v=w.value,_s=w.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");h.selectMention({type:"file-picker"},w,Q,ln)},get"aria-label"(){return "Attach file"},get children(){return B(Go,{name:"plus",size:"small"})}})}}),null),P(fr,B(me,{get when(){return cn()},get children(){return B(Ln,{get value(){return a.status().message||a.label()}',
  },
  // v7.5.11: insert N→P, container or→Ar, tooltip jn→$n, ghost St→Qt, icon
  // qo→Go, when-pred vn→cn, setter P→Q, sync Jt→ln (create B, when-wrapper
  // ge, controller h, textarea w, indexing accessor a, glyph "plus"
  // unchanged). vn and cn traded roles outright across scopes: 7.5.8's chat
  // Escape guard cn is this build's when-predicate, and its when-predicate vn
  // is this build's chat Escape guard. Kilo's own mention-menu row,
  // h.selectMention(So,w,Q,ln), occurs exactly once and pins all four closure
  // locals the injected button calls; each is corroborated separately too.
  // w=$t is the textarea.prompt-input node from template LBa, whose chain
  // reads ut→Et→He→Ct/$t for the container, wrapper, ghost-wrapper,
  // highlight-overlay and textarea, then mn→er/Ar for hint-selectors and
  // hint-actions, so Ar is the toolbar the button joins. Q is the text signal
  // setter from [N,Q]=ke(""), and ln is the auto-resize,
  // ()=>{w&&(w.style.height="auto",...)}. The sprite icon component is
  // function Go(e), reached from the href builder KKe=e=>`opencode-icon-${e}`.
  // Captioned by a literal because attachFile appears nowhere in this build's
  // vsix (0 hits across all 509 js and json entries), so u.t() would still
  // render the raw key; the catalog ships only prompt.action.{continue,
  // enhance,enhanceDescription,indexing,send,stop}, unchanged since 7.5.6.
  // The wholesale letter collision first seen on 7.5.8 recurs here and is now
  // exact: ut, Et, He, Ct, $t and mn name the six template elements above
  // and, in that same order, the chat-history handler's event,
  // selectionStart, selectionEnd, caret, direction and result locals.
  {
    original:
      "P(Ar,B(ge,{get when(){return cn()},get children(){return B($n,{get value(){return a.status().message||a.label()}",
    patched:
      'P(Ar,B($n,{get value(){return "Attach file"},placement:"top",get children(){return B(Qt,{variant:"ghost",size:"small",onClick:()=>{if(!w)return;w.focus();let _v=w.value,_s=w.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");h.selectMention({type:"file-picker"},w,Q,ln)},get"aria-label"(){return "Attach file"},get children(){return B(Go,{name:"plus",size:"small"})}})}}),null),P(Ar,B(ge,{get when(){return cn()},get children(){return B($n,{get value(){return a.status().message||a.label()}',
  },
  // v7.5.8: insert P→N, container xr→or, tooltip Wn→jn, ghost Tt→St, icon
  // jo→qo, when-wrapper Ae→ge, when-pred dt→vn, setter F→P, sync At→Jt
  // (create B, controller h, textarea w, indexing accessor a, glyph "plus"
  // unchanged). Kilo's own mention-menu row, h.selectMention(ci,w,P,Jt),
  // occurs exactly once and pins all four closure locals the injected button
  // calls; each is corroborated separately too. w=yt is the
  // textarea.prompt-input node from template sBa, whose chain reads
  // mt→on→Qt→We/yt for the container, wrapper, ghost-wrapper,
  // highlight-overlay and textarea, then Ht→Dn/or for hint-selectors and
  // hint-actions, so or is the toolbar the button joins. P is the text signal
  // setter from [F,P]=ke(""), and Jt is the auto-resize,
  // ()=>{w&&(w.style.height="auto",...)}. The sprite icon component is
  // function qo(e), reached from the href builder MKe=e=>`opencode-icon-${e}`.
  // Captioned by a literal because attachFile appears nowhere in this build's
  // vsix (0 hits across every js and json entry), so u.t() would still render
  // the raw key; the catalog ships only prompt.action.{continue,enhance,
  // enhanceDescription,indexing,send,stop}, unchanged from 7.5.6. Note that
  // this template scope's letters collide wholesale with the chat-history
  // handler's locals: mt, on, Qt, We, yt and Ht name elements here and name
  // the keydown event and its caret, direction and result locals there. That
  // is the sharpest reminder yet that an anchor keys on shape, never on a name.
  {
    original:
      "N(or,B(ge,{get when(){return vn()},get children(){return B(jn,{get value(){return a.status().message||a.label()}",
    patched:
      'N(or,B(jn,{get value(){return "Attach file"},placement:"top",get children(){return B(St,{variant:"ghost",size:"small",onClick:()=>{if(!w)return;w.focus();let _v=w.value,_s=w.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");h.selectMention({type:"file-picker"},w,P,Jt)},get"aria-label"(){return "Attach file"},get children(){return B(qo,{name:"plus",size:"small"})}})}}),null),N(or,B(ge,{get when(){return vn()},get children(){return B(jn,{get value(){return a.status().message||a.label()}',
  },
  // v7.5.6: container va→xr, ghost Rt→Tt, icon zo→jo, sync Et→At
  // (insert P, create B, tooltip Wn, when-wrapper Ae, when-pred dt, setter F,
  // controller h, textarea w, indexing accessor a, glyph "plus" unchanged).
  // Kilo's own mention-menu row, h.selectMention(ii,w,F,At), pins all four
  // closure locals the injected button calls, and each is corroborated
  // separately: w=Tn is the textarea.prompt-input node from template cEa
  // (chain lt→Oe→Yt→Vn/Tn, then gr→Ci/xr for hint-selectors/hint-actions), F
  // is the text signal setter from [T,F]=ke(""), and At is the auto-resize.
  // The sprite icon component is function jo(e), reached from the href builder
  // oKe=e=>`opencode-icon-${e}`. Captioned by a literal because
  // prompt.action.attachFile is still absent from this build's catalog, which
  // now only ships prompt.action.{continue,enhance,enhanceDescription,
  // indexing,send,stop}. Note lt names both the chat keydown event and the
  // prompt-input container element here, as Te/Oe did in earlier builds.
  {
    original:
      "P(xr,B(Ae,{get when(){return dt()},get children(){return B(Wn,{get value(){return a.status().message||a.label()}",
    patched:
      'P(xr,B(Wn,{get value(){return "Attach file"},placement:"top",get children(){return B(Tt,{variant:"ghost",size:"small",onClick:()=>{if(!w)return;w.focus();let _v=w.value,_s=w.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");h.selectMention({type:"file-picker"},w,F,At)},get"aria-label"(){return "Attach file"},get children(){return B(jo,{name:"plus",size:"small"})}})}}),null),P(xr,B(Ae,{get when(){return dt()},get children(){return B(Wn,{get value(){return a.status().message||a.label()}',
  },
  // v7.5.4: insert R→P, container Nr→va, create C→B, tooltip Mn→Wn, ghost
  // _t→Rt, icon ro→zo, sync bt→Et, when-wrapper ne→fe, when-pred pt→ut,
  // setter Q→F, and the indexing accessor r→a (controller h, textarea w,
  // glyph "plus" unchanged). Captioned by a literal "Attach file" like every
  // 7.4.17+ variant as of 1.18.0; this retarget is where the missing
  // prompt.action.attachFile key was noticed (see the header note).
  // Every closure local the injected button calls is pinned to ground truth
  // by Kilo's own mention-menu row, h.selectMention(Xr,w,F,Et), and
  // corroborated per symbol: w=We is the textarea.prompt-input node from
  // template l_a, F is the text signal setter from [T,F]=we(""), and Et is
  // the auto-resize. The sprite icon component is function zo(e), reached
  // from the href builder KVe=e=>`opencode-icon-${e}`.
  {
    original:
      "P(va,B(fe,{get when(){return ut()},get children(){return B(Wn,{get value(){return a.status().message||a.label()}",
    patched:
      'P(va,B(Wn,{get value(){return "Attach file"},placement:"top",get children(){return B(Rt,{variant:"ghost",size:"small",onClick:()=>{if(!w)return;w.focus();let _v=w.value,_s=w.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");h.selectMention({type:"file-picker"},w,F,Et)},get"aria-label"(){return "Attach file"},get children(){return B(zo,{name:"plus",size:"small"})}})}}),null),P(va,B(fe,{get when(){return ut()},get children(){return B(Wn,{get value(){return a.status().message||a.label()}',
  },
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
      'R(Nr,C(Mn,{get value(){return "Attach file"},placement:"top",get children(){return C(_t,{variant:"ghost",size:"small",onClick:()=>{if(!w)return;w.focus();let _v=w.value,_s=w.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");h.selectMention({type:"file-picker"},w,Q,bt)},get"aria-label"(){return "Attach file"},get children(){return C(ro,{name:"plus",size:"small"})}})}}),null),R(Nr,C(ne,{get when(){return pt()},get children(){return C(Mn,{get value(){return r.status().message||r.label()}',
    previous: [
      // Captioned via u.t("prompt.action.attachFile") until 1.18.0; see the
      // header note on the dropped catalog key.
      'R(Nr,C(Mn,{get value(){return u.t("prompt.action.attachFile")},placement:"top",get children(){return C(_t,{variant:"ghost",size:"small",onClick:()=>{if(!w)return;w.focus();let _v=w.value,_s=w.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");h.selectMention({type:"file-picker"},w,Q,bt)},get"aria-label"(){return u.t("prompt.action.attachFile")},get children(){return C(ro,{name:"plus",size:"small"})}})}}),null),R(Nr,C(ne,{get when(){return pt()},get children(){return C(Mn,{get value(){return r.status().message||r.label()}',
    ],
  },
  // v7.4.23: insert P→N, create _→E, when-wrapper se→ce, when-pred mt→pt,
  // tooltip Sn→Qn, icon Ji→to, sync yt→ht (container Qa, ghost Et, setter Q,
  // i18n u, controller h, textarea w, and the indexing accessor a unchanged).
  {
    original:
      "N(Qa,E(ce,{get when(){return pt()},get children(){return E(Qn,{get value(){return a.status().message||a.label()}",
    patched:
      'N(Qa,E(Qn,{get value(){return "Attach file"},placement:"top",get children(){return E(Et,{variant:"ghost",size:"small",onClick:()=>{if(!w)return;w.focus();let _v=w.value,_s=w.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");h.selectMention({type:"file-picker"},w,Q,ht)},get"aria-label"(){return "Attach file"},get children(){return E(to,{name:"plus",size:"small"})}})}}),null),N(Qa,E(ce,{get when(){return pt()},get children(){return E(Qn,{get value(){return a.status().message||a.label()}',
    previous: [
      // Captioned via u.t("prompt.action.attachFile") until 1.18.0; see the
      // header note on the dropped catalog key.
      'N(Qa,E(Qn,{get value(){return u.t("prompt.action.attachFile")},placement:"top",get children(){return E(Et,{variant:"ghost",size:"small",onClick:()=>{if(!w)return;w.focus();let _v=w.value,_s=w.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");h.selectMention({type:"file-picker"},w,Q,ht)},get"aria-label"(){return u.t("prompt.action.attachFile")},get children(){return E(to,{name:"plus",size:"small"})}})}}),null),N(Qa,E(ce,{get when(){return pt()},get children(){return E(Qn,{get value(){return a.status().message||a.label()}',
    ],
  },
  // v7.4.22: insert R→P, container Ta→Qa, guard oe→se, icon Vi→Ji, setter
  // L→Q (create _, tooltip Sn, ghost Et, i18n u, controller h, textarea w,
  // sync yt, and the indexing accessor a unchanged).
  {
    original:
      "P(Qa,_(se,{get when(){return mt()},get children(){return _(Sn,{get value(){return a.status().message||a.label()}",
    patched:
      'P(Qa,_(Sn,{get value(){return "Attach file"},placement:"top",get children(){return _(Et,{variant:"ghost",size:"small",onClick:()=>{if(!w)return;w.focus();let _v=w.value,_s=w.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");h.selectMention({type:"file-picker"},w,Q,yt)},get"aria-label"(){return "Attach file"},get children(){return _(Ji,{name:"plus",size:"small"})}})}}),null),P(Qa,_(se,{get when(){return mt()},get children(){return _(Sn,{get value(){return a.status().message||a.label()}',
    previous: [
      // Captioned via u.t("prompt.action.attachFile") until 1.18.0; see the
      // header note on the dropped catalog key.
      'P(Qa,_(Sn,{get value(){return u.t("prompt.action.attachFile")},placement:"top",get children(){return _(Et,{variant:"ghost",size:"small",onClick:()=>{if(!w)return;w.focus();let _v=w.value,_s=w.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");h.selectMention({type:"file-picker"},w,Q,yt)},get"aria-label"(){return u.t("prompt.action.attachFile")},get children(){return _(Ji,{name:"plus",size:"small"})}})}}),null),P(Qa,_(se,{get when(){return mt()},get children(){return _(Sn,{get value(){return a.status().message||a.label()}',
    ],
  },
  // v7.4.21: the indexing-status accessor changed for the first time (r→a),
  // alongside the usual churn (container Ta, tooltip Sn, ghost Et, icon Vi,
  // sync yt); Kilo's own tooltips gained openDelay:0, which sits outside the
  // anchor and is not copied into the injected button.
  {
    original:
      "R(Ta,_(oe,{get when(){return mt()},get children(){return _(Sn,{get value(){return a.status().message||a.label()}",
    patched:
      'R(Ta,_(Sn,{get value(){return "Attach file"},placement:"top",get children(){return _(Et,{variant:"ghost",size:"small",onClick:()=>{if(!w)return;w.focus();let _v=w.value,_s=w.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");h.selectMention({type:"file-picker"},w,L,yt)},get"aria-label"(){return "Attach file"},get children(){return _(Vi,{name:"plus",size:"small"})}})}}),null),R(Ta,_(oe,{get when(){return mt()},get children(){return _(Sn,{get value(){return a.status().message||a.label()}',
    previous: [
      // Captioned via u.t("prompt.action.attachFile") until 1.18.0; see the
      // header note on the dropped catalog key.
      'R(Ta,_(Sn,{get value(){return u.t("prompt.action.attachFile")},placement:"top",get children(){return _(Et,{variant:"ghost",size:"small",onClick:()=>{if(!w)return;w.focus();let _v=w.value,_s=w.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");h.selectMention({type:"file-picker"},w,L,yt)},get"aria-label"(){return u.t("prompt.action.attachFile")},get children(){return _(Vi,{name:"plus",size:"small"})}})}}),null),R(Ta,_(oe,{get when(){return mt()},get children(){return _(Sn,{get value(){return a.status().message||a.label()}',
    ],
  },
  {
    original:
      "R(ai,_(oe,{get when(){return gt()},get children(){return _(Mn,{get value(){return r.status().message||r.label()}",
    patched:
      'R(ai,_(Mn,{get value(){return "Attach file"},placement:"top",get children(){return _(_t,{variant:"ghost",size:"small",onClick:()=>{if(!w)return;w.focus();let _v=w.value,_s=w.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");h.selectMention({type:"file-picker"},w,L,bt)},get"aria-label"(){return "Attach file"},get children(){return _(Wi,{name:"plus",size:"small"})}})}}),null),R(ai,_(oe,{get when(){return gt()},get children(){return _(Mn,{get value(){return r.status().message||r.label()}',
    previous: [
      // Captioned via u.t("prompt.action.attachFile") until 1.18.0; see the
      // header note on the dropped catalog key.
      'R(ai,_(Mn,{get value(){return u.t("prompt.action.attachFile")},placement:"top",get children(){return _(_t,{variant:"ghost",size:"small",onClick:()=>{if(!w)return;w.focus();let _v=w.value,_s=w.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");h.selectMention({type:"file-picker"},w,L,bt)},get"aria-label"(){return u.t("prompt.action.attachFile")},get children(){return _(Wi,{name:"plus",size:"small"})}})}}),null),R(ai,_(oe,{get when(){return gt()},get children(){return _(Mn,{get value(){return r.status().message||r.label()}',
    ],
  },
  {
    original:
      "F(Pe,x(ce,{get when(){return Ke()},get children(){return x(Fn,{get value(){return r.status().message||r.label()}",
    patched:
      'F(Pe,x(Fn,{get value(){return "Attach file"},placement:"top",get children(){return x(St,{variant:"ghost",size:"small",onClick:()=>{if(!k)return;k.focus();let _v=k.value,_s=k.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");h.selectMention({type:"file-picker"},k,L,Ut)},get"aria-label"(){return "Attach file"},get children(){return x(Hi,{name:"plus",size:"small"})}})}}),null),F(Pe,x(ce,{get when(){return Ke()},get children(){return x(Fn,{get value(){return r.status().message||r.label()}',
    previous: [
      // Captioned via u.t("prompt.action.attachFile") until 1.18.0; see the
      // header note on the dropped catalog key. The second form below is
      // older still: 1.11.0 and earlier drew the small glyph. The larger
      // "plus" was always in the sprite map; it only looked absent because
      // minified object keys are quoted just when they must be, so
      // "plus-small" is quoted and plus is bare.
      'F(Pe,x(Fn,{get value(){return u.t("prompt.action.attachFile")},placement:"top",get children(){return x(St,{variant:"ghost",size:"small",onClick:()=>{if(!k)return;k.focus();let _v=k.value,_s=k.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");h.selectMention({type:"file-picker"},k,L,Ut)},get"aria-label"(){return u.t("prompt.action.attachFile")},get children(){return x(Hi,{name:"plus",size:"small"})}})}}),null),F(Pe,x(ce,{get when(){return Ke()},get children(){return x(Fn,{get value(){return r.status().message||r.label()}',
      'F(Pe,x(Fn,{get value(){return u.t("prompt.action.attachFile")},placement:"top",get children(){return x(St,{variant:"ghost",size:"small",onClick:()=>{if(!k)return;k.focus();let _v=k.value,_s=k.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");h.selectMention({type:"file-picker"},k,L,Ut)},get"aria-label"(){return u.t("prompt.action.attachFile")},get children(){return x(Hi,{name:"plus-small",size:"small"})}})}}),null),F(Pe,x(ce,{get when(){return Ke()},get children(){return x(Fn,{get value(){return r.status().message||r.label()}',
    ],
  },
  {
    original:
      "R(Pe,C(le,{get when(){return Ue()},get children(){return C(Pn,{get value(){return r.status().message||r.label()}",
    patched:
      'R(Pe,C(Pn,{get value(){return u.t("prompt.action.attachFile")},placement:"top",get children(){return C(_t,{variant:"ghost",size:"small",onClick:()=>{if(!k)return;k.focus();let _v=k.value,_s=k.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");h.selectMention({type:"file-picker"},k,L,nn)},get"aria-label"(){return u.t("prompt.action.attachFile")},get children(){return C(en,{name:"plus-small",size:"small"})}})}}),null),R(Pe,C(le,{get when(){return Ue()},get children(){return C(Pn,{get value(){return r.status().message||r.label()}',
  },
  {
    original:
      "P(Pe,_(se,{get when(){return Ue()},get children(){return _(Gn,{get value(){return r.status().message||r.label()}",
    patched:
      'P(Pe,_(Gn,{get value(){return u.t("prompt.action.attachFile")},placement:"top",get children(){return _(_t,{variant:"ghost",size:"small",onClick:()=>{if(!k)return;k.focus();let _v=k.value,_s=k.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");h.selectMention({type:"file-picker"},k,L,nn)},get"aria-label"(){return u.t("prompt.action.attachFile")},get children(){return _(tn,{name:"plus-small",size:"small"})}})}}),null),P(Pe,_(se,{get when(){return Ue()},get children(){return _(Gn,{get value(){return r.status().message||r.label()}',
  },
  {
    original:
      "R(Pe,C(ce,{get when(){return Ue()},get children(){return C(On,{get value(){return r.status().message||r.label()}",
    patched:
      'R(Pe,C(On,{get value(){return u.t("prompt.action.attachFile")},placement:"top",get children(){return C(_t,{variant:"ghost",size:"small",onClick:()=>{if(!k)return;k.focus();let _v=k.value,_s=k.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");h.selectMention({type:"file-picker"},k,Q,an)},get"aria-label"(){return u.t("prompt.action.attachFile")},get children(){return C(tn,{name:"plus-small",size:"small"})}})}}),null),R(Pe,C(ce,{get when(){return Ue()},get children(){return C(On,{get value(){return r.status().message||r.label()}',
  },
  {
    original:
      "R(Re,C(de,{get when(){return He()},get children(){return C(Gn,{get value(){return r.status().message||r.label()}",
    patched:
      'R(Re,C(Gn,{get value(){return u.t("prompt.action.attachFile")},placement:"top",get children(){return C(_t,{variant:"ghost",size:"small",onClick:()=>{if(!k)return;k.focus();let _v=k.value,_s=k.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");h.selectMention({type:"file-picker"},k,L,an)},get"aria-label"(){return u.t("prompt.action.attachFile")},get children(){return C(tn,{name:"plus",size:"small"})}})}}),null),R(Re,C(de,{get when(){return He()},get children(){return C(Gn,{get value(){return r.status().message||r.label()}',
  },
];

function addAttachFileButtonEnabled(): boolean {
  return vscode.workspace
    .getConfiguration("kiloCodeKbPatch")
    .get<boolean>("addAttachFileButton", false);
}

// Find the variant that matches this build. For the attach button each patched
// string contains its own original as a suffix, so a patched build makes both
// includes()-true for its variant only; for the math extensions the two are
// mutually exclusive. Either way exactly one variant matches, since unmatched
// releases' symbols are absent. Returns undefined when none does (a future Kilo
// re-minify), which callers treat as a silent no-op.
function matchingVariant(
  content: string,
  variants: WebviewVariant[],
): WebviewVariant | undefined {
  return variants.find(
    (v) =>
      content.includes(v.patched) ||
      content.includes(v.original) ||
      v.previous?.some((p) => content.includes(p)),
  );
}

// Apply or remove one opt-in edit in Kilo's webview bundle to match its
// setting. Returns true only when the file actually changed. "Already patched"
// is tested before "is pristine", because the attach button's patched text
// contains its original as a suffix. Fails safe: a missing bundle, or a site a
// future Kilo has re-minified past every known variant, is a silent no-op.
function reconcileVariant(
  extPath: string,
  variants: WebviewVariant[],
  enabled: boolean,
): boolean {
  const webviewPath = path.join(extPath, "dist", "webview.js");
  if (!fs.existsSync(webviewPath)) return false;
  const content = fs.readFileSync(webviewPath, "utf8");
  const variant = matchingVariant(content, variants);
  if (!variant) return false;
  const isPatched = content.includes(variant.patched);
  // An older form of this variant is an edit that is present but out of date.
  // It must be rewritten in place, never treated as pristine, or enabling would
  // add a second copy alongside it.
  const stale = isPatched
    ? undefined
    : variant.previous?.find((p) => content.includes(p));
  if (enabled === isPatched && !stale) return false;

  const from = stale ?? (enabled ? variant.original : variant.patched);
  const to = enabled ? variant.patched : variant.original;
  const updated = content.replace(from, to);
  if (updated === content) return false;
  fs.writeFileSync(webviewPath, updated, "utf8");
  return true;
}

function matchingAttachFileButton(
  content: string,
): AttachButtonDef | undefined {
  return matchingVariant(content, ATTACH_FILE_BUTTONS);
}

function reconcileAttachFileButton(extPath: string): boolean {
  return reconcileVariant(
    extPath,
    ATTACH_FILE_BUTTONS,
    addAttachFileButtonEnabled(),
  );
}

// --- Bonus math-rendering knob ----------------------------------------------
// Kilo already renders math: its webview bundles KaTeX 0.16.x outright and
// registers three `marked` extensions for it, `$$\n...\n$$` at block level,
// `$$...$$` inline and `\(...\)` inline, all of which route through one helper that
// wraps katex.renderToString in a `<span dir="auto">`. What it does not
// register is single-dollar `$...$`, by far the most common way to write inline
// math, nor `\[...\]`, the display counterpart of the `\(...\)` it does support.
// This bonus adds those three extensions to the same pack, so the two shipped
// forms keep working untouched and the two missing ones start rendering.
//
// Nothing else is needed for them to display: the KaTeX stylesheet and its
// @font-face rules are already inlined in dist/webview.css with the woff2/woff/
// ttf files alongside it, the webview's CSP allows `font-src` from the
// extension, and Kilo's DOMPurify pass runs with both the `html` and `mathMl`
// profiles (so `<span>`, `class` and `style`, plus MathML, all survive).
//
// Single-dollar math is off by default for a reason: `$5 and $10` is a real
// sentence, and a naive `$...$` tokenizer eats it. The regex therefore refuses a
// delimiter next to whitespace or another `$`, refuses a newline inside, and
// refuses a closing `$` followed by a digit, which is the same guard set
// markdown-it-katex uses. `tools/behavior.js` drives all of this through the
// build's own bundled `marked`, so the currency cases are asserted rather than
// assumed.
//
// The anchor is the tail of Kilo's own katex extension pack: the second
// extension's renderer plus the `]});` that closes the array and the use()
// call. Two properties make that the right span. It is the shortest one that
// still pins the render helper, which is the only symbol the injected code
// references, and it contains no other minified name (the parameter is `n` in
// every build checked, and the two `$$` regex variables sit outside it), so a
// release that renames only those regexes still matches. Splicing after the
// last extension rather than before the first is deliberate too: marked's
// use() *unshifts* each extension's tokenizer, so registering last means being
// tried first, and the `$...$` regex is written to fail immediately on `$$` so
// that Kilo's own `$$...$$` extension keeps priority anyway.
// One entry per spelling of the render helper. It churns in webview.js (bR in
// 7.5.6, MR in 7.5.8, RR in 7.5.11 through 7.5.15, qR in 7.5.16) while the
// rest of the span is byte-stable, so these four entries cover every release
// from 7.5.6 on.
// Note this is the first patch site where 7.5.11 and 7.5.14 could have
// differed and did not, even though they ship distinct bundles.
const MATH_EXTENSIONS: WebviewVariant[] = [
  // v7.6.1: the render helper eQ→rQ. Nothing else in the tail anchor moved.
  {
    original:
      "renderer(n){return rQ(n.text,{displayMode:!0,throwOnError:!1})}}]});",
    patched:
      'renderer(n){return rQ(n.text,{displayMode:!0,throwOnError:!1})}},{name:"kbpKatexInlineDollar",level:"inline",start(_e){let _i=_e.indexOf("$");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\$([^\\s$](?:[^$\\n]*?[^\\s$])?)\\$(?!\\d)/);if(_m)return{type:"kbpKatexInlineDollar",raw:_m[0],text:_m[1].trim()}},renderer(_n){return rQ(_n.text,{displayMode:!1,throwOnError:!1})}},{name:"kbpKatexBlockBracket",level:"block",tokenizer(_e){let _m=_e.match(/^\\\\\\[([\\s\\S]+?)\\\\\\](?:\\n|$)/);if(_m&&_m[1].trim())return{type:"kbpKatexBlockBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return rQ(_n.text,{displayMode:!0,throwOnError:!1})+"\\n"}},{name:"kbpKatexInlineBracket",level:"inline",start(_e){let _i=_e.indexOf("\\\\[");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\\\\\[((?:\\\\.|[^\\\\\\n])*?)\\\\\\]/);if(_m&&_m[1].trim())return{type:"kbpKatexInlineBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return rQ(_n.text,{displayMode:!0,throwOnError:!1})}}]});',
  },
  // v7.6.0: the render helper qR→eQ. Nothing else in the tail anchor moved.
  {
    original:
      "renderer(n){return eQ(n.text,{displayMode:!0,throwOnError:!1})}}]});",
    patched:
      'renderer(n){return eQ(n.text,{displayMode:!0,throwOnError:!1})}},{name:"kbpKatexInlineDollar",level:"inline",start(_e){let _i=_e.indexOf("$");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\$([^\\s$](?:[^$\\n]*?[^\\s$])?)\\$(?!\\d)/);if(_m)return{type:"kbpKatexInlineDollar",raw:_m[0],text:_m[1].trim()}},renderer(_n){return eQ(_n.text,{displayMode:!1,throwOnError:!1})}},{name:"kbpKatexBlockBracket",level:"block",tokenizer(_e){let _m=_e.match(/^\\\\\\[([\\s\\S]+?)\\\\\\](?:\\n|$)/);if(_m&&_m[1].trim())return{type:"kbpKatexBlockBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return eQ(_n.text,{displayMode:!0,throwOnError:!1})+"\\n"}},{name:"kbpKatexInlineBracket",level:"inline",start(_e){let _i=_e.indexOf("\\\\[");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\\\\\[((?:\\\\.|[^\\\\\\n])*?)\\\\\\]/);if(_m&&_m[1].trim())return{type:"kbpKatexInlineBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return eQ(_n.text,{displayMode:!0,throwOnError:!1})}}]});',
  },
  {
    original:
      "renderer(n){return qR(n.text,{displayMode:!0,throwOnError:!1})}}]});",
    patched:
      'renderer(n){return qR(n.text,{displayMode:!0,throwOnError:!1})}},{name:"kbpKatexInlineDollar",level:"inline",start(_e){let _i=_e.indexOf("$");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\$([^\\s$](?:[^$\\n]*?[^\\s$])?)\\$(?!\\d)/);if(_m)return{type:"kbpKatexInlineDollar",raw:_m[0],text:_m[1].trim()}},renderer(_n){return qR(_n.text,{displayMode:!1,throwOnError:!1})}},{name:"kbpKatexBlockBracket",level:"block",tokenizer(_e){let _m=_e.match(/^\\\\\\[([\\s\\S]+?)\\\\\\](?:\\n|$)/);if(_m&&_m[1].trim())return{type:"kbpKatexBlockBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return qR(_n.text,{displayMode:!0,throwOnError:!1})+"\\n"}},{name:"kbpKatexInlineBracket",level:"inline",start(_e){let _i=_e.indexOf("\\\\[");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\\\\\[((?:\\\\.|[^\\\\\\n])*?)\\\\\\]/);if(_m&&_m[1].trim())return{type:"kbpKatexInlineBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return qR(_n.text,{displayMode:!0,throwOnError:!1})}}]});',
  },
  {
    original:
      "renderer(n){return RR(n.text,{displayMode:!0,throwOnError:!1})}}]});",
    patched:
      'renderer(n){return RR(n.text,{displayMode:!0,throwOnError:!1})}},{name:"kbpKatexInlineDollar",level:"inline",start(_e){let _i=_e.indexOf("$");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\$([^\\s$](?:[^$\\n]*?[^\\s$])?)\\$(?!\\d)/);if(_m)return{type:"kbpKatexInlineDollar",raw:_m[0],text:_m[1].trim()}},renderer(_n){return RR(_n.text,{displayMode:!1,throwOnError:!1})}},{name:"kbpKatexBlockBracket",level:"block",tokenizer(_e){let _m=_e.match(/^\\\\\\[([\\s\\S]+?)\\\\\\](?:\\n|$)/);if(_m&&_m[1].trim())return{type:"kbpKatexBlockBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return RR(_n.text,{displayMode:!0,throwOnError:!1})+"\\n"}},{name:"kbpKatexInlineBracket",level:"inline",start(_e){let _i=_e.indexOf("\\\\[");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\\\\\[((?:\\\\.|[^\\\\\\n])*?)\\\\\\]/);if(_m&&_m[1].trim())return{type:"kbpKatexInlineBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return RR(_n.text,{displayMode:!0,throwOnError:!1})}}]});',
  },
  {
    original:
      "renderer(n){return MR(n.text,{displayMode:!0,throwOnError:!1})}}]});",
    patched:
      'renderer(n){return MR(n.text,{displayMode:!0,throwOnError:!1})}},{name:"kbpKatexInlineDollar",level:"inline",start(_e){let _i=_e.indexOf("$");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\$([^\\s$](?:[^$\\n]*?[^\\s$])?)\\$(?!\\d)/);if(_m)return{type:"kbpKatexInlineDollar",raw:_m[0],text:_m[1].trim()}},renderer(_n){return MR(_n.text,{displayMode:!1,throwOnError:!1})}},{name:"kbpKatexBlockBracket",level:"block",tokenizer(_e){let _m=_e.match(/^\\\\\\[([\\s\\S]+?)\\\\\\](?:\\n|$)/);if(_m&&_m[1].trim())return{type:"kbpKatexBlockBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return MR(_n.text,{displayMode:!0,throwOnError:!1})+"\\n"}},{name:"kbpKatexInlineBracket",level:"inline",start(_e){let _i=_e.indexOf("\\\\[");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\\\\\[((?:\\\\.|[^\\\\\\n])*?)\\\\\\]/);if(_m&&_m[1].trim())return{type:"kbpKatexInlineBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return MR(_n.text,{displayMode:!0,throwOnError:!1})}}]});',
  },
  {
    original:
      "renderer(n){return bR(n.text,{displayMode:!0,throwOnError:!1})}}]});",
    patched:
      'renderer(n){return bR(n.text,{displayMode:!0,throwOnError:!1})}},{name:"kbpKatexInlineDollar",level:"inline",start(_e){let _i=_e.indexOf("$");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\$([^\\s$](?:[^$\\n]*?[^\\s$])?)\\$(?!\\d)/);if(_m)return{type:"kbpKatexInlineDollar",raw:_m[0],text:_m[1].trim()}},renderer(_n){return bR(_n.text,{displayMode:!1,throwOnError:!1})}},{name:"kbpKatexBlockBracket",level:"block",tokenizer(_e){let _m=_e.match(/^\\\\\\[([\\s\\S]+?)\\\\\\](?:\\n|$)/);if(_m&&_m[1].trim())return{type:"kbpKatexBlockBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return bR(_n.text,{displayMode:!0,throwOnError:!1})+"\\n"}},{name:"kbpKatexInlineBracket",level:"inline",start(_e){let _i=_e.indexOf("\\\\[");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\\\\\[((?:\\\\.|[^\\\\\\n])*?)\\\\\\]/);if(_m&&_m[1].trim())return{type:"kbpKatexInlineBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return bR(_n.text,{displayMode:!0,throwOnError:!1})}}]});',
  },
];

function chatMathRenderingEnabled(): boolean {
  return vscode.workspace
    .getConfiguration("kiloCodeKbPatch")
    .get<boolean>("chatMathRendering", false);
}

// Unlike the attach button, a patched string here does not contain its own
// original: the splice lands between the last renderer and the `]});` that
// closed it, and every injected local is `_`-prefixed, so nothing in the
// injected text reproduces the original span. That is load-bearing rather than
// incidental. Reusing the parameter name `n` would end the last extension with
// exactly the original's bytes and make a patched bundle read as pristine.
function matchingMathExtension(content: string): WebviewVariant | undefined {
  return matchingVariant(content, MATH_EXTENSIONS);
}

function reconcileMathRendering(extPath: string): boolean {
  return reconcileVariant(extPath, MATH_EXTENSIONS, chatMathRenderingEnabled());
}

// --- Appended blocks ---------------------------------------------------------
// Two core patches and two bonuses are applied by appending a delimited block
// to one of Kilo's own dist/ files instead of splicing into a bundle's code. That
// buys what a splice cannot: no minified identifier is involved, so nothing
// here needs re-targeting on a re-minify, and removal is exact, since an append
// is reversed by deleting the block. A block's markers are CSS comments, which
// are JS comments too, so the same machinery serves both files.
//
//   chat-scroll  core, two blocks: a stylesheet rule that hands the chat
//                textarea's sizing to the engine instead of Kilo's
//                measure-then-set script, and a script that re-pins the chat
//                history after an edit the browser laid out mid-way through
//                (see CHAT_SCROLL_RULE and chatScrollScript). Together they
//                keep the history at the bottom while typing. Apply Patches
//                writes them, Restore Originals removes them, and each feeds
//                the verdict like a keyboard patch.
//   hover-guard  core, webview.js: while the cursor macOS hid for typing stays
//                hidden, the enter events the engine synthesizes for a layout
//                change under the pointer are stopped, so a menu row or a
//                tooltip that lands there no longer reacts (see
//                hoverGuardScript). Applied and removed with chat-scroll.
//   typography   bonus, webview.css: the agent's reply is scaled and optionally
//                re-fonted
//   math         bonus, webview.css: rendered math is sized, which is part of
//                the math-rendering bonus rather than a knob of its own: the
//                size is meaningless when that bonus is off, so this block is
//                written only while it is on
//
// Each patch owns its own block, so a change can be attributed to the patch it
// belongs to without inferring anything from the rules themselves.
//
// The values the typography block multiplies are read out of Kilo's stylesheet
// rather than hardcoded. Scaling only the markdown container would leave
// headings and tables behind, because Kilo declares those with sizes of their
// own (a literal 14px for headings, the base token again for tables), and a
// heading that stays 14px while body text grows ends up *smaller* than the
// paragraph around it. So each declaration Kilo makes is read and re-declared
// multiplied. Monospace content is what deliberately does *not* scale, and it
// needs rules for the opposite reason, because Kilo gives it no size of its own
// to hold it back: a fenced block's absolute size lives on `.shiki`, which it
// only gains once the highlighter has run, and inline `code` and
// `a.file-path-link` declare a family and nothing else. So `pre` is pinned to
// Kilo's `.shiki` size (which also keeps a streaming block from resizing under
// the reader) and the two inline forms to its base size.
//
// A build that renamed or restructured those declarations reads as
// "unavailable" in the status view rather than producing a wrong size.
const CHAT_STYLE_FILE = "webview.css";
const CHAT_SCRIPT_FILE = "webview.js";

// One block per patch and file, in the order they are appended: the core
// patches first, keyed by their FEATURE_ORDER names, then the bonuses.
const CHAT_CSS_BLOCKS = ["chat-scroll", "typography", "math"] as const;
type ChatCssBlockKey = (typeof CHAT_CSS_BLOCKS)[number];
const CHAT_SCRIPT_BLOCKS = ["chat-scroll", "hover-guard"] as const;
type ChatScriptBlockKey = (typeof CHAT_SCRIPT_BLOCKS)[number];
// The derived-pattern record (see readDerivedRecord) is a block too, so that
// stripping it is the same operation as stripping the others, but it is not a
// feature: nothing reconciles it and it never appears in the status view.
const DERIVED_BLOCK = "derived" as const;

type PatchBlockKey = ChatCssBlockKey | ChatScriptBlockKey | "derived";

// The core blocks: written by Apply, removed by Restore, listed in the status
// view under their file and counted in the verdict. Typed against both lists,
// so a key that is not registered as a feature (or not a block) is a compile
// error rather than a row that never renders.
const CHAT_CSS_CORE = [
  "chat-scroll",
] as const satisfies readonly (ChatCssBlockKey & FeatureKey)[];
type ChatCssCoreKey = (typeof CHAT_CSS_CORE)[number];
const CHAT_SCRIPT_CORE = [
  "chat-scroll",
  "hover-guard",
] as const satisfies readonly (ChatScriptBlockKey & FeatureKey)[];

function isChatCssCore(key: ChatCssBlockKey): key is ChatCssCoreKey {
  return (CHAT_CSS_CORE as readonly ChatCssBlockKey[]).includes(key);
}

const patchBlockBegin = (key: PatchBlockKey) =>
  `/* kilo-code-kb-patch:${key}:begin */`;
const patchBlockEnd = (key: PatchBlockKey) =>
  `/* kilo-code-kb-patch:${key}:end */`;

// One block, with the newlines around it, so extracting it and stripping it are
// the same span. Built per key rather than shared, since the blocks sit next to
// each other and a key-agnostic pattern could pair one block's begin with
// another's end.
function patchBlockRe(key: PatchBlockKey): RegExp {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `\\n?${esc(patchBlockBegin(key))}[\\s\\S]*?${esc(patchBlockEnd(key))}\\n?`,
  );
}

// A block's full text from its body: the markers on their own lines, and a
// newline on each side so the append lands on a line of its own whatever the
// file ends with.
function patchBlock(key: PatchBlockKey, body: string): string {
  return `\n${patchBlockBegin(key)}\n${body}\n${patchBlockEnd(key)}\n`;
}

// Strip every block this extension has ever appended to a file, which is what
// returns it to the bytes Kilo shipped.
function stripBlocks(content: string, keys: readonly PatchBlockKey[]): string {
  let out = content;
  for (const key of keys) out = out.replace(patchBlockRe(key), "");
  return out;
}

function stripChatCss(css: string): string {
  return stripBlocks(css, CHAT_CSS_BLOCKS);
}

// Every block this extension appends to the bundle, including the record,
// which is what returns the file to the bytes Kilo shipped.
const CHAT_SCRIPT_STRIPPABLE = [...CHAT_SCRIPT_BLOCKS, DERIVED_BLOCK] as const;

function stripChatScript(js: string): string {
  return stripBlocks(js, CHAT_SCRIPT_STRIPPABLE);
}

// Rewrite one file's appended blocks and report which changed. `desired` gives
// each key's whole block text ("" for none) from the file's pristine bytes and
// the block as currently found, which is what lets a core block be carried over
// untouched by a pass that has no say on it. Every block is stripped first, so
// this is idempotent, self-healing after a Kilo update replaces the file, and
// exact in reverse. Fails safe: a missing file changes nothing.
function reconcileBlocks<K extends PatchBlockKey>(
  filePath: string,
  keys: readonly K[],
  desired: (key: K, pristine: string, current: string) => string,
): Record<K, boolean> {
  const changed = Object.fromEntries(keys.map((key) => [key, false])) as Record<
    K,
    boolean
  >;
  if (!fs.existsSync(filePath)) return changed;
  const content = fs.readFileSync(filePath, "utf8");
  const pristine = stripBlocks(content, keys);

  let updated = pristine;
  const wanted = {} as Record<K, string>;
  for (const key of keys) {
    const current = patchBlockRe(key).exec(content)?.[0] ?? "";
    wanted[key] = desired(key, pristine, current);
    updated += wanted[key];
  }
  if (updated === content) return changed;

  for (const key of keys) {
    changed[key] = (patchBlockRe(key).exec(content)?.[0] ?? "") !== wanted[key];
  }
  fs.writeFileSync(filePath, updated, "utf8");
  return changed;
}

// A file's core blocks as status rows, in the shape statusForFile gives the
// bundle splices. "missing" means the block's anchors no longer match (this
// build does not look the way the block assumes), "unpatched" that the block is
// absent or stale (Apply writes the current form), "patched" that the current
// form is present.
function blockCoreStatus<K extends PatchBlockKey & FeatureKey>(
  content: string,
  keys: readonly K[],
  strip: (content: string) => string,
  block: (key: K, pristine: string) => string,
): { label: string; state: FeatureState }[] {
  const pristine = strip(content);
  return keys.map((key) => {
    const desired = block(key, pristine);
    const current = patchBlockRe(key).exec(content)?.[0] ?? "";
    const state: FeatureState = !desired
      ? "missing"
      : current === desired
        ? "patched"
        : "unpatched";
    return { label: FEATURE_LABELS[key], state };
  });
}

// A reconcile pass's effect on a file's core blocks, in the shape the apply and
// restore commands report the bundle splices in.
function blockResult<K extends PatchBlockKey & FeatureKey>(
  filename: string,
  keys: readonly K[],
  changed: Record<K, boolean>,
  mode: "apply" | "restore",
): PatchResult {
  const moved = keys
    .filter((key) => changed[key])
    .map((key) => FEATURE_LABELS[key]);
  return {
    filename,
    applied: mode === "apply" ? moved : [],
    skipped: [],
    reverted: mode === "restore" ? moved : [],
    noChanges: moved.length === 0,
  };
}

// The agent's rendered reply, and nothing else. Kilo puts a user message under
// [data-component=user-message], its own thinking under
// [data-component=reasoning-part] and tool results under
// [data-component=tool-output], so a text-part scope reaches only the reply.
const CHAT_ASSISTANT_MD =
  '[data-component="text-part"] [data-component="markdown"]';
// Math is sized in em relative to whatever text surrounds it, so that rule is
// chat-wide rather than assistant-only.
const CHAT_ANY_MD = '[data-component="markdown"]';

// Kilo's own declarations, each matched only to read the value it sets. The
// `min-width:0` prefix pins the base markdown rule (the file has 29 other
// [data-component=markdown] selectors), and the heading rule is pinned by the
// two declarations that follow its size (a bare h1..h6 size selector matches
// three unrelated rules).
//
// Kilo's font-family declaration is not among them: the family setting replaces
// that value outright rather than deriving from it, so there is nothing to
// read. Neither is KaTeX's em size, which the math block states absolutely.
//
// Exported to the harness, which asserts each anchor still matches exactly
// once against a fresh build (see PROBES in tools/lib/rules.js). Duplicating
// them there would let the two drift.
const CHAT_STYLE_ANCHORS: Record<string, RegExp> = {
  "markdown font-size":
    /\[data-component=markdown\]\{min-width:0;[^{}]*?font-size:([^;{}]+);/,
  "heading font-size":
    /h1,h2,h3,h4,h5,h6\{font-size:([^;{}]+);color:var\(--text-strong\);font-weight:var\(--font-weight-medium\);/,
  "table font-size":
    /table\{width:100%;border-collapse:collapse;margin:24px 0;font-size:([^;{}]+);/,
  "code block font-size": /\.shiki\{background:[^{}]*?font-size:([^;{}]+);/,
  // Read by the harness only: if it stops matching KATEX_DEFAULT_EM, the schema
  // default in package.json is the thing that needs updating.
  "katex em size": /\.katex\{font:\s*([\d.]+)em\s/,
};

// KaTeX's own `.katex` size, and therefore the value at which the math size
// asks for nothing. Kept in step with the schema default in package.json, and
// checked against the shipped stylesheet by the harness rather than read from
// it, so that a KaTeX upgrade cannot silently start overriding the size for
// users who never touched the setting.
const KATEX_DEFAULT_EM = 1.21;

// The font sizes Kilo declares inside the assistant markdown: three the
// typography block re-declares multiplied, and the code-block size it re-states
// unchanged. `size` does double duty, since Kilo's base size is also what its
// inline monospace content inherits and therefore what pins it.
interface ChatStyleValues {
  size: string;
  heading: string;
  table: string;
  code: string;
}

function readChatStyleValues(css: string): ChatStyleValues | undefined {
  const size = CHAT_STYLE_ANCHORS["markdown font-size"].exec(css)?.[1];
  const heading = CHAT_STYLE_ANCHORS["heading font-size"].exec(css)?.[1];
  const table = CHAT_STYLE_ANCHORS["table font-size"].exec(css)?.[1];
  const code = CHAT_STYLE_ANCHORS["code block font-size"].exec(css)?.[1];
  if (!size || !heading || !table || !code) return undefined;
  return { size, heading, table, code };
}

// A number setting can arrive as anything (a hand-edited settings.json is not
// validated against the schema before it reaches us), and it is interpolated
// into a stylesheet, so it is coerced and clamped rather than trusted. Rounded
// to three places so the emitted calc() stays readable and so float noise
// cannot make an unchanged setting look changed.
function clampSetting(
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = vscode.workspace
    .getConfiguration("kiloCodeKbPatch")
    .get<number>(key, fallback);
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Number(Math.min(max, Math.max(min, n)).toFixed(3));
}

// The font-family value goes verbatim into Kilo's stylesheet. This is the
// user's own setting rather than a trust boundary, but a stray brace or
// semicolon would corrupt the whole sheet and take the chat's styling with it,
// so anything outside what a font-family list needs disqualifies the value and
// it is ignored. The allowed set covers quoted and unquoted family names,
// commas, and var(--custom-prop) references.
const CHAT_FONT_FAMILY_RE = /^[A-Za-z0-9 \-_,.'"()]+$/;

function chatFontFamily(): string {
  const raw = vscode.workspace
    .getConfiguration("kiloCodeKbPatch")
    .get<string>("chatHistoryFontFamily", "");
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return "";
  return CHAT_FONT_FAMILY_RE.test(value) ? value : "";
}

// --- chat-scroll, the stylesheet half ----------------------------------------
// Kilo sizes the chat textarea from a script that runs on every input event: it
// sets the height to `auto`, reads `scrollHeight`, then sets the height to that
// (`ln` in 7.5.15, `Jt` in 7.5.9). The read forces a synchronous layout in
// which the textarea has collapsed to one line, and the textarea shares a flex
// column with the chat history's scroller (.message-list), so in that layout
// the scroller is taller by the collapsed lines, its maximum scrollTop is
// smaller by the same amount, and the browser clamps scrollTop down to it.
// Restoring the height does not restore the scroll position, and Kilo's
// stick-to-bottom logic re-pins only from a ResizeObserver on the scroller,
// which reports final sizes: a keystroke that changes the line count re-pins,
// and the next one that does not leaves the history a couple of lines short of
// the bottom. That alternation is the jitter, visible only while idle (while
// streaming the scroll handler re-pins on every scroll event) and only within
// the collapse distance of the bottom.
//
// `field-sizing: content` hands the sizing to the engine. The height Kilo
// writes inline is overridden (`!important`, since an inline style is a normal
// author declaration and Kilo declares no height of its own for the textarea),
// so the measurement layout never differs from the final one and nothing is
// clamped. Kilo's own min-height and max-height keep bounding the box, and the
// script's cap agrees with that max-height (the harness checks it, see PROBES
// in tools/lib/rules.js). Guarded by @supports so an engine without
// field-sizing (Chrome before 123) keeps stock behavior rather than getting a
// textarea that cannot grow, and scoped to .chat-view so no other textarea is
// touched. The one visible difference is that the textarea is 2px taller,
// because engine sizing counts the border that scrollHeight omits.
//
// Verified in a headless Chromium on a copy of Kilo's layout: stock ends 40px
// short of the bottom after a backspace inside a three-line draft and stays
// there until the line count changes; with this rule the distance is 0 on
// every keystroke that Kilo's own measurement would have clamped. The edits the
// browser itself lays out part-way through are the script half's job, below.
const CHAT_SCROLL_RULE =
  "@supports (field-sizing: content) { .chat-view .prompt-input { field-sizing: content; height: auto !important; } }";

// What the rule assumes about Kilo's stylesheet, matched to decide whether the
// block applies at all: the textarea's own rule still bounds the height both
// ways and forbids the resize handle (an engine-sized height on a box the user
// can drag would fight the drag), and the chat view root the rule is scoped to
// still exists. A build that changed either reads as "missing" in the status
// view and keeps stock behavior, rather than being patched blind.
//
// Exported to the harness, which asserts each anchor matches exactly once and
// cross-checks the max-height against the cap in Kilo's own script.
const CHAT_SCROLL_ANCHORS: Record<string, RegExp> = {
  "prompt-input sizing":
    /\.prompt-input\{[^{}]*?min-height:([^;{}]+);[^{}]*?max-height:([^;{}]+);[^{}]*?resize:none[^{}]*\}/,
  "chat-view root": /\.chat-view\{/,
};

interface PromptSizing {
  minHeight: string;
  maxHeight: string;
}

function readPromptSizing(css: string): PromptSizing | undefined {
  const sizing = CHAT_SCROLL_ANCHORS["prompt-input sizing"].exec(css);
  if (!sizing || !CHAT_SCROLL_ANCHORS["chat-view root"].test(css)) {
    return undefined;
  }
  return { minHeight: sizing[1], maxHeight: sizing[2] };
}

// --- chat-scroll, the script half --------------------------------------------
// With the textarea engine-sized, Kilo's measurement no longer moves anything,
// but the browser lays some edits out part-way through on its own. A backspace
// that empties the last line of a draft leaves the text ending in a newline,
// and the editing command forces a layout before it puts back the placeholder
// break that renders that empty line, so that layout sees the textarea one
// line shorter. The scroller grows by that line in the same layout, its
// maximum scrollTop drops, and the browser clamps the position. The final
// layout is then identical to the one before the keystroke, so neither of
// Kilo's ResizeObservers fires, and the history sits one line short until the
// line count next changes (reported on 7.5.16 with the 1.22.1 rule applied:
// two lines, Enter, a character typed, deleted and typed again, and the
// history 21px short from the deletion on).
//
// So this block records, before each edit of the chat textarea, whether the
// history was at the bottom, within Kilo's own threshold (read out of the
// bundle so the two agree), and after the edit puts it back there. It listens
// on window: beforeinput in the capture phase, which runs before any of Kilo's
// handlers and before the browser touches the DOM, and input in the bubble
// phase, which runs after Solid's document-level delegate has run Kilo's own
// input handler and its measurement, so on an engine without field-sizing it
// covers Kilo's collapse as well. Kilo registers no beforeinput handler and
// stops no input event. The scroll it makes lands within the threshold, which
// the controller's scroll handler treats as benign on every build checked, so
// Kilo's userScrolled state is untouched: a history the user scrolled away
// from is never moved, since it was not at the bottom before the edit. Nothing
// is prevented or stopped, and no other textarea qualifies: the target must be
// textarea.prompt-input inside .chat-view, and the list is found from there.
//
// Verified in the same headless Chromium, driven with real key events: with
// the stylesheet rule alone the backspace that empties the third line leaves
// the history 21px short at a 15px base font; with this block the distance is
// 0 after every keystroke, with or without the rule.
//
// What the block assumes about Kilo, matched to decide whether it is written
// at all: the three class names it reaches the DOM through, each in exactly
// one template, and the controller's default threshold. A build that renamed
// or duplicated any reads as "missing" in the status view and keeps stock
// behavior, rather than carrying a script that finds nothing. Exported to the
// harness, whose probe asserts the same on every pristine build.
const CHAT_SCROLL_SCRIPT_ANCHORS: Record<string, RegExp> = {
  "message-list template": /<div class=message-list[ >]/,
  "chat-view template": /class=chat-view[ >]/,
  "prompt-input template": /<textarea class=prompt-input /,
  "bottom threshold": /bottomThreshold\?\?(\d+)/,
};

// Kilo's own "at the bottom" distance in px, or undefined when any anchor is
// missing or ambiguous.
// Whether every anchor matches exactly once, which is what makes a value read
// through one a fact about this build rather than a guess.
function anchorsEachOnce(js: string, anchors: Record<string, RegExp>): boolean {
  return Object.values(anchors).every(
    (re) => (js.match(new RegExp(re.source, "g")) ?? []).length === 1,
  );
}

function readScrollThreshold(js: string): number | undefined {
  if (!anchorsEachOnce(js, CHAT_SCROLL_SCRIPT_ANCHORS)) return undefined;
  const threshold = Number(
    CHAT_SCROLL_SCRIPT_ANCHORS["bottom threshold"].exec(js)?.[1],
  );
  return Number.isInteger(threshold) ? threshold : undefined;
}

// The block's body. Plain source rather than minified, since it is read in
// place by anyone who opens the bundle to see what changed.
function chatScrollScript(threshold: number): string {
  return [
    "(() => {",
    "  // Kilo Code KB Patch: keep the chat history at the bottom across an edit",
    "  // of the chat box, which the browser can lay out part-way through and",
    "  // clamp the history's scroller on. Before the edit, note whether the",
    "  // history was at the bottom; after it, put it back there.",
    "  const listOf = (e) => {",
    "    const t = e.target;",
    '    return t instanceof HTMLTextAreaElement && t.matches("textarea.prompt-input")',
    '      ? t.closest(".chat-view")?.querySelector(".message-list") ?? null',
    "      : null;",
    "  };",
    "  let pinned = null;",
    '  window.addEventListener("beforeinput", (e) => {',
    "    const list = listOf(e);",
    `    pinned = list && list.scrollHeight - list.clientHeight - list.scrollTop < ${threshold} ? list : null;`,
    "  }, true);",
    '  window.addEventListener("input", (e) => {',
    "    const list = pinned;",
    "    pinned = null;",
    "    if (list && list === listOf(e)) list.scrollTop = list.scrollHeight;",
    "  });",
    "})();",
  ].join("\n");
}

// --- hover-guard, a script block ---------------------------------------------
// While you type, macOS hides the mouse cursor: Chromium's Cocoa view hides it
// on every key down without Command while a text field has focus, until the
// mouse moves. The renderer is never told (the page's cursor-visible flag is
// only ever fed on Windows and Linux), so after every layout it still
// re-hovers whatever now sits under the pointer's last known position, sending
// pointerover, pointerenter, mouseover and mouseenter to it (and the out and
// leave side to what it left), at the old coordinates and with no move event.
// Kilo's menus and tooltips act on exactly those: the @-mention and slash
// menus highlight a row on mouseenter, so a row the opening menu puts under
// the hidden pointer becomes the selection Enter picks, and every tooltip
// trigger opens on pointerenter, so a button that a growing chat box pushes
// under the pointer shows its tooltip (reported on 7.5.16 with "New Worktree").
//
// So this block notes, on each key down that hides the cursor (the Cocoa
// view's own rule: a trusted key down in the chat textarea, not a bare
// modifier, without Command), that the cursor is hidden, and while it is,
// stops the enter events that sit exactly where the previous event of their
// kind did, in the capture phase on window, ahead of every handler of Kilo's,
// Solid's document-level delegate included. Any pointer or mouse event from a
// new position means the mouse moved and the cursor is back, and passes. Out
// and leave events are never stopped: they only ever close something. Pointer
// and mouse events round their coordinates differently (a pointer event keeps
// the fraction a mouse event truncates), so each family is compared with its
// own predecessor rather than with a shared position. Nothing is prevented,
// the engine's :hover state is untouched (no script can stop it, so a button
// under the hidden pointer keeps its hover color), and no Kilo symbol is
// involved.
//
// Verified in the same headless Chromium, driven with real key and mouse
// events: with the pointer parked above the session actions row, the third
// Enter moved "New Worktree" under it and stock fired pointerenter on the
// button; typing "@" then opened the menu with its fifth row under the pointer
// and stock fired mouseenter on that row, making it the selection. With this
// block both are stopped and the top row stays selected; a real move onto
// another row while the cursor is hidden still selects that row (its enter
// events carry new coordinates), and re-opening the menu under the still
// pointer is stopped again.
//
// What the block assumes about Kilo: the two class names it reaches the chat
// textarea through, each in exactly one template, shared with the chat-scroll
// script. A build that renamed either reads as "missing" in the status view
// and keeps stock behavior.
const HOVER_GUARD_ANCHORS: Record<string, RegExp> = {
  "chat-view template": CHAT_SCROLL_SCRIPT_ANCHORS["chat-view template"],
  "prompt-input template": CHAT_SCROLL_SCRIPT_ANCHORS["prompt-input template"],
};

function hoverGuardAnchorsPresent(js: string): boolean {
  return anchorsEachOnce(js, HOVER_GUARD_ANCHORS);
}

// The block's body, plain source like the chat-scroll script's.
function hoverGuardScript(): string {
  return [
    "(() => {",
    "  // Kilo Code KB Patch: while you type, macOS hides the mouse cursor, but the",
    "  // page is never told, and the browser keeps re-hovering whatever a layout",
    "  // change moves under the pointer's last position: a menu row highlights, a",
    "  // tooltip opens. Those updates arrive as enter events at the pointer's old",
    "  // coordinates, with no move event, so while the cursor is hidden they are",
    "  // stopped before any handler sees them. The first event from a new",
    "  // position means the mouse moved and the cursor is back.",
    '  const MODIFIERS = new Set(["Alt", "AltGraph", "CapsLock", "Control", "Fn", "FnLock", "Hyper", "Meta", "NumLock", "ScrollLock", "Shift", "Super", "Symbol", "SymbolLock"]);',
    '  const ENTER = ["pointerover", "pointerenter", "mouseover", "mouseenter"];',
    '  const OTHER = ["pointermove", "mousemove", "pointerout", "pointerleave", "mouseout", "mouseleave", "pointerdown", "mousedown", "pointerup", "mouseup"];',
    "  const last = { pointer: null, mouse: null };",
    "  let hidden = false;",
    "  // Pointer and mouse events round their coordinates differently, so each",
    "  // family is compared with its own last event.",
    "  const still = (e) => {",
    '    const kind = e.type.startsWith("pointer") ? "pointer" : "mouse";',
    "    const prev = last[kind];",
    "    last[kind] = [e.screenX, e.screenY];",
    "    if (prev && prev[0] === e.screenX && prev[1] === e.screenY) return true;",
    "    hidden = false;",
    "    return false;",
    "  };",
    '  window.addEventListener("keydown", (e) => {',
    "    if (!e.isTrusted || e.metaKey || MODIFIERS.has(e.key)) return;",
    "    const t = e.target;",
    '    if (t instanceof HTMLTextAreaElement && t.matches("textarea.prompt-input") && t.closest(".chat-view")) hidden = true;',
    "  }, true);",
    "  for (const type of ENTER) {",
    "    window.addEventListener(type, (e) => {",
    "      if (e.isTrusted && still(e) && hidden) e.stopImmediatePropagation();",
    "    }, true);",
    "  }",
    "  for (const type of OTHER) {",
    "    window.addEventListener(type, (e) => {",
    "      if (e.isTrusted) still(e);",
    "    }, true);",
    "  }",
    "})();",
  ].join("\n");
}

// The block for one key, or "" when this build does not look the way the
// script assumes, which leaves the bundle byte-identical to Kilo's.
function chatScriptBlock(key: ChatScriptBlockKey, pristineJs: string): string {
  if (key === "hover-guard") {
    return hoverGuardAnchorsPresent(pristineJs)
      ? patchBlock(key, hoverGuardScript())
      : "";
  }
  const threshold = readScrollThreshold(pristineJs);
  return threshold === undefined
    ? ""
    : patchBlock(key, chatScrollScript(threshold));
}

// The rules one block asks for, given the settings and this build's own
// declarations. Empty means the block is not written at all, which is what
// leaves webview.css byte-identical to Kilo's when the core block does not
// apply and both bonuses are off.
function chatCssRules(key: ChatCssBlockKey, pristineCss: string): string[] {
  if (key === "chat-scroll") {
    return readPromptSizing(pristineCss) ? [CHAT_SCROLL_RULE] : [];
  }
  if (key === "math") {
    // Gated on the math bonus as a whole: sizing math the user cannot produce
    // would be a rule with nothing to style.
    if (!chatMathRenderingEnabled()) return [];
    const em = clampSetting("chatMathFontSizeEm", KATEX_DEFAULT_EM, 0.5, 2);
    if (em === KATEX_DEFAULT_EM) return [];
    return [`${CHAT_ANY_MD} .katex { font-size: ${em}em; }`];
  }

  const rules: string[] = [];
  const scale = clampSetting("chatHistoryFontSizeEm", 1, 0.5, 3);
  const values = scale === 1 ? undefined : readChatStyleValues(pristineCss);
  if (values) {
    rules.push(
      `${CHAT_ASSISTANT_MD} { font-size: calc(${values.size} * ${scale}); }`,
      `${CHAT_ASSISTANT_MD} :is(h1, h2, h3, h4, h5, h6) { font-size: calc(${values.heading} * ${scale}); }`,
      `${CHAT_ASSISTANT_MD} table { font-size: calc(${values.table} * ${scale}); }`,
      `${CHAT_ASSISTANT_MD} pre { font-size: ${values.code}; }`,
      // Monospace content stays at the size Kilo would have given it. Kilo
      // declares a family for these two and no size, so without a rule they
      // follow the scaled container, and "code is not affected" would hold for
      // fenced blocks but not for the `code` spans and file paths in the middle
      // of a sentence.
      `${CHAT_ASSISTANT_MD} :not(pre) > code { font-size: ${values.size}; }`,
      `${CHAT_ASSISTANT_MD} a.file-path-link { font-size: ${values.size}; }`,
    );
  }
  const family = chatFontFamily();
  if (family) rules.push(`${CHAT_ASSISTANT_MD} { font-family: ${family}; }`);
  return rules;
}

// One block's text, or "" when it asks for no rules. Kilo wraps its own
// component rules in `@layer components`, and an unlayered rule beats a layered
// one whatever the specificity, so appending plain rules at the end of the file
// is enough to win without !important.
function chatCssBlock(key: ChatCssBlockKey, pristineCss: string): string {
  const rules = chatCssRules(key, pristineCss);
  return rules.length === 0 ? "" : patchBlock(key, rules.join("\n"));
}

// What the core blocks should do in one reconcile pass: true writes the current
// form, false removes the block. Apply Patches and Restore Originals pass one;
// a bonus reconcile passes nothing.
type CoreCssDecision = Record<ChatCssCoreKey, boolean>;

function coreCssDecision(on: boolean): CoreCssDecision {
  return Object.fromEntries(
    CHAT_CSS_CORE.map((key) => [key, on]),
  ) as CoreCssDecision;
}

// Rewrite the appended blocks in Kilo's stylesheet and report which changed.
// Bonus blocks follow the settings. The core blocks follow `core` when it is
// passed, and are otherwise carried over exactly as found: a bonus reconcile
// (activation, a settings change) must neither apply a core patch without the
// apply prompt nor drop one, and a stale form is left for Apply to rewrite, the
// way a bundle patch's `previous` is.
function reconcileChatStyle(
  extPath: string,
  core?: CoreCssDecision,
): Record<ChatCssBlockKey, boolean> {
  return reconcileBlocks(
    path.join(extPath, "dist", CHAT_STYLE_FILE),
    CHAT_CSS_BLOCKS,
    (key, pristine, current) =>
      isChatCssCore(key)
        ? core
          ? core[key]
            ? chatCssBlock(key, pristine)
            : ""
          : current
        : chatCssBlock(key, pristine),
  );
}

// The stylesheet's core rows for the status view.
function chatCssCoreStatus(
  css: string,
): { label: string; state: FeatureState }[] {
  return blockCoreStatus(css, CHAT_CSS_CORE, stripChatCss, chatCssBlock);
}

// Whether the stylesheet already carries exactly what the settings ask for, for
// the status view. "off" is the caller's job: this only distinguishes a file
// that matches from one that has yet to be reloaded.
function chatCssApplied(extPath: string, key: ChatCssBlockKey): boolean {
  const cssPath = path.join(extPath, "dist", CHAT_STYLE_FILE);
  if (!fs.existsSync(cssPath)) return false;
  const content = fs.readFileSync(cssPath, "utf8");
  const desired = chatCssBlock(key, stripChatCss(content));
  return (patchBlockRe(key).exec(content)?.[0] ?? "") === desired;
}

// Write (Apply) or remove (Restore) the core script blocks. Nothing else has a
// say on this file's blocks: the bundle's bonuses are splices elsewhere in it,
// and a splice neither sees nor moves an appended block.
function reconcileChatScript(
  extPath: string,
  on: boolean,
): Record<ChatScriptBlockKey, boolean> {
  return reconcileBlocks(
    path.join(extPath, "dist", CHAT_SCRIPT_FILE),
    CHAT_SCRIPT_BLOCKS,
    (key, pristine) => (on ? chatScriptBlock(key, pristine) : ""),
  );
}

// The bundle's core block rows for the status view, listed with its splices.
function chatScriptCoreStatus(
  js: string,
): { label: string; state: FeatureState }[] {
  return blockCoreStatus(
    js,
    CHAT_SCRIPT_CORE,
    stripChatScript,
    chatScriptBlock,
  );
}

// Which bonus files a reconcile pass actually rewrote. Anything true here is a
// change the running session does not reflect until the restart it needs (see
// RestartScope): the window for `title`, the extension host for the rest.
interface BonusChanges {
  title: boolean;
  attach: boolean;
  math: boolean;
  typography: boolean;
}

// One reconcile pass over every bonus. Each reconciler fails safe on its own
// (an unreadable file reads as "unchanged"), so a broken manifest cannot stop
// the webview bundle from reconciling or vice versa.
//
// The math bonus spans two files, a bundle splice for the extensions and a
// stylesheet block for their size, so either one moving counts as that bonus
// having changed.
function reconcileBonuses(extPath: string): BonusChanges {
  let title = false;
  let attach = false;
  let math = false;
  let typography = false;
  try {
    title = reconcileOpenInTabTitle(extPath);
  } catch {}
  try {
    attach = reconcileAttachFileButton(extPath);
  } catch {}
  try {
    math = reconcileMathRendering(extPath);
  } catch {}
  try {
    const css = reconcileChatStyle(extPath);
    typography = css.typography;
    math = math || css.math;
  } catch {}
  return { title, attach, math, typography };
}

// The restart a set of bonus changes needs: the manifest is the one file only
// a window reload re-reads.
function bonusRestartScope(changed: BonusChanges): RestartScope {
  return changed.title ? "window" : "extensions";
}

// Offer the restart that pending bonus changes still need, as one notification
// however many items changed. Callers decide when: right away on a settings
// change, but at activation only after the apply-patches prompt (if any) is
// settled. A bare restart button shown next to that prompt invites restarting
// first, which re-activates this extension before the keyboard patches were
// ever applied.
function notifyBonusRestart(changed: BonusChanges): void {
  const items = [
    ...(changed.title ? ["editor title icon"] : []),
    ...(changed.attach ? ["attach-file button"] : []),
    ...(changed.math ? ["math rendering"] : []),
    ...(changed.typography ? ["chat typography"] : []),
  ];
  if (items.length === 0) return;
  // Two items read as "a and b"; three or more as "a, b and c".
  const list =
    items.length <= 2
      ? items.join(" and ")
      : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
  offerRestart(
    `Kilo Code KB Patch: ${list} updated.`,
    bonusRestartScope(changed),
  );
}

// Every bonus setting paired with the value that means "off" for it. Restore
// Originals writes these back, so a numeric or textual knob is neutralised the
// same way a boolean one is.
const BONUS_SETTING_DEFAULTS: [string, boolean | number | string][] = [
  ["addAttachFileButton", false],
  ["renameOpenInTab", false],
  ["chatMathRendering", false],
  ["chatHistoryFontSizeEm", 1],
  ["chatHistoryFontFamily", ""],
  // KaTeX's own em size, so the default asks for no override at all. Kept in
  // step with the schema default in package.json.
  ["chatMathFontSizeEm", 1.21],
];

// Write a bonus setting back to its off value, but only in the scopes where the
// user has actually set something else (globalValue/workspaceValue/
// workspaceFolderValue defined), so Restore Originals turns the bonus off for
// good without writing settings entries the user never added. An absent or
// already-off entry is left alone.
async function forceSettingOff(
  key: string,
  off: boolean | number | string,
): Promise<void> {
  const config = vscode.workspace.getConfiguration("kiloCodeKbPatch");
  const info = config.inspect<boolean | number | string>(key);
  if (!info) return;
  const scopes: [
    boolean | number | string | undefined,
    vscode.ConfigurationTarget,
  ][] = [
    [info.globalValue, vscode.ConfigurationTarget.Global],
    [info.workspaceValue, vscode.ConfigurationTarget.Workspace],
    [info.workspaceFolderValue, vscode.ConfigurationTarget.WorkspaceFolder],
  ];
  for (const [value, target] of scopes) {
    if (value !== undefined && value !== off) {
      await config.update(key, off, target);
    }
  }
}

// Status for the bonus items, for the status panel only. Each item's state
// comes from its setting first (not enabled -> "off"), then from whether the file
// actually reflects it. Bonus state never affects the verdict.
function computeBonusStatus(extPath: string): BonusStatus[] {
  const cfg = vscode.workspace.getConfiguration("kiloCodeKbPatch");
  const read = (p: string) =>
    fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";

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
      OPEN_IN_TAB_TITLE_RE,
    );
    openInTab = !match
      ? "unavailable"
      : match[0].includes(JSON.stringify(OPEN_IN_TAB_RENAMED))
        ? "on"
        : "pending";
  }

  // The math bonus spans a bundle splice and a stylesheet block, so it reads
  // "on" only when both agree with the settings. Its size is part of it rather
  // than a row of its own: with the bonus off there is nothing to size.
  let math: BonusState = "off";
  if (chatMathRenderingEnabled()) {
    const content = read(path.join(extPath, "dist", "webview.js"));
    const variant = matchingMathExtension(content);
    math = !variant
      ? "unavailable"
      : content.includes(variant.patched) && chatCssApplied(extPath, "math")
        ? "on"
        : "pending";
  }

  // Typography is requested from the settings alone, so a build whose own
  // declarations could not be read still gets a row, and it reads "unavailable"
  // rather than silently "off".
  let typography: BonusState = "off";
  const scale = clampSetting("chatHistoryFontSizeEm", 1, 0.5, 3);
  if (scale !== 1 || chatFontFamily() !== "") {
    const css = read(path.join(extPath, "dist", CHAT_STYLE_FILE));
    typography =
      !css || chatCssRules("typography", stripChatCss(css)).length === 0
        ? "unavailable"
        : chatCssApplied(extPath, "typography")
          ? "on"
          : "pending";
  }

  return [
    {
      label: "Prompt toolbar: + button opens the file picker",
      state: attach,
      needs: "extensions",
    },
    {
      label: 'Editor title: group the "Open in Tab" icon',
      state: openInTab,
      needs: "window",
    },
    {
      label: "Chat: render $...$ and \\[...\\] math",
      state: math,
      needs: "extensions",
    },
    {
      label: "Chat history: size and font of the agent's response",
      state: typography,
      needs: "extensions",
    },
  ];
}

interface PatchResult {
  filename: string;
  applied: string[];
  skipped: string[];
  reverted: string[];
  noChanges: boolean;
}

// --- Apply-time derivation ---------------------------------------------------
//
// Every shipped pattern above was produced by a shape rule in src/rules.js,
// re-derived from the build it targets. Those rules also run here, so a Kilo
// release that only re-minifies is patched on the spot instead of waiting for a
// kb-patch release: of the twelve retargets between 7.4.20 and 7.6.1, nine
// changed nothing but these literals.
//
// The shipped literals stay the fast path, and they are the reviewed one: a
// build someone has actually tested gets the bytes that were tested. Derivation
// only answers for a feature no shipped variant recognizes, which before this
// was the state that left a user on stock Kilo until a release landed.
//
// What a derivation has to satisfy before it is allowed to write, standing in
// for the human who used to read every pattern before it shipped:
//   - its shape matches exactly once in the whole bundle (src/rules.js), and
//     the derived original then occurs exactly once as literal bytes
//   - every symbol it reports appears inside the text it matched, so the edit
//     cannot name something the build binds elsewhere; this is the 7.4.22
//     aliasing failure stated as a property rather than a review step
//   - the feature's gate agrees the build has the behavior being fixed
//   - the assembled file parses
//   - re-applying is a no-op and reversing reproduces the original bytes
// The attach button is deliberately excluded: it names five symbols from
// outside its matched span, so only a MISMATCH read by a human guards it.
const DERIVABLE: readonly FeatureKey[] = [
  "chat-input",
  "chat-escape",
  "mention-escape",
  "chat-history",
  "perm-keys",
  "perm-escape",
  "perm-approve",
  "doc-escape",
  "kiloclaw-edit",
  "kiloclaw-chat",
];

interface DerivedPatch {
  feature: FeatureKey;
  filename: string;
  original: string;
  patched: string;
  description: string;
}

// Derivations are recorded in the bundle they patch, as one more appended
// block, so the record cannot be separated from the thing it describes: it
// survives a kb-patch reinstall, a new profile and a machine move, and Restore
// removes it with the edits. globalState was the obvious home and the wrong
// one, since losing it leaves an install patched by bytes nothing can name,
// and Restore then reverts nothing.
//
// The payload is base64 so the patched text never appears verbatim in the
// file. A second literal copy would break both the guard's "landed exactly
// once" check and the replace() that Restore does.
//
// One record, in webview.js, covering every file: kiloclaw.js has no block
// machinery of its own, and the harness already strips webview.js's blocks to
// recover pristine bytes.
function derivedRecordBlock(patches: DerivedPatch[]): string {
  const payload = Buffer.from(JSON.stringify(patches), "utf8").toString(
    "base64",
  );
  return patchBlock(
    DERIVED_BLOCK,
    `/* Patterns this extension derived for this build, so Restore can reverse
` +
      `   them. Remove with "Kilo Code KB Patch: Restore Originals". */
` +
      `/* ${payload} */`,
  );
}

function readDerivedRecordAt(distDir: string): DerivedPatch[] {
  try {
    return readDerivedRecord(
      fs.readFileSync(path.join(distDir, CHAT_SCRIPT_FILE), "utf8"),
    );
  } catch {
    return [];
  }
}

function readDerivedRecord(js: string): DerivedPatch[] {
  const block = patchBlockRe(DERIVED_BLOCK).exec(js)?.[0];
  if (!block) return [];
  const payload = /\/\* ([A-Za-z0-9+/=]+) \*\//.exec(block)?.[1];
  if (!payload) return [];
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
    return Array.isArray(parsed) ? (parsed as DerivedPatch[]) : [];
  } catch {
    return [];
  }
}

function asPatchDef(p: DerivedPatch): PatchDef {
  return {
    feature: p.feature,
    original: p.original,
    patched: p.patched,
    description: p.description,
  };
}

// The recorded derivations that apply to one file, keeping only those the file
// still carries the text for, so a record that outlives what it describes is
// inert rather than wrong.
function recordedFor(
  record: DerivedPatch[],
  filename: string,
  content: string,
): DerivedPatch[] {
  return record.filter(
    (p) =>
      p.filename === filename &&
      (content.includes(p.patched) || content.includes(p.original)),
  );
}

// A feature is unresolved when nothing known names a site for it in this
// build: no variant's original, patched or previous text is present. That is
// the same reading statusForFile calls "missing", and the only state
// derivation is allowed to answer.
function resolveFeatures(
  content: string,
  patches: PatchDef[],
): { resolved: Map<FeatureKey, PatchDef>; unresolved: Set<FeatureKey> } {
  // Grouped and short-circuited per feature. Asking every variant separately
  // is the O(variants) x 21 MB scan that cost activation 500 ms before 1.24.1,
  // and it would land on the apply path here; the array is newest-first, so
  // the variant that answers sits at index 0 or 1 on a recognized build.
  const byFeature = new Map<FeatureKey, PatchDef[]>();
  for (const p of patches) {
    const variants = byFeature.get(p.feature);
    if (variants) variants.push(p);
    else byFeature.set(p.feature, [p]);
  }
  const resolved = new Map<FeatureKey, PatchDef>();
  const unresolved = new Set<FeatureKey>();
  for (const [key, variants] of byFeature) {
    const answer = variants.find(
      (p) =>
        content.includes(p.patched) ||
        content.includes(p.original) ||
        (p.previous !== undefined && content.includes(p.previous)),
    );
    if (answer) resolved.set(key, answer);
    else unresolved.add(key);
  }
  return { resolved, unresolved };
}

function unresolvedFeatures(
  content: string,
  patches: PatchDef[],
): Set<FeatureKey> {
  return resolveFeatures(content, patches).unresolved;
}

function occurrences(haystack: string, needle: string): number {
  let count = 0;
  let at = 0;
  while ((at = haystack.indexOf(needle, at)) !== -1) {
    count++;
    at += needle.length;
  }
  return count;
}

// One rule's output, admitted only if it satisfies every property above that
// can be judged from the rule alone. The file-level ones (parses, reverses)
// are checked once on the assembled result by deriveFor.
function admissible(
  rule: { key: string; derive: (c: string) => DeriveResult },
  content: string,
): { original: string; patched: string } | undefined {
  const gate = FEATURE_GATES[rule.key as FeatureKey];
  if (gate && !gate(content)) return undefined;

  let result: DeriveResult;
  try {
    result = rule.derive(content);
  } catch {
    return undefined;
  }
  if (
    result.original === undefined ||
    result.patched === undefined ||
    result.patched === result.original
  ) {
    return undefined;
  }
  if (occurrences(content, result.original) !== 1) return undefined;
  if (content.includes(result.patched)) return undefined;
  // Self-containment: an edit that only rearranges what its own anchor matched
  // cannot bind a symbol this build spells differently elsewhere.
  for (const symbol of Object.values(result.symbols ?? {})) {
    if (typeof symbol === "string" && !result.original.includes(symbol)) {
      return undefined;
    }
  }
  return { original: result.original, patched: result.patched };
}

// Derived patterns for one file: what the rules can add for features no
// shipped or remembered variant recognizes. The whole set is proved on an
// in-memory copy before any of it is offered, so a bundle is never written in a
// state no one has checked.
function deriveFor(
  filename: string,
  content: string,
  version: string,
  known: PatchDef[],
  // The caller has usually resolved this already; recomputing it costs a
  // second pass over every stale variant, which on an unrecognized build is
  // the single most expensive thing here.
  wantedFeatures?: Set<FeatureKey>,
): DerivedPatch[] {
  const wanted = wantedFeatures ?? unresolvedFeatures(content, known);
  if (wanted.size === 0) return [];

  const found: DerivedPatch[] = [];
  for (const rule of RULES) {
    if (rule.file !== filename) continue;
    if (!DERIVABLE.includes(rule.key as FeatureKey)) continue;
    if (!wanted.has(rule.key as FeatureKey)) continue;
    const edit = admissible(rule, content);
    if (!edit) continue;
    found.push({
      feature: rule.key as FeatureKey,
      filename,
      original: edit.original,
      patched: edit.patched,
      description: `${rule.description(version)} [derived]`,
    });
  }
  if (found.length === 0) return [];

  // Invertibility, which is what Restore depends on, without a second pass
  // over 21 MB: each edit rewrites bytes that occur once, so reversing it is
  // exact as long as the text it leaves behind is also unique and does not
  // collide with another edit's.
  const texts = new Set<string>();
  for (const p of found) {
    if (occurrences(content, p.patched) !== 0) return [];
    if (texts.has(p.original) || texts.has(p.patched)) return [];
    texts.add(p.original);
    texts.add(p.patched);
  }
  // Whether the assembled file parses is checked on the bytes applyPatches is
  // about to write, so that assembly happens once. See derivedGuard.
  return found;
}

// The gate applyPatches runs before writing a file any derivation touched: the
// result has to parse, and each derived edit has to have landed exactly once so
// Restore can reverse it. A splice can be unique and still leave the bundle
// unparseable, which is not worth discovering on a user's install.
function derivedGuard(
  filename: string,
  derived: DerivedPatch[],
): (modified: string) => boolean {
  return (modified) => {
    for (const p of derived) {
      if (occurrences(modified, p.patched) !== 1) return false;
    }
    try {
      new vm.Script(modified, { filename });
    } catch {
      return false;
    }
    return true;
  };
}

// The patterns to hand apply/restore for one file: everything shipped, plus
// what earlier runs derived and this file still shows, plus anything newly
// derivable. Deriving is skipped for restore, which only ever needs to
// recognize what is already there.
function patchSetFor(
  filename: string,
  filePath: string,
  version: string,
  shipped: PatchDef[],
  mode: "apply" | "restore",
  record: DerivedPatch[] = [],
): {
  patches: PatchDef[];
  derived: DerivedPatch[];
  remembered: DerivedPatch[];
} {
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return { patches: shipped, derived: [], remembered: [] };
  }

  const remembered = recordedFor(record, filename, content);
  // Remembered first, for the same reason as in webviewNeedsPatching: on a
  // build only derivation can answer for, the stored variants are 21 MB of
  // scanning each that cannot match.
  const known = [...remembered.map(asPatchDef), ...shipped];
  // Only the variant that answers for each feature is passed on. The stored
  // array holds every release's variant of every behavior, and at most one of
  // them can match a given build (the invariant the per-release aliasing sweep
  // proves and applyPatches already rests on), so handing over all 128 makes
  // the applier re-scan 21 MB for 118 patterns that cannot match.
  const { resolved, unresolved } = resolveFeatures(content, known);
  const fresh =
    mode === "apply" && unresolved.size > 0
      ? deriveFor(filename, content, version, known, unresolved)
      : [];
  return {
    patches: [...resolved.values(), ...fresh.map(asPatchDef)],
    derived: fresh,
    // What the rewritten record has to keep: entries still doing a job here.
    remembered,
  };
}

// Put `record` into the bundle, replacing whatever record was there, or take
// the block out entirely when there is nothing left to record.
function withDerivedRecord(js: string, record: DerivedPatch[]): string {
  const stripped = js.replace(patchBlockRe(DERIVED_BLOCK), "");
  return record.length > 0 ? stripped + derivedRecordBlock(record) : stripped;
}

// `guard`, when given, sees the assembled bytes and can refuse the write. It is
// how a derived edit earns its way onto disk; a reviewed pattern needs no such
// gate and is not charged for one.
function applyPatches(
  filePath: string,
  patches: PatchDef[],
  guard?: (modified: string) => boolean,
  // Runs on the assembled bytes before the guard sees them, so the derived
  // record lands in the same write as the edits it describes.
  finalize?: (modified: string) => string,
): PatchResult {
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

  if (finalize) modified = finalize(modified);

  if (modified !== content && guard && !guard(modified)) {
    return {
      filename: path.basename(filePath),
      applied: [],
      skipped: [
        ...skipped,
        ...applied.map((a) => `${a} (rejected before write)`),
      ],
      reverted: [],
      noChanges: true,
    };
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

function restorePatches(
  filePath: string,
  patches: PatchDef[],
  finalize?: (modified: string) => string,
): PatchResult {
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

  if (finalize) modified = finalize(modified);

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

// Resolves to whether a restart offer was shown (something was applied or
// restored), so activation's Apply path knows if the held bonus-restart
// notification is already covered by this one or must still be surfaced.
// `pending` is what that held notification would have said: those files moved
// earlier in this session, so the offer here must be strong enough for them.
async function runPatch(
  mode: "apply" | "restore" | "status",
  pending?: BonusChanges,
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
      }`,
    );
    return false;
  }

  const version = extractVersion(extPath);
  const distDir = path.join(extPath, "dist");

  if (mode === "status") {
    // Status always does the real work: it is what someone runs precisely
    // when they doubt the state, so it must not read a cached claim about it.
    const { files, verdict } = computeStatus(distDir);
    showStatusPanel(version, verdict, files, computeBonusStatus(extPath));
    return false;
  }

  const results: PatchResult[] = [];

  // The record lives in webview.js but covers every file, so nothing is
  // written until the whole set is known: webview.js cannot carry a record of
  // kiloclaw.js's derivations that have not been worked out yet.
  const record = readDerivedRecordAt(distDir);
  const plans: {
    fp: FilePatches;
    fpath: string;
    patches: PatchDef[];
    derived: DerivedPatch[];
    remembered: DerivedPatch[];
  }[] = [];
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
    plans.push({
      fp,
      fpath,
      ...patchSetFor(fp.filename, fpath, version, fp.patches, mode, record),
    });
  }

  // Apply keeps every derivation still doing a job and adds the new ones;
  // Restore keeps none, so the block goes with the edits.
  const nextRecord =
    mode === "apply"
      ? plans.flatMap((p) => [...p.remembered, ...p.derived])
      : [];
  const recordWriter = (filename: string) =>
    filename === CHAT_SCRIPT_FILE
      ? (modified: string) => withDerivedRecord(modified, nextRecord)
      : undefined;

  for (const plan of plans) {
    if (mode === "apply") {
      results.push(
        applyPatches(
          plan.fpath,
          plan.patches,
          plan.derived.length > 0
            ? derivedGuard(plan.fp.filename, plan.derived)
            : undefined,
          recordWriter(plan.fp.filename),
        ),
      );
    } else {
      results.push(
        restorePatches(
          plan.fpath,
          plan.patches,
          recordWriter(plan.fp.filename),
        ),
      );
    }
  }

  // The core blocks are applied with the bundle splices (and removed with them
  // below); the bonus blocks in the stylesheet follow the settings.
  if (mode === "apply") {
    results.push(
      blockResult(
        CHAT_STYLE_FILE,
        CHAT_CSS_CORE,
        reconcileChatStyle(extPath, coreCssDecision(true)),
        "apply",
      ),
      blockResult(
        CHAT_SCRIPT_FILE,
        CHAT_SCRIPT_CORE,
        reconcileChatScript(extPath, true),
        "apply",
      ),
    );
  }

  // Restore Originals also turns the bonuses off. Write each present setting
  // back to its off value so it stays off, then reconcile (the reconcilers read
  // the settings, so this reverts every bonus now and stops the next activation
  // from re-applying them). The listener is suspended so its own reconcile
  // cannot double-fire mid-batch; the final settings and files agree.
  let bonusReverted = 0;
  // Only the manifest needs the window: Apply never touches it, Restore does
  // when it puts the editor-title rename back.
  let manifestChanged = pending?.title ?? false;
  if (mode === "restore") {
    suspendReconcile = true;
    try {
      for (const [key, off] of BONUS_SETTING_DEFAULTS) {
        await forceSettingOff(key, off);
      }
      if (reconcileAttachFileButton(extPath)) bonusReverted++;
      if (reconcileOpenInTabTitle(extPath)) {
        bonusReverted++;
        manifestChanged = true;
      }
      if (reconcileMathRendering(extPath)) bonusReverted++;
      const css = reconcileChatStyle(extPath, coreCssDecision(false));
      if (css.typography || css.math) bonusReverted++;
      results.push(
        blockResult(CHAT_STYLE_FILE, CHAT_CSS_CORE, css, "restore"),
        blockResult(
          CHAT_SCRIPT_FILE,
          CHAT_SCRIPT_CORE,
          reconcileChatScript(extPath, false),
          "restore",
        ),
      );
    } finally {
      suspendReconcile = false;
    }
  }

  // Apply leaves the install in the state activation would otherwise re-derive
  // from scratch; Restore leaves it in one we make no claim about.
  if (mode === "apply") markSettled(extPath);
  else clearSettled();

  // Every file this run was going to move has moved, so a status page open
  // beside the notification below reports the result rather than the state the
  // command was run from.
  refreshStatusPanel();

  const totalApplied =
    results.reduce((s, r) => s + r.applied.length + r.reverted.length, 0) +
    bonusReverted;

  const verb = mode === "apply" ? "Patched" : "Restored";

  if (totalApplied > 0) {
    offerRestart(
      `Kilo Code KB Patch: ${verb} ${totalApplied} patch(es) on v${version}.`,
      manifestChanged ? "window" : "extensions",
    );
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
      `Kilo Code KB Patch: Nothing to restore on v${version}. Files are already original.`,
    );
    return false;
  }
  if (verdict === "fully patched") {
    vscode.window.showInformationMessage(
      `Kilo Code KB Patch: v${version} is already fully patched. Nothing to apply.`,
    );
    return false;
  }
  if (verdict === "version not recognized") {
    vscode.window.showWarningMessage(
      `Kilo Code KB Patch: No known patterns match v${version}. Update KB Patch to support it.`,
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
    `Kilo Code KB Patch: ${missing} feature(s) on v${version} have no matching pattern. Update KB Patch to cover them.`,
  );
  return false;
}

// Whether any core webview.js patch is still waiting to be applied.
//
// Grouped by feature and stopped per feature rather than run flat over the
// array, because each test is one full scan of a ~20 MB bundle and the array
// grows by about six variants every time Kilo re-minifies. Flat, a *fully
// patched* install is the worst case rather than the cheapest: no entry
// reports work, so nothing short-circuits and every variant is scanned. That
// was 236 scans and ~520 ms of the ~620 ms activation by v1.24.0, against
// ~190 ms when the array held 40 variants, and it grew about 30 ms per
// release with no ceiling. Per feature the scan stops at the variant that
// matches, so the cost tracks the number of behaviors (which changes when one
// is added) instead of the number of variants (which changes every retarget).
//
// Stopping there is the rule applyPatches already follows: it takes the first
// variant that matches and leaves the rest alone. So once a feature's match is
// found, later variants of that feature cannot describe work Apply would do,
// and a feature whose match reads "already patched" is finished. The aliasing
// sweep run each release proves the stronger property this rests on, that
// exactly one variant of each feature matches any given build.
function webviewNeedsPatching(
  content: string,
  extra: PatchDef[] = [],
): boolean {
  // Remembered derivations come first. On a build patched by derivation none
  // of the stored variants can match, so consulting them first makes every
  // launch re-scan 21 MB for ~240 patterns that cannot answer: 543 ms rather
  // than 14 ms, measured on 7.6.2, which is the pre-1.24.1 regression aimed at
  // exactly the users this path exists for. At most one variant of a feature
  // matches a build, so which one is looked at first is free.
  const byFeature = new Map<FeatureKey, PatchDef[]>();
  for (const patch of [...extra, ...PATCHES[0].patches]) {
    const variants = byFeature.get(patch.feature);
    if (variants) variants.push(patch);
    else byFeature.set(patch.feature, [patch]);
  }
  // A feature nothing here names a site for at all is the state a re-minify
  // leaves behind, and it is collected from this same loop rather than a
  // second pass: asking each variant separately would put the O(variants)
  // scan back on the activation path.
  const unresolved = new Set<FeatureKey>();
  for (const [key, variants] of byFeature) {
    let resolved = false;
    for (const p of variants) {
      if (content.includes(p.patched)) {
        resolved = true;
        break;
      }
      if (content.includes(p.original)) return true;
      if (p.previous && content.includes(p.previous)) return true;
    }
    if (!resolved) unresolved.add(key);
  }

  // Before derivation this state was silent: no variant matched, so nothing
  // reported work and the user stayed on stock Kilo until a release landed.
  // Deriving to answer it costs about 200 ms, paid only on a build no shipped
  // variant recognizes, which is also the only build that can reach here.
  for (const key of unresolved) {
    if (!DERIVABLE.includes(key)) continue;
    const rule = RULES.find(
      (r) => r.key === key && r.file === PATCHES[0].filename,
    );
    if (rule && admissible(rule, content)) return true;
  }
  return false;
}

// --- Settled-state fingerprint -----------------------------------------------
//
// Everything activation does is one question: is this install already in the
// state our patches and settings imply? Answering it reads Kilo's 21 MB bundle
// four times and scans it for anchors and variants, which is 148 ms of
// synchronous work on the extension host at every launch, and the answer is
// "yes, nothing to do" every time after the first.
//
// The answer can only change if Kilo's files changed, our settings changed, or
// kb-patch itself changed. All three are readable without opening a bundle:
// three stat() calls, the settings we contribute, and our own version. When
// that fingerprint matches the one recorded the last time the question was
// answered in full, the answer is still the same.
//
// This is a cache, not a source of truth. Anything that does not match falls
// through to the full check, so the worst case is what activation costs today,
// and Show Status never consults it at all.
const SETTLED_KEY = "settledFingerprint.v1";
const FINGERPRINT_FILES = ["webview.js", "kiloclaw.js", CHAT_STYLE_FILE];

function installFingerprint(extPath: string): string | undefined {
  const parts: string[] = [
    extensionContext?.extension?.packageJSON?.version ?? "?",
    path.basename(extPath),
  ];
  for (const name of FINGERPRINT_FILES) {
    try {
      const s = fs.statSync(path.join(extPath, "dist", name));
      parts.push(`${name}:${s.size}:${s.mtimeMs}`);
    } catch {
      // A file we cannot stat means we cannot claim the install is settled.
      return undefined;
    }
  }
  // The bonus settings decide what the reconcilers would write, so a change to
  // one of them has to invalidate the record even though no file moved.
  // BONUS_SETTING_DEFAULTS keys are bare, as every other reader here expects,
  // so the section has to be named or each lookup misses and a settings change
  // leaves the record standing.
  const config = vscode.workspace.getConfiguration("kiloCodeKbPatch");
  for (const [key, off] of BONUS_SETTING_DEFAULTS) {
    parts.push(`${key}=${String(config.get(key, off))}`);
  }
  return parts.join("|");
}

function isSettled(extPath: string): boolean {
  const now = installFingerprint(extPath);
  return (
    now !== undefined &&
    now === extensionContext?.globalState.get<string>(SETTLED_KEY)
  );
}

// Recorded only where the full check has just run and found nothing left to
// do. Recording it anywhere else would be a claim we have not verified.
function markSettled(extPath: string): void {
  const now = installFingerprint(extPath);
  if (now !== undefined) {
    void extensionContext?.globalState.update(SETTLED_KEY, now);
  }
}

function clearSettled(): void {
  void extensionContext?.globalState.update(SETTLED_KEY, undefined);
}

export function activate(context: vscode.ExtensionContext): void {
  extensionContext = context;

  context.subscriptions.push(
    vscode.commands.registerCommand("kiloCodeKbPatch.apply", () =>
      runPatch("apply"),
    ),
    vscode.commands.registerCommand("kiloCodeKbPatch.restore", () =>
      runPatch("restore"),
    ),
    vscode.commands.registerCommand("kiloCodeKbPatch.status", () =>
      runPatch("status"),
    ),
  );

  // Ahead of every early return below, because this window may be carrying a
  // status page frozen by the same host restart that brought us back.
  replaceStaleStatusPanel();

  // Auto-patch on activation if not yet patched
  const extPath = findLatestKiloExt();
  if (!extPath) return;

  // Registered before the fingerprint check below, so a settings change is
  // still honoured on a launch that skipped the startup reconcile.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (suspendReconcile) return;
      if (!e.affectsConfiguration("kiloCodeKbPatch")) return;
      notifyBonusRestart(reconcileBonuses(extPath));
      markSettled(extPath);
      refreshStatusPanel();
    }),
  );

  // Nothing Kilo owns has moved, our settings are the same, and we are the
  // same build: the full check ran on an earlier launch and found nothing to
  // do, and none of its inputs have changed since.
  if (isSettled(extPath)) return;

  // Reconcile the bonus knobs on startup (self-heals after a Kilo update resets
  // the files) and whenever one of our settings changes. The settings are
  // registered in package.json, so affectsConfiguration reports them reliably and
  // limits the reconcile (which reads the webview bundle) to relevant changes.
  // On the settings path the restart offer shows right away; the startup
  // result is held until the apply-patches decision below is settled.
  const startupBonuses = reconcileBonuses(extPath);
  refreshStatusPanel();

  // Read after the bonus reconcile, which may itself rewrite webview.js, so the
  // needs-patching check sees the reconciled bundle.
  const webviewPath = path.join(extPath, "dist", "webview.js");
  const content = fs.existsSync(webviewPath)
    ? fs.readFileSync(webviewPath, "utf8")
    : "";
  const cssPath = path.join(extPath, "dist", CHAT_STYLE_FILE);
  const cssNeedsPatching =
    fs.existsSync(cssPath) &&
    chatCssCoreStatus(fs.readFileSync(cssPath, "utf8")).some(
      (f) => f.state === "unpatched",
    );
  const scriptNeedsPatching =
    content !== "" &&
    chatScriptCoreStatus(content).some((f) => f.state === "unpatched");
  const needsPatching =
    webviewNeedsPatching(
      content,
      recordedFor(readDerivedRecord(content), PATCHES[0].filename, content).map(
        asPatchDef,
      ),
    ) ||
    cssNeedsPatching ||
    scriptNeedsPatching;

  if (!needsPatching) {
    // The full check just ran and found nothing left to do, which is the one
    // place that claim can be recorded.
    markSettled(extPath);
    notifyBonusRestart(startupBonuses);
    return;
  }

  // A Kilo update resets every patched file at once, so the apply prompt and
  // the bonus restart offer would land together, and the bonus restart button
  // clicked first restarts a session whose keyboard patches were never
  // applied. Show only the Apply/Ignore prompt now. Apply's completion
  // notification carries the restart, sized for the bonus changes too (the
  // manifest among them needs the window); on Ignore or dismissal those
  // changes still need their restart, so the held offer surfaces then.
  vscode.window
    .showInformationMessage(
      `Kilo Code KB Patch: v${extractVersion(extPath)} detected, apply patches?`,
      "Apply",
      "Ignore",
    )
    .then((choice) => {
      if (choice === "Apply") {
        runPatch("apply", startupBonuses).then((offered) => {
          if (!offered) notifyBonusRestart(startupBonuses);
        });
      } else {
        notifyBonusRestart(startupBonuses);
      }
    });
}

export function deactivate(): void {}

// Exposed for the offline test harness only; the extension host ignores extra
// exports, so this has no effect at runtime.
export const __test = {
  PATCHES,
  // The offline harness has no extension host, so it supplies its own context
  // to exercise the derivation record that Apply writes and Restore reads.
  setExtensionContext(context: vscode.ExtensionContext | undefined) {
    extensionContext = context;
  },
  webviewNeedsPatching,
  FEATURE_LABELS,
  FEATURE_GATES,
  MENTION_SPACED_TRIGGER,
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
  MATH_EXTENSIONS,
  matchingMathExtension,
  reconcileMathRendering,
  CHAT_STYLE_FILE,
  CHAT_CSS_BLOCKS,
  stripChatCss,
  patchBlockRe,
  CHAT_SCRIPT_FILE,
  CHAT_SCRIPT_BLOCKS,
  CHAT_SCRIPT_CORE,
  stripChatScript,
  CHAT_SCROLL_SCRIPT_ANCHORS,
  readScrollThreshold,
  chatScrollScript,
  HOVER_GUARD_ANCHORS,
  hoverGuardAnchorsPresent,
  hoverGuardScript,
  chatScriptBlock,
  reconcileChatScript,
  chatScriptCoreStatus,
  CHAT_STYLE_ANCHORS,
  KATEX_DEFAULT_EM,
  readChatStyleValues,
  chatCssRules,
  chatCssBlock,
  chatCssApplied,
  reconcileChatStyle,
  CHAT_CSS_CORE,
  CHAT_SCROLL_RULE,
  CHAT_SCROLL_ANCHORS,
  readPromptSizing,
  coreCssDecision,
  chatCssCoreStatus,
  forceSettingOff,
  BONUS_SETTING_DEFAULTS,
  computeBonusStatus,
  DERIVABLE,
  RULES,
  installFingerprint,
  isSettled,
  markSettled,
  clearSettled,
  admissible,
  unresolvedFeatures,
  deriveFor,
  derivedGuard,
  readDerivedRecord,
  readDerivedRecordAt,
  withDerivedRecord,
  recordedFor,
  patchSetFor,
  resolveFeatures,
  parseKiloVersion,
  compareKiloVersions,
  candidateExtensionRoots,
  KNOWN_EXT_DIRS,
  findLatestKiloExt,
  extractVersion,
};

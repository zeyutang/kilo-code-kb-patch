// The reviewed variants of the attach-file button, newest first.

import type { WebviewVariant } from "../core/features";

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
// Kilo release, so each supported version keeps its own reviewed variant here
// (newest first); at most one answers for a given build. A build no entry
// answers for has the button derived from its own bytes
// (reconcileDerivableBonus), and one the rule cannot read is a silent no-op.
// Per-version symbols: 7.4.20 uses ai/oe/gt/Mn
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

export type AttachButtonDef = WebviewVariant;

export const ATTACH_FILE_BUTTONS: AttachButtonDef[] = [
  {
    // v7.8.2+ (7.8.3 ships the same bundle): container fo→go, tooltip Pn→Ln,
    // icon-button Cn→xn and sync ct→nn, with the when-wrapper's predicate
    // Sr→Ir. Insert Q, create E, the when-wrapper ue, controller A, textarea
    // w, setter K, the indexing accessor a and the glyph "plus" held. Kilo's
    // own mention row, A.selectMention(Mo,w,K,nn), occurs once and pins the
    // four closure locals, and five more calls there name the same textarea,
    // setter and sync (selectSession, selectWorktree, both onKeyDown calls
    // and the slash-command select). prompt.action.attachFile still scores 0
    // across all 508 js/json entries of the vsix, so the caption stays the
    // literal "Attach file".
    //
    // The 7.6.2 sizing class is closed by reading the bundle again: every
    // ghost-variant call in the rule's 2048-byte window is
    // E(xn,{icon:"...",variant:"ghost",size:"small" (database, shield,
    // wand-sparkles, send) with no generic-Button shape there at all, and
    // function xn(e) sets "data-component":"icon-button" with data-size
    // defaulting to normal.
    original:
      "Q(go,E(ue,{get when(){return Ir()},get children(){return E(Ln,{get value(){return a.status().message||a.label()}",
    patched:
      'Q(go,E(Ln,{get value(){return "Attach file"},placement:"top",get children(){return E(xn,{icon:"plus",variant:"ghost",size:"small",onClick:()=>{if(!w)return;w.focus();let _v=w.value,_s=w.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");A.selectMention({type:"file-picker"},w,K,nn)},get"aria-label"(){return "Attach file"}})}}),null),Q(go,E(ue,{get when(){return Ir()},get children(){return E(Ln,{get value(){return a.status().message||a.label()}',
  },
  {
    // v7.8.0+ (7.8.1 ships the same bundle): insert P→Q, the
    // when-wrapper pe→ue and the setter W→K. Container fo, create E, tooltip
    // Pn, icon-button Cn, controller A, textarea w, sync ct, the indexing
    // accessor a and the glyph "plus" held. Kilo's own mention row,
    // A.selectMention(Mo,w,K,ct), occurs once and pins the four closure
    // locals, and prompt.action.attachFile still scores 0 across the vsix, so
    // the caption stays the literal "Attach file".
    original:
      "Q(fo,E(ue,{get when(){return Sr()},get children(){return E(Pn,{get value(){return a.status().message||a.label()}",
    patched:
      'Q(fo,E(Pn,{get value(){return "Attach file"},placement:"top",get children(){return E(Cn,{icon:"plus",variant:"ghost",size:"small",onClick:()=>{if(!w)return;w.focus();let _v=w.value,_s=w.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");A.selectMention({type:"file-picker"},w,K,ct)},get"aria-label"(){return "Attach file"}})}}),null),Q(fo,E(ue,{get when(){return Sr()},get children(){return E(Pn,{get value(){return a.status().message||a.label()}',
  },
  {
    // v7.7.12: tooltip Qn→Pn against 7.7.9, everything else held.
    //
    // There is no reviewed entry for 7.7.6-7.7.7 or for 7.7.9. Those builds
    // ship the toolbar anchor byte for byte (P(fo,E(pe,{... with tooltip Qn)
    // while naming a different mention controller and setter (h and Z on
    // 7.7.6-7.7.7, A and W on 7.7.9), so an entry recognized by its anchor
    // would give one of them the other's button. They take the derived one,
    // which reads both names from the build's own mention row.
    original:
      "P(fo,E(pe,{get when(){return Sr()},get children(){return E(Pn,{get value(){return a.status().message||a.label()}",
    patched:
      'P(fo,E(Pn,{get value(){return "Attach file"},placement:"top",get children(){return E(Cn,{icon:"plus",variant:"ghost",size:"small",onClick:()=>{if(!w)return;w.focus();let _v=w.value,_s=w.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");A.selectMention({type:"file-picker"},w,W,ct)},get"aria-label"(){return "Attach file"}})}}),null),P(fo,E(pe,{get when(){return Sr()},get children(){return E(Pn,{get value(){return a.status().message||a.label()}',
  },
  {
    // v7.7.4+ (7.7.5 derives the same form): container ho→Zo, tooltip Ln→Qn,
    // icon-button kn→Cn, setter Y→Z and sync St→ct, with the when-wrapper's
    // predicate On→Br. Insert P, create B, controller b, textarea w, the
    // when-wrapper me, the indexing accessor a and the glyph "plus" held, and
    // that wrapper is captured by the anchor without being named. Kilo's own
    // mention-menu row, b.selectMention(Yo,w,Z,ct), still occurs exactly once
    // and pins all four closure locals, and its sibling selectSession and
    // selectWorktree rows name the same quadruple; the textarea w is
    // corroborated by the chat-history rule, which derives it too. Caption
    // stays the literal "Attach file": prompt.action.attachFile still scores
    // 0 across all 508 js/json entries of the vsix.
    //
    // The 7.6.2 sizing class is closed by reading the bundle, as in 7.7.3:
    // every ghost-variant call in the rule's 2048-byte window is
    // B(Cn,{icon:"...",variant:"ghost",size:"small" (database, shield,
    // wand-sparkles, send) with no generic-Button shape there at all, and
    // function Cn(e) provably sets "data-component":"icon-button" with
    // data-size defaulting to normal, so the injected button differs from its
    // neighbours in the glyph alone.
    original:
      "P(Zo,B(me,{get when(){return Br()},get children(){return B(Qn,{get value(){return a.status().message||a.label()}",
    patched:
      'P(Zo,B(Qn,{get value(){return "Attach file"},placement:"top",get children(){return B(Cn,{icon:"plus",variant:"ghost",size:"small",onClick:()=>{if(!w)return;w.focus();let _v=w.value,_s=w.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");b.selectMention({type:"file-picker"},w,Z,ct)},get"aria-label"(){return "Attach file"}})}}),null),P(Zo,B(me,{get when(){return Br()},get children(){return B(Qn,{get value(){return a.status().message||a.label()}',
  },
  {
    // v7.7.3: container Lu→ho, tooltip In→Ln, icon-button hn→kn, controller
    // h→b and sync oa→St. Insert P, create B, textarea w, setter Y, indexing
    // accessor a and the glyph "plus" held, and the when-wrapper with its
    // predicate (pe→me, Xn→On) is captured by the anchor without being named.
    // Kilo's own mention-menu row, b.selectMention(ao,w,Y,St), still occurs
    // exactly once and pins all four closure locals, and its sibling
    // selectSession and selectWorktree rows name the same quadruple; the
    // textarea w is corroborated by the chat-history rule, which derives it
    // too. Caption stays the literal "Attach file": prompt.action.attachFile
    // still scores 0 across all 508 js/json entries of the vsix.
    //
    // The 7.6.2 sizing class is closed by reading the bundle, as in 7.7.2:
    // every ghost-variant call in the rule's 2048-byte window is
    // B(kn,{icon:"...",variant:"ghost",size:"small" (database, shield,
    // wand-sparkles, send) with no generic-Button shape there at all, and
    // function kn(e) provably sets "data-component":"icon-button" with
    // data-size defaulting to normal, so the injected button differs from its
    // neighbours in the glyph alone.
    original:
      "P(ho,B(me,{get when(){return On()},get children(){return B(Ln,{get value(){return a.status().message||a.label()}",
    patched:
      'P(ho,B(Ln,{get value(){return "Attach file"},placement:"top",get children(){return B(kn,{icon:"plus",variant:"ghost",size:"small",onClick:()=>{if(!w)return;w.focus();let _v=w.value,_s=w.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");b.selectMention({type:"file-picker"},w,Y,St)},get"aria-label"(){return "Attach file"}})}}),null),P(ho,B(me,{get when(){return On()},get children(){return B(Ln,{get value(){return a.status().message||a.label()}',
  },
  {
    // v7.7.2: container uc→Lu, tooltip Dn→In, icon-button vn→hn, controller
    // b→h, setter Z→Y, sync ia→oa. Insert P, create B, textarea w, indexing
    // accessor a and the glyph "plus" held, and the when-wrapper with its
    // predicate (me→pe, Ft→Xn) are captured by the anchor without being named.
    // Kilo's own mention-menu row, h.selectMention(_s,w,Y,oa), still occurs
    // exactly once and pins all four closure locals, and its sibling
    // selectSession and selectWorktree rows name the same quadruple; the
    // textarea w is corroborated by the chat-history rule, which derives it
    // too. Caption stays the literal "Attach file": prompt.action.attachFile
    // still scores 0 across all 509 js/json entries of the vsix.
    original:
      "P(Lu,B(pe,{get when(){return Xn()},get children(){return B(In,{get value(){return a.status().message||a.label()}",
    patched:
      'P(Lu,B(In,{get value(){return "Attach file"},placement:"top",get children(){return B(hn,{icon:"plus",variant:"ghost",size:"small",onClick:()=>{if(!w)return;w.focus();let _v=w.value,_s=w.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");h.selectMention({type:"file-picker"},w,Y,oa)},get"aria-label"(){return "Attach file"}})}}),null),P(Lu,B(pe,{get when(){return Xn()},get children(){return B(In,{get value(){return a.status().message||a.label()}',
  },
  {
    // v7.7.0+ (7.7.1 derives the same form): container dc→uc, tooltip In→Dn,
    // icon-button bn→vn, textarea k→w, setter W→Z, sync ta→ia. Insert P,
    // create B, controller b, indexing accessor a and the glyph "plus" held,
    // and the when-wrapper is gone from the span. Kilo's own mention-menu row,
    // b.selectMention(uc,w,Z,ia), still occurs exactly once and pins all four
    // closure locals; the textarea w is corroborated by the chat-history rule,
    // which derives the same rename. Caption stays the literal "Attach file":
    // prompt.action.attachFile still scores 0 across the whole vsix.
    original:
      "P(uc,B(me,{get when(){return Ft()},get children(){return B(Dn,{get value(){return a.status().message||a.label()}",
    patched:
      'P(uc,B(Dn,{get value(){return "Attach file"},placement:"top",get children(){return B(vn,{icon:"plus",variant:"ghost",size:"small",onClick:()=>{if(!w)return;w.focus();let _v=w.value,_s=w.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");b.selectMention({type:"file-picker"},w,Z,ia)},get"aria-label"(){return "Attach file"}})}}),null),P(uc,B(me,{get when(){return Ft()},get children(){return B(Dn,{get value(){return a.status().message||a.label()}',
  },
  // v7.6.1: container ws→dc, tooltip Bn→In, button Rt→bn, controller h→b,
  // textarea w→k, setter U→W, sync Dr→ta and when-pred It→ot. Insert P,
  // create B, when-wrapper me, indexing accessor a and the glyph "plus" all
  // held. Kilo's own mention-menu row, b.selectMention(uc,k,W,ta), still
  // occurs exactly once and pins all four closure locals the injected button
  // calls, and the textarea k is corroborated by the chat-history rule, which
  // derives the same rename. The caption stays the literal "Attach file":
  // prompt.action.attachFile still scores 0 across the bundle, as it has
  // since 7.4.17.
  //
  // The button is bn, Kilo's icon-button, which is what the indexing,
  // auto-approve, enhance and send buttons in this row are. Through 1.25.0
  // this entry shipped Lt, the generic text Button, which wraps the same 16px
  // glyph in 12px of horizontal padding: 40x24 against the 22x22 of every
  // neighbour, on a row whose gap is a uniform 4px, which is what made the
  // "+" look pushed away from the rest of the toolbar. An icon-button takes
  // its glyph as an `icon` prop and renders it itself, so this form names one
  // symbol fewer: the sprite icon component (Wo) is no longer referenced at
  // all. previous carries the old form so an install already holding it is
  // rewritten in place instead of gaining a second button.
  {
    original:
      "P(dc,B(me,{get when(){return ot()},get children(){return B(In,{get value(){return a.status().message||a.label()}",
    patched:
      'P(dc,B(In,{get value(){return "Attach file"},placement:"top",get children(){return B(bn,{icon:"plus",variant:"ghost",size:"small",onClick:()=>{if(!k)return;k.focus();let _v=k.value,_s=k.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");b.selectMention({type:"file-picker"},k,W,ta)},get"aria-label"(){return "Attach file"}})}}),null),P(dc,B(me,{get when(){return ot()},get children(){return B(In,{get value(){return a.status().message||a.label()}',
    previous: [
      'P(dc,B(In,{get value(){return "Attach file"},placement:"top",get children(){return B(Lt,{variant:"ghost",size:"small",onClick:()=>{if(!k)return;k.focus();let _v=k.value,_s=k.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");b.selectMention({type:"file-picker"},k,W,ta)},get"aria-label"(){return "Attach file"},get children(){return B(Wo,{name:"plus",size:"small"})}})}}),null),P(dc,B(me,{get when(){return ot()},get children(){return B(In,{get value(){return a.status().message||a.label()}',
    ],
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
      'P(ws,B(Bn,{get value(){return "Attach file"},placement:"top",get children(){return B(fn,{icon:"plus",variant:"ghost",size:"small",onClick:()=>{if(!w)return;w.focus();let _v=w.value,_s=w.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");h.selectMention({type:"file-picker"},w,U,Dr)},get"aria-label"(){return "Attach file"}})}}),null),P(ws,B(me,{get when(){return It()},get children(){return B(Bn,{get value(){return a.status().message||a.label()}',
    // Through 2.0.3 this entry shipped the generic text Button, the same
    // 40x24-against-22x22 mismatch 2.0.1 fixed for 7.6.1+. The toolbar
    // refactor landed in 7.6.0, not 7.6.2, so 7.6.0 was the one build left
    // behind: it already has the icon-button component and an icon-button
    // indexing neighbour, and only this entry still wrapped the glyph in a
    // text button. previous rewrites an install already holding that form
    // in place rather than letting a fresh apply add a second button.
    previous: [
      'P(ws,B(Bn,{get value(){return "Attach file"},placement:"top",get children(){return B(Rt,{variant:"ghost",size:"small",onClick:()=>{if(!w)return;w.focus();let _v=w.value,_s=w.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");h.selectMention({type:"file-picker"},w,U,Dr)},get"aria-label"(){return "Attach file"},get children(){return B(Vo,{name:"plus",size:"small"})}})}}),null),P(ws,B(me,{get when(){return It()},get children(){return B(Bn,{get value(){return a.status().message||a.label()}',
    ],
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

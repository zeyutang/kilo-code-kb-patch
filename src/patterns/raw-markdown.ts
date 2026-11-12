// The reviewed variants of the markdown-source toggle, newest first.

import type { WebviewVariant } from "../core/features";

// --- Bonus raw-markdown toggle ----------------------------------------------
// Kilo renders the agent's reply as markdown and offers no way to see what it
// rendered. The footer under the last text part of an assistant turn
// (`assistant-copy-wrapper`: copy, thumbs up, thumbs down, then the throughput
// readout) already has the source at hand, since its copy button puts exactly
// that text on the clipboard. This bonus adds a button beside it that shows
// the same text in place, in a monospace block, and hides the rendered view
// until it is clicked again.
//
// Reading the source is the whole point of the feature rather than a debugging
// aid: it is how you tell a table Kilo failed to render from one the agent
// wrote wrong, see the literal `$...$` a formula came from, or read a link's
// target without hovering it.
//
// It is two pieces. The splice below adds the button and the toggle, and a
// stylesheet block (see chatCssRules) hides the rendered markdown and styles
// the raw block. The split follows the math bonus: whatever can be done
// without a minified symbol is done in CSS, where nothing needs re-targeting.
//
// The button carries no Solid state. A signal would mean splicing the
// component's `let` chain, a third edit thousands of bytes from this one, for
// one bit that an attribute on the text-part already holds and the stylesheet
// can read. The toggle therefore writes that attribute, appends or removes the
// block, and sets `aria-pressed` for the same reason Kilo's feedback buttons
// do. None of it collides with Solid: the attribute sits on the one element in
// this component Solid sets no attributes on, and the block is appended
// alongside a child Solid's insert placed once and does not track.
export const RAW_MARKDOWN_TOGGLES: WebviewVariant[] = [
  {
    // v7.8.2+ (7.8.3 ships the same bundle): tooltip Pn→Ln and icon-button
    // Cn→xn, the same two components the attach button takes, plus Kilo's
    // memo helper lt→dt inside the captured copy-button text. Insert Q,
    // footer w, create E, the copy handler f and the raw-text accessor o all
    // held.
    original:
      'Q(w,E(Ln,{get value(){return dt(()=>!!m())()?r.t("ui.message.copied"):r.t("ui.message.copyResponse")},placement:"top",gutter:4,get children(){return E(xn,{get icon(){return m()?"check":"copy"},size:"normal",variant:"ghost",onMouseDown:C=>C.preventDefault(),onClick:f,get"aria-label"(){return dt(()=>!!m())()?r.t("ui.message.copied"):r.t("ui.message.copyResponse")}})}}),null)',
    patched:
      'Q(w,E(Ln,{get value(){return dt(()=>!!m())()?r.t("ui.message.copied"):r.t("ui.message.copyResponse")},placement:"top",gutter:4,get children(){return E(xn,{get icon(){return m()?"check":"copy"},size:"normal",variant:"ghost",onMouseDown:C=>C.preventDefault(),onClick:f,get"aria-label"(){return dt(()=>!!m())()?r.t("ui.message.copied"):r.t("ui.message.copyResponse")}})}}),null),Q(w,E(Ln,{value:"Markdown source",placement:"top",gutter:4,get children(){return E(xn,{icon:"code-lines",size:"normal",variant:"ghost","data-slot":"kbp-raw-markdown-toggle","aria-label":"Markdown source","aria-pressed":"false",onMouseDown:_e=>_e.preventDefault(),onClick:_e=>{let _btn=_e.currentTarget,_part=_btn.closest("[data-component=text-part]"),_body=_part&&_part.querySelector("[data-slot=text-part-body]");if(!_body)return;let _pre=_body.querySelector("pre[data-slot=kbp-raw-markdown]");if(_pre){_pre.remove(),_part.removeAttribute("data-kbp-raw-markdown"),_btn.setAttribute("aria-pressed","false");return}_pre=document.createElement("pre"),_pre.setAttribute("data-slot","kbp-raw-markdown"),_pre.textContent=o(),_body.appendChild(_pre),_part.setAttribute("data-kbp-raw-markdown",""),_btn.setAttribute("aria-pressed","true")}})}}),null)',
  },
  {
    // v7.8.0+ (7.8.1 ships the same bundle): insert P→Q. Footer w,
    // create E, tooltip Pn, icon-button Cn, the copy handler f, the memo
    // helper lt and the raw-text accessor o all held.
    original:
      'Q(w,E(Pn,{get value(){return lt(()=>!!m())()?r.t("ui.message.copied"):r.t("ui.message.copyResponse")},placement:"top",gutter:4,get children(){return E(Cn,{get icon(){return m()?"check":"copy"},size:"normal",variant:"ghost",onMouseDown:C=>C.preventDefault(),onClick:f,get"aria-label"(){return lt(()=>!!m())()?r.t("ui.message.copied"):r.t("ui.message.copyResponse")}})}}),null)',
    patched:
      'Q(w,E(Pn,{get value(){return lt(()=>!!m())()?r.t("ui.message.copied"):r.t("ui.message.copyResponse")},placement:"top",gutter:4,get children(){return E(Cn,{get icon(){return m()?"check":"copy"},size:"normal",variant:"ghost",onMouseDown:C=>C.preventDefault(),onClick:f,get"aria-label"(){return lt(()=>!!m())()?r.t("ui.message.copied"):r.t("ui.message.copyResponse")}})}}),null),Q(w,E(Pn,{value:"Markdown source",placement:"top",gutter:4,get children(){return E(Cn,{icon:"code-lines",size:"normal",variant:"ghost","data-slot":"kbp-raw-markdown-toggle","aria-label":"Markdown source","aria-pressed":"false",onMouseDown:_e=>_e.preventDefault(),onClick:_e=>{let _btn=_e.currentTarget,_part=_btn.closest("[data-component=text-part]"),_body=_part&&_part.querySelector("[data-slot=text-part-body]");if(!_body)return;let _pre=_body.querySelector("pre[data-slot=kbp-raw-markdown]");if(_pre){_pre.remove(),_part.removeAttribute("data-kbp-raw-markdown"),_btn.setAttribute("aria-pressed","false");return}_pre=document.createElement("pre"),_pre.setAttribute("data-slot","kbp-raw-markdown"),_pre.textContent=o(),_body.appendChild(_pre),_part.setAttribute("data-kbp-raw-markdown",""),_btn.setAttribute("aria-pressed","true")}})}}),null)',
  },
  {
    // v7.7.12: tooltip Qn→Pn against 7.7.6-7.7.9.
    original:
      'P(w,E(Pn,{get value(){return lt(()=>!!m())()?r.t("ui.message.copied"):r.t("ui.message.copyResponse")},placement:"top",gutter:4,get children(){return E(Cn,{get icon(){return m()?"check":"copy"},size:"normal",variant:"ghost",onMouseDown:C=>C.preventDefault(),onClick:f,get"aria-label"(){return lt(()=>!!m())()?r.t("ui.message.copied"):r.t("ui.message.copyResponse")}})}}),null)',
    patched:
      'P(w,E(Pn,{get value(){return lt(()=>!!m())()?r.t("ui.message.copied"):r.t("ui.message.copyResponse")},placement:"top",gutter:4,get children(){return E(Cn,{get icon(){return m()?"check":"copy"},size:"normal",variant:"ghost",onMouseDown:C=>C.preventDefault(),onClick:f,get"aria-label"(){return lt(()=>!!m())()?r.t("ui.message.copied"):r.t("ui.message.copyResponse")}})}}),null),P(w,E(Pn,{value:"Markdown source",placement:"top",gutter:4,get children(){return E(Cn,{icon:"code-lines",size:"normal",variant:"ghost","data-slot":"kbp-raw-markdown-toggle","aria-label":"Markdown source","aria-pressed":"false",onMouseDown:_e=>_e.preventDefault(),onClick:_e=>{let _btn=_e.currentTarget,_part=_btn.closest("[data-component=text-part]"),_body=_part&&_part.querySelector("[data-slot=text-part-body]");if(!_body)return;let _pre=_body.querySelector("pre[data-slot=kbp-raw-markdown]");if(_pre){_pre.remove(),_part.removeAttribute("data-kbp-raw-markdown"),_btn.setAttribute("aria-pressed","false");return}_pre=document.createElement("pre"),_pre.setAttribute("data-slot","kbp-raw-markdown"),_pre.textContent=o(),_body.appendChild(_pre),_part.setAttribute("data-kbp-raw-markdown",""),_btn.setAttribute("aria-pressed","true")}})}}),null)',
  },
  {
    // v7.7.6+ (7.7.7 and 7.7.9 ship the same footer): create B→E and
    // Kilo's memo helper ut→lt inside the captured copy-button text. Insert
    // P, footer w, tooltip Qn, icon-button Cn, the copy handler f and the
    // raw-text accessor o held.
    original:
      'P(w,E(Qn,{get value(){return lt(()=>!!m())()?r.t("ui.message.copied"):r.t("ui.message.copyResponse")},placement:"top",gutter:4,get children(){return E(Cn,{get icon(){return m()?"check":"copy"},size:"normal",variant:"ghost",onMouseDown:C=>C.preventDefault(),onClick:f,get"aria-label"(){return lt(()=>!!m())()?r.t("ui.message.copied"):r.t("ui.message.copyResponse")}})}}),null)',
    patched:
      'P(w,E(Qn,{get value(){return lt(()=>!!m())()?r.t("ui.message.copied"):r.t("ui.message.copyResponse")},placement:"top",gutter:4,get children(){return E(Cn,{get icon(){return m()?"check":"copy"},size:"normal",variant:"ghost",onMouseDown:C=>C.preventDefault(),onClick:f,get"aria-label"(){return lt(()=>!!m())()?r.t("ui.message.copied"):r.t("ui.message.copyResponse")}})}}),null),P(w,E(Qn,{value:"Markdown source",placement:"top",gutter:4,get children(){return E(Cn,{icon:"code-lines",size:"normal",variant:"ghost","data-slot":"kbp-raw-markdown-toggle","aria-label":"Markdown source","aria-pressed":"false",onMouseDown:_e=>_e.preventDefault(),onClick:_e=>{let _btn=_e.currentTarget,_part=_btn.closest("[data-component=text-part]"),_body=_part&&_part.querySelector("[data-slot=text-part-body]");if(!_body)return;let _pre=_body.querySelector("pre[data-slot=kbp-raw-markdown]");if(_pre){_pre.remove(),_part.removeAttribute("data-kbp-raw-markdown"),_btn.setAttribute("aria-pressed","false");return}_pre=document.createElement("pre"),_pre.setAttribute("data-slot","kbp-raw-markdown"),_pre.textContent=o(),_body.appendChild(_pre),_part.setAttribute("data-kbp-raw-markdown",""),_btn.setAttribute("aria-pressed","true")}})}}),null)',
  },
  {
    // v7.7.4+ (7.7.5 derives the same form): tooltip Ln→Qn and icon-button
    // kn→Cn, the same two components the attach button takes, plus Kilo's
    // memo helper dt→ut inside the captured copy-button text. Insert P,
    // footer w, create B, the copy handler f and the raw-text accessor o all
    // held.
    original:
      'P(w,B(Qn,{get value(){return ut(()=>!!m())()?r.t("ui.message.copied"):r.t("ui.message.copyResponse")},placement:"top",gutter:4,get children(){return B(Cn,{get icon(){return m()?"check":"copy"},size:"normal",variant:"ghost",onMouseDown:C=>C.preventDefault(),onClick:f,get"aria-label"(){return ut(()=>!!m())()?r.t("ui.message.copied"):r.t("ui.message.copyResponse")}})}}),null)',
    patched:
      'P(w,B(Qn,{get value(){return ut(()=>!!m())()?r.t("ui.message.copied"):r.t("ui.message.copyResponse")},placement:"top",gutter:4,get children(){return B(Cn,{get icon(){return m()?"check":"copy"},size:"normal",variant:"ghost",onMouseDown:C=>C.preventDefault(),onClick:f,get"aria-label"(){return ut(()=>!!m())()?r.t("ui.message.copied"):r.t("ui.message.copyResponse")}})}}),null),P(w,B(Qn,{value:"Markdown source",placement:"top",gutter:4,get children(){return B(Cn,{icon:"code-lines",size:"normal",variant:"ghost","data-slot":"kbp-raw-markdown-toggle","aria-label":"Markdown source","aria-pressed":"false",onMouseDown:_e=>_e.preventDefault(),onClick:_e=>{let _btn=_e.currentTarget,_part=_btn.closest("[data-component=text-part]"),_body=_part&&_part.querySelector("[data-slot=text-part-body]");if(!_body)return;let _pre=_body.querySelector("pre[data-slot=kbp-raw-markdown]");if(_pre){_pre.remove(),_part.removeAttribute("data-kbp-raw-markdown"),_btn.setAttribute("aria-pressed","false");return}_pre=document.createElement("pre"),_pre.setAttribute("data-slot","kbp-raw-markdown"),_pre.textContent=o(),_body.appendChild(_pre),_part.setAttribute("data-kbp-raw-markdown",""),_btn.setAttribute("aria-pressed","true")}})}}),null)',
  },
  {
    // v7.7.3: tooltip In→Ln and icon-button hn→kn, the same two components the
    // attach button takes, plus Kilo's memo helper at→dt inside the captured
    // copy-button text. Insert P, footer w, create B, the copy handler f and
    // the raw-text accessor o all held.
    original:
      'P(w,B(Ln,{get value(){return dt(()=>!!m())()?r.t("ui.message.copied"):r.t("ui.message.copyResponse")},placement:"top",gutter:4,get children(){return B(kn,{get icon(){return m()?"check":"copy"},size:"normal",variant:"ghost",onMouseDown:C=>C.preventDefault(),onClick:f,get"aria-label"(){return dt(()=>!!m())()?r.t("ui.message.copied"):r.t("ui.message.copyResponse")}})}}),null)',
    patched:
      'P(w,B(Ln,{get value(){return dt(()=>!!m())()?r.t("ui.message.copied"):r.t("ui.message.copyResponse")},placement:"top",gutter:4,get children(){return B(kn,{get icon(){return m()?"check":"copy"},size:"normal",variant:"ghost",onMouseDown:C=>C.preventDefault(),onClick:f,get"aria-label"(){return dt(()=>!!m())()?r.t("ui.message.copied"):r.t("ui.message.copyResponse")}})}}),null),P(w,B(Ln,{value:"Markdown source",placement:"top",gutter:4,get children(){return B(kn,{icon:"code-lines",size:"normal",variant:"ghost","data-slot":"kbp-raw-markdown-toggle","aria-label":"Markdown source","aria-pressed":"false",onMouseDown:_e=>_e.preventDefault(),onClick:_e=>{let _btn=_e.currentTarget,_part=_btn.closest("[data-component=text-part]"),_body=_part&&_part.querySelector("[data-slot=text-part-body]");if(!_body)return;let _pre=_body.querySelector("pre[data-slot=kbp-raw-markdown]");if(_pre){_pre.remove(),_part.removeAttribute("data-kbp-raw-markdown"),_btn.setAttribute("aria-pressed","false");return}_pre=document.createElement("pre"),_pre.setAttribute("data-slot","kbp-raw-markdown"),_pre.textContent=o(),_body.appendChild(_pre),_part.setAttribute("data-kbp-raw-markdown",""),_btn.setAttribute("aria-pressed","true")}})}}),null)',
  },
  {
    // v7.7.2: tooltip Dn→In and icon-button vn→hn, the same two components the
    // attach button takes, plus Kilo's memo helper rt→at inside the captured
    // copy-button text. Insert P, footer w, create B, the copy handler f and
    // the raw-text accessor o all held.
    original:
      'P(w,B(In,{get value(){return at(()=>!!m())()?r.t("ui.message.copied"):r.t("ui.message.copyResponse")},placement:"top",gutter:4,get children(){return B(hn,{get icon(){return m()?"check":"copy"},size:"normal",variant:"ghost",onMouseDown:C=>C.preventDefault(),onClick:f,get"aria-label"(){return at(()=>!!m())()?r.t("ui.message.copied"):r.t("ui.message.copyResponse")}})}}),null)',
    patched:
      'P(w,B(In,{get value(){return at(()=>!!m())()?r.t("ui.message.copied"):r.t("ui.message.copyResponse")},placement:"top",gutter:4,get children(){return B(hn,{get icon(){return m()?"check":"copy"},size:"normal",variant:"ghost",onMouseDown:C=>C.preventDefault(),onClick:f,get"aria-label"(){return at(()=>!!m())()?r.t("ui.message.copied"):r.t("ui.message.copyResponse")}})}}),null),P(w,B(In,{value:"Markdown source",placement:"top",gutter:4,get children(){return B(hn,{icon:"code-lines",size:"normal",variant:"ghost","data-slot":"kbp-raw-markdown-toggle","aria-label":"Markdown source","aria-pressed":"false",onMouseDown:_e=>_e.preventDefault(),onClick:_e=>{let _btn=_e.currentTarget,_part=_btn.closest("[data-component=text-part]"),_body=_part&&_part.querySelector("[data-slot=text-part-body]");if(!_body)return;let _pre=_body.querySelector("pre[data-slot=kbp-raw-markdown]");if(_pre){_pre.remove(),_part.removeAttribute("data-kbp-raw-markdown"),_btn.setAttribute("aria-pressed","false");return}_pre=document.createElement("pre"),_pre.setAttribute("data-slot","kbp-raw-markdown"),_pre.textContent=o(),_body.appendChild(_pre),_part.setAttribute("data-kbp-raw-markdown",""),_btn.setAttribute("aria-pressed","true")}})}}),null)',
  },
  {
    // v7.7.0+ (7.7.1 derives the same form): footer k→w, tooltip In→Dn,
    // icon-button bn→vn. Insert P, create B, the copy handler f and the
    // raw-text accessor o all held.
    original:
      'P(w,B(Dn,{get value(){return rt(()=>!!m())()?r.t("ui.message.copied"):r.t("ui.message.copyResponse")},placement:"top",gutter:4,get children(){return B(vn,{get icon(){return m()?"check":"copy"},size:"normal",variant:"ghost",onMouseDown:C=>C.preventDefault(),onClick:f,get"aria-label"(){return rt(()=>!!m())()?r.t("ui.message.copied"):r.t("ui.message.copyResponse")}})}}),null)',
    patched:
      'P(w,B(Dn,{get value(){return rt(()=>!!m())()?r.t("ui.message.copied"):r.t("ui.message.copyResponse")},placement:"top",gutter:4,get children(){return B(vn,{get icon(){return m()?"check":"copy"},size:"normal",variant:"ghost",onMouseDown:C=>C.preventDefault(),onClick:f,get"aria-label"(){return rt(()=>!!m())()?r.t("ui.message.copied"):r.t("ui.message.copyResponse")}})}}),null),P(w,B(Dn,{value:"Markdown source",placement:"top",gutter:4,get children(){return B(vn,{icon:"code-lines",size:"normal",variant:"ghost","data-slot":"kbp-raw-markdown-toggle","aria-label":"Markdown source","aria-pressed":"false",onMouseDown:_e=>_e.preventDefault(),onClick:_e=>{let _btn=_e.currentTarget,_part=_btn.closest("[data-component=text-part]"),_body=_part&&_part.querySelector("[data-slot=text-part-body]");if(!_body)return;let _pre=_body.querySelector("pre[data-slot=kbp-raw-markdown]");if(_pre){_pre.remove(),_part.removeAttribute("data-kbp-raw-markdown"),_btn.setAttribute("aria-pressed","false");return}_pre=document.createElement("pre"),_pre.setAttribute("data-slot","kbp-raw-markdown"),_pre.textContent=o(),_body.appendChild(_pre),_part.setAttribute("data-kbp-raw-markdown",""),_btn.setAttribute("aria-pressed","true")}})}}),null)',
  },
  {
    // v7.6.2: insert P, footer k, create B, tooltip In, icon-button bn, copy
    // handler f, raw-text accessor o. The glyph is Kilo's own "code-lines",
    // which its sprite injector emits a symbol for whether or not Kilo uses
    // it (and this build does use it elsewhere), so no glyph has to be added.
    // Captioned by an English literal: Kilo's catalog has no key for this, and
    // its t() renders a missing key as the key string.
    original:
      'P(k,B(In,{get value(){return nt(()=>!!m())()?r.t("ui.message.copied"):r.t("ui.message.copyResponse")},placement:"top",gutter:4,get children(){return B(bn,{get icon(){return m()?"check":"copy"},size:"normal",variant:"ghost",onMouseDown:C=>C.preventDefault(),onClick:f,get"aria-label"(){return nt(()=>!!m())()?r.t("ui.message.copied"):r.t("ui.message.copyResponse")}})}}),null)',
    patched:
      'P(k,B(In,{get value(){return nt(()=>!!m())()?r.t("ui.message.copied"):r.t("ui.message.copyResponse")},placement:"top",gutter:4,get children(){return B(bn,{get icon(){return m()?"check":"copy"},size:"normal",variant:"ghost",onMouseDown:C=>C.preventDefault(),onClick:f,get"aria-label"(){return nt(()=>!!m())()?r.t("ui.message.copied"):r.t("ui.message.copyResponse")}})}}),null),P(k,B(In,{value:"Markdown source",placement:"top",gutter:4,get children(){return B(bn,{icon:"code-lines",size:"normal",variant:"ghost","data-slot":"kbp-raw-markdown-toggle","aria-label":"Markdown source","aria-pressed":"false",onMouseDown:_e=>_e.preventDefault(),onClick:_e=>{let _btn=_e.currentTarget,_part=_btn.closest("[data-component=text-part]"),_body=_part&&_part.querySelector("[data-slot=text-part-body]");if(!_body)return;let _pre=_body.querySelector("pre[data-slot=kbp-raw-markdown]");if(_pre){_pre.remove(),_part.removeAttribute("data-kbp-raw-markdown"),_btn.setAttribute("aria-pressed","false");return}_pre=document.createElement("pre"),_pre.setAttribute("data-slot","kbp-raw-markdown"),_pre.textContent=o(),_body.appendChild(_pre),_part.setAttribute("data-kbp-raw-markdown",""),_btn.setAttribute("aria-pressed","true")}})}}),null)',
  },
];

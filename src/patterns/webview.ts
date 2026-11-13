// The reviewed core patterns for dist/webview.js, newest first. retarget emits
// the block for a new Kilo build to prepend inside the patches array.

import type { FilePatches } from "../core/features";

export const WEBVIEW_PATCHES: FilePatches = {
  filename: "webview.js",
  patches: [
    // --- v7.8.2+ patterns. 7.8.3 republished 7.8.2's bundles byte for
    //     byte, so one block covers both. Seven entries: perm-escape still
    //     reads off the v7.8.0+ entry below, since its handler me, event J
    //     and feedback opener pe all held.
    //
    //     The first build since 7.7.0 where a patch point changed shape
    //     rather than only its names. Kilo taught the prompt history to
    //     carry the draft's pasted chunks: the keydown handler computes them
    //     in one more declaration and passes them as a fourth argument
    //     (Yn=le.pastes().map(ta=>ta.text), then k.navigate(nr,U(),or,Yn)),
    //     and navigate() answers with {text,pastes} where it returned a
    //     string. The chat-history rule spelled that call out, so 2.1.5
    //     derived the six other patches that moved here and left Up/Down on
    //     Kilo's own routing. The rule now captures what Kilo declares ahead
    //     of the call and passes after the caret (see src/rules/core.ts). The
    //     edit is what it always was: the gate that reads the caret is
    //     byte-identical to 7.8.1's apart from its name.
    //
    //     Against 7.8.1: the chat event ze→$e, which chat-input, chat-escape
    //     and chat-history all name, with the Enter-check f1→A1, send Dn→Ur
    //     and the Escape chain's popup HT→ZT and ghost Be→Ee (goal R, busy
    //     $r, store t held). History moved selectionStart Bt→St,
    //     selectionEnd Ot→rn, caret Rn→or, direction Jn→nr and result Vn→Wr,
    //     while the textarea w, navigator k and text accessor U held.
    //     Mention: slice local rt→tt, text ft→At, caret Le→Re, match bt→ht,
    //     trigger regex vU→CU, close qe→je, query local Ft→Qt, the "@"
    //     offset Ne→Oe and the dead slot Ue→We. Permission: in-textarea
    //     guard $e→rt, element arg Ne→Oe and bare-Enter check ae→re, while
    //     the event J, dialog branch ge, helper W, dispatch le and the
    //     feedback-box signal C held. doc-escape moved its event Ae→we, its
    //     first move since 7.7.9. The chat event took back $e, the letter
    //     7.8.1 gave the permission guard; that guard took rt, 7.8.1's
    //     mention slice local; and Oe names both the mention "@" offset and
    //     the permission element argument, the pair Ne held a build
    //     earlier. ---
    {
      feature: "chat-input",
      original: "A1($e)&&!$e.shiftKey&&($e.preventDefault(),Ur())",
      patched: "A1($e)&&($e.metaKey||$e.ctrlKey)&&($e.preventDefault(),Ur())",
      description: "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.8.2+)",
    },
    {
      feature: "chat-escape",
      original:
        '$e.key!=="Escape"?!1:ZT()?!0:!Ee.text()&&!R.active()&&!$r()?!1:($e.preventDefault(),$e.stopPropagation(),Ee.text()?Ee.dismiss():R.active()?R.cancel():t.abort(),!0)',
      patched:
        '$e.key!=="Escape"?!1:ZT()?!0:!Ee.text()&&!R.active()&&(!$r()||!$e.shiftKey&&$e.target?.value?.trim())?!1:($e.preventDefault(),$e.stopPropagation(),Ee.text()?Ee.dismiss():R.active()?R.cancel():t.abort(),!0)',
      description:
        "Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v7.8.2+)",
    },
    {
      feature: "mention-escape",
      original:
        'let tt=At.substring(0,Re),ht=tt.match(CU);if(!ht){je();return}let Qt=ht[1]??"";if(Oe=(ht.index??0)+(/^\\s/.test(ht[0])?1:0),We&&We.at===Oe&&Qt.startsWith(We.query)){je();return}',
      patched:
        'let tt=At.substring(0,Re),ht=tt.match(CU);if(!ht){We&&At[We.at]!=="@"&&(We=void 0),je();return}let Qt=ht[1]??"";if(Oe=(ht.index??0)+(/^\\s/.test(ht[0])?1:0),We&&We.at===Oe&&Qt.startsWith(We.query)){je();return}',
      description:
        "Mention menu Escape: drops Kilo's recorded @ query once that @ is gone, so deleting and retyping the @ reopens the menu (v7.8.2+)",
    },
    {
      feature: "chat-history",
      original:
        'if(($e.key==="ArrowUp"||$e.key==="ArrowDown")&&!$e.altKey&&!$e.ctrlKey&&!$e.metaKey&&!$e.shiftKey){let St=w?.selectionStart??0,rn=w?.selectionEnd??0;if(St!==rn)return;let or=St,nr=$e.key==="ArrowUp"?"up":"down",Yn=le.pastes().map(ta=>ta.text),Wr=k.navigate(nr,U(),or,Yn)',
      patched:
        'if(($e.key==="ArrowUp"||$e.key==="ArrowDown")&&($e.metaKey||$e.ctrlKey)&&!$e.altKey&&!$e.shiftKey){let St=w?.selectionStart??0,rn=w?.selectionEnd??0;if(St!==rn)return;let or=$e.key==="ArrowUp"?0:U().length,nr=$e.key==="ArrowUp"?"up":"down",Yn=le.pastes().map(ta=>ta.text),Wr=k.navigate(nr,U(),or,Yn)',
      description:
        "Chat history: plain Up/Down stay in the textarea, Cmd/Ctrl+Up/Down step through sent messages (v7.8.2+)",
    },
    {
      feature: "perm-keys",
      original: 'J.key==="Enter":ge?!0:rt?!1:W(Oe)',
      patched:
        'J.key==="Enter":ge?!0:rt?J.target?.value?.trim()?(J.key==="Enter"&&!J.metaKey&&!J.ctrlKey||J.key===" "||J.key==="Escape"&&!J.shiftKey&&!J.ctrlKey):!1:W(Oe)',
      description:
        "Permission skip-predicate: when textarea has non-whitespace content, skip bare Enter/Space/Escape; works regardless of focus (v7.8.2+)",
    },
    {
      feature: "perm-approve",
      original: 'if(re(J)&&!C()){le(J,"once");return}}};',
      patched:
        'if((re(J)||J.key===" "&&!J.metaKey&&!J.ctrlKey&&!J.target?.value?.trim()||J.key==="Enter"&&(J.metaKey||J.ctrlKey))&&!C()){le(J,"once");return}}};',
      description:
        "Permission approve: Cmd/Ctrl+Enter approves always; Space approves when empty/whitespace-only (v7.8.2+)",
    },
    {
      feature: "doc-escape",
      original:
        'we.key!=="Escape"||!t.submitting()&&t.status()==="idle"&&!m()?.active||we.defaultPrevented||(we.preventDefault(),t.abort())',
      patched:
        'we.key!=="Escape"||!t.submitting()&&t.status()==="idle"&&!m()?.active||we.defaultPrevented||!we.shiftKey&&we.target?.value?.trim()||(we.preventDefault(),t.abort())',
      description:
        "Document Escape: bare Escape does not abort when textarea has non-whitespace content; Shift+Escape aborts (v7.8.2+)",
    },
    // --- v7.8.0+ patterns. 7.8.1 republished 7.8.0's bundles byte for
    //     byte, so one block covers both. Seven entries: doc-escape still
    //     reads off the v7.7.9+ entry below. The perm-escape entry here also
    //     serves 7.8.2-7.8.3.
    //
    //     Kilo published six builds in a week (7.7.6, 7.7.7, 7.7.9, 7.7.12,
    //     7.8.0, 7.8.1; 7.7.8, 7.7.10 and 7.7.11 never shipped), and they
    //     form four pattern generations: 7.7.6-7.7.7, 7.7.9, 7.7.12 and
    //     7.8.0-7.8.1, with the permission scope and doc-escape holding
    //     across some of those boundaries. Every rule derived on every one
    //     of them with no change to src/rules.js, and the shipped 2.1.4
    //     had already applied all eight core patches and the math splice
    //     by derivation on each. The two buttons are what broke, and they
    //     now derive too (see DERIVABLE_BONUSES).
    //
    //     Against 7.7.12: the chat event $e→ze, so chat-input, chat-escape
    //     and chat-history each moved that one name (Enter-check f1, send
    //     Dn, popup HT, ghost Be, goal R, busy $r, store t and every history
    //     local held). Mention: slice local nt→rt, trigger regex yU→vU
    //     (7.7.9's spelling again) and the dead slot Ze→Ue. Permission: the
    //     in-textarea guard ze→$e, helper Z→W, element-level handler le→me,
    //     feedback opener me→pe, bare-Enter check ie→ae and dispatch ce→le,
    //     while the event J and element arg Ne held. The chat event and the
    //     permission guard traded letters outright ($e and ze), and three
    //     permission names moved one role along (7.7.12's opener me is the
    //     handler, its handler le the dispatch). ---
    {
      feature: "chat-input",
      original: "f1(ze)&&!ze.shiftKey&&(ze.preventDefault(),Dn())",
      patched: "f1(ze)&&(ze.metaKey||ze.ctrlKey)&&(ze.preventDefault(),Dn())",
      description: "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.8.0+)",
    },
    {
      feature: "chat-escape",
      original:
        'ze.key!=="Escape"?!1:HT()?!0:!Be.text()&&!R.active()&&!$r()?!1:(ze.preventDefault(),ze.stopPropagation(),Be.text()?Be.dismiss():R.active()?R.cancel():t.abort(),!0)',
      patched:
        'ze.key!=="Escape"?!1:HT()?!0:!Be.text()&&!R.active()&&(!$r()||!ze.shiftKey&&ze.target?.value?.trim())?!1:(ze.preventDefault(),ze.stopPropagation(),Be.text()?Be.dismiss():R.active()?R.cancel():t.abort(),!0)',
      description:
        "Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v7.8.0+)",
    },
    {
      feature: "mention-escape",
      original:
        'let rt=ft.substring(0,Le),bt=rt.match(vU);if(!bt){qe();return}let Ft=bt[1]??"";if(Ne=(bt.index??0)+(/^\\s/.test(bt[0])?1:0),Ue&&Ue.at===Ne&&Ft.startsWith(Ue.query)){qe();return}',
      patched:
        'let rt=ft.substring(0,Le),bt=rt.match(vU);if(!bt){Ue&&ft[Ue.at]!=="@"&&(Ue=void 0),qe();return}let Ft=bt[1]??"";if(Ne=(bt.index??0)+(/^\\s/.test(bt[0])?1:0),Ue&&Ue.at===Ne&&Ft.startsWith(Ue.query)){qe();return}',
      description:
        "Mention menu Escape: drops Kilo's recorded @ query once that @ is gone, so deleting and retyping the @ reopens the menu (v7.8.0+)",
    },
    {
      feature: "chat-history",
      original:
        'if((ze.key==="ArrowUp"||ze.key==="ArrowDown")&&!ze.altKey&&!ze.ctrlKey&&!ze.metaKey&&!ze.shiftKey){let Bt=w?.selectionStart??0,Ot=w?.selectionEnd??0;if(Bt!==Ot)return;let Rn=Bt,Jn=ze.key==="ArrowUp"?"up":"down",Vn=k.navigate(Jn,U(),Rn)',
      patched:
        'if((ze.key==="ArrowUp"||ze.key==="ArrowDown")&&(ze.metaKey||ze.ctrlKey)&&!ze.altKey&&!ze.shiftKey){let Bt=w?.selectionStart??0,Ot=w?.selectionEnd??0;if(Bt!==Ot)return;let Rn=ze.key==="ArrowUp"?0:U().length,Jn=ze.key==="ArrowUp"?"up":"down",Vn=k.navigate(Jn,U(),Rn)',
      description:
        "Chat history: plain Up/Down stay in the textarea, Cmd/Ctrl+Up/Down step through sent messages (v7.8.0+)",
    },
    {
      feature: "perm-keys",
      original: 'J.key==="Enter":ge?!0:$e?!1:W(Ne)',
      patched:
        'J.key==="Enter":ge?!0:$e?J.target?.value?.trim()?(J.key==="Enter"&&!J.metaKey&&!J.ctrlKey||J.key===" "||J.key==="Escape"&&!J.shiftKey&&!J.ctrlKey):!1:W(Ne)',
      description:
        "Permission skip-predicate: when textarea has non-whitespace content, skip bare Enter/Space/Escape; works regardless of focus (v7.8.0+)",
    },
    {
      feature: "perm-escape",
      original: 'me=J=>{if(J.key==="Escape"){pe(J);return}}',
      patched:
        'me=J=>{if(J.key==="Escape"&&(J.shiftKey||!J.target?.value?.trim())){pe(J);return}}',
      description:
        "Permission Escape: bare Escape reaches the dialog only when the textarea is empty/whitespace-only; Shift+Escape always does (v7.8.0+)",
    },
    {
      feature: "perm-approve",
      original: 'if(ae(J)&&!C()){le(J,"once");return}}};',
      patched:
        'if((ae(J)||J.key===" "&&!J.metaKey&&!J.ctrlKey&&!J.target?.value?.trim()||J.key==="Enter"&&(J.metaKey||J.ctrlKey))&&!C()){le(J,"once");return}}};',
      description:
        "Permission approve: Cmd/Ctrl+Enter approves always; Space approves when empty/whitespace-only (v7.8.0+)",
    },
    // --- v7.7.12 patterns. Only the chat and mention scopes moved against
    //     7.7.9: the chat send Mn→Dn, the Escape chain's popup VT→HT (7.7.6's
    //     spelling again), the history caret Ln→Rn and the mention trigger
    //     regex vU→yU. The permission scope and doc-escape are byte-identical
    //     to 7.7.9's and read off the v7.7.9+ entries below. ---
    {
      feature: "chat-input",
      original: "f1($e)&&!$e.shiftKey&&($e.preventDefault(),Dn())",
      patched: "f1($e)&&($e.metaKey||$e.ctrlKey)&&($e.preventDefault(),Dn())",
      description: "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.7.12+)",
    },
    {
      feature: "chat-escape",
      original:
        '$e.key!=="Escape"?!1:HT()?!0:!Be.text()&&!R.active()&&!$r()?!1:($e.preventDefault(),$e.stopPropagation(),Be.text()?Be.dismiss():R.active()?R.cancel():t.abort(),!0)',
      patched:
        '$e.key!=="Escape"?!1:HT()?!0:!Be.text()&&!R.active()&&(!$r()||!$e.shiftKey&&$e.target?.value?.trim())?!1:($e.preventDefault(),$e.stopPropagation(),Be.text()?Be.dismiss():R.active()?R.cancel():t.abort(),!0)',
      description:
        "Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v7.7.12+)",
    },
    {
      feature: "mention-escape",
      original:
        'let nt=ft.substring(0,Le),bt=nt.match(yU);if(!bt){qe();return}let Ft=bt[1]??"";if(Ne=(bt.index??0)+(/^\\s/.test(bt[0])?1:0),Ze&&Ze.at===Ne&&Ft.startsWith(Ze.query)){qe();return}',
      patched:
        'let nt=ft.substring(0,Le),bt=nt.match(yU);if(!bt){Ze&&ft[Ze.at]!=="@"&&(Ze=void 0),qe();return}let Ft=bt[1]??"";if(Ne=(bt.index??0)+(/^\\s/.test(bt[0])?1:0),Ze&&Ze.at===Ne&&Ft.startsWith(Ze.query)){qe();return}',
      description:
        "Mention menu Escape: drops Kilo's recorded @ query once that @ is gone, so deleting and retyping the @ reopens the menu (v7.7.12+)",
    },
    {
      feature: "chat-history",
      original:
        'if(($e.key==="ArrowUp"||$e.key==="ArrowDown")&&!$e.altKey&&!$e.ctrlKey&&!$e.metaKey&&!$e.shiftKey){let Bt=w?.selectionStart??0,Ot=w?.selectionEnd??0;if(Bt!==Ot)return;let Rn=Bt,Jn=$e.key==="ArrowUp"?"up":"down",Vn=k.navigate(Jn,U(),Rn)',
      patched:
        'if(($e.key==="ArrowUp"||$e.key==="ArrowDown")&&($e.metaKey||$e.ctrlKey)&&!$e.altKey&&!$e.shiftKey){let Bt=w?.selectionStart??0,Ot=w?.selectionEnd??0;if(Bt!==Ot)return;let Rn=$e.key==="ArrowUp"?0:U().length,Jn=$e.key==="ArrowUp"?"up":"down",Vn=k.navigate(Jn,U(),Rn)',
      description:
        "Chat history: plain Up/Down stay in the textarea, Cmd/Ctrl+Up/Down step through sent messages (v7.7.12+)",
    },
    // --- v7.7.9+ patterns. Every webview scope moved against 7.7.6. Chat
    //     Enter-check g1→f1 and event je→$e (send Mn held), with the Escape
    //     chain's popup HT→VT, ghost Qe→Be and goal L→R (busy $r, store t
    //     held). History moved its event and selectionStart Et→Bt only.
    //     Mention: slice local tt→nt, trigger regex bU→vU, close He→qe, the
    //     "@" offset Oe→Ne and the dead slot We→Ze. Permission: event be→J,
    //     in-textarea guard We→ze, element arg X→Ne, helper Y→Z, the
    //     element-level handler me→le and the feedback opener le→me (the two
    //     traded letters), bare-Enter check W→ie, dispatch te→ce, and the
    //     feedback-box signal perm-approve's last conjunct reads w→C.
    //     doc-escape moved only its event he→Ae. The permission entries and
    //     doc-escape here also serve 7.7.12, and doc-escape 7.8.0-7.8.1. ---
    {
      feature: "chat-input",
      original: "f1($e)&&!$e.shiftKey&&($e.preventDefault(),Mn())",
      patched: "f1($e)&&($e.metaKey||$e.ctrlKey)&&($e.preventDefault(),Mn())",
      description: "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.7.9+)",
    },
    {
      feature: "chat-escape",
      original:
        '$e.key!=="Escape"?!1:VT()?!0:!Be.text()&&!R.active()&&!$r()?!1:($e.preventDefault(),$e.stopPropagation(),Be.text()?Be.dismiss():R.active()?R.cancel():t.abort(),!0)',
      patched:
        '$e.key!=="Escape"?!1:VT()?!0:!Be.text()&&!R.active()&&(!$r()||!$e.shiftKey&&$e.target?.value?.trim())?!1:($e.preventDefault(),$e.stopPropagation(),Be.text()?Be.dismiss():R.active()?R.cancel():t.abort(),!0)',
      description:
        "Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v7.7.9+)",
    },
    {
      feature: "mention-escape",
      original:
        'let nt=ft.substring(0,Le),bt=nt.match(vU);if(!bt){qe();return}let Ft=bt[1]??"";if(Ne=(bt.index??0)+(/^\\s/.test(bt[0])?1:0),Ze&&Ze.at===Ne&&Ft.startsWith(Ze.query)){qe();return}',
      patched:
        'let nt=ft.substring(0,Le),bt=nt.match(vU);if(!bt){Ze&&ft[Ze.at]!=="@"&&(Ze=void 0),qe();return}let Ft=bt[1]??"";if(Ne=(bt.index??0)+(/^\\s/.test(bt[0])?1:0),Ze&&Ze.at===Ne&&Ft.startsWith(Ze.query)){qe();return}',
      description:
        "Mention menu Escape: drops Kilo's recorded @ query once that @ is gone, so deleting and retyping the @ reopens the menu (v7.7.9+)",
    },
    {
      feature: "chat-history",
      original:
        'if(($e.key==="ArrowUp"||$e.key==="ArrowDown")&&!$e.altKey&&!$e.ctrlKey&&!$e.metaKey&&!$e.shiftKey){let Bt=w?.selectionStart??0,Ot=w?.selectionEnd??0;if(Bt!==Ot)return;let Ln=Bt,Jn=$e.key==="ArrowUp"?"up":"down",Vn=k.navigate(Jn,U(),Ln)',
      patched:
        'if(($e.key==="ArrowUp"||$e.key==="ArrowDown")&&($e.metaKey||$e.ctrlKey)&&!$e.altKey&&!$e.shiftKey){let Bt=w?.selectionStart??0,Ot=w?.selectionEnd??0;if(Bt!==Ot)return;let Ln=$e.key==="ArrowUp"?0:U().length,Jn=$e.key==="ArrowUp"?"up":"down",Vn=k.navigate(Jn,U(),Ln)',
      description:
        "Chat history: plain Up/Down stay in the textarea, Cmd/Ctrl+Up/Down step through sent messages (v7.7.9+)",
    },
    {
      feature: "perm-keys",
      original: 'J.key==="Enter":ge?!0:ze?!1:Z(Ne)',
      patched:
        'J.key==="Enter":ge?!0:ze?J.target?.value?.trim()?(J.key==="Enter"&&!J.metaKey&&!J.ctrlKey||J.key===" "||J.key==="Escape"&&!J.shiftKey&&!J.ctrlKey):!1:Z(Ne)',
      description:
        "Permission skip-predicate: when textarea has non-whitespace content, skip bare Enter/Space/Escape; works regardless of focus (v7.7.9+)",
    },
    {
      feature: "perm-escape",
      original: 'le=J=>{if(J.key==="Escape"){me(J);return}}',
      patched:
        'le=J=>{if(J.key==="Escape"&&(J.shiftKey||!J.target?.value?.trim())){me(J);return}}',
      description:
        "Permission Escape: bare Escape reaches the dialog only when the textarea is empty/whitespace-only; Shift+Escape always does (v7.7.9+)",
    },
    {
      feature: "perm-approve",
      original: 'if(ie(J)&&!C()){ce(J,"once");return}}};',
      patched:
        'if((ie(J)||J.key===" "&&!J.metaKey&&!J.ctrlKey&&!J.target?.value?.trim()||J.key==="Enter"&&(J.metaKey||J.ctrlKey))&&!C()){ce(J,"once");return}}};',
      description:
        "Permission approve: Cmd/Ctrl+Enter approves always; Space approves when empty/whitespace-only (v7.7.9+)",
    },
    {
      feature: "doc-escape",
      original:
        'Ae.key!=="Escape"||!t.submitting()&&t.status()==="idle"&&!m()?.active||Ae.defaultPrevented||(Ae.preventDefault(),t.abort())',
      patched:
        'Ae.key!=="Escape"||!t.submitting()&&t.status()==="idle"&&!m()?.active||Ae.defaultPrevented||!Ae.shiftKey&&Ae.target?.value?.trim()||(Ae.preventDefault(),t.abort())',
      description:
        "Document Escape: bare Escape does not abort when textarea has non-whitespace content; Shift+Escape aborts (v7.7.9+)",
    },
    // --- v7.7.6+ patterns (7.7.7 ships the same patterns). Against 7.7.5:
    //     chat Enter-check m1→g1, event Fe→je and send Ut→Mn, with the Escape
    //     chain's popup oU→HT, ghost Pe→Qe and busy Nr→$r (goal L, store t
    //     held). History moved its event, selectionEnd jt→Ot, caret bn→Ln,
    //     direction zn→Jn and result Mn→Vn (selectionStart Et, textarea w,
    //     navigator k and text accessor U held). Mention: trigger regex
    //     uU→bU and the dead slot Ke→We. Permission: in-textarea guard
    //     Ke→We, element-level handler pe→me and feedback opener ce→le.
    //     perm-approve and doc-escape did not move and read off the v7.7.4+
    //     entries below, which is the one place on these two builds where a
    //     keyboard row is served by an older entry. ---
    {
      feature: "chat-input",
      original: "g1(je)&&!je.shiftKey&&(je.preventDefault(),Mn())",
      patched: "g1(je)&&(je.metaKey||je.ctrlKey)&&(je.preventDefault(),Mn())",
      description: "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.7.6+)",
    },
    {
      feature: "chat-escape",
      original:
        'je.key!=="Escape"?!1:HT()?!0:!Qe.text()&&!L.active()&&!$r()?!1:(je.preventDefault(),je.stopPropagation(),Qe.text()?Qe.dismiss():L.active()?L.cancel():t.abort(),!0)',
      patched:
        'je.key!=="Escape"?!1:HT()?!0:!Qe.text()&&!L.active()&&(!$r()||!je.shiftKey&&je.target?.value?.trim())?!1:(je.preventDefault(),je.stopPropagation(),Qe.text()?Qe.dismiss():L.active()?L.cancel():t.abort(),!0)',
      description:
        "Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v7.7.6+)",
    },
    {
      feature: "mention-escape",
      original:
        'let tt=ft.substring(0,Le),bt=tt.match(bU);if(!bt){He();return}let Ft=bt[1]??"";if(Oe=(bt.index??0)+(/^\\s/.test(bt[0])?1:0),We&&We.at===Oe&&Ft.startsWith(We.query)){He();return}',
      patched:
        'let tt=ft.substring(0,Le),bt=tt.match(bU);if(!bt){We&&ft[We.at]!=="@"&&(We=void 0),He();return}let Ft=bt[1]??"";if(Oe=(bt.index??0)+(/^\\s/.test(bt[0])?1:0),We&&We.at===Oe&&Ft.startsWith(We.query)){He();return}',
      description:
        "Mention menu Escape: drops Kilo's recorded @ query once that @ is gone, so deleting and retyping the @ reopens the menu (v7.7.6+)",
    },
    {
      feature: "chat-history",
      original:
        'if((je.key==="ArrowUp"||je.key==="ArrowDown")&&!je.altKey&&!je.ctrlKey&&!je.metaKey&&!je.shiftKey){let Et=w?.selectionStart??0,Ot=w?.selectionEnd??0;if(Et!==Ot)return;let Ln=Et,Jn=je.key==="ArrowUp"?"up":"down",Vn=k.navigate(Jn,U(),Ln)',
      patched:
        'if((je.key==="ArrowUp"||je.key==="ArrowDown")&&(je.metaKey||je.ctrlKey)&&!je.altKey&&!je.shiftKey){let Et=w?.selectionStart??0,Ot=w?.selectionEnd??0;if(Et!==Ot)return;let Ln=je.key==="ArrowUp"?0:U().length,Jn=je.key==="ArrowUp"?"up":"down",Vn=k.navigate(Jn,U(),Ln)',
      description:
        "Chat history: plain Up/Down stay in the textarea, Cmd/Ctrl+Up/Down step through sent messages (v7.7.6+)",
    },
    {
      feature: "perm-keys",
      original: 'be.key==="Enter":ze?!0:We?!1:Y(X)',
      patched:
        'be.key==="Enter":ze?!0:We?be.target?.value?.trim()?(be.key==="Enter"&&!be.metaKey&&!be.ctrlKey||be.key===" "||be.key==="Escape"&&!be.shiftKey&&!be.ctrlKey):!1:Y(X)',
      description:
        "Permission skip-predicate: when textarea has non-whitespace content, skip bare Enter/Space/Escape; works regardless of focus (v7.7.6+)",
    },
    {
      feature: "perm-escape",
      original: 'me=be=>{if(be.key==="Escape"){le(be);return}}',
      patched:
        'me=be=>{if(be.key==="Escape"&&(be.shiftKey||!be.target?.value?.trim())){le(be);return}}',
      description:
        "Permission Escape: bare Escape reaches the dialog only when the textarea is empty/whitespace-only; Shift+Escape always does (v7.7.6+)",
    },
    // --- v7.7.4+ patterns. Two Kilo builds landed the same day (7.7.4 at
    //     07:27Z, 7.7.5 at 12:28Z) and, for the first time here, *both* of
    //     them moved: neither derives 7.7.3's patterns and neither derives
    //     the other's. They agree everywhere except two symbols, so this
    //     block is labelled v7.7.4+ and only chat-escape and mention-escape
    //     carry a separate 7.7.5 entry above their 7.7.4 one (the Escape
    //     chain's popup aU→oU, the mention trigger regex lU→uU). That is
    //     the same arrangement the v7.7.0+ block uses for 7.7.1. The math
    //     render helper is the third place the two differ and it needs no
    //     entry here: 7.7.4 still carries 7.7.3's NQ, so it reads off the
    //     v7.7.3 entry in MATH_EXTENSIONS and only 7.7.5 gets a new one.
    //
    //     For the fourth release running the shipped extension derived and
    //     applied all eight core patches by itself, so the keyboard half
    //     never broke on either build. What derivation cannot cover is the
    //     attach button and the raw-markdown toggle, the two bonuses that
    //     name closure locals outside their matched span; math joined the
    //     derivable set in 2.1.3, so its entry below is the reviewed
    //     literal rather than the thing that was broken.
    //
    //     The churn against 7.7.3 covers every webview scope again, so no
    //     keyboard behavior on either build reads off an older entry: chat
    //     Enter-check g1→m1, event qe→Fe and send Sn→Ut, with the Escape
    //     chain's ghost tt→Pe, goal F→L and busy Cr→Nr (store t held, and
    //     the popup aU held into 7.7.4 before →oU). History moved
    //     selectionStart Bt→Et, caret Tn→bn, direction qn→zn, result Yn→Mn
    //     and the text accessor Z→U, while selectionEnd jt, textarea w and
    //     navigator k held. Mention: slice local nt→tt, close Ne→He, the
    //     "@" offset ze→Oe, the dead slot Ue→Ke and the query local Pt→Ft,
    //     with text ft, match bt and caret Re holding (and the trigger
    //     regex lU held into 7.7.4 before →uU). Permission: event he→be,
    //     dialog branch Oe→je, in-textarea guard Ue→Ke, element-level
    //     handler le→pe, feedback opener pe→ce and dispatch ee→te, while
    //     the element arg X, helper Y and bare-Enter check W held.
    //     doc-escape moved only its event ye→he.
    //
    //     Four names changed role outright, one of them inside its own
    //     scope: 7.7.3's feedback opener pe is now the element-level
    //     handler that calls it, while 7.7.3's permission dialog-branch
    //     predicate Oe is mention's "@" offset, its chat-escape ghost tt is
    //     mention's slice local, and its permission event he is now the
    //     document-level Escape event. The cross-scope pairs repeat one
    //     letter over for the fourth release running: Fe alone names the
    //     event of chat-input, chat-escape and chat-history (qe, Je, Ze
    //     before it), be names all three permission events (he, ke, we),
    //     and Ke names both the mention dead slot and the permission guard
    //     (Ue, Ke, Ue before that). ---
    {
      feature: "chat-input",
      original: "m1(Fe)&&!Fe.shiftKey&&(Fe.preventDefault(),Ut())",
      patched: "m1(Fe)&&(Fe.metaKey||Fe.ctrlKey)&&(Fe.preventDefault(),Ut())",
      description: "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.7.4+)",
    },
    {
      feature: "chat-escape",
      original:
        'Fe.key!=="Escape"?!1:oU()?!0:!Pe.text()&&!L.active()&&!Nr()?!1:(Fe.preventDefault(),Fe.stopPropagation(),Pe.text()?Pe.dismiss():L.active()?L.cancel():t.abort(),!0)',
      patched:
        'Fe.key!=="Escape"?!1:oU()?!0:!Pe.text()&&!L.active()&&(!Nr()||!Fe.shiftKey&&Fe.target?.value?.trim())?!1:(Fe.preventDefault(),Fe.stopPropagation(),Pe.text()?Pe.dismiss():L.active()?L.cancel():t.abort(),!0)',
      description:
        "Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v7.7.5+)",
    },
    {
      feature: "chat-escape",
      original:
        'Fe.key!=="Escape"?!1:aU()?!0:!Pe.text()&&!L.active()&&!Nr()?!1:(Fe.preventDefault(),Fe.stopPropagation(),Pe.text()?Pe.dismiss():L.active()?L.cancel():t.abort(),!0)',
      patched:
        'Fe.key!=="Escape"?!1:aU()?!0:!Pe.text()&&!L.active()&&(!Nr()||!Fe.shiftKey&&Fe.target?.value?.trim())?!1:(Fe.preventDefault(),Fe.stopPropagation(),Pe.text()?Pe.dismiss():L.active()?L.cancel():t.abort(),!0)',
      description:
        "Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v7.7.4+)",
    },
    {
      feature: "mention-escape",
      original:
        'let tt=ft.substring(0,Re),bt=tt.match(uU);if(!bt){He();return}let Ft=bt[1]??"";if(Oe=(bt.index??0)+(/^\\s/.test(bt[0])?1:0),Ke&&Ke.at===Oe&&Ft.startsWith(Ke.query)){He();return}',
      patched:
        'let tt=ft.substring(0,Re),bt=tt.match(uU);if(!bt){Ke&&ft[Ke.at]!=="@"&&(Ke=void 0),He();return}let Ft=bt[1]??"";if(Oe=(bt.index??0)+(/^\\s/.test(bt[0])?1:0),Ke&&Ke.at===Oe&&Ft.startsWith(Ke.query)){He();return}',
      description:
        "Mention menu Escape: drops Kilo's recorded @ query once that @ is gone, so deleting and retyping the @ reopens the menu (v7.7.5+)",
    },
    {
      feature: "mention-escape",
      original:
        'let tt=ft.substring(0,Re),bt=tt.match(lU);if(!bt){He();return}let Ft=bt[1]??"";if(Oe=(bt.index??0)+(/^\\s/.test(bt[0])?1:0),Ke&&Ke.at===Oe&&Ft.startsWith(Ke.query)){He();return}',
      patched:
        'let tt=ft.substring(0,Re),bt=tt.match(lU);if(!bt){Ke&&ft[Ke.at]!=="@"&&(Ke=void 0),He();return}let Ft=bt[1]??"";if(Oe=(bt.index??0)+(/^\\s/.test(bt[0])?1:0),Ke&&Ke.at===Oe&&Ft.startsWith(Ke.query)){He();return}',
      description:
        "Mention menu Escape: drops Kilo's recorded @ query once that @ is gone, so deleting and retyping the @ reopens the menu (v7.7.4+)",
    },
    {
      feature: "chat-history",
      original:
        'if((Fe.key==="ArrowUp"||Fe.key==="ArrowDown")&&!Fe.altKey&&!Fe.ctrlKey&&!Fe.metaKey&&!Fe.shiftKey){let Et=w?.selectionStart??0,jt=w?.selectionEnd??0;if(Et!==jt)return;let bn=Et,zn=Fe.key==="ArrowUp"?"up":"down",Mn=k.navigate(zn,U(),bn)',
      patched:
        'if((Fe.key==="ArrowUp"||Fe.key==="ArrowDown")&&(Fe.metaKey||Fe.ctrlKey)&&!Fe.altKey&&!Fe.shiftKey){let Et=w?.selectionStart??0,jt=w?.selectionEnd??0;if(Et!==jt)return;let bn=Fe.key==="ArrowUp"?0:U().length,zn=Fe.key==="ArrowUp"?"up":"down",Mn=k.navigate(zn,U(),bn)',
      description:
        "Chat history: plain Up/Down stay in the textarea, Cmd/Ctrl+Up/Down step through sent messages (v7.7.4+)",
    },
    {
      feature: "perm-keys",
      original: 'be.key==="Enter":je?!0:Ke?!1:Y(X)',
      patched:
        'be.key==="Enter":je?!0:Ke?be.target?.value?.trim()?(be.key==="Enter"&&!be.metaKey&&!be.ctrlKey||be.key===" "||be.key==="Escape"&&!be.shiftKey&&!be.ctrlKey):!1:Y(X)',
      description:
        "Permission skip-predicate: when textarea has non-whitespace content, skip bare Enter/Space/Escape; works regardless of focus (v7.7.4+)",
    },
    {
      feature: "perm-escape",
      original: 'pe=be=>{if(be.key==="Escape"){ce(be);return}}',
      patched:
        'pe=be=>{if(be.key==="Escape"&&(be.shiftKey||!be.target?.value?.trim())){ce(be);return}}',
      description:
        "Permission Escape: bare Escape reaches the dialog only when the textarea is empty/whitespace-only; Shift+Escape always does (v7.7.4+)",
    },
    {
      feature: "perm-approve",
      original: 'if(W(be)&&!w()){te(be,"once");return}}};',
      patched:
        'if((W(be)||be.key===" "&&!be.metaKey&&!be.ctrlKey&&!be.target?.value?.trim()||be.key==="Enter"&&(be.metaKey||be.ctrlKey))&&!w()){te(be,"once");return}}};',
      description:
        "Permission approve: Cmd/Ctrl+Enter approves always; Space approves when empty/whitespace-only (v7.7.4+)",
    },
    {
      feature: "doc-escape",
      original:
        'he.key!=="Escape"||!t.submitting()&&t.status()==="idle"&&!m()?.active||he.defaultPrevented||(he.preventDefault(),t.abort())',
      patched:
        'he.key!=="Escape"||!t.submitting()&&t.status()==="idle"&&!m()?.active||he.defaultPrevented||!he.shiftKey&&he.target?.value?.trim()||(he.preventDefault(),t.abort())',
      description:
        "Document Escape: bare Escape does not abort when textarea has non-whitespace content; Shift+Escape aborts (v7.7.4+)",
    },
    // --- v7.7.3+ patterns. A pure re-minify of webview.js, in the release
    //     that retired KiloClaw: Kilo dropped dist/kiloclaw.js and
    //     dist/kiloclaw.css along with the KiloClaw commands and every
    //     occurrence of the name, so the two features that patched that
    //     bundle have no site to patch here (see the kiloclaw.js block
    //     below, which keeps them for 7.7.2 and earlier). Every patch point
    //     kept its shape, so tools/lib/rules.js needed no change and all
    //     eleven rules whose file this build still ships derived cleanly
    //     from the 7.7.3 vsix on the first run.
    //
    //     As on 7.7.2, 2.1.1 derived and applied all eight of these by
    //     itself, so the keyboard half never broke and the install read
    //     fully patched. What 7.7.3 broke is again only the three bonuses
    //     that name closure locals outside their matched span and so stay
    //     off the derivation path: the attach button, the math extensions
    //     and the raw-markdown toggle.
    //
    //     The churn, and unlike 7.7.2 it covers every webview scope, so no
    //     keyboard behavior on this build reads off an older entry: chat
    //     Enter-check tg→g1, event Je→qe and send X_→Sn, with the Escape
    //     chain's popup pKe→aU, ghost et→tt and busy kn→Cr (goal F and
    //     store t held). History moved selectionStart Ht→Bt, selectionEnd
    //     yn→jt, caret Ar→Tn, direction Mr→qn and result sr→Yn, while the
    //     textarea w, navigator k and text accessor Z held. Mention: text
    //     $e→ft, match lt→bt, close Oe→Ne, the "@" offset Ne→ze and the
    //     dead slot Ke→Ue. Permission: in-textarea guard Ke→Ue, event
    //     ke→he, element-level handler ce→le and the feedback opener Ae→pe,
    //     while the element arg X, helper Y, bare-Enter check W and dispatch
    //     ee held. doc-escape moved its event be→ye and nothing else, its
    //     nothing-to-abort test and store t both holding.
    //
    //     Two names changed role outright: 7.7.2's chat busy check kn is
    //     7.7.3's icon-button component (so it now names the attach ghost
    //     and the raw-markdown button), and mention's "@" offset Ne is now
    //     its close call, a rotation inside one scope. The cross-scope
    //     pairs repeat one letter over for the third release running: qe
    //     alone names the event of chat-input, chat-escape and chat-history
    //     (Je in 7.7.2, Ze in 7.7.0), he names all three permission events
    //     (ke, we before it), and Ue names both the mention dead slot and
    //     the permission guard (Ke, Ue before it). ---
    {
      feature: "chat-input",
      original: "g1(qe)&&!qe.shiftKey&&(qe.preventDefault(),Sn())",
      patched: "g1(qe)&&(qe.metaKey||qe.ctrlKey)&&(qe.preventDefault(),Sn())",
      description: "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.7.3+)",
    },
    {
      feature: "chat-escape",
      original:
        'qe.key!=="Escape"?!1:aU()?!0:!tt.text()&&!F.active()&&!Cr()?!1:(qe.preventDefault(),qe.stopPropagation(),tt.text()?tt.dismiss():F.active()?F.cancel():t.abort(),!0)',
      patched:
        'qe.key!=="Escape"?!1:aU()?!0:!tt.text()&&!F.active()&&(!Cr()||!qe.shiftKey&&qe.target?.value?.trim())?!1:(qe.preventDefault(),qe.stopPropagation(),tt.text()?tt.dismiss():F.active()?F.cancel():t.abort(),!0)',
      description:
        "Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v7.7.3+)",
    },
    {
      feature: "mention-escape",
      original:
        'let nt=ft.substring(0,Re),bt=nt.match(lU);if(!bt){Ne();return}let Pt=bt[1]??"";if(ze=(bt.index??0)+(/^\\s/.test(bt[0])?1:0),Ue&&Ue.at===ze&&Pt.startsWith(Ue.query)){Ne();return}',
      patched:
        'let nt=ft.substring(0,Re),bt=nt.match(lU);if(!bt){Ue&&ft[Ue.at]!=="@"&&(Ue=void 0),Ne();return}let Pt=bt[1]??"";if(ze=(bt.index??0)+(/^\\s/.test(bt[0])?1:0),Ue&&Ue.at===ze&&Pt.startsWith(Ue.query)){Ne();return}',
      description:
        "Mention menu Escape: drops Kilo's recorded @ query once that @ is gone, so deleting and retyping the @ reopens the menu (v7.7.3+)",
    },
    {
      feature: "chat-history",
      original:
        'if((qe.key==="ArrowUp"||qe.key==="ArrowDown")&&!qe.altKey&&!qe.ctrlKey&&!qe.metaKey&&!qe.shiftKey){let Bt=w?.selectionStart??0,jt=w?.selectionEnd??0;if(Bt!==jt)return;let Tn=Bt,qn=qe.key==="ArrowUp"?"up":"down",Yn=k.navigate(qn,Z(),Tn)',
      patched:
        'if((qe.key==="ArrowUp"||qe.key==="ArrowDown")&&(qe.metaKey||qe.ctrlKey)&&!qe.altKey&&!qe.shiftKey){let Bt=w?.selectionStart??0,jt=w?.selectionEnd??0;if(Bt!==jt)return;let Tn=qe.key==="ArrowUp"?0:Z().length,qn=qe.key==="ArrowUp"?"up":"down",Yn=k.navigate(qn,Z(),Tn)',
      description:
        "Chat history: plain Up/Down stay in the textarea, Cmd/Ctrl+Up/Down step through sent messages (v7.7.3+)",
    },
    {
      feature: "perm-keys",
      original: 'he.key==="Enter":Oe?!0:Ue?!1:Y(X)',
      patched:
        'he.key==="Enter":Oe?!0:Ue?he.target?.value?.trim()?(he.key==="Enter"&&!he.metaKey&&!he.ctrlKey||he.key===" "||he.key==="Escape"&&!he.shiftKey&&!he.ctrlKey):!1:Y(X)',
      description:
        "Permission skip-predicate: when textarea has non-whitespace content, skip bare Enter/Space/Escape; works regardless of focus (v7.7.3+)",
    },
    {
      feature: "perm-escape",
      original: 'le=he=>{if(he.key==="Escape"){pe(he);return}}',
      patched:
        'le=he=>{if(he.key==="Escape"&&(he.shiftKey||!he.target?.value?.trim())){pe(he);return}}',
      description:
        "Permission Escape: bare Escape reaches the dialog only when the textarea is empty/whitespace-only; Shift+Escape always does (v7.7.3+)",
    },
    {
      feature: "perm-approve",
      original: 'if(W(he)&&!w()){ee(he,"once");return}}};',
      patched:
        'if((W(he)||he.key===" "&&!he.metaKey&&!he.ctrlKey&&!he.target?.value?.trim()||he.key==="Enter"&&(he.metaKey||he.ctrlKey))&&!w()){ee(he,"once");return}}};',
      description:
        "Permission approve: Cmd/Ctrl+Enter approves always; Space approves when empty/whitespace-only (v7.7.3+)",
    },
    {
      feature: "doc-escape",
      original:
        'ye.key!=="Escape"||!t.submitting()&&t.status()==="idle"&&!m()?.active||ye.defaultPrevented||(ye.preventDefault(),t.abort())',
      patched:
        'ye.key!=="Escape"||!t.submitting()&&t.status()==="idle"&&!m()?.active||ye.defaultPrevented||!ye.shiftKey&&ye.target?.value?.trim()||(ye.preventDefault(),t.abort())',
      description:
        "Document Escape: bare Escape does not abort when textarea has non-whitespace content; Shift+Escape aborts (v7.7.3+)",
    },
    // --- v7.7.2+ patterns. A pure re-minify of webview.js, the opposite of
    //     7.7.0: every patch point kept its shape, so tools/lib/rules.js
    //     needed no change and all thirteen rules derived cleanly from the
    //     7.7.2 vsix. doc-escape is the one webview scope that did not move
    //     at all (event be, store t, goal accessor m all held), so it still
    //     reads off the v7.7.0+ entry below, and kiloclaw.js changed bytes
    //     again while both of its sites still match the v7.6.0+ patterns.
    //
    //     Worth knowing for the next one: 2.1.0 derived and applied all
    //     seven of these on 7.7.2 by itself, so the keyboard half never
    //     broke for anyone running it and the install read fully patched.
    //     What 7.7.2 did break is the three bonuses that name closure
    //     locals outside their matched span and so cannot be derived at
    //     apply (the attach button, the math extensions and the
    //     raw-markdown toggle); those read unavailable until the variants
    //     further down ship.
    //
    //     The churn: chat scope Enter-check Ym→tg, event Ze→Je, send
    //     Ec→X_, with the Escape chain's popup JVe→pKe, ghost Fe→et and
    //     busy ot→kn (goal F and store t held). The history scope moved
    //     selectionStart qt→Ht, selectionEnd kn→yn, direction Lr→Mr and
    //     the text accessor Y→Z, while the caret Ar, result sr, textarea w
    //     and navigator k held. Mention: text Qe→$e, match gt→lt, close
    //     ze→Oe, dead slot Ue→Ke and the trigger regex RH→$H, with the "@"
    //     offset Ne held. Permission: in-textarea guard Ue→Ke, dialog
    //     branch Re→Fe, helper Z→Y, event we→ke and the feedback opener
    //     fe→Ae, while the element arg X, handler ce, bare-Enter check W
    //     and dispatch ee held.
    //
    //     Cross-scope collision stays wholesale, and repeats 7.7.0's own
    //     pairs one letter over. Je alone names the event of chat-input,
    //     chat-escape and chat-history, exactly as Ze did; Ke names both
    //     the permission in-textarea guard and the mention dead slot, the
    //     role pair Ue held a release ago; and w is at once the
    //     chat-history textarea, the raw-markdown footer element and the
    //     feedback-box signal perm-approve's conjunct reads. Two more
    //     letters changed role outright rather than churning: 7.7.0's chat
    //     ghost-text controller Fe is 7.7.2's permission dialog-branch
    //     predicate, and 7.7.0's chat-history selectionEnd kn is its busy
    //     check. Y is the permission helper here and the attach button's
    //     value setter. ---
    {
      feature: "chat-input",
      original: "tg(Je)&&!Je.shiftKey&&(Je.preventDefault(),X_())",
      patched: "tg(Je)&&(Je.metaKey||Je.ctrlKey)&&(Je.preventDefault(),X_())",
      description: "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.7.2+)",
    },
    {
      feature: "chat-escape",
      original:
        'Je.key!=="Escape"?!1:pKe()?!0:!et.text()&&!F.active()&&!kn()?!1:(Je.preventDefault(),Je.stopPropagation(),et.text()?et.dismiss():F.active()?F.cancel():t.abort(),!0)',
      patched:
        'Je.key!=="Escape"?!1:pKe()?!0:!et.text()&&!F.active()&&(!kn()||!Je.shiftKey&&Je.target?.value?.trim())?!1:(Je.preventDefault(),Je.stopPropagation(),et.text()?et.dismiss():F.active()?F.cancel():t.abort(),!0)',
      description:
        "Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v7.7.2+)",
    },
    {
      feature: "mention-escape",
      original:
        'let Qe=$e.substring(0,me),lt=Qe.match($H);if(!lt){Oe();return}let xt=lt[1]??"";if(Ne=(lt.index??0)+(/^\\s/.test(lt[0])?1:0),Ke&&Ke.at===Ne&&xt.startsWith(Ke.query)){Oe();return}',
      patched:
        'let Qe=$e.substring(0,me),lt=Qe.match($H);if(!lt){Ke&&$e[Ke.at]!=="@"&&(Ke=void 0),Oe();return}let xt=lt[1]??"";if(Ne=(lt.index??0)+(/^\\s/.test(lt[0])?1:0),Ke&&Ke.at===Ne&&xt.startsWith(Ke.query)){Oe();return}',
      description:
        "Mention menu Escape: drops Kilo\u0027s recorded @ query once that @ is gone, so deleting and retyping the @ reopens the menu (v7.7.2+)",
    },
    {
      feature: "chat-history",
      original:
        'if((Je.key==="ArrowUp"||Je.key==="ArrowDown")&&!Je.altKey&&!Je.ctrlKey&&!Je.metaKey&&!Je.shiftKey){let Ht=w?.selectionStart??0,yn=w?.selectionEnd??0;if(Ht!==yn)return;let Ar=Ht,Mr=Je.key==="ArrowUp"?"up":"down",sr=k.navigate(Mr,Z(),Ar)',
      patched:
        'if((Je.key==="ArrowUp"||Je.key==="ArrowDown")&&(Je.metaKey||Je.ctrlKey)&&!Je.altKey&&!Je.shiftKey){let Ht=w?.selectionStart??0,yn=w?.selectionEnd??0;if(Ht!==yn)return;let Ar=Je.key==="ArrowUp"?0:Z().length,Mr=Je.key==="ArrowUp"?"up":"down",sr=k.navigate(Mr,Z(),Ar)',
      description:
        "Chat history: plain Up/Down stay in the textarea, Cmd/Ctrl+Up/Down step through sent messages (v7.7.2+)",
    },
    {
      feature: "perm-keys",
      original: 'ke.key==="Enter":Fe?!0:Ke?!1:Y(X)',
      patched:
        'ke.key==="Enter":Fe?!0:Ke?ke.target?.value?.trim()?(ke.key==="Enter"&&!ke.metaKey&&!ke.ctrlKey||ke.key===" "||ke.key==="Escape"&&!ke.shiftKey&&!ke.ctrlKey):!1:Y(X)',
      description:
        "Permission skip-predicate: when textarea has non-whitespace content, skip bare Enter/Space/Escape; works regardless of focus (v7.7.2+)",
    },
    {
      feature: "perm-escape",
      original: 'ce=ke=>{if(ke.key==="Escape"){Ae(ke);return}}',
      patched:
        'ce=ke=>{if(ke.key==="Escape"&&(ke.shiftKey||!ke.target?.value?.trim())){Ae(ke);return}}',
      description:
        "Permission Escape: bare Escape reaches the dialog only when the textarea is empty/whitespace-only; Shift+Escape always does (v7.7.2+)",
    },
    {
      feature: "perm-approve",
      original: 'if(W(ke)&&!w()){ee(ke,"once");return}}};',
      patched:
        'if((W(ke)||ke.key===" "&&!ke.metaKey&&!ke.ctrlKey&&!ke.target?.value?.trim()||ke.key==="Enter"&&(ke.metaKey||ke.ctrlKey))&&!w()){ee(ke,"once");return}}};',
      description:
        "Permission approve: Cmd/Ctrl+Enter approves always; Space approves when empty/whitespace-only (v7.7.2+)",
    },
    // --- v7.7.0+ patterns. 7.7.0 is the build that moved, not 7.7.1: the
    //     two derive byte-identical patterns everywhere except the mention
    //     trigger's regex variable (FH→RH) and the math render helper
    //     (sQ→cQ), so this block is labelled v7.7.0+ and only those two
    //     behaviors carry a separate 7.7.1 entry. kiloclaw.js re-minified
    //     too but both of its sites still match the v7.6.0+ patterns.
    //
    //     Two patch points changed *shape*, and one upstream feature is the
    //     source of both: 7.7.0 turned the permission prompt's Deny into a
    //     two-step deny-with-feedback flow. Escape no longer rejects, it
    //     opens a feedback textarea (and closes it again when already
    //     open), so perm-escape's handler now calls a one-argument opener
    //     (fe(we)) where every earlier build called dispatch(event,
    //     "reject"); the rule captures that call as a span and reproduces
    //     it rather than spelling it out. And the approve branch grew a
    //     conjunct, if(W(we)&&!w()), so Enter inside the feedback box
    //     submits the rejection instead of approving; perm-approve now
    //     parenthesises its own disjunction under that conjunct so the
    //     added Space and Cmd/Ctrl+Enter branches respect it too.
    //
    //     mention-escape shrank to one edit, because 7.7.0 upstreamed the
    //     other one. Kilo's own Escape branch now records the dismissed
    //     query in its dead-query slot, its onInput consults that slot
    //     before its settle test rather than after, and the settle test
    //     records there as well. What is still missing is clearing the
    //     slot when the "@" it names is gone, so an empty-query dismissal
    //     strands the offset and retyping the "@" gets nothing. Only that
    //     clearing edit ships here; shipping the recording edit on top of
    //     Kilo's would duplicate an assignment.
    //
    //     The plain churn: chat scope Enter-check of→Ym, event Je→Ze, send
    //     Vo→Ec, with the Escape chain's popup UVe→JVe, ghost Be→Fe, goal
    //     L→F and busy Nt→ot (store t held). The history scope moved every
    //     local (selectionStart jt→qt, selectionEnd gn→kn, caret fr→Ar,
    //     direction Mr→Lr, result or→sr, text accessor U→Y) and its
    //     textarea and navigator traded letters outright, k/w becoming
    //     w/k. Mention: text it→Qe, match mt→gt, close oe→ze, the "@"
    //     offset Pe→Ne, dead slot Ve→Ue. Permission: guard ie→Ue, arg
    //     Y→X, helper z→Z, event W→we, handler H→ce, Enter-check j→W,
    //     dispatch O→ee. Document Escape: event ve→be.
    //
    //     Cross-scope collision stays wholesale. Ze alone names the event
    //     of chat-input, chat-escape and chat-history; Ue names both the
    //     permission in-textarea guard and the mention dead slot; and w is
    //     simultaneously the chat-history textarea and, in the permission
    //     scope, the feedback-box signal that perm-approve's new conjunct
    //     reads. A name carries no role information, which is why every
    //     anchor keys on shape. ---
    {
      feature: "chat-input",
      original: "Ym(Ze)&&!Ze.shiftKey&&(Ze.preventDefault(),Ec())",
      patched: "Ym(Ze)&&(Ze.metaKey||Ze.ctrlKey)&&(Ze.preventDefault(),Ec())",
      description: "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.7.0+)",
    },
    {
      feature: "chat-escape",
      original:
        'Ze.key!=="Escape"?!1:JVe()?!0:!Fe.text()&&!F.active()&&!ot()?!1:(Ze.preventDefault(),Ze.stopPropagation(),Fe.text()?Fe.dismiss():F.active()?F.cancel():t.abort(),!0)',
      patched:
        'Ze.key!=="Escape"?!1:JVe()?!0:!Fe.text()&&!F.active()&&(!ot()||!Ze.shiftKey&&Ze.target?.value?.trim())?!1:(Ze.preventDefault(),Ze.stopPropagation(),Fe.text()?Fe.dismiss():F.active()?F.cancel():t.abort(),!0)',
      description:
        "Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v7.7.0+)",
    },
    {
      feature: "mention-escape",
      original:
        'let Ke=Qe.substring(0,ke),gt=Ke.match(RH);if(!gt){ze();return}let _t=gt[1]??"";if(Ne=(gt.index??0)+(/^\\s/.test(gt[0])?1:0),Ue&&Ue.at===Ne&&_t.startsWith(Ue.query)){ze();return}',
      patched:
        'let Ke=Qe.substring(0,ke),gt=Ke.match(RH);if(!gt){Ue&&Qe[Ue.at]!=="@"&&(Ue=void 0),ze();return}let _t=gt[1]??"";if(Ne=(gt.index??0)+(/^\\s/.test(gt[0])?1:0),Ue&&Ue.at===Ne&&_t.startsWith(Ue.query)){ze();return}',
      description:
        "Mention menu Escape: drops Kilo\u0027s recorded @ query once that @ is gone, so deleting and retyping the @ reopens the menu (v7.7.1+)",
    },
    {
      feature: "mention-escape",
      original:
        'let Ke=Qe.substring(0,ke),gt=Ke.match(FH);if(!gt){ze();return}let _t=gt[1]??"";if(Ne=(gt.index??0)+(/^\\s/.test(gt[0])?1:0),Ue&&Ue.at===Ne&&_t.startsWith(Ue.query)){ze();return}',
      patched:
        'let Ke=Qe.substring(0,ke),gt=Ke.match(FH);if(!gt){Ue&&Qe[Ue.at]!=="@"&&(Ue=void 0),ze();return}let _t=gt[1]??"";if(Ne=(gt.index??0)+(/^\\s/.test(gt[0])?1:0),Ue&&Ue.at===Ne&&_t.startsWith(Ue.query)){ze();return}',
      description:
        "Mention menu Escape: drops Kilo\u0027s recorded @ query once that @ is gone, so deleting and retyping the @ reopens the menu (v7.7.0+)",
    },
    {
      feature: "chat-history",
      original:
        'if((Ze.key==="ArrowUp"||Ze.key==="ArrowDown")&&!Ze.altKey&&!Ze.ctrlKey&&!Ze.metaKey&&!Ze.shiftKey){let qt=w?.selectionStart??0,kn=w?.selectionEnd??0;if(qt!==kn)return;let Ar=qt,Lr=Ze.key==="ArrowUp"?"up":"down",sr=k.navigate(Lr,Y(),Ar)',
      patched:
        'if((Ze.key==="ArrowUp"||Ze.key==="ArrowDown")&&(Ze.metaKey||Ze.ctrlKey)&&!Ze.altKey&&!Ze.shiftKey){let qt=w?.selectionStart??0,kn=w?.selectionEnd??0;if(qt!==kn)return;let Ar=Ze.key==="ArrowUp"?0:Y().length,Lr=Ze.key==="ArrowUp"?"up":"down",sr=k.navigate(Lr,Y(),Ar)',
      description:
        "Chat history: plain Up/Down stay in the textarea, Cmd/Ctrl+Up/Down step through sent messages (v7.7.0+)",
    },
    {
      feature: "perm-keys",
      original: 'we.key==="Enter":Re?!0:Ue?!1:Z(X)',
      patched:
        'we.key==="Enter":Re?!0:Ue?we.target?.value?.trim()?(we.key==="Enter"&&!we.metaKey&&!we.ctrlKey||we.key===" "||we.key==="Escape"&&!we.shiftKey&&!we.ctrlKey):!1:Z(X)',
      description:
        "Permission skip-predicate: when textarea has non-whitespace content, skip bare Enter/Space/Escape; works regardless of focus (v7.7.0+)",
    },
    {
      feature: "perm-escape",
      original: 'ce=we=>{if(we.key==="Escape"){fe(we);return}}',
      patched:
        'ce=we=>{if(we.key==="Escape"&&(we.shiftKey||!we.target?.value?.trim())){fe(we);return}}',
      description:
        "Permission Escape: bare Escape reaches the dialog only when the textarea is empty/whitespace-only; Shift+Escape always does (v7.7.0+)",
    },
    {
      feature: "perm-approve",
      original: 'if(W(we)&&!w()){ee(we,"once");return}}};',
      patched:
        'if((W(we)||we.key===" "&&!we.metaKey&&!we.ctrlKey&&!we.target?.value?.trim()||we.key==="Enter"&&(we.metaKey||we.ctrlKey))&&!w()){ee(we,"once");return}}};',
      description:
        "Permission approve: Cmd/Ctrl+Enter approves always; Space approves when empty/whitespace-only (v7.7.0+)",
    },
    {
      feature: "doc-escape",
      original:
        'be.key!=="Escape"||!t.submitting()&&t.status()==="idle"&&!m()?.active||be.defaultPrevented||(be.preventDefault(),t.abort())',
      patched:
        'be.key!=="Escape"||!t.submitting()&&t.status()==="idle"&&!m()?.active||be.defaultPrevented||!be.shiftKey&&be.target?.value?.trim()||(be.preventDefault(),t.abort())',
      description:
        "Document Escape: bare Escape does not abort when textarea has non-whitespace content; Shift+Escape aborts (v7.7.0+)",
    },
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
      description: "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.5.16+)",
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
    // accessor l, every symbol the two edits reference (see src/rules/core.ts).
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
      description: "Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v7.5.11+)",
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
};

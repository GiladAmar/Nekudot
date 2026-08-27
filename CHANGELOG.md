# What's new in Nekudot

## Version 2.0 (unreleased)

### Fixed

- **Select-all no longer crashes.** Pressing Ctrl+A on a full news page
  (e.g. the ynet homepage) and clicking the icon used to fail silently with
  an internal error. It now works — and fast.
- **Failures no longer damage the page.** Previously, if the model failed,
  the literal word "error" could be spliced into the page text. Now a failed
  or interrupted run rolls back anything it had already changed and shows a
  small notification instead.
- **Typing while it works is safe.** Text you type in a text box while nikud
  is being computed is never overwritten, and "Remove nikud" never discards
  edits you made after dotting — edited text has just its marks stripped.
- **Text no longer gets scrambled on complex selections.** Results used to be
  mapped back into the page by counting words, which could shift text between
  elements on pages with mixed content. Each piece of text is now replaced
  exactly in place, character for character.
- **Selections inside embedded frames now work.** Text selected inside an
  iframe (common in news-site widgets) was previously ignored.
- **Hidden page data is no longer touched.** Machine-readable content embedded
  in pages (scripts, styles) can no longer be accidentally rewritten.

### Faster

- **A new inference engine (WebAssembly SIMD).** A full news homepage now
  finishes in a few seconds; the first results appear on screen in about one
  second. Measured on the real ynet homepage: first niqqud at ~0.8s, the
  entire page (~8,700 marks) in ~6s.
- **Results appear as they are computed.** The page fills in progressively
  instead of freezing until everything is done.
- **Non-Hebrew content is skipped entirely.** English text, numbers, links
  and site chrome no longer waste processing time.
- **No first-click delay.** The model warms up in the background when the
  browser starts, so the first use is as fast as every other.
- **The extension is less than half the size** (12 MB instead of 35 MB) —
  faster to install and update, with output verified identical.

### New

- **Right-click menu**: "Add nikud" on a selection, "Add nikud to the whole
  page" anywhere, and "Remove nikud" to take it back.
- **Whole-page mode**: click the icon with nothing selected and the entire
  page gets niqqud.
- **Remove / undo**: "Remove nikud" undoes exactly what Nekudot added, and
  nothing else — text that arrived with its own vowels (a Tanakh, a siddur,
  a learning site) is never stripped, and anything you edited afterwards is
  left alone.
- **Keyboard shortcut**: Alt+Shift+N (⌥+Shift+N on Mac), remappable at
  chrome://extensions/shortcuts. (⌘+Shift+Y was avoided — macOS reserves
  it for Sticky Notes.)
- **Works in text boxes**: select text inside an input field or a comment
  box and it gets niqqud in place. (Rich editors that keep their own copy of
  the document — Google Docs, and some chat composers — may re-render and
  drop it; use the paste page for those.)
- **Paste page**: right-click the toolbar icon → "Open paste page" for a
  simple paste-and-copy page — useful in apps where the page can't be edited
  directly (Google Docs, Word Online).
- **English-first interface**: menu items, buttons and messages are in
  English (with Hebrew alongside where it helps) — the extension is for
  people learning Hebrew, so the controls shouldn't require it.
- **Smart re-runs**: running again on the same page only processes text that
  is new since the last run. On sites that keep loading articles as you
  scroll, scroll down and run again — only the new content is processed,
  in a fraction of the time, and text that already has nikud is left alone.

### Privacy

- **The extension no longer runs on every page you visit.** It now loads only
  when you invoke it (icon, menu, or shortcut) — less memory use and no
  presence on pages you never use it on.
- **Websites can no longer detect that the extension is installed.**

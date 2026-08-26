# What's new in Nekudot

## Version 1.3 (unreleased)

### Fixed

- **Select-all no longer crashes.** Pressing Ctrl+A on a full news page
  (e.g. the ynet homepage) and clicking the icon used to fail silently with
  an internal error. It now works — and fast.
- **Failures no longer damage the page.** Previously, if the model failed,
  the literal word "error" could be spliced into the page text. Now the page
  is left untouched and a small notification appears instead.
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
- **Remove / undo**: "Remove nikud" restores the original text exactly —
  including text that already had partial niqqud before.
- **Keyboard shortcut**: Ctrl+Shift+Y (⌘+Shift+Y on Mac), remappable at
  chrome://extensions/shortcuts.
- **Works in text boxes**: select text inside an input field, a comment box,
  or an editor like Gmail compose, and it gets niqqud in place.
- **Paste page**: right-click the toolbar icon → "Open paste page" for a
  simple paste-and-copy page — useful in apps where the page can't be edited
  directly (Google Docs, Word Online).
- **English-first interface**: menu items, buttons and messages are in
  English (with Hebrew alongside where it helps) — the extension is for
  people learning Hebrew, so the controls shouldn't require it.

### Privacy

- **The extension no longer runs on every page you visit.** It now loads only
  when you invoke it (icon, menu, or shortcut) — less memory use and no
  presence on pages you never use it on.
- **Websites can no longer detect that the extension is installed.**

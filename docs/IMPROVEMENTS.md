# Improvement plan

Analysis of the extension following the large-selection crash fix (#15).
Items are grouped by theme; checkboxes track implementation status.
Implemented as a chain of stacked PRs, one theme at a time.

## 1. Robustness

- [x] **Structured error responses.** On model failure the background responds
  `{processed: 'error'}` and `content.js` splices the literal word "error" into
  the page. Replace with `{ok: false, reason}`; the content script must leave
  the DOM untouched and show a small toast instead.
- [x] **Always respond.** An exception inside `model.then(...)` (e.g. GPU OOM)
  never calls `sendResponse`, leaving the content script waiting forever.
  Wrap in try/catch and always answer.
- [x] **Per-node protocol instead of word-count splice-back.** `insertResult`
  maps results back into DOM nodes by counting words with a regex that differs
  from the background tokenizer; any disagreement shifts text between nodes.
  Send per-node segments with ids, get per-node results back — no word
  counting. Also excludes `<script>`/`<style>` text nodes (a Ctrl+A range can
  intersect Hebrew-containing JSON-LD, which would get rewritten today).
- [x] **Drop the always-on content script.** `manifest.json` injects
  `content.js` into every page and iframe at `document_start`, where it runs
  against an empty selection; the click handler already injects on demand.
- [x] **Stop exposing `model/*` to `<all_urls>`.** Only the extension fetches
  the model; web accessibility just enables fingerprinting.
- [x] **Cap and chunk input.** Process rows in chunks so the service worker
  stays responsive on huge selections and progress can be reported.
- [x] **CI.** GitHub Actions running `npm test` on every PR.

## 2. Speed

- [x] **Skip rows with no Hebrew letters** — the biggest single win. Most of a
  full-page selection (nav chrome, URLs, digits, Latin) cannot receive niqqud;
  predict only rows containing Hebrew tokens and default the rest.
- [x] **Async readback instead of three `arraySync()` stalls** in
  `prediction_to_text`.
- [x] **Warm-up predict** after model load so the first click doesn't pay
  shader/kernel compilation.
- [x] **Slim the bundle.** Import `@tensorflow/tfjs-core` / `-layers` / one
  backend instead of the full 1.13 MB `@tensorflow/tfjs`.
- [x] **Benchmark WASM backend** (SIMD/threads) against the current setup;
  small-batch BiLSTMs over 90 timesteps are often CPU-bound.
- [x] **GraphModel conversion + float16 quantization**: the Python
  `tensorflowjs_converter` cannot deserialize this model (Keras 2.19 weight
  naming mismatch: `KeyError: 'bidirectional/forward_lstm/kernel'`).
  Plan B: quantize the weights manifest to float16 directly in Node —
  tfjs dequantizes float16 natively at load time.
- [x] **Stream results** — apply per-segment results to the page as they
  arrive so large selections look "working", not frozen.

## 3. New features

- [x] **Context-menu entry and keyboard shortcut** — more discoverable than
  the toolbar icon.
- [x] **Iframe selections** — `executeScript` currently targets only the top
  frame, silently ignoring text selected inside embedded frames.
- [x] **Whole-page mode** — with no selection, dot all Hebrew text on the page.
- [x] **Toggle/undo** — second invocation restores the original text.
- [x] **Editable-field support** — `<textarea>`, `<input>`, `contenteditable`
  (Gmail compose, comment boxes).
- [x] **Paste page** — a simple extension page with a paste box: works on
  sites where DOM rewriting can't (canvas-rendered apps, Word Online, etc.).

## Out of scope (future)

- **Google Docs integration.** Docs renders into a `<canvas>`; there are no
  text nodes and `window.getSelection()` is empty. The reliable route is the
  Google Docs API (`chrome.identity` OAuth, `documents.get` +
  `documents.batchUpdate` applied in reverse index order), or a Workspace
  add-on sharing `text_encoding.mjs`. Both are separate projects. The paste
  page above is the pragmatic interim answer.

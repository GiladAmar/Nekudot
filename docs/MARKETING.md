# Getting Nekudot in front of people who need it

A distribution plan for a free, open-source, single-purpose browser extension
with no revenue and no marketing budget. Written as a checklist so it can be
worked through in ~2–4 h/week.

## 0. The honest framing

**Do not buy ads.** Cost per install on a free tool with no revenue is
unrecoverable, and the audience is too small and too oddly-shaped for keyword
targeting to be efficient. Everything below is reach and credibility, not spend.

**What you are actually selling.** Not "nikud" — Dicta's Nakdan
(dicta.org.il/nakdan) already does nikud, is server-side, is state of the art,
and is more accurate than a 2021 LSTM. Competing on accuracy is a losing and
dishonest pitch. The differentiator is the *workflow*:

> Nakdan is a box you paste into. Nekudot is on the page you were already reading.

Secondary, and increasingly valuable: **it runs entirely on your device.** No
server, no account, works offline, and the manifest only asks for `activeTab`,
so the extension cannot read a page until you click it. For a tool that touches
everything you read, that is the trust argument — say it explicitly and link the
source every time.

**Realistic ceiling.** A niche Hebrew utility on the Chrome Web Store plausibly
tops out in the low thousands of weekly users. If the goal is more than that,
the growth comes from §2 (the web version), not from posting harder.

---

## 1. Fix the asset debt first

Attention is the scarce resource; do not spend it on a listing with errors.

- [ ] **The advertised keyboard shortcut is wrong.** `store-description.txt:8`
  and `store_assets/src/shot3.html:120,124` both say `Ctrl+Shift+Y` /
  `⌘+Shift+Y`. `manifest.json` ships `Alt+Shift+N`, and CHANGELOG.md records
  that `⌘+Shift+Y` was *deliberately* avoided (macOS Sticky Notes). Fix the
  text, re-render screenshot 3 via `compose.mjs`.
- [ ] **Ship 2.0.** CHANGELOG still says "unreleased". Nothing below matters
  until the store listing is the version being described.
- [ ] **Rename the store listing title.** "Nekudot" is the one word nobody
  searches. Chrome Web Store weights the title heavily and allows ~75 chars:
  `Nekudot — Hebrew Nikud (vowel marks) on any page`. Also work
  *nikud, niqqud, vowels, diacritics, ניקוד, מנקד* into the first two lines of
  the description, which is what the store's search actually indexes.
- [ ] **Record one 15-second demo video.** A ynet or Hebrew-Wikipedia headline,
  click, marks stream in. This single asset carries every channel below —
  Reddit, HN, Product Hunt, teacher emails, YouTube outreach. You already have
  the whole capture rig (`store_assets/src/capture*.mjs` drives real Chrome via
  puppeteer); extend it to `page.screencast()` or capture frames and encode.
  Export both an MP4 and a looping GIF/WebP under 5 MB.
- [ ] **Swap paypal.me for GitHub Sponsors** (or Ko-fi). PayPal links read as
  dated and convert poorly; Sponsors sits natively on the repo people are
  already looking at.
- [ ] **Make the ask for reviews.** Store ranking is driven by install count
  *and* rating count — 12 five-star ratings outrank zero ratings by a lot. Add
  a single line to the paste page and the end of the store description. Do not
  add a nag toast to the extension; it will cost you more in uninstalls than it
  earns in stars.

---

## 2. The highest-leverage thing is not advertising

**Publish the paste page as a static website** (e.g. `nekudot.app` or GitHub
Pages). The model is TF.js + WASM and already runs client-side, so this is a
static host with zero running cost — the same bundle you ship in the extension.

Why this outranks every channel in §4:

- **It is linkable.** You cannot link someone to a Chrome extension mid-sentence
  and expect a conversion; you can link them to a page that just works.
- **It is googleable.** "add nikud to hebrew text", "hebrew vowelizer",
  "מנקד אוטומטי" are standing queries with real intent. An extension listing
  ranks badly for them; a page with the tool on it ranks.
- **It works on phones.** Chrome extensions do not exist on Android or iOS. A
  large share of Hebrew learners are on a phone. Today they cannot use Nekudot
  at all.
- **It is the funnel.** Page → "install the extension to do this on any site."

Ship this before the launch push in §5, and point every link at the site rather
than at the store.

**Second-highest:** port to **Edge Add-ons** and **Firefox AMO**. MV3 is
supported by both; this is mostly manifest and packaging work, not a rewrite.
Two more stores, two more search surfaces, near-zero marginal effort. Edge in
particular has thin competition in this niche.

---

## 3. Who this is for, ranked by reachability

| # | Audience | Why they convert | How reachable |
|---|---|---|---|
| 1 | **Diaspora Hebrew learners** (Duolingo, ulpan, self-taught) | The exact stated pain: real Hebrew has no vowels, so a new word is unpronounceable | Very — they cluster in loud, public English-language communities |
| 2 | **Olim reading Israeli media** | Reading ynet/Haaretz daily and hitting unknown words constantly | Very — dense Anglo-oleh groups |
| 3 | **Hebrew teachers and tutors** | One teacher tells 30 students. Highest leverage per contact | Directly emailable, and they respond to free classroom tools |
| 4 | **University Hebrew / Jewish studies faculty** | Same leverage, plus credibility and citations | Yes, via NAPH / AJS / H-Judaic lists |
| 5 | **Singers, cantors, actors, choirs** | Need correct pronunciation of text they don't otherwise read | Narrow but very high intent |
| 6 | **Israeli early readers (grades 1–3) and their parents** | Israeli children read with nikud; everything outside their textbooks has none | Large but Hebrew-language and harder for you to reach; a real second act, not a launch channel |
| 7 | **Readers with dyslexia / reading difficulty in Israel** | Nikud materially aids decoding | Via specialist orgs; slow, worth one email |

Write launch copy for #1 and #2. Everything else is follow-up.

---

## 4. Channels, in the order to use them

### 4a. Chrome Web Store search (passive, permanent, most under-rated)
Covered in §1. This is the only channel that keeps working while you sleep, and
the title change is the single cheapest win in this document.

### 4b. The paper's authors
Gershuni & Pinter granted you the model already. Yuval Pinter is an active NLP
academic with a real audience. Email both: *"the model from your paper now runs
on-device in a browser extension; here's a demo."* One line asking if they'd
share it. This is free, high-credibility amplification and costs one email.
Do it before the public posts so the launch has a citation attached.

### 4c. Reddit — one good post per subreddit, not a campaign
Order: **r/hebrew** (the core audience), then **r/Judaism**, **r/languagelearning**,
**r/Israel** / **r/israeli**, **r/duolingo**.

- Read each sub's self-promo rules first; most tolerate "I built a free
  open-source thing" exactly once from a real account.
- Lead with the GIF. Title it as the problem, not the product:
  *"I got tired of not knowing how to pronounce words on ynet, so I made a free
  extension that adds nikud to any page (open source, runs offline)."*
- Answer every comment for 48 hours. That thread will be the top Google result
  for your product's name for years.
- Do **not** cross-post the same text the same day; it reads as spam and gets
  you filtered.

### 4d. Hacker News — a different story entirely
HN does not care about Hebrew. It cares about the engineering. The story is:
*"Show HN: A Chrome extension that runs a BiLSTM entirely on-device — 12 MB,
WASM SIMD, no server"* — full page of Hebrew news vowelized in ~6 s, no network
call. Reference the measured numbers already in CHANGELOG.md (first marks at
~0.8 s, ~8,700 marks in ~6 s, 35 MB → 12 MB). Submit Tue–Thu morning US time,
be in the thread. Even a middling HN showing produces durable backlinks that
help §2's SEO.

### 4e. Facebook and WhatsApp groups (where the olim actually are)
Secret Tel Aviv, Janglo, Anglos-in-Israel groups, Nefesh B'Nefesh community
groups, ulpan alumni groups, "Learn Hebrew" groups. These convert better than
Reddit for audience #2 and worse for #1. Post as a person who made a thing, not
as a launch. Space them out over weeks.

### 4f. Teachers — the leverage play, and the one people skip
Hand-write ~25 emails: iTalki and Preply Hebrew tutors with a lot of reviews,
Ulpan La-Inyan, eTeacher, HebrewPod101, day-school Hebrew coordinators, and
university Hebrew instructors via **NAPH** (National Association of Professors
of Hebrew) and **AJS**. Three sentences, the GIF, the link, and an explicit
"free forever, nothing to sign up for, feel free to send it to your students."
A 20% reply rate here beats any Reddit thread.

### 4g. Hebrew-learning YouTubers and podcasters
Same email, different ask: they are permanently hungry for content, and a
60-second "here's a tool I use" segment is free material for them. Target
channels teaching *reading*, not conversation.

### 4h. Directory listings (set and forget)
Product Hunt (modest traffic, permanent listing, good backlink), AlternativeTo
(list it as an alternative to Nakdan/Morfix — that page gets real search
traffic), and the Chrome-extension roundup sites. An afternoon, once.

---

## 5. A six-week schedule

| Week | Do |
|---|---|
| 1 | Fix the shortcut copy, re-render shot 3, ship 2.0, rename the store title, rewrite the first two description lines for search |
| 2 | Record the demo video/GIF. Email Gershuni & Pinter |
| 3 | Publish the web version (§2). Point the store listing and repo at it |
| 4 | **Launch week**: r/hebrew Monday, Show HN Wednesday. Live in both threads |
| 5 | Facebook/olim groups, staggered. Product Hunt + AlternativeTo listings |
| 6 | The 25 teacher emails. Then Edge and Firefox ports |

Every link you post gets its own UTM so §6 can tell you what worked.

---

## 6. Measuring it without breaking the privacy promise

You have deliberately shipped zero telemetry, and that is a selling point. Do
not add analytics to the extension — it would cost you the one claim your
positioning rests on.

Measure at the edges instead:

- **Chrome Web Store developer dashboard**: weekly users, installs, uninstalls,
  ratings, by country. Uninstall rate is your quality signal.
- **The landing page only**: a cookieless, no-PII counter (GoatCounter, Umami,
  or Plausible). Distinct from the extension, and say so on the page.
- **UTM per channel** on every posted link, so week 6 tells you whether the
  teacher emails beat Hacker News. (They probably will.)
- **Qualitative**: GitHub issues and store reviews. For a tool like this, ten
  reviews saying "it mispronounced X" is worth more than a traffic graph — it
  is your only window into model quality in the wild.

---

## 7. Product changes that are really marketing

Ranked by effect on adoption per hour of work:

1. **The web version** (§2) — reach, SEO, and mobile in one move.
2. **Edge + Firefox** — two more stores, minimal work.
3. **Hover-for-nikud on a single word.** Whole-page vowelization is a
   demo; *"what is this one word"* is the daily habit. Habit drives retention,
   retention drives reviews, reviews drive store rank.
4. **Show the model's confidence.** Marking low-confidence words (a faint
   underline) turns the accuracy gap with Nakdan from a weakness into honesty,
   and is the sort of detail that earns write-ups.
5. **Tie-in with translation.** The learner's next question after "how is this
   pronounced" is always "what does it mean." Even a link out to Morfix on a
   selected word closes the loop.

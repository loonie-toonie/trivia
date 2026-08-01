# Security Overview — Trivia Night

**Last updated:** 2026-08-01
**Posture:** Pre-launch. Local-only, single-user, no server, no accounts, no network calls of its own.
**Sensitive data handled:** None. Trivia questions, answers, and host-supplied media files.
**Compliance scope:** None — no personal data is collected, stored, or transmitted.
**Companion doc:** [APP_OVERVIEW.md](./APP_OVERVIEW.md)

## Table of Contents

1. [Threat Model](#1-threat-model)
2. [Defense Layers](#2-defense-layers)
3. [Authentication](#3-authentication)
4. [Authorization](#4-authorization)
5. [Data Protection](#5-data-protection)
6. [Input Validation & Output Encoding](#6-input-validation--output-encoding)
7. [Web Platform Hardening](#7-web-platform-hardening)
8. [Secrets & Key Management](#8-secrets--key-management)
9. [Third-Party & Supply Chain](#9-third-party--supply-chain)
10. [Logging, Audit & Monitoring](#10-logging-audit--monitoring)
11. [Rate Limiting & Abuse Prevention](#11-rate-limiting--abuse-prevention)
12. [Data Retention & Deletion](#12-data-retention--deletion)
13. [Security Testing](#13-security-testing)
14. [Incident Response](#14-incident-response)
15. [Incident History](#15-incident-history)
16. [Known Gaps & Accepted Risks](#16-known-gaps--accepted-risks)
17. [Pre-Launch / Hardening Checklist](#17-pre-launch--hardening-checklist)
18. [Change Log](#18-change-log)

---

## 1. Threat Model

**Assets, ranked**

1. The host's prepared questions and media — hours of work, and spoiling them ruins the event.
2. The host's device — the app must not become a foothold onto it.
3. Nothing else. There is no user data, no credentials, no money, no PII.

**Adversaries and what each can reach**

| Adversary | Reach | Notes |
|---|---|---|
| A guest at the event who grabs the laptop | Everything | Physical access = full control. No lock screen in the app |
| Anyone who can open the deployed URL | The seed board, in *their own* browser storage | They cannot see or alter the host's board — IndexedDB is per-origin **and** per-profile |
| A malicious media URL the host pastes in | Whatever a hostile image/video/iframe can do in the host's browser | The main real attack surface; see §6 |
| A tampered backup `.json` the host restores | Whatever hostile data can do through `normalise()` and the DOM | Second real surface; see §6 |
| Another site in the same browser | Nothing | Same-origin policy isolates IndexedDB |

**Trust boundaries**

```
┌──────────────────────── host's browser profile ────────────────────────┐
│                                                                        │
│   index.html + js/*  ──▶  IndexedDB "trivia-night"  (origin-scoped)     │
│         │                                                              │
│         │  the only outbound traffic, and only if the host             │
│         │  pastes a link rather than uploading a file:                 │
│         ▼                                                              │
└─────── ✂ trust boundary ✂ ────────────────────────────────────────────┘
          │
          ├──▶ arbitrary origin  (hot-linked <img>/<video>/<audio> src)
          └──▶ youtube-nocookie.com  (sandboxed <iframe> embed)
```

**Explicitly out of scope:** protecting the board from someone with physical access to the unlocked
laptop; protecting against a host who deliberately pastes a hostile URL into their own board.

**What the design trusts:** the host, and the browser's same-origin policy. There is no server, so
there is no "the client is untrusted" split — the client is the entire application.

## 2. Defense Layers

| Layer | Control | Enforced where | Bypassable? | Status |
|---|---|---|---|---|
| Origin isolation | Same-origin policy over IndexedDB | Browser | No | Active |
| Iframe containment | YouTube embeds use `youtube-nocookie.com`, no `allow-same-origin` grant, restricted `allow` list | `js/present.js:141` | No | Active |
| Referrer leakage | `referrerPolicy="strict-origin-when-cross-origin"` on embeds | `js/present.js:145` | No | Active |
| XSS | All user content set via `textContent` / element properties; no `innerHTML`, no `eval` | throughout `js/` | No | Active |
| Data sanity | `normalise()` rewrites every field of any loaded or restored document | `js/state.js:44` | No | Active |
| Upload sanity | MIME-prefix check + 200 MB cap before a file is stored | `js/editor.js:107`, `js/state.js:239` | Yes — trivially, by the host, on their own device | Active, cosmetic |
| Destructive-action confirmation | Restore and shrinking resizes both warn before destroying content | `js/app.js:126`, `js/editor.js:176` | Yes — the host may click through | Active |
| Transport | HTTPS + HSTS when deployed | `vercel.json` | No | Configured, undeployed |
| Framing | `X-Frame-Options: DENY` + `frame-ancestors 'none'` | `vercel.json` | No | Configured, undeployed |
| CSP | Restrictive `Content-Security-Policy` | `vercel.json` | No | Configured, undeployed |

⚠️ Everything in the last three rows only takes effect once the app is actually deployed behind
`vercel.json`. Running from `python3 -m http.server` or `npx serve` gets **none** of those headers.

## 3. Authentication

**N/A — there is no authentication.** No accounts, no passwords, no tokens, no sessions, no
credential storage of any kind. The app never asks who you are because there is no one to tell and
nothing to gate.

The practical consequence: **anyone with access to the unlocked device can read every answer.** For
a trivia host this is the correct trade-off — the host *is* the only user, and the answers are only
secret for the length of the evening. It is recorded as an accepted risk in §16.

## 4. Authorization

**N/A — there are no roles, groups, or capabilities.** Every user of the page is implicitly the
host and may do everything: edit questions, resize the board, reveal answers, export, and restore.

The only enforced boundary is one the browser provides:

| Resource | Client check | Server/rules check | Authoritative layer |
|---|---|---|---|
| IndexedDB `trivia-night` | none | none | Browser same-origin policy + OS user account |
| Uploaded media blobs | none | none | Same as above |

There is no privilege escalation to prevent, because there is no privilege to escalate to.

## 5. Data Protection

**In transit:** N/A for the app's own data — it never leaves the device. When deployed, the static
files themselves are served over HTTPS with HSTS (`vercel.json`). Hot-linked media and YouTube
embeds are fetched by the browser over whatever scheme the host's URL specifies.

**At rest:** IndexedDB, unencrypted, protected only by the operating-system user account and
whatever full-disk encryption the host has enabled (FileVault on macOS). The app adds no
application-level or field-level encryption, and none is warranted — there is nothing secret in the
data beyond trivia answers.

**Persistence:** `navigator.storage.persist()` is requested at boot (`js/db.js:87`) so the browser
does not evict the board under disk pressure. The request is best-effort; Safari and some Chromium
profiles decline silently and the app continues without it.

**Data classification**

| Data | Sensitivity | Encrypted? | Who can read |
|---|---|---|---|
| Questions and answers | Low — time-limited | No | Anyone at the device |
| Uploaded images / video / audio | Low, but host-supplied and could be anything | No | Anyone at the device |
| Backup `.json` files | Same as the above, in one portable file | No | Anyone with the file |
| PII | **None collected** | — | — |

**PII inventory:** none. The app collects no names, emails, addresses, IPs, or identifiers. It has
no analytics and sends no telemetry.

## 6. Input Validation & Output Encoding

All input is host-supplied. The threat is not a malicious user attacking a service — it is a host
importing something hostile and it executing in their own browser.

**Where validation happens:** entirely in the browser, and the browser is authoritative because
there is nowhere else.

| Input | Validation | File |
|---|---|---|
| Question / answer / label text | Trimmed. No length cap | `js/editor.js:commitQuestion` |
| Points | Coerced to a finite number ≥ 0, else the previous value is kept | `js/editor.js:83` |
| Uploaded file | MIME prefix must be `image/`, `video/` or `audio/`; else rejected. Size ≤ 200 MB | `js/state.js:236`, `js/editor.js:107` |
| Pasted media URL | Classified by extension; YouTube matched by a strict 11-char id regex | `js/state.js:262` |
| Restored backup | JSON parse guarded; shape checked; every field rewritten by `normalise()` | `js/backup.js:70`, `js/state.js:44` |
| Category header text | Emoji prefix split off; rest becomes the name | `js/board.js:splitIcon` |

**Injection defenses**

- **SQL / NoSQL:** N/A — no query language. IndexedDB is accessed only by literal key.
- **Command / path traversal / SSRF:** N/A — no server, no filesystem access, no fetches the app
  itself constructs.
- **Template injection:** N/A — no templating engine.

**XSS:** the codebase contains **no** `innerHTML`, `outerHTML`, `insertAdjacentHTML`,
`document.write`, `eval`, or `new Function`. Every piece of user content reaches the DOM through
`textContent` or a typed element property (`img.src`, `video.src`), and elements are created with
`document.createElement`. `contentEditable` is set to `plaintext-only` so a paste cannot inject
markup. This is the property that keeps a hostile backup file from becoming script execution, and
it should be treated as a rule, not a coincidence.

**Media URL handling — the one real residual risk.** A URL the host pastes is used directly as an
`img`/`video`/`audio` `src`. The scheme is not restricted, so a `javascript:` or `data:text/html`
URL is not rejected at the input layer. In practice it is inert — those schemes do not execute in
a media element's `src` — and when deployed, CSP `img-src`/`media-src` further constrain what can
load. A `data:` image is still permitted by design (§7). Uploaded files are the safer path and are
the default tab.

**YouTube embeds** are the only `iframe` the app creates. They point at
`youtube-nocookie.com/embed/<id>` where `<id>` comes from a strict `[A-Za-z0-9_-]{11}` match and is
`encodeURIComponent`-wrapped, so an arbitrary URL cannot be smuggled into the `src`.

**Upload handling:** files are stored as opaque `Blob`s in IndexedDB and served back through
`URL.createObjectURL`, never written to disk under a host-controlled filename and never
re-interpreted as anything but their declared media type. The MIME check trusts the browser's
sniffing of the file; content is not independently inspected.

**Mass assignment:** not possible — `normalise()` constructs fresh objects field by field and
silently drops anything it does not recognise.

## 7. Web Platform Hardening

Configured in `vercel.json` and applied to every route. **Not active in local development.**

| Header | Value | Why |
|---|---|---|
| `Content-Security-Policy` | see below | Constrains what can load and execute |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Force HTTPS |
| `X-Content-Type-Options` | `nosniff` | No MIME sniffing |
| `X-Frame-Options` | `DENY` | No framing (legacy companion to `frame-ancestors`) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limit referrer leakage to media hosts |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), interest-cohort=()` | Drop capabilities the app never uses |
| `Cross-Origin-Opener-Policy` | `same-origin` | Process isolation |

**CSP, directive by directive**

```
default-src 'self';
base-uri 'self';
object-src 'none';
frame-ancestors 'none';
form-action 'none';
script-src 'self';
style-src 'self';
img-src 'self' data: blob: https:;
media-src 'self' blob: https:;
frame-src https://www.youtube-nocookie.com https://www.youtube.com;
connect-src 'self';
```

- No `unsafe-inline` or `unsafe-eval` anywhere — the app has zero inline scripts and zero inline
  styles, so neither is needed. **Keep it that way**: adding one inline handler would force a
  weakening of this policy.
- `img-src`/`media-src` allow `https:` broadly because the whole point of the "paste a link"
  feature is that the host chooses the host. `blob:` is required for uploaded media,
  `data:` for the inline SVG favicon.
- `frame-src` is limited to YouTube; nothing else may be framed.
- `form-action 'none'` — the app posts nowhere. The `<form>` elements exist only to drive
  `<dialog>` `returnValue`.

**CORS:** none configured and none needed — the app makes no `fetch`/XHR requests at all.
**Cookies:** none set. **CSRF:** N/A — no state-changing requests leave the browser.
**Subresource integrity:** N/A — no third-party scripts or styles.

## 8. Secrets & Key Management

**There are no secrets.** No API keys, no tokens, no credentials, no service accounts, no `.env`
file, and no build-time or runtime injection of any value.

| Secret | Where stored | Status |
|---|---|---|
| — | — | none exist |

`.gitignore` covers `node_modules/`, `.DS_Store`, `.vercel/`, `.playwright-mcp/`, and `*.local`.
No secret has ever been committed, because none exists to commit.

## 9. Third-Party & Supply Chain

**Runtime dependencies: zero.** `package.json` has no `dependencies` and no `devDependencies`
block; there is no lockfile because there is nothing to lock. Nothing is installed, so nothing can
run an install script.

| Third party | What it receives | Blast radius if breached |
|---|---|---|
| YouTube (`youtube-nocookie.com`) | Only when the host embeds a video: the video id, and the viewer's IP and user-agent | Contained to the iframe; no same-origin access, no cookies (nocookie domain) |
| Whatever host serves a pasted media URL | The request for that file, plus the origin as referrer | Contained to a media element |
| `serve` (dev only, via `npx`) | Nothing — serves local files during development | Dev machine only; never present in the deployed artifact |

**Dependency hygiene:** N/A by construction. The strongest supply-chain control this project has is
that there is no supply chain. Adding the first dependency should be a deliberate decision, and
should come with a lockfile and `npm audit` in CI.

## 10. Logging, Audit & Monitoring

**Audit trail: none.** No record is kept of who edited what or when, beyond a single `updatedAt`
timestamp on the game document. For a single-user offline board this is proportionate.

**What is logged:** two `console.warn` calls — one when a saved game cannot be read
(`js/state.js:32`), one when a media blob cannot be restored (`js/backup.js:88`) — plus
`console.error` on save/backup/restore failure. All are local to the browser console and nothing is
transmitted anywhere.

**What must never be logged:** N/A — there is no PII, no token, and no credential in the system to
leak into a log.

**Error reporting:** none. No Sentry, no beacons, no analytics.

**Detection gaps:** total. If someone edited the board on the host's laptop, nothing would record
it. Accepted — see §16.

## 11. Rate Limiting & Abuse Prevention

**N/A — there is no server, no API, and no shared resource to exhaust.** Every action is local and
bounded by the host's own device. There is no login to brute-force, no account to enumerate, no
endpoint to scrape, and no metered service whose cost could be amplified.

The single client-side limit that exists is the 200 MB per-file upload cap (`js/editor.js:107`),
which is ergonomic rather than a security control — it stops the host accidentally wedging their
own browser, and they can bypass it trivially since it is their machine.

## 12. Data Retention & Deletion

| Data | Retention | Deletion trigger | Automated? |
|---|---|---|---|
| Game document | Indefinite | Clearing site data, or `indexedDB.deleteDatabase('trivia-night')` | No |
| Media blobs | Indefinite while referenced | Automatic on save once no question references them (`db.mediaPrune`) | **Yes** |
| Backup `.json` files | Indefinite, in the host's Downloads folder | Manual | No |

**Full wipe** — from DevTools on the deployed origin:

```js
indexedDB.deleteDatabase('trivia-night')
```

then reload. The board returns to the seed content. Back up first if you want it back.

**Subject-access / export / erasure:** N/A — no personal data is processed. Export exists for the
host's own convenience (Backup), not as a compliance mechanism.

## 13. Security Testing

**Automated: none.** There is no test suite of any kind, security or otherwise.

**Manual verification performed 2026-08-01** (Chromium via Playwright), security-relevant subset:

| Check | Result |
|---|---|
| No `innerHTML` / `eval` / `document.write` / `new Function` anywhere in `js/` | pass — grep-verified |
| Restored backup renders through `textContent` only | pass |
| `normalise()` rejects a document with no `rounds` and falls back to the seed | pass — by inspection |
| Backup → Restore round-trip preserves data and media without corruption | pass |
| Console errors across a full session including uploads and restore | 0 |

**Not tested:** a deliberately hostile backup file; a `javascript:`/`data:text/html` media URL; the
CSP in a real deployment; quota-exceeded behaviour; any browser other than Chromium.

**For every previously exploited bug:** none — there is no incident history (§15).

**Coverage gaps ranked by risk**

1. No regression test pins the "no `innerHTML`" property. This is the single control standing
   between a hostile backup and script execution, and nothing enforces it. **Highest value test to
   add.**
2. No test feeds `normalise()` malformed input.
3. CSP has never been observed in effect, because the app has never been deployed.

## 14. Incident Response

Proportionate to a single-user offline board — the emergency levers are local.

| Situation | Action |
|---|---|
| Board looks wrong / corrupted mid-event | Restore the most recent backup `.json`. Under a minute |
| Restored a file you do not trust | Close the tab, run `indexedDB.deleteDatabase('trivia-night')` in DevTools, reload, restore a known-good backup |
| Suspect a hostile embedded URL | Open the question in edit mode, switch the media tab to **None**, save |
| Need to wipe everything | Clear site data for the origin, or run the delete above |
| Deployed version misbehaving | `npx vercel rollback`, or simply present from the local copy — it needs no network |

**Escalation and breach notification:** N/A — no personal data, no users to notify, no regulator in
scope.

## 15. Incident History

None. No security incident has occurred; the app has not yet been deployed or used at an event.

*(Never delete entries from this section — it is institutional memory.)*

## 16. Known Gaps & Accepted Risks

| Gap | Risk | Severity | Exploitable today? | Since | Owner | Plan / accepted-by |
|---|---|---|---|---|---|---|
| Anyone at the unlocked device can read every answer | Answers spoiled before the event | Low | Yes | 2026-08-01 | Host | **Accepted** — inherent to a single-user offline board. Lock your screen |
| No authentication of any kind | Anyone opening the deployed URL gets a full editable board (their own copy, not the host's) | Low | Yes | 2026-08-01 | Host | **Accepted** — nothing sensitive is exposed. Revisit if the URL is ever shared publicly |
| Pasted media URLs are not scheme-restricted | A hostile URL is loaded in the host's browser | Low | Only self-inflicted | 2026-08-01 | — | **Not yet done** — add an `http(s):` allowlist in `mediaFromUrl()` |
| No regression test pinning the "no `innerHTML`" rule | A future edit could silently open an XSS path via a restored backup | Medium | No | 2026-08-01 | — | **Not yet done** — highest-value test to add (§13) |
| CSP and all security headers are unverified | Policy may be wrong in ways nobody has seen | Low | No | 2026-08-01 | — | **Not yet done** — verify on first deploy |
| Data at rest is unencrypted | Anyone with the disk can read the board | Low | Yes, with the disk | 2026-08-01 | Host | **Accepted** — rely on FileVault; contents are not sensitive |
| No audit trail | Tampering leaves no trace | Low | Yes | 2026-08-01 | — | **Accepted** — disproportionate for one user |
| Backups are plaintext JSON in Downloads | Answers readable by anyone with the file | Low | Yes | 2026-08-01 | Host | **Accepted** — store them somewhere sensible |
| Not a git repository | No history; a bad edit is unrecoverable without a backup | Medium | N/A | 2026-08-01 | — | **Not yet done** — `git init` |

## 17. Pre-Launch / Hardening Checklist

Only relevant if this is ever deployed to a public URL. For a laptop-only trivia night, none of it
is required.

- [ ] `git init && git add -A && git commit` — get a history before anything else. Root: repo root
- [ ] Add a regression test asserting `js/` contains no `innerHTML`/`eval`/`document.write`.
      Verify: `grep -rnE 'innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function' js/` returns nothing
- [ ] Restrict `mediaFromUrl()` to `http:`/`https:` schemes. File: `js/state.js:262`
- [ ] Deploy, then confirm headers land. Verify: `curl -sI https://<url> | grep -iE 'content-security-policy|strict-transport|x-frame'`
- [ ] Load a board with an uploaded image and a YouTube embed on the deployed URL and confirm zero
      CSP violations in the console
- [ ] Feed `normalise()` a truncated and a hostile backup file and confirm the app degrades to the
      seed rather than throwing
- [ ] Decide whether the public URL should exist at all — if the board is only ever presented from
      one laptop, not deploying is the strongest control available

## 18. Change Log

| Date | Change | By | Commit/PR |
|---|---|---|---|
| 2026-08-01 | Initial security document. No auth/authz by design; CSP and security headers configured in `vercel.json` (undeployed); XSS posture rests on a codebase-wide absence of `innerHTML`/`eval` | Claude | — |

# Handover: AI Usage Limit Tracker

A Chrome extension (Manifest V3, plain JavaScript, no build step, no dependencies) that tracks the owner's Claude, ChatGPT and Gemini usage limits. It shows % used and reset times, sends alerts, keeps history and has a dashboard.

- **Current version:** 2.1.2 (in `manifest.json`; the popup footer and dashboard title show the installed version)
- **Status:** working and in daily use as an unpacked extension. Not yet on GitHub or the Chrome Web Store.
- **Built by:** Claude Code, November 2026. Handed over for GitHub hosting and further maintenance.

---

## 1. Your first task: put this on GitHub

1. Create a **private** repository, for example `ai-usage-tracker`. Keep it private unless the owner says otherwise.
2. Commit everything in this folder as-is. `.gitignore` already excludes zips and `.DS_Store`.
3. Suggested first commit message: `Initial commit: AI Usage Limit Tracker v2.1.2`
4. Tag the commit `v2.1.2`.
5. Optional: add a GitHub Release with a zip of the extension for that tag (see "Releasing" below).

Do **not** add a license, CI, a bundler or npm dependencies unless the owner asks. The extension deliberately has zero dependencies.

## 2. How to install it (for the owner)

1. Go to `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose the repo folder.
3. After pulling changes: press the extension's reload arrow, then **refresh any open claude.ai, chatgpt.com and gemini.google.com tabs**. Tabs left open keep running the old content scripts.

## 3. Architecture

```
manifest.json          MV3 manifest (permissions: storage, unlimitedStorage, alarms, notifications)
background.js          Service worker: refresh schedule, alert engine, badge, digest, history recording
lib/core.js            Global CORE: provider list, settings (chrome.storage.sync), IndexedDB history, pace forecast
lib/providers.js       Global AIUT: fetch + parse usage for Claude and ChatGPT (shared by background + content scripts)
lib/ui.js, lib/ui.css  Global UI: DOM/SVG helpers, provider cards, sparklines, line chart (popup + dashboard)
content/hook.js        MAIN-world script: wraps fetch/XHR to spot "message sent" requests on claude.ai / chatgpt.com
content/site.js        Isolated-world script: in-page usage fetch fallback, message logging, Gemini send detection
popup/                 Toolbar popup
dashboard/             Full page: Overview, History, Messages, Settings, Data (also the options page)
icons/                 Generated PNGs
dev/                   Test harness (not used by the extension at runtime; see section 6)
```

All scripts are **classic scripts that each define one global** (`CORE`, `AIUT`, `UI`). The service worker loads them with `importScripts`, and the pages load them with `<script>` tags. Keep it that way, or convert all of it to ES modules together; don't mix.

### Data flow
1. A `refresh` alarm (every N minutes, default 5) makes `background.js` call `AIUT.fetchClaude` / `AIUT.fetchChatGPT`.
2. If the background fetch fails (for example a bot check), it asks an open tab of that site to fetch in-page (`aiut-refresh` message to `content/site.js`). Content scripts also push fresh data every 3 minutes while visible, and about 15 seconds after the user sends a message.
3. `saveResult()` stores the latest result in `chrome.storage.local.usage`, updates the badge, then `processWindows()` runs the alert rules and records history.

### Storage
| Where | Key | What |
|---|---|---|
| `chrome.storage.sync` | `settings` | User settings (thresholds, toggles, plan prices, quiet hours, Claude org). Syncs across the owner's Chrome browsers. |
| `chrome.storage.local` | `usage` | Latest result per provider (`plan`, `windows[]`, `extras[]`, `orgs`, sanitized `raw`, `error`) |
| | `winState` | Per-window alert state for the current reset period (peak, highest alert level sent, heads-up sent) |
| | `msgLog` | `{t, p, m}` for each message sent (35-day retention). Model name only, never prompt text. |
| | `held` | Notifications held during quiet hours |
| | `lastDigest` | Week key of the last Monday digest |
| IndexedDB `aiut` | `samples` | `{t, p, k, pct, r}` readings (120-day retention; written when the value changes or every 30 min) |
| | `periods` | One row per limit window period: `{id, p, k, label, kind, end, peak}`. Feeds weekly peaks and under-use. |

A **window** object is `{ key, label, pct (0–100), resetsAt (ms or null), kind: 'session'|'weekly'|'monthly', link? }`.

### Alert rules (in `background.js`, `processWindows`)
- **Thresholds** (default 75/90/100): only the highest newly crossed level fires. Each level fires once per window period. A period is identified by `resetsAt` rounded to 10 minutes; windows with no reset time and `kind: 'monthly'` use the calendar month.
- **Heads-up:** `CORE.forecast` does a linear fit on recent samples (2h for session windows, 48h for weekly, 7d for monthly). If the projected time to 100% is more than 5 minutes before the reset, it alerts once per period. It only runs when the window is between 40% and 100%.
- **Limit is back:** at 100%, it sets the alarm `back|provider|key` for `resetsAt + 60s`. On firing it refreshes; if the window is still at 100%, it retries every 5 minutes up to 6 times, then notifies.
- **Under-use:** when a weekly window rolls over with a peak below `underusePct` (default 30), it notifies, adding the estimated unused dollars if a plan price is set (price × 7/30 × unused share).
- **Quiet hours:** notifications are queued in `held`. The 15-minute `tick` alarm delivers one summary when quiet hours end.
- **Monday digest:** sent from the `tick` alarm on Mondays at 9am or later, once per week.

## 4. Where the numbers come from (fragile, so read this first when something breaks)

These are **internal, undocumented endpoints**, the same ones the sites' own web apps call. They can change without notice.

| Provider | How | Notes |
|---|---|---|
| Claude | `GET https://claude.ai/api/organizations` → pick the org (the user's choice, else the first with the `chat` capability) → `GET /api/organizations/{uuid}/usage` | Each key whose value has a numeric `utilization` (0–100) and `resets_at` becomes a window: `five_hour`, `seven_day`, `seven_day_opus`, `seven_day_sonnet`, `seven_day_oauth_apps`, and `extra_usage` (only when `is_enabled` isn't false). |
| ChatGPT | `GET https://chatgpt.com/api/auth/session` → `accessToken` → `GET /backend-api/wham/usage` with `Authorization: Bearer …` | `rate_limit.primary_window` and `secondary_window` hold the **Codex** limits (`used_percent`, `limit_window_seconds`, `reset_at` / `reset_after_seconds`). `credits.balance` / `credits.unlimited` is shown if present. The token is used per request and **never stored**. ChatGPT chat caps are not exposed anywhere, so chat messages are only counted locally. |
| Gemini | No usage % available. Prompts are counted when the user presses Enter in the prompt box or clicks the button labelled "Send message" (`content/site.js`). The model name is read from the aria-label of the "Open mode picker, currently …" button. | As of Nov 2026, Gemini sends prompts over a cross-origin WebChannel (`geminiweb-pa.clients6.google.com/v1/processSession`), not the old `StreamGenerate` request. That change is why detection moved to the UI. |

`extra_usage` and `credits` were implemented defensively **without seeing a real reply**. If they don't appear, ask the owner to open Dashboard → **Data** → "Last raw replies" and adjust the parser to match.

When something breaks: Dashboard → **Data** shows the last raw reply from each site, with emails, IDs, names, uuids and tokens removed by `sanitize()` in `lib/providers.js`. Start there.

## 5. Privacy and security rules (keep these)

- The extension only talks to `claude.ai`, `chatgpt.com` and `gemini.google.com`. No analytics, no remote code, no third-party servers.
- It never reads, stores or sends prompt text. `hook.js` only parses `model` from JSON request bodies. The Gemini detection only checks that the prompt box is non-empty.
- It never stores access tokens, cookies or API keys.
- Raw replies are passed through `sanitize()` before storage.
- MV3 forbids remote scripts. Charts are hand-written SVG in `lib/ui.js`; keep it that way.

## 6. Testing

There's no build or test runner. Use the harness in `dev/`:

```bash
cd ai-usage-tracker
python3 -m http.server 8765
```

Then open:
- `http://localhost:8765/dev/bgtest.html` runs the **real** `background.js` alert engine with fake Chrome APIs (`dev/stub.js`) and a fake clock. Expected output:
  - 50% and 60%: no alert. 70%: "on pace to hit the 5-hour window limit". 76%: the 75% alert. 76% again: no alert. 92%: the 90% alert. 100%: "limit reached", plus a `back|claude|five_hour` alarm.
  - Weekly rollover at 20% peak: the under-use alert with about $37 (plan price $200).
  - Back alarm: "your 5-hour window limit is back".
  - Quiet hours: held, then summarized.
  - Extra usage: 80% fires the 75% alert once.
- `http://localhost:8765/dev/preview-popup.html` and `/dev/preview-dashboard.html` render the real UI with seeded data (`dev/seed.js`).

Also run `node --check` on each `.js` file. Real end-to-end testing needs the owner's signed-in Chrome: load unpacked, reload, and check the popup.

## 7. Releasing

1. Bump `version` in `manifest.json` (the popup shows it, so the owner can confirm a reload worked).
2. Commit, then tag `vX.Y.Z`.
3. For a release zip, leave out the dev harness: `zip -r ai-usage-tracker-vX.Y.Z.zip . -x 'dev/*' '.git/*' '*.DS_Store' '*.zip'`

Chrome Web Store publishing hasn't been done. The store would need a privacy policy and justification for the host permissions.

## 8. Backlog (agreed with the owner, not started)

| Item | State | Notes |
|---|---|---|
| Invoices collected automatically | Waiting on a signed-in inspection | Find the requests the billing pages make (claude.ai, chatgpt.com, Google One, Anthropic Console, OpenAI platform). Read-only; skip payment details. |
| API spend (Anthropic, OpenAI) | Waiting on the same inspection | Preferred: read from the consoles using the owner's login, with no key stored. Fallback: Admin API keys encrypted with a passphrase (WebCrypto AES-GCM + PBKDF2, key kept in `chrome.storage.session`). The owner asked about security; Admin keys have full org rights, so never store them in plain text. |
| Real Gemini % used | Waiting on the same inspection | Gemini has 5-hour and weekly compute-based limits (2026) and a Settings → Usage limits page. Find the request behind that page. |
| Estimated API value of agents | On hold (owner's choice) | Plan: read Claude Code (`~/.claude/projects/*.jsonl`) and Codex (`~/.codex/sessions`) token logs via a "Connect folder" button using the File System Access API, priced at API rates. |
| Capping extra usage automatically | Declined by design | The extension shows usage and links to the settings page. It must not change account settings through private endpoints. |

## 9. Owner preferences

- Plan first, then show the plan before building anything big. The owner approves the scope.
- Keep it token- and effort-efficient: small, verified changes.
- Explain things in plain language. The owner isn't a developer.

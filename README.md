# AI Usage Limit Tracker (Chrome extension)

Tracks your **Claude**, **ChatGPT** and **Gemini** usage limits in one place: % used, reset times, history, alerts and a dashboard.

## Install

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and choose this `ai-usage-tracker` folder.
3. Pin the extension, then open claude.ai, chatgpt.com and gemini.google.com once while signed in.

**After an update:** press the reload arrow on the extension in `chrome://extensions`, then refresh any open Claude, ChatGPT or Gemini tabs.

## Features

- **Limits and reset times.** Claude: 5-hour, weekly, and per-model weekly windows. ChatGPT: Codex 5-hour and weekly limits. Gemini: prompts sent from this browser over the last 5 hours and 7 days.
- **Alerts at 75, 90 and 100%.** One alert per level per window. You can change the levels in Settings.
- **Heads-up before you hit a limit.** Warns when your current pace would use up a window before it resets.
- **"Your limit is back".** Notifies you when a window you maxed out resets.
- **Under-use alerts.** A nudge when a week ends below your chosen % (30% by default), with the unused dollar value if you enter your plan price.
- **Extra usage.** Shows your Claude extra-usage spend against your monthly cap (with alerts and a link to change the cap), and your Codex credit balance, when your account reports them.
- **Monday digest, quiet hours** (alerts are held, then summarized), and **message counts** by model.
- **Dashboard** (Alt+Shift+U): Overview, History charts, Messages, Settings, and Data (CSV/JSON export plus the last raw replies from each site).
- **Toolbar badge** showing your highest usage % (green / amber / red), with small trend lines in the popup.
- Settings sync across Chrome browsers signed in to the same Google account.

## Where the numbers come from

| Provider | Source | Notes |
|---|---|---|
| Claude | `claude.ai/api/organizations/{org}/usage` | The same request claude.ai's own usage page makes. |
| ChatGPT | `chatgpt.com/backend-api/wham/usage` | Codex limits on your plan. ChatGPT doesn't expose its chat caps, so chat messages are counted locally. |
| Gemini | Local count of prompts you send (Enter or the Send button) | Gemini doesn't share usage % with extensions yet. |

These are internal, undocumented requests, so they can change without notice. If a card shows an error, open that site in a tab: the extension then fetches from inside the page instead.

## Privacy

- All data stays in your browser. Settings are in Chrome sync storage; history is in local storage and IndexedDB.
- The extension only contacts claude.ai, chatgpt.com and gemini.google.com.
- It reads only the model name from requests you send. Prompt text is never read or stored.
- The ChatGPT access token is used for one request at a time and never saved.

## Files

- `manifest.json`: MV3 manifest
- `background.js`: refresh schedule, alert rules, badge, digest, history
- `lib/core.js`: settings, IndexedDB history, pace forecasting
- `lib/providers.js`: Claude / ChatGPT fetchers and parsers
- `lib/ui.js`, `lib/ui.css`: shared rendering for the popup and dashboard
- `content/hook.js`: page-world hook that spots sent messages
- `content/site.js`: in-page fetch fallback and message logging
- `popup/`, `dashboard/`: user interface
- `dev/`: test harness (see HANDOVER.md)

Developers: start with [HANDOVER.md](HANDOVER.md).

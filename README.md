# AI Usage Limit Tracker (Chrome extension)

Tracks your **Claude**, **ChatGPT** and **Gemini** usage limits in one place: % used, reset times, history, alerts and a dashboard.

**Status: experimental community project.** Contributions are welcome. This project is independent and is not affiliated with or endorsed by Anthropic, OpenAI or Google.

**Before installing:** Claude and ChatGPT usage collection relies on undocumented, authenticated website endpoints. Provider permission has not been established, and automated access may conflict with their terms. Account restrictions and endpoint changes are possible. This is not a provider-approved integration. Read [the review](SECURITY_REVIEW.md) and [privacy details](PRIVACY.md). Known security weaknesses remain in v2.1.2; documentation changes do not fix them.

## Install

1. Download and extract the current `main` branch, or clone this repository. The historical `v2.1.2` tag predates the licence and community documentation.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose this `ai-usage-tracker` folder.
4. Pin the extension, then open claude.ai, chatgpt.com and gemini.google.com once while signed in.

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

These are internal, undocumented requests and may change without notice. The current implementation automatically retries through an open site tab when background fetching fails. This does not establish permission to automate access. Do not bypass provider access controls or rate limits. Gemini support here is a local message counter, not an official usage quota integration.

## Privacy

- No developer analytics or collection server is present in the reviewed code.
- Usage history and message metadata are stored locally. Settings, including optional plan prices and the selected Claude organisation ID, use Chrome sync storage and may sync through Google.
- Claude/ChatGPT request bodies are parsed in memory to extract the model name. Gemini prompt-box text is inspected in memory to determine whether it is empty. The normal logging paths do not retain or forward prompt text; “never reads prompts” is not an accurate description.
- The ChatGPT session token is used in memory to request usage and is not intentionally persisted.
- Claude organisation IDs/names and filtered diagnostic replies are stored locally. Diagnostic filtering is incomplete. Review exports manually before sharing; do not post raw exports in issues.

See [PRIVACY.md](PRIVACY.md) for storage, retention and deletion limits.

## Contributing

Bug reports, documentation improvements, accessibility fixes, tests and privacy improvements are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md). Open an issue before a large change, fork the repository, and submit a focused pull request. Maintainer review is required before changes are merged.

Priority work: minimise diagnostic storage, validate and rate-limit messages, make CSV exports safe, improve deletion controls, and replace undocumented integrations with authorised options where available.

For sensitive reports, see [SECURITY.md](SECURITY.md). Never include session tokens, cookies, private conversations or account exports in a public issue.

## Licence

Copyright (c) 2026 Timothy Paul Martinez and contributors, to the extent copyright subsists in their contributions.

This project is licensed under the **GNU General Public License version 3 only** (`GPL-3.0-only`). See [LICENSE](LICENSE) for the full terms. This grant also covers the project code in the original v2.1.2 handover, to the extent the maintainer holds the rights to license it; that historical archive does not itself contain a licence file.

You may use, modify and redistribute the software, including commercially, under GPLv3. When distributing covered versions, preserve required notices, provide the corresponding source as required by GPLv3, and retain GPLv3 for the covered work. Private modifications do not have to be published. There is no requirement to submit changes to this repository. No warranty is provided, to the extent permitted by law.

The licence grants rights in this project; it does not grant permission to access third-party services or use their trademarks. AI-assisted development is documented in the original handover; no claim is made that every generated element has enforceable copyright in every jurisdiction.

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

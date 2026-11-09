# Privacy information

Reviewed 9 November 2026 for v2.1.2. Maintainer: Timothy Paul Martinez. This describes the current code, including its limitations; it is not a claim of Chrome Web Store approval.

## Purpose and data flow

The extension displays AI usage information, local message counts, alerts and history. It makes authenticated requests to Claude and ChatGPT using the user's existing browser session. Providers receive those requests and normal connection metadata. The reviewed extension has no developer analytics, advertising, remote code or developer collection server. Opening a billing link navigates to the relevant provider; it does not collect billing details.

Claude/ChatGPT request bodies are parsed in memory to obtain the model field. Gemini prompt-box text is accessed in memory to test whether it is empty, and the model selector is read. Normal message logging stores a timestamp, provider and model, not conversation text. The page message channel is not authenticated, so malformed or forged page events may produce inaccurate logs. The ChatGPT access token is used in memory and is not intentionally saved.

## Storage

| Data | Storage and retention in current code |
| --- | --- |
| Thresholds, toggles, optional plan prices, selected Claude organisation ID | Chrome sync storage; may be synchronised through Google if browser sync is enabled. Kept until changed or removed. |
| Latest usage, plan, Claude organisation IDs/names, filtered diagnostic replies | Chrome local storage; overwritten by future results, but no fixed expiry or complete in-app deletion control. |
| Message timestamps/provider/model | Chrome local storage; entries older than 35 days are removed when another message is logged, not by a guaranteed daily cleanup. |
| Usage samples | IndexedDB; samples older than 120 days are pruned by the periodic background tick when it runs. |
| Period summaries | IndexedDB; no automatic age-based pruning is implemented. |
| Alert state, held alerts, digest bookkeeping | Chrome local storage; managed as alerts run, with no general fixed expiry. |
| JSON/CSV exports | Files saved to the user's device; retained until the user deletes them. |

The extension does not add its own encryption to stored data or exports. Protection depends on Chrome, the device and account security. Raw-response filtering removes some matching field names but is not a reliable anonymisation guarantee. Generic IDs, unexpected fields and deeply nested data can remain. The full JSON export also includes settings and organisation data.

## Controls and sharing

Dashboard → Data can clear usage history and message logs separately. These actions do not remove all settings, cached usage, organisation data or diagnostic replies. Disable the extension to stop its activity. Uninstalling removes the installed extension; synced settings, external backups and downloaded exports may require separate handling. Review Chrome's sync settings and delete exports you no longer need.

Do not share raw diagnostics or exports publicly. Use fabricated examples for bug reports. Public GitHub issues and pull requests are handled by GitHub under its own privacy policy. The maintainer does not automatically receive your usage data, but can see information you intentionally post or send.

## Permissions

`storage` saves settings and cached data; `alarms` schedules updates and cleanup; `notifications` displays alerts. `unlimitedStorage` is currently requested for history but should be reassessed. Host access is limited to `claude.ai`, `chatgpt.com` and `gemini.google.com`. The MAIN-world hook is also injected on Gemini even though Gemini counting uses the isolated script; narrowing this is a planned improvement.

Before any Chrome Web Store submission, the maintainer must verify current disclosure, consent, permission and privacy-policy requirements and bring the implementation and in-app wording into agreement with them.

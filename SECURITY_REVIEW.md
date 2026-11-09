# Security and legal risk review

Date: 9 November 2026. Reviewed runtime: v2.1.2, commit `f589b9280e231f2c92ffa1b1b3e956a57861d67c`.

## Conclusion

The source is being shared for community review, not certified as safe or provider-approved. The main unresolved issue is authenticated polling of undocumented Claude and ChatGPT website endpoints. Publishing under GPLv3 does not resolve provider terms, privacy obligations, third-party rights or account risk. Do not treat a disclaimer as permission to automate a service.

Recommended before promoting installation or submitting to an extension store: resolve provider authorisation and fix the security/privacy findings below. For the lowest risk, disable the extension pending that work. A safer redesign could use documented, authorised interfaces or manual user input; official API billing is not necessarily equivalent to consumer subscription usage limits. Do not replace automated polling with scraping and assume that solves the terms issue.

## Scope and checks

- Static review of the manifest, all runtime JavaScript, HTML/CSS, development fixtures and documentation; no package dependencies or build system were present.
- All 10 JavaScript files passed `node --check`.
- Common private-key and provider/GitHub credential patterns produced no matches in project text files. This is a limited pattern scan, not proof that every possible secret or third-party work is absent.
- Synthetic Node VM checks confirmed that generic IDs and deeply nested token-shaped fields survive diagnostic filtering, and that a forged same-page send event is accepted. No real accounts, credentials or provider requests were used.
- Reviewed CSV construction and confirmed that a formula-leading synthetic model is exported without neutralisation. Did not test execution in Excel, LibreOffice or Sheets.
- No live signed-in extension test, penetration test, independent provenance audit, legal opinion or Chrome Web Store review was performed. No runtime code was changed during this review.

## Security and privacy findings

Severity reflects the observed prerequisites, not a claim of remote exploitation by any website.

| Priority | Finding and evidence | Impact and recommended fix |
| --- | --- | --- |
| Medium | `lib/providers.js` → `sanitize()` returns objects unchanged once depth exceeds six and only rejects selected key names. Synthetic nested token data and a plain `id` survived. `fetchClaude()` also intentionally retains organisation IDs and names outside `raw`. | Raw replies and JSON exports must not be treated as anonymised. Remove raw storage or retain only strictly allowlisted numeric/label fields. Omit data at depth limits; use size limits and independent export redaction. |
| Medium | `content/site.js` accepts any same-window message bearing the expected marker. The service worker checks the extension ID but does not bind a claimed provider to `sender.url` or validate the complete usage schema. A synthetic same-page event was accepted without sending a message. | Script already executing on an allowed provider page can spoof counts/model labels and flood log writes. This is not evidence of arbitrary websites reading extension storage. Add strict validation, per-provider sender checks, bounded logs and rate limiting. Checking `e.origin` alone cannot authenticate another script in the same page. |
| Medium, conditional | `dashboard/dashboard.js` builds CSV using joins and `JSON.stringify` for model text. This is not a complete CSV encoder and does not neutralise leading spreadsheet formulas. | A tainted model/window field may become a spreadsheet formula when an export is opened, depending on the spreadsheet. Attacker needs control of input data and the user must open the export. Use standard CSV escaping and formula neutralisation for all text fields. |
| Low to medium | Background polling, visible-tab polling, visibility events and message-triggered polling can overlap. There is no fetch timeout, shared request deduplication, exponential backoff, or explicit 429/Retry-After handling. | Excess requests, hanging work and provider throttling are possible, especially with many tabs. Centralise scheduling, cap retries, respect 429/403 responses and avoid retrying around access restrictions. |
| Medium privacy gap | Full JSON export includes settings, optional plan prices, organisation data and raw diagnostics. Message retention is enforced only when another message is logged; period records are not pruned. Data-tab clearing is incomplete. | Users may retain or share more data than expected. Add scheduled retention, an explicit full-data reset, export warnings/redaction and a choice of local-only settings. Storage has no extension-specific encryption. |
| Low / reliability | Usage and history are keyed by provider rather than authenticated account. Changing accounts or using multiple signed-in contexts can mix readings or preserve stale data. | Misleading usage, alerts and account history. Partition data by a minimally identifying account context and clear/invalidate on account changes. |
| Low / minimisation | `unlimitedStorage` is requested and the MAIN-world hook runs on Gemini although its send-path handling is unused there. | Reassess the storage permission and narrow script matches. Avoid expanding host permissions. |

Positive observations: host permissions are restricted to three named providers; there is no `<all_urls>`, externally-connectable interface, remote script loader, telemetry server or npm dependency tree. Normal UI text is appended as text nodes, rather than inserted as HTML. The session token obtained for ChatGPT usage is not intentionally persisted. These observations do not rule out other defects or changes in provider responses.

The original assertions that prompt text is never read, all data stays in the browser, and IDs are always removed were too broad. Request bodies and Gemini prompt text are processed in memory; sync settings can leave the device; redaction is incomplete. README and PRIVACY now describe the actual behaviour. Existing source comments and the in-app diagnostics sentence remain unchanged and should be corrected with the next runtime change.

## Legal and platform assessment

This is a preliminary risk assessment, not legal clearance. The terms served during review may vary by jurisdiction, account type and effective date. A Philippines-qualified lawyer with software/platform-contract experience should review the intended distribution and applicable account agreements if the maintainer needs legal assurance.

### 1. Provider access: highest priority

**OpenAI:** the official Rest-of-World individual terms, effective 1 January 2026, restrict automated/programmatic extraction of data and interference with protective measures. The extension retrieves an authenticated session token and polls `/backend-api/wham/usage`. Applying those clauses to this implementation is a substantial contractual risk, not a conclusion that a court has found it unlawful. Account restriction or termination is a plausible consequence under the terms. Seek written permission or a documented authorised integration.

**Anthropic:** the official consumer terms retrieved on review restrict automated access except through API keys or explicit permission, as well as unpermitted data harvesting and interference with protections. The returned page identifies EEA/Swiss consumers; its exact applicability to a Philippine account is not established by this review. The matching local/account terms must be confirmed. Session-cookie polling of `/api/organizations/.../usage` nevertheless warrants provider clarification before encouraging adoption. A personal login and a read-only GET request do not themselves establish automation permission. The open-tab fallback is not proof of a technical bypass, but it should not be used to evade restrictions.

**Google/Gemini:** current code counts local UI actions rather than polling a private usage endpoint, so the specific polling risk is lower. Google terms still restrict abuse, deceptive affiliation and some automated access. This is not a blanket compliance finding. New Gemini usage or billing integrations would need a fresh assessment.

Provider terms concerns are distinct from a finding of criminal access or copyright infringement. Neither such finding was established here. No guarantee against complaints, enforcement or litigation can be given.

### 2. Privacy and Chrome Web Store

The extension accesses authentication information, account/usage metadata and page content in memory. Local processing does not exempt a Chrome Web Store extension from privacy disclosure requirements. Before submission, reconcile the implementation, in-app statements, privacy policy, permission justification and informed consent. A README warning alone does not guarantee compliance or store acceptance.

The maintainer currently has no automatic collection server. This reduces central data exposure but does not settle applicable privacy-law duties. Adding analytics, shared dashboards, invoice collection, support uploads or API/admin credentials would materially change the assessment. Do not collect real diagnostics through public issues.

### 3. GPLv3 and third-party rights

GPL-3.0-only is appropriate for requiring distributed covered modifications to remain under GPLv3 with corresponding source. It allows commercial redistribution and private modifications; it does not require contributors to send patches upstream. The maintainer's grant applies only to rights they hold. No bundled third-party dependency or conflicting licence notice was identified, but this is not a complete code/asset provenance clearance.

The handover identifies Claude Code assistance. AI output ownership provisions do not guarantee originality or copyright in every generated element. US Copyright Office guidance requires sufficient human authorship; other jurisdictions may differ. GPL cannot create copyright in otherwise unprotected material. Preserve development/provenance records and review copied snippets and generated assets rather than promising that every line is enforceably copyleft.

### 4. Branding and claims

Use product names descriptively, avoid provider logos or implied endorsement, and retain the independent-project statement. Do not claim exact official Gemini quotas, guaranteed accuracy, provider approval, guaranteed account safety or complete anonymity. Forecasts and unused-plan dollar estimates are approximate, not credits or refunds owed by providers.

## Recommended next work

1. Establish permitted provider integrations or remove/disable automatic undocumented polling before promoting general installation.
2. Remove or strictly allowlist diagnostics; add safe exports, validated/rate-limited messages, bounded polling and complete data deletion.
3. Correct the remaining runtime privacy wording and minimise permissions; retest in a separate profile with informed permission.
4. Review source/asset provenance, platform terms for target countries/plans, and Chrome Web Store disclosures before store distribution.

## Primary sources checked

- [OpenAI Rest-of-World Terms of Use](https://openai.com/policies/row-terms-of-use/) — automated extraction, restrictions and termination.
- [Anthropic Consumer Terms](https://www.anthropic.com/legal/consumer-terms) — retrieved EEA/Swiss wording; confirm applicable regional version.
- [Anthropic Commercial Terms](https://www.anthropic.com/legal/commercial-terms) — separate scope; not automatic permission for consumer-session polling.
- [Google Terms of Service](https://policies.google.com/terms) — abuse, automated access and affiliation restrictions.
- [Chrome Web Store policies](https://developer.chrome.com/docs/webstore/program-policies/policies) — disclosure, data use and minimum permissions.
- [Chrome Web Store user data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) — disclosure also applies to local processing.
- [GNU GPL FAQ](https://www.gnu.org/licenses/gpl-faq.en.html) — source distribution and private modifications.
- [US Copyright Office AI report announcement](https://newsroom.loc.gov/news/copyright-office-releases-part-2-of-artificial-intelligence-report/s/f3959c36-d616-498d-b8f9-67641fd18bab) — human authorship limitations, not a statement of Philippine law.

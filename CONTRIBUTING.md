# Contributing

Thank you for helping improve AI Usage Limit Tracker. Small, well-explained contributions are welcome.

## Reports and proposals

Search existing issues first. For bugs, include extension and Chrome versions, operating system, provider, expected behaviour, actual behaviour and steps to reproduce. Use synthetic examples and redact screenshots. Do not upload account exports, cookies, access tokens, organisation identifiers or private conversations. Use SECURITY.md for sensitive reports.

For features or major changes, open an issue describing the user need before implementation. Provider-approved integrations, privacy, accessibility, reliable counters and tests are current priorities. Do not add billing automation, bypass access controls, or assume that an internal endpoint is approved for third-party use.

## Development

1. Fork this repository and create a branch for one focused change.
2. Keep the existing Manifest V3, plain JavaScript architecture. No build step or dependencies are currently required. Discuss new permissions, dependencies or remote services first.
3. Prefer synthetic fixtures. Do not test against another person's account or send test traffic to provider services.
4. Run `node --check` on changed JavaScript files.
5. Serve the repository with `python3 -m http.server 8765 --bind 127.0.0.1`. Open `/dev/bgtest.html`, `/dev/preview-popup.html` and `/dev/preview-dashboard.html`. Expected results are in HANDOVER.md.
6. Where necessary and authorised, test an unpacked extension in a separate Chrome profile. Reload the extension and refresh affected tabs after changes. Do not claim live integration tests if you only used mocks.
7. Submit a pull request describing the problem, change, tests and any privacy or permission implications.

Use text nodes for untrusted values. Validate message origins, sender context, payload shape and sizes. Avoid storing diagnostic responses; use a strict allowlist if diagnostic data is necessary. Safely encode CSV fields and neutralise formulas. Keep any session token in memory only.

## Licensing and review

By intentionally submitting a contribution for inclusion, you agree to license your contribution under GPL-3.0-only. Submit only work you have rights to license. Disclose borrowed code, assets and their licences. Identify material AI assistance and review generated work for correctness and provenance. Do not add incompatible proprietary code or remove existing attribution.

All pull requests are subject to maintainer review. No separate copyright assignment is required. Be respectful, specific and constructive.

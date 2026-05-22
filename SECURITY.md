# Security Policy

## Supported Versions

stackyrd-nano is under active development. Security fixes are applied to the current main branch.

---

## Reporting a Vulnerability

If you discover a security vulnerability in `stackyrd-nano`, **please do not open a public issue.**

Instead, report it privately so we can address it before malicious actors exploit it:

- **Email**: Report security issues via GitHub's [private security advisory](https://github.com/diameter-tscd/stackyrd-nano/security/advisories) feature.
- **Details to include**:
  - A clear description of the vulnerability.
  - Steps to reproduce.
  - Potential impact.
  - Suggested fix or workaround (if known).

We will respond as promptly as possible and work with you to coordinate a fix and disclosure timeline.

---

## Security Best Practices for Contributors

- **Never commit secrets** — API keys, passwords, tokens, certificates, or similar credentials.
- **Sanitize all user input** — validate and escape data that enters the system from external sources.
- **Follow the principle of least privilege** — grant only the minimum access necessary.
- **Report suspicious behavior** through the private advisory channel, not public issues.

---

## License

stackyrd-nano is licensed under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).

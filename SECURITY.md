# Security Policy

## Supported Versions

Project Sunflower security fixes are applied to the `main` branch.

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Use GitHub's private vulnerability reporting feature:

1. Go to the repository's **Security** tab.
2. Click **"Report a vulnerability"**.
3. Fill in the description, impact, and reproduction steps.

We will acknowledge your report within 72 hours and aim to release a fix within 14 days for critical
issues.

Please include:

- A description of the vulnerability and its potential impact
- Reproduction steps (a minimal proof-of-concept if possible)
- Any relevant version information

We ask that you:

- Give us reasonable time to fix the issue before public disclosure
- Not access or modify user data beyond what is needed to demonstrate the vulnerability

## Threat Model

See [`docs/security.md`](docs/security.md) for the full threat model, including the vault
cryptographic design.

## Out of Scope

- Self-XSS (you are the only user of your own instance)
- Issues requiring physical access to the user's machine (the user is the attacker in that model)
- Social engineering

## Acknowledgements

We will credit reporters in the CHANGELOG unless they prefer to remain anonymous.

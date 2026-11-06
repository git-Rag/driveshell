# Contributing to Project Sunflower

Thank you for your interest in contributing! This document explains how to get involved.

> **Not affiliated with or endorsed by Google or Microsoft.**

## Code of Conduct

All contributors are expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md). Be kind and
constructive.

## Getting started

1. Fork the repository.
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/thesunflowerproject.git`
3. Install dependencies: `pnpm install`
4. Create a `.env` from `.env.example`.
5. Start the dev environment: `pnpm dev`

## Development workflow

- Branch from `main`: `git checkout -b feat/my-feature`
- Make small, focused commits using [Conventional Commits](https://www.conventionalcommits.org/):
  - `feat:` new feature
  - `fix:` bug fix
  - `chore:` tooling, deps, config
  - `docs:` documentation only
  - `test:` tests only
  - `refactor:` code change that is neither a fix nor a feature
- Run `pnpm typecheck && pnpm lint && pnpm test && pnpm build` before pushing.
- Open a pull request against `main`.

## Architecture decisions

Non-trivial technical decisions are documented as ADRs in `docs/decisions/`. If your change involves
a significant trade-off, add or update an ADR.

## Security

**Do not open GitHub issues for security vulnerabilities.** Follow the
[private reporting process](SECURITY.md).

## Good first issues

Look for issues labelled `good first issue` in the issue tracker. They are small, well-defined, and
don't require deep context.

## Questions

Open a [GitHub Discussion](https://github.com/git-Rag/thesunflowerproject/discussions) for questions
and ideas.

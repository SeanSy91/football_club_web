# Project Instructions

## Product

This repository contains the responsive web version of KFC Football Club, a private football club management service.

Read `docs/product-spec.md`, `docs/architecture.md`, and `docs/development-plan.md` before implementation decisions.

## Technology

- Semantic HTML
- Plain CSS
- Vanilla JavaScript
- Supabase Auth, PostgreSQL, Storage, and database functions
- GitHub Pages deployed by GitHub Actions

Do not introduce React, Vue, Angular, a CSS framework, a bundler, or a custom application server without an explicit architecture decision.

## Security

- GitHub Pages is a public static host. Everything under `site/` is public.
- A Supabase publishable key may be used in the browser only with complete Row Level Security.
- Never commit service-role keys, OAuth client secrets, database passwords, or private environment files.
- Never trust client-provided roles, timestamps, counts, invitation validation, or waitlist positions.
- Privileged and concurrency-sensitive operations must use PostgreSQL functions and transactions.
- Invitation codes must be hashed and unavailable to ordinary clients.

## Quality

After coherent changes:

1. Run `node --test`.
2. Serve `site/` locally and test desktop and mobile layouts in a browser.
3. Check keyboard navigation and visible focus.
4. Run `git diff --check`.
5. Report every failure and non-blocking warning.

Implement one development stage at a time. Version, commit, tag, and push only after the stage passes validation.

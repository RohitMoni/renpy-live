# Renpy Live

Browser-based Ren’Py authoring and, later, browser delivery with live services.

Initial hosting: GitHub Pages for the editor shell, a Cloudflare Worker for GitHub App authentication, creator-owned repositories for game projects. No database required for this starter.

## Current milestone

This is an infrastructure starter, not yet a game editor. The page links to an authentication dashboard hosted by the Worker. The dashboard can sign in and list repositories accessible through the installed GitHub App. Tokens never enter the editor page. Editing, project creation, LFS uploads, builds, and game publishing are future milestones.

See [setup instructions](docs/setup.md).

## Local verification

Node 22 or newer: `node --test auth-worker/test/*.test.mjs`.

## Layout

- `web/`: static editor shell, deployed to Pages.
- `auth-worker/`: dependency-free Worker source and Wrangler configuration.
- `docs/`: setup and architectural decisions.

No license has been selected yet.

# Setup agent attempt: Notion public connection

- **Date:** 2026-11-10, 14:41:45–14:42:58 local (about 1.5 min of agent work after sign-in)
- **Setup agent:** Claude Code driving the Claude desktop app's built-in browser.
- **Workspace:** the developer's personal workspace (free plan).
- **Goal:** create a public OAuth connection wired to Composio's callback, and observe where the agent must hand over to the developer.
- **Not recorded here:** the client ID and client secret. The secret stayed masked; the agent never revealed it. The test connection was deleted right after the attempt (2026-11-10).

## Timeline

| Time | Step | Owner | What happened |
|---|---|---|---|
| 14:03:43 | Open `notion.so/profile/integrations` | Setup agent | Redirects to `app.notion.com/developers/connections` ("Developer tools → Connections") |
| 14:04–14:07 | First try | Setup agent | The page looked signed in, but its API calls returned 401 and **Create did nothing, with no error**. |
| 14:07:52 | **Takeover: sign in at app.notion.com** | You | The developer signed in (their wait isn't counted) |
| 14:41:45 | New connection | Setup agent | Name `OAuth Runway test`; auth method **OAuth** (vs. API token); Installable in **Any workspace**; Redirect URI = Composio callback (a tag input: press Enter). "By creating a connection, you agree to Notion’s Developer Terms" (approved by the developer). |
| 14:42:19 | Create connection | Setup agent | **Created instantly. No company, website, privacy policy, terms or review step.** Marketplace listing: Unpublished (optional). |
| ~14:42 | Unregistered redirect `https://example.com/callback` | Setup agent | Rejected: "Missing or invalid redirect_uri." |
| ~14:42 | Sub-path of the registered redirect (`…/auth/callback/extra`) | Setup agent | **Rejected** with the same message: exact match |
| 14:42:58 | Open the consent screen | Setup agent | Rendered (see below). **Select pages was not clicked.** |

Hands-on time: about 1.5 min of agent work. The Guide's old estimate for creating the connection (10 min) was generous.

## What the form looks like now

- **API token** ("Limited to 1 workspace and not Marketplace-eligible") vs **OAuth** ("Supports multiple workspaces and is Marketplace-eligible").
- Redirect rules on the connection page: HTTPS; "can’t include URL fragments, relative paths, wildcards, or public IP addresses".
- **Default capabilities** after creation: read, update and insert content; read and insert comments; **user information including email addresses**.
- The page shows a ready-made Authorization URL with `owner=user`.

## Consent screen

- "Connect with OAuth Runway test", the permissions list, then **Select pages** (the user picks pages to share).
- **"Make sure you trust OAuth Runway test (backend.composio.dev)"**: the redirect domain is shown.
- "Notion does not review third party connections such as “OAuth Runway test”."

## Takeover points observed

1. **Sign-in** to app.notion.com (separate from a stale notion.so session).
2. **Agreeing to Notion's Developer Terms**, which is implied by clicking Create.
3. **Copying the client secret** into Composio. The agent must not handle the secret.
4. **Selecting pages and allowing access** on the consent screen, as the end user.

## What changed in the Guide

The new Tested Claims t1–t6 are in `data/curated/notion.json`:
- The "no verification" Gates now rest on a Tested Claim (t1), not only on what the form's docs list.
- Redirect rules and exact matching are now known (t2, t3), which settles two former unknowns.
- Two gotchas were added (the consent screen shows composio.dev; default capabilities include user emails).

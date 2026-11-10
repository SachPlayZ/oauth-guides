# Setup agent attempt: Slack app

- **Date:** 2026-11-10, 14:00:51–14:03:18 local (about 2.5 min of agent work)
- **Setup agent:** Claude Code driving the Claude desktop app's built-in browser.
- **Workspace:** a new, empty workspace the developer created for this test. A first try in their company workspace was stopped at their request before anything was installed; that app was removed.
- **Goal:** create a Slack app wired to Composio's callback, make it installable by any workspace, and observe where the agent must hand over to the developer.
- **Not recorded here:** the client ID, client secret and app ID. The agent never opened the page that shows the secret. The test app was deleted right after the attempt (2026-11-10).

## Timeline

| Time | Step | Owner | What happened |
|---|---|---|---|
| — | **Takeover: sign-in + new workspace** | You | The developer signed in to Slack and created a throwaway workspace |
| 14:00:51 | Open `api.slack.com/apps?new_app=1` → **From a manifest** | Setup agent | — |
| ~14:01 | Paste the manifest | Setup agent | Name, bot user, redirect URL `https://backend.composio.dev/api/v3/toolkits/auth/callback`, bot scopes `channels:read channels:history chat:write users:read`, user scope `search:read`. The editor ignored a scripted value (Slack then showed 0 scopes); a real keystroke after pasting fixed it. |
| ~14:01 | Pick the workspace | Setup agent | Required, and "This can’t be changed later." |
| 14:01:28 | Create and Install | Setup agent | **App created instantly.** Lands on the install consent screen for the dev workspace. **Allow was not clicked.** |
| 14:02:37 | Manage Distribution → Activate Public Distribution | Setup agent | Checklist: three items ticked themselves (features, redirect URLs, HTTPS); the fourth is a box confirming no hard-coded tokens. **Activated instantly. No review, verification or questionnaire.** The page then shows "installed on 0 active workspaces". |
| ~14:03 | Unregistered redirect `https://example.com/callback` | Setup agent | Rejected: "redirect_uri did not match any configured URIs" |
| ~14:03 | Sub-path of the registered redirect (`…/auth/callback/extra`) | Setup agent | **Accepted**: consent screen shown. The OAuth page says a passed URL "must (partially) match". |
| 14:03:18 | Scope not on the app (`files:read`) | Setup agent | **Accepted**: consent screen listed it |

Hands-on time: about 2.5 min of agent work. The Guide's old estimate for creating and configuring the app (20 min) was generous. Marketplace submission and the history rate limit weren't exercised.

## Settings observed

- **PKCE**: opt-in, off by default ("required if your app redirects to a custom URI scheme").
- **Token rotation**: opt-in, off by default.
- Each scope shows "Please add reasons for your app to request this scope": reasons are for Marketplace review. "After your app is listed in the Marketplace, it will only be able to use permission scopes Slack has approved."

## Consent screen

- "Allow OAuth Runway test to access Slack", then "Where do you want to use OAuth Runway test?" with a workspace picker.
- In the dev workspace: "App created by a member of your workspace".
- Requested permissions are grouped (content about you, channels, workspace; actions in channels).
- **No redirect domain is shown**, unlike GitHub and Notion.

## Takeover points observed

1. **Sign-in and picking the right workspace.** The agent must not create the app in a company workspace by accident; ask first.
2. **Copying the client secret** into Composio (Basic Information page). The agent must not handle the secret.
3. **Clicking Allow** on the consent screen, as the end user.

## What changed in the Guide

The new Tested Claims t1–t6 are in `data/curated/slack.json`:
- Business, publisher and domain verification are now "no" (t1), so the level is **R2**, not R2–R3?.
- The create, configure and distribute steps now estimate 7 min in total instead of 35.
- Two gotchas were added (sub-path redirects are accepted; runtime scopes vs approved Marketplace scopes).

# Setup agent attempt: GitHub OAuth app

- **Date:** 2026-11-10, 03:04:04–03:06:40 local (2 min 36 s end to end)
- **Setup agent:** Claude Code driving the Claude desktop app's built-in browser. Claude in Chrome was not available on this machine.
- **Goal:** create a GitHub OAuth app wired to Composio's callback, and observe where the agent must hand over to the developer.
- **Not recorded here:** the client ID and client secret. The secret was never read by the agent. The test app was deleted right after the attempt (2026-11-10).

## Timeline

| Time | Step | Owner | What happened |
|---|---|---|---|
| 03:04:04 | Open `github.com/settings/applications/new` | Setup agent | Redirected to sign-in |
| 03:04:06 | **Takeover: sign-in + 2FA** | You | GitHub sent a push to GitHub Mobile; the developer approved it on their phone |
| 03:04:46 | Form loads (≈40 s for the handover) | — | — |
| 03:04:50 | Fill the form | Setup agent | Name `OAuth Runway test`, homepage, description, Redirect URI `https://backend.composio.dev/api/v3/toolkits/auth/callback` |
| 03:05:20 | Fix two fields | Setup agent | The description and redirect fields ignored scripted input, then doubled typed text. Fixed by setting values directly and reading every field back before submitting. |
| 03:05:28 | Register application | Setup agent | **Created instantly. No review, verification or questionnaire.** Lands on the app page with "0 users" and an offer to list in the Marketplace (optional). |
| 03:05:35 | Generate a client secret | Setup agent clicks; **you copy** | Secret shown at once, with no sudo prompt because the 2FA sign-in was under a minute old. The agent didn't read it. Pasting it into Composio is the developer's step. |
| 03:05:50 | Open the consent screen (PKCE S256, scopes `repo read:user`) | Setup agent | Consent screen rendered (see below). **Authorize was not clicked.** |
| 03:06:10 | Unregistered redirect `https://example.com/callback` | Setup agent | Rejected: "The redirect_uri is not associated with this application." |
| 03:06:20 | Sub-path of the registered redirect (`…/auth/callback/extra`) | Setup agent | **Rejected** with the same message |
| 03:06:35 | PKCE `code_challenge_method=plain` | Setup agent | Rejected: "The code_challenge_method is expected to be 'S256'. (code_challenge_method 'plain' is not supported.)" |

Hands-on time: about 1.5 min of agent work plus about 40 s of developer handover. The Guide's estimate for creating the app (5 min) is generous. The rest of the Guide's effort (Composio auth config, connecting a test account, org approvals) wasn't exercised.

## What the registration form looks like now

- **Redirect URIs** is a list ("You may add up to 10 redirect URIs"), not a single "Authorization callback URL" field as in older docs and screenshots.
- **Allow wildcard matching** is a per-URI checkbox, off by default.
- **Expire user access tokens** is checked by default.
- **Enable Device Flow** is unchecked by default.

## Consent screen (what your users see)

- "Authorize OAuth Runway test", "by <owner name>": the owner's **display name**, not the org or brand. Own the app from an org to show a company name.
- Requested access is listed (Personal user data, Repositories: public and private).
- **Organization access**: each org the user belongs to is shown with ✓ (no restriction), **Request** (access restrictions on: the org owner must approve), or **Grant** (the user is an owner and can approve on the spot).
- **"Authorizing will redirect to https://backend.composio.dev"**: users see Composio's domain even with your own OAuth app. To show your own domain, register a redirect on your domain that 302-forwards to Composio's callback.
- Trust badges under the buttons: **"Not owned or operated by GitHub"**, **"Created less than a day ago"**, **"Fewer than 10 GitHub users"**. A brand-new app looks untrusted to early users.

## Takeover points observed

1. **Sign-in and 2FA** (GitHub Mobile push). The agent can't and shouldn't do this.
2. **Copying the client secret** into Composio. The agent must not handle the secret.
3. **Clicking Authorize** on the consent screen, as the end user.
4. *(Expected, not observed)* **Sudo prompt** before revealing a secret when the sign-in is older. GitHub asks again for 2FA or a password.

## What changed in the Guide

The new Tested Claims t1–t7 are in `data/curated/github.json`:
- The "no review" Gates now rest on a Tested Claim instead of an Unverified one.
- Two gotchas were added (the redirect domain shows Composio; new-app trust badges).
- The exact-match redirect and PKCE S256-only Claims are now Tested.

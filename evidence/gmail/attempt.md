# Setup agent attempt: Google OAuth client for Gmail

- **Date:** 2026-11-10, 14:43:23–14:53:12 local (about 10 min, including three approval questions to the developer)
- **Setup agent:** Claude Code driving the Claude desktop app's built-in browser.
- **Account:** the developer's personal Google account (no organization).
- **Goal:** create a Google Cloud project, configure Google Auth Platform, create a Web OAuth client wired to Composio's callback, then try Gmail scopes. Verification was out of scope.
- **Not recorded here:** the client ID and client secret. The secret was redacted before the agent read the dialog. The test project was shut down right after the attempt (2026-11-10; Google deletes it after 30 days).

## Timeline

| Time | Step | Owner | What happened |
|---|---|---|---|
| 14:43:23 | Open `console.cloud.google.com/projectcreate` | Setup agent | Already signed in. "You have 20 projects remaining in your quota." |
| 14:44:44 | Create project `oauth-runway-test` | Setup agent | About 10 s. Google Auth Platform: "not configured yet" → Get started |
| 14:45–14:48 | Branding wizard | Setup agent | 4 steps: app name + support email; Audience **External** ("will start in testing mode … only available to users you add"); contact email; Finish |
| ~14:48 | **Takeover: agree to the User Data Policy** | You | The developer approved ticking "I agree to the Google API Services: User Data Policy" |
| 14:48:30 | Create | Setup agent | "Processing…" ~10 s. **No home page, privacy policy, logo or review asked for.** |
| 14:49:02 | Create OAuth client → Web application | Setup agent | Redirect URI = Composio callback. New checkbox "Use this client for an AI-powered agent". Note: "It may take 5 minutes to a few hours for settings to take effect." |
| 14:49:43 | **Takeover: copy the client secret** | You | Dialog shows client ID and secret **once**: "You will no longer be able to view or download the client secret once you close this dialog." |
| ~14:50 | Unregistered redirect `https://example.com/callback` | Setup agent | Error 400: redirect_uri_mismatch |
| ~14:50 | Sub-path of the registered redirect (`…/auth/callback/extra`) | Setup agent | **Error 400: redirect_uri_mismatch**: exact match. The registered URI worked within a minute despite the "hours" note. |
| 14:50:29 | `openid email` as the project owner (not a test user) | Setup agent | Account chooser "to continue to **composio.dev**"; consent "Sign in to **composio.dev**". **Continue was not clicked.** |
| 14:50:58 | + `gmail.readonly gmail.send` as the owner | Setup agent | **Blocked**: "Access blocked: composio.dev has not completed the Google verification process … can only be accessed by developer-approved testers." Error 403: access_denied |
| 14:51–14:52 | Audience → add the owner as a test user | Setup agent | The first Save didn't persist; the second did: "1 user (1 test, 0 other) / 100 user cap", "counted over the entire lifetime of the app" |
| 14:53:12 | Retry Gmail scopes as a test user | Setup agent | **"Google hasn’t verified this app"** warning with Back to safety / Continue. **Continue was not clicked.** |

Hands-on time for setup: about 6 min of agent work up to a working client. Verification wasn't attempted.

## Consent screens (what your users see)

- In Testing, Google names the **redirect domain, not your app**: "Choose an account to continue to composio.dev", "Sign in to composio.dev", "Access blocked: composio.dev has not completed…".
- Gmail scopes for a non-test user: blocked outright (403), even for the project owner.
- Gmail scopes for a test user: the unverified-app warning, then consent.

## What the console showed

- **Authorized domains**: `composio.dev` was added automatically from the redirect URI. Verification requires verifying every authorized domain in Search Console, which you can't do for composio.dev. A production Gmail app therefore needs a redirect on your own domain that forwards to Composio (the forwarder wasn't tested here).
- **Verification Center**: "Verification is not required since your app is configured with a Testing publishing status."
- **Audience**: "To publish your app, you must complete your configuration on the Branding page."
- **Branding**: uploading a logo triggers verification unless the app is internal or in Testing.

## Takeover points observed

1. **Sign-in** to Google (already done here).
2. **Agreeing to the Google API Services User Data Policy.**
3. **Copying the client secret**: shown only once.
4. **Clicking Continue** on the unverified-app warning and consent, as the end user.

## What changed in the Guide

The new Tested Claims t1–t8 are in `data/curated/gmail.json`:
- The redirect-domain blocker now rests on a Tested Claim (t7): composio.dev really lands in Authorized domains.
- New gotchas: add yourself as a test user (t5); Google shows "composio.dev" until the app is branded (t4).
- The project and branding step now estimates 5 min instead of 15; the client step estimates 2 min.
- The level stays **R4** (restricted scopes), with low confidence because business verification and minimum installs are still unknown.

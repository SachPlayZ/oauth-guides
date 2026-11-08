# OAuth Runway

Guides that tell a developer moving off Composio managed auth how long it takes to get their own OAuth app approved for production, and what is in the way.

## Parties and registrations

**Provider**:
The company that runs the OAuth server and the APIs (Google, Slack, Notion).
_Avoid_: app, service, platform

**Toolkit**:
A Composio integration for one product of a Provider (gmail, googledrive, slack). Several Toolkits can share one Provider.
_Avoid_: app, integration, connector

**OAuth app**:
The developer's own client registration with a Provider. It holds the client credentials, redirect URIs, scopes and consent-screen branding.
_Avoid_: app (bare), client, integration

**Managed auth**:
Composio owns the OAuth app, so the consent screen shows Composio.
_Avoid_: default auth, shared app

**Auth config**:
Composio's record of which OAuth app a Toolkit uses: managed, or the developer's own.

## Agents

**Research agent**:
OAuth Runway's own pipeline that investigates a Toolkit and writes its Guide.
_Avoid_: agent (bare), the AI

**Setup agent**:
A browser or coding agent the developer runs to carry out a Guide's steps for them (e.g. Claude in Chrome).
_Avoid_: agent (bare), assistant

**Step owner**:
Who carries out a Guide step: the Setup agent, the Setup agent drafting for you to confirm, or you.

**Takeover point**:
The moment a Setup agent must stop and hand over to the developer (login, 2FA, captcha, accepting terms, the final submit).
_Avoid_: handoff, blocker (a Blocker is a Provider obstacle, not an agent limit)

## Guides

**Guide**:
The answer for one Provider product (e.g. Gmail): a Verdict, Usage rows, steps and Claims. Includes a Composio section when a matching Toolkit exists.
_Avoid_: page, report, doc

**Guide version**:
One saved Guide from a single run or edit. Versions are only ever added. A **Reviewed** version has been checked by hand; an **Unreviewed** one comes straight from the pipeline.
_Avoid_: revision, draft (except the verification log's draft-v1)

**Usage row**:
One way of using a Toolkit (e.g. "Sign in only", "Read & send email"). Each has its own Runway level.
_Avoid_: usage tier, scope tier

**Runway level**:
How hard it is to get to Production for one Usage row, from R0 (instant) to R5 (gated). Derived from Requirements and Blocking limits, never stated directly.
_Avoid_: tier, difficulty tier, difficulty

**Verdict**:
The headline of a Guide: the Runway level of its default Usage row, plus hands-on effort, approval wait, Cost and Confidence.

**Default Usage row**:
The Usage row that needs the broadest scope among the Toolkit's most common actions.

**Cost**:
Money a Provider demands on the way to Production (paid plan, assessment fees). It is a separate axis and never raises the Runway level.
_Avoid_: paid tier (as a level)

**Confidence**:
How far the Verdict can be trusted (high, medium or low). It depends on the Evidence labels of the verdict-relevant Claims and on any unknown Gate answers.

## Gates

**Production**:
Users outside the developer's own org or workspace can authorize, at the volume the Usage row needs.
_Avoid_: live, launch, public

**Requirement**:
Something a Provider demands before a Usage row reaches Production (e.g. security assessment, partner application, app review).
_Avoid_: prerequisite, gate

**Pre-approval limit**:
A restriction that applies until the Provider approves the OAuth app (test-user caps, token expiry, reduced rate limits).
_Avoid_: dev-mode limit, sandbox limit

**Gate question**:
A fixed question each Usage row must answer yes, no or unknown (e.g. "Is a security assessment required?"), with a cited Claim. An unknown answer widens the Runway level into a range.

**Review artifact**:
Something a review asks you to submit (demo video, scope justification, security questionnaire). It adds hands-on effort, not level.

**Blocking limit**:
A Pre-approval limit severe enough to break a Usage row's own purpose. It counts as a Requirement.

**Production access review**:
A Provider review that must pass before any outside user can authorize.

**Scope verification**:
A Provider check required only for specific sensitive scopes.

**Listing review**:
A Provider review for a marketplace or directory listing. It is not needed for OAuth access unless a Blocking limit makes it so.
_Avoid_: app review (bare), publishing review

## Evidence

**Claim**:
One sourced fact in a Guide, with an Evidence label and a checked date.
_Avoid_: finding (a Finding is the raw research output a Claim is built from)

**Evidence label**:
How a Claim is backed: Tested, Documented, Reported or Unverified.
_Avoid_: confidence (Confidence belongs to the Verdict)

**Verdict-relevant Claim**:
A Claim cited by a Gate answer on the Default Usage row.

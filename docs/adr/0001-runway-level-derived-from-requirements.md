# Runway level is derived from Requirements, not picked by the LLM

The LLM never outputs a level or a gate. It records Requirements and Blocking limits for each Usage row, each one citing Claims. Code maps each Requirement to a level and takes the highest. This makes every level explainable ("R4 because security_assessment, claim c7") and comparable across Guides. The obvious alternative was letting the LLM pick a `gate` enum that maps one-to-one onto the level, but that is LLM judgment with a renamed field.

## Consequences

- Requirements live on Usage rows, not on the Guide.
- If a Requirement is missing, the level comes out too low. So each Usage row answers fixed Gate questions with yes, no or unknown, and each answer cites a Claim. An unknown above the derived level shows the level as a range (e.g. "R1–R4?") with low Confidence.
- Mapping (highest wins):
  - **R5:** partner_application, or manual approval with no guaranteed outcome
  - **R4:** security_assessment
  - **R3:** business, publisher, domain or scope verification
  - **R2:** production_access_review, min_installs, or any Blocking limit (including a required listing review)
  - **R1:** https_redirect, admin_consent, a test-user cap that isn't blocking, privacy policy, ToS, homepage
- Paid plans and fees are a separate Cost axis. Review artifacts add effort, not level.

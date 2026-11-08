---
status: superseded by ADR-0003
---

# Guides exist only for Composio Toolkits

Live generation only resolves to an existing Composio Toolkit. Any other query gets the answer "not a Composio toolkit." Every Guide is about moving off Composio managed auth, so it needs the Composio-specific parts (callback URL, Auth config, migration gotcha). Searching Composio also gives disambiguation without an LLM call. A generic "any OAuth provider" tool was considered and rejected: it would broaden the product beyond the moment it targets.

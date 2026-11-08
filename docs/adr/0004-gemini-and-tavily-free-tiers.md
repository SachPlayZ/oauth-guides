# Gemini (free tier) for the LLM, Tavily (free tier) for search

The project must run at $0, so the Research agent uses Gemini's free tier (`gemini-3.8-flash`, `gemini-3.5-flash-lite`) instead of Claude. Gemini's built-in Google Search grounding isn't free on any current model (free search exists only on Gemini 2.5 Flash, which redirects to 3.5 Flash-Lite on 2026-12-01). So search and page reading are client-side tools backed by Tavily's free plan (1,000 credits/month, no card), run by our own function-calling loop.

## Considered options

- **Claude with server-side web search/fetch:** best fit and no loop code, but paid.
- **Gemini paid tier with grounding:** 5,000 free searches/month, but it needs a card on file.
- **Gemini 2.5 Flash with free grounding:** breaks on 2026-12-01.

## Consequences

- All LLM calls go through `lib/llm.ts` and all web access through `lib/search.ts`, so the provider can be swapped back.
- We fetch page text ourselves, so the quote check uses exactly the text the agent read.
- Gemini free-tier content "may be used to improve Google products". Guides use public docs only; the README says so.
- The free limits (Gemini daily requests, Tavily credits) cap live generation at roughly 90 Guides a month. Budgets and the existing-Guide cache protect the demo.

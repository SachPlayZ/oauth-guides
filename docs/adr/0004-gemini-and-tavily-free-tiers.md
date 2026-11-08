# Gemini (paid tier, billing on) for the LLM, Tavily (free tier) for search

The Research agent uses Gemini Flash models instead of Claude to keep cost near $0. Search and page reading are our own tools backed by Tavily's free plan (1,000 credits/month, no card), run by our function-calling loop. Gemini's built-in Google Search grounding isn't free on current models, and with our own tools we read the same page text the quote check uses.

We started on Gemini's free tier and had to drop it. Live tests on 2026-11-09 hit a quota of **20 requests per day per model** (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`), and one Guide needs about 15–25 calls. `gemini-3.8-flash` also timed out or returned 503 on most calls. So billing is enabled on the Gemini project: Flash costs cents per Guide, the limits are far higher, and paid-tier content is not used to improve Google products.

## Considered options

- **Claude with server-side web search/fetch:** best fit and no loop code, but higher cost per Guide.
- **Gemini free tier:** 20 requests/day/model. One Guide per model per day is too little for a live demo.
- **Claude Haiku 5.5 with Tavily:** a few dollars in total. A good fallback, and `lib/llm.ts` is the only file that would change.

## Consequences

- All LLM calls go through `lib/llm.ts` (a fallback chain of models, a 30s per-call timeout, models over daily quota skipped) and all web access through `lib/search.ts`.
- Set a budget alert on the Google Cloud project.
- Tavily's 1,000 free credits/month cap live generation at about 90 Guides a month. Budgets and the existing-Guide cache protect the demo.

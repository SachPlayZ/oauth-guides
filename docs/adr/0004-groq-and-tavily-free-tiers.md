# Groq (free tier) for the LLM, Tavily (free tier) for search

The Research agent runs on open-weight models served by Groq's free tier instead of Claude, so a live Guide costs $0. Search and page reading are our own tools backed by Tavily's free plan (1,000 credits/month, no card), driven by our own function-calling loop. With our own tools we read the same page text the quote check uses.

We tried Gemini first. Its free tier allowed **20 requests per day per model** (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`, seen live on 2026-11-09), and one Guide needs about 15–25 calls. Enabling billing didn't lift the quota in time.

Groq's limits, read from response headers on 2026-11-09: 1,000 requests/day and **8,000 tokens/minute per model**. Tokens per minute is the constraint, so every request stays under ~6.5K tokens: tool output is truncated, old tool results are trimmed as the loop grows, and a 429 moves to the next model in the chain (`gpt-oss-120b` → `qwen3.8-27b` → `gpt-oss-20b`). `qwen3.8-27b` rejected a tool call in testing, so it sits mid-chain where a 400 just moves on.

## Considered options

- **Claude with server-side web search/fetch:** best fit and no loop code, but costs money per Guide.
- **Gemini free tier:** 20 requests/day/model; too little for a live demo.
- **Gemini paid:** cents per Guide, but billing setup stalled.

## Consequences

- All LLM calls go through `lib/llm.ts` (OpenAI-compatible `provider:model` chains, 30s per-call timeout, token-budget trimming) and all web access through `lib/search.ts`. Switching to another OpenAI-compatible provider is a config change.
- Prompts must stay compact; pages are cut to focused excerpts.
- The Research agent is **gather, then extract**, not a free tool loop. A loop resends the whole conversation each turn; on 8K tokens/min that was ~4 turns/min and a Slack run stalled at 3 findings in 50s. Code does the searching and reading; 4 parallel LLM calls do the extraction. Slack now takes ~10s and 4 calls. We lose the model choosing follow-up searches.
- `lib/llm.ts` reads `x-ratelimit-remaining-tokens` / `x-ratelimit-reset-tokens` and sends each call to a model with headroom, so parallel calls spread across the chain.
- Tavily's 1,000 free credits/month cap live generation at about 140 Guides a month. Budgets and the existing-Guide cache protect the demo.

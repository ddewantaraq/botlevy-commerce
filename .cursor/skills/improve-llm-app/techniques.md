# Staircase of techniques (simple → complex)

Distilled from [How to improve your LLM-powered app](https://www.aihero.dev/how-to-improve-your-llm-powered-app). Start at the top; go down only when needed.

| # | Technique | Use when | Core idea |
|---|-----------|----------|-----------|
| 1 | First prompt | Starting or unclear instructions | Clear, direct, specific; LLM has no ambient norms |
| 2 | Role-based prompting | Need consistent tone/persona | System prompt persona |
| 3 | XML tags | Multi-part inputs or multi-part outputs | Delimit sections; request tagged output blocks |
| 4 | Constrain response format | Need labels, short answers, fixed shape | Explicit format rules in the prompt |
| 5 | Structured outputs | Need typed JSON / schema | Provider JSON schema / `generateObject`-style APIs |
| 6 | Reasoning (CoT) | Multi-step logic, analysis | Basic → guided → structured CoT (trades latency) |
| 7 | Multishot prompting | Pattern/style not sticking | Few input→output examples (vs zero-shot) |
| 8 | Temperature | Too dull or too random | Low for facts/code; higher for creative; start conservative |
| 9 | Tool calling | Need external actions/data | Model proposes calls; system executes |
| 10 | LLM call chaining | One call does too much | Specialized sequential prompts; output feeds next |
| 11 | RAG | Hallucinations / missing facts | Retrieve real docs/data into context (adds complexity) |
| 12 | Chunking | Retrieved corpus too large | Split + retrieve (BM25, embeddings, hybrid, rerank) |
| 13 | Agentic loops | Open-ended path; fixed chains too rigid | Agent plans/acts/stops from feedback (higher latency) |
| 14 | Parallel LLM calls | Independent subtasks | Concurrent calls when no sequential dependency |
| 15 | Evaluator-optimizer | Quality needs iterative critique | Generator + evaluator loop with clear criteria |
| 16 | LLM routers | Different query types need different handlers | Classify then dispatch to specialized paths |
| 17 | Fine-tuning | Simpler techniques plateau | Train on high-quality task data (cost + lock-in risk) |
| 18 | Next big thing filter | New hype arrives | Adopt only if it simplifies or clearly wins on *your* evals |

## Decision hints

- **Wrong shape / parse errors** → #4–5 before #10–13.
- **Tone or domain voice wrong** → #2, then #7.
- **Mixed inputs (docs + query)** → #3.
- **Needs live or private facts** → try better prompts/tools first; #11 only when grounded data is the real gap.
- **Slow but sequential independent work** → #14.
- **Unbounded multi-step goals** → #13 only after chaining (#10) fails.
- **Fine-tune (#17)** last: working system + real failure data required.

## Anti-pattern

Skipping to RAG, agents, or fine-tuning because they are trendy. New techniques must beat your eval baseline.

# LLM evals & observability

Aligns with the project Cursor skill [`.cursor/skills/improve-llm-app/`](../.cursor/skills/improve-llm-app/) (AI Hero: baseline → change → re-eval).

## Observability (runtime I/O)

| Knob | Where | Effect |
|------|--------|--------|
| `LLM_TRACE=1` | backend `.env` | `[llm_trace]` JSON lines (system/user/raw, truncated); `steps[].llm` on runs; `obs: { llmCalls, parseFails }` on agent responses |
| `VITE_AGENT_DEBUG=true` | cooker-ui env | Expand **Agent steps** with args / result / llm.user / llm.raw |

Inspect a run:

```bash
curl -sS "$VITE_API_URL/agent/runs/<runId>" | jq '.run.steps[] | {tool, error, llm}'
```

`parseOk: false` on a step means Zod/JSON parse failed after the model replied.

## Evals (accuracy baseline)

```bash
cd backend && npm run eval:llm
```

Prints `passed N/M (xx%)`. Use that % before/after prompt changes (skill report template).

Fixtures: [`backend/evals/`](../backend/evals/). Smokes (`npm run smoke:orchestrator`) stay for dish-flow UX—not a substitute for golden LLM cases.

## Flywheel (trace → fixture)

1. Fail in the cooker (or see `parseOk: false`).
2. With `LLM_TRACE=1`, copy user + expected behavior into `backend/evals/fixtures/*.json`.
3. Fix the simplest staircase step (prompt / examples / schema)—not RAG/fine-tune first.
4. Re-run `eval:llm`; report the delta.

## Related

- Skill: improve-llm-app  
- Rule: `.cursor/rules/improve-llm-app.mdc`

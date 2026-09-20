# LLM evals

Golden fixtures for classify / pantry / recipe-schema. Complements behavioral smokes under `scripts/smoke-*.ts`.

## Run

```bash
cd backend
npm run eval:llm
```

Without `OLLAMA_API_KEY`, **rules** classify + pantry heuristics still run; `mode: llm` and `recipe-schema` cases are **SKIPPED** (not failures).

With a key, live LLM cases run and count toward the pass %.

## Add a case from a live failure

1. Set `LLM_TRACE=1` on the API and reproduce the bad turn.
2. Copy `[llm_trace]` / `steps[].llm` user + raw from logs or `GET /agent/runs/:id`.
3. Add a fixture under `fixtures/` with a clear `id` and expected outcome.
4. Re-run `npm run eval:llm` until it passes (or document a known fail as the baseline).

## Suites

| File | What |
|------|------|
| `classify.json` | `expectedIntent` via rules or LLM |
| `pantry.json` | `expectTagsInclude` after `runPantryAgent` |
| `recipe-schema.json` | `toolPlanRecipe` must return valid dish/steps/ingredients |

See also [`docs/LLM-EVALS-OBS.md`](../../docs/LLM-EVALS-OBS.md).

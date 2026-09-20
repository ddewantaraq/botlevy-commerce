---
name: improve-llm-app
description: >-
  Evaluates and improves LLM-powered apps using the AI Hero evals flywheel and
  Staircase of Complexity Hell (simple techniques before expensive ones). Use when
  the user asks to evaluate, improve, or iterate on prompts, models, agents, RAG,
  tools, structured outputs, or LLM quality—or mentions AI Hero / staircase / evals.
---

# Improve LLM-powered apps (AI Hero)

Generic methodology from [AI Hero](https://www.aihero.dev/how-to-improve-your-llm-powered-app) and [evals](https://www.aihero.dev/what-are-evals). Discover the target project's prompts, models, and tests yourself—do not assume a fixed file layout.

## Mindset

- LLM systems are probabilistic; treat changes as experiments.
- Prefer the **simplest** technique that could fix the failure. Climb the staircase only when simpler options are exhausted.
- No claimed improvement without a measurable baseline and a re-eval.

## Workflow

Copy and track:

```
Progress:
- [ ] 1. Success criteria (measurable)
- [ ] 2. Baseline evals (or note gaps and add minimal ones)
- [ ] 3. Failure mode (what breaks, on which inputs)
- [ ] 4. Choose staircase technique (lowest unused step that fits)
- [ ] 5. Apply change in the project
- [ ] 6. Re-run evals; report delta
```

### 1. Success criteria

Make criteria specific and measurable (not “better answers”). Examples of shape: pass rate on a fixture set, Zod/schema validity %, judge score ≥ threshold, latency/cost budgets. See [evals.md](evals.md).

### 2. Baseline evals

- Find existing tests, smokes, golden fixtures, or scorers in the repo.
- If missing, add the **smallest** deterministic checks first; document gaps (human / LLM-as-judge later).
- Record a baseline score or pass/fail set before changing prompts or architecture.

### 3. Failure mode

Classify the bug (wrong format, weak persona, missing context, bad tool use, rigid chain, hallucination needing retrieval, etc.). Match it to a staircase step in [techniques.md](techniques.md).

### 4. Choose technique

Work **top → bottom** on the staircase. Refuse jumping to RAG, agentic loops, or fine-tuning when prompt/format/examples/temperature/tools would suffice. Justify why simpler steps were insufficient.

### 5. Apply

Change only what the chosen technique requires. Prefer local prompt/schema/tool fixes over new infrastructure.

### 6. Re-eval

Re-run the same evals. Prefer adding a fixture for any new production failure (data flywheel). Do not claim a win without numbers or clear pass/fail deltas.

## Output template

Use this structure when reporting:

```markdown
## LLM improvement report

**Success criteria:** …
**Baseline:** … (how measured)
**Failure mode:** …
**Technique chosen:** #N — Name
**Why not simpler:** …
**Changes:** … (paths discovered in this repo)
**Re-eval:** … (command / suite + result)
**Deferred:** … (higher staircase steps not used yet)
```

## Additional resources

- Technique list: [techniques.md](techniques.md)
- Eval types and flywheel: [evals.md](evals.md)
- Attribution and links: [SOURCE.md](SOURCE.md)

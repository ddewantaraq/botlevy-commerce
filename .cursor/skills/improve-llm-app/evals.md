# Evals for LLM apps

Distilled from [Your app is only as good as its evals](https://www.aihero.dev/what-are-evals).

## Why evals

Traditional unit tests assume deterministic I/O. LLM apps are probabilistic: small prompt or model changes can shift all outputs. Manual “favorite prompts feel better” QA is not enough for production iteration.

**Evals** give a score or pass set so you can tell if a change made the system better or worse.

## Three types

### 1. Deterministic evals

Assertions on outputs (length, required fields, schema validity, allowed labels, status codes). Cheap; cover only part of quality.

### 2. Human evaluation

Early-stage or subjective quality. Expensive; still needed to seed judgment and catch judge blind spots.

### 3. LLM-as-a-judge

Another model scores factuality, style, fidelity, etc. Powerful and costly—do not run a full judge suite on every keystroke. Split: small suite locally; larger suite on a schedule (e.g. daily).

## Anatomy of an eval

1. **Data** — representative prompts / cases (including edge cases).
2. **Task** — run the system under test.
3. **Scorers** — deterministic and/or judge functions → aggregate score.
4. **Result** — compare to baseline after each change.

## Data flywheel

1. User hits a bad case (optional: thumbs down / comment).
2. Promote that case into the eval dataset.
3. Improve the system until the eval passes.
4. Redeploy; repeat.

Best eval data comes from real usage. Observability and light feedback (e.g. up/down) feed the loop.

## Cadence

| Suite | When |
|-------|------|
| Fast deterministic | Every meaningful LLM change / local loop |
| Broader + judges | Scheduled or pre-release |
| New fixtures | After each notable production miss |

## Tooling (optional)

Many runners exist (e.g. Braintrust, Evalite). Prefer whatever the repo already uses. If greenfield, pick a lightweight local runner you will actually run often—evals unused are worthless.

## Checklist before “improving” the system

- [ ] Measurable success criteria exist
- [ ] Baseline recorded
- [ ] Dataset covers the failure class you care about
- [ ] After the change, the same suite is re-run and reported

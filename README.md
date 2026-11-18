# CONCORD — Concurrent Systems Verification Lab

[![CI](https://github.com/banerjeeankita1907-hub/CONCORD/actions/workflows/ci.yml/badge.svg)](https://github.com/banerjeeankita1907-hub/CONCORD/actions/workflows/ci.yml)

**CONCORD** is a research-engineering prototype for bounded verification of concurrent histories and asynchronous replicated objects. It combines a reference explicit-state search, sleep-set partial-order reduction (POR), a linearizability checker, and a finite network-schedule model.

The goal is to make concurrency claims falsifiable: define the state machine and correctness condition, explore adversarial schedules, and retain a replayable counterexample when an invariant fails.

> **Research status.** CONCORD currently integrates and tests established ideas; it does not claim a new model-checking algorithm, a new consistency model, or a published theorem. It is a bounded experimental platform and a starting point for a deeper research project—not a production verifier or a substitute for proof.

## What is implemented

| Component | Capability |
|---|---|
| Explicit-state engine | Canonical state hashing, BFS, shortest safety counterexamples, state/depth bounds, explicit inconclusive results |
| Sleep-set POR | Reduces interleavings under a caller-supplied independence relation; checks local symmetry and the commutativity diamond, with an exhaustive bounded independence-audit module |
| Linearizability checker | Searches sequential witnesses consistent with real-time precedence and an executable sequential specification |
| Asynchronous register model | Multiple replicas, local write programs, unordered message delivery, bounded duplicates and optional permanent message drops |
| Escrow counter model | Rights-conserving transfers, bounded increments, global invariant checks, and a naive-quota negative control |
| Negative controls | An arrival-order-wins register, permanent message loss, and stale-read histories as negative controls |
| Reproducible experiments | Baseline vs reduced exploration, 120 seeded generated models, and valid/invalid object histories, with machine-readable JSON output |

## Quick start

Requires Node.js 22 or 24. There are no third-party runtime dependencies.

    npm ci
    npm run check
    npm test
    npm run experiment
    npm run verify:examples

The experiment command prints a JSON report with the parameters and outcomes. CI runs the suite on both supported Node versions.

## Example: verify an asynchronous replicated register

    import { explore } from "./src/engine.js";
    import { createReplicatedRegisterModel } from "./src/replicated-register.js";

    const model = createReplicatedRegisterModel({
      replicas: [
        { id: "east", writes: ["red"] },
        { id: "west", writes: ["blue"] }
      ],
      merge: "lww",
      maxDuplicates: 1
    });

    const result = explore(model, { maxStates: 20_000 });
    console.log(result.status, result.counterexample);

Change the merge policy to "arrival" to activate the deliberately incorrect negative control. Set maxDrops to a positive value to explore permanent message loss; this is a different fault model and can also violate convergence when there is no anti-entropy repair.

## Escrow counter case study

The escrow model partitions a global increment capacity into replica-local
rights. An increment consumes one local right. A transfer first removes rights
from the sender and places them in the in-flight network; delivery moves those
rights to the recipient. The invariant checks:

    committed increments + local rights + in-flight rights = global capacity

A deliberately naive model lets every replica spend up to the global capacity
independently. With two replicas and a capacity of one, the checker should find
a two-step execution that exceeds the bound. This is a finite model of escrow
rights, not a production distributed counter.

## Verification model

CONCORD explores finite labelled transition systems. A state is JSON-compatible data; enabled(state) returns uniquely identified transitions; step(state, transition) computes a successor; and invariant(state) states the safety condition. Breadth-first search returns a shortest counterexample in number of transitions when one is found before a configured bound.

POR uses a sleep-set DFS. A user-supplied independence relation must be symmetric, persistent, and preserve enabledness and the diamond property. The separate independence-audit module exhaustively checks symmetry, mutual enabledness, and commuting diamonds over every reachable state in a fully explored finite graph. A complete audit is a bounded certificate for the encoded graph, not an unbounded proof or a guarantee that the model captures a deployed implementation. See [the semantics and soundness obligations](docs/semantics.md).

The linearizability checker accepts completed operations with invocation/response timestamps, an executable sequential specification, and observed results. It searches for a legal sequential witness while preserving non-overlapping real-time order.

## Reproducibility and experimental design

- All examples are finite and deterministic.
- State and search bounds are explicit; exceeding a bound returns **inconclusive**, never **safe**.
- The invalid merge, permanent message loss, naive local quota, and stale-read histories are negative controls.
- The exhaustive BFS engine is the reference oracle for small-model differential checks.
- A seeded corpus of 120 generated bounded concurrent counter models is checked across BFS, sleep-set POR, and the exhaustive independence audit; counterexample traces are replayed.
- CI executes unit tests and the reference experiment runner on Node.js 22 and 24.

The independent-action experiment now uses eight concurrently enabled actions, rather than a tiny two- or three-action illustration. Its primary reduction metric is the number of transition extensions avoided; unique states alone are not treated as evidence of reduction.

See:
- [Formal semantics and reduction obligations](docs/semantics.md)
- [Research questions and experiment design](docs/research-agenda.md)
- [Related systems and scope comparison](docs/related-work.md)
- [Threats to validity and limitations](docs/limitations.md)

## Research directions

A credible next phase would require (1) a formal proof or machine-checked refinement argument for the reduction implementation, (2) broader models covering crashes, partitions, retries, and fairness, (3) independent differential validation against established tools, and (4) a benchmark corpus with reproducible comparisons. Any claim of novelty must follow a literature review and expert scrutiny.

## License

MIT.

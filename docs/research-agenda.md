# Research agenda and experimental design

## Research question

**RQ:** How much can sleep-set partial-order reduction shrink bounded
concurrency exploration while preserving the safety-violation reachability
reported by an exhaustive reference search, and what distributed-object
counterexamples become visible when network schedules are explored explicitly?

This is an engineering research question, not a claim that the underlying POR
or linearizability theory is new.

## Hypotheses

- **H1 — differential agreement:** For models whose declared independence
  relation satisfies the required global conditions, sleep-set POR and
  exhaustive BFS agree on whether a safety violation is reachable within the
  common bound.
- **H2 — schedule reduction:** For transition systems containing independent
  actions, the sleep-set engine explores fewer action extensions than
  exhaustive schedule enumeration.
- **H3 — semantic sensitivity:** The replicated-register model distinguishes
  deterministic timestamp-based merge from a policy that blindly accepts the
  most recently delivered message.
- **H4 — duplicate tolerance:** The LWW register remains convergent under the
  bounded duplicate-delivery model because applying the same timestamped value
  more than once does not change the selected maximum.

These hypotheses are limited to tested finite models and parameters.

## Experimental protocol

1. Define a transition system and an invariant before running either engine.
2. Run exhaustive BFS with a fixed state/depth limit.
3. Run sleep-set POR with the same depth limit and a declared independence
   predicate.
4. Compare safety status and retain both counterexample traces when a bug is
   found. For claimed independent pairs, the POR engine checks symmetry and a
   local commuting diamond at runtime.
5. Run the replicated-register case study under LWW and arrival-order merge,
   with unordered message delivery and an optional bounded duplicate.
6. Run valid and invalid finite histories through the sequential-spec checker.
7. Run all tests and experiments in CI on Node.js 22 and 24.

## Measurements

The experiment runner records:
- unique states expanded by the BFS reference engine;
- state/sleep configurations visited by POR;
- transition extensions and sleep-set prunings;
- safety outcomes and counterexample depth;
- linearizability search nodes and witness order.

Elapsed wall-clock times are diagnostic only and are not treated as robust
performance evidence in this prototype. A publishable comparison would need
warmups, repeated trials, medians and dispersion, pinned hardware, larger
benchmarks, and competitor tools running on comparable workloads.

## Falsification criteria

- H1 is refuted by any finite model for which the reduction and exhaustive
  engine disagree on bounded safety reachability while the independence
  assumptions are satisfied.
- H2 is refuted if the chosen independent-action benchmark does not reduce
  explored extensions.
- H3 is refuted if the two merge policies do not separate on the specified
  multi-writer schedules.
- H4 is refuted if a duplicate-delivery execution makes an LWW quiescent
  state non-convergent.

A discovered disagreement is a correctness bug to investigate, not a result
to hide or explain away.

## Proposed next experiments

- Differential fuzzing over generated deterministic finite-state systems.
- Models with process crashes/restarts, message retransmission, partitions,
  and a selectable fairness assumption.
- Queue, compare-and-swap register, escrow counter, and replicated set
  specifications.
- Cross-validation of histories against Porcupine and protocol specifications
  against TLC/Apalache where their respective input languages apply.
- Experiments separating the contribution of state hashing, POR, and symmetry
  reduction rather than reporting one combined speedup.

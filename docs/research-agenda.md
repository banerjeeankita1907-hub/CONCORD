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
- **H5 — delivery assumption:** Allowing a permanent message drop can create a
  quiescent non-convergent state in the one-shot multicast model.
- **H6 — escrow conservation:** A rights-conserving transfer protocol preserves
  the bounded-counter invariant in the finite model, while naive replicated
  local quotas can violate the global bound.

These hypotheses are limited to tested finite models and parameters.

## Experimental protocol

1. Define a transition system and an invariant before running either engine.
2. Run exhaustive BFS with a fixed state/depth limit.
3. Run sleep-set POR with the same depth limit and a declared independence
   predicate.
4. Audit the claimed independence relation over the complete reachable finite
   state graph. Compare safety status and retain counterexample traces when a
   bug is found. The POR engine also checks symmetry and local diamonds online.
5. Run the replicated-register case study under LWW and arrival-order merge,
   with unordered delivery, bounded duplicates, and an optional drop fault.
6. Verify the escrow counter under all transfer/delivery orders; compare it
   with the naive local-quota negative control.
7. Run a deterministic, seeded corpus of 120 generated bounded counter
   systems through BFS, POR, and the independence audit; replay BFS witnesses.
8. Check that the escrow TLA+ invariant holds initially and is inductive under
   every transition with Apalache 0.63.0; also run a four-step bounded check.
9. Run valid and invalid finite histories through the sequential-spec checker.
10. Run all tests and experiments in CI on Node.js 22 and 24.

## Measurements

The experiment runner records:
- unique states expanded by the BFS reference engine;
- state/sleep configurations visited by POR;
- transition extensions removed and sleep-set prunings;
- number of reachable states covered by the bounded independence audit;
- seeded model corpus size and BFS/POR outcome agreement;
- safety outcomes and counterexample depth;
- linearizability search nodes and witness order.

The independent TLA+ run checks the manually encoded two-replica escrow case.
Its inductiveness result proves the invariant for that exact TLA+ state machine,
but is not a refinement proof for the JavaScript model.

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
- H5 is refuted if no permitted message-drop schedule produces a quiescent
  non-convergent state for the specified multi-writer workload.
- H6 is refuted by any reachable escrow-model state that violates rights
  conservation or the global counter bound.

A discovered disagreement is a correctness bug to investigate, not a result
to hide or explain away.

## Proposed next experiments

- Differential fuzzing over generated deterministic finite-state systems.
- Models with process crashes/restarts, message retransmission, partitions,
  and a selectable fairness assumption.
- Queue, compare-and-swap register, partition-repair protocol, and replicated
  set specifications.
- Cross-validation of histories against Porcupine and protocol specifications
  against TLC/Apalache where their respective input languages apply; strengthen
  the JavaScript/TLA+ relationship with generated trace correspondence tests.
- Experiments separating the contribution of state hashing, POR, and symmetry
  reduction rather than reporting one combined speedup.

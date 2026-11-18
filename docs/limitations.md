# Limitations and threats to validity

## Algorithmic limitations

- Sleep-set reduction is not optimal DPOR. The independence relation is
  supplied by the model author; runtime diamond checks do not establish global
  persistence.
- BFS is explicit-state and can grow exponentially. A bound exhaustion is
  reported as inconclusive.
- POR is depth-bounded DFS. Its first counterexample is not promised to be
  shortest.
- The linearizability checker accepts completed operations only and supports
  at most 63 operations in one history. It is a transparent backtracking
  implementation, not an optimized Porcupine replacement.

## Model limitations

- Models use deterministic transitions over JSON-compatible data.
- The replicated-register model has finite predetermined local writes.
- The network is an unordered bag with arbitrary delivery order, bounded
  duplicate delivery, and an optional bounded permanent-drop fault. It does not
  model transient partitions, retransmission/anti-entropy repair, Byzantine
  behavior, process crashes, durable recovery, reconfiguration, or unbounded
  retries.
- The LWW register is a simplified abstract object. It does not model a real
  database API, clock drift, hybrid clocks, transactional multi-key updates,
  or user-visible conflict-resolution policy.
- The escrow counter uses a fixed set of replicas and finite predeclared
  programs. It does not model replica membership changes, revocation, lease
  expiry, Byzantine participants, or recovery of rights after permanent loss.
- The checker validates only the model supplied to it. It does not establish
  that the model accurately represents a deployed implementation.

## Experimental limitations

- Current examples are small demonstration models, not a broad benchmark
  suite.
- Runtime counts depend on the chosen state encoding and transition identity.
- Wall-clock timings are not publication-grade measurements.
- There is no head-to-head quantitative comparison with TLC, Apalache,
  Porcupine, or Jepsen yet.

## Research integrity

A passing CI run establishes that the checked-in tests and experiments
completed under the tested runtime versions. It is not evidence of a
field-changing result, correctness for unbounded systems, or a peer-reviewed
research contribution. A future paper should publish all models, scripts,
parameter files, generated counterexamples, and raw measurements.

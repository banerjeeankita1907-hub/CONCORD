# Related work and positioning

CONCORD is a small educational/research-engineering prototype. The following
systems and papers are substantially more mature and should be treated as
references or comparison targets, not as competitors that this repository has
already surpassed.

## Linearizability

Herlihy and Wing introduced linearizability as a correctness condition for
concurrent objects: a concurrent history must correspond to a legal
sequential history that preserves real-time precedence.

- Maurice Herlihy and Jeannette Wing. “Linearizability: A Correctness
  Condition for Concurrent Objects.” ACM Transactions on Programming
  Languages and Systems, 12(3), 1990.
  [DOI: 10.1145/78969.78972](https://doi.org/10.1145/78969.78972)

CONCORD implements a small completed-history checker against an executable
sequential specification. It does not implement the full family of
optimizations in specialist checkers.

## Partial-order reduction

Dynamic partial-order reduction (DPOR) explores fewer interleavings by
identifying executions that differ only in the order of independent actions.
Source sets and wakeup trees are examples of later work that improve the
optimality and efficiency of DPOR.

- Cormac Flanagan and Patrice Godefroid. “Dynamic Partial-Order Reduction
  for Model Checking Software.” POPL, 2005.
- “Source Sets.” Proceedings of the ACM on Programming Languages, 2017.
  [DOI: 10.1145/3073408](https://doi.org/10.1145/3073408)

CONCORD uses a transparent sleep-set DFS with explicit user-supplied
independence and local runtime diamond checks. It is not an optimal-DPOR
implementation.

## Symbolic model checking

Apalache is a symbolic model checker for TLA+ and Quint. It translates bounded
execution questions to SMT constraints and also supports inductiveness
checking for supported specifications.

- [Apalache documentation](https://apalache-mc.org/)
- [Apalache repository](https://github.com/apalache-mc/apalache)

CONCORD instead explores concrete JSON states. It has a smaller, simpler input
model and does not offer symbolic constraints or unbounded inductiveness
proofs.

## Distributed systems testing

Jepsen is a framework for testing real distributed systems under injected
faults and checking histories against consistency models. Porcupine is a fast
linearizability checker that accepts an executable model and a concurrent
history.

- [Jepsen](https://github.com/jepsen-io/jepsen)
- [Porcupine](https://github.com/anishathalye/porcupine)

CONCORD currently explores abstract finite transition systems; it does not
deploy real databases, inject operating-system/network faults, or compete with
Porcupine's optimized history-checking implementation.

## What would establish a contribution?

A serious research contribution would need a sharply scoped new question,
a rigorous comparison with the closest methods above, a soundness argument,
public benchmark corpus, independently reproducible experiments, and
evidence that the technique improves a meaningful capability or cost.
Integration of established concepts alone is not novelty.

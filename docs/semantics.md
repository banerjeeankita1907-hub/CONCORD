# Operational semantics and soundness obligations

## 1. Transition systems

A CONCORD model is a finite or finitely bounded labelled transition system
\[
\mathcal{M}=(S,A,\longrightarrow,s_0,Inv)
\]
where S is the state space, A is a set of labelled actions, s0 is the initial
state, s --a--> s' is the deterministic successor relation, and Inv is a
safety predicate.

The implementation encodes states as JSON-compatible values. Canonical JSON
serialization sorts object keys and is used as a state identity. Arrays retain
their order. The model author is responsible for choosing a representation
whose equality matches semantic state equality.

The breadth-first engine visits each canonical state once. With a finite bound
and complete queue exhaustion, it proves that no reachable state in the
explored model violates Inv. A counterexample found by BFS has minimum
transition length. If a state or depth bound cuts off exploration, the result
is inconclusive.

## 2. Sleep-set partial-order reduction

Two actions a,b are independent at state s only when all of the following hold:

1. both are enabled at s;
2. executing either does not disable the other;
3. both execution orders are defined; and
4. the diamond commutes: a(b(s)) = b(a(s)).

For sound trace reduction, independence must also be symmetric and persistent:
the relation must continue to hold in the states reached while commuting the
actions. Sleep-set reduction explores representatives of equivalent action
orders under this relation, rather than every permutation.

CONCORD's POR implementation checks symmetry and the local diamond whenever
it uses a claimed independent pair. The separate independence-audit module
can exhaustively enumerate a finite reachable graph and check every enabled
pair declared independent for symmetry, mutual enabledness, and a commuting
diamond. A complete audit is a bounded certificate over that exact encoded
graph; it is not an unbounded proof and it does not establish that the model
faithfully represents a deployed system. If the audit reaches a state/depth
bound, it returns inconclusive. The model author must still define a
conservative relation and accurate transition semantics. The exhaustive BFS
engine is retained as a reference implementation for small-system
differential checks.

The sleep-set engine is depth-bounded DFS, not optimal DPOR. It does not claim
optimality or a minimum-length counterexample.

## 3. Linearizability

A completed operation o_i has an invocation time inv_i, completion time
ret_i, operation and arguments, and observed result. The real-time precedence
relation is:

    o_i <_H o_j  iff  ret_i < inv_j.

The checker searches for a total order that extends this relation. Executing
that order against the supplied sequential specification must produce each
operation's observed result. This is a finite-history decision procedure for
the provided specification; it does not infer the sequential specification
or prove that the implementation under test is correct for all histories.

Only completed operations are supported in this version. Pending invocations
and completion of crashed operations are outside the current model.

## 4. Replicated-register semantics

Each replica has a local value, a Lamport clock, and a write program. A local
write increments its local clock, updates its local value, and multicasts a
message to every other replica. Messages live in an unordered bag and can be
delivered in any order. The optional duplicate transition adds at most one
extra copy per message, subject to a global duplicate bound. A separate
permanent-drop transition can remove a bounded number of messages without
delivery. By default the drop budget is zero, which models reliable eventual
delivery for this finite experiment. A positive drop budget deliberately
weakens that assumption and can expose non-convergence because the model has
no anti-entropy or retransmission repair.

The lww policy compares timestamps lexicographically by (clock, writerId)
and applies the larger timestamp. This is a deterministic total order for the
finite writer identifiers in a model. The arrival policy deliberately
overwrites state on every delivery and is a negative control.

The convergence invariant is checked at completed executions: all local
write programs have finished, the network bag is empty, and replicas must
hold equal values. With the default zero drop budget, every message must be
delivered. With a positive drop budget, the explorer includes permanent loss
as an adversarial event and may find a non-convergent quiescent state. It is
not a proof of liveness; it checks a bounded safety condition at quiescent
states.

## 5. Escrow counter semantics

The escrow model has a fixed capacity C, local committed values v_i, local
rights r_i, and in-flight transfer messages m_j. The conservation invariant is

    sum(v_i) + sum(r_i) + sum(amount(m_j)) = C

A local increment consumes one right and adds one to the committed value.
A transfer consumes rights at the sender before a message is created; message
delivery adds those rights at the receiver. Thus, the sender and receiver
cannot spend the same right simultaneously. The model checks the global bound
sum(v_i) <= C and detects a deadlocked unfinished finite program.

The naive negative control grants each replica its own local increment limit
equal to the global capacity. This is not escrow: it can over-allocate the
global resource when two replicas increment concurrently. The checker returns
a shortest BFS counterexample for the two-replica capacity-one example.

## 6. Bounds and interpretation

All numeric bounds and finite write programs are part of the model. An
exhaustive result is therefore conditional on those parameters and the
transition semantics. It is not an unbounded theorem about all replica counts,
all values, arbitrary executions, or a deployed implementation.

A counterexample is a witness against the encoded model. To transfer it to a
real system, model events, message semantics, timestamps, retries, failures,
and observable outcomes must match the implementation closely enough.

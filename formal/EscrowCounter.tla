---------------- MODULE EscrowCounter ----------------
EXTENDS Naturals

\* A finite two-replica instance of CONCORD's escrow counter.
\* One right is transferred from r0 to r1; each replica may increment once.
Capacity == 2
TransferAmount == 1

VARIABLES
  \* @type: Int;
  value0,
  \* @type: Int;
  value1,
  \* @type: Int;
  rights0,
  \* @type: Int;
  rights1,
  \* @type: Int;
  inFlight,
  \* @type: Int;
  pc0,
  \* @type: Int;
  pc1
TypeOK ==
  /\ value0 \in 0..Capacity
  /\ value1 \in 0..Capacity
  /\ rights0 \in 0..Capacity
  /\ rights1 \in 0..Capacity
  /\ inFlight \in 0..TransferAmount
  /\ pc0 \in 0..2
  /\ pc1 \in 0..1

Init ==
  /\ value0 = 0
  /\ value1 = 0
  /\ rights0 = Capacity
  /\ rights1 = 0
  /\ inFlight = 0
  /\ pc0 = 0
  /\ pc1 = 0

Transfer ==
  /\ pc0 = 0
  /\ inFlight = 0
  /\ rights0 >= TransferAmount
  /\ rights0' = rights0 - TransferAmount
  /\ inFlight' = inFlight + TransferAmount
  /\ pc0' = 1
  /\ UNCHANGED <<value0, value1, rights1, pc1>>

Deliver ==
  /\ inFlight = TransferAmount
  /\ rights1' = rights1 + inFlight
  /\ inFlight' = 0
  /\ UNCHANGED <<value0, value1, rights0, pc0, pc1>>

Increment0 ==
  /\ pc0 = 1
  /\ rights0 >= 1
  /\ value0' = value0 + 1
  /\ rights0' = rights0 - 1
  /\ pc0' = 2
  /\ UNCHANGED <<value1, rights1, inFlight, pc1>>

Increment1 ==
  /\ pc1 = 0
  /\ rights1 >= 1
  /\ value1' = value1 + 1
  /\ rights1' = rights1 - 1
  /\ pc1' = 1
  /\ UNCHANGED <<value0, rights0, inFlight, pc0>>

Next == Transfer \/ Deliver \/ Increment0 \/ Increment1

Conservation ==
  value0 + value1 + rights0 + rights1 + inFlight = Capacity

GlobalBound == value0 + value1 <= Capacity

InductiveInvariant == TypeOK /\ Conservation /\ GlobalBound

========================================================

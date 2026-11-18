import { explore } from "./engine.js";
import { exploreWithSleepSets } from "./por.js";
import { checkLinearizability } from "./linearizability.js";
import { createReplicatedRegisterModel } from "./replicated-register.js";
import { auditIndependence } from "./independence-audit.js";
import { createEscrowCounterModel, createNaiveBoundedCounterModel } from "./escrow-counter.js";

function independentFlags() {
  const names = Array.from({ length: 8 }, (_, index) => `process-${index}`);
  return {
    initialState: Object.fromEntries(names.map((name) => [name, false])),
    enabled: (state) => names
      .filter((id) => !state[id])
      .map((id) => ({ id, label: `set ${id}` })),
    step: (state, transition) => ({ ...state, [transition.id]: true }),
    independent: (left, right) => left.id !== right.id,
    invariant: () => true
  };
}

const registerSpec = {
  initialState: { value: 0 },
  apply(state, operation, args) {
    if (operation === "write") {
      state.value = args.value;
      return { state, result: "ok" };
    }
    if (operation === "read") return { state, result: state.value };
    throw new Error(`unknown operation ${operation}`);
  }
};

export function runExperiments() {
  const flags = independentFlags();
  const fullFlags = explore(flags, { maxStates: 100_000 });
  const reducedFlags = exploreWithSleepSets(flags, { maxConfigurations: 100_000 });
  const flagAudit = auditIndependence(flags, { maxStates: 100_000 });

  const replicas = [
    { id: "east", writes: ["red"] },
    { id: "central", writes: ["green"] },
    { id: "west", writes: ["blue"] }
  ];
  const lww = createReplicatedRegisterModel({ replicas, merge: "lww" });
  const arrival = createReplicatedRegisterModel({ replicas, merge: "arrival" });
  const lossy = createReplicatedRegisterModel({ replicas, merge: "lww", maxDrops: 1 });
  const fullLww = explore(lww, { maxStates: 100_000 });
  const reducedLww = exploreWithSleepSets(lww, { maxConfigurations: 100_000 });
  const lwwAudit = auditIndependence(lww, { maxStates: 100_000 });
  const brokenArrival = explore(arrival, { maxStates: 100_000 });
  const messageLoss = explore(lossy, { maxStates: 100_000 });

  const validHistory = checkLinearizability([
    { id: "write-east", client: "c0", invoke: 0, complete: 4, operation: "write", args: { value: 1 }, result: "ok" },
    { id: "write-west", client: "c1", invoke: 1, complete: 3, operation: "write", args: { value: 2 }, result: "ok" },
    { id: "read", client: "c2", invoke: 5, complete: 6, operation: "read", args: null, result: 1 }
  ], registerSpec);

  const escrow = createEscrowCounterModel({
    capacity: 2,
    replicas: [
      { id: "r0", rights: 2, program: [
        { type: "transfer", to: "r1", amount: 1 },
        { type: "increment" }
      ] },
      { id: "r1", rights: 0, program: [{ type: "increment" }] }
    ]
  });
  const naiveCounter = createNaiveBoundedCounterModel({
    capacity: 1,
    replicas: ["r0", "r1"],
    maxLocalIncrements: 1
  });
  const escrowBaseline = explore(escrow, { maxStates: 100_000 });
  const escrowReduced = exploreWithSleepSets(escrow, { maxConfigurations: 100_000 });
  const escrowAudit = auditIndependence(escrow, { maxStates: 100_000 });
  const naiveCounterexample = explore(naiveCounter, { maxStates: 100_000 });

  const invalidHistory = checkLinearizability([
    { id: "first", client: "c0", invoke: 0, complete: 1, operation: "write", args: { value: 1 }, result: "ok" },
    { id: "second", client: "c1", invoke: 2, complete: 3, operation: "write", args: { value: 2 }, result: "ok" },
    { id: "stale-read", client: "c2", invoke: 4, complete: 5, operation: "read", args: null, result: 1 }
  ], registerSpec);

  return {
    experiment: "CONCORD reproducible reference experiments",
    parameters: {
      engine: "bounded explicit-state BFS",
      reduction: "sleep-set POR, independently audited over the finite reachable state graph",
      replicatedRegister: "3 replicas, one write per replica, unordered delivery, bounded drops and duplicates",
      escrowCounter: "2 replicas, total capacity 2, one rights transfer and two increments",
      maxStates: 100_000,
      maxDepth: 100
    },
    independentSchedule: {
      baseline: fullFlags,
      reduced: reducedFlags,
      independenceAudit: flagAudit,
      transitionExtensionsRemoved: fullFlags.transitions - reducedFlags.transitions,
      transitionExtensionReduction: fullFlags.transitions === 0 ? 0 : 1 - reducedFlags.transitions / fullFlags.transitions
    },
    replicatedRegister: {
      lwwBaseline: fullLww,
      lwwReduced: reducedLww,
      lwwIndependenceAudit: lwwAudit,
      arrivalOrderNegativeControl: brokenArrival,
      permanentMessageLossNegativeControl: messageLoss
    },
    escrowCounter: {
      rightsConservingBaseline: escrowBaseline,
      reduced: escrowReduced,
      independenceAudit: escrowAudit,
      naiveQuotaNegativeControl: naiveCounterexample
    },
    linearizability: {
      overlappingHistory: validHistory,
      staleReadNegativeControl: invalidHistory
    }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(runExperiments(), null, 2));
}

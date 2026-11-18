import { canonicalJSON } from "./engine.js";

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

/**
 * Finite escrow counter model.
 *
 * Rights are conserved across replica-local budgets and in-flight transfer
 * messages. A transfer removes rights from the sender before publishing the
 * message; delivery moves those rights into the receiver's budget. An
 * increment consumes one local right and increases the committed count.
 */
export function createEscrowCounterModel(options = {}) {
  const capacity = options.capacity;
  const definitions = options.replicas;
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) {
    throw new RangeError("capacity must be an integer from 1 to 100");
  }
  if (!Array.isArray(definitions) || definitions.length < 2) {
    throw new TypeError("replicas must contain at least two definitions");
  }

  const ids = new Set();
  const replicas = definitions.map((definition, index) => {
    if (!definition || typeof definition.id !== "string" || !definition.id) {
      throw new TypeError(`replicas[${index}].id is required`);
    }
    if (ids.has(definition.id)) throw new Error(`duplicate replica id: ${definition.id}`);
    ids.add(definition.id);
    if (!Number.isInteger(definition.rights) || definition.rights < 0) {
      throw new RangeError(`replicas[${index}].rights must be a non-negative integer`);
    }
    if (!Array.isArray(definition.program)) throw new TypeError("each replica needs a finite program array");
    const program = definition.program.map((operation, opIndex) => {
      if (operation?.type === "increment") return { type: "increment" };
      if (operation?.type === "transfer") {
        if (typeof operation.to !== "string" || operation.to === definition.id) {
          throw new TypeError(`invalid transfer destination at ${definition.id}[${opIndex}]`);
        }
        if (!Number.isInteger(operation.amount) || operation.amount < 1) {
          throw new RangeError("transfer amount must be a positive integer");
        }
        return { type: "transfer", to: operation.to, amount: operation.amount };
      }
      throw new TypeError(`unknown operation in ${definition.id}[${opIndex}]`);
    });
    return { id: definition.id, rights: definition.rights, program };
  });
  if (sum(replicas.map((replica) => replica.rights)) !== capacity) {
    throw new Error("initial escrow rights must sum exactly to capacity");
  }
  for (const replica of replicas) {
    for (const operation of replica.program) {
      if (operation.type === "transfer" && !ids.has(operation.to)) {
        throw new Error(`unknown transfer destination: ${operation.to}`);
      }
    }
  }

  const indexById = new Map(replicas.map((replica, index) => [replica.id, index]));
  const initialState = {
    values: replicas.map(() => 0),
    rights: replicas.map((replica) => replica.rights),
    nextOperation: replicas.map(() => 0),
    pending: []
  };

  function enabled(state) {
    const actions = [];
    for (let index = 0; index < replicas.length; index += 1) {
      const replica = replicas[index];
      const operationIndex = state.nextOperation[index];
      const operation = replica.program[operationIndex];
      if (!operation) continue;
      if (operation.type === "increment" && state.rights[index] >= 1) {
        actions.push({
          id: `program:${replica.id}:${operationIndex}`,
          kind: "increment",
          replica: replica.id,
          label: `${replica.id} consumes one escrow right`
        });
      } else if (operation.type === "transfer" && state.rights[index] >= operation.amount) {
        actions.push({
          id: `program:${replica.id}:${operationIndex}`,
          kind: "transfer",
          replica: replica.id,
          to: operation.to,
          amount: operation.amount,
          label: `${replica.id} transfers ${operation.amount} right(s) to ${operation.to}`
        });
      }
    }
    for (const message of state.pending) {
      actions.push({
        id: `deliver:${message.id}`,
        kind: "deliver",
        messageId: message.id,
        to: message.to,
        label: `deliver escrow rights to ${message.to}`
      });
    }
    return actions;
  }

  function step(state, action) {
    if (action.kind === "deliver") {
      const pendingIndex = state.pending.findIndex((message) => message.id === action.messageId);
      if (pendingIndex < 0) throw new Error("stale escrow delivery");
      const [message] = state.pending.splice(pendingIndex, 1);
      state.rights[indexById.get(message.to)] += message.amount;
      return state;
    }

    const sourceIndex = indexById.get(action.replica);
    const expectedIndex = state.nextOperation[sourceIndex];
    const definition = replicas[sourceIndex].program[expectedIndex];
    if (!definition) throw new Error("replica program is already complete");

    if (action.kind === "increment") {
      if (definition.type !== "increment" || state.rights[sourceIndex] < 1) {
        throw new Error("stale or unauthorized increment");
      }
      state.rights[sourceIndex] -= 1;
      state.values[sourceIndex] += 1;
    } else if (action.kind === "transfer") {
      if (
        definition.type !== "transfer" ||
        definition.to !== action.to ||
        definition.amount !== action.amount ||
        state.rights[sourceIndex] < action.amount
      ) {
        throw new Error("stale or unauthorized rights transfer");
      }
      state.rights[sourceIndex] -= action.amount;
      state.pending.push({
        id: `${action.replica}:${expectedIndex}->${action.to}`,
        from: action.replica,
        to: action.to,
        amount: action.amount
      });
      state.pending.sort((a, b) => a.id.localeCompare(b.id));
    } else {
      throw new Error(`unknown escrow transition: ${action.kind}`);
    }

    state.nextOperation[sourceIndex] += 1;
    return state;
  }

  function independent(left, right) {
    if (left.id === right.id) return false;
    if (left.kind === "increment" && right.kind === "increment") {
      return left.replica !== right.replica;
    }
    if (left.kind === "transfer" && right.kind === "transfer") {
      return left.replica !== right.replica;
    }
    if (left.kind === "deliver" && right.kind === "deliver") {
      return left.to !== right.to;
    }
    if (left.kind === "increment" && right.kind === "transfer") {
      return left.replica !== right.replica;
    }
    if (left.kind === "transfer" && right.kind === "increment") {
      return left.replica !== right.replica;
    }
    if (left.kind === "increment" && right.kind === "deliver") {
      return left.replica !== right.to;
    }
    if (left.kind === "deliver" && right.kind === "increment") {
      return right.replica !== left.to;
    }
    if (left.kind === "transfer" && right.kind === "deliver") {
      return left.replica !== right.to;
    }
    if (left.kind === "deliver" && right.kind === "transfer") {
      return right.replica !== left.to;
    }
    return false;
  }

  function isComplete(state) {
    return state.pending.length === 0 &&
      state.nextOperation.every((index, i) => index === replicas[i].program.length);
  }

  function conserved(state) {
    return sum(state.values) + sum(state.rights) +
      sum(state.pending.map((message) => message.amount)) === capacity;
  }

  return {
    name: "escrow-bounded-counter",
    initialState,
    enabled,
    step,
    independent,
    isComplete,
    invariant(state) {
      if (!conserved(state)) {
        return { ok: false, reason: "escrow rights conservation was violated" };
      }
      if (sum(state.values) > capacity) {
        return { ok: false, reason: "global counter exceeded its capacity" };
      }
      if (!isComplete(state) && enabled(state).length === 0) {
        return { ok: false, reason: "escrow program deadlocked before completion" };
      }
      return true;
    },
    describe(state) {
      return {
        values: Object.fromEntries(replicas.map((replica, i) => [replica.id, state.values[i]])),
        rights: Object.fromEntries(replicas.map((replica, i) => [replica.id, state.rights[i]])),
        pending: state.pending.map((message) => ({ ...message })),
        committedTotal: sum(state.values),
        conservedTotal: sum(state.values) + sum(state.rights) +
          sum(state.pending.map((message) => message.amount))
      };
    }
  };
}

/**
 * Deliberately incorrect baseline: every replica believes it may consume the
 * full global capacity. The invariant catches concurrent over-allocation.
 */
export function createNaiveBoundedCounterModel(options = {}) {
  const capacity = options.capacity;
  const replicas = options.replicas;
  const maxLocalIncrements = options.maxLocalIncrements ?? capacity;
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) {
    throw new RangeError("capacity must be an integer from 1 to 100");
  }
  if (!Array.isArray(replicas) || replicas.length < 2) {
    throw new TypeError("replicas must contain at least two identifiers");
  }
  if (!Number.isInteger(maxLocalIncrements) || maxLocalIncrements < 1) {
    throw new RangeError("maxLocalIncrements must be positive");
  }
  const ids = new Set();
  for (const id of replicas) {
    if (typeof id !== "string" || !id || ids.has(id)) throw new Error("replica IDs must be unique non-empty strings");
    ids.add(id);
  }
  const initialState = { values: replicas.map(() => 0) };
  return {
    name: "naive-bounded-counter-negative-control",
    initialState,
    enabled(state) {
      return replicas.flatMap((id, index) =>
        state.values[index] < maxLocalIncrements
          ? [{ id: `increment:${id}`, replica: id, index, label: `${id} increments without escrow` }]
          : []
      );
    },
    step(state, action) {
      state.values[action.index] += 1;
      return state;
    },
    invariant(state) {
      return sum(state.values) <= capacity
        ? true
        : { ok: false, reason: "naive replicas over-allocated the global counter capacity" };
    }
  };
}

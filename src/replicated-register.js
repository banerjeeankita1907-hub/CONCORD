import { canonicalJSON } from "./engine.js";

function compareStamps(left, right) {
  if (left.clock !== right.clock) return left.clock - right.clock;
  return left.writer.localeCompare(right.writer);
}

function allValuesEqual(replicas) {
  if (replicas.length < 2) return true;
  const first = canonicalJSON(replicas[0].value);
  return replicas.every((replica) => canonicalJSON(replica.value) === first);
}

/**
 * Construct a finite asynchronous replicated-register transition system.
 *
 * Each replica executes a finite, program-ordered list of local writes.
 * A write atomically updates its source replica and multicasts one message to
 * every other replica. The network is an unordered bag: deliveries may occur
 * in any order. Optional duplicate transitions model at-least-once delivery.
 *
 * merge="lww" uses a deterministic Lamport timestamp + writer-id tie-break.
 * merge="arrival" is the intentionally broken arrival-order-wins strategy.
 */
export function createReplicatedRegisterModel(options = {}) {
  const definitions = options.replicas;
  const merge = options.merge ?? "lww";
  const maxDuplicates = options.maxDuplicates ?? 0;
  const initialValue = options.initialValue ?? null;

  if (!Array.isArray(definitions) || definitions.length < 2) {
    throw new TypeError("replicas must contain at least two replica definitions");
  }
  if (!["lww", "arrival"].includes(merge)) throw new TypeError("merge must be lww or arrival");
  if (!Number.isInteger(maxDuplicates) || maxDuplicates < 0 || maxDuplicates > 8) {
    throw new RangeError("maxDuplicates must be an integer from 0 to 8");
  }
  canonicalJSON(initialValue);
  const ids = new Set();
  const replicas = definitions.map((definition, index) => {
    if (!definition || typeof definition.id !== "string" || !definition.id) {
      throw new TypeError(`replicas[${index}].id is required`);
    }
    if (ids.has(definition.id)) throw new Error(`duplicate replica id: ${definition.id}`);
    ids.add(definition.id);
    if (!Array.isArray(definition.writes)) throw new TypeError(`replicas[${index}].writes must be an array`);
    definition.writes.forEach(canonicalJSON);
    return { id: definition.id, writes: definition.writes };
  });

  const replicaIndex = new Map(replicas.map((replica, index) => [replica.id, index]));
  const initialState = {
    replicas: replicas.map(({ id }) => ({
      id,
      value: initialValue,
      stamp: { clock: 0, writer: "" },
      clock: 0
    })),
    nextWrites: replicas.map(() => 0),
    pending: [],
    duplicated: [],
    duplicateCount: 0
  };

  function enabled(state) {
    const actions = [];
    for (let index = 0; index < replicas.length; index += 1) {
      const definition = replicas[index];
      const writeIndex = state.nextWrites[index];
      if (writeIndex < definition.writes.length) {
        actions.push({
          id: `write:${definition.id}:${writeIndex}`,
          kind: "write",
          replica: definition.id,
          index: writeIndex,
          value: definition.writes[writeIndex],
          label: `${definition.id} writes ${JSON.stringify(definition.writes[writeIndex])}`
        });
      }
    }
    for (const message of state.pending) {
      actions.push({
        id: `deliver:${message.id}`,
        kind: "deliver",
        messageId: message.id,
        baseId: message.baseId,
        to: message.to,
        label: `deliver ${message.baseId} to ${message.to}`
      });
      if (
        state.duplicateCount < maxDuplicates &&
        !state.duplicated.includes(message.baseId)
      ) {
        actions.push({
          id: `duplicate:${message.baseId}`,
          kind: "duplicate",
          messageId: message.id,
          baseId: message.baseId,
          label: `duplicate ${message.baseId}`
        });
      }
    }
    return actions;
  }

  function step(state, action) {
    if (action.kind === "write") {
      const sourceIndex = replicaIndex.get(action.replica);
      const source = state.replicas[sourceIndex];
      const expectedIndex = state.nextWrites[sourceIndex];
      if (expectedIndex !== action.index) throw new Error("stale local-write transition");
      const stamp = { clock: source.clock + 1, writer: action.replica };
      source.clock = stamp.clock;
      source.value = action.value;
      source.stamp = stamp;
      state.nextWrites[sourceIndex] += 1;

      for (const target of state.replicas) {
        if (target.id === action.replica) continue;
        const baseId = `${action.replica}:${action.index}->${target.id}`;
        state.pending.push({
          id: baseId,
          baseId,
          from: action.replica,
          to: target.id,
          value: action.value,
          stamp,
          copy: 0
        });
      }
      state.pending.sort((a, b) => a.id.localeCompare(b.id));
      return state;
    }

    if (action.kind === "duplicate") {
      const message = state.pending.find((item) => item.id === action.messageId);
      if (!message) throw new Error("stale duplicate transition");
      if (state.duplicated.includes(message.baseId) || state.duplicateCount >= maxDuplicates) {
        throw new Error("duplicate bound exceeded");
      }
      const duplicate = { ...message, id: `${message.baseId}~dup`, copy: 1 };
      state.pending.push(duplicate);
      state.pending.sort((a, b) => a.id.localeCompare(b.id));
      state.duplicated.push(message.baseId);
      state.duplicated.sort();
      state.duplicateCount += 1;
      return state;
    }

    if (action.kind === "deliver") {
      const messageIndex = state.pending.findIndex((item) => item.id === action.messageId);
      if (messageIndex < 0) throw new Error("stale delivery transition");
      const [message] = state.pending.splice(messageIndex, 1);
      const target = state.replicas[replicaIndex.get(message.to)];
      target.clock = Math.max(target.clock, message.stamp.clock);
      const shouldApply = merge === "arrival" || compareStamps(message.stamp, target.stamp) > 0;
      if (shouldApply) {
        target.value = message.value;
        target.stamp = message.stamp;
      }
      return state;
    }

    throw new Error(`unknown transition kind: ${action.kind}`);
  }

  function independent(left, right) {
    if (left.id === right.id) return false;
    if (left.kind === "write" && right.kind === "write") {
      return left.replica !== right.replica;
    }
    if (left.kind === "deliver" && right.kind === "deliver") {
      return left.to !== right.to && left.messageId !== right.messageId;
    }
    if (left.kind === "duplicate" && right.kind === "duplicate") {
      return left.baseId !== right.baseId;
    }
    if (left.kind === "write" && right.kind === "deliver") {
      return left.replica !== right.to;
    }
    if (left.kind === "deliver" && right.kind === "write") {
      return right.replica !== left.to;
    }
    if (left.kind === "write" && right.kind === "duplicate") return true;
    if (left.kind === "duplicate" && right.kind === "write") return true;
    if (left.kind === "deliver" && right.kind === "duplicate") {
      return left.baseId !== right.baseId;
    }
    if (left.kind === "duplicate" && right.kind === "deliver") {
      return right.baseId !== left.baseId;
    }
    return false;
  }

  function isComplete(state) {
    return state.pending.length === 0 &&
      state.nextWrites.every((index, i) => index === replicas[i].writes.length);
  }

  return {
    name: `replicated-register-${merge}`,
    initialState,
    enabled,
    step,
    independent,
    isComplete,
    invariant(state) {
      if (!isComplete(state) || allValuesEqual(state.replicas)) return true;
      return {
        ok: false,
        reason: "replicas did not converge after all local writes and all messages were delivered"
      };
    },
    describe(state) {
      return {
        replicas: state.replicas.map(({ id, value, stamp }) => ({ id, value, stamp })),
        pendingMessages: state.pending.map(({ id, from, to, value, stamp }) => ({ id, from, to, value, stamp }))
      };
    }
  };
}

export { allValuesEqual };

import { canonicalJSON, cloneState } from "./engine.js";

/**
 * Checks a completed operation history against an executable sequential spec.
 *
 * Operation shape:
 * { id, client, invoke, complete, operation, args, result }
 * Timestamps are totally ordered numbers. A response-before-invocation edge
 * (a.complete < b.invoke) must be respected by every legal sequential order.
 *
 * Spec shape:
 * { initialState, apply(state, operation, args) -> { state, result } }
 */
export function checkLinearizability(history, spec, options = {}) {
  if (!Array.isArray(history)) throw new TypeError("history must be an array");
  if (!spec || typeof spec.apply !== "function") throw new TypeError("spec.apply is required");
  const maxNodes = options.maxNodes ?? 1_000_000;
  if (!Number.isInteger(maxNodes) || maxNodes < 1) throw new RangeError("maxNodes must be positive");
  if (history.length > 63) {
    throw new RangeError("This implementation supports at most 63 completed operations");
  }

  const ids = new Set();
  const ops = history.map((raw, index) => {
    if (!raw || typeof raw.id !== "string" || !raw.id) throw new TypeError(`history[${index}].id is required`);
    if (ids.has(raw.id)) throw new Error(`duplicate operation id: ${raw.id}`);
    ids.add(raw.id);
    if (!Number.isFinite(raw.invoke) || !Number.isFinite(raw.complete) || raw.invoke >= raw.complete) {
      throw new TypeError(`invalid invocation/response interval for ${raw.id}`);
    }
    canonicalJSON(raw.args ?? null);
    canonicalJSON(raw.result);
    return { ...raw, args: raw.args ?? null };
  });
  const n = ops.length;
  const predecessors = ops.map(() => 0n);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (i !== j && ops[j].complete < ops[i].invoke) predecessors[i] |= (1n << BigInt(j));
    }
  }

  const dead = new Set();
  const initial = cloneState(spec.initialState);
  let exploredNodes = 0;
  let exhausted = false;

  function search(state, placed, path) {
    if (placed === ((1n << BigInt(n)) - 1n)) return path;
    const key = placed.toString(16) + "|" + canonicalJSON(state);
    if (dead.has(key)) return null;
    exploredNodes += 1;
    if (exploredNodes > maxNodes) {
      exhausted = true;
      return null;
    }

    for (let i = 0; i < n; i += 1) {
      const bit = 1n << BigInt(i);
      if ((placed & bit) !== 0n) continue;
      if ((predecessors[i] & placed) !== predecessors[i]) continue;

      const outcome = spec.apply(cloneState(state), ops[i].operation, cloneState(ops[i].args));
      if (!outcome || !("state" in outcome) || !("result" in outcome)) {
        throw new TypeError("spec.apply must return { state, result }");
      }
      canonicalJSON(outcome.state);
      if (canonicalJSON(outcome.result) !== canonicalJSON(ops[i].result)) continue;

      const result = search(
        outcome.state,
        placed | bit,
        [...path, ops[i].id]
      );
      if (result !== null) return result;
      if (exhausted) return null;
    }
    dead.add(key);
    return null;
  }

  const linearization = search(initial, 0n, []);
  return {
    status: exhausted ? "inconclusive" : linearization ? "linearizable" : "not-linearizable",
    linearizable: linearization !== null,
    linearization,
    exploredNodes,
    maxNodes,
    reason: exhausted
      ? "search node limit reached"
      : linearization
        ? null
        : "no sequential ordering satisfies real-time precedence and the sequential specification"
  };
}

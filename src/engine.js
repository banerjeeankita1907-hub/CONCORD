/**
 * CONCORD explicit-state exploration engine.
 *
 * A model is a deterministic labelled transition system:
 *   { initialState, enabled(state), step(state, transition), invariant(state) }
 *
 * States must be JSON-compatible values. Transition IDs must be unique and
 * stable within a state. The engine clones states before handing them to step.
 */

export function canonicalJSON(value) {
  const ancestors = new WeakSet();

  function visit(item, path) {
    if (item === null || typeof item === "string" || typeof item === "boolean") {
      return JSON.stringify(item);
    }
    if (typeof item === "number") {
      if (!Number.isFinite(item)) throw new TypeError(`Non-finite number at ${path}`);
      return JSON.stringify(item);
    }
    if (typeof item !== "object") {
      throw new TypeError(`Non-JSON value at ${path}`);
    }
    if (ancestors.has(item)) throw new TypeError(`Cycle detected at ${path}`);
    ancestors.add(item);
    let output;
    if (Array.isArray(item)) {
      output = "[" + item.map((entry, index) => visit(entry, `${path}[${index}]`)).join(",") + "]";
    } else {
      const prototype = Object.getPrototypeOf(item);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(`Only plain objects are supported at ${path}`);
      }
      const keys = Object.keys(item).sort();
      output = "{" + keys.map((key) => {
        if (item[key] === undefined) throw new TypeError(`Undefined value at ${path}.${key}`);
        return JSON.stringify(key) + ":" + visit(item[key], `${path}.${key}`);
      }).join(",") + "}";
    }
    ancestors.delete(item);
    return output;
  }

  return visit(value, "$");
}

export function cloneState(state) {
  return JSON.parse(canonicalJSON(state));
}

export function transitionMap(model, state) {
  const transitions = model.enabled(state);
  if (!Array.isArray(transitions)) throw new TypeError("model.enabled(state) must return an array");
  const byId = new Map();
  for (const transition of transitions) {
    if (!transition || typeof transition.id !== "string" || transition.id.length === 0) {
      throw new TypeError("Every transition must have a non-empty string id");
    }
    if (byId.has(transition.id)) throw new Error(`Duplicate transition id: ${transition.id}`);
    byId.set(transition.id, transition);
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function applyTransition(model, state, transition) {
  const input = cloneState(state);
  const next = model.step(input, transition);
  const result = next === undefined ? input : next;
  canonicalJSON(result);
  return result;
}

export function invariantViolation(model, state) {
  if (typeof model.invariant !== "function") return null;
  const result = model.invariant(state);
  if (result === true) return null;
  if (result === false) return "state invariant returned false";
  if (result && typeof result === "object" && result.ok === true) return null;
  if (result && typeof result === "object" && result.ok === false) {
    return typeof result.reason === "string" ? result.reason : "state invariant returned ok=false";
  }
  throw new TypeError("model.invariant(state) must return boolean or { ok, reason? }");
}

/**
 * Breadth-first explicit-state exploration. With stopOnViolation=true, the
 * first returned counterexample has minimum transition length.
 */
export function explore(model, options = {}) {
  if (!model || typeof model.enabled !== "function" || typeof model.step !== "function") {
    throw new TypeError("model must define enabled(state) and step(state, transition)");
  }
  const maxStates = options.maxStates ?? 50_000;
  const maxDepth = options.maxDepth ?? 100;
  const stopOnViolation = options.stopOnViolation ?? true;
  if (!Number.isInteger(maxStates) || maxStates < 1) throw new RangeError("maxStates must be a positive integer");
  if (!Number.isInteger(maxDepth) || maxDepth < 0) throw new RangeError("maxDepth must be a non-negative integer");

  const started = Date.now();
  const initialState = cloneState(model.initialState);
  const initialKey = canonicalJSON(initialState);
  const queue = [{ state: initialState, key: initialKey, depth: 0, trace: [] }];
  const seen = new Set([initialKey]);
  let cursor = 0;
  let transitions = 0;
  let terminalStates = 0;
  let truncated = false;
  let counterexample = null;

  while (cursor < queue.length) {
    const current = queue[cursor++];
    const reason = invariantViolation(model, current.state);
    if (reason !== null) {
      counterexample = { reason, depth: current.depth, trace: current.trace, state: current.state };
      if (stopOnViolation) break;
    }

    const enabled = transitionMap(model, current.state);
    const explicitlyComplete = typeof model.isComplete === "function" && model.isComplete(current.state);
    if (enabled.length === 0 || explicitlyComplete) {
      terminalStates += 1;
      continue;
    }
    if (current.depth >= maxDepth) {
      truncated = true;
      continue;
    }

    for (const transition of enabled) {
      transitions += 1;
      const nextState = applyTransition(model, current.state, transition);
      const key = canonicalJSON(nextState);
      if (seen.has(key)) continue;
      if (seen.size >= maxStates) {
        truncated = true;
        break;
      }
      seen.add(key);
      queue.push({
        state: nextState,
        key,
        depth: current.depth + 1,
        trace: [...current.trace, { id: transition.id, label: transition.label ?? transition.id }]
      });
    }
    if (truncated && seen.size >= maxStates) break;
  }

  const complete = !truncated && cursor >= queue.length && (counterexample === null || !stopOnViolation);
  return {
    status: counterexample ? "counterexample" : complete ? "safe-within-bounds" : "inconclusive",
    complete,
    exploredStates: seen.size,
    expandedStates: cursor,
    transitions,
    terminalStates,
    maxStates,
    maxDepth,
    counterexample,
    elapsedMs: Date.now() - started
  };
}

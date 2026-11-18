import {
  canonicalJSON,
  cloneState,
  transitionMap,
  applyTransition
} from "./engine.js";

/**
 * Exhaustively audits a model's claimed independence relation over its
 * reachable bounded state graph. Every enabled pair declared independent is
 * checked for symmetry, mutual enabledness after one another, and a commuting
 * diamond. A complete finite audit is stronger than POR's online local
 * checks, but remains conditional on the model's transition semantics.
 */
export function auditIndependence(model, options = {}) {
  if (!model || typeof model.enabled !== "function" || typeof model.step !== "function") {
    throw new TypeError("model must define enabled(state) and step(state, transition)");
  }
  if (typeof model.independent !== "function") {
    throw new TypeError("independence audit requires model.independent(a, b, state)");
  }
  const maxStates = options.maxStates ?? 50_000;
  const maxDepth = options.maxDepth ?? 100;
  if (!Number.isInteger(maxStates) || maxStates < 1) throw new RangeError("maxStates must be positive");
  if (!Number.isInteger(maxDepth) || maxDepth < 0) throw new RangeError("maxDepth must be non-negative");

  const initialState = cloneState(model.initialState);
  const queue = [{ state: initialState, depth: 0 }];
  const seen = new Set([canonicalJSON(initialState)]);
  let cursor = 0;
  let checkedPairs = 0;
  let declaredPairs = 0;
  let truncated = false;

  function invalid(reason, state, left, right) {
    return {
      status: "invalid-independence",
      complete: false,
      reachableStates: seen.size,
      checkedPairs,
      declaredPairs,
      counterexample: {
        reason,
        actions: [left.id, right.id],
        state
      }
    };
  }

  while (cursor < queue.length) {
    const current = queue[cursor++];
    const stateKey = canonicalJSON(current.state);
    const enabled = transitionMap(model, current.state);

    for (let i = 0; i < enabled.length; i += 1) {
      for (let j = i + 1; j < enabled.length; j += 1) {
        const left = enabled[i];
        const right = enabled[j];
        const lr = Boolean(model.independent(left, right, current.state));
        const rl = Boolean(model.independent(right, left, current.state));
        if (lr !== rl) {
          return invalid("claimed independence is asymmetric", current.state, left, right);
        }
        if (!lr) continue;
        declaredPairs += 1;
        checkedPairs += 1;

        const afterLeft = applyTransition(model, current.state, left);
        const rightAfterLeft = transitionMap(model, afterLeft).find((item) => item.id === right.id);
        const afterRight = applyTransition(model, current.state, right);
        const leftAfterRight = transitionMap(model, afterRight).find((item) => item.id === left.id);
        if (!rightAfterLeft || !leftAfterRight) {
          return invalid("claimed independent actions disable one another", current.state, left, right);
        }
        const leftThenRight = applyTransition(model, afterLeft, rightAfterLeft);
        const rightThenLeft = applyTransition(model, afterRight, leftAfterRight);
        if (canonicalJSON(leftThenRight) !== canonicalJSON(rightThenLeft)) {
          return invalid("claimed independent actions fail the commuting diamond", current.state, left, right);
        }
      }
    }

    if (current.depth >= maxDepth && enabled.length > 0) {
      truncated = true;
      continue;
    }
    for (const action of enabled) {
      const next = applyTransition(model, current.state, action);
      const key = canonicalJSON(next);
      if (seen.has(key)) continue;
      if (seen.size >= maxStates) {
        truncated = true;
        break;
      }
      seen.add(key);
      queue.push({ state: next, depth: current.depth + 1 });
    }
  }

  return {
    status: truncated ? "inconclusive" : "certified-on-bounded-graph",
    complete: !truncated,
    reachableStates: seen.size,
    checkedPairs,
    declaredPairs,
    counterexample: null
  };
}

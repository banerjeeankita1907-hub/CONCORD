/**
 * Sleep-set partial-order reduction for deterministic labelled transition
 * systems. The caller supplies a conservative independence predicate.
 *
 * Soundness contract: independent(a,b,s) must denote a symmetric, persistent
 * independence relation. CONCORD checks the local diamond at every point
 * where it relies on independence: both orders must remain enabled and lead
 * to canonically identical states. These checks are necessary safeguards,
 * not a proof that a user-supplied relation is globally persistent.
 */

import {
  canonicalJSON,
  cloneState,
  transitionMap,
  applyTransition,
  invariantViolation
} from "./engine.js";

export function exploreWithSleepSets(model, options = {}) {
  if (!model || typeof model.enabled !== "function" || typeof model.step !== "function") {
    throw new TypeError("model must define enabled(state) and step(state, transition)");
  }
  if (typeof model.independent !== "function") {
    throw new TypeError("POR requires model.independent(a, b, state)");
  }
  const maxConfigurations = options.maxConfigurations ?? 50_000;
  const maxDepth = options.maxDepth ?? 100;
  const stopOnViolation = options.stopOnViolation ?? true;
  if (!Number.isInteger(maxConfigurations) || maxConfigurations < 1) {
    throw new RangeError("maxConfigurations must be a positive integer");
  }
  if (!Number.isInteger(maxDepth) || maxDepth < 0) {
    throw new RangeError("maxDepth must be a non-negative integer");
  }

  const started = Date.now();
  const independenceCache = new Map();
  const visitedDepths = new Map();
  const cutOffConfigurations = new Set();
  let configurationLimitHit = false;
  let configurations = 0;
  let transitions = 0;
  let sleepPruned = 0;
  let terminalConfigurations = 0;
  let truncated = false;
  let counterexample = null;

  function independentAt(state, stateKey, a, b) {
    if (a.id === b.id) return false;
    const pair = [a.id, b.id].sort();
    const cacheKey = JSON.stringify([stateKey, pair]);
    if (independenceCache.has(cacheKey)) return independenceCache.get(cacheKey);
    const ab = Boolean(model.independent(a, b, state));
    const ba = Boolean(model.independent(b, a, state));
    if (ab !== ba) throw new Error(`Independence relation is asymmetric for ${a.id}, ${b.id}`);
    if (!ab) {
      independenceCache.set(cacheKey, false);
      return false;
    }

    const afterA = applyTransition(model, state, a);
    const bAfterA = transitionMap(model, afterA).find((item) => item.id === b.id);
    const afterB = applyTransition(model, state, b);
    const aAfterB = transitionMap(model, afterB).find((item) => item.id === a.id);
    if (!bAfterA || !aAfterB) {
      throw new Error(`Invalid independence claim: ${a.id} and ${b.id} disable one another`);
    }
    const abState = applyTransition(model, afterA, bAfterA);
    const baState = applyTransition(model, afterB, aAfterB);
    if (canonicalJSON(abState) !== canonicalJSON(baState)) {
      throw new Error(`Invalid independence claim: ${a.id} and ${b.id} do not commute`);
    }
    independenceCache.set(cacheKey, true);
    return true;
  }

  function visit(state, sleepInput, depth, trace) {
    const stateKey = canonicalJSON(state);
    const enabled = transitionMap(model, state);
    const enabledById = new Map(enabled.map((item) => [item.id, item]));
    const sleep = new Set([...sleepInput].filter((id) => enabledById.has(id)));
    const configKey = JSON.stringify([stateKey, [...sleep].sort()]);
    const previousDepth = visitedDepths.get(configKey);
    if (previousDepth !== undefined && previousDepth <= depth) return;
    if (configurations >= maxConfigurations) {
      configurationLimitHit = true;
      return;
    }
    visitedDepths.set(configKey, depth);
    cutOffConfigurations.delete(configKey);
    configurations += 1;

    const reason = invariantViolation(model, state);
    if (reason !== null) {
      if (counterexample === null) counterexample = { reason, depth, trace, state };
      if (stopOnViolation) return;
    }

    const explicitlyComplete = typeof model.isComplete === "function" && model.isComplete(state);
    if (enabled.length === 0 || explicitlyComplete) {
      terminalConfigurations += 1;
      return;
    }
    if (depth >= maxDepth) {
      cutOffConfigurations.add(configKey);
      return;
    }

    const localSleep = new Set(sleep);
    for (const transition of enabled) {
      if (!localSleep.has(transition.id)) {
        transitions += 1;
        const nextState = applyTransition(model, state, transition);
        const nextEnabled = new Set(transitionMap(model, nextState).map((item) => item.id));
        const childSleep = new Set();
        for (const sleepingId of localSleep) {
          const sleepingTransition = enabledById.get(sleepingId);
          if (
            sleepingTransition &&
            nextEnabled.has(sleepingId) &&
            independentAt(state, stateKey, transition, sleepingTransition)
          ) {
            childSleep.add(sleepingId);
          }
        }
        visit(
          nextState,
          childSleep,
          depth + 1,
          [...trace, { id: transition.id, label: transition.label ?? transition.id }]
        );
        if (counterexample && stopOnViolation) return;
      } else {
        sleepPruned += 1;
      }
      localSleep.add(transition.id);
      if (configurationLimitHit) return;
    }
  }

  visit(cloneState(model.initialState), new Set(), 0, []);
  const complete = !configurationLimitHit && cutOffConfigurations.size === 0 && (!counterexample || !stopOnViolation);
  return {
    status: counterexample ? "counterexample" : complete ? "safe-within-bounds" : "inconclusive",
    complete,
    exploredConfigurations: configurations,
    transitions,
    sleepPruned,
    terminalConfigurations,
    maxConfigurations,
    maxDepth,
    counterexample,
    elapsedMs: Date.now() - started
  };
}

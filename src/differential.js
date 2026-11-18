import { explore } from "./engine.js";
import { exploreWithSleepSets } from "./por.js";
import { auditIndependence } from "./independence-audit.js";

/**
 * Run the exhaustive reference engine, the POR engine, and the bounded
 * independence audit with a shared depth bound. A clean certificate requires
 * complete engines, matching safety outcomes, and a complete independence
 * audit on the finite reachable graph.
 */
export function compareExplorers(model, options = {}) {
  const maxDepth = options.maxDepth ?? 100;
  const baseline = explore(model, {
    maxStates: options.maxStates ?? 50_000,
    maxDepth
  });
  const reduced = exploreWithSleepSets(model, {
    maxConfigurations: options.maxConfigurations ?? 50_000,
    maxDepth
  });
  const independenceAudit = auditIndependence(model, {
    maxStates: options.auditMaxStates ?? options.maxStates ?? 50_000,
    maxDepth
  });

  const sameSafetyOutcome =
    (baseline.status === "counterexample" && reduced.status === "counterexample") ||
    (baseline.status === "safe-within-bounds" && reduced.status === "safe-within-bounds");
  const enginesComplete =
    (baseline.status === "counterexample" || baseline.complete) &&
    (reduced.status === "counterexample" || reduced.complete);
  const auditComplete = independenceAudit.status === "certified-on-bounded-graph";

  return {
    status: sameSafetyOutcome
      ? auditComplete && enginesComplete
        ? "certified-bounded-agreement"
        : "agreement-but-inconclusive"
      : "engine-disagreement",
    sameSafetyOutcome,
    enginesComplete,
    auditComplete,
    baseline,
    reduced,
    independenceAudit
  };
}

import test from "node:test";
import assert from "node:assert/strict";
import { explore, replayTrace } from "../src/engine.js";
import { exploreWithSleepSets } from "../src/por.js";
import { auditIndependence } from "../src/independence-audit.js";

/**
 * Deterministic LCG: the generated corpus is reproducible across platforms and
 * Node versions. No test outcome depends on wall-clock time or Math.random().
 */
function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

function makeBoundedIndependentCounterModel(limits, threshold) {
  const names = limits.map((_, index) => `replica-${index}`);
  return {
    initialState: { values: limits.map(() => 0) },
    enabled(state) {
      return limits.flatMap((limit, index) =>
        state.values[index] < limit
          ? [{ id: `inc:${index}`, index, label: `replica ${index} increments` }]
          : []
      );
    },
    step(state, action) {
      state.values[action.index] += 1;
      return state;
    },
    independent(left, right) {
      return left.index !== right.index;
    },
    invariant(state) {
      const total = state.values.reduce((sum, value) => sum + value, 0);
      return total <= threshold;
    }
  };
}

test("seeded generated model corpus: BFS, sleep-set POR and independence audit agree", () => {
  const random = makeRandom(0xC0_0C_0D);
  let safeModels = 0;
  let violatingModels = 0;
  let checkedModels = 0;

  for (let sample = 0; sample < 120; sample += 1) {
    const width = 2 + (random() % 3);
    const limits = Array.from({ length: width }, () => 1 + (random() % 3));
    const maximum = limits.reduce((sum, value) => sum + value, 0);
    const threshold = random() % (maximum + 1);
    const model = makeBoundedIndependentCounterModel(limits, threshold);

    const audit = auditIndependence(model, { maxStates: 1_000, maxDepth: maximum + 1 });
    assert.equal(audit.status, "certified-on-bounded-graph", `seeded sample ${sample}: ${JSON.stringify(audit)}`);

    const baseline = explore(model, { maxStates: 1_000, maxDepth: maximum + 1 });
    const reduced = exploreWithSleepSets(model, { maxConfigurations: 1_000, maxDepth: maximum + 1 });

    assert.equal(reduced.status, baseline.status, `seeded sample ${sample}`);
    assert.equal(reduced.complete, baseline.complete, `seeded sample ${sample}`);

    if (baseline.counterexample) {
      violatingModels += 1;
      const replay = replayTrace(model, baseline.counterexample.trace);
      assert.equal(replay.valid, true);
      assert.equal(replay.violatesInvariant, true);
    } else {
      safeModels += 1;
    }
    checkedModels += 1;
  }

  assert.equal(checkedModels, 120);
  assert.ok(safeModels > 0);
  assert.ok(violatingModels > 0);
});

import test from "node:test";
import assert from "node:assert/strict";
import { explore } from "../src/engine.js";
import { exploreWithSleepSets } from "../src/por.js";
import { auditIndependence } from "../src/independence-audit.js";

function generatedFlagModel(size, requiredMask) {
  const names = Array.from({ length: size }, (_, index) => `p${index}`);
  return {
    initialState: Object.fromEntries(names.map((name) => [name, false])),
    enabled: (state) => names
      .filter((name) => !state[name])
      .map((name) => ({ id: name, label: `execute ${name}` })),
    step: (state, action) => ({ ...state, [action.id]: true }),
    independent: (left, right) => left.id !== right.id,
    invariant: (state) => !names.every((name, index) =>
      ((requiredMask >> index) & 1) === 0 || state[name]
    )
  };
}

test("POR agrees with exhaustive BFS across a generated finite model corpus", () => {
  let checked = 0;
  for (let size = 2; size <= 4; size += 1) {
    for (let mask = 1; mask < (1 << size); mask += 1) {
      const model = generatedFlagModel(size, mask);
      const audit = auditIndependence(model);
      assert.equal(audit.status, "certified-on-bounded-graph");
      const full = explore(model, { maxStates: 100 });
      const reduced = exploreWithSleepSets(model, { maxConfigurations: 500, maxDepth: 10 });
      assert.equal(reduced.status, full.status, `size=${size}, mask=${mask}`);
      assert.equal(full.status, "counterexample");
      checked += 1;
    }
  }
  assert.equal(checked, 25);
});

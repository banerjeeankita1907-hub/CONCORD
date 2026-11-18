import test from "node:test";
import assert from "node:assert/strict";
import { auditIndependence } from "../src/independence-audit.js";

function modelWithTwoIndependentFlags() {
  return {
    initialState: { a: false, b: false },
    enabled: (state) => [
      ...(!state.a ? [{ id: "a" }] : []),
      ...(!state.b ? [{ id: "b" }] : [])
    ],
    step: (state, action) => ({ ...state, [action.id]: true }),
    independent: (left, right) => left.id !== right.id
  };
}

test("bounded independence audit checks every reachable enabled pair", () => {
  const result = auditIndependence(modelWithTwoIndependentFlags());
  assert.equal(result.status, "certified-on-bounded-graph");
  assert.equal(result.complete, true);
  assert.equal(result.reachableStates, 4);
  assert.equal(result.checkedPairs, 1);
});

test("independence audit rejects a non-commuting declared pair", () => {
  const model = {
    initialState: { value: 0, a: false, b: false },
    enabled: (state) => [
      ...(!state.a ? [{ id: "a" }] : []),
      ...(!state.b ? [{ id: "b" }] : [])
    ],
    step: (state, action) => ({
      ...state,
      value: action.id === "a" ? 1 : 2,
      [action.id]: true
    }),
    independent: () => true
  };
  const result = auditIndependence(model);
  assert.equal(result.status, "invalid-independence");
  assert.match(result.counterexample.reason, /commuting diamond/);
});

test("an incomplete graph audit is inconclusive", () => {
  const result = auditIndependence(modelWithTwoIndependentFlags(), { maxStates: 2 });
  assert.equal(result.status, "inconclusive");
  assert.equal(result.complete, false);
});

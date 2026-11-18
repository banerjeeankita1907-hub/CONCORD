import test from "node:test";
import assert from "node:assert/strict";
import { explore } from "../src/engine.js";
import { exploreWithSleepSets } from "../src/por.js";

function independentTwoFlagModel() {
  return {
    initialState: { a: false, b: false },
    enabled: (state) => [
      ...(!state.a ? [{ id: "a", flag: "a" }] : []),
      ...(!state.b ? [{ id: "b", flag: "b" }] : [])
    ],
    step: (state, transition) => ({ ...state, [transition.flag]: true }),
    independent: (left, right) => left.id !== right.id,
    invariant: (state) => !(state.a && state.b)
  };
}

test("sleep sets preserve a safety counterexample", () => {
  const model = independentTwoFlagModel();
  const full = explore(model);
  const reduced = exploreWithSleepSets(model);
  assert.equal(full.status, "counterexample");
  assert.equal(reduced.status, "counterexample");
  assert.equal(reduced.counterexample.depth, 2);
});

test("sleep sets prune redundant schedules for independent actions", () => {
  const model = independentTwoFlagModel();
  model.invariant = () => true;
  const full = explore(model);
  const reduced = exploreWithSleepSets(model);
  assert.equal(full.status, "safe-within-bounds");
  assert.equal(reduced.status, "safe-within-bounds");
  assert.ok(reduced.transitions < full.transitions);
  assert.ok(reduced.sleepPruned > 0);
});

test("POR rejects a claimed independence that violates the diamond property", () => {
  const model = {
    initialState: { x: 0, a: false, b: false },
    enabled: (state) => [
      ...(!state.a ? [{ id: "a" }] : []),
      ...(!state.b ? [{ id: "b" }] : [])
    ],
    step: (state, transition) => ({
      ...state,
      x: transition.id === "a" ? 1 : 2,
      [transition.id]: true
    }),
    independent: () => true,
    invariant: () => true
  };
  assert.throws(() => exploreWithSleepSets(model), /do not commute/);
});

test("POR requires an explicit independence relation", () => {
  assert.throws(() => exploreWithSleepSets({
    initialState: {},
    enabled: () => [],
    step: (state) => state
  }), /independent/);
});

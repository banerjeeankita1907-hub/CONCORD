import test from "node:test";
import assert from "node:assert/strict";
import { canonicalJSON, explore } from "../src/engine.js";

test("canonical JSON ignores object insertion order", () => {
  assert.equal(canonicalJSON({ z: 1, a: { y: 2, x: 3 } }), canonicalJSON({ a: { x: 3, y: 2 }, z: 1 }));
});

test("breadth-first exploration returns a shortest invariant counterexample", () => {
  const model = {
    initialState: { value: 0 },
    enabled: (state) => state.value < 3 ? [{ id: "increment" }] : [],
    step: (state) => ({ value: state.value + 1 }),
    invariant: (state) => state.value < 2
  };
  const result = explore(model);
  assert.equal(result.status, "counterexample");
  assert.equal(result.counterexample.depth, 2);
  assert.deepEqual(result.counterexample.trace.map((item) => item.id), ["increment", "increment"]);
});

test("safe finite transition systems are exhaustively explored", () => {
  const model = {
    initialState: { a: false, b: false },
    enabled: (state) => [
      ...(!state.a ? [{ id: "a" }] : []),
      ...(!state.b ? [{ id: "b" }] : [])
    ],
    step: (state, transition) => ({ ...state, [transition.id]: true }),
    invariant: () => true
  };
  const result = explore(model);
  assert.equal(result.status, "safe-within-bounds");
  assert.equal(result.complete, true);
  assert.equal(result.exploredStates, 4);
  assert.equal(result.terminalStates, 1);
});

test("state bound produces inconclusive rather than a false proof", () => {
  const model = {
    initialState: { value: 0 },
    enabled: () => [{ id: "increment" }],
    step: (state) => ({ value: state.value + 1 }),
    invariant: () => true
  };
  const result = explore(model, { maxStates: 4, maxDepth: 20 });
  assert.equal(result.status, "inconclusive");
  assert.equal(result.complete, false);
});

test("rejects non-JSON states and duplicate transition identifiers", () => {
  assert.throws(() => canonicalJSON({ value: undefined }), /Undefined/);
  const duplicateIds = {
    initialState: {},
    enabled: () => [{ id: "same" }, { id: "same" }],
    step: (state) => state
  };
  assert.throws(() => explore(duplicateIds), /Duplicate transition id/);
});

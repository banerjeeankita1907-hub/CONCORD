import test from "node:test";
import assert from "node:assert/strict";
import { explore, replayTrace } from "../src/engine.js";

test("BFS counterexample trace replays to the same invariant violation", () => {
  const model = {
    initialState: { value: 0 },
    enabled: (state) => state.value < 2 ? [{ id: "inc" }] : [],
    step: (state) => ({ value: state.value + 1 }),
    invariant: (state) => state.value < 2
  };
  const result = explore(model);
  const replay = replayTrace(model, result.counterexample.trace);
  assert.equal(replay.valid, true);
  assert.equal(replay.violatesInvariant, true);
  assert.deepEqual(replay.state, result.counterexample.state);
});

test("replay rejects a trace whose transition is not enabled", () => {
  const model = {
    initialState: { done: false },
    enabled: (state) => state.done ? [] : [{ id: "finish" }],
    step: () => ({ done: true }),
    invariant: () => true
  };
  const replay = replayTrace(model, ["finish", "finish"]);
  assert.equal(replay.valid, false);
  assert.equal(replay.failedAt, 1);
});

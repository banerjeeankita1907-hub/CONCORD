import test from "node:test";
import assert from "node:assert/strict";
import { compareExplorers } from "../src/differential.js";

const model = {
  initialState: { left: false, right: false },
  enabled: (state) => [
    ...(!state.left ? [{ id: "left" }] : []),
    ...(!state.right ? [{ id: "right" }] : [])
  ],
  step: (state, action) => ({ ...state, [action.id]: true }),
  independent: (left, right) => left.id !== right.id,
  invariant: (state) => !(state.left && state.right)
};

test("differential harness returns a bounded agreement certificate", () => {
  const result = compareExplorers(model);
  assert.equal(result.status, "certified-bounded-agreement");
  assert.equal(result.sameSafetyOutcome, true);
  assert.equal(result.auditComplete, true);
  assert.equal(result.baseline.status, "counterexample");
  assert.equal(result.reduced.status, "counterexample");
});

test("differential harness does not certify an incomplete graph audit", () => {
  const result = compareExplorers(model, { auditMaxStates: 2 });
  assert.equal(result.status, "agreement-but-inconclusive");
  assert.equal(result.auditComplete, false);
});

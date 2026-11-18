import test from "node:test";
import assert from "node:assert/strict";
import { explore } from "../src/engine.js";
import { exploreWithSleepSets } from "../src/por.js";
import { allValuesEqual, createReplicatedRegisterModel } from "../src/replicated-register.js";

const replicas = [
  { id: "r0", writes: ["alpha"] },
  { id: "r1", writes: ["beta"] }
];

test("Lamport last-writer-wins register converges under all bounded delivery orders", () => {
  const model = createReplicatedRegisterModel({ replicas, merge: "lww" });
  const result = explore(model, { maxStates: 10_000 });
  assert.equal(result.status, "safe-within-bounds");
  assert.equal(result.complete, true);
  assert.ok(result.terminalStates >= 1);
});

test("arrival-order-wins merge has a concrete non-convergence counterexample", () => {
  const model = createReplicatedRegisterModel({ replicas, merge: "arrival" });
  const result = explore(model, { maxStates: 10_000 });
  assert.equal(result.status, "counterexample");
  assert.match(result.counterexample.reason, /did not converge/);
  assert.equal(allValuesEqual(result.counterexample.state.replicas), false);
});

test("LWW convergence survives bounded duplicate delivery", () => {
  const model = createReplicatedRegisterModel({ replicas, merge: "lww", maxDuplicates: 1 });
  const result = explore(model, { maxStates: 20_000 });
  assert.equal(result.status, "safe-within-bounds");
  assert.equal(result.complete, true);
});

test("POR validates and reduces the replicated-register schedule space", () => {
  const model = createReplicatedRegisterModel({ replicas, merge: "lww" });
  const full = explore(model, { maxStates: 10_000 });
  const reduced = exploreWithSleepSets(model, { maxConfigurations: 10_000 });
  assert.equal(full.status, "safe-within-bounds");
  assert.equal(reduced.status, "safe-within-bounds");
  assert.ok(reduced.exploredConfigurations <= full.exploredStates);
});


test("permanent message loss is an explicit counterexample to eventual convergence", () => {
  const model = createReplicatedRegisterModel({ replicas, merge: "lww", maxDrops: 1 });
  const result = explore(model, { maxStates: 20_000 });
  assert.equal(result.status, "counterexample");
  assert.ok(result.counterexample.state.dropCount > 0);
  assert.equal(allValuesEqual(result.counterexample.state.replicas), false);
});

test("independence audit validates the bounded duplicate-and-drop event model", async () => {
  const { auditIndependence } = await import("../src/independence-audit.js");
  const model = createReplicatedRegisterModel({
    replicas,
    merge: "lww",
    maxDuplicates: 1,
    maxDrops: 1
  });
  const audit = auditIndependence(model, { maxStates: 20_000 });
  assert.equal(audit.status, "certified-on-bounded-graph", JSON.stringify(audit));
});

test("replicated model rejects invalid inputs", () => {
  assert.throws(() => createReplicatedRegisterModel({ replicas: [{ id: "r0", writes: [] }] }), /at least two/);
  assert.throws(() => createReplicatedRegisterModel({ replicas: [{ id: "r0", writes: [] }, { id: "r1", writes: [] }], merge: "mystery" }), /merge/);
});

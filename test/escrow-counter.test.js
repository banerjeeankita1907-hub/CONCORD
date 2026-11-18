import test from "node:test";
import assert from "node:assert/strict";
import { explore } from "../src/engine.js";
import { compareExplorers } from "../src/differential.js";
import { auditIndependence } from "../src/independence-audit.js";
import { createEscrowCounterModel, createNaiveBoundedCounterModel } from "../src/escrow-counter.js";

const escrow = () => createEscrowCounterModel({
  capacity: 2,
  replicas: [
    {
      id: "r0",
      rights: 2,
      program: [
        { type: "transfer", to: "r1", amount: 1 },
        { type: "increment" }
      ]
    },
    {
      id: "r1",
      rights: 0,
      program: [{ type: "increment" }]
    }
  ]
});

test("escrow rights preserve a global bound across all transfer/delivery orders", () => {
  const model = escrow();
  const result = explore(model, { maxStates: 20_000 });
  assert.equal(result.status, "safe-within-bounds");
  assert.equal(result.complete, true);
  assert.ok(result.terminalStates >= 1);
});

test("escrow independence relation passes exhaustive bounded audit", () => {
  const audit = auditIndependence(escrow(), { maxStates: 20_000 });
  assert.equal(audit.status, "certified-on-bounded-graph");
});

test("differential reference and POR engines agree on the escrow model", () => {
  const result = compareExplorers(escrow(), { maxStates: 20_000, maxConfigurations: 20_000 });
  assert.equal(result.status, "certified-bounded-agreement");
});

test("naive per-replica quota violates a global counter bound", () => {
  const model = createNaiveBoundedCounterModel({
    capacity: 1,
    replicas: ["r0", "r1"],
    maxLocalIncrements: 1
  });
  const result = explore(model);
  assert.equal(result.status, "counterexample");
  assert.equal(result.counterexample.depth, 2);
  assert.match(result.counterexample.reason, /over-allocated/);
});

test("escrow model rejects non-conserving initial allocations and unknown peers", () => {
  assert.throws(() => createEscrowCounterModel({
    capacity: 2,
    replicas: [
      { id: "r0", rights: 1, program: [] },
      { id: "r1", rights: 0, program: [] }
    ]
  }), /sum exactly/);
  assert.throws(() => createEscrowCounterModel({
    capacity: 1,
    replicas: [
      { id: "r0", rights: 1, program: [{ type: "transfer", to: "missing", amount: 1 }] },
      { id: "r1", rights: 0, program: [] }
    ]
  }), /unknown transfer destination/);
});

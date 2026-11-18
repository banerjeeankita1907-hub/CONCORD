import test from "node:test";
import assert from "node:assert/strict";
import { checkLinearizability } from "../src/linearizability.js";

const registerSpec = {
  initialState: { value: 0 },
  apply(state, operation, args) {
    if (operation === "write") {
      state.value = args.value;
      return { state, result: "ok" };
    }
    if (operation === "read") return { state, result: state.value };
    throw new Error(`unknown operation: ${operation}`);
  }
};

test("accepts a legal overlapping register history", () => {
  const history = [
    { id: "w1", client: "c1", invoke: 0, complete: 4, operation: "write", args: { value: 1 }, result: "ok" },
    { id: "w2", client: "c2", invoke: 1, complete: 3, operation: "write", args: { value: 2 }, result: "ok" },
    { id: "r1", client: "c3", invoke: 5, complete: 6, operation: "read", args: null, result: 1 }
  ];
  const result = checkLinearizability(history, registerSpec);
  assert.equal(result.status, "linearizable");
  assert.deepEqual(result.linearization, ["w2", "w1", "r1"]);
});

test("rejects a read that cannot follow the real-time-ordered writes", () => {
  const history = [
    { id: "w1", client: "c1", invoke: 0, complete: 1, operation: "write", args: { value: 1 }, result: "ok" },
    { id: "w2", client: "c2", invoke: 2, complete: 3, operation: "write", args: { value: 2 }, result: "ok" },
    { id: "r1", client: "c3", invoke: 4, complete: 5, operation: "read", args: null, result: 1 }
  ];
  const result = checkLinearizability(history, registerSpec);
  assert.equal(result.status, "not-linearizable");
  assert.equal(result.linearizable, false);
});

test("incomplete search is reported as inconclusive", () => {
  const history = Array.from({ length: 4 }, (_, i) => ({
    id: `w${i}`, client: `c${i}`, invoke: 0, complete: 2,
    operation: "write", args: { value: i + 1 }, result: "ok"
  }));
  const result = checkLinearizability(history, registerSpec, { maxNodes: 1 });
  assert.equal(result.status, "inconclusive");
});

test("rejects duplicate operation identifiers", () => {
  const operation = { id: "same", invoke: 0, complete: 1, operation: "read", result: 0 };
  assert.throws(() => checkLinearizability([operation, operation], registerSpec), /duplicate/);
});

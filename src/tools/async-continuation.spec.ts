import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_RECOMMENDED_POLL_SECONDS,
  asyncContinuation,
} from "./async-continuation.js";

test("asyncContinuation never emits non-finite polling handoff values", () => {
  for (const pollAfterMs of [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ]) {
    const continuation = asyncContinuation({
      kind: "operation",
      id: "op_1",
      pollAfterMs,
    });

    assert.equal(continuation.pollAfterSeconds, 10);
    assert.equal(Number.isFinite(continuation.pollAfterSeconds), true);
    assert.equal(
      continuation.maxRecommendedPollSeconds,
      MAX_RECOMMENDED_POLL_SECONDS,
    );
    assert.deepEqual(continuation.nextInput, { id: "op_1" });
  }
});

test("asyncContinuation clamps negative polling hints to one second", () => {
  const continuation = asyncContinuation({
    kind: "search",
    id: "search_1",
    pollAfterMs: -500,
  });

  assert.equal(
    continuation.message,
    'The request is still running. Poll get_search_result with searchId "search_1" until it reaches a terminal status, or until maxRecommendedPollSeconds elapses. Do not reissue the original tool call; that can start duplicate paid work.',
  );
  assert.deepEqual(continuation, {
    status: "still_running",
    still_running: true,
    searchId: "search_1",
    nextTool: "get_search_result",
    nextInput: { id: "search_1" },
    pollAfterSeconds: 1,
    maxRecommendedPollSeconds: MAX_RECOMMENDED_POLL_SECONDS,
    message: continuation.message,
  });
});

test("asyncContinuation echoes durable recovery keys", () => {
  const continuation = asyncContinuation({
    kind: "operation",
    id: "op_1",
    idempotencyKey: "idem_1",
    correlationKey: "corr_1",
  });

  assert.equal(continuation.idempotencyKey, "idem_1");
  assert.equal(continuation.correlationKey, "corr_1");
  assert.match(String(continuation.message), /Do not reissue/);
});

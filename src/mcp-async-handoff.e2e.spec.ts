import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { registerPrimitiveTools } from "./tools/primitives/register.js";
import { registerWorkflowTools } from "./tools/workflows/register.js";

function assertSupportedPollAfterSeconds(value: unknown): void {
  assert.ok(typeof value === "number");
  assert.ok(Number.isFinite(value));
  assert.ok(
    [2, 5, 10].includes(value),
    `expected pollAfterSeconds to use a supported polling backoff, got ${String(value)}`,
  );
}

test("MCP client can hand off and resume a forced-timeout target-account workflow", async (t) => {
  const requests: Array<{ method: string; path: string }> = [];
  const server = new McpServer({ name: "test-thehog-mcp", version: "1.0.0" });
  const coreClient = {
    request: async (request: { method: string; path: string }) => {
      requests.push(request);
      if (
        request.method === "POST" &&
        request.path === "/api/v1/people/search"
      ) {
        return {
          data: { operationId: "op_people", status: "queued" },
          status: 202,
          requestId: "req_start",
        };
      }
      if (
        request.method === "GET" &&
        request.path === "/api/operations/op_people"
      ) {
        const priorPolls = requests.filter(
          (item) =>
            item.method === "GET" && item.path === "/api/operations/op_people",
        ).length;
        if (priorPolls === 1) {
          return {
            data: { id: "op_people", status: "running" },
            status: 200,
            requestId: "req_poll",
          };
        }
        return {
          data: {
            id: "op_people",
            status: "succeeded",
            result: {
              data: [{ name: "Ada Example", company: "Walmart" }],
            },
          },
          status: 200,
          requestId: "req_resume",
        };
      }
      throw new Error(`Unexpected request ${request.method} ${request.path}`);
    },
    createIdempotencyKey: () => {
      throw new Error("random idempotency keys should not be used");
    },
  };
  const toolOptions = { getClient: () => coreClient as never };
  registerPrimitiveTools(server, toolOptions);
  registerWorkflowTools(server, toolOptions);

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  t.after(() => {
    void client.close();
  });
  await client.connect(clientTransport as Transport);

  const handoff = await client.callTool({
    name: "find_people_at_target_accounts",
    arguments: {
      companyNames: ["Walmart"],
      titles: ["Global Mobility Manager"],
      waitForResult: true,
      timeoutSeconds: 1,
    },
  });
  const handoffPayload = parseTextPayload(handoff);
  assert.equal(handoffPayload.ok, true);
  assert.equal(handoffPayload.status, "still_running");
  assert.equal(handoffPayload.still_running, true);
  assert.equal(handoffPayload.operationId, "op_people");
  assert.equal(handoffPayload.nextTool, "get_operation");
  assert.deepEqual(handoffPayload.nextInput, { id: "op_people" });
  assertSupportedPollAfterSeconds(handoffPayload.pollAfterSeconds);
  assert.equal(handoffPayload.maxRecommendedPollSeconds, 180);
  assert.match(String(handoffPayload.message), /Do not reissue/);
  assert.match(
    String(handoffPayload.idempotencyKey),
    /^find_people_at_target_accounts_people_[a-f0-9]{32}$/,
  );
  assert.equal(handoffPayload.correlationKey, handoffPayload.idempotencyKey);

  const resume = await client.callTool({
    name: String(handoffPayload.nextTool),
    arguments: handoffPayload.nextInput as Record<string, unknown>,
  });
  const resumePayload = parseTextPayload(resume);
  assert.equal(resumePayload.ok, true);
  assert.deepEqual(resumePayload.response, {
    id: "op_people",
    status: "succeeded",
    result: { data: [{ name: "Ada Example", company: "Walmart" }] },
  });
});

function parseTextPayload(result: unknown): Record<string, unknown> {
  assert.ok(result && typeof result === "object");
  const content = (result as { content?: unknown }).content;
  assert.ok(Array.isArray(content));
  const text = content.find(
    (item): item is { type: "text"; text: string } =>
      item !== null &&
      typeof item === "object" &&
      (item as { type?: unknown }).type === "text" &&
      typeof (item as { text?: unknown }).text === "string",
  )?.text;
  assert.ok(text);
  return JSON.parse(text) as Record<string, unknown>;
}

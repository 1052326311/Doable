import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "./types.js";
import { createProcessEvent } from "./event-processor.js";
import { ChannelTokenRouter } from "../../ai/sse-mapper.js";
import { finalizeLeadingResponse } from "./final-response.js";

function fixture() {
  const state = createInitialState();
  const frames: Array<{ type: string; data: unknown }> = [];
  const stream = {
    writeSSE: async ({ data }: { data: string }) => {
      frames.push(JSON.parse(data));
    },
  } as unknown as import("hono/streaming").SSEStreamingApi;
  const process = createProcessEvent(
    stream, state, new ChannelTokenRouter(), "regression-test", "test-user",
    "test-message", "build", () => {}, () => {}, () => "test-session",
  );
  const emit = (type: string, data: Record<string, unknown>) =>
    process({ type, data } as Parameters<typeof process>[0]);
  return { state, frames, emit };
}

test("SDK tool round-trip and final deltas preserve answer and native reasoning", () => {
  const { state, frames, emit } = fixture();
  emit("assistant.reasoning_delta", { deltaContent: "Native reasoning." });
  emit("assistant.message_delta", { messageId: "m1", deltaContent: "I will inspect the files." });
  emit("tool.execution_start", { toolName: "read_file", toolCallId: "t1", arguments: { path: "package.json" } });
  emit("tool.execution_complete", { toolName: "read_file", toolCallId: "t1", success: true });
  emit("assistant.message_delta", { messageId: "m2", deltaContent: "这是一个 React 项目。" });
  emit("assistant.message", { messageId: "m2", content: "这是一个 React 项目。" });
  emit("session.idle", {});
  assert.equal(state.hadToolCalls, true);
  assert.ok(frames.some(frame => frame.type === "tool_result"));
  assert.equal(finalizeLeadingResponse(state), "这是一个 React 项目。");
  assert.equal(state.assistantContent, "这是一个 React 项目。");
  assert.equal(state.assistantThinking, "Native reasoning.I will inspect the files.");
});

test("tagged reasoning after a tool is not promoted with the final answer", () => {
  const { state, emit } = fixture();
  emit("tool.execution_complete", { toolName: "read_file", success: true });
  emit("assistant.message_delta", { messageId: "m1", deltaContent: "<think>Internal reasoning.</think>Final answer." });
  assert.equal(finalizeLeadingResponse(state), "Final answer.");
  assert.equal(state.assistantThinking, "Internal reasoning.");
});

test("text followed by another tool call is not a final answer", () => {
  const { state, emit } = fixture();
  emit("assistant.message_delta", { messageId: "m1", deltaContent: "I need another file." });
  emit("tool.execution_start", { toolName: "read_file", toolCallId: "t1" });
  emit("tool.execution_complete", { toolName: "read_file", toolCallId: "t1", success: true });
  assert.equal(finalizeLeadingResponse(state), "");
  assert.equal(state.assistantContent, "");
  assert.equal(state.assistantThinking, "I need another file.");
});

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
    stream,
    state,
    new ChannelTokenRouter(),
    "regression-test",
    "test-user",
    "test-message",
    "build",
    () => {},
    () => {},
    () => "test-session",
  );
  const emit = (type: string, data: Record<string, unknown>) =>
    process({ type, data } as Parameters<typeof process>[0]);
  return { state, frames, emit };
}

test("SDK tool round-trip and final deltas preserve answer and native reasoning", () => {
  const { state, frames, emit } = fixture();
  emit("assistant.reasoning_delta", { deltaContent: "Native reasoning." });
  emit("assistant.message_delta", {
    messageId: "m1",
    deltaContent: "I will inspect the files.",
  });
  emit("tool.execution_start", {
    toolName: "read_file",
    toolCallId: "t1",
    arguments: { path: "package.json" },
  });
  emit("tool.execution_complete", {
    toolName: "read_file",
    toolCallId: "t1",
    success: true,
  });
  emit("assistant.message_delta", {
    messageId: "m2",
    deltaContent: "这是一个 React 项目。",
  });
  emit("assistant.message", {
    messageId: "m2",
    content: "这是一个 React 项目。",
  });
  emit("session.idle", {});
  assert.equal(state.hadToolCalls, true);
  assert.ok(frames.some((frame) => frame.type === "tool_result"));
  assert.equal(finalizeLeadingResponse(state), "这是一个 React 项目。");
  assert.equal(state.assistantContent, "这是一个 React 项目。");
  assert.equal(
    state.assistantThinking,
    "Native reasoning.I will inspect the files.",
  );
});

test("tagged reasoning after a tool is not promoted with the final answer", () => {
  const { state, emit } = fixture();
  emit("tool.execution_complete", { toolName: "read_file", success: true });
  emit("assistant.message_delta", {
    messageId: "m1",
    deltaContent: "<think>Internal reasoning.</think>Final answer.",
  });
  emit("assistant.message", {
    messageId: "m1",
    content: "<think>Internal reasoning.</think>Final answer.",
  });
  assert.equal(finalizeLeadingResponse(state), "Final answer.");
  assert.equal(state.assistantThinking, "Internal reasoning.");
});

test("text followed by another tool call is not a final answer", () => {
  const { state, emit } = fixture();
  emit("assistant.message_delta", {
    messageId: "m1",
    deltaContent: "I need another file.",
  });
  emit("tool.execution_start", { toolName: "read_file", toolCallId: "t1" });
  emit("tool.execution_complete", {
    toolName: "read_file",
    toolCallId: "t1",
    success: true,
  });
  assert.equal(finalizeLeadingResponse(state), "");
  assert.equal(state.assistantContent, "");
  assert.equal(state.assistantThinking, "I need another file.");
});

test("complete-only final SDK message is not hidden by prior reasoning length", () => {
  const { state, emit } = fixture();
  emit("assistant.reasoning_delta", {
    deltaContent: "Long reasoning from an earlier tool round. ".repeat(20),
  });
  emit("tool.execution_complete", { toolName: "read_file", success: true });
  emit("assistant.message", { messageId: "final", content: "Final answer." });
  assert.equal(finalizeLeadingResponse(state), "Final answer.");
  assert.equal(state.assistantContent, "Final answer.");
});

test("thinking markers split across deltas stay out of the answer", () => {
  const { state, emit } = fixture();
  for (const deltaContent of ["<thi", "nk>Reasoning", "</thi", "nk>Answer."]) {
    emit("assistant.message_delta", { messageId: "final", deltaContent });
  }
  emit("assistant.message", {
    messageId: "final",
    content: "<think>Reasoning</think>Answer.",
  });
  assert.equal(finalizeLeadingResponse(state), "Answer.");
  assert.equal(state.assistantContent, "Answer.");
  assert.equal(state.assistantThinking, "Reasoning");
});

test("catch-up uses raw offsets when sanitization expands split jargon", () => {
  const { state, emit } = fixture();
  const content = "Read package.json. Final answer.";
  for (const deltaContent of ["Read pack", "age.json. Final answer."]) {
    emit("assistant.message_delta", { messageId: "final", deltaContent });
  }
  emit("assistant.message", { messageId: "final", content });
  assert.equal(finalizeLeadingResponse(state), content);
});

test("catch-up sanitizes only a genuinely missing raw suffix", () => {
  const { state, emit } = fixture();
  emit("assistant.message_delta", {
    messageId: "final",
    deltaContent: "Read package.json.",
  });
  emit("assistant.message", {
    messageId: "final",
    content: "Read package.json. Final answer.",
  });
  assert.equal(
    finalizeLeadingResponse(state),
    "Read project configuration. Final answer.",
  );
});

test("named SDK results clear pending completion and preserve stable invocation IDs", () => {
 const {state,frames,emit}=fixture();
 emit("tool.execution_start",{toolName:"read_file",toolCallId:"invocation",arguments:{path:"a"}});
 emit("tool.execution_complete",{toolName:"read_file",toolCallId:"invocation",success:true,result:{content:"ok"}});
 assert.deepEqual(state.pendingToolNames,[]);
 const result=frames.find(f=>f.type==="tool_result")?.data as Record<string,unknown>;
 assert.equal(result.toolCallId,"invocation");assert.equal(result.success,true);
});

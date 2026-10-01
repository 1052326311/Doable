import assert from "node:assert/strict";
import test from "node:test";
import { CopilotEngine } from "./copilot-engine.js";
import type { CopilotSessionConfig } from "../engine-types.js";

test("cached session callbacks target the current turn, not its original stream", async () => {
  const engine = new CopilotEngine();
  const calls: string[] = [];
  const config: Partial<CopilotSessionConfig> = {
    toolProgress: { onToolEnd: () => { calls.push("old"); } },
  };
  // Represents the config captured by the SDK hook at create/resume time.
  const hook = () => config.toolProgress?.onToolEnd?.("read_file", {}, {});
  const internals = engine as unknown as {
    sessionConfigs: Map<string, Partial<CopilotSessionConfig>>;
    engines: Map<string, unknown>;
  };
  internals.sessionConfigs.set("cached", config);
  internals.engines.set("cached", {});
  assert.equal(engine.bindToolProgress("missing", {}), false);
  assert.equal(engine.bindToolProgress("cached", {
    onToolEnd: () => { calls.push("current"); },
  }), true);
  await hook();
  assert.deepEqual(calls, ["current"]);
  internals.engines.delete("cached");
  assert.equal(engine.bindToolProgress("cached", {}), false);
});

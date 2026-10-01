/** Normalize SDK and MCP result envelopes before any display or persistence. */
export function toolSucceeded(result: unknown, explicit?: unknown): boolean {
  if (explicit === false) return false;
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (r.success === false || r.isError === true || r.error) return false;
    for (const payload of [
      r.output,
      r.textResultForLlm,
      ...(Array.isArray(r.content)
        ? r.content.map((item: any) => item?.text)
        : []),
    ]) {
      if (typeof payload === "string") {
        try {
          const parsed = JSON.parse(payload);
          if (parsed && typeof parsed === "object" && !toolSucceeded(parsed))
            return false;
        } catch {
          /* Plain output is not a machine status. */
        }
      }
    }
    if (r.exitCode !== undefined && r.exitCode !== 0) return false;
  }
  return true;
}

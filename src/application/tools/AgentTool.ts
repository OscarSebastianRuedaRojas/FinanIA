import { z } from "zod";
import { DataSourceError } from "../../ports/MicroBusinessDataPort.js";
import { AgentTool, ToolErrorCode, ToolResult } from "../../ports/AgentToolPort.js";

export type { AgentTool, AgentToolset, ToolErrorCode, ToolResult } from "../../ports/AgentToolPort.js";

export class ToolError extends Error {
  constructor(public readonly code: ToolErrorCode, message: string) {
    super(message);
    this.name = "ToolError";
  }
}

export function toolFailure(code: ToolErrorCode, message: string): ToolResult {
  return { ok: false, error: { code, message } };
}

export function defineTool<S extends z.ZodType>(definition: {
  name: string;
  description: string;
  schema: S;
  run: (args: z.output<S>) => Promise<unknown> | unknown;
}): AgentTool {
  const { $schema, ...parameters } = z.toJSONSchema(definition.schema, { io: "input" }) as Record<string, unknown>;

  return {
    name: definition.name,
    description: definition.description,
    parameters,
    async execute(args: unknown): Promise<ToolResult> {
      const parsed = definition.schema.safeParse(args ?? {});
      if (!parsed.success) {
        return toolFailure("INVALID_ARGUMENTS", z.prettifyError(parsed.error));
      }
      try {
        return { ok: true, data: await definition.run(parsed.data) };
      } catch (error: any) {
        if (error instanceof ToolError) return toolFailure(error.code, error.message);
        if (error instanceof DataSourceError) return toolFailure("DATA_SOURCE_ERROR", error.message);
        return toolFailure("TOOL_EXECUTION_ERROR", error?.message ?? String(error));
      }
    },
  };
}

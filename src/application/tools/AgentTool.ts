import { z } from "zod";
import { DataSourceError } from "../../ports/MicroBusinessDataPort.js";

export type ToolErrorCode =
  | "INVALID_ARGUMENTS"
  | "BUSINESS_NOT_FOUND"
  | "INSUFFICIENT_PEERS"
  | "DATA_SOURCE_ERROR"
  | "UNKNOWN_TOOL"
  | "TOOL_EXECUTION_ERROR";

export type ToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: ToolErrorCode; message: string } };

// Herramienta que el agente decide invocar; nunca lanza, siempre devuelve un ToolResult
export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(args: unknown): Promise<ToolResult>;
}

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

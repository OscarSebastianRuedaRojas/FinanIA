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

// Conjunto de herramientas disponible en una auditoría y el contexto que se le explica al LLM
export interface AgentToolset {
  tools: AgentTool[];
  context: string;
}

import { GoalReport } from "../domain/entities/Goal.js";
import { Telemetry } from "../domain/entities/Financial.js";
import { AgentToolset } from "./AgentToolPort.js";

export interface GoalOutcome extends GoalReport {
  // false cuando el modelo no devolvió el informe en el formato pedido y se conserva su texto
  structured: boolean;
  forcedFinalAnswer: boolean;
  telemetry: Telemetry;
}

export interface GoalAgentPort {
  pursueGoal(goal: string, toolset: AgentToolset): Promise<GoalOutcome>;
}

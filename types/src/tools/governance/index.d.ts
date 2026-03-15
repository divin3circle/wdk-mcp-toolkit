export function setAgentPolicy(
  server: import("../../server.js").WdkMcpServer,
): void;
export function upsertGoal(
  server: import("../../server.js").WdkMcpServer,
): void;
export function listGoals(server: import("../../server.js").WdkMcpServer): void;
export function analyzeGoalAgainstPolicy(
  server: import("../../server.js").WdkMcpServer,
): void;
export const GOVERNANCE_TOOLS: import("../../server.js").ToolFunction[];

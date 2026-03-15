export function createCronJob(
  server: import("../../server.js").WdkMcpServer,
): void;
export function updateCronJob(
  server: import("../../server.js").WdkMcpServer,
): void;
export function deleteCronJob(
  server: import("../../server.js").WdkMcpServer,
): void;
export function listCronJobs(
  server: import("../../server.js").WdkMcpServer,
): void;
export { createCronJob as addCronJob };
export { updateCronJob as editCronJob };
export { deleteCronJob as removeCronJob };
export const SCHEDULER_TOOLS: import("../../server.js").ToolFunction[];

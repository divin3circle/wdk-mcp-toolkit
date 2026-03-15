// Copyright 2025 Tether Operations Limited
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
"use strict";

import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import {
  STORAGE_FILES,
  updateStore,
  appendAuditLog,
  assertAgentMutationAllowed,
  assertOwnerHasPolicy,
  validateOpenClawCronArgs,
} from "../../utils/agentControlStore.js";

const execFile = promisify(execFileCallback);

/** @typedef {import('../../server.js').WdkMcpServer} WdkMcpServer */

const schedulerDefault = {
  version: 1,
  jobs: [],
};

export function updateCronJob(server) {
  const definition = {
    title: "Update Cron Job",
    description: `Update an existing cron job using openclaw and refresh metadata in ~/.wallets/scheduler.json.

    This runs: openclaw cron edit <jobId> ...commandArgs`,
    inputSchema: z.object({
      ownerId: z.string().min(1).describe("Tenant/user owner id"),
      jobId: z.string().min(1).describe("Job id to update"),
      schedule: z
        .string()
        .optional()
        .describe("Optional updated cron schedule"),
      task: z.string().optional().describe("Optional updated task description"),
      status: z
        .enum(["active", "paused"])
        .optional()
        .describe("Optional local status update"),
      commandArgs: z
        .array(z.string())
        .optional()
        .default([])
        .describe("Additional args passed to openclaw cron edit after <jobId>"),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  };

  const handler = async ({
    ownerId,
    jobId,
    schedule,
    task,
    status,
    commandArgs = [],
  }) => {
    try {
      assertAgentMutationAllowed("cron.update", "agent");
      await assertOwnerHasPolicy(ownerId);
      validateOpenClawCronArgs("edit", commandArgs);

      const { stdout, stderr } = await execFile(
        "openclaw",
        ["cron", "edit", jobId, ...commandArgs],
        {
          timeout: 20000,
          windowsHide: true,
          maxBuffer: 1024 * 1024,
        },
      );

      let updatedRecord = null;

      await updateStore(STORAGE_FILES.scheduler, schedulerDefault, (store) => {
        const jobs = Array.isArray(store.jobs) ? [...store.jobs] : [];
        const index = jobs.findIndex(
          (item) => item.jobId === jobId && item.ownerId === ownerId,
        );

        if (index === -1) {
          throw new Error(
            `Cron job not found for ownerId=${ownerId} and jobId=${jobId}.`,
          );
        }

        const now = new Date().toISOString();
        const nextRecord = {
          ...jobs[index],
          schedule: schedule || jobs[index].schedule,
          task: task || jobs[index].task,
          status: status || jobs[index].status,
          commandArgs,
          updatedAt: now,
        };

        jobs[index] = nextRecord;
        updatedRecord = nextRecord;

        return { version: 1, jobs };
      });

      await appendAuditLog({ action: "cron.update", ownerId, jobId });

      const result = {
        ...updatedRecord,
        openclaw: {
          stdout: stdout?.trim() || "",
          stderr: stderr?.trim() || "",
        },
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          { type: "text", text: `Error updating cron job: ${error.message}` },
        ],
      };
    }
  };

  server.registerTool("editCronJob", definition, handler);
  server.registerTool("updateCronJob", definition, handler);
}

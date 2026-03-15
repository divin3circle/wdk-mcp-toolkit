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

export function deleteCronJob(server) {
  const definition = {
    title: "Delete Cron Job",
    description: `Delete a cron job using openclaw and remove metadata from ~/.wallets/scheduler.json.

    This runs: openclaw cron remove <jobId> ...commandArgs`,
    inputSchema: z.object({
      ownerId: z.string().min(1).describe("Tenant/user owner id"),
      jobId: z.string().min(1).describe("Job id to delete"),
      commandArgs: z
        .array(z.string())
        .optional()
        .default([])
        .describe(
          "Additional args passed to openclaw cron remove after <jobId>",
        ),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  };

  const handler = async ({ ownerId, jobId, commandArgs = [] }) => {
    try {
      assertAgentMutationAllowed("cron.delete", "agent");
      await assertOwnerHasPolicy(ownerId);
      validateOpenClawCronArgs("remove", commandArgs);

      const { stdout, stderr } = await execFile(
        "openclaw",
        ["cron", "remove", jobId, ...commandArgs],
        {
          timeout: 20000,
          windowsHide: true,
          maxBuffer: 1024 * 1024,
        },
      );

      await updateStore(STORAGE_FILES.scheduler, schedulerDefault, (store) => {
        const jobs = Array.isArray(store.jobs) ? [...store.jobs] : [];
        const filtered = jobs.filter(
          (item) => !(item.jobId === jobId && item.ownerId === ownerId),
        );

        if (filtered.length === jobs.length) {
          throw new Error(
            `Cron job not found for ownerId=${ownerId} and jobId=${jobId}.`,
          );
        }

        return { version: 1, jobs: filtered };
      });

      await appendAuditLog({ action: "cron.delete", ownerId, jobId });

      const result = {
        ownerId,
        jobId,
        deleted: true,
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
          { type: "text", text: `Error deleting cron job: ${error.message}` },
        ],
      };
    }
  };

  server.registerTool("removeCronJob", definition, handler);
  server.registerTool("deleteCronJob", definition, handler);
}

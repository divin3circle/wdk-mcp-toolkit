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
import { randomUUID } from "node:crypto";
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

export function createCronJob(server) {
  const definition = {
    title: "Create Cron Job",
    description: `Create a cron job with openclaw and persist metadata in ~/.wallets/scheduler.json.

    This runs: openclaw cron add ...commandArgs

Use commandArgs to pass exact OpenClaw CLI flags for your environment.`,
    inputSchema: z.object({
      ownerId: z.string().min(1).describe("Tenant/user owner id"),
      schedule: z
        .string()
        .min(1)
        .describe("Cron schedule expression for metadata"),
      task: z.string().min(1).describe("Task description for metadata"),
      jobId: z
        .string()
        .optional()
        .describe("Job id; auto-generated if omitted"),
      commandArgs: z
        .array(z.string())
        .optional()
        .default([])
        .describe("Additional args passed to openclaw cron add"),
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
    schedule,
    task,
    jobId,
    commandArgs = [],
  }) => {
    try {
      assertAgentMutationAllowed("cron.create", "agent");
      await assertOwnerHasPolicy(ownerId);
      validateOpenClawCronArgs("add", commandArgs);

      const resolvedJobId = jobId || randomUUID();

      const { stdout, stderr } = await execFile(
        "openclaw",
        ["cron", "add", ...commandArgs],
        {
          timeout: 20000,
          windowsHide: true,
          maxBuffer: 1024 * 1024,
        },
      );

      const now = new Date().toISOString();
      const record = {
        jobId: resolvedJobId,
        ownerId,
        schedule,
        task,
        commandArgs,
        status: "active",
        createdAt: now,
        updatedAt: now,
      };

      await updateStore(STORAGE_FILES.scheduler, schedulerDefault, (store) => {
        const jobs = Array.isArray(store.jobs) ? [...store.jobs] : [];
        jobs.push(record);
        return { version: 1, jobs };
      });

      await appendAuditLog({
        action: "cron.create",
        ownerId,
        jobId: resolvedJobId,
      });

      const result = {
        ...record,
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
          { type: "text", text: `Error creating cron job: ${error.message}` },
        ],
      };
    }
  };

  server.registerTool("addCronJob", definition, handler);
  server.registerTool("createCronJob", definition, handler);
}

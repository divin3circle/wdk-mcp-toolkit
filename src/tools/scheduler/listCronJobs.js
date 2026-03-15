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

import { z } from "zod";
import { STORAGE_FILES, readStore } from "../../utils/agentControlStore.js";

/** @typedef {import('../../server.js').WdkMcpServer} WdkMcpServer */

const schedulerDefault = {
  version: 1,
  jobs: [],
};

export function listCronJobs(server) {
  server.registerTool(
    "listCronJobs",
    {
      title: "List Cron Jobs",
      description: "List cron job metadata from ~/.wallets/scheduler.json.",
      inputSchema: z.object({
        ownerId: z.string().optional().describe("Optional owner filter"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ ownerId }) => {
      try {
        const store = await readStore(
          STORAGE_FILES.scheduler,
          schedulerDefault,
        );
        const jobs = (store.jobs || []).filter(
          (item) => !ownerId || item.ownerId === ownerId,
        );

        return {
          content: [{ type: "text", text: JSON.stringify(jobs, null, 2) }],
          structuredContent: jobs,
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            { type: "text", text: `Error listing cron jobs: ${error.message}` },
          ],
        };
      }
    },
  );
}

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

const governanceDefault = {
  version: 1,
  policies: {},
  goals: [],
};

export function listGoals(server) {
  server.registerTool(
    "listGoals",
    {
      title: "List Goals",
      description:
        "List goals from ~/.wallets/governance.json filtered by owner and/or status.",
      inputSchema: z.object({
        ownerId: z.string().optional().describe("Optional owner filter"),
        status: z
          .enum(["active", "paused", "completed"])
          .optional()
          .describe("Optional status filter"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ ownerId, status }) => {
      try {
        const store = await readStore(
          STORAGE_FILES.governance,
          governanceDefault,
        );
        const goals = (store.goals || []).filter((goal) => {
          if (ownerId && goal.ownerId !== ownerId) return false;
          if (status && goal.status !== status) return false;
          return true;
        });

        return {
          content: [{ type: "text", text: JSON.stringify(goals, null, 2) }],
          structuredContent: goals,
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            { type: "text", text: `Error listing goals: ${error.message}` },
          ],
        };
      }
    },
  );
}

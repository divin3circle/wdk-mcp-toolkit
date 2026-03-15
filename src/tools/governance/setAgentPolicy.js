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
import {
  STORAGE_FILES,
  updateStore,
  appendAuditLog,
} from "../../utils/agentControlStore.js";

/** @typedef {import('../../server.js').WdkMcpServer} WdkMcpServer */

const governanceDefault = {
  version: 1,
  policies: {},
  goals: [],
};

export function setAgentPolicy(server) {
  server.registerTool(
    "setAgentPolicy",
    {
      title: "Set Agent Policy",
      description: `Create or update deterministic policy constraints for an owner in ~/.wallets/governance.json.

Policy fields are interpreted as hard guardrails by analyzeGoalAgainstPolicy and can be reused by execution layers before signing actions.`,
      inputSchema: z.object({
        ownerId: z.string().min(1).describe("Tenant/user owner id"),
        maxDailyAmount: z
          .string()
          .optional()
          .describe("Max amount allowed per day in base units"),
        blacklistedOperations: z
          .array(z.string())
          .optional()
          .default([])
          .describe("Operations the agent must never execute"),
        blacklistedProtocols: z
          .array(z.string())
          .optional()
          .default([])
          .describe("Protocols the agent must never use"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({
      ownerId,
      maxDailyAmount,
      blacklistedOperations = [],
      blacklistedProtocols = [],
    }) => {
      try {
        if (maxDailyAmount !== undefined) {
          BigInt(maxDailyAmount);
        }

        const now = new Date().toISOString();

        const policy = {
          ownerId,
          maxDailyAmount: maxDailyAmount ?? null,
          blacklistedOperations,
          blacklistedProtocols,
          updatedAt: now,
        };

        await updateStore(
          STORAGE_FILES.governance,
          governanceDefault,
          (store) => {
            const next = {
              version: 1,
              policies: { ...(store.policies || {}) },
              goals: Array.isArray(store.goals) ? [...store.goals] : [],
            };

            next.policies[ownerId] = policy;
            return next;
          },
        );

        await appendAuditLog({
          action: "policy.set",
          ownerId,
          maxDailyAmount: policy.maxDailyAmount,
        });

        return {
          content: [
            { type: "text", text: `Policy updated for ownerId=${ownerId}.` },
          ],
          structuredContent: policy,
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            { type: "text", text: `Error setting policy: ${error.message}` },
          ],
        };
      }
    },
  );
}

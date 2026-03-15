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

function asLowerStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
}

export function analyzeGoalAgainstPolicy(server) {
  server.registerTool(
    "analyzeGoalAgainstPolicy",
    {
      title: "Analyze Goal Against Policy",
      description: `Analyze a goal against policy constraints in ~/.wallets/governance.json.

Decision outcomes:
  - allow: goal is within defined policy constraints
  - deny: goal violates one or more hard constraints`,
      inputSchema: z.object({
        ownerId: z.string().min(1).describe("Tenant/user owner id"),
        goalId: z.string().min(1).describe("Goal id to analyze"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ ownerId, goalId }) => {
      try {
        const store = await readStore(
          STORAGE_FILES.governance,
          governanceDefault,
        );
        const policy = store.policies?.[ownerId] || null;
        const goal = (store.goals || []).find(
          (item) => item.goalId === goalId && item.ownerId === ownerId,
        );

        if (!goal) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Goal not found for ownerId=${ownerId} and goalId=${goalId}.`,
              },
            ],
          };
        }

        const violations = [];
        const notes = [];

        if (!policy) {
          notes.push(
            "No policy found for owner. Goal is treated as allowed by default.",
          );
        } else {
          const blacklistedOperations = asLowerStringArray(
            policy.blacklistedOperations,
          );
          const blacklistedProtocols = asLowerStringArray(
            policy.blacklistedProtocols,
          );

          if (
            goal.operation &&
            blacklistedOperations.includes(String(goal.operation).toLowerCase())
          ) {
            violations.push(`Operation \"${goal.operation}\" is blacklisted.`);
          }

          if (
            goal.protocol &&
            blacklistedProtocols.includes(String(goal.protocol).toLowerCase())
          ) {
            violations.push(`Protocol \"${goal.protocol}\" is blacklisted.`);
          }

          if (policy.maxDailyAmount && goal.targetAmount) {
            const targetAmount = BigInt(goal.targetAmount);
            const maxDailyAmount = BigInt(policy.maxDailyAmount);

            if (targetAmount > maxDailyAmount) {
              violations.push(
                `Target amount ${goal.targetAmount} exceeds maxDailyAmount ${policy.maxDailyAmount}.`,
              );
            }
          }
        }

        const decision = violations.length > 0 ? "deny" : "allow";

        const result = {
          ownerId,
          goalId,
          decision,
          violations,
          notes,
          analyzedAt: new Date().toISOString(),
          goal,
          policy,
        };

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error analyzing goal against policy: ${error.message}`,
            },
          ],
        };
      }
    },
  );
}

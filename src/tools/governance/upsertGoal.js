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

import { randomUUID } from "node:crypto";
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

export function upsertGoal(server) {
  server.registerTool(
    "upsertGoal",
    {
      title: "Create Or Update Goal",
      description: `Create or update short-term/long-term goals in ~/.wallets/governance.json.

Goals can be created by both the human manager and the agent and then analyzed against policy constraints.`,
      inputSchema: z.object({
        ownerId: z.string().min(1).describe("Tenant/user owner id"),
        goalId: z
          .string()
          .optional()
          .describe("Goal id; auto-generated if omitted"),
        source: z.enum(["agent", "human"]).describe("Goal source"),
        horizon: z
          .enum(["short_term", "long_term"])
          .describe("Planning horizon"),
        status: z
          .enum(["active", "paused", "completed"])
          .optional()
          .default("active")
          .describe("Goal status"),
        objective: z.string().min(1).describe("Goal objective text"),
        operation: z
          .string()
          .optional()
          .describe("Proposed operation (e.g., swap, bridge, lend)"),
        protocol: z.string().optional().describe("Target protocol label"),
        targetAmount: z
          .string()
          .optional()
          .describe("Target amount in base units for policy checks"),
        dueAt: z.string().optional().describe("Optional ISO due date"),
        metadata: z.record(z.any()).optional().describe("Additional metadata"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({
      ownerId,
      goalId,
      source,
      horizon,
      status = "active",
      objective,
      operation,
      protocol,
      targetAmount,
      dueAt,
      metadata,
    }) => {
      try {
        if (targetAmount !== undefined) {
          BigInt(targetAmount);
        }

        const now = new Date().toISOString();
        const resolvedGoalId = goalId || randomUUID();

        const goalRecord = {
          goalId: resolvedGoalId,
          ownerId,
          source,
          horizon,
          status,
          objective,
          operation: operation || null,
          protocol: protocol || null,
          targetAmount: targetAmount || null,
          dueAt: dueAt || null,
          metadata: metadata || {},
          createdAt: now,
          updatedAt: now,
        };

        await updateStore(
          STORAGE_FILES.governance,
          governanceDefault,
          (store) => {
            const goals = Array.isArray(store.goals) ? [...store.goals] : [];
            const index = goals.findIndex(
              (item) => item.goalId === resolvedGoalId,
            );

            if (index >= 0) {
              goalRecord.createdAt = goals[index].createdAt;
              goals[index] = goalRecord;
            } else {
              goals.push(goalRecord);
            }

            return {
              version: 1,
              policies: { ...(store.policies || {}) },
              goals,
            };
          },
        );

        await appendAuditLog({
          action: "goal.upsert",
          ownerId,
          goalId: resolvedGoalId,
          source,
          horizon,
          status,
        });

        return {
          content: [
            {
              type: "text",
              text: `Goal saved for ownerId=${ownerId} with goalId=${resolvedGoalId}.`,
            },
          ],
          structuredContent: goalRecord,
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            { type: "text", text: `Error upserting goal: ${error.message}` },
          ],
        };
      }
    },
  );
}

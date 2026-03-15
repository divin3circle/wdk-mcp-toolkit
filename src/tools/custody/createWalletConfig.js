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
  encryptSecret,
  assertAgentMutationAllowed,
} from "../../utils/agentControlStore.js";

/** @typedef {import('../../server.js').WdkMcpServer} WdkMcpServer */

const walletsStoreDefault = {
  version: 1,
  wallets: [],
};

export function createWalletConfig(server) {
  server.registerTool(
    "createWalletConfig",
    {
      title: "Create Wallet Config",
      description: `Create a wallet config entry in ~/.wallets/wallets.json with encrypted key material.

This tool creates or overwrites a wallet configuration record for autonomous agents. The key material is encrypted using AES-256-GCM with WDK_WALLET_ENCRYPTION_KEY and never stored in plaintext.

Required environment variable:
  - WDK_WALLET_ENCRYPTION_KEY

Args:
  - address (REQUIRED): Wallet address
  - chain (REQUIRED): Blockchain name
  - keyMaterial (REQUIRED): Seed phrase or private key to encrypt
  - creator (REQUIRED): Who created this wallet entry: "agent" or "human"
  - ownerId (OPTIONAL): Tenant/user owner identifier
  - walletId (OPTIONAL): Wallet id; auto-generated if omitted
  - metadata (OPTIONAL): Additional metadata object`,
      inputSchema: z.object({
        address: z.string().min(1).describe("Wallet address"),
        chain: z.string().min(1).describe("Blockchain name"),
        keyMaterial: z
          .string()
          .min(1)
          .describe("Seed phrase or private key to encrypt at rest"),
        creator: z
          .enum(["agent", "human"])
          .describe("Who created this wallet config record"),
        ownerId: z
          .string()
          .min(1)
          .optional()
          .describe("Tenant/user identifier"),
        walletId: z
          .string()
          .min(1)
          .optional()
          .describe("Wallet id, auto-generated if omitted"),
        metadata: z
          .record(z.any())
          .optional()
          .describe("Optional metadata to persist"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({
      address,
      chain,
      keyMaterial,
      creator,
      ownerId,
      walletId,
      metadata,
    }) => {
      try {
        assertAgentMutationAllowed("wallet.create", creator);

        const now = new Date().toISOString();
        const resolvedWalletId = walletId || randomUUID();
        const encryptedKey = encryptSecret(keyMaterial);

        const walletRecord = {
          walletId: resolvedWalletId,
          ownerId: ownerId || null,
          address,
          chain,
          creator,
          createdAt: now,
          updatedAt: now,
          encryptedKey,
          metadata: metadata || {},
        };

        await updateStore(
          STORAGE_FILES.wallets,
          walletsStoreDefault,
          (store) => {
            const next = {
              version: 1,
              wallets: Array.isArray(store.wallets) ? [...store.wallets] : [],
            };

            const existingIndex = next.wallets.findIndex(
              (item) => item.walletId === resolvedWalletId,
            );
            if (existingIndex >= 0) {
              next.wallets[existingIndex] = walletRecord;
            } else {
              next.wallets.push(walletRecord);
            }

            return next;
          },
        );

        await appendAuditLog({
          action: "wallet.create",
          walletId: resolvedWalletId,
          ownerId: ownerId || null,
          chain,
          creator,
        });

        return {
          content: [
            {
              type: "text",
              text: `Wallet config saved at ~/.wallets/wallets.json for walletId=${resolvedWalletId}.`,
            },
          ],
          structuredContent: {
            walletId: resolvedWalletId,
            address,
            chain,
            creator,
            createdAt: now,
            ownerId: ownerId || null,
          },
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error creating wallet config: ${error.message}`,
            },
          ],
        };
      }
    },
  );
}

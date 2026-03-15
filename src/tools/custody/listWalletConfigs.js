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

const walletsStoreDefault = {
  version: 1,
  wallets: [],
};

export function listWalletConfigs(server) {
  server.registerTool(
    "listWalletConfigs",
    {
      title: "List Wallet Configs",
      description: "List wallet config metadata from ~/.wallets/wallets.json.",
      inputSchema: z.object({
        ownerId: z
          .string()
          .min(1)
          .optional()
          .describe("Optional tenant/user filter"),
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
          STORAGE_FILES.wallets,
          walletsStoreDefault,
        );
        const wallets = (store.wallets || [])
          .filter((item) => !ownerId || item.ownerId === ownerId)
          .map((item) => ({
            walletId: item.walletId,
            ownerId: item.ownerId,
            address: item.address,
            chain: item.chain,
            creator: item.creator,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            metadata: item.metadata || {},
          }));

        return {
          content: [{ type: "text", text: JSON.stringify(wallets, null, 2) }],
          structuredContent: wallets,
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error listing wallet configs: ${error.message}`,
            },
          ],
        };
      }
    },
  );
}

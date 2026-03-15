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

export function getWalletConfig(server) {
  server.registerTool(
    "getWalletConfig",
    {
      title: "Get Wallet Config",
      description: `Get wallet config metadata from ~/.wallets/wallets.json.

By default this tool returns metadata only and excludes encrypted key blobs. Set includeEncryptedKey=true only when explicitly needed for privileged workflows.`,
      inputSchema: z.object({
        walletId: z.string().min(1).describe("Wallet id to fetch"),
        includeEncryptedKey: z
          .boolean()
          .optional()
          .default(false)
          .describe("Whether to include encrypted key payload"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ walletId, includeEncryptedKey = false }) => {
      try {
        const store = await readStore(
          STORAGE_FILES.wallets,
          walletsStoreDefault,
        );
        const wallet = (store.wallets || []).find(
          (item) => item.walletId === walletId,
        );

        if (!wallet) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Wallet config not found for walletId=${walletId}.`,
              },
            ],
          };
        }

        const response = includeEncryptedKey
          ? wallet
          : {
              walletId: wallet.walletId,
              ownerId: wallet.ownerId,
              address: wallet.address,
              chain: wallet.chain,
              creator: wallet.creator,
              createdAt: wallet.createdAt,
              updatedAt: wallet.updatedAt,
              metadata: wallet.metadata || {},
            };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
          structuredContent: response,
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error getting wallet config: ${error.message}`,
            },
          ],
        };
      }
    },
  );
}

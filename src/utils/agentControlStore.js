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

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const STORAGE_DIR =
  process.env.WDK_WALLETS_DIR || path.join(os.homedir(), ".wallets");
const ENCRYPTION_ENV_VAR = "WDK_WALLET_ENCRYPTION_KEY";
const ALLOW_AGENT_MUTATIONS_ENV_VAR = "WDK_ALLOW_AGENT_MUTATIONS";

export const STORAGE_FILES = {
  wallets: "wallets.json",
  governance: "governance.json",
  scheduler: "scheduler.json",
  audit: "audit.log",
};

function getStoragePath(fileName) {
  return path.join(STORAGE_DIR, fileName);
}

async function ensureStorageDir() {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withFileLock(lockPath, callback, options = {}) {
  const retries = options.retries ?? 20;
  const retryDelayMs = options.retryDelayMs ?? 50;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await fs.open(lockPath, "wx");
      try {
        return await callback();
      } finally {
        await fs.unlink(lockPath).catch(() => {});
      }
    } catch (error) {
      if (error.code !== "EEXIST" || attempt === retries) {
        throw error;
      }
      await sleep(retryDelayMs);
    }
  }
}

async function readJsonFile(filePath, defaultValue) {
  try {
    const data = await fs.readFile(filePath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT") {
      return defaultValue;
    }
    throw error;
  }
}

async function writeJsonAtomic(filePath, payload) {
  const tmpPath = `${filePath}.tmp`;
  const content = JSON.stringify(payload, null, 2) + "\n";
  await fs.writeFile(tmpPath, content, { encoding: "utf8", mode: 0o600 });
  await fs.rename(tmpPath, filePath);
}

export async function updateStore(fileName, defaultValue, mutator) {
  await ensureStorageDir();

  const filePath = getStoragePath(fileName);
  const lockPath = `${filePath}.lock`;

  return withFileLock(lockPath, async () => {
    const current = await readJsonFile(filePath, defaultValue);
    const next = await mutator(current);
    await writeJsonAtomic(filePath, next);
    return next;
  });
}

export async function readStore(fileName, defaultValue) {
  await ensureStorageDir();
  return readJsonFile(getStoragePath(fileName), defaultValue);
}

export async function appendAuditLog(entry) {
  await ensureStorageDir();

  const payload = {
    timestamp: new Date().toISOString(),
    ...entry,
  };

  await fs.appendFile(
    getStoragePath(STORAGE_FILES.audit),
    `${JSON.stringify(payload)}\n`,
    {
      encoding: "utf8",
      mode: 0o600,
    },
  );
}

export function encryptSecret(secret) {
  const encryptionSecret = process.env[ENCRYPTION_ENV_VAR];

  if (!encryptionSecret) {
    throw new Error(
      `Missing ${ENCRYPTION_ENV_VAR}. Set it before creating wallet config records.`,
    );
  }

  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(encryptionSecret, salt, 32);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    cipher: "aes-256-gcm",
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    salt: salt.toString("base64"),
    keyRef: `env:${ENCRYPTION_ENV_VAR}`,
    version: "1",
  };
}

const governanceDefault = { version: 1, policies: {}, goals: [] };

export async function assertOwnerHasPolicy(ownerId) {
  const store = await readStore(STORAGE_FILES.governance, governanceDefault);
  const policy = store.policies && store.policies[ownerId];
  if (!policy) {
    throw new Error(
      `No policy found for ownerId=${ownerId}. Use setAgentPolicy to register a policy before scheduling cron jobs.`,
    );
  }
  return policy;
}

export function assertAgentMutationAllowed(action, creator = "agent") {
  if (creator !== "agent") {
    return;
  }

  const allowed = process.env[ALLOW_AGENT_MUTATIONS_ENV_VAR] === "1";
  if (!allowed) {
    throw new Error(
      `Blocked ${action}. Set ${ALLOW_AGENT_MUTATIONS_ENV_VAR}=1 to allow agent-initiated writes/CLI mutations.`,
    );
  }
}

function findInvalidArgTokens(commandArgs = []) {
  return commandArgs.filter(
    (arg) =>
      typeof arg !== "string" ||
      arg.length === 0 ||
      /[\r\n\0]/.test(arg) ||
      arg === "&&" ||
      arg === "||" ||
      arg === "|" ||
      arg === ";",
  );
}

export function validateOpenClawCronArgs(verb, commandArgs = []) {
  const invalid = findInvalidArgTokens(commandArgs);
  if (invalid.length > 0) {
    throw new Error(
      `Invalid cron command arguments detected: ${invalid.join(", ")}.`,
    );
  }

  const allowedFlagsByVerb = {
    add: new Set([
      "--name",
      "--description",
      "--at",
      "--cron",
      "--every",
      "--tz",
      "--stagger",
      "--exact",
      "--session",
      "--system-event",
      "--message",
      "--wake",
      "--delete-after-run",
      "--no-delete-after-run",
      "--announce",
      "--webhook",
      "--none",
      "--channel",
      "--to",
      "--best-effort",
      "--model",
      "--thinking",
      "--light-context",
      "--agent",
      "--enabled",
      "--disabled",
    ]),
    edit: new Set([
      "--name",
      "--description",
      "--at",
      "--cron",
      "--every",
      "--tz",
      "--stagger",
      "--exact",
      "--session",
      "--system-event",
      "--message",
      "--wake",
      "--delete-after-run",
      "--no-delete-after-run",
      "--announce",
      "--webhook",
      "--none",
      "--channel",
      "--to",
      "--best-effort",
      "--model",
      "--thinking",
      "--light-context",
      "--agent",
      "--clear-agent",
      "--enabled",
      "--disabled",
    ]),
    remove: new Set(["--force"]),
  };

  const allowedFlags = allowedFlagsByVerb[verb];
  if (!allowedFlags) {
    throw new Error(`Unsupported openclaw cron verb: ${verb}.`);
  }

  const unknownFlags = commandArgs.filter(
    (arg) => arg.startsWith("--") && !allowedFlags.has(arg),
  );
  if (unknownFlags.length > 0) {
    throw new Error(
      `Unsupported flags for openclaw cron ${verb}: ${unknownFlags.join(", ")}.`,
    );
  }

  if (verb === "add") {
    const hasSchedule =
      commandArgs.includes("--at") ||
      commandArgs.includes("--cron") ||
      commandArgs.includes("--every");
    if (!hasSchedule) {
      throw new Error(
        "openclaw cron add requires one schedule flag: --at, --cron, or --every.",
      );
    }

    const hasPayload =
      commandArgs.includes("--system-event") ||
      commandArgs.includes("--message");
    if (!hasPayload) {
      throw new Error(
        "openclaw cron add requires one payload flag: --system-event or --message.",
      );
    }
  }
}

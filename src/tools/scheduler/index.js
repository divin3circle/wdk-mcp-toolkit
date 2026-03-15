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

import { createCronJob } from "./createCronJob.js";
import { updateCronJob } from "./updateCronJob.js";
import { deleteCronJob } from "./deleteCronJob.js";
import { listCronJobs } from "./listCronJobs.js";

/** @typedef {import('../../server.js').ToolFunction} ToolFunction */

export const SCHEDULER_TOOLS = [
  createCronJob,
  updateCronJob,
  deleteCronJob,
  listCronJobs,
];

export const addCronJob = createCronJob;
export const editCronJob = updateCronJob;
export const removeCronJob = deleteCronJob;

export {
  createCronJob,
  updateCronJob,
  deleteCronJob,
  listCronJobs,
  addCronJob,
  editCronJob,
  removeCronJob,
};

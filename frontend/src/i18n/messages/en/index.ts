import { account } from "./account";
import { api } from "./api";
import { auth } from "./auth";
import { common } from "./common";
import { dashboard } from "./dashboard";
import { labels } from "./labels";
import { members } from "./members";
import { memberships } from "./memberships";
import { payments } from "./payments";
import { plans } from "./plans";
import { reports } from "./reports";
import { settings } from "./settings";
import { shell } from "./shell";
import { staff } from "./staff";

/** English catalog; its shape defines the keys every other language must provide. */
export const en = {
  common,
  shell,
  labels,
  auth,
  dashboard,
  members,
  payments,
  memberships,
  plans,
  reports,
  staff,
  settings,
  account,
  api,
} as const;

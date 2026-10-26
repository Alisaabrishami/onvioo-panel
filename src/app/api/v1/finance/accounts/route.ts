import { financeAccounts } from "@/lib/finance-data";
import { authed } from "@/lib/api/http";

// Bank accounts and cash boxes, to choose where a salary is paid from
export const GET = authed(async () => ({
  items: (await financeAccounts()).map((a) => ({ id: a.id, name: a.name, kind: a.kind, active: a.active, lockedThrough: a.lockedThrough })),
}), ["admin"]);

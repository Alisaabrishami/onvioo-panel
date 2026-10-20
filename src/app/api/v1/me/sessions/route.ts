import { listSessions, revokeOtherSessions } from "@/lib/ops/sessions";
import { authed } from "@/lib/api/http";

// Where this account is signed in: browsers and apps, with this token marked current
export const GET = authed(async (user) => ({ items: await listSessions(user.id, user.tokenHash) }));

// Signs out every other browser and app, keeping this token
export const DELETE = authed(async (user) => ({ revoked: await revokeOtherSessions(user.id, user.tokenHash) }));

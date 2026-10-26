import { ApiError, TEAM, authed } from "@/lib/api/http";
import { clockOut } from "@/lib/team-ops";

export const POST = authed(async (user) => {
  const done = await clockOut(user.id);
  if (!done) throw new ApiError(409, "not_clocked_in", "ورودی ثبت نشده بود");
  return done;
}, TEAM);

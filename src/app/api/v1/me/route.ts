import { profile } from "@/lib/api/auth";
import { authed } from "@/lib/api/http";
import { unreadCount } from "@/lib/notifications";

export const GET = authed(async (user) => ({ ...(await profile(user)), unread: await unreadCount(user.id) }));

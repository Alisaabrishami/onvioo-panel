import { activeTeam } from "@/lib/team-data";
import { TEAM, authed } from "@/lib/api/http";

// Active team members, for assignee and owner pickers
export const GET = authed(async () => ({ items: (await activeTeam()).map(({ id, name, role, title }) => ({ id, name, role, title })) }), TEAM);

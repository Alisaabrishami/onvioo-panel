import { CONTRACT_TEMPLATES } from "@/lib/contracts";
import { authed } from "@/lib/api/http";

// Starting texts for a new contract; [مشتری] stands for the client's name
export const GET = authed(async () => ({ items: CONTRACT_TEMPLATES.map((t) => ({ ...t })) }), ["admin"]);

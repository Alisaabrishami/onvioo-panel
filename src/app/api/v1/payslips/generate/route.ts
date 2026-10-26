import * as z from "zod";
import { generatePayslips } from "@/lib/ops/payroll";
import { authed, body } from "@/lib/api/http";

// { period: "1405-07" }: drafts or refreshes everyone's slip from hours, deliveries and leave
export const POST = authed(async (user, request) => {
  const { period } = await body(request, z.object({ period: z.string({ error: "period لازم است" }) }));
  return { period, count: await generatePayslips(user, period) };
}, ["admin"]);

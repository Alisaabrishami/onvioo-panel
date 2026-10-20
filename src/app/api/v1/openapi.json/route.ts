import { openapi } from "@/lib/api/openapi";

// Public on purpose: it only describes the API, every data route needs a token
export function GET() {
  return Response.json(openapi);
}

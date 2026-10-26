import { startUpload } from "@/lib/ops/uploads";
import { authed, created, rawBody } from "@/lib/api/http";

// Step 1 of an upload: { name, size, mime, clientId?, contentId?, kind? } → a
// presigned URL. PUT the bytes there with the given headers, then call
// /uploads/complete. Clients upload attachments into their own account (500 MB max).
export const POST = authed(async (user, request) => created(await startUpload(user, (await rawBody(request)) as never)));

import { finishUpload } from "@/lib/ops/uploads";
import { authed, created, rawBody } from "@/lib/api/http";
import { fileView } from "@/lib/api/files";

// Step 2: the same fields plus `key` once the PUT succeeded. Returns the file;
// its id can then be attached to a ticket message.
export const POST = authed(async (user, request) => created(await fileView(await finishUpload(user, (await rawBody(request)) as never), false)));

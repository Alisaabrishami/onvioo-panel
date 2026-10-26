"use client";

import { useState } from "react";
import { AttachmentPicker } from "@/components/attachment-picker";
import { Button, Textarea } from "@/components/ui";
import type { FormState } from "@/lib/forms";
import { useFormAction } from "@/lib/use-form-action";

export function ReplyForm({
  action,
  placeholder = "پاسخ…",
  submitLabel = "ارسال پاسخ",
  attachments,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  placeholder?: string;
  submitLabel?: string;
  // Offer file attachments, filed under this client
  attachments?: { clientId: string | null };
}) {
  const [state, formAction, pending] = useFormAction(action);
  const [uploading, setUploading] = useState(false);
  const error = state.errors?.body?.[0] ?? state.errors?.fileIds?.[0] ?? state.message;
  return (
    <form key={state.at} action={formAction} className="space-y-2">
      <Textarea name="body" rows={3} placeholder={placeholder} defaultValue={state.ok ? "" : state.values?.body} aria-label="متن پیام" />
      {attachments && <AttachmentPicker clientId={attachments.clientId} onBusyChange={setUploading} />}
      {error && <p className="text-xs text-danger">{error}</p>}
      <Button type="submit" disabled={pending || uploading}>{pending ? "در حال ارسال…" : uploading ? "در حال آپلود…" : submitLabel}</Button>
    </form>
  );
}

import type { LeaveKind, RequestStatus } from "@/db/schema";

export const LEAVE_KIND_LABELS: Record<LeaveKind, string> = {
  annual: "مرخصی استحقاقی",
  sick: "مرخصی استعلاجی",
  unpaid: "مرخصی بدون حقوق",
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  pending: "در انتظار تأیید",
  approved: "تأیید شد",
  rejected: "رد شد",
};

export const REQUEST_STATUS_TONES = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
} as const satisfies Record<RequestStatus, string>;

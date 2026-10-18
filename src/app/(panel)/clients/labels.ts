import type { ClientStatus } from "@/db/schema";

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  lead: "مشتری بالقوه",
  active: "فعال",
  paused: "متوقف",
  ended: "پایان همکاری",
};

export const CLIENT_STATUS_TONES = {
  lead: "primary",
  active: "success",
  paused: "warning",
  ended: "neutral",
} as const satisfies Record<ClientStatus, string>;

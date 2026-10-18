import type { PayType } from "@/db/schema";

export const PAY_TYPE_LABELS: Record<PayType, string> = {
  monthly: "ماهانه ثابت",
  hourly: "ساعتی",
  per_item: "به‌ازای هر کار",
};

export const PAY_TYPE_UNITS: Record<PayType, string> = {
  monthly: "در ماه",
  hourly: "در ساعت",
  per_item: "هر کار",
};

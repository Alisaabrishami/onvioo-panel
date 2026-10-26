import * as z from "zod";
import { parseJalali } from "./format";

export type FormState = {
  errors?: Record<string, string[]>;
  // What the user typed, so a failed submit does not clear the form
  values?: Record<string, string>;
  message?: string;
  ok?: boolean;
};

export function typedValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  formData.forEach((v, k) => {
    if (typeof v === "string" && k !== "password" && !k.startsWith("$")) values[k] = v;
  });
  return values;
}

export function invalid(error: z.ZodError, formData: FormData): FormState {
  return { errors: z.flattenError(error).fieldErrors as Record<string, string[]>, values: typedValues(formData) };
}

export const optionalText = z
  .string()
  .trim()
  .transform((v) => v || null);

export const optionalUuid = z
  .string()
  .trim()
  .transform((v) => v || null)
  .pipe(z.uuid().nullable());

// A Jalali date field plus its optional `${name}Time` companion
export function jalaliField(formData: FormData, name: string) {
  return {
    date: String(formData.get(name) ?? ""),
    time: String(formData.get(`${name}Time`) ?? ""),
  };
}

export const optionalJalali = z
  .object({ date: z.string(), time: z.string() })
  .transform((v, ctx) => {
    if (!v.date.trim()) return null;
    const date = parseJalali(v.date, v.time);
    if (!date) {
      ctx.addIssue({ code: "custom", message: "تاریخ یا ساعت معتبر نیست (مثل ۱۴۰۵/۰۷/۲۷ و ۱۴:۳۰)" });
      return z.NEVER;
    }
    return date;
  });

export const requiredJalali = optionalJalali.refine((v) => v !== null, { error: "تاریخ را وارد کنید" });

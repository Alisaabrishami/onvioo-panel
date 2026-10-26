import "server-only";
import { parseCsv } from "./growth";
import { isXlsx, readXlsx } from "./xlsx";

export const MAX_TABLE_BYTES = 5 * 1024 * 1024;

// An uploaded spreadsheet (xlsx, CSV, or Excel's UTF-16 "Unicode text") as rows of strings
export async function readTableFile(file: File): Promise<string[][]> {
  const buf = Buffer.from(await file.arrayBuffer());
  if (isXlsx(buf)) return readXlsx(buf);
  if (buf[0] === 0xd0 && buf[1] === 0xcf) throw new Error("xls");
  const text = buf[0] === 0xff && buf[1] === 0xfe ? buf.subarray(2).toString("utf16le") : buf.toString("utf8");
  return parseCsv(text);
}

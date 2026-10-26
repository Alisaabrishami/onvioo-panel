import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { readXlsx } from "./xlsx";

// Builds a tiny zip with deflated entries, enough to stand in for an .xlsx
function zip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = deflateRawSync(Buffer.from(content));
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

describe("readXlsx", () => {
  it("reads shared strings, inline strings, numbers and gaps", () => {
    const buf = zip({
      "xl/sharedStrings.xml": `<sst><si><t>تاریخ</t></si><si><r><t>شرح</t></r><r><t xml:space="preserve"> سند</t></r></si><si><t>A &amp; B</t></si></sst>`,
      "xl/worksheets/sheet1.xml": `<worksheet><sheetData>
        <row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>
        <row r="2"><c r="A2" t="inlineStr"><is><t>1405/07/20</t></is></c><c r="B2"><v>1500</v></c><c r="C2" t="s"><v>2</v></c></row>
        <row r="3"></row>
      </sheetData></worksheet>`,
    });
    expect(readXlsx(buf)).toEqual([
      ["تاریخ", "", "شرح سند"],
      ["1405/07/20", "1500", "A & B"],
    ]);
  });
});

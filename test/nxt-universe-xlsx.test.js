import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { parseOfficialNxtXlsx } from "../src/nxt/universe-xlsx.js";
import { runUniverseImport } from "../scripts/import-nxt-universe.js";

const SOURCE = "https://nextrade.co.kr/menu/notice/view.do?scNttNo=40";

async function fixtureXlsx({ conflictingDuplicate = false, malformed = false, unknownMarket = false } = {}) {
  if (malformed) return Buffer.from("this is not an xlsx");
  const zip = new JSZip();
  zip.file("xl/workbook.xml", `<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${unknownMarket ? "Data" : "KOSPI"}" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>');
  const strings = ["종목코드", "종목명", "시장", "005930", "삼성전자", unknownMarket ? "시장미상" : "코스피", "SK하이닉스", "다른 이름"];
  zip.file("xl/sharedStrings.xml", `<sst>${strings.map((s) => `<si><t>${s}</t></si>`).join("")}</sst>`);
  const s = (ref, index) => `<c r="${ref}" t="s"><v>${index}</v></c>`;
  zip.file("xl/worksheets/sheet1.xml", `<worksheet><sheetData>
    <row r="1">${s("A1", 0)}${s("B1", 1)}${s("C1", 2)}</row>
    <row r="2">${s("A2", 3)}${s("B2", 4)}${s("C2", 5)}</row>
    <row r="3"><c r="A3"><v>660</v></c>${s("B3", 6)}${s("C3", 5)}</row>
    <row r="4">${s("A4", 3)}${s("B4", conflictingDuplicate ? 7 : 4)}${s("C4", 5)}</row>
  </sheetData></worksheet>`);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

test("official NXT XLSX parser preserves six-digit tickers and removes exact duplicates", async () => {
  const parsed = await parseOfficialNxtXlsx(await fixtureXlsx(), {
    fileName: "quarter-list.xlsx", sourceUrl: SOURCE, effectiveDate: "2026-07-01",
    downloadedAt: "2026-06-26T09:00:00.000Z", expectedCount: 2, today: "2026-07-01",
    previous: { asOf: "2026-06-30", items: [{ ticker: "005930", name: "삼성전자" }, { ticker: "000001", name: "기존종목" }] }
  });
  assert.equal(parsed.validation.status, "VERIFIED");
  assert.equal(parsed.validation.usableForLive, true);
  assert.deepEqual(parsed.archive.sheetNames, ["KOSPI"]);
  assert.equal(parsed.archive.rowsExtracted, 3);
  assert.equal(parsed.archive.duplicateRowsRemoved, 1);
  assert.equal(parsed.archive.items.length, 2);
  assert.deepEqual(parsed.archive.items.map((item) => item.ticker), ["000660", "005930"]);
  assert.deepEqual(parsed.validation.diff.added, [{ ticker: "000660", name: "SK하이닉스", }]);
  assert.deepEqual(parsed.validation.diff.removed, [{ ticker: "000001", name: "기존종목" }]);
  assert.ok(/^[a-f0-9]{64}$/.test(parsed.archive.sha256));
});

test("official XLSX parser rejects conflicting duplicate tickers and invalid counts", async () => {
  const conflicting = await fixtureXlsx({ conflictingDuplicate: true });
  const normal = await fixtureXlsx();
  await assert.rejects(() => parseOfficialNxtXlsx(conflicting, {
    sourceUrl: SOURCE, effectiveDate: "2026-07-01", today: "2026-07-01"
  }), /XLSX_DUPLICATE_CONFLICT:005930/);
  await assert.rejects(() => parseOfficialNxtXlsx(normal, {
    sourceUrl: SOURCE, effectiveDate: "2026-07-01", expectedCount: 610, today: "2026-07-01"
  }), /XLSX_EXPECTED_COUNT_MISMATCH/);
});

test("an official file without an effective date is archive-only and stale files cannot be LIVE", async () => {
  const missing = await parseOfficialNxtXlsx(await fixtureXlsx(), { sourceUrl: SOURCE });
  assert.equal(missing.validation.status, "UNVERIFIED");
  assert.equal(missing.validation.reason, "UNIVERSE_EFFECTIVE_DATE_MISSING");
  assert.equal(missing.validation.usableForLive, false);
  const stale = await parseOfficialNxtXlsx(await fixtureXlsx(), {
    sourceUrl: SOURCE, effectiveDate: "2026-07-01", expectedCount: 2, today: "2026-10-26"
  });
  assert.equal(stale.validation.status, "UNVERIFIED");
  assert.equal(stale.validation.reason, "UNIVERSE_STALE");
  const noExpected = await parseOfficialNxtXlsx(await fixtureXlsx(), {
    sourceUrl: SOURCE, effectiveDate: "2026-10-26", today: "2026-10-26"
  });
  assert.equal(noExpected.validation.status, "UNVERIFIED");
  assert.equal(noExpected.validation.reason, "UNIVERSE_EXPECTED_COUNT_REQUIRED");
  assert.equal(noExpected.validation.usableForLive, false);
});

test("parser rejects bad XLSX, non-official sources, missing headers and unknown markets", async () => {
  const malformed = await fixtureXlsx({ malformed: true });
  const normal = await fixtureXlsx();
  const unknownMarket = await fixtureXlsx({ unknownMarket: true });
  await assert.rejects(() => parseOfficialNxtXlsx(malformed, { sourceUrl: SOURCE }), /XLSX_ZIP_SIGNATURE_INVALID/);
  await assert.rejects(() => parseOfficialNxtXlsx(normal, { sourceUrl: "https://example.com/list.xlsx" }), /UNIVERSE_SOURCE_NOT_OFFICIAL/);
  const zip = new JSZip();
  zip.file("xl/workbook.xml", '<workbook xmlns:r="x"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.file("xl/_rels/workbook.xml.rels", '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>');
  zip.file("xl/worksheets/sheet1.xml", "<worksheet><sheetData><row r=\"1\"><c r=\"A1\" t=\"inlineStr\"><is><t>없는 헤더</t></is></c></row></sheetData></worksheet>");
  const missingHeaders = await zip.generateAsync({ type: "nodebuffer" });
  await assert.rejects(() => parseOfficialNxtXlsx(missingHeaders, { sourceUrl: SOURCE }), /XLSX_REQUIRED_COLUMNS_MISSING/);
  await assert.rejects(() => parseOfficialNxtXlsx(unknownMarket, { sourceUrl: SOURCE }), /XLSX_ROWS_INVALID/);
});

test("CLI writes a candidate only when an explicit date is supplied and refuses overwrite", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nxt-universe-import-"));
  try {
    const inputPath = path.join(dir, "official.xlsx");
    const outputPath = path.join(dir, "candidate.json");
    await fs.writeFile(inputPath, await fixtureXlsx());
    const args = [inputPath, `--source-url=${SOURCE}`, "--effective-date=2026-07-01", "--expected-count=2", "--today=2026-07-01", `--out=${outputPath}`];
    const output = [];
    assert.equal(await runUniverseImport(args, { stdout: (line) => output.push(line), stderr: () => {} }), 0);
    const candidate = JSON.parse(await fs.readFile(outputPath, "utf8"));
    assert.equal(candidate.asOf, "2026-07-01");
    assert.equal(candidate.items.length, 2);
    assert.equal(JSON.parse(output[0]).usableForLive, true);
    assert.equal(await runUniverseImport(args, { stdout: () => {}, stderr: () => {} }), 1);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

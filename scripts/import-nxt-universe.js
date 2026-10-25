import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseOfficialNxtXlsx } from "../src/nxt/universe-xlsx.js";

function optionsFrom(args) {
  const result = { input: null };
  for (const arg of args) {
    if (!arg.startsWith("--")) {
      if (result.input) throw new Error("INPUT_FILE_DUPLICATED");
      result.input = arg;
      continue;
    }
    const split = arg.indexOf("=");
    if (split < 0) throw new Error("OPTION_VALUE_MISSING");
    result[arg.slice(2, split)] = arg.slice(split + 1);
  }
  return result;
}

export async function runUniverseImport(args = process.argv.slice(2), { stdout = console.log, stderr = console.error } = {}) {
  try {
    const options = optionsFrom(args);
    if (!options.input || !options["source-url"]) throw new Error("USAGE: node scripts/import-nxt-universe.js <file.xlsx> --source-url=<official-notice-url> [--effective-date=YYYY-MM-DD] [--expected-count=N] [--out=candidate.json]");
    const filePath = path.resolve(options.input);
    const previous = options.previous ? JSON.parse(await fs.readFile(path.resolve(options.previous), "utf8")) : null;
    const result = await parseOfficialNxtXlsx(await fs.readFile(filePath), {
      fileName: path.basename(filePath),
      sourceUrl: options["source-url"],
      effectiveDate: options["effective-date"] ?? null,
      expectedCount: options["expected-count"] == null ? null : Number(options["expected-count"]),
      today: options.today,
      previous
    });
    if (options.out) {
      const candidate = {
        schemaVersion: 1,
        sourceType: result.archive.sourceType,
        sourceUrl: result.archive.sourceUrl,
        fileName: result.archive.fileName,
        sha256: result.archive.sha256,
        downloadedAt: result.archive.downloadedAt,
        asOf: result.archive.effectiveDate,
        items: result.archive.items
      };
      await fs.writeFile(path.resolve(options.out), `${JSON.stringify(candidate, null, 2)}\n`, { flag: "wx" });
    }
    stdout(JSON.stringify({
      status: result.validation.status,
      reason: result.validation.reason,
      sourceUrl: result.archive.sourceUrl,
      fileName: result.archive.fileName,
      sha256: result.archive.sha256,
      sheetNames: result.archive.sheetNames,
      rowsExtracted: result.archive.rowsExtracted,
      uniqueTickerCount: result.validation.count,
      duplicateRowsRemoved: result.archive.duplicateRowsRemoved,
      marketCounts: result.validation.markets,
      effectiveDate: result.validation.effectiveDate,
      usableForLive: result.validation.usableForLive,
      versionDiff: result.validation.diff,
      outputPath: options.out ? path.resolve(options.out) : null
    }));
    return result.validation.status === "VERIFIED" ? 0 : 2;
  } catch (error) {
    const message = String(error?.message ?? "UNIVERSE_IMPORT_FAILED").replace(/[\r\n\t]/g, " ").slice(0, 240);
    stderr(JSON.stringify({ status: "REJECTED", error: message }));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await runUniverseImport();
}

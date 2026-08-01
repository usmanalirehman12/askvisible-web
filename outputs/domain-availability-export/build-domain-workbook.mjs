import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const workDir = path.resolve(".");
const sourcePath = path.resolve(workDir, "..", "..", "DOMAIN-AVAILABILITY.md");
const outputPath = path.join(workDir, "Domain-Availability-Report.xlsx");
const previewDir = path.join(workDir, "previews");

const markdown = await fs.readFile(sourcePath, "utf8");
const completeSection = markdown.split("## Complete results")[1];
if (!completeSection) throw new Error("Complete results section not found.");

const rows = [];
for (const line of completeSection.split(/\r?\n/)) {
  if (!line.startsWith("|") || line.includes("|---") || line.includes("| Name |")) continue;
  const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
  if (cells.length !== 4) continue;
  const [name, ...domainCells] = cells;
  const parsed = domainCells.map((cell) => {
    const match = cell.match(/^([^:]+):\s+\*\*(.+)\*\*$/);
    if (!match) throw new Error(`Could not parse result cell: ${cell}`);
    return { domain: match[1].trim(), status: match[2].trim() };
  });
  rows.push({
    name,
    comDomain: parsed[0].domain,
    comStatus: parsed[0].status,
    aiDomain: parsed[1].domain,
    aiStatus: parsed[1].status,
    ioDomain: parsed[2].domain,
    ioStatus: parsed[2].status,
  });
}

if (rows.length !== 410) throw new Error(`Expected 410 names, parsed ${rows.length}.`);

const availableText = "No registration found";
const statusGroups = ["Registered", availableText, "Unconfirmed"];
const classify = (status) => status.startsWith("Unconfirmed") ? "Unconfirmed" : status;
const counts = {};
for (const tld of ["com", "ai", "io"]) {
  counts[tld] = Object.fromEntries(statusGroups.map((status) => [status, 0]));
  for (const row of rows) counts[tld][classify(row[`${tld}Status`])] += 1;
}
const potentialRows = rows.filter((row) =>
  [row.comStatus, row.aiStatus, row.ioStatus].includes(availableText)
);

const workbook = Workbook.create();
const summary = workbook.worksheets.add("Summary");
const all = workbook.worksheets.add("All Results");
const potential = workbook.worksheets.add("Potentially Available");
workbook.comments.setSelf({ displayName: "User" });

const palette = {
  navy: "#17233C",
  blue: "#2563EB",
  cyan: "#0EA5E9",
  paleBlue: "#E8F1FF",
  green: "#16865B",
  paleGreen: "#E8F7F0",
  red: "#B83A3A",
  paleRed: "#FCECEC",
  amber: "#A96500",
  paleAmber: "#FFF5D9",
  ink: "#1F2937",
  muted: "#667085",
  line: "#D7DEE8",
  white: "#FFFFFF",
  soft: "#F7F9FC",
};

function styleTitle(sheet, range, text) {
  range.merge();
  range.values = [[text]];
  range.format = {
    fill: palette.navy,
    font: { bold: true, color: palette.white, size: 20 },
    verticalAlignment: "center",
  };
  range.format.rowHeight = 38;
}

function addStatusFormats(sheet, rangeAddress) {
  const range = sheet.getRange(rangeAddress);
  range.conditionalFormats.add("containsText", {
    text: availableText,
    format: { fill: palette.paleGreen, font: { color: palette.green, bold: true } },
  });
  range.conditionalFormats.add("containsText", {
    text: "Registered",
    format: { fill: palette.paleRed, font: { color: palette.red } },
  });
  range.conditionalFormats.add("containsText", {
    text: "Unconfirmed",
    format: { fill: palette.paleAmber, font: { color: palette.amber } },
  });
}

function formatDataSheet(sheet, title, subtitle, dataRows, tableName) {
  styleTitle(sheet, sheet.getRange("A1:I1"), title);
  sheet.getRange("A2:I2").merge();
  sheet.getRange("A2").values = [[subtitle]];
  sheet.getRange("A2").format = {
    fill: palette.paleBlue,
    font: { color: palette.ink, italic: true },
    verticalAlignment: "center",
    wrapText: true,
  };
  sheet.getRange("A2:I2").format.rowHeight = 32;

  const headers = [[
    "Name", ".com domain", ".com status", ".ai domain", ".ai status",
    ".io domain", ".io status", "Potentially available?", "Confirmed TLDs"
  ]];
  sheet.getRange("A4:I4").values = headers;
  const body = dataRows.map((row) => [
    row.name, row.comDomain, row.comStatus, row.aiDomain, row.aiStatus,
    row.ioDomain, row.ioStatus, null, null
  ]);
  sheet.getRangeByIndexes(4, 0, body.length, 9).values = body;
  const lastRow = body.length + 4;
  if (body.length) {
    sheet.getRange("H5").formulas = [[
      '=IF(OR(C5="No registration found",E5="No registration found",G5="No registration found"),"Yes","No")'
    ]];
    sheet.getRange(`H5:H${lastRow}`).fillDown();
    sheet.getRange("I5").formulas = [[
      '=TEXTJOIN(", ",TRUE,IF(C5="No registration found",".com",""),IF(E5="No registration found",".ai",""),IF(G5="No registration found",".io",""))'
    ]];
    sheet.getRange(`I5:I${lastRow}`).fillDown();
  }
  const table = sheet.tables.add(`A4:I${lastRow}`, true, tableName);
  table.style = "TableStyleMedium2";
  table.showBandedRows = true;
  table.showFilterButton = true;

  sheet.showGridLines = false;
  sheet.freezePanes.freezeRows(4);
  sheet.freezePanes.freezeColumns(1);
  sheet.getRange(`A4:I${lastRow}`).format.font = { name: "Aptos", size: 10, color: palette.ink };
  sheet.getRange("A4:I4").format = {
    fill: palette.blue,
    font: { bold: true, color: palette.white, size: 10 },
    verticalAlignment: "center",
    wrapText: true,
  };
  sheet.getRange("A4:I4").format.rowHeight = 30;
  sheet.getRange(`A5:I${lastRow}`).format.rowHeight = 20;
  sheet.getRange(`C5:C${lastRow}`).format.wrapText = true;
  sheet.getRange(`E5:E${lastRow}`).format.wrapText = true;
  sheet.getRange(`G5:G${lastRow}`).format.wrapText = true;
  sheet.getRange(`H5:I${lastRow}`).format.horizontalAlignment = "center";
  sheet.getRange("A:A").format.columnWidth = 22;
  sheet.getRange("B:B").format.columnWidth = 24;
  sheet.getRange("C:C").format.columnWidth = 25;
  sheet.getRange("D:D").format.columnWidth = 24;
  sheet.getRange("E:E").format.columnWidth = 25;
  sheet.getRange("F:F").format.columnWidth = 24;
  sheet.getRange("G:G").format.columnWidth = 25;
  sheet.getRange("H:H").format.columnWidth = 20;
  sheet.getRange("I:I").format.columnWidth = 18;
  addStatusFormats(sheet, `C5:C${lastRow}`);
  addStatusFormats(sheet, `E5:E${lastRow}`);
  addStatusFormats(sheet, `G5:G${lastRow}`);
  sheet.getRange(`H5:H${lastRow}`).conditionalFormats.add("containsText", {
    text: "Yes",
    format: { fill: palette.paleGreen, font: { color: palette.green, bold: true } },
  });
}

formatDataSheet(
  all,
  "Domain Availability — Complete Results",
  "All 410 deduplicated product names. Use the filters to shortlist by TLD and verification status.",
  rows,
  "AllDomainResults"
);
formatDataSheet(
  potential,
  "Domain Availability — Confirmed Shortlist",
  `Names with at least one confirmed "${availableText}" result at the time of the RDAP check.`,
  potentialRows,
  "PotentialDomainResults"
);

styleTitle(summary, summary.getRange("A1:F1"), "Domain Availability Report");
summary.getRange("A2:F2").merge();
summary.getRange("A2").values = [[
  "A decision-ready view of 410 candidate product names across .com, .ai and .io."
]];
summary.getRange("A2").format = {
  fill: palette.paleBlue,
  font: { color: palette.ink, italic: true },
  verticalAlignment: "center",
};
summary.getRange("A2:F2").format.rowHeight = 28;

summary.getRange("A4:B4").values = [["Portfolio metric", "Count"]];
summary.getRange("A5:A7").values = [
  ["Unique names checked"],
  ["Names with ≥1 confirmed potential domain"],
  ["Unconfirmed domain checks"],
];
summary.getRange("B5:B7").formulas = [
  ["=COUNTA('All Results'!$A$5:$A$414)"],
  ['=COUNTIF(\'All Results\'!$H$5:$H$414,"Yes")'],
  ["=SUM(D11:D13)"],
];
summary.getRange("A4:B7").format.borders = { preset: "outside", style: "thin", color: palette.line };
summary.getRange("A4:B4").format = {
  fill: palette.blue,
  font: { bold: true, color: palette.white },
};
summary.getRange("B5:B7").format = {
  fill: palette.soft,
  font: { bold: true, color: palette.navy, size: 14 },
  horizontalAlignment: "center",
};

summary.getRange("A10:D10").values = [["TLD", "Registered", "No registration found", "Unconfirmed"]];
summary.getRange("A11:A13").values = [[".com"], [".ai"], [".io"]];
summary.getRange("B11:D13").values = [
  [counts.com.Registered, counts.com[availableText], counts.com.Unconfirmed],
  [counts.ai.Registered, counts.ai[availableText], counts.ai.Unconfirmed],
  [counts.io.Registered, counts.io[availableText], counts.io.Unconfirmed],
];
summary.getRange("A10:D13").format.borders = { preset: "outside", style: "thin", color: palette.line };
summary.getRange("A10:D10").format = {
  fill: palette.navy,
  font: { bold: true, color: palette.white },
  horizontalAlignment: "center",
};
summary.getRange("A11:A13").format = {
  fill: palette.soft,
  font: { bold: true, color: palette.navy },
};
summary.getRange("B11:B13").format = { fill: palette.paleRed, font: { color: palette.red }, horizontalAlignment: "center" };
summary.getRange("C11:C13").format = { fill: palette.paleGreen, font: { color: palette.green, bold: true }, horizontalAlignment: "center" };
summary.getRange("D11:D13").format = { fill: palette.paleAmber, font: { color: palette.amber }, horizontalAlignment: "center" };

summary.getRange("A16:F16").merge();
summary.getRange("A16").values = [["How to interpret the results"]];
summary.getRange("A16").format = { fill: palette.navy, font: { bold: true, color: palette.white } };
summary.getRange("A17:F19").merge(true);
summary.getRange("A17:F19").values = [
  ["No registration found — no RDAP registration record was returned at check time; confirm with a registrar before purchase."],
  ["Registered — an RDAP registration record was returned."],
  ["Unconfirmed — the registry response was rate-limited or otherwise inconclusive and must be checked again."],
];
summary.getRange("A17:F19").format = {
  fill: palette.soft,
  font: { color: palette.ink },
  wrapText: true,
  verticalAlignment: "center",
};
summary.getRange("A17:F19").format.rowHeight = 28;
summary.getRange("A21:F22").merge(true);
summary.getRange("A21:F22").values = [
  ["Important: domain availability changes continuously. Treat this workbook as a research snapshot, not a purchase guarantee."],
  ["Source: DOMAIN-AVAILABILITY.md — authoritative RDAP checks performed by the project domain checker."],
];
summary.getRange("A21:F22").format = {
  fill: palette.paleAmber,
  font: { color: palette.amber, italic: true },
  wrapText: true,
};
summary.getRange("A21:F22").format.rowHeight = 30;
summary.getRange("A:A").format.columnWidth = 40;
summary.getRange("B:D").format.columnWidth = 23;
summary.getRange("E:F").format.columnWidth = 17;
summary.showGridLines = false;
summary.freezePanes.freezeRows(2);
workbook.comments.addThread(
  { cell: summary.getRange("A21") },
  "Domain results are time-sensitive. Recheck any shortlisted domain with an accredited registrar immediately before purchase."
);

await fs.mkdir(previewDir, { recursive: true });
for (const [sheetName, range] of [
  ["Summary", "A1:F22"],
  ["All Results", "A1:I18"],
  ["Potentially Available", "A1:I18"],
]) {
  const preview = await workbook.render({ sheetName, range, scale: 1.25, format: "png" });
  const safeName = sheetName.toLowerCase().replaceAll(" ", "-");
  await fs.writeFile(path.join(previewDir, `${safeName}.png`), new Uint8Array(await preview.arrayBuffer()));
}

const summaryCheck = await workbook.inspect({
  kind: "table",
  range: "Summary!A1:F22",
  include: "values,formulas",
  tableMaxRows: 22,
  tableMaxCols: 6,
});
console.log("SUMMARY_CHECK");
console.log(summaryCheck.ndjson);

const allCheck = await workbook.inspect({
  kind: "table",
  range: "All Results!A4:I10",
  include: "values,formulas",
  tableMaxRows: 10,
  tableMaxCols: 9,
});
console.log("ALL_RESULTS_CHECK");
console.log(allCheck.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log("FORMULA_ERRORS");
console.log(errors.ndjson);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(JSON.stringify({
  outputPath,
  totalRows: rows.length,
  potentialRows: potentialRows.length,
  counts,
}));

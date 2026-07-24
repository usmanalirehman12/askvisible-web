import { readFile, writeFile } from "node:fs/promises";

const source = await readFile(new URL("./domain-check.ps1", import.meta.url), "utf8");
const match = source.match(/\$rawNames = @'\r?\n([\s\S]*?)\r?\n'@/);
if (!match) throw new Error("Could not find the name list.");

const names = [...new Set(
  match[1].split(/\r?\n/).map((name) => name.trim()).filter(Boolean),
)].sort((a, b) => a.localeCompare(b));

const checks = [];
for (const name of names) {
  const label = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const tld of ["com", "ai", "io"]) {
    const domain = `${label}.${tld}`;
    const url = tld === "com"
      ? `https://rdap.verisign.com/com/v1/domain/${domain.toUpperCase()}`
      : `https://rdap.identitydigital.services/rdap/domain/${domain}`;
    checks.push({ name, tld, domain, url });
  }
}

async function check(item) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const response = await fetch(item.url, {
        headers: { accept: "application/rdap+json, application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      if (response.status === 200) return { ...item, status: "Registered" };
      if (response.status === 404) return { ...item, status: "No registration found" };
      if (response.status === 429 || response.status >= 500) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 750));
        continue;
      }
      if (attempt === 6) return { ...item, status: `Unconfirmed (${response.status})` };
    } catch (error) {
      if (attempt === 6) return { ...item, status: "Unconfirmed (network error)" };
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  return { ...item, status: "Unconfirmed (rate limited)" };
}

const results = [];
const concurrency = 4;
let cursor = 0;
async function worker() {
  while (cursor < checks.length) {
    const index = cursor++;
    results[index] = await check(checks[index]);
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));

const grouped = new Map();
for (const result of results) {
  if (!grouped.has(result.name)) grouped.set(result.name, {});
  grouped.get(result.name)[result.tld] = result;
}

const rows = names.map((name) => ({ name, ...grouped.get(name) }));
const available = rows.filter((row) =>
  ["com", "ai", "io"].some((tld) => row[tld].status === "No registration found")
);

function table(items) {
  const lines = [
    "| Name | .com | .ai | .io |",
    "|---|---|---|---|",
  ];
  for (const row of items) {
    lines.push(`| ${row.name} | ${row.com.domain}: **${row.com.status}** | ${row.ai.domain}: **${row.ai.status}** | ${row.io.domain}: **${row.io.status}** |`);
  }
  return lines.join("\n");
}

const now = new Date().toISOString();
const report = `# Product name domain availability

Checked directly against the authoritative RDAP registries at ${now}.

> **No registration found** means the registry returned RDAP 404 at check time. It is not a purchase guarantee: registrar restrictions, premium pricing, reserved names, and simultaneous registrations can still apply.

## Names with at least one potentially available domain

${table(available)}

## Complete results

${table(rows)}
`;

await writeFile(new URL("./DOMAIN-AVAILABILITY.md", import.meta.url), report, "utf8");

const count = (tld, status) => rows.filter((row) => row[tld].status === status).length;
console.log(JSON.stringify({
  namesChecked: rows.length,
  domainsChecked: results.length,
  comAvailable: count("com", "No registration found"),
  aiAvailable: count("ai", "No registration found"),
  ioAvailable: count("io", "No registration found"),
  anyAvailable: available.length,
  unconfirmed: results.filter((result) => result.status.startsWith("Unconfirmed")).length,
}, null, 2));

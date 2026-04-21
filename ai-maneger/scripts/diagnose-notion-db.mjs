#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envText = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter((line) => line && !line.trim().startsWith("#"))
    .map((line) => {
      const idx = line.indexOf("=");
      if (idx < 0) return ["", ""];
      const k = line.slice(0, idx).trim();
      let v = line.slice(idx + 1).trim();
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      return [k, v];
    })
    .filter(([k]) => k),
);

const token = env.NOTION_API_KEY;
const version = env.NOTION_API_VERSION || "2022-06-28";
if (!token) {
  console.error("NOTION_API_KEY missing");
  process.exit(1);
}

const targets = [
  ["DAILY_SALES", env.NOTION_OOTSUKI_DAILY_SALES_DB_ID],
  ["KPI", env.NOTION_OOTSUKI_KPI_DB_ID],
  ["MEMO", env.NOTION_OOTSUKI_MEMO_DB_ID],
  ["WEEKLY_ACTIONS", env.NOTION_OOTSUKI_WEEKLY_ACTIONS_DB_ID],
  ["PRODUCT_COST", env.NOTION_OOTSUKI_PRODUCT_COST_DB_ID],
].filter(([, id]) => id);

const headers = {
  Authorization: `Bearer ${token}`,
  "Notion-Version": version,
  "Content-Type": "application/json",
};

async function probe(label, id) {
  const out = { label, id, databaseOk: false, dataSources: [], queryDbOk: false, queryDsOk: false, notes: [] };
  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${id}`, { headers });
    const json = await res.json();
    if (res.ok) {
      out.databaseOk = true;
      out.dataSources = Array.isArray(json.data_sources)
        ? json.data_sources.map((d) => ({ id: d.id, name: d.name }))
        : [];
    } else {
      out.notes.push(`/databases/{id}: ${res.status} ${json.message || ""}`);
    }
  } catch (e) {
    out.notes.push(`/databases/{id} ERR: ${e.message}`);
  }

  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${id}/query`, {
      method: "POST",
      headers,
      body: JSON.stringify({ page_size: 1 }),
    });
    const json = await res.json();
    if (res.ok) out.queryDbOk = true;
    else out.notes.push(`/databases/{id}/query: ${res.status} ${json.message || ""}`);
  } catch (e) {
    out.notes.push(`/databases/{id}/query ERR: ${e.message}`);
  }

  try {
    const res = await fetch(`https://api.notion.com/v1/data-sources/${id}/query`, {
      method: "POST",
      headers,
      body: JSON.stringify({ page_size: 1 }),
    });
    const json = await res.json();
    if (res.ok) out.queryDsOk = true;
    else out.notes.push(`/data-sources/{id}/query: ${res.status} ${json.message || ""}`);
  } catch (e) {
    out.notes.push(`/data-sources/{id}/query ERR: ${e.message}`);
  }

  return out;
}

for (const [label, id] of targets) {
  const r = await probe(label, id);
  console.log(`\n=== ${label} (${id}) ===`);
  console.log(`database endpoint OK: ${r.databaseOk}`);
  console.log(`data_sources:`, r.dataSources);
  console.log(`/databases/{id}/query OK: ${r.queryDbOk}`);
  console.log(`/data-sources/{id}/query OK: ${r.queryDsOk}`);
  if (r.notes.length) console.log("notes:", r.notes.join(" | "));
}

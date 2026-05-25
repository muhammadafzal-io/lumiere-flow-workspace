import { google } from "googleapis";
import type { OpsLogEntry } from "@/types";

const TIMEZONE = "America/Chicago";

function getSheetsClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");

  const credentials = JSON.parse(raw) as object;
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

function spreadsheetId() {
  const id = process.env.GOOGLE_SHEETS_ID;
  if (!id) throw new Error("Missing GOOGLE_SHEETS_ID env var");
  return id;
}

function tabName() {
  return process.env.GOOGLE_SHEETS_TAB ?? "Operations Log";
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
}

const HEADER_ROW = [
  "Timestamp",
  "Event Type",
  "Client Name",
  "Phone",
  "Email",
  "Client ID",
  "Details",
  "Status",
  "Platform",
];

async function ensureHeader(): Promise<void> {
  const sheets = getSheetsClient();
  const range = `${tabName()}!A1:I1`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range,
  });
  if (!res.data.values?.length) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: spreadsheetId(),
      range,
      valueInputOption: "RAW",
      requestBody: { values: [HEADER_ROW] },
    });
  }
}

export async function appendOpsLog(entry: OpsLogEntry): Promise<void> {
  await ensureHeader();
  const sheets = getSheetsClient();

  await sheets.spreadsheets.values.append({
    spreadsheetId: spreadsheetId(),
    range: `${tabName()}!A:I`,
    valueInputOption: "RAW",
    requestBody: {
      values: [
        [
          formatTimestamp(entry.timestamp),
          entry.eventType,
          entry.clientName,
          entry.phone ?? "",
          entry.email ?? "",
          entry.clientId ?? "",
          entry.details,
          entry.status,
          entry.platform,
        ],
      ],
    },
  });
}

export async function readOpsLog(limit = 500): Promise<(OpsLogEntry & { id: string })[]> {
  await ensureHeader();
  const sheets = getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: `${tabName()}!A:I`,
  });

  const rows = res.data.values ?? [];
  if (rows.length <= 1) return []; // header only

  // Skip header row, most-recent first
  return rows
    .slice(1)
    .reverse()
    .slice(0, limit)
    .map((row, i) => ({
      id: `row_${i}`,
      timestamp: row[0] ?? "",
      eventType: (row[1] ?? "inquiry") as OpsLogEntry["eventType"],
      clientName: row[2] ?? "",
      phone: row[3] ?? "",
      email: row[4] ?? "",
      clientId: row[5] ?? "",
      details: row[6] ?? "",
      status: (row[7] ?? "success") as OpsLogEntry["status"],
      platform: row[8] ?? "",
    }));
}

export async function logEvent(
  type: OpsLogEntry["eventType"],
  clientName: string,
  details: string,
  opts: {
    clientId?: string;
    phone?: string;
    email?: string;
    status?: OpsLogEntry["status"];
    platform?: string;
  } = {},
): Promise<void> {
  try {
    await appendOpsLog({
      timestamp: new Date().toISOString(),
      eventType: type,
      clientName,
      clientId: opts.clientId,
      phone: opts.phone,
      email: opts.email,
      details,
      status: opts.status ?? "success",
      platform: opts.platform ?? "system",
    });
  } catch (err) {
    void err;
  }
}

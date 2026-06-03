// lib/drive.ts
// Google Drive Integration via Service Account.
// Optional — ohne GOOGLE_SERVICE_ACCOUNT_KEY ist driveEnabled = false.

import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import { Readable } from "stream";

const keyB64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
const parentFolderId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;

export const driveEnabled = Boolean(keyB64);

function getDrive() {
  if (!keyB64) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY fehlt.");
  const credentials = JSON.parse(Buffer.from(keyB64, "base64").toString("utf-8"));
  const auth = new GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return google.drive({ version: "v3", auth });
}

async function findFolder(
  drive: ReturnType<typeof google.drive>,
  name: string
): Promise<string | null> {
  let q = `mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and trashed=false`;
  if (parentFolderId) {
    q += ` and '${parentFolderId}' in parents`;
  }
  const res = await drive.files.list({
    q,
    fields: "files(id, name)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    ...(parentFolderId ? { corpora: "allDrives" } : {}),
  });
  return res.data.files?.[0]?.id ?? null;
}

async function createFolder(
  drive: ReturnType<typeof google.drive>,
  name: string
): Promise<string> {
  if (!parentFolderId) {
    throw new Error(
      `Kundenordner "${name}" nicht gefunden. Setze GOOGLE_DRIVE_PARENT_FOLDER_ID, damit fehlende Ordner automatisch angelegt werden.`
    );
  }
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentFolderId],
    },
    fields: "id",
    supportsAllDrives: true,
  });
  return res.data.id!;
}

export async function uploadToDrive(opts: {
  buffer: Buffer;
  personName?: string;
  companyName?: string;
}): Promise<{ fileLink: string; folderName: string }> {
  const drive = getDrive();
  const searchName = opts.personName || opts.companyName;
  if (!searchName) {
    throw new Error("Person oder Unternehmen muss angegeben werden.");
  }

  // Ordner suchen: erst personName, Fallback companyName
  let folderId = await findFolder(drive, searchName);
  let folderName = searchName;
  if (!folderId && opts.personName && opts.companyName) {
    folderId = await findFolder(drive, opts.companyName);
    folderName = opts.companyName;
  }

  // Kein Ordner gefunden -> anlegen oder Fehler
  if (!folderId) {
    folderId = await createFolder(drive, searchName);
    folderName = searchName;
  }

  const fileName = `${opts.personName || opts.companyName || "Profil"}_LinkedIn-Profil.docx`;

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
    media: {
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      body: Readable.from(opts.buffer),
    },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });

  return {
    fileLink: res.data.webViewLink || `https://drive.google.com/file/d/${res.data.id}/view`,
    folderName,
  };
}

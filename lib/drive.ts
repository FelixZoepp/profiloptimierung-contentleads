// lib/drive.ts
// Google Drive Integration via Service Account.
// Erstellt Kundenordner mit Unterordnern (wie Referenz-Drive) und lädt Bilder + Doc hoch.

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

type DriveAPI = ReturnType<typeof google.drive>;

async function findFolder(drive: DriveAPI, name: string, parentId?: string): Promise<string | null> {
  let q = `mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and trashed=false`;
  if (parentId) q += ` and '${parentId}' in parents`;
  const res = await drive.files.list({
    q,
    fields: "files(id, name)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    ...(parentId ? { corpora: "allDrives" } : {}),
  });
  return res.data.files?.[0]?.id ?? null;
}

async function createFolder(drive: DriveAPI, name: string, parentId: string): Promise<string> {
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
    supportsAllDrives: true,
  });
  return res.data.id!;
}

async function ensureFolder(drive: DriveAPI, name: string, parentId: string): Promise<string> {
  const existing = await findFolder(drive, name, parentId);
  if (existing) return existing;
  return createFolder(drive, name, parentId);
}

async function uploadFile(
  drive: DriveAPI,
  folderId: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
      mimeType,
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });
  return res.data.webViewLink || `https://drive.google.com/file/d/${res.data.id}/view`;
}

// ── Unterordner-Struktur (wie Referenz-Drive) ────────────────
const SUBFOLDERS = [
  "Profilbild",
  "Personen-Seite Banner",
  "Firmen-Seite Banner",
  "Berufserfahrung",
  "Serviceleistungen",
  "Im Fokus",
] as const;

// Mapping: Bild-Key → Unterordner + Dateiname
function getImageDestination(
  imageKey: string,
  personName: string
): { subfolder: string; fileName: string } {
  const name = personName || "Kunde";

  if (imageKey === "profilbild")
    return { subfolder: "Profilbild", fileName: "Profilbild.png" };
  if (imageKey === "personen-banner")
    return { subfolder: "Personen-Seite Banner", fileName: `Banner ${name}.png` };
  if (imageKey === "firmen-banner")
    return { subfolder: "Firmen-Seite Banner", fileName: "Firmen Banner.png" };
  if (imageKey === "berufserfahrung")
    return { subfolder: "Berufserfahrung", fileName: "Berufserfahrung.png" };
  if (imageKey.startsWith("serviceleistung-")) {
    const num = imageKey.split("-")[1];
    return { subfolder: "Serviceleistungen", fileName: `Kachel ${num}.png` };
  }
  if (imageKey.startsWith("im-fokus-")) {
    const num = imageKey.split("-")[2];
    return { subfolder: "Im Fokus", fileName: `Im Fokus ${num}.png` };
  }
  return { subfolder: "", fileName: `${imageKey}.png` };
}

// ── Hauptfunktion: Kompletten Kundenordner erstellen ─────────
export interface DriveUploadInput {
  personName?: string;
  companyName?: string;
  docBuffer: Buffer;
  images: Array<{ key: string; b64: string }>;
}

export async function uploadCustomerFolder(
  input: DriveUploadInput
): Promise<{ folderLink: string; folderName: string; fileCount: number }> {
  const drive = getDrive();
  const searchName = input.personName || input.companyName;
  if (!searchName) throw new Error("Person oder Unternehmen muss angegeben werden.");

  if (!parentFolderId) {
    throw new Error("GOOGLE_DRIVE_PARENT_FOLDER_ID fehlt — wird benötigt für die Ordnerstruktur.");
  }

  // Kundenordner finden oder erstellen
  let mainFolderId = await findFolder(drive, searchName, parentFolderId);
  if (!mainFolderId && input.personName && input.companyName) {
    mainFolderId = await findFolder(drive, input.companyName, parentFolderId);
  }
  if (!mainFolderId) {
    mainFolderId = await createFolder(drive, searchName, parentFolderId);
  }

  let fileCount = 0;

  // Unterordner erstellen + Bilder hochladen
  if (input.images.length > 0) {
    // Alle benötigten Unterordner vorab erstellen
    const neededSubfolders = new Set<string>();
    for (const img of input.images) {
      const dest = getImageDestination(img.key, input.personName || "");
      if (dest.subfolder) neededSubfolders.add(dest.subfolder);
    }

    const subfolderIds: Record<string, string> = {};
    for (const sf of neededSubfolders) {
      subfolderIds[sf] = await ensureFolder(drive, sf, mainFolderId);
    }

    // Bilder hochladen
    for (const img of input.images) {
      const dest = getImageDestination(img.key, input.personName || "");
      const parentId = dest.subfolder ? subfolderIds[dest.subfolder] : mainFolderId;
      const buffer = Buffer.from(img.b64, "base64");
      await uploadFile(drive, parentId, dest.fileName, buffer, "image/png");
      fileCount++;
    }
  }

  // Word-Dokument in den Hauptordner
  const docName = `Profil-und-Content_${input.personName || input.companyName || "Profil"}.docx`;
  await uploadFile(
    drive,
    mainFolderId,
    docName,
    input.docBuffer,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
  fileCount++;

  const folderLink = `https://drive.google.com/drive/folders/${mainFolderId}`;

  return { folderLink, folderName: searchName, fileCount };
}

// Legacy-Funktion für Abwärtskompatibilität
export async function uploadToDrive(opts: {
  buffer: Buffer;
  personName?: string;
  companyName?: string;
}): Promise<{ fileLink: string; folderName: string }> {
  const result = await uploadCustomerFolder({
    personName: opts.personName,
    companyName: opts.companyName,
    docBuffer: opts.buffer,
    images: [],
  });
  return { fileLink: result.folderLink, folderName: result.folderName };
}

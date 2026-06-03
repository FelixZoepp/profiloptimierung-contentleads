// app/api/drive/route.ts
import { Packer } from "docx";
import { splitSections, buildDocument } from "@/lib/buildDocx";
import { driveEnabled, uploadToDrive } from "@/lib/drive";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (!driveEnabled) {
      return Response.json(
        { error: "Google Drive ist nicht konfiguriert. Bitte GOOGLE_SERVICE_ACCOUNT_KEY in Vercel setzen." },
        { status: 400 }
      );
    }

    const { personName, companyName, result } = await req.json();

    if (!result || result.trim().length < 20) {
      return Response.json({ error: "Kein Profil-Ergebnis vorhanden." }, { status: 400 });
    }

    const sections = splitSections(result);
    const doc = buildDocument(sections, personName, companyName);
    const buffer = await Packer.toBuffer(doc);

    const { fileLink, folderName } = await uploadToDrive({
      buffer: Buffer.from(buffer),
      personName: personName || undefined,
      companyName: companyName || undefined,
    });

    return Response.json({ ok: true, fileLink, folderName });
  } catch (err: any) {
    return Response.json(
      { error: err?.message || "Drive-Upload fehlgeschlagen." },
      { status: 500 }
    );
  }
}

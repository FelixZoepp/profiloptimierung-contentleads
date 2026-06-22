// app/api/drive/route.ts
// Erstellt den kompletten Kundenordner in Google Drive:
// Unterordner + PNGs + Word-Dokument (wie Referenz-Struktur).
import { Packer } from "docx";
import { splitSections, buildDocument } from "@/lib/buildDocx";
import { driveEnabled, uploadCustomerFolder } from "@/lib/drive";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (!driveEnabled) {
      return Response.json(
        { error: "Google Drive nicht konfiguriert. Bitte GOOGLE_SERVICE_ACCOUNT_KEY in Vercel setzen." },
        { status: 400 }
      );
    }

    const { personName, companyName, result, images } = (await req.json()) as {
      personName?: string;
      companyName?: string;
      result: string;
      images?: Array<{ key: string; b64: string }>;
    };

    if (!result || result.trim().length < 20) {
      return Response.json({ error: "Kein Profil-Ergebnis vorhanden." }, { status: 400 });
    }

    // Word-Dokument bauen
    const sections = splitSections(result);
    const doc = buildDocument(sections, personName, companyName);
    const buffer = await Packer.toBuffer(doc);

    // Alles in Drive hochladen (Ordnerstruktur + Bilder + Doc)
    const { folderLink, folderName, fileCount } = await uploadCustomerFolder({
      personName: personName || undefined,
      companyName: companyName || undefined,
      docBuffer: Buffer.from(buffer),
      images: images || [],
    });

    return Response.json({
      ok: true,
      fileLink: folderLink,
      folderName,
      fileCount,
    });
  } catch (err: any) {
    return Response.json(
      { error: err?.message || "Drive-Upload fehlgeschlagen." },
      { status: 500 }
    );
  }
}

// app/api/images/route.ts
// Generiert LinkedIn-Bilder per OpenAI Edit-Modus + Sharp Post-Processing.
import { imagesEnabled, generateLinkedInImage, buildImagePrompt } from "@/lib/openai";
import { processForLinkedIn } from "@/lib/imageProcessor";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (!imagesEnabled) {
      return Response.json(
        { error: "OPENAI_API_KEY fehlt. Bild-Generierung nicht verfügbar." },
        { status: 400 }
      );
    }

    const body = await req.json();
    const {
      type,
      colors,
      texts,
      photoBase64,
      personName,
      companyName,
      feedback,
      existingImageB64,
    } = body as {
      type: string;
      colors: { primary: string; secondary: string };
      texts: Record<string, string>;
      photoBase64?: string;
      personName?: string;
      companyName?: string;
      feedback?: string;
      existingImageB64?: string;
    };

    if (!type) {
      return Response.json({ error: "Bildtyp fehlt." }, { status: 400 });
    }

    // Prompt bauen
    let prompt = buildImagePrompt({
      type,
      colors: colors || { primary: "#1a2238", secondary: "#c2613f" },
      texts: texts || {},
      personName,
      companyName,
      hasPhoto: Boolean(photoBase64),
    });

    // Feedback-basierte Anpassung
    if (feedback) {
      prompt += `\n\nADDITIONAL ADJUSTMENT: ${feedback}. Keep everything else the same but apply this change.`;
    }

    // Bild generieren — bei Feedback das bestehende Bild als Vorlage nutzen
    const raw = await generateLinkedInImage({
      type,
      prompt,
      photoBase64: existingImageB64 || photoBase64,
    });

    // Post-Processing: Crop + Resize auf LinkedIn-Maße
    const processed = await processForLinkedIn(raw.b64, type);

    return Response.json({
      b64: processed.b64,
      width: processed.width,
      height: processed.height,
      type,
    });
  } catch (err: any) {
    console.error("Image generation error:", err);
    return Response.json(
      { error: err?.message || "Bild-Generierung fehlgeschlagen." },
      { status: 500 }
    );
  }
}

// app/api/images/route.ts
import { generateImage, editImage, imagesEnabled, ImageRatio } from "@/lib/openai";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (!imagesEnabled) {
      return Response.json(
        { error: "Bild-Generierung ist nicht konfiguriert. Bitte OPENAI_API_KEY in Vercel setzen." },
        { status: 400 }
      );
    }
    const body = (await req.json()) as {
      prompt: string;
      ratio?: ImageRatio;
      imageBase64?: string; // Vorlage (optional) -> Edit-Modus
      width?: number;
      height?: number;
    };

    if (!body.prompt || body.prompt.trim().length < 5) {
      return Response.json({ error: "Kein gültiger Bild-Prompt." }, { status: 400 });
    }

    // Mit Vorlage -> Edit (Format soweit erlaubt erhalten, input_fidelity high)
    if (body.imageBase64 && body.width && body.height) {
      const out = await editImage({
        imageBase64: body.imageBase64,
        prompt: body.prompt,
        width: body.width,
        height: body.height,
      });
      return Response.json({ b64: out.b64, size: out.size, clamped: out.clamped });
    }

    // Ohne Vorlage -> reine Generierung
    const img = await generateImage(body.prompt, body.ratio === "landscape" ? "landscape" : "square");
    return Response.json({ b64: img.b64 });
  } catch (err: any) {
    return Response.json(
      { error: err?.message || "Bild-Generierung fehlgeschlagen." },
      { status: 500 }
    );
  }
}


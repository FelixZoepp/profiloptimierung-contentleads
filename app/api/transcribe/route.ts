// app/api/transcribe/route.ts
// Nimmt eine Audio-/Video-Datei entgegen und gibt das Transkript als Text zurück.
// Nutzt OpenAI Whisper (gleicher OPENAI_API_KEY wie für Bilder).

import OpenAI, { toFile } from "openai";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "OPENAI_API_KEY fehlt. Transkription ist nicht verfügbar." },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return Response.json({ error: "Keine Datei hochgeladen." }, { status: 400 });
    }

    // Max 25 MB (Whisper-Limit)
    if (file.size > 25 * 1024 * 1024) {
      return Response.json(
        { error: "Datei zu groß (max. 25 MB). Bitte kürzer schneiden oder komprimieren." },
        { status: 400 }
      );
    }

    const client = new OpenAI({ apiKey });
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadFile = await toFile(buffer, file.name, { type: file.type });

    const transcription = await client.audio.transcriptions.create({
      file: uploadFile,
      model: "whisper-1",
      language: "de",
      response_format: "text",
    });

    return Response.json({ transcript: transcription });
  } catch (err: any) {
    return Response.json(
      { error: err?.message || "Transkription fehlgeschlagen." },
      { status: 500 }
    );
  }
}

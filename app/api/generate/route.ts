// app/api/generate/route.ts
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, buildUserMessage } from "@/lib/systemPrompt";
import { saveGeneration } from "@/lib/supabase";

export const maxDuration = 300; // bis zu 5 Min (Recherche + langer Text)
export const dynamic = "force-dynamic";

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";

export async function POST(req: Request) {
  try {
    const { personName, companyName, transcript } = await req.json();

    if (!transcript || transcript.trim().length < 50) {
      return Response.json(
        { error: "Bitte ein Transkript einfügen (mindestens ein paar Sätze)." },
        { status: 400 }
      );
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json(
        { error: "ANTHROPIC_API_KEY fehlt. Bitte in den Vercel-Umgebungsvariablen setzen." },
        { status: 500 }
      );
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Streaming-Antwort an den Browser
    const encoder = new TextEncoder();
    let fullText = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const messageStream = anthropic.messages.stream({
            model: MODEL,
            max_tokens: 8000,
            system: SYSTEM_PROMPT,
            tools: [
              {
                // Web-Recherche, damit der Bot die Firma verifizieren kann.
                // web_search_20260209 = neueste Version (Opus 4.8/4.7/4.6, Sonnet 4.6).
                // Bei älteren Modellen auf "web_search_20250305" zurückfallen.
                type: (process.env.WEB_SEARCH_VERSION as any) || "web_search_20260209",
                name: "web_search",
                max_uses: 5,
              } as any,
            ],
            messages: [
              { role: "user", content: buildUserMessage({ personName, companyName, transcript }) },
            ],
          });

          messageStream.on("text", (text) => {
            fullText += text;
            controller.enqueue(encoder.encode(text));
          });

          await messageStream.finalMessage();
          controller.close();

          // Nach Abschluss optional in Supabase speichern (blockt den Stream nicht)
          saveGeneration({
            person_name: personName || null,
            company_name: companyName || null,
            transcript,
            result: fullText,
            model: MODEL,
          }).catch((e) => console.error("Supabase save failed:", e));
        } catch (err: any) {
          const msg = "\n\n[FEHLER] " + (err?.message || "Unbekannter Fehler bei der Generierung.");
          controller.enqueue(encoder.encode(msg));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (err: any) {
    return Response.json(
      { error: err?.message || "Ungültige Anfrage." },
      { status: 400 }
    );
  }
}

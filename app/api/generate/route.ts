// app/api/generate/route.ts
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, buildUserMessage } from "@/lib/systemPrompt";
import { saveGeneration } from "@/lib/supabase";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";

export async function POST(req: Request) {
  try {
    const { personName, companyName, websiteUrl, transcript, additionalInfo } =
      await req.json();

    if (!personName && !companyName && !websiteUrl) {
      return Response.json(
        { error: "Bitte mindestens Name, Unternehmen oder Website angeben." },
        { status: 400 }
      );
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json(
        { error: "ANTHROPIC_API_KEY fehlt." },
        { status: 500 }
      );
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const encoder = new TextEncoder();
    let fullText = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const messageStream = anthropic.messages.stream({
            model: MODEL,
            max_tokens: 10000,
            system: SYSTEM_PROMPT,
            tools: [
              {
                type:
                  (process.env.WEB_SEARCH_VERSION as any) ||
                  "web_search_20260209",
                name: "web_search",
                max_uses: 8,
              } as any,
            ],
            messages: [
              {
                role: "user",
                content: buildUserMessage({
                  personName,
                  companyName,
                  websiteUrl,
                  transcript,
                  additionalInfo,
                }),
              },
            ],
          });

          messageStream.on("text", (text) => {
            fullText += text;
            controller.enqueue(encoder.encode(text));
          });

          await messageStream.finalMessage();
          controller.close();

          saveGeneration({
            person_name: personName || null,
            company_name: companyName || null,
            transcript: transcript || websiteUrl || "",
            result: fullText,
            model: MODEL,
          }).catch((e) => console.error("Supabase save failed:", e));
        } catch (err: any) {
          const msg =
            "\n\n[FEHLER] " +
            (err?.message || "Unbekannter Fehler bei der Generierung.");
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

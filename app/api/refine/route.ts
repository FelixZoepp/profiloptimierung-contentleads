// app/api/refine/route.ts
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "@/lib/systemPrompt";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";

const REFINE_SUFFIX = `

ZUSATZ-ANWEISUNG (Überarbeitungsmodus):
Du überarbeitest ein BESTEHENDES Profil. Wende NUR die Änderung des Nutzers an und lass alles andere exakt unverändert. Behalte die Markdown-Struktur und alle ## Überschriften bei. Halte alle Methodik-Regeln und Zeichenlimits weiter ein. Gib IMMER das KOMPLETTE überarbeitete Profil zurück, niemals nur das geänderte Stück.`;

export async function POST(req: Request) {
  try {
    const { currentProfile, instruction, history, personName, companyName } =
      await req.json();

    if (!currentProfile || currentProfile.trim().length < 20) {
      return Response.json(
        { error: "Kein Profil zum Überarbeiten vorhanden." },
        { status: 400 }
      );
    }
    if (!instruction || instruction.trim().length < 2) {
      return Response.json(
        { error: "Bitte eine Änderungsanweisung eingeben." },
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

    // Messages aufbauen: Kontext → History → neue Anweisung
    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: `Hier ist der Kontext. Person: ${personName || "(unbekannt)"}. Unternehmen: ${companyName || "(unbekannt)"}.

=== AKTUELLES PROFIL ===
${currentProfile}
=== ENDE PROFIL ===

Überarbeite dieses Profil nach den folgenden Anweisungen.`,
      },
      {
        role: "assistant",
        content:
          "Verstanden. Ich habe das aktuelle Profil gelesen und werde nur die gewünschten Änderungen vornehmen, alles andere unverändert lassen und das KOMPLETTE Profil im selben Markdown-Format zurückgeben. Was soll ich ändern?",
      },
    ];

    // Bisherige History einfügen
    if (Array.isArray(history)) {
      for (const h of history) {
        if (h.role === "user" || h.role === "assistant") {
          messages.push({ role: h.role, content: h.content });
        }
      }
    }

    // Neue Anweisung
    messages.push({ role: "user", content: instruction });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const messageStream = anthropic.messages.stream({
            model: MODEL,
            max_tokens: 8000,
            system: SYSTEM_PROMPT + REFINE_SUFFIX,
            messages,
          });

          messageStream.on("text", (text) => {
            controller.enqueue(encoder.encode(text));
          });

          await messageStream.finalMessage();
          controller.close();
        } catch (err: any) {
          const msg =
            "\n\n[FEHLER] " +
            (err?.message || "Unbekannter Fehler bei der Überarbeitung.");
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

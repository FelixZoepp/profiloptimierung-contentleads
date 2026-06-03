// lib/openai.ts
// Bild-Generierung & -Bearbeitung über die OpenAI Images API (GPT-Image).
// Optional: ohne OPENAI_API_KEY ist der Bild-Schritt einfach deaktiviert.
import OpenAI, { toFile } from "openai";

const apiKey = process.env.OPENAI_API_KEY;
export const imagesEnabled = Boolean(apiKey);

const client = imagesEnabled ? new OpenAI({ apiKey }) : null;

// Generierung: gpt-image-1 reicht (feste Größen, günstig).
const GEN_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
// Bearbeitung (Vorlage rein): gpt-image-2 — erlaubt eigene Größen + input_fidelity.
const EDIT_MODEL = process.env.OPENAI_EDIT_MODEL || "gpt-image-2";

export type ImageRatio = "square" | "landscape";

function sizeFor(ratio: ImageRatio): "1024x1024" | "1536x1024" {
  return ratio === "landscape" ? "1536x1024" : "1024x1024";
}

// Wandelt beliebige Eingabemaße in eine gültige gpt-image-2-Größe:
// Kanten durch 16 teilbar, Seitenverhältnis geklemmt auf 1:3 .. 3:1,
// Zielfläche im erlaubten Bereich (>= ~655k Pixel).
export function validEditSize(w: number, h: number): { size: string; clamped: boolean } {
  const rawAr = w / h;
  const ar = Math.max(1 / 3, Math.min(3, rawAr));
  const clamped = Math.abs(ar - rawAr) > 0.01;
  const targetArea = 1_400_000;
  let nh = Math.sqrt(targetArea / ar);
  let nw = ar * nh;
  const round16 = (x: number) => Math.max(256, Math.round(x / 16) * 16);
  return { size: `${round16(nw)}x${round16(nh)}`, clamped };
}

export interface GeneratedImage {
  b64: string;
  prompt: string;
}

export async function generateImage(
  prompt: string,
  ratio: ImageRatio,
  quality: "low" | "medium" | "high" = "medium"
): Promise<GeneratedImage> {
  if (!client) throw new Error("OPENAI_API_KEY fehlt — Bild-Generierung ist deaktiviert.");
  const res = await client.images.generate({
    model: GEN_MODEL,
    prompt,
    size: sizeFor(ratio),
    quality,
    n: 1,
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("Kein Bild zurückgegeben.");
  return { b64, prompt };
}

// Vorlage (base64-PNG/JPG) + Prompt -> bearbeitetes Bild, Format soweit erlaubt erhalten.
export async function editImage(opts: {
  imageBase64: string; // ohne data:-Präfix
  prompt: string;
  width: number;
  height: number;
}): Promise<{ b64: string; size: string; clamped: boolean }> {
  if (!client) throw new Error("OPENAI_API_KEY fehlt — Bild-Generierung ist deaktiviert.");
  const { size, clamped } = validEditSize(opts.width, opts.height);
  const buf = Buffer.from(opts.imageBase64, "base64");
  const file = await toFile(buf, "vorlage.png", { type: "image/png" });
  const res = await client.images.edit({
    model: EDIT_MODEL,
    image: file as any,
    prompt: opts.prompt,
    size: size as any,
    input_fidelity: "high" as any,
    n: 1,
  } as any);
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("Kein Bild zurückgegeben.");
  return { b64, size, clamped };
}


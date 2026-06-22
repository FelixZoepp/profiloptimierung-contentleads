// lib/openai.ts
// OpenAI Images API: Generate + Edit für alle LinkedIn-Bildtypen.
import OpenAI, { toFile } from "openai";
import { readFileSync } from "fs";
import path from "path";
import { IMAGE_SPECS } from "./imageProcessor";

const apiKey = process.env.OPENAI_API_KEY;
export const imagesEnabled = Boolean(apiKey);

const client = imagesEnabled ? new OpenAI({ apiKey }) : null;

const EDIT_MODEL = process.env.OPENAI_EDIT_MODEL || "gpt-image-2";

// ── Template laden ──────────────────────────────────────────────
function loadTemplate(filename: string): Buffer {
  const p = path.join(process.cwd(), "public", "templates", filename);
  return readFileSync(p);
}

const TEMPLATE_FILES: Record<string, string> = {
  "personen-banner": "banner-template.png",
  "firmen-banner": "firmen-banner-template.png",
  serviceleistung: "kachel-template.png",
  "im-fokus": "fokus-template.png",
  berufserfahrung: "berufserfahrung-template.png",
};

// ── Prompt-Templates pro Bildtyp ────────────────────────────────
export function buildImagePrompt(opts: {
  type: string;
  colors: { primary: string; secondary: string };
  texts: Record<string, string>;
  personName?: string;
  companyName?: string;
  hasPhoto?: boolean;
}): string {
  const { type, colors, texts, personName, companyName, hasPhoto } = opts;
  const c1 = colors.primary;
  const c2 = colors.secondary;

  switch (type) {
    case "profilbild":
      return `STRICT IDENTITY PRESERVATION: Edit ONLY the background of this portrait photo.
The person in the photo must remain COMPLETELY UNCHANGED — same face, same expression, same pose, same angle, same hair, same clothing, same skin tone, same lighting on the face. Do NOT alter, reposition, reshape, or re-render ANY part of the person's body or face. Do NOT change the person's pose or head angle. The person must be 100% recognizable as the exact same person in the original photo.
ONLY change the background: replace it with a clean, smooth gradient from white (top-left) to ${c1} (bottom-right). Keep the original framing (head and shoulders). Square crop.
No text in the image.`;

    case "personen-banner":
      return `Edit this LinkedIn banner design. Keep the same overall composition and layout style.
${hasPhoto ? "Keep the cut-out person on the right side of the banner." : "Leave the right side with a clean branded area."}
Replace all brand colours with primary ${c1} and secondary/CTA colour ${c2}.
On the left side, display this headline text in large, bold font: "${texts.headline || ""}"
Below it in smaller text: "${texts.subline || ""}"
Add a prominent CTA button in ${c2} colour with text: "${texts.cta || ""}"
The button should be placed center-left, below the subline.
${hasPhoto ? `The person is ${personName || "the client"} from ${companyName || "the company"}.` : ""}
Keep the background relevant to the industry. Professional, clean design.`;

    case "firmen-banner":
      return `Edit this company page LinkedIn banner. Keep the same horizontal, very flat layout.
Replace brand colours with primary ${c1} and secondary ${c2}.
Left side: subtle industry-relevant background imagery.
Center: headline "${texts.headline || ""}" in bold ${c1} font.
Below: "${texts.subline || ""}" in smaller text.
Right side: CTA button in ${c2} with text "${texts.cta || ""}".
Very flat banner (will be cropped to ~6:1). Keep all elements in the vertical center strip.
No person/photo — this is the company page banner.`;

    case "serviceleistung":
      return `Edit this LinkedIn service tile design. Keep the same clean, minimal square layout.
Replace brand colours with primary ${c1} and accent ${c2}.
IMPORTANT: Place the service title text VERTICALLY CENTERED in the image (in the middle 40% vertically).
The title is: "${texts.serviceTitle || ""}"
Use large, bold text in ${c1} colour. Add a subtle, relevant icon or graphic element.
White or very light background with gentle ${c1} accent.
Keep it simple and professional. The text must be in the vertical center — not at top or bottom.`;

    case "im-fokus":
      return `Edit this LinkedIn Featured section image. Keep a similar layout and style.
Replace brand colours with primary ${c1} and accent ${c2}.
Create a compelling CTA-focused image with:
- Headline: "${texts.focusTitle || ""}" in bold ${c1} text
- A CTA button or element in ${c2}
- Professional, clean background with subtle industry imagery
- Landscape format (will be cropped to ~1.91:1)
Keep text horizontally centered with 10% side margins. Modern, professional design.`;

    case "berufserfahrung":
      return `Edit this LinkedIn experience CTA image. Keep a similar bold, eye-catching layout.
Replace colours with primary ${c1} and accent ${c2}.
Main headline in large, bold text: "${texts.headline || ""}"
Subline: "${texts.subline || ""}"
${texts.badge1 ? `Add a badge/tag: "${texts.badge1}"` : ""}
${texts.badge2 ? `Add a badge/tag: "${texts.badge2}"` : ""}
${hasPhoto ? "Include the person's photo on the right side, freigestellt (cut out)." : ""}
Professional, modern design. Dark or light background with strong contrast.
CTA-focused — this should make people click.`;

    default:
      return `Create a professional LinkedIn image with brand colours ${c1} and ${c2}.`;
  }
}

// ── Bild generieren (Edit-Modus mit Template) ───────────────────
export async function generateLinkedInImage(opts: {
  type: string;
  prompt: string;
  photoBase64?: string; // Kundenfoto (für Profilbild + Banner)
}): Promise<{ b64: string; size: string }> {
  if (!client) throw new Error("OPENAI_API_KEY fehlt.");

  const { type, prompt, photoBase64 } = opts;
  const spec = IMAGE_SPECS[type];
  if (!spec) throw new Error(`Unbekannter Bildtyp: ${type}`);

  const size = `${spec.generateWidth}x${spec.generateHeight}`;

  // Profilbild: Edit mit Kundenfoto als Input (kein Template)
  if (type === "profilbild" && photoBase64) {
    const photoBuf = Buffer.from(photoBase64, "base64");
    const photoFile = await toFile(photoBuf, "foto.png", { type: "image/png" });

    const res = await client.images.edit({
      model: EDIT_MODEL,
      image: photoFile as any,
      prompt,
      size: size as any,
      quality: "high",
      // input_fidelity: "high", // nicht bei allen Accounts verfügbar
      n: 1,
    } as any);

    const b64 = res.data?.[0]?.b64_json;
    if (!b64) throw new Error("Kein Bild zurückgegeben.");
    return { b64, size };
  }

  // Alle anderen: Edit mit Template + optional Kundenfoto
  const templateFile = TEMPLATE_FILES[type];
  if (!templateFile) {
    // Fallback: Generate statt Edit
    const res = await client.images.generate({
      model: EDIT_MODEL,
      prompt,
      size: size as any,
      quality: "high" as any,
      n: 1,
    });
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) throw new Error("Kein Bild zurückgegeben.");
    return { b64, size };
  }

  const templateBuf = loadTemplate(templateFile);
  const templateImg = await toFile(templateBuf, "template.png", {
    type: "image/png",
  });

  // Wenn Kundenfoto vorhanden (Banner), beide als Input senden
  const images: any[] = [templateImg];
  if (photoBase64 && (type === "personen-banner" || type === "berufserfahrung")) {
    const photoBuf = Buffer.from(photoBase64, "base64");
    const photoFile = await toFile(photoBuf, "foto.png", { type: "image/png" });
    images.push(photoFile);
  }

  const res = await client.images.edit({
    model: EDIT_MODEL,
    image: images.length === 1 ? (images[0] as any) : (images as any),
    prompt,
    size: size as any,
    quality: "high",
    // input_fidelity: "high", // nicht bei allen Accounts verfügbar
    n: 1,
  } as any);

  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("Kein Bild zurückgegeben.");
  return { b64, size };
}

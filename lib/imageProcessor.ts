// lib/imageProcessor.ts
// Sharp-basierte Bildverarbeitung: Crop, Resize für LinkedIn-Maße.
import sharp from "sharp";

export interface ImageSpec {
  // Generier-Format (für OpenAI)
  generateWidth: number;
  generateHeight: number;
  // Ziel-Format (für LinkedIn)
  targetWidth: number;
  targetHeight: number;
  label: string;
}

export const IMAGE_SPECS: Record<string, ImageSpec> = {
  profilbild: {
    generateWidth: 1024,
    generateHeight: 1024,
    targetWidth: 800,
    targetHeight: 800,
    label: "Profilbild",
  },
  "personen-banner": {
    generateWidth: 1536,
    generateHeight: 512,
    targetWidth: 1584,
    targetHeight: 396,
    label: "Personen-Banner",
  },
  "firmen-banner": {
    generateWidth: 1536,
    generateHeight: 512,
    targetWidth: 1128,
    targetHeight: 191,
    label: "Firmen-Banner",
  },
  berufserfahrung: {
    generateWidth: 1536,
    generateHeight: 1024,
    targetWidth: 1200,
    targetHeight: 627,
    label: "Berufserfahrung",
  },
  serviceleistung: {
    generateWidth: 1024,
    generateHeight: 1024,
    targetWidth: 1080,
    targetHeight: 1080,
    label: "Serviceleistung",
  },
  "im-fokus": {
    generateWidth: 1536,
    generateHeight: 1024,
    targetWidth: 1200,
    targetHeight: 627,
    label: "Im Fokus",
  },
};

/**
 * Crop + Resize: Bild auf LinkedIn-Zielmaß bringen.
 * Zentrierter Beschnitt, dann Skalierung.
 */
export async function cropAndResize(
  inputBuffer: Buffer,
  targetWidth: number,
  targetHeight: number
): Promise<Buffer> {
  const img = sharp(inputBuffer);
  const meta = await img.metadata();
  const srcW = meta.width || targetWidth;
  const srcH = meta.height || targetHeight;

  const targetAR = targetWidth / targetHeight;
  const srcAR = srcW / srcH;

  let cropW = srcW;
  let cropH = srcH;
  let cropX = 0;
  let cropY = 0;

  if (srcAR > targetAR) {
    // Source is wider → crop sides
    cropW = Math.round(srcH * targetAR);
    cropX = Math.round((srcW - cropW) / 2);
  } else {
    // Source is taller → crop top/bottom
    cropH = Math.round(srcW / targetAR);
    cropY = Math.round((srcH - cropH) / 2);
  }

  return sharp(inputBuffer)
    .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
    .resize(targetWidth, targetHeight, { fit: "fill" })
    .png()
    .toBuffer();
}

/**
 * Einfaches Resize ohne Crop (z.B. Profilbild, Kacheln).
 */
export async function resizeImage(
  inputBuffer: Buffer,
  width: number,
  height: number
): Promise<Buffer> {
  return sharp(inputBuffer)
    .resize(width, height, { fit: "cover" })
    .png()
    .toBuffer();
}

/**
 * Verarbeitet ein generiertes Bild für den finalen LinkedIn-Upload.
 */
export async function processForLinkedIn(
  b64Input: string,
  imageType: string
): Promise<{ b64: string; width: number; height: number }> {
  const spec = IMAGE_SPECS[imageType];
  if (!spec) throw new Error(`Unbekannter Bildtyp: ${imageType}`);

  const inputBuffer = Buffer.from(b64Input, "base64");
  let outputBuffer: Buffer;

  if (
    spec.generateWidth === spec.targetWidth &&
    spec.generateHeight === spec.targetHeight
  ) {
    // Nur resize nötig (z.B. Kacheln 1024→1080)
    outputBuffer = await resizeImage(
      inputBuffer,
      spec.targetWidth,
      spec.targetHeight
    );
  } else {
    // Crop + Resize (z.B. Banner 1536x512 → 1584x396)
    outputBuffer = await cropAndResize(
      inputBuffer,
      spec.targetWidth,
      spec.targetHeight
    );
  }

  return {
    b64: outputBuffer.toString("base64"),
    width: spec.targetWidth,
    height: spec.targetHeight,
  };
}

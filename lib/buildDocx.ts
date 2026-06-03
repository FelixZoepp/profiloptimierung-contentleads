// lib/buildDocx.ts
// Gemeinsame docx-Baulogik fuer Client-Download und Server-Upload (Drive).
// Wird sowohl im Browser (Packer.toBlob) als auch auf dem Server (Packer.toBuffer) genutzt.

import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from "docx";

export interface Section {
  title: string;
  body: string;
}

export function splitSections(md: string): Section[] {
  if (!md.trim()) return [];
  const parts = md.split(/\n(?=##\s)/g);
  return parts
    .map((p) => {
      const m = p.match(/^##\s+(.*)/);
      if (!m) return { title: "", body: p.trim() };
      const title = m[1].trim();
      const body = p.replace(/^##\s+.*\n?/, "").trim();
      return { title, body };
    })
    .filter((s) => s.body.length > 0);
}

export function buildDocument(
  sections: Section[],
  personName?: string,
  companyName?: string
): Document {
  const title = [personName, companyName].filter(Boolean).join(" — ") || "LinkedIn-Profil";

  const children: Paragraph[] = [
    new Paragraph({
      text: title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.LEFT,
      spacing: { after: 300 },
    }),
  ];

  for (const sec of sections) {
    children.push(
      new Paragraph({
        text: sec.title || "Profil",
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 400, after: 100 },
      })
    );

    for (const line of sec.body.split("\n")) {
      const isBold = /^\*\*/.test(line);
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: line.replace(/\*\*/g, ""),
              bold: isBold,
              size: 22,
              font: "Calibri",
            }),
          ],
          spacing: { after: 80 },
        })
      );
    }
  }

  return new Document({
    creator: "Content-Leads Profil-Generator",
    title,
    sections: [{ children }],
  });
}

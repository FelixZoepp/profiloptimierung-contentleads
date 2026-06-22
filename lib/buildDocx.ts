// lib/buildDocx.ts
// Word-Dokument mit Profiltexten + Bedienungsanleitung für den Kunden.

import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
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

// ── Bedienungsanleitung ──────────────────────────────────────
const SETUP_GUIDE = `
SCHRITT-FÜR-SCHRITT EINRICHTUNG AUF LINKEDIN

Folge dieser Reihenfolge — jedes Feld hat ein Zeichenlimit. Die Texte oben sind bereits auf die Limits zugeschnitten.

1. PROFILBILD
   → Das mitgelieferte Profilbild (800×800) hochladen
   → LinkedIn beschneidet es kreisrund — Gesicht ist zentriert
   → Min. 400×400 px, max. 8 MB

2. PERSONEN-BANNER
   → Unter "Hintergrundbild bearbeiten" das Banner (1584×396) hochladen
   → ACHTUNG Handy: Das runde Profilfoto verdeckt die linke untere Ecke
   → Wichtige Elemente (Text, CTA) sind deshalb vertikal mittig platziert

3. HEADLINE
   → Profil bearbeiten → Headline
   → Max. 220 Zeichen (ist eingehalten)
   → Erscheint überall: Suche, Kommentare, Vernetzungsanfragen

4. INFO / ABOUT
   → Profil bearbeiten → Info
   → Max. 2.600 Zeichen (ist eingehalten)
   → Emojis und Sonderzeichen (→) 1:1 übernehmen

5. BERUFSERFAHRUNG
   → Profil → Berufserfahrung → + hinzufügen
   → Position: max. 100 Zeichen
   → Firma: max. 100 Zeichen
   → Beschreibung: max. 2.000 Zeichen
   → Das mitgelieferte CTA-Bild als Medien-Anhang hochladen

6. SERVICELEISTUNGEN (SKILLS-BEREICH)
   → Profil → Services → Services anbieten
   → Max. 5 Services (Titel + Kurzbeschreibung)
   → Die 5 mitgelieferten Kacheln (1080×1080) als Bilder zuordnen
   → WICHTIG: LinkedIn beschneidet Kacheln in der Vorschau stark!
     Desktop: nur mittlere 69% sichtbar, Handy: nur mittlere 46%
     → Text ist bewusst vertikal zentriert — nicht verschieben

7. SKILLS
   → Profil → Skills → Skill hinzufügen
   → Die Top-3 Skills zuerst hinzufügen und PINNEN
   → Dann die weiteren Skills ergänzen

8. IM FOKUS (FEATURED)
   → Profil → Im Fokus → + hinzufügen → Link/Beitrag
   → 3 Elemente mit den mitgelieferten Bildern (1200×627)
   → Titel + Beschreibung + Link aus dem Dokument übernehmen
   → NICHT die quadratischen Kacheln verwenden — Im Fokus ist Querformat!

9. PROFIL-URL ANPASSEN
   → Profil → Profil bearbeiten → Kontaktdaten → Profil-URL
   → 3–100 Zeichen, nur Buchstaben, Zahlen, Bindestriche
   → Empfehlung: vorname-nachname oder firma-name

10. FIRMEN-SEITE BANNER
    → Unternehmensseite → Seite bearbeiten → Titelbild
    → Das Firmen-Banner (1128×191) hochladen
    → Sehr flaches Format — Motiv ist im Mittelstreifen

FINAL-CHECK
□ Profilbild scharf und professionell?
□ Banner auf Desktop UND Handy geprüft?
□ Headline und About korrekt kopiert (Sonderzeichen, Zeilenumbrüche)?
□ Berufserfahrung mit CTA-Bild?
□ Alle 5 Service-Kacheln zugeordnet?
□ Im Fokus: 3 Elemente mit Querformat-Bildern?
□ Skills gepinnt?
□ Profil-URL angepasst?
□ Alle [PLATZHALTER] mit echten Werten ersetzt?
`.trim();

// ── Dokument bauen ───────────────────────────────────────────
export function buildDocument(
  sections: Section[],
  personName?: string,
  companyName?: string
): Document {
  const title =
    [personName, companyName].filter(Boolean).join(" — ") ||
    "LinkedIn-Profil";

  const children: Paragraph[] = [
    // Titel
    new Paragraph({
      text: `LinkedIn-Optimierung ${title}`,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.LEFT,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "Erstellt mit Content-Leads Profil-Generator",
          italics: true,
          size: 20,
          font: "Calibri",
          color: "888888",
        }),
      ],
      spacing: { after: 400 },
    }),
  ];

  // Profil-Sektionen (alles außer Bild-Texte — die braucht der Kunde nicht)
  for (const sec of sections) {
    // Bild-Texte nicht ins Kundendokument
    if (sec.title === "Bild-Texte") continue;
    if (sec.title.startsWith("###")) continue;

    children.push(
      new Paragraph({
        text: sec.title || "Profil",
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 400, after: 100 },
        border: {
          bottom: {
            color: "c2613f",
            space: 4,
            size: 6,
            style: BorderStyle.SINGLE,
          },
        },
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

  // Bedienungsanleitung
  children.push(
    new Paragraph({
      text: "",
      spacing: { before: 600 },
    }),
    new Paragraph({
      text: "Einrichtungsanleitung",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
      border: {
        bottom: {
          color: "1a2238",
          space: 4,
          size: 8,
          style: BorderStyle.SINGLE,
        },
      },
    })
  );

  for (const line of SETUP_GUIDE.split("\n")) {
    const isStep = /^\d+\./.test(line.trim());
    const isArrow = line.trim().startsWith("→");
    const isCheck = line.trim().startsWith("□");
    const isHeader = /^[A-Z\-]+$/.test(line.trim()) && line.trim().length > 3;

    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: line,
            bold: isStep || isHeader,
            italics: isArrow,
            size: isStep || isHeader ? 24 : 21,
            font: "Calibri",
            color: isCheck ? "c2613f" : isArrow ? "666666" : undefined,
          }),
        ],
        spacing: { after: isStep ? 60 : 40 },
        indent: isArrow || isCheck ? { left: 400 } : undefined,
      })
    );
  }

  return new Document({
    creator: "Content-Leads Profil-Generator",
    title: `LinkedIn-Optimierung ${title}`,
    sections: [{ children }],
  });
}

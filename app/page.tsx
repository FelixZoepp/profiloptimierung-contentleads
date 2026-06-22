"use client";

import { useState, useRef } from "react";
import { splitSections, buildDocument, type Section } from "@/lib/buildDocx";
import { Packer } from "docx";

/* ── Typen ─────────────────────────────────────────────────── */
interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

interface GeneratedImage {
  type: string;
  b64: string;
  width: number;
  height: number;
}

const IMAGE_TYPES = [
  { key: "profilbild", label: "Profilbild", size: "800×800", needsPhoto: true },
  { key: "personen-banner", label: "Personen-Banner", size: "1584×396", needsPhoto: true },
  { key: "firmen-banner", label: "Firmen-Banner", size: "1128×191", needsPhoto: false },
  { key: "berufserfahrung", label: "Berufserfahrung", size: "1200×627", needsPhoto: false },
  { key: "serviceleistung-1", label: "Service-Kachel 1", size: "1080×1080", needsPhoto: false },
  { key: "serviceleistung-2", label: "Service-Kachel 2", size: "1080×1080", needsPhoto: false },
  { key: "serviceleistung-3", label: "Service-Kachel 3", size: "1080×1080", needsPhoto: false },
  { key: "serviceleistung-4", label: "Service-Kachel 4", size: "1080×1080", needsPhoto: false },
  { key: "serviceleistung-5", label: "Service-Kachel 5", size: "1080×1080", needsPhoto: false },
  { key: "im-fokus-1", label: "Im Fokus 1", size: "1200×627", needsPhoto: false },
  { key: "im-fokus-2", label: "Im Fokus 2", size: "1200×627", needsPhoto: false },
  { key: "im-fokus-3", label: "Im Fokus 3", size: "1200×627", needsPhoto: false },
] as const;

const EXAMPLE_CHIPS = [
  "Headline kürzer",
  "About in Du-Form",
  "CTA ändern",
  "Outreach persönlicher",
  "Kachel-Texte knapper",
];

/* ── Hilfsfunktionen ───────────────────────────────────────── */
function extractColors(output: string): { primary: string; secondary: string } {
  const pMatch = output.match(/\*\*Primär:\*\*\s*(#[0-9a-fA-F]{6})/);
  const sMatch = output.match(/\*\*Sekundär:\*\*\s*(#[0-9a-fA-F]{6})/);
  return {
    primary: pMatch?.[1] || "#1a2238",
    secondary: sMatch?.[1] || "#c2613f",
  };
}

function extractImageTexts(output: string): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};

  // Personen-Banner
  const bannerMatch = output.match(
    /### Personen-Banner[\s\S]*?\*\*Headline:\*\*\s*(.*?)[\n\r].*?\*\*Subline:\*\*\s*(.*?)[\n\r].*?\*\*CTA-Button:\*\*\s*(.*?)[\n\r]/
  );
  if (bannerMatch) {
    result["personen-banner"] = {
      headline: bannerMatch[1].trim(),
      subline: bannerMatch[2].trim(),
      cta: bannerMatch[3].trim(),
    };
  }

  // Firmen-Banner
  const fMatch = output.match(
    /### Firmen-Banner[\s\S]*?\*\*Headline:\*\*\s*(.*?)[\n\r].*?\*\*Subline:\*\*\s*(.*?)[\n\r].*?\*\*CTA-Button:\*\*\s*(.*?)[\n\r]/
  );
  if (fMatch) {
    result["firmen-banner"] = {
      headline: fMatch[1].trim(),
      subline: fMatch[2].trim(),
      cta: fMatch[3].trim(),
    };
  }

  // Service-Kacheln
  const kachelMatch = output.match(/### Serviceleistungen-Kacheln([\s\S]*?)(?=###|## )/);
  if (kachelMatch) {
    const kText = kachelMatch[1];
    for (let i = 1; i <= 5; i++) {
      const m = kText.match(new RegExp(`\\*\\*Kachel ${i}:\\*\\*\\s*(.*?)(?:\\n|$)`));
      if (m) result[`serviceleistung-${i}`] = { serviceTitle: m[1].trim() };
    }
  }

  // Im-Fokus
  const fokusMatch = output.match(/### Im-Fokus-Bilder([\s\S]*?)(?=###|## )/);
  if (fokusMatch) {
    const fText = fokusMatch[1];
    for (let i = 1; i <= 3; i++) {
      const m = fText.match(new RegExp(`\\*\\*Bild ${i}:\\*\\*\\s*(.*?)(?:\\n|$)`));
      if (m) result[`im-fokus-${i}`] = { focusTitle: m[1].trim() };
    }
  }

  // Berufserfahrung
  const beMatch = output.match(
    /### Berufserfahrung-Bild[\s\S]*?\*\*Headline:\*\*\s*(.*?)[\n\r].*?\*\*Subline:\*\*\s*(.*?)[\n\r](?:.*?\*\*Badge 1:\*\*\s*(.*?)[\n\r])?(?:.*?\*\*Badge 2:\*\*\s*(.*?)[\n\r])?/
  );
  if (beMatch) {
    result["berufserfahrung"] = {
      headline: beMatch[1]?.trim() || "",
      subline: beMatch[2]?.trim() || "",
      badge1: beMatch[3]?.trim() || "",
      badge2: beMatch[4]?.trim() || "",
    };
  }

  return result;
}

/* ── Hauptkomponente ───────────────────────────────────────── */
export default function Home() {
  // Eingaben
  const [personName, setPersonName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [transcript, setTranscript] = useState("");
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [photo, setPhoto] = useState<{ b64: string; name: string } | null>(null);

  // Text-Generierung
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Bilder
  const [images, setImages] = useState<Record<string, GeneratedImage>>({});
  const [imgLoading, setImgLoading] = useState<Record<string, boolean>>({});
  const [imgErrors, setImgErrors] = useState<Record<string, string>>({});
  const [allImgLoading, setAllImgLoading] = useState(false);

  // Export
  const [copiedAll, setCopiedAll] = useState(false);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveResult, setDriveResult] = useState<{ fileLink: string; folderName: string } | null>(null);
  const [driveError, setDriveError] = useState("");

  // Chat
  const [chatHistory, setChatHistory] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");

  // Transkription
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState("");

  const outRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  /* ── Foto-Upload ──────────────────────────────────────────── */
  function onPhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPhoto({ b64: dataUrl.split(",")[1], name: f.name });
    };
    reader.readAsDataURL(f);
  }

  /* ── Audio-Transkription ──────────────────────────────────── */
  async function transcribeFile(file: File) {
    setTranscribing(true);
    setTranscribeError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Transkription fehlgeschlagen.");
      setTranscript((prev) => (prev ? prev + "\n\n" + j.transcript : j.transcript));
    } catch (e: any) {
      setTranscribeError(e.message);
    } finally {
      setTranscribing(false);
    }
  }

  /* ── Text generieren ──────────────────────────────────────── */
  async function generate() {
    setError("");
    setOutput("");
    setImages({});
    setChatHistory([]);
    setDriveResult(null);
    setDriveError("");

    if (!personName && !companyName && !websiteUrl) {
      setError("Bitte mindestens Name, Unternehmen oder Website angeben.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personName,
          companyName,
          websiteUrl,
          transcript,
          additionalInfo,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Serverfehler.");
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        setOutput((prev) => prev + decoder.decode(value, { stream: true }));
        outRef.current?.scrollTo({ top: outRef.current.scrollHeight });
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  /* ── Einzelbild generieren ────────────────────────────────── */
  async function generateImage(imgKey: string) {
    const colors = extractColors(output);
    const allTexts = extractImageTexts(output);
    const baseType = imgKey.replace(/-\d+$/, "");
    const texts = allTexts[imgKey] || allTexts[baseType] || {};

    setImgLoading((prev) => ({ ...prev, [imgKey]: true }));
    setImgErrors((prev) => ({ ...prev, [imgKey]: "" }));

    try {
      const res = await fetch("/api/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: baseType,
          colors,
          texts,
          photoBase64: photo?.b64,
          personName,
          companyName,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Fehler.");
      setImages((prev) => ({
        ...prev,
        [imgKey]: { type: imgKey, b64: j.b64, width: j.width, height: j.height },
      }));
    } catch (e: any) {
      setImgErrors((prev) => ({ ...prev, [imgKey]: e.message }));
    } finally {
      setImgLoading((prev) => ({ ...prev, [imgKey]: false }));
    }
  }

  /* ── Alle Bilder generieren ───────────────────────────────── */
  async function generateAllImages() {
    setAllImgLoading(true);
    for (const img of IMAGE_TYPES) {
      if (img.needsPhoto && !photo) continue;
      await generateImage(img.key);
    }
    setAllImgLoading(false);
  }

  /* ── Chat / Refine ────────────────────────────────────────── */
  async function sendChatMessage(instruction?: string) {
    const msg = instruction || chatInput.trim();
    if (!msg) return;
    setChatInput("");
    setChatError("");
    setChatLoading(true);

    const newHistory: ChatMsg[] = [...chatHistory, { role: "user", content: msg }];
    setChatHistory(newHistory);

    try {
      const res = await fetch("/api/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentProfile: output,
          instruction: msg,
          history: chatHistory,
          personName,
          companyName,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Serverfehler.");
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
      }
      setOutput(fullText);
      setChatHistory([...newHistory, { role: "assistant", content: msg }]);
      setDriveResult(null);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e: any) {
      setChatError(e.message);
    } finally {
      setChatLoading(false);
    }
  }

  /* ── Export-Funktionen ────────────────────────────────────── */
  function copy(text: string, cb?: () => void) {
    navigator.clipboard.writeText(text).then(cb);
  }

  async function downloadDocx() {
    const secs = splitSections(output);
    const doc = buildDocument(secs, personName, companyName);
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Profil-und-Content_${personName || companyName || "Profil"}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadAllImages() {
    for (const [key, img] of Object.entries(images)) {
      const url = "data:image/png;base64," + img.b64;
      const a = document.createElement("a");
      a.href = url;
      a.download = `${personName || "profil"}_${key}.png`;
      a.click();
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  async function saveToDrive() {
    setDriveLoading(true);
    setDriveError("");
    setDriveResult(null);
    try {
      const res = await fetch("/api/drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personName, companyName, result: output }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Drive-Upload fehlgeschlagen.");
      setDriveResult({ fileLink: j.fileLink, folderName: j.folderName });
    } catch (e: any) {
      setDriveError(e.message);
    } finally {
      setDriveLoading(false);
    }
  }

  const sections = splitSections(output);
  const showResults = Boolean(output && !loading);
  const colors = output ? extractColors(output) : null;

  return (
    <main className="wrap">
      {/* ── Header ──────────────────────────────────────────── */}
      <header className="head">
        <div className="brandmark">CL</div>
        <div>
          <h1>Profil-Generator</h1>
          <p className="sub">Content-Leads · Texte + Bilder + Dokument</p>
        </div>
      </header>

      {/* ── Eingabe-Formular ────────────────────────────────── */}
      <section className="card">
        <div className="row">
          <label>
            <span>Name der Person</span>
            <input value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="z. B. Kurt Schauer" />
          </label>
          <label>
            <span>Unternehmen</span>
            <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="z. B. KAOS Werbeagentur" />
          </label>
        </div>

        <div className="row" style={{ marginTop: 16 }}>
          <label>
            <span>Website</span>
            <input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://www.beispiel.de" />
          </label>
          <label>
            <span>Kundenfoto (für Profilbild + Banner)</span>
            <div className="photo-upload">
              <label className="upload-label">
                {photo ? `${photo.name}` : "Foto hochladen"}
                <input type="file" accept="image/*" hidden onChange={onPhotoUpload} />
              </label>
              {photo && (
                <button className="link-x" onClick={() => setPhoto(null)}>entfernen</button>
              )}
            </div>
          </label>
        </div>

        <div className="block">
          <div className="transcript-head">
            <span className="field-label">Onboarding-Transkript (optional)</span>
            <label className="upload-label">
              {transcribing ? "Transkribiere ..." : "Audio/Video hochladen"}
              <input
                type="file"
                accept="audio/*,video/*"
                hidden
                disabled={transcribing}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) transcribeFile(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          {transcribeError && <p className="err">{transcribeError}</p>}
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Transkript hier einfügen oder Audio/Video hochladen ..."
            rows={6}
          />
        </div>

        <div className="block">
          <label>
            <span>Zusätzliche Infos (optional)</span>
            <textarea
              value={additionalInfo}
              onChange={(e) => setAdditionalInfo(e.target.value)}
              placeholder="Besondere Wünsche, Positionierung, Zielgruppe, Markenfarben ..."
              rows={3}
            />
          </label>
        </div>

        <button className="go" onClick={generate} disabled={loading}>
          {loading ? "Generiere ... (Recherche + Texte, ~1-2 Min)" : "Profil generieren"}
        </button>
        {error && <p className="err">{error}</p>}
      </section>

      {/* ── Ergebnis: Texte ─────────────────────────────────── */}
      {(output || loading) && (
        <section className="result">
          <div className="result-head">
            <h2>Texte</h2>
            {showResults && (
              <div className="result-actions">
                <button
                  className="ghost"
                  onClick={() => copy(output, () => { setCopiedAll(true); setTimeout(() => setCopiedAll(false), 1500); })}
                >
                  {copiedAll ? "Kopiert" : "Alles kopieren"}
                </button>
                <button className="ghost" onClick={downloadDocx}>Word-Dokument</button>
                <button className="ghost ghost-drive" onClick={saveToDrive} disabled={driveLoading}>
                  {driveLoading ? "Lade hoch ..." : "In Drive speichern"}
                </button>
              </div>
            )}
          </div>

          {driveResult && (
            <p className="drive-ok">
              Gespeichert in <strong>{driveResult.folderName}</strong> —{" "}
              <a href={driveResult.fileLink} target="_blank" rel="noopener noreferrer">
                In Drive öffnen
              </a>
            </p>
          )}
          {driveError && <p className="err">{driveError}</p>}

          {loading && !output && <p className="muted">Recherchiere das Unternehmen ...</p>}

          {colors && showResults && (
            <div className="color-preview">
              <div className="color-dot" style={{ background: colors.primary }} />
              <span>{colors.primary}</span>
              <div className="color-dot" style={{ background: colors.secondary }} />
              <span>{colors.secondary}</span>
            </div>
          )}

          <div ref={outRef} className="sections">
            {sections.map((s, i) => (
              <TextBlock key={i} section={s} onCopy={copy} />
            ))}
          </div>
        </section>
      )}

      {/* ── Ergebnis: Bilder ────────────────────────────────── */}
      {showResults && (
        <section className="result">
          <div className="result-head">
            <h2>Bilder</h2>
            <div className="result-actions">
              <button
                className="go-sm"
                onClick={generateAllImages}
                disabled={allImgLoading}
              >
                {allImgLoading ? "Generiere alle ..." : "Alle Bilder generieren"}
              </button>
              {Object.keys(images).length > 0 && (
                <button className="ghost" onClick={downloadAllImages}>
                  Alle herunterladen
                </button>
              )}
            </div>
          </div>

          {!photo && (
            <p className="hint" style={{ marginBottom: 14 }}>
              Lade ein Kundenfoto hoch, um Profilbild und Banner mit echtem Gesicht zu generieren.
            </p>
          )}

          <div className="image-grid">
            {IMAGE_TYPES.map((imgType) => (
              <ImageCard
                key={imgType.key}
                imgKey={imgType.key}
                label={imgType.label}
                size={imgType.size}
                needsPhoto={imgType.needsPhoto}
                hasPhoto={Boolean(photo)}
                image={images[imgType.key]}
                loading={imgLoading[imgType.key] || false}
                error={imgErrors[imgType.key] || ""}
                onGenerate={() => generateImage(imgType.key)}
                personName={personName}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Chat ────────────────────────────────────────────── */}
      {showResults && (
        <section className="chat-panel">
          <h3 className="chat-title">Änderungen per Chat</h3>

          {chatHistory.length === 0 && (
            <div className="chat-chips">
              {EXAMPLE_CHIPS.map((chip) => (
                <button key={chip} className="chip" onClick={() => sendChatMessage(chip)} disabled={chatLoading}>
                  {chip}
                </button>
              ))}
            </div>
          )}

          {chatHistory.length > 0 && (
            <div className="chat-messages">
              {chatHistory.map((m, i) => (
                <div key={i} className={`chat-msg chat-msg-${m.role}`}>
                  {m.role === "user" ? m.content : `"${m.content}" aktualisiert`}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          )}

          {chatLoading && <p className="muted">Überarbeite Profil ...</p>}
          {chatError && <p className="err">{chatError}</p>}

          <div className="chat-input-row">
            <input
              className="chat-input"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendChatMessage();
                }
              }}
              placeholder='z. B. "Headline kürzer" oder "About in Du-Form"'
              disabled={chatLoading}
            />
            <button className="go-sm" onClick={() => sendChatMessage()} disabled={chatLoading || !chatInput.trim()}>
              Senden
            </button>
          </div>
        </section>
      )}

      <footer className="foot">
        Content-Leads Profil-Generator · Claude (Texte) + GPT-Image (Bilder) · alle Texte und Bilder vor Verwendung prüfen
      </footer>
    </main>
  );
}

/* ── Text-Block Komponente ─────────────────────────────────── */
function TextBlock({ section, onCopy }: { section: Section; onCopy: (t: string, cb?: () => void) => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="sec">
      <div className="sec-head">
        <h3>{section.title || "Profil"}</h3>
        <button
          className="copy"
          onClick={() => onCopy(section.body, () => { setCopied(true); setTimeout(() => setCopied(false), 1200); })}
        >
          {copied ? "Kopiert" : "Kopieren"}
        </button>
      </div>
      <pre className="sec-body">{section.body}</pre>
    </div>
  );
}

/* ── Bild-Karte Komponente ─────────────────────────────────── */
function ImageCard({
  imgKey,
  label,
  size,
  needsPhoto,
  hasPhoto,
  image,
  loading,
  error,
  onGenerate,
  personName,
}: {
  imgKey: string;
  label: string;
  size: string;
  needsPhoto: boolean;
  hasPhoto: boolean;
  image?: GeneratedImage;
  loading: boolean;
  error: string;
  onGenerate: () => void;
  personName: string;
}) {
  const disabled = loading || (needsPhoto && !hasPhoto);
  const dataUrl = image ? "data:image/png;base64," + image.b64 : "";

  return (
    <div className="img-card">
      <div className="img-card-head">
        <div>
          <strong>{label}</strong>
          <span className="img-size">{size}</span>
        </div>
        <button className="go-sm" onClick={onGenerate} disabled={disabled}>
          {loading ? "..." : image ? "Neu" : "Generieren"}
        </button>
      </div>

      {needsPhoto && !hasPhoto && (
        <p className="hint">Kundenfoto erforderlich</p>
      )}

      {error && <p className="err">{error}</p>}

      {image && (
        <div className="img-card-preview">
          <img src={dataUrl} alt={label} />
          <a className="dl" href={dataUrl} download={`${personName || "profil"}_${imgKey}.png`}>
            PNG herunterladen
          </a>
        </div>
      )}
    </div>
  );
}

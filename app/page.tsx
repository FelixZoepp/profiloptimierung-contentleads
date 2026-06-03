"use client";

import { useState, useRef } from "react";
import { splitSections, buildDocument, type Section } from "@/lib/buildDocx";
import { Packer } from "docx";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

const EXAMPLE_CHIPS = [
  "Headline kürzer",
  "About in Du-Form",
  "Post 3 ersetzen",
  "Outreach-Notiz persönlicher",
  "Motiv 2 ohne Personen, wärmer",
];

export default function Home() {
  const [personName, setPersonName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [transcript, setTranscript] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copiedAll, setCopiedAll] = useState(false);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveResult, setDriveResult] = useState<{ fileLink: string; folderName: string } | null>(null);
  const [driveError, setDriveError] = useState("");

  // Chat state
  const [chatHistory, setChatHistory] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");

  // Transkription state
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState("");

  const outRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  async function generate() {
    setError("");
    setOutput("");
    setChatHistory([]);
    setChatError("");
    setDriveResult(null);
    setDriveError("");
    if (transcript.trim().length < 50) {
      setError("Bitte füge ein Transkript ein (mindestens ein paar Sätze).");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personName, companyName, transcript }),
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
      setError(e.message || "Unbekannter Fehler.");
    } finally {
      setLoading(false);
    }
  }

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
    a.download = `${personName || companyName || "Profil"}_LinkedIn-Profil.docx`;
    a.click();
    URL.revokeObjectURL(url);
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
      setDriveError(e.message || "Unbekannter Fehler.");
    } finally {
      setDriveLoading(false);
    }
  }

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
      setTranscribeError(e.message || "Fehler bei der Transkription.");
    } finally {
      setTranscribing(false);
    }
  }

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
      // Profil ersetzen und History aktualisieren
      setOutput(fullText);
      setChatHistory([
        ...newHistory,
        { role: "assistant", content: msg },
      ]);
      setDriveResult(null);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e: any) {
      setChatError(e.message || "Unbekannter Fehler.");
    } finally {
      setChatLoading(false);
    }
  }

  const sections = splitSections(output);
  const showChat = Boolean(output && !loading);

  return (
    <main className="wrap">
      <header className="head">
        <div className="brandmark">CL</div>
        <div>
          <h1>Profil-Generator</h1>
          <p className="sub">Content-Leads · Transkript rein, Profil raus</p>
        </div>
      </header>

      <section className="card">
        <div className="row">
          <label>
            <span>Name der Person</span>
            <input
              value={personName}
              onChange={(e) => setPersonName(e.target.value)}
              placeholder="z. B. Kurt Schauer"
            />
          </label>
          <label>
            <span>Unternehmen</span>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="z. B. KAOS Werbeagentur"
            />
          </label>
        </div>
        <div className="block">
          <div className="transcript-head">
            <span className="field-label">Onboarding-Transkript</span>
            <label className="upload-label">
              {transcribing ? "Transkribiere …" : "Audio/Video hochladen"}
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
            placeholder="Transkript hier einfügen oder Audio/Video hochladen …"
            rows={10}
          />
        </div>

        <button className="go" onClick={generate} disabled={loading}>
          {loading ? "Generiere … (Recherche + Texte, ~1–2 Min)" : "Profil generieren"}
        </button>
        {error && <p className="err">{error}</p>}
      </section>

      {(output || loading) && (
        <section className="result">
          <div className="result-head">
            <h2>Ergebnis</h2>
            {output && !loading && (
              <div className="result-actions">
                <button
                  className="ghost"
                  onClick={() =>
                    copy(output, () => {
                      setCopiedAll(true);
                      setTimeout(() => setCopiedAll(false), 1500);
                    })
                  }
                >
                  {copiedAll ? "✓ Kopiert" : "Alles kopieren"}
                </button>
                <button className="ghost" onClick={downloadDocx}>
                  Als Word laden
                </button>
                <button
                  className="ghost ghost-drive"
                  onClick={saveToDrive}
                  disabled={driveLoading}
                >
                  {driveLoading ? "Lade hoch …" : "In Drive-Ordner laden"}
                </button>
              </div>
            )}
          </div>
          {driveResult && (
            <p className="drive-ok">
              Gespeichert in <strong>{driveResult.folderName}</strong> —{" "}
              <a href={driveResult.fileLink} target="_blank" rel="noopener noreferrer">
                Datei in Drive öffnen
              </a>
            </p>
          )}
          {driveError && <p className="err">{driveError}</p>}

          {loading && !output && <p className="muted">Recherchiere das Unternehmen …</p>}

          <div ref={outRef} className="sections">
            {sections.map((s, i) => (
              <Block key={i} section={s} onCopy={copy} />
            ))}
          </div>
        </section>
      )}

      {showChat && (
        <section className="chat-panel">
          <h3 className="chat-title">Änderungen per Chat</h3>

          {chatHistory.length === 0 && (
            <div className="chat-chips">
              {EXAMPLE_CHIPS.map((chip) => (
                <button
                  key={chip}
                  className="chip"
                  onClick={() => sendChatMessage(chip)}
                  disabled={chatLoading}
                >
                  {chip}
                </button>
              ))}
            </div>
          )}

          {chatHistory.length > 0 && (
            <div className="chat-messages">
              {chatHistory.map((m, i) => (
                <div key={i} className={`chat-msg chat-msg-${m.role}`}>
                  {m.role === "user" ? m.content : `✓ "${m.content}" aktualisiert`}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          )}

          {chatLoading && <p className="muted">Überarbeite Profil …</p>}
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
            <button
              className="go-sm"
              onClick={() => sendChatMessage()}
              disabled={chatLoading || !chatInput.trim()}
            >
              Senden
            </button>
          </div>
        </section>
      )}

      <footer className="foot">
        Erzeugt mit Claude (Text) + GPT-Image (Motive) · alle Texte vor Verwendung prüfen ·
        Platzhalter [..] ersetzen · Banner & finaler Text entstehen in Canva
      </footer>
    </main>
  );
}

// Erkennt den Bild-Motive-Block und zieht die einzelnen Prompts raus
function isImageSection(title: string) {
  return /bild-?motive|bild-?prompt/i.test(title);
}
function parseImagePrompts(body: string): { ratio: "square" | "landscape"; prompt: string }[] {
  const lines = body.split(/\n(?=\*\*Motiv)/g);
  const out: { ratio: "square" | "landscape"; prompt: string }[] = [];
  for (const l of lines) {
    const m = l.match(/\*\*Motiv[^:]*:\*\*\s*([\s\S]*)/);
    if (!m) continue;
    const ratio = /3:2|landscape|quer|hintergrund/i.test(l) ? "landscape" : "square";
    const prompt = m[1].trim();
    if (prompt.length > 5) out.push({ ratio, prompt });
  }
  return out;
}

function Block({
  section,
  onCopy,
}: {
  section: Section;
  onCopy: (t: string, cb?: () => void) => void;
}) {
  const [copied, setCopied] = useState(false);

  if (isImageSection(section.title)) {
    return <ImageBlock section={section} onCopy={onCopy} />;
  }

  return (
    <div className="sec">
      <div className="sec-head">
        <h3>{section.title || "Profil"}</h3>
        <button
          className="copy"
          onClick={() =>
            onCopy(section.body, () => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            })
          }
        >
          {copied ? "✓" : "Kopieren"}
        </button>
      </div>
      <pre className="sec-body">{section.body}</pre>
    </div>
  );
}

function ImageBlock({
  section,
  onCopy,
}: {
  section: Section;
  onCopy: (t: string, cb?: () => void) => void;
}) {
  const prompts = parseImagePrompts(section.body);
  return (
    <div className="sec">
      <div className="sec-head">
        <h3>{section.title}</h3>
        <span className="hint">Kachel-/Hintergrund-Motive · Banner → Canva</span>
      </div>
      <div className="sec-body">
        {prompts.length === 0 && <pre>{section.body}</pre>}
        {prompts.map((p, i) => (
          <ImagePrompt key={i} prompt={p.prompt} ratio={p.ratio} index={i + 1} onCopy={onCopy} />
        ))}
      </div>
    </div>
  );
}

function ImagePrompt({
  prompt,
  ratio,
  index,
  onCopy,
}: {
  prompt: string;
  ratio: "square" | "landscape";
  index: number;
  onCopy: (t: string, cb?: () => void) => void;
}) {
  const [img, setImg] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [tpl, setTpl] = useState<{ b64: string; w: number; h: number; name: string } | null>(null);

  // Bild-Anpassung per Text
  const [editText, setEditText] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState("");
  const imgRef = useRef<HTMLImageElement>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const im = new Image();
      im.onload = () => {
        setTpl({
          b64: dataUrl.split(",")[1],
          w: im.naturalWidth,
          h: im.naturalHeight,
          name: f.name,
        });
      };
      im.src = dataUrl;
    };
    reader.readAsDataURL(f);
  }

  async function run() {
    setBusy(true);
    setErr("");
    setNote("");
    try {
      const payload: any = { prompt, ratio };
      if (tpl) {
        payload.imageBase64 = tpl.b64;
        payload.width = tpl.w;
        payload.height = tpl.h;
      }
      const res = await fetch("/api/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Fehler.");
      setImg("data:image/png;base64," + j.b64);
      if (tpl && j.size) {
        setNote(
          `Ausgabe ${j.size}` +
            (j.clamped ? " — Format auf max. 3:1 begrenzt (für 4:1-Banner in Canva zuschneiden)." : " — Format der Vorlage erhalten.")
        );
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function editImage() {
    if (!editText.trim() || !img) return;
    setEditBusy(true);
    setEditErr("");
    try {
      // Base64 aus dem data-URL extrahieren
      const b64 = img.split(",")[1];
      // Natürliche Maße des aktuellen Bildes auslesen
      const w = imgRef.current?.naturalWidth || 1024;
      const h = imgRef.current?.naturalHeight || 1024;

      const res = await fetch("/api/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: editText.trim(),
          imageBase64: b64,
          width: w,
          height: h,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Fehler.");
      setImg("data:image/png;base64," + j.b64);
      setEditText("");
      if (j.size) {
        setNote(`Angepasst (${j.size})${j.clamped ? " — Format auf max. 3:1 begrenzt." : ""}`);
      }
    } catch (e: any) {
      setEditErr(e.message);
    } finally {
      setEditBusy(false);
    }
  }

  return (
    <div className="imgrow">
      <div className="imgmeta">
        <span className="tag">{ratio === "landscape" ? "3:2 Hintergrund" : "1:1 Kachel"}</span>
        <p>{prompt}</p>

        <div className="tpl">
          <label className="tpl-label">
            {tpl ? `Vorlage: ${tpl.name} (${tpl.w}×${tpl.h})` : "Optional: Vorlage hochladen → behält Format & Stil"}
            <input type="file" accept="image/*" onChange={onFile} hidden />
          </label>
          {tpl && (
            <button className="link-x" onClick={() => setTpl(null)}>entfernen</button>
          )}
        </div>

        <div className="imgbtns">
          <button className="copy" onClick={() => onCopy(prompt)}>Prompt kopieren</button>
          <button className="go-sm" onClick={run} disabled={busy}>
            {busy ? "Generiere …" : img ? "Neu generieren" : tpl ? "Aus Vorlage generieren" : "Mit GPT generieren"}
          </button>
        </div>
        {note && <p className="note">{note}</p>}
        {err && <p className="err">{err}</p>}
      </div>
      {img && (
        <div className="imgout">
          <img ref={imgRef} src={img} alt={`Motiv ${index}`} />
          <a className="dl" href={img} download={`motiv-${index}.png`}>PNG herunterladen</a>

          <div className="img-edit-row">
            <input
              className="img-edit-input"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  editImage();
                }
              }}
              placeholder="Änderung beschreiben …"
              disabled={editBusy}
            />
            <button
              className="go-sm"
              onClick={editImage}
              disabled={editBusy || !editText.trim()}
            >
              {editBusy ? "Anpassen …" : "Bild anpassen"}
            </button>
          </div>
          {editErr && <p className="err">{editErr}</p>}
        </div>
      )}
    </div>
  );
}

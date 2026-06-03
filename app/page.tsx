"use client";

import { useState, useRef } from "react";

interface Section {
  title: string;
  body: string;
}

// Zerlegt das Markdown in ## Blöcke für einzelne Copy-Buttons
function splitSections(md: string): Section[] {
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

export default function Home() {
  const [personName, setPersonName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [transcript, setTranscript] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copiedAll, setCopiedAll] = useState(false);
  const outRef = useRef<HTMLDivElement>(null);

  async function generate() {
    setError("");
    setOutput("");
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

  const sections = splitSections(output);

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
        <label className="block">
          <span>Onboarding-Transkript</span>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Das komplette Transkript hier einfügen …"
            rows={10}
          />
        </label>

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
            )}
          </div>

          {loading && !output && <p className="muted">Recherchiere das Unternehmen …</p>}

          <div ref={outRef} className="sections">
            {sections.map((s, i) => (
              <Block key={i} section={s} onCopy={copy} />
            ))}
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
          <img src={img} alt={`Motiv ${index}`} />
          <a className="dl" href={img} download={`motiv-${index}.png`}>PNG herunterladen</a>
        </div>
      )}
    </div>
  );
}

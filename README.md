# Profil-Generator (Content-Leads)

Eine Web-App: Du gibst **Name**, **Unternehmen** und das **Onboarding-Transkript** ein – die App recherchiert die Firma im Web und erzeugt das komplette LinkedIn-Personenprofil nach der Content-Leads-Methodik (Schmerz-Positionierung, Zahlen-Daten-Fakten, Zielgruppensprache, 30-Tage-Content-Plan, Outreach).

> **Was die App NICHT macht:** Sie erzeugt keine Bilder (Banner, Kacheln, Profilfoto). Das bleibt manuell/Design. Sie liefert alle TEXTE plus Content-Plan und Outreach.

---

## Was du brauchst (3 Konten, alle haben Gratis-/Einstiegstarife)

1. **GitHub** – speichert den Code: https://github.com
2. **Vercel** – hostet die App (kostenlos für sowas): https://vercel.com
3. **Anthropic Console** – der API-Key, der Claude bezahlt: https://console.anthropic.com
4. *(Optional)* **Supabase** – speichert jede Generierung: https://supabase.com

---

## Schritt 1 — Code zu GitHub

1. Neues Repository auf GitHub anlegen (z. B. `profil-bot`), **Private**.
2. Diesen Ordner komplett hochladen (per „Add file → Upload files“ alle Dateien reinziehen, oder per Git pushen).

## Schritt 2 — Anthropic-API-Key holen

1. Auf https://console.anthropic.com einloggen → **API Keys** → **Create Key**.
2. Key kopieren (beginnt mit `sk-ant-...`). **Guthaben aufladen** (Billing) – pro erzeugtem Profil fallen ein paar Cent bis ~30 Cent an, je nach Länge und Recherche.

## Schritt 3 — Auf Vercel deployen

1. Auf https://vercel.com mit GitHub einloggen → **Add New → Project** → dein Repo auswählen.
2. **Environment Variables** setzen (vor dem Deploy, unter „Environment Variables“):
   - `ANTHROPIC_API_KEY` = dein Key aus Schritt 2  *(Pflicht)*
   - `CLAUDE_MODEL` = `claude-sonnet-4-6`  *(optional; für Top-Qualität `claude-opus-4-8`)*
   - `WEB_SEARCH_VERSION` = `web_search_20260209`  *(optional)*
3. **Deploy** klicken. Nach ~1 Minute bekommst du eine URL wie `dein-projekt.vercel.app`. Fertig.

## Schritt 4 (optional) — Bilder mit GPT-Image

1. OpenAI-API-Key holen: https://platform.openai.com → API Keys → Guthaben aufladen.
2. Bei Vercel als Umgebungsvariable setzen:
   - `OPENAI_API_KEY` = dein OpenAI-Key
   - `OPENAI_IMAGE_MODEL` = `gpt-image-1` *(reine Generierung, günstig)*
   - `OPENAI_EDIT_MODEL` = `gpt-image-2` *(Vorlage-Modus mit eigener Größe + input_fidelity)*
3. Neu deployen. Im Ergebnis erscheint dann beim Block **Bild-Motive** pro Motiv ein Button „Mit GPT generieren".

**Zwei Modi:**
- **Ohne Vorlage:** reine Text-zu-Bild-Generierung (feste Größen).
- **Mit Vorlage** („Vorlage hochladen"): Du lädst ein Bild hoch (z. B. eine bestehende Kachel, ein Template, einen Hintergrund). Die App nutzt den Edit-Modus mit `input_fidelity: high` und **behält das Format deiner Vorlage** (soweit erlaubt). So bekommst du Varianten, die zu Größe und Stil passen — genau wie in der ChatGPT-Web-UI.

**Format-Grenzen (wichtig):** Eigene Größen gehen mit `gpt-image-2`, aber nur mit Seitenverhältnis **bis 3:1** und ausreichend Pixeln. Kacheln (1:1) und Im-Fokus (1.91:1) klappen exakt. Das **Personen-Banner (1584×396 = 4:1)** liegt knapp außerhalb — die App erzeugt es auf max. 3:1, den finalen 4:1-Zuschnitt machst du in Canva. Kosten: ca. $0.02–0.19 pro Bild.

## Schritt 5 (optional) — Supabase zum Speichern

1. Auf https://supabase.com ein Projekt anlegen.
2. **SQL Editor** öffnen → den Inhalt von `supabase/schema.sql` einfügen → ausführen.
3. In Supabase unter **Project Settings → API** kopieren:
   - **Project URL** → bei Vercel als `NEXT_PUBLIC_SUPABASE_URL`
   - **service_role**-Key → bei Vercel als `SUPABASE_SERVICE_ROLE_KEY`
4. Bei Vercel neu deployen (Deployments → … → Redeploy). Jetzt wird jede Generierung gespeichert.

> Ohne Supabase läuft alles trotzdem – es wird dann nur nichts gespeichert.

---

## Lokal testen (optional, für Entwickler)

```bash
npm install
cp .env.example .env.local   # und ANTHROPIC_API_KEY eintragen
npm run dev                   # http://localhost:3000
```

---

## So passt du die Qualität an

Die ganze Methodik steckt in **`lib/systemPrompt.ts`**. Willst du, dass Profile anders klingen, neue Regeln gelten oder ein Feld dazukommt – ändere diesen Text und deploye neu. Das ist die „Bot-Anweisung“ in Code-Form.

## Modelle & Kosten (Stand 2026)

- `claude-sonnet-4-6` – günstig, sehr gut für diesen Zweck (Standard).
- `claude-opus-4-8` – beste Qualität, teurer.
- Die Web-Recherche (`web_search`) kostet pro Suche extra, ist aber der größte Qualitäts-Hebel.

## Wichtige Hinweise

- **Immer gegenlesen.** Die KI kann sich bei Namen/Zahlen irren. Platzhalter `[..]` müssen ersetzt werden.
- **Heikle Branchen** (Finanzen, Gesundheit, Recht): Aussagen wie Renditeversprechen rechtlich prüfen.
- **Datenschutz:** Transkripte enthalten personenbezogene Daten. Wer Supabase nutzt, speichert sie – das im Auftragsverarbeitungs-Kontext bedenken.

// lib/supabase.ts
// Speichern ist OPTIONAL. Wenn keine Supabase-Variablen gesetzt sind,
// läuft die App trotzdem — sie speichert dann nur nichts.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseEnabled = Boolean(url && serviceKey);

const supabase = supabaseEnabled ? createClient(url!, serviceKey!) : null;

export interface GenerationRow {
  person_name: string | null;
  company_name: string | null;
  transcript: string;
  result: string;
  model: string;
}

export async function saveGeneration(row: GenerationRow): Promise<void> {
  if (!supabase) return; // kein Supabase konfiguriert -> still überspringen
  const { error } = await supabase.from("generations").insert({
    person_name: row.person_name,
    company_name: row.company_name,
    transcript: row.transcript,
    result: row.result,
    model: row.model,
  });
  if (error) throw error;
}

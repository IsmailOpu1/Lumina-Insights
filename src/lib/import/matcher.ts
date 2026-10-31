import { supabase } from '@/integrations/supabase/client';
import { autoMap, FIELDS, guessEntity, normaliseHeader, type Entity, type Mapping } from './fields';
import type { SheetData } from './readFile';

export type SheetTarget = Entity | 'skip';

export interface SheetPlan {
  target: SheetTarget;
  mapping: Mapping;
  /** Where the matching came from, shown as a small hint. */
  origin: 'remembered' | 'ai' | 'auto';
}

const STORAGE_PREFIX = 'lumina-import-layout:';

function layoutKey(sheet: SheetData) {
  return STORAGE_PREFIX + sheet.headers.map(normaliseHeader).join('|');
}

/** Saves a confirmed layout so next month's file of the same shape matches instantly. */
export function rememberLayout(sheet: SheetData, plan: SheetPlan) {
  try {
    localStorage.setItem(layoutKey(sheet), JSON.stringify({ target: plan.target, mapping: plan.mapping }));
  } catch {
    // Storage can be full or blocked; matching still works without it.
  }
}

function recalled(sheet: SheetData): SheetPlan | null {
  try {
    const raw = localStorage.getItem(layoutKey(sheet));
    if (!raw) return null;
    const saved = JSON.parse(raw) as { target: SheetTarget; mapping: Mapping };
    if (!Array.isArray(saved.mapping) || saved.mapping.length !== sheet.headers.length) return null;
    return { target: saved.target, mapping: saved.mapping, origin: 'remembered' };
  } catch {
    return null;
  }
}

function fallback(sheet: SheetData): SheetPlan {
  const target = guessEntity(sheet.name, sheet.headers);
  const mapping = autoMap(target, sheet.headers);
  // A sheet of notes or a summary matches at most one column; leave it out
  // rather than show every row as a problem. It can still be switched on.
  if (mapping.filter(Boolean).length < 2) return { target: 'skip', mapping: sheet.headers.map(() => null), origin: 'auto' };
  return { target, mapping, origin: 'auto' };
}

/** The AI's mapping, topped up with confident built-in matches it left out. */
function merge(entity: Entity, sheet: SheetData, ai: Mapping): Mapping {
  const valid = new Set(FIELDS[entity].map((f) => f.key));
  const mapping = sheet.headers.map((_, i) => (ai[i] && valid.has(ai[i]!) ? ai[i] : null));
  const auto = autoMap(entity, sheet.headers);
  auto.forEach((field, i) => {
    if (field && !mapping[i] && !mapping.includes(field)) mapping[i] = field;
  });
  return mapping;
}

/**
 * Remembered layout first, then the AI, then the built-in matcher. The AI
 * only sees column names and five sample rows.
 */
export async function planSheets(sheets: SheetData[]): Promise<SheetPlan[]> {
  const plans: (SheetPlan | null)[] = sheets.map(recalled);
  const unknown = sheets.map((s, i) => ({ s, i })).filter(({ i }) => !plans[i]);
  if (!unknown.length) return plans as SheetPlan[];

  try {
    const { data, error } = await supabase.functions.invoke('map-import-columns', {
      body: { sheets: unknown.map(({ s }) => ({ name: s.name, headers: s.headers, sample: s.rows.slice(0, 5) })) },
    });
    if (error || !Array.isArray(data?.sheets)) throw error ?? new Error('no answer');
    unknown.forEach(({ s, i }, k) => {
      const answer = data.sheets[k] as { entity: SheetTarget | null; mapping: Mapping } | undefined;
      if (!answer?.entity) {
        plans[i] = fallback(s);
      } else if (answer.entity === 'skip') {
        plans[i] = { target: 'skip', mapping: s.headers.map(() => null), origin: 'ai' };
      } else {
        plans[i] = { target: answer.entity, mapping: merge(answer.entity, s, answer.mapping ?? []), origin: 'ai' };
      }
    });
  } catch {
    unknown.forEach(({ s, i }) => { plans[i] = fallback(s); });
  }
  return plans as SheetPlan[];
}

import type { CaseDef } from './types';

/** Prüft einen Fall auf Konsistenz. Leere Liste = alles in Ordnung. */
export function validateCase(def: CaseDef): string[] {
  const errs: string[] = [];
  if (!def || typeof def !== 'object') return ['Kein gültiges Objekt.'];
  for (const k of ['id', 'title', 'places', 'suspects', 'cards', 'combos', 'contacts', 'chapters', 'units'] as const)
    if (!(k in def)) errs.push(`Feld „${k}“ fehlt.`);
  if (errs.length) return errs;
  if (!def.chapters.length) errs.push('Mindestens ein Akt (chapters) wird benötigt.');
  if (!def.units.length) errs.push('Mindestens eine Einheit (units) wird benötigt.');
  const cardIds = new Set([...Object.keys(def.cards), ...def.suspects.map((s) => 'dossier_' + s.id)]);
  const need = (id: string, where: string) => { if (!cardIds.has(id)) errs.push(`${where}: Karte „${id}“ existiert nicht.`); };
  const place = (p: string, where: string) => { if (!def.places[p]) errs.push(`${where}: Ort „${p}“ existiert nicht.`); };
  const suspect = (s: string, where: string) => { if (!def.suspects.some((x) => x.id === s)) errs.push(`${where}: Verdächtige(r) „${s}“ existiert nicht.`); };
  def.combos.forEach((c, i) => { need(c.a, `Kombination ${i + 1}`); need(c.b, `Kombination ${i + 1}`); need(c.result, `Kombination ${i + 1}`); });
  def.contacts.forEach((c) => {
    place(c.place, 'Kontakt ' + c.id);
    c.unlockedBy?.forEach((u) => need(u, 'Kontakt ' + c.id));
    c.questions.forEach((q) => {
      if (q.requires) need(q.requires, `Frage ${c.id}.${q.id}`);
      q.gives?.forEach((g) => need(g, `Frage ${c.id}.${q.id}`));
      if (q.contradiction) { need(q.contradiction.card, `Widerspruch ${c.id}.${q.id}`); q.contradiction.gives?.forEach((g) => need(g, `Widerspruch ${c.id}.${q.id}`)); }
    });
  });
  for (const [k, p] of Object.entries(def.places))
    if (!(p.lon > -74.03 && p.lon < -73.9 && p.lat > 40.69 && p.lat < 40.83)) errs.push(`Ort „${k}“ liegt außerhalb der Karte (lon/lat prüfen).`);
  def.chapters.forEach((ch, i) => {
    const w = `Akt ${i + 1}`;
    [ch.start, ...(ch.escape?.places ?? []), ...(ch.ambush ? [ch.ambush.target, ...ch.ambush.candidates] : []), ...ch.sceneItems.map((s) => s.place), ...(ch.searchAt ?? [])].forEach((p) => place(p, w));
    ch.startCards.forEach((c) => need(c, w)); ch.sceneItems.forEach((s) => need(s.cardId, w)); ch.timed.forEach((t) => need(t.card, w));
    suspect(ch.culprit, w); ch.candidates.forEach((s) => suspect(s, w));
    if (!ch.candidates.includes(ch.culprit)) errs.push(`${w}: Der Täter steht nicht unter den Kandidaten.`);
    if (ch.ambush && !ch.ambush.candidates.includes(ch.ambush.target)) errs.push(`${w}: Das Hinterhalt-Ziel steht nicht unter den möglichen Zielen.`);
  });
  for (const k of Object.keys(def.buildings ?? {})) place(k, 'Gebäude');
  const produced = new Set<string>();
  def.chapters.forEach((ch) => { ch.startCards.forEach((c) => produced.add(c)); ch.sceneItems.forEach((s) => produced.add(s.cardId)); ch.timed.forEach((t) => produced.add(t.card)); });
  def.contacts.forEach((c) => c.questions.forEach((q) => { q.gives?.forEach((g) => produced.add(g)); q.contradiction?.gives?.forEach((g) => produced.add(g)); }));
  def.combos.forEach((c) => produced.add(c.result));
  Object.keys(def.cards).forEach((k) => { if (!produced.has(k)) errs.push(`Karte „${k}“ kann nie entstehen.`); });
  return errs;
}

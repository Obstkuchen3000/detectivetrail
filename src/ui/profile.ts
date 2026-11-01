import { TALENTS, HEAT_LEVELS, type Side } from '../game/progress';
import { activeProfile, canRaise, createProfile, deleteProfile, exportCode, importCode, levelFromXp, listProfiles, raiseTalent, resetTalents, setActive, spentPoints, talentPoints, xpForLevel, type Profile } from '../game/profile';
import { fill, h, toast } from './dom';

export function avatar(p: Profile, size = 40) {
  return h('span', { class: 'avatar', style: { width: size + 'px', height: size + 'px', background: `hsl(${p.hue} 55% 32%)`, fontSize: Math.round(size * 0.45) + 'px' } }, p.name.slice(0, 1).toUpperCase());
}

export function xpBar(p: Profile) {
  const lvl = levelFromXp(p.xp), a = xpForLevel(lvl), b = xpForLevel(lvl + 1);
  const pct = Math.max(0, Math.min(100, ((p.xp - a) / (b - a)) * 100));
  return h('div', { class: 'xpbar', title: `${p.xp - a} / ${b - a} EP bis Level ${lvl + 1}` }, h('i', { style: { width: pct + '%' } }));
}

/** Kleine Profilkarte fürs Hauptmenü */
export function profileChip(p: Profile, onClick: () => void) {
  const free = talentPoints(p) - spentPoints(p);
  return h('button', { class: 'profile-chip', onclick: onClick },
    avatar(p, 44),
    h('span', { class: 'grow' }, h('b', {}, p.name), h('small', {}, `Level ${levelFromXp(p.xp)} · ${p.xp} EP`), xpBar(p)),
    free > 0 ? h('span', { class: 'badge' }, `${free} Talentpunkt${free > 1 ? 'e' : ''}`) : null);
}

/** Erster Start: Profil anlegen */
export function welcomeScreen(host: HTMLElement, done: (p: Profile) => void) {
  const input = h('input', { class: 'txt', id: 'pname', placeholder: 'z. B. Det. Rivera', maxlength: 24 }) as HTMLInputElement;
  const create = () => done(createProfile(input.value || 'Detective'));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') create(); });
  const code = h('textarea', { class: 'txt', id: 'pimport', rows: 2, placeholder: 'Übertragungscode einfügen (DT1-…)' }) as HTMLTextAreaElement;
  fill(host, h('div', { class: 'screen' }, h('div', { class: 'screen-inner' },
    h('div', { class: 'logo' }, h('span', {}, 'DETECTIVE'), h('span', { class: 'accent' }, 'TRAIL')),
    h('div', { class: 'quick' },
      h('label', { for: 'pname' }, 'Ihr Dienstname'),
      input,
      h('small', {}, 'Ihr Profil speichert Level, Erfahrung, Talente und Statistik in diesem Browser.'),
      h('button', { class: 'btn big', onclick: create }, 'Dienst antreten ▶'),
      h('label', { for: 'pimport' }, 'Schon ein Profil auf einem anderen Gerät?'),
      code,
      h('button', { class: 'btn ghost', onclick: () => { const p = importCode(code.value); if (p) done(p); else toast('Der Code ist ungültig.', 'bad'); } }, 'Profil übernehmen'),
    ),
  )));
  setTimeout(() => input.focus(), 30);
}

/** Profilseite mit Talentbäumen und Verwaltung */
export function profileScreen(host: HTMLElement, onBack: () => void) {
  const p = activeProfile();
  if (!p) { onBack(); return; }
  const render = () => profileScreen(host, onBack);
  const lvl = levelFromXp(p.xp);
  const free = talentPoints(p) - spentPoints(p);
  const tree = (side: Side, title: string) => h('div', { class: 'tree' },
    h('div', { class: 'tree-head' }, h('h3', {}, title), h('button', { class: 'link', onclick: () => { resetTalents(p, side); render(); } }, 'Punkte zurücksetzen')),
    ...TALENTS.filter((t) => t.side === side).map((t) => {
      const rank = p.talents[t.id] ?? 0; const why = canRaise(p, t.id);
      const locked = lvl < t.minLevel;
      return h('div', { class: 'talent' + (locked ? ' locked' : '') + (rank ? ' has' : '') },
        h('span', { class: 'ticon' }, t.icon),
        h('div', { class: 'grow' }, h('b', {}, t.name), h('small', {}, t.desc),
          h('div', { class: 'ranks' }, ...Array.from({ length: t.maxRank }, (_, i) => h('i', { class: i < rank ? 'on' : '' })), locked ? h('em', {}, `ab Level ${t.minLevel}`) : null)),
        h('button', { class: 'icon-btn plus', disabled: !!why, title: why ?? 'Rang erhöhen', onclick: () => { raiseTalent(p, t.id); render(); } }, '+'));
    }));
  const others = listProfiles().filter((x) => x.id !== p.id);
  const codeBox = h('textarea', { class: 'txt', id: 'pcode', rows: 3, readonly: true }, exportCode(p)) as HTMLTextAreaElement;
  const importBox = h('textarea', { class: 'txt', id: 'pimp', rows: 2, placeholder: 'Übertragungscode einfügen (DT1-…)' }) as HTMLTextAreaElement;
  const nameBox = h('input', { class: 'txt', id: 'pnew', placeholder: 'Name für neues Profil', maxlength: 24 }) as HTMLInputElement;
  fill(host, h('div', { class: 'screen' }, h('div', { class: 'screen-inner wide' },
    h('div', { class: 'profile-head' }, avatar(p, 72),
      h('div', { class: 'grow' }, h('h2', {}, p.name), h('div', {}, `Level ${lvl} · ${p.xp} EP · noch ${xpForLevel(lvl + 1) - p.xp} EP bis Level ${lvl + 1}`), xpBar(p)),
      h('div', { class: 'pstats' },
        h('span', {}, h('b', {}, String(p.stats.games)), 'Partien'), h('span', {}, h('b', {}, String(p.stats.solved)), 'gelöst'),
        h('span', {}, h('b', {}, String(p.stats.escaped)), 'entkommen'), h('span', {}, h('b', {}, String(p.stats.bestScore)), 'Bestwert'))),
    h('p', { class: 'hint narrow' }, `Pro Level gibt es einen Talentpunkt. Ermittler-Talente wirken, wenn Sie solo ermitteln, Flüchtigen-Talente, wenn Sie solo fliehen. Im 2-Spieler-Modus gelten keine Talente. Freie Punkte: ${free}.`),
    h('div', { class: 'trees' }, tree('det', '🕵️ Ermittler'), tree('fug', '🦊 Flüchtige')),
    h('div', { class: 'quick' },
      h('label', {}, 'Fahndungsdruck (freischalten mit Level)'),
      ...HEAT_LEVELS.map((hl) => h('small', { class: lvl >= hl.minLevel ? '' : 'dim' }, `${'🔥'.repeat(hl.level) || '·'} ${hl.name} (Level ${hl.minLevel}, EP ×${hl.xpMul}): ${hl.desc}`)),
    ),
    h('div', { class: 'quick' },
      h('label', { for: 'pcode' }, 'Profil auf ein anderes Gerät übertragen'),
      h('small', {}, 'Kopieren Sie diesen Code und fügen Sie ihn auf dem anderen Gerät beim Start oder hier unten ein. Der Code enthält Ihren aktuellen Stand.'),
      codeBox,
      h('button', { class: 'btn small', onclick: () => { navigator.clipboard?.writeText(codeBox.value).then(() => toast('Code kopiert.', 'good'), () => { codeBox.select(); toast('Bitte manuell kopieren (Strg+C).', 'info'); }); } }, 'Code kopieren'),
      h('label', { for: 'pimp' }, 'Code von einem anderen Gerät übernehmen'),
      importBox,
      h('button', { class: 'btn small ghost', onclick: () => { const q = importCode(importBox.value); if (q) { toast(`Profil „${q.name}“ übernommen.`, 'good'); render(); } else toast('Der Code ist ungültig.', 'bad'); } }, 'Übernehmen'),
    ),
    h('div', { class: 'quick' },
      h('label', {}, 'Profile auf diesem Gerät'),
      ...others.map((o) => h('div', { class: 'row' }, avatar(o, 28), h('span', { class: 'grow' }, `${o.name} · Level ${levelFromXp(o.xp)}`),
        h('button', { class: 'btn small', onclick: () => { setActive(o.id); render(); } }, 'Wechseln'),
        h('button', { class: 'btn small ghost', onclick: () => { if (confirm(`Profil „${o.name}“ löschen?`)) { deleteProfile(o.id); render(); } } }, '🗑'))),
      h('label', { for: 'pnew' }, 'Neues Profil anlegen'),
      h('div', { class: 'row' }, nameBox, h('button', { class: 'btn small', onclick: () => { if (nameBox.value.trim()) { createProfile(nameBox.value); render(); } } }, 'Anlegen')),
    ),
    h('button', { class: 'btn ghost', onclick: onBack }, '← Zurück'),
  )));
}

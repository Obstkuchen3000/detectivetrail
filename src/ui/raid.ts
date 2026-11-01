import type { Game } from '../game/game';
import { RAID_ACTIONS } from '../game/game';
import { ROOM_ICON } from '../game/building';
import { fill, h, toast } from './dom';
import { roomSvg } from './roomart';

/** Ansicht „Gebäudedurchsuchung“: Querschnitt, Personal, Protokoll und Raumbilder */
export class RaidView {
  el: HTMLElement;
  private timer = 0;
  constructor(private game: Game) {
    this.el = h('section', { class: 'view view-raid' });
  }

  render() {
    const g = this.game, R = g.raid;
    window.clearInterval(this.timer);
    if (!R) { fill(this.el); return; }
    const b = g.buildingAt(R.node);
    const floors = Array.from({ length: b.floors }, (_, i) => b.floors - 1 - i);
    const act = !R.ended && R.open === null;
    const head = h('div', { class: 'raid-head' },
      h('div', {}, h('h2', {}, '🏢 ' + b.name), h('small', {}, `${b.type} · ${b.floors} Etagen · Zugriffsteam vor Ort`)),
      h('div', { class: 'stat' }, h('small', {}, 'DURCHGANG'), h('b', {}, `${Math.min(R.turn, R.maxTurns)}/${R.maxTurns}`)),
      h('div', { class: 'stat' }, h('small', {}, 'AKTIONEN'), h('b', { class: 'pips' }, ...Array.from({ length: RAID_ACTIONS }, (_, i) => h('i', { class: i < R.actions ? 'on' : '' })))),
      h('div', { class: 'grow' }),
      !R.ended ? h('button', { class: 'btn end', disabled: R.open !== null, onclick: () => g.raidEndTurn() }, 'Durchgang beenden ▶') : null,
      !R.ended ? h('button', { class: 'btn ghost small', onclick: () => { if (confirm('Durchsuchung abbrechen?')) g.raidAbort(); } }, 'Abbrechen') : null,
    );
    const section = h('div', { class: 'building' },
      ...floors.map((f) => h('div', { class: 'floor' + (R.sealed.includes(f) ? ' sealed' : '') },
        h('div', { class: 'floor-label' }, h('b', {}, f === 0 ? 'EG' : `${f}. OG`),
          !R.sealed.includes(f) ? h('button', { class: 'chip', disabled: !act || R.actions <= 0, title: 'Treppenhaus dieser Etage sperren (1 Aktion)', onclick: () => g.raidSeal(f) }, '🔒 abriegeln') : h('small', {}, '🔒 abgeriegelt')),
        h('div', { class: 'rooms' }, ...b.rooms.filter((r) => r.floor === f).map((r) => {
          const s = R.searched.filter((x) => x.room === r.id).pop();
          const guarded = R.guarded.includes(r.id);
          return h('div', { class: 'room' + (s ? ' searched ' + s.result : '') + (r.exit ? ' exit' : '') },
            h('button', { class: 'room-main', disabled: !act || R.actions <= 0, title: 'Raum durchsuchen (1 Aktion)', onclick: () => g.raidSearch(r.id) },
              h('span', { class: 'ri' }, ROOM_ICON[r.kind]), h('span', { class: 'rn' }, r.name),
              s ? h('small', {}, `${s.result === 'spuren' ? '👣 Spuren' : '∅ leer'} · D${s.turn}`) : null),
            r.exit ? h('button', { class: 'chip exit-btn' + (guarded ? ' on' : ''), disabled: guarded || !act || R.actions <= 0, title: 'Ausgang mit Beamten sichern (1 Aktion)', onclick: () => g.raidGuard(r.id) }, guarded ? '🛡 gesichert' : `🚪 Ausgang sichern`) : null);
        })))),
    );
    const side = h('aside', { class: 'raid-side' },
      h('h3', {}, 'Personal befragen'),
      ...b.staff.map((st) => h('button', { class: 'btn wide', disabled: !act || R.actions <= 0 || R.asked.includes(st.id), onclick: () => g.raidAsk(st.id) }, `🗣 ${st.role} ${st.name}` + (R.asked.includes(st.id) ? ' ✓' : ''))),
      h('p', { class: 'hint' }, 'Jede Aktion kostet 1 von 3 Aktionen pro Durchgang: Raum durchsuchen, Etage abriegeln, Ausgang sichern oder Personal befragen. Am Ende eines Durchgangs wechselt die Zielperson vielleicht den Raum. An einem offenen Ausgang kann sie entkommen.'),
      h('h3', {}, 'Einsatzprotokoll'),
      h('div', { class: 'raid-log' }, ...R.log.slice(0, 18).map((l) => h('div', { class: 'logline' }, l))),
    );
    const parts: HTMLElement[] = [head, h('div', { class: 'raid-body' }, section, side)];
    if (R.ended) {
      const txt = { caught: '🚔 Zugriff erfolgreich!', escaped: '💨 Die Zielperson ist entkommen!', failed: 'Durchsuchung ohne Ergebnis.', aborted: 'Durchsuchung abgebrochen.' }[R.ended];
      parts.push(h('div', { class: 'raid-end ' + R.ended }, h('h2', {}, txt), h('button', { class: 'btn big', onclick: () => g.raidClose() }, R.ended === 'caught' ? 'Weiter' : 'Zurück zur Lagekarte')));
    }
    if (R.open !== null) parts.push(this.roomModal());
    fill(this.el, ...parts);
  }

  private roomModal() {
    const g = this.game, R = g.raid!, b = g.buildingAt(R.node), room = b.rooms[R.open!];
    const fug = g.fugitiveInRaid() && g.fugitive.hidden!.room === room.id;
    const clue = !R.clues.includes(room.id) && g.raidRoomHasTrail(room.id);
    const art = h('div', { class: 'room-art', html: roomSvg(g.seed, room, { fugitive: fug, clue }) });
    art.addEventListener('click', (e) => {
      const hit = (e.target as Element).closest('[data-hit]')?.getAttribute('data-hit');
      if (hit === 'fug') { g.raidCatch(); }
      else if (hit === 'clue') { (e.target as Element).closest('[data-hit]')!.remove(); g.raidClue(); toast('👣 Spuren entdeckt: Hier war vor Kurzem jemand!', 'good'); }
      else { R.openedAt -= 3000; toast('Nichts Auffälliges. Das kostet 3 Sekunden.', 'info'); }
    });
    const left = Math.max(0, g.raidSeconds() - Math.floor((Date.now() - R.openedAt) / 1000));
    const clock = h('b', { class: 'clock' }, `${left}s`);
    this.timer = window.setInterval(() => {
      const l = Math.max(0, g.raidSeconds() - Math.floor((Date.now() - R.openedAt) / 1000));
      clock.textContent = `${l}s`;
      if (l <= 0) { window.clearInterval(this.timer); toast('Die Zeit ist um, das Team muss weiter.', 'info'); g.raidLeaveRoom(); }
    }, 250);
    return h('div', { class: 'room-modal' }, h('div', { class: 'room-box' },
      h('div', { class: 'row' }, h('h3', { class: 'grow' }, `${ROOM_ICON[room.kind]} ${room.name}`), h('span', {}, '⏱ '), clock),
      h('p', { class: 'hint' }, 'Suchen Sie genau: Versteckt sich hier jemand hinter den Möbeln? Klicken Sie die Person an. Auch Spuren wie Fußabdrücke oder ein warmer Becher verraten etwas.'),
      art,
      h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => g.raidLeaveRoom() }, 'Niemand hier, weiter')),
    ));
  }
}

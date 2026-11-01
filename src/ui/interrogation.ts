import type { Game } from '../game/game';
import type { Contact } from '../cases/types';
import { fill, h, modal, portrait, toast } from './dom';

export class InterrogationRoom {
  el: HTMLElement;
  selected: string | null = null;
  mode: 'phone' | 'person' | null = null;
  constructor(private game: Game, private onShowOnMap: (place: string) => void) {
    this.el = h('section', { class: 'view view-talk' });
  }

  render() {
    const g = this.game;
    const unlocked = g.def.contacts.filter((c) => g.contactVisible(c));
    const locked = g.def.contacts.filter((c) => (c.fromChapter ?? 0) <= g.chapterIdx && (c.untilChapter === undefined || g.chapterIdx <= c.untilChapter)).length - unlocked.length;
    if (!this.selected || !unlocked.some((c) => c.id === this.selected)) { this.selected = unlocked[0]?.id ?? null; this.mode = null; }
    const list = h('aside', { class: 'talk-list' },
      h('h3', {}, 'Kontakte'),
      ...unlocked.map((c, i) => {
        const unit = g.unitAtPlace(c);
        const open = g.visibleQuestions(c).filter((q) => !g.isAsked(c, q.id)).length;
        return h('button', { class: 'contact' + (c.id === this.selected ? ' active' : ''), onclick: () => { this.selected = c.id; this.mode = g.callIsActive(c) ? 'phone' : null; this.render(); } },
          h('div', { html: portrait(c.hue, 40, i + 3) }),
          h('div', { class: 'grow' }, h('b', {}, c.name), h('small', {}, c.role)),
          h('div', { class: 'badges' }, unit ? h('span', { class: 'b unit', title: unit.name + ' vor Ort' }, '🚓') : null, open ? h('span', { class: 'b' }, String(open)) : null),
        );
      }),
      locked ? h('p', { class: 'hint' }, `${locked} weitere Kontakte werden durch neue Hinweise freigeschaltet.`) : null,
    );
    const c = unlocked.find((x) => x.id === this.selected);
    fill(this.el, list, c ? this.renderContact(c, unlocked.indexOf(c)) : h('div', { class: 'talk-main empty' }, 'Noch keine Kontakte.'));
  }

  private presentDialog(c: Contact) {
    const g = this.game;
    const cards = [...g.board.keys()].filter((k) => g.cards[k].kind !== 'dossier');
    const close = modal(h('div', { class: 'ask' },
      h('h3', {}, `Was legen Sie ${c.name} vor?`),
      h('p', { class: 'hint' }, 'Wenn eine Aussage nicht zu einem Beweis passt, konfrontieren Sie die Person damit. Ein falsches Beweisstück kostet etwas Wertung.'),
      h('div', { class: 'present-list' }, ...cards.map((k) => h('button', { class: 'chip', onclick: () => {
        close();
        const ans = g.present(c, k);
        if (ans) toast('⚡ Widerspruch aufgedeckt!', 'good');
        else toast(`${c.name} zuckt mit den Schultern: „Und? Was hat das mit mir zu tun?“`, 'bad');
        this.render();
      } }, (g.cards[k].icon ?? '') + ' ' + g.cards[k].title))),
    ));
  }

  private renderContact(c: Contact, idx: number) {
    const g = this.game;
    const place = g.def.places[c.place];
    const unit = g.unitAtPlace(c);
    const callOpen = g.callIsActive(c);
    if (this.mode === 'person' && !unit) this.mode = null;
    if (this.mode === 'phone' && !callOpen) this.mode = null;
    const transcript = g.asked.filter((k) => k.startsWith(c.id + '.')).map((k) => c.questions.find((q) => q.id === k.slice(c.id.length + 1))!).filter(Boolean);
    const qs = g.visibleQuestions(c).filter((q) => !g.isAsked(c, q.id));
    const canAct = g.phase === 'detective';
    return h('div', { class: 'talk-main' },
      h('div', { class: 'talk-head' },
        h('div', { html: portrait(c.hue, 96, idx + 3) }),
        h('div', { class: 'grow' },
          h('h2', {}, c.name), h('div', { class: 'role' }, c.role),
          h('div', { class: 'loc' }, '📍 ' + place.name, ' ', h('button', { class: 'link', onclick: () => this.onShowOnMap(c.place) }, 'auf Karte zeigen')),
          h('div', { class: 'loc ' + (unit ? 'ok' : 'warn') }, c.custody ? '🔒 In Gewahrsam: Sie können die Person direkt im Verhörraum befragen.' : unit ? `🚓 ${unit.name} ist vor Ort` : '🚓 Keine Einheit vor Ort. Für eine persönliche Befragung muss eine Einheit dorthin fahren.'),
        ),
      ),
      h('div', { class: 'row modes' },
        h('button', { class: 'btn' + (this.mode === 'phone' ? ' on' : ''), disabled: !canAct || (!callOpen && g.ap < 1), onclick: () => { if (g.startCall(c)) { this.mode = 'phone'; this.render(); } else toast('Keine Einsatzpunkte mehr.', 'bad'); } }, callOpen ? '📞 Leitung offen' : '📞 Anrufen (1 EP)'),
        h('button', { class: 'btn' + (this.mode === 'person' ? ' on' : ''), disabled: !canAct || !unit, onclick: () => { this.mode = 'person'; this.render(); } }, '🗣️ Vor Ort befragen'),
      ),
      h('div', { class: 'transcript ' + (this.mode ?? '') },
        transcript.length === 0 && !this.mode ? h('p', { class: 'hint' }, 'Wählen Sie Telefon oder persönliches Verhör. Vor Ort erfahren Sie oft mehr, und Sie können Beweisstücke vorlegen.') : null,
        ...transcript.flatMap((q) => {
          const res = q.contradiction && g.resolved.includes(c.id + '.' + q.id);
          return [h('div', { class: 'q' }, '» ' + q.text), h('div', { class: 'a' + (res ? ' lie' : '') }, q.answer),
            res ? h('div', { class: 'q contra' }, `⚡ Widerspruch: ${g.cards[q.contradiction!.card].title} vorgelegt`) : null,
            res ? h('div', { class: 'a' }, q.contradiction!.answer) : null];
        }),
      ),
      this.mode === 'person' && g.phase === 'detective' ? h('button', { class: 'btn present', onclick: () => this.presentDialog(c) }, '🗂️ Beweisstück vorlegen …') : null,
      this.mode ? h('div', { class: 'questions' },
        ...qs.map((q) => {
          const needCard = q.requires && !g.board.has(q.requires);
          const needPerson = q.mode === 'person' && this.mode === 'phone';
          const label = (q.requires && !needCard ? `🗂️ [${g.cards[q.requires].title} vorlegen] ` : '') + q.text;
          return h('button', { class: 'qbtn', disabled: !!(needCard || needPerson), onclick: () => { g.ask(c, q.id, this.mode!); } },
            needCard ? '🔒 Dazu fehlt noch ein Beweisstück.' : label, needPerson ? h('small', {}, ' (nur vor Ort)') : null);
        }),
        qs.length === 0 ? h('p', { class: 'hint' }, 'Mehr gibt es von dieser Person nicht zu erfahren.') : null,
      ) : null,
    );
  }
}

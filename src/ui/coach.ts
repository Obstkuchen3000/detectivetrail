import type { Game } from '../game/game';
import { fill, h } from './dom';

/** Schritt-für-Schritt-Anleitung für den Tutorial-Fall */
export interface CoachCtx { game: Game; view: 'map' | 'board' | 'talk'; scale: number }
interface Step { text: string; done: (c: CoachCtx) => boolean; manual?: boolean }

const STEPS: Step[] = [
  { text: 'Willkommen im Lagezentrum! Sie sehen Manhattan von oben. Verschieben Sie die Karte mit gedrückter Maustaste (oder einem Finger) und zoomen Sie mit dem Mausrad (oder zwei Fingern).', done: () => false, manual: true },
  { text: 'Der blaue Kreis ist das Suchgebiet am Tatort. Zoomen Sie dort ganz tief hinein, bis Passanten, Autos und Bäume erscheinen. Das ist das Wimmelbild.', done: (c) => c.scale >= 2.2 || c.game.board.has('handschuh') || c.game.board.has('bon') },
  { text: 'Zwischen den Passanten liegen zwei hellere, cremefarbene Gegenstände: ein Handschuh und ein Kassenbon. Klicken Sie beide an, um sie zu sichern.', done: (c) => c.game.board.has('handschuh') && c.game.board.has('bon') },
  { text: 'Sehr gut! Fundstücke landen an der Pinnwand. Öffnen Sie oben den Reiter „📌 Pinnwand“.', done: (c) => c.view === 'board' || c.game.board.has('grosse_haende') },
  { text: 'Verbinden Sie Hinweise mit einem roten Faden: Klicken Sie auf die rote Nadel der „Anzeige des Opfers“ und dann auf die Nadel des „Verlorenen Handschuhs“.', done: (c) => c.game.board.has('grosse_haende') },
  { text: 'Eine neue Erkenntnis! Lucy Park ist jetzt ausgestrichen. Der Kassenbon hat außerdem einen Zeugen freigeschaltet. Öffnen Sie „🎙 Verhöre“.', done: (c) => c.view === 'talk' || c.game.board.has('rocco_aussage') },
  { text: 'Rufen Sie Rocco an (das kostet 1 Einsatzpunkt) und fragen Sie, wer um 12 Uhr bei ihm gekauft hat.', done: (c) => c.game.board.has('rocco_aussage') },
  { text: 'Zurück zur Pinnwand: Verbinden Sie „Aussage Rocco“ mit der Erkenntnis „Große Hände, rote Mütze“.', done: (c) => c.game.board.has('benny') },
  { text: 'Jetzt ist nur noch eine Person übrig. Beantragen Sie rechts unter „Haftbefehl beantragen“ den Haftbefehl gegen Benny Kowal.', done: (c) => !!c.game.warrant },
  { text: 'Wechseln Sie zur „🗺 Lagekarte“. Die Spuren rechts zeigen, wo Benny gesehen wurde. Klicken Sie eine Einheit an und dann einen grün markierten Knoten in seiner Nähe.', done: (c) => c.game.units.some((u) => u.moved) || c.game.round > 1 },
  { text: 'Klicken Sie oben auf „Runde beenden ▶“. Benny zieht, und neue Kamera-Treffer erscheinen. Kreisen Sie ihn ein und fahren Sie mit einer Einheit direkt auf seinen Knoten, dann klicken die Handschellen.', done: (c) => c.game.phase === 'over' },
];

export class Coach {
  el: HTMLElement;
  step = 0;
  hidden = false;
  constructor(private onChange: () => void) { this.el = h('div', { class: 'coach' }); }
  update(c: CoachCtx) {
    while (this.step < STEPS.length && !STEPS[this.step].manual && STEPS[this.step].done(c)) this.step++;
    if (this.hidden || this.step >= STEPS.length) { this.el.style.display = 'none'; return; }
    this.el.style.display = '';
    const s = STEPS[this.step];
    fill(this.el,
      h('div', { class: 'coach-head' }, h('b', {}, '🎓 Coach'), h('small', {}, `Schritt ${this.step + 1} von ${STEPS.length}`), h('button', { class: 'link', onclick: () => { this.hidden = true; this.onChange(); } }, 'ausblenden')),
      h('p', {}, s.text),
      s.manual ? h('button', { class: 'btn small', onclick: () => { this.step++; this.onChange(); } }, 'Verstanden ▶') : null,
    );
  }
}

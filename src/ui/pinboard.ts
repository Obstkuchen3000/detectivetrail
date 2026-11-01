import type { Game } from '../game/game';
import { fill, h, portrait, toast } from './dom';

const KIND_LABEL: Record<string, string> = { dokument: 'Dokument', beweis: 'Beweis', aussage: 'Aussage', dossier: 'Dossier', erkenntnis: 'Erkenntnis', fund: 'Fundstück' };

export class Pinboard {
  el: HTMLElement;
  private board: HTMLElement;
  private svg: SVGSVGElement;
  private temp: SVGPathElement;
  private from: string | null = null;
  private side: HTMLElement;
  private cardEls = new Map<string, HTMLElement>();
  private z = 10;

  constructor(private game: Game, private onShowContact: () => void) {
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.classList.add('threads');
    this.temp = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.temp.classList.add('thread', 'temp');
    this.board = h('div', { class: 'board' });
    this.board.append(this.svg);
    this.side = h('aside', { class: 'board-side' });
    this.el = h('section', { class: 'view view-board' }, h('div', { class: 'board-wrap' }, this.board), this.side);
    this.board.addEventListener('pointermove', (e) => {
      if (!this.from) return;
      const r = this.board.getBoundingClientRect();
      const a = this.pinPos(this.from);
      this.temp.setAttribute('d', threadPath(a.x, a.y, e.clientX - r.left, e.clientY - r.top));
    });
    this.board.addEventListener('pointerdown', (e) => {
      if (this.from && !(e.target as HTMLElement).closest('.pin')) this.cancel();
    });
    void this.onShowContact;
  }

  private pinPos(id: string) { const c = this.game.board.get(id)!; return { x: c.x + 100, y: c.y + 8 }; }

  private cancel() { this.from = null; this.temp.remove(); this.board.classList.remove('connecting'); this.cardEls.forEach((e) => e.classList.remove('from')); }

  private pinClick(id: string) {
    if (!this.from) {
      this.from = id; this.svg.append(this.temp); this.board.classList.add('connecting');
      this.cardEls.get(id)?.classList.add('from');
      const a = this.pinPos(id); this.temp.setAttribute('d', threadPath(a.x, a.y, a.x, a.y));
      return;
    }
    const a = this.from; this.cancel();
    if (a === id) return;
    const res = this.game.tryConnect(a, id);
    if (res === 'wrong') {
      const p = this.pinPos(a), q = this.pinPos(id);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.classList.add('thread', 'snap'); path.setAttribute('d', threadPath(p.x, p.y, q.x, q.y));
      this.svg.append(path); setTimeout(() => path.remove(), 900);
      toast('Kein erkennbarer Zusammenhang. Der Faden reißt.', 'bad');
    } else if (res === 'known') toast('Diese Verbindung hängt schon.', 'info');
  }

  render() {
    const g = this.game;
    // Karten
    for (const [id, bc] of g.board) {
      let el = this.cardEls.get(id);
      const def = g.cards[id];
      if (!el) {
        const pin = h('div', { class: 'pin', title: 'Faden spannen', onpointerdown: (e: PointerEvent) => { e.stopPropagation(); }, onclick: (e: MouseEvent) => { e.stopPropagation(); this.pinClick(id); } });
        const sid = id.startsWith('dossier_') ? id.slice(8) : null;
        const sus = sid ? g.def.suspects.find((s) => s.id === sid) : null;
        el = h('div', { class: `card kind-${def.kind}`, 'data-id': id },
          pin,
          h('div', { class: 'card-kind' }, (def.icon ? def.icon + ' ' : '') + KIND_LABEL[def.kind]),
          sus ? h('div', { class: 'card-photo', html: portrait(sus.hue, 64, g.def.suspects.indexOf(sus)) }) : null,
          h('h4', {}, def.title),
          h('p', {}, ...def.text.split('\n').flatMap((l, i) => (i ? [h('br'), l] : [l]))),
          h('div', { class: 'stamp' }),
        );
        el.style.setProperty('--rot', ((hashStr(id) % 7) - 3) * 0.6 + 'deg');
        this.dragify(el, id);
        this.board.append(el); this.cardEls.set(id, el);
      }
      el.style.left = bc.x + 'px'; el.style.top = bc.y + 'px';
      el.classList.toggle('new', bc.isNew);
      const sid = id.startsWith('dossier_') ? id.slice(8) : null;
      if (!g.board.has(id)) continue;
      const stamp = el.querySelector('.stamp')!;
      stamp.textContent = sid && g.cleared.has(sid) ? 'ENTLASTET' : sid && g.warrant === sid ? 'HAFTBEFEHL' : sid && g.marked.has(sid) ? 'VERDÄCHTIG' : bc.isNew ? 'NEU' : '';
      stamp.className = 'stamp ' + (sid && g.cleared.has(sid) ? 'cleared' : sid && g.warrant === sid ? 'warrant' : sid && g.marked.has(sid) ? 'marked' : bc.isNew ? 'isnew' : '');
    }
    this.drawThreads();
    this.renderSide();
  }

  private drawThreads() {
    const g = this.game;
    [...this.svg.querySelectorAll('path.fixed')].forEach((p) => p.remove());
    for (const [a, b] of g.threads) {
      if (!g.board.has(a) || !g.board.has(b)) continue;
      const p = this.pinPos(a), q = this.pinPos(b);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.classList.add('thread', 'fixed'); path.setAttribute('d', threadPath(p.x, p.y, q.x, q.y));
      this.svg.insertBefore(path, this.svg.firstChild);
    }
  }

  private dragify(el: HTMLElement, id: string) {
    let start: { x: number; y: number; cx: number; cy: number } | null = null;
    el.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('.pin')) return;
      const c = this.game.board.get(id)!; start = { x: e.clientX, y: e.clientY, cx: c.x, cy: c.y };
      el.style.zIndex = String(++this.z); el.setPointerCapture(e.pointerId); el.classList.add('dragging');
    });
    el.addEventListener('pointermove', (e) => {
      if (!start) return;
      const c = this.game.board.get(id)!;
      c.x = Math.max(0, Math.min(2400, start.cx + e.clientX - start.x)); c.y = Math.max(0, Math.min(2100, start.cy + e.clientY - start.y));
      el.style.left = c.x + 'px'; el.style.top = c.y + 'px';
      this.drawThreads();
    });
    const end = () => { start = null; el.classList.remove('dragging'); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  }

  private renderSide() {
    const g = this.game;
    fill(this.side, 
      h('h3', {}, 'Verdächtige'),
      h('p', { class: 'hint' }, 'Klicken Sie auf die Nadel einer Karte und dann auf die Nadel einer zweiten Karte, um sie mit einem roten Faden zu verbinden. Gehören die Hinweise zusammen, entsteht eine neue Erkenntnis.'),
      h('div', { class: 'objective' }, h('b', {}, `Akt ${g.chapterIdx + 1}: ${g.chapter.title}`), h('small', {}, g.chapter.objective)),
      ...g.def.suspects.filter((s) => (s.chapter ?? 0) <= g.chapterIdx).sort((a, b) => +g.chapter.candidates.includes(b.id) - +g.chapter.candidates.includes(a.id)).map((s) => {
        const i = g.def.suspects.indexOf(s);
        const cand = g.chapter.candidates.includes(s.id);
        const cleared = g.cleared.has(s.id), marked = g.marked.has(s.id), w = g.warrant === s.id;
        return h('div', { class: 'suspect' + (cleared ? ' cleared' : '') + (marked ? ' marked' : '') + (w ? ' warrant' : '') + (cand ? '' : ' other') },
          h('div', { html: portrait(s.hue, 40, i) }),
          h('div', { class: 'grow' }, h('b', {}, s.name), h('small', {}, `${s.height} · Gr. ${s.shoe} · ${s.smoker}`), s.extra ? h('small', {}, s.extra) : null),
          cand ? h('button', { class: 'icon-btn', title: 'Als verdächtig markieren', onclick: () => g.toggleMark(s.id) }, marked ? '★' : '☆') : null,
          cand ? h('button', { class: 'icon-btn x', title: 'Ausschließen / wieder aufnehmen', onclick: () => g.toggleCleared(s.id) }, '✗') : null,
        );
      }),
      h('div', { class: 'warrant-box' },
        g.warrant
          ? h('div', { class: 'ok' }, '⚖️ Haftbefehl gegen ' + g.def.suspects.find((s) => s.id === g.warrant)!.name + ' liegt vor. Stellen Sie die Person mit einer Einheit!')
          : h('div', {},
            h('label', {}, 'Haftbefehl beantragen'),
            (() => {
              const sel = h('select', { class: 'txt' }, h('option', { value: '' }, 'Verdächtigen wählen…'), ...g.warrantCandidates().map((s) => h('option', { value: s.id }, s.name))) as HTMLSelectElement;
              const btn = h('button', { class: 'btn danger', onclick: () => { if (!sel.value) return; if (g.phase !== 'detective') { toast('Haftbefehle können Sie nur in Ihrem Zug beantragen.', 'info'); return; } if (confirm('Haftbefehl gegen ' + sel.selectedOptions[0].text + ' beantragen? Wenn die Beweise nicht reichen, verlieren Sie 2 Runden.')) g.requestWarrant(sel.value); } }, 'Beantragen');
              return h('div', { class: 'row' }, sel, btn);
            })(),
            h('small', { class: 'hint' }, 'Erst mit Haftbefehl darf eine Einheit festnehmen. Bei einem falschen Antrag verlieren Sie 2 Runden.'),
          ),
      ),
    );
  }
}

function threadPath(x1: number, y1: number, x2: number, y2: number) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 + Math.min(80, Math.hypot(x2 - x1, y2 - y1) * 0.15);
  return `M${x1},${y1} Q${mx},${my} ${x2},${y2}`;
}
function hashStr(s: string) { let x = 0; for (const c of s) x = (x * 31 + c.charCodeAt(0)) | 0; return Math.abs(x); }

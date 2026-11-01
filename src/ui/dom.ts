export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, unknown> = {}, ...children: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function toast(text: string, kind: 'good' | 'bad' | 'info' = 'info') {
  let box = document.querySelector('.toasts');
  if (!box) { box = h('div', { class: 'toasts' }); document.body.append(box); }
  const t = h('div', { class: 'toast ' + kind }, text);
  box.append(t);
  while (box.children.length > 4) box.firstElementChild!.remove();
  setTimeout(() => t.classList.add('out'), 4200);
  setTimeout(() => t.remove(), 4800);
}

export function modal(content: HTMLElement, opts: { onClose?: () => void; cls?: string } = {}) {
  const back = h('div', { class: 'modal-back ' + (opts.cls ?? '') });
  const box = h('div', { class: 'modal' }, content);
  back.append(box);
  const close = () => { back.remove(); opts.onClose?.(); };
  back.addEventListener('pointerdown', (e) => { if (e.target === back) close(); });
  document.body.append(back);
  return close;
}

export function askText(title: string, placeholder: string, options?: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: string | null) => { if (done) return; done = true; close(); resolve(v); };
    const input = h('input', { type: 'text', placeholder, class: 'txt' }) as HTMLInputElement;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(input.value.trim()); if (e.key === 'Escape') finish(null); });
    const content = h('div', { class: 'ask' },
      h('h3', {}, title),
      options ? h('div', { class: 'chips' }, ...options.map((o) => h('button', { class: 'chip', onclick: () => finish(o) }, o))) : null,
      input,
      h('div', { class: 'row end' }, h('button', { class: 'btn ghost', onclick: () => finish(null) }, 'Abbrechen'), h('button', { class: 'btn', onclick: () => finish(input.value.trim()) }, 'OK')),
    );
    const close = modal(content, { onClose: () => finish(null) });
    setTimeout(() => input.focus(), 30);
  });
}

/** Stilisierte Silhouette als Porträt */
export function portrait(hue: number, size = 56, seed = 0): string {
  const hair = seed % 3;
  const hairPath = hair === 0 ? 'M30 30 Q50 8 70 30 Q72 40 68 44 Q62 26 50 26 Q38 26 32 44 Q28 40 30 30Z'
    : hair === 1 ? 'M28 36 Q30 10 50 12 Q72 12 72 38 Q74 62 68 70 L66 44 Q60 24 50 24 Q40 24 34 44 L32 70 Q26 60 28 36Z'
    : 'M32 34 Q36 16 50 16 Q64 16 68 34 L64 30 Q50 22 36 30Z';
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" class="portrait">
    <defs><linearGradient id="pg${hue}${seed}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue} 45% 32%)"/><stop offset="1" stop-color="hsl(${hue} 50% 14%)"/></linearGradient></defs>
    <rect width="100" height="100" fill="url(#pg${hue}${seed})"/>
    <path d="M14 100 Q16 72 50 68 Q84 72 86 100Z" fill="#0b1220"/>
    <ellipse cx="50" cy="44" rx="17" ry="21" fill="#18233a"/>
    <path d="${hairPath}" fill="#05080f"/>
    <rect x="0" y="0" width="100" height="100" fill="url(#scan)" opacity=".2"/>
  </svg>`;
}

export function fill(el: Element, ...children: (Node | string | null | undefined | false)[]) {
  el.replaceChildren(...(children.filter((c) => c !== null && c !== undefined && c !== false) as (Node | string)[]));
}

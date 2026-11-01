import type { CaseDef } from './types';

/** Geführter Einstiegsfall – kurz, mit Coach (siehe ui/coach.ts) */
export const tutorialCase: CaseDef = {
  id: 'nyc-tutorial',
  cityId: 'nyc',
  kind: 'story',
  title: 'Erster Arbeitstag',
  subtitle: 'Tutorial · Der Koffer aus dem Bryant Park',
  teaser: 'Ihr erster Fall im Lagezentrum: Ein Dieb schnappt sich einen Aktenkoffer im Bryant Park. Ein Coach führt Sie Schritt für Schritt durch Karte, Pinnwand, Verhör und Festnahme.',
  places: {
    tatort: { name: 'Bryant Park, Lesegarten', lon: -73.9838, lat: 40.7537 },
    hotdog: { name: 'Hotdog-Stand Rocco', lon: -73.9858, lat: 40.7548 },
  },
  units: [
    { name: 'Alpha', lon: -73.9887, lat: 40.7496 },
    { name: 'Bravo', lon: -73.9772, lat: 40.7505 },
    { name: 'Charlie', lon: -73.9845, lat: 40.7590 },
  ],
  suspects: [
    { id: 'benny', name: 'Benny Kowal', age: 37, job: 'Fensterputzer', height: '1,91 m', shoe: 47, smoker: 'Raucher', extra: 'Trägt eine rote Wollmütze · Handschuhgröße XL', notes: 'Zweimal wegen Taschendiebstahls verwarnt.', hue: 5 },
    { id: 'lucy', name: 'Lucy Park', age: 22, job: 'Studentin', height: '1,58 m', shoe: 37, smoker: 'Nichtraucherin', extra: 'Zierliche Hände · Handschuhgröße S', notes: 'Saß zur Tatzeit im Park.', hue: 200 },
    { id: 'sal', name: 'Sal Moretti', age: 51, job: 'Zeitungsverkäufer', height: '1,76 m', shoe: 43, smoker: 'Zigarren', extra: 'Trägt eine blaue Schiebermütze · Handschuhgröße L', notes: 'Hat einen Kiosk an der 42nd Street.', hue: 120 },
  ],
  cards: {
    anzeige: { kind: 'dokument', icon: '📄', title: 'Anzeige des Opfers', text: '„Ein großer Mann mit einer roten Mütze hat mir den Koffer aus der Hand gerissen und ist Richtung 6th Avenue gerannt.“' },
    handschuh: { kind: 'fund', icon: '🧤', title: 'Verlorener Handschuh', text: 'Ein Arbeitshandschuh, Größe XL. Daran hängen rote Wollfussel.' },
    bon: { kind: 'fund', icon: '🧾', title: 'Kassenbon', text: 'Hotdog-Stand Rocco, 12:02 Uhr: 2 Hotdogs, 1 Cola.' },
    rocco_aussage: { kind: 'aussage', icon: '🌭', title: 'Aussage Rocco', text: '„Der Typ mit der roten Mütze? Das ist Benny, der Fensterputzer. Der kauft jeden Mittag zwei Hotdogs bei mir.“' },
    grosse_haende: { kind: 'erkenntnis', icon: '✋', title: 'Große Hände, rote Mütze', text: 'Der Handschuh in Größe XL mit roten Fusseln passt zum Mann mit der roten Mütze. Die zierliche Lucy Park scheidet aus.', clears: 'lucy' },
    benny: { kind: 'erkenntnis', icon: '🎯', title: 'Es ist Benny', text: 'Rote Mütze, große Hände, mittags am Park: Benny Kowal ist der Dieb. Sal Moretti trägt eine blaue Mütze.', clears: 'sal' },
  },
  combos: [
    { a: 'anzeige', b: 'handschuh', result: 'grosse_haende' },
    { a: 'rocco_aussage', b: 'grosse_haende', result: 'benny' },
  ],
  contacts: [
    {
      id: 'rocco', name: 'Rocco Bianchi', role: 'Hotdog-Verkäufer', place: 'hotdog', hue: 30, unlockedBy: ['bon'],
      questions: [
        { id: 'mittag', mode: 'any', text: 'Wer hat um 12 Uhr bei Ihnen gekauft?', answer: 'Um zwölf? Der lange Benny mit seiner roten Mütze, wie jeden Tag. Fensterputzer, hängt immer an den Hochhäusern rum.', gives: ['rocco_aussage'] },
        { id: 'wohin', mode: 'person', text: 'Wohin ist er gelaufen?', answer: 'Richtung 6th Avenue, und dann weiß ich nicht. Der ist nicht schnell, der hat Knieprobleme.' },
      ],
    },
  ],
  dropItems: [{ icon: 'cup', title: 'Colabecher' }, { icon: 'paper', title: 'Hotdog-Papier' }],
  chapters: [
    {
      title: 'Der Koffer',
      intro: [
        'Willkommen im Lagezentrum, Detective. Heute Mittag wurde im Bryant Park einem Anwalt sein Aktenkoffer entrissen.',
        'Der Dieb ist zu Fuß unterwegs und nicht besonders schnell. Ein guter erster Fall.',
        'Ein Coach unten links erklärt Ihnen jeden Schritt.',
      ],
      objective: 'Finden Sie heraus, wer den Koffer gestohlen hat, und nehmen Sie die Person fest.',
      culprit: 'benny',
      candidates: ['benny', 'lucy', 'sal'],
      start: 'tatort',
      maxRounds: 16,
      pingRounds: [2, 4, 6, 8, 10, 12, 14],
      taxis: 0,
      tutorial: true,
      startCards: ['anzeige'],
      sceneItems: [
        { place: 'tatort', cardId: 'handschuh', icon: 'glove', dx: 35, dy: 25 },
        { place: 'tatort', cardId: 'bon', icon: 'ticket', dx: -30, dy: -20 },
      ],
      timed: [],
      fugitiveIntro: 'Du bist Benny Kowal. Der Koffer ist schwer, dein Knie tut weh. Halte 16 Runden durch.',
      outro: ['Benny Kowal wird festgenommen. Der Aktenkoffer ist unversehrt, der Anwalt bedankt sich überschwänglich.'],
    },
  ],
  epilogue: ['Herzlichen Glückwunsch zum ersten gelösten Fall! Die Storyfälle warten. Dort gibt es mehr Verdächtige, U-Bahn, Taxis, Fluchtpunkte und Lügen.'],
};

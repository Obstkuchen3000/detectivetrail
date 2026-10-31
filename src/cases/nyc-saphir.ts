import type { CaseDef } from './types';

export const saphirCase: CaseDef = {
  id: 'nyc-saphir',
  cityId: 'nyc',
  title: 'Der Blaue Reiher',
  subtitle: 'Saphirraub im Diamond District',
  briefing: [
    '02:10 Uhr, Midtown Manhattan. Beim Juwelier Halvorsen & Söhne an der 5th Avenue wurde der „Blaue Reiher“ gestohlen, ein Saphir mit 14 Karat.',
    'Die Alarmanlage wurde lautlos deaktiviert und die Hintertür ohne Schaden geöffnet. Der Täter ist zu Fuß verschwunden.',
    'Die Spurensicherung hat den Tatort freigegeben. Zoomen Sie in das Suchgebiet hinein und sammeln Sie die Fundstücke ein.',
    'Ermitteln Sie die Identität des Täters, beantragen Sie einen Haftbefehl und stellen Sie ihn mit Ihren Einheiten, bevor er die Stadt verlässt.',
  ],
  maxRounds: 18,
  pingRounds: [3, 6, 9, 12, 15],
  places: {
    juwelier: { name: 'Juwelier Halvorsen & Söhne', lon: -73.9789, lat: 40.7569 },
    deli: { name: "Gus's Deli", lon: -73.9824, lat: 40.7577 },
    laurent: { name: 'The Laurent Residences', lon: -73.9768, lat: 40.7590 },
    bellevue: { name: 'Bellevue Hospital', lon: -73.9754, lat: 40.7392 },
    swift: { name: 'Swift Couriers', lon: -74.004, lat: 40.7495 },
    galerie: { name: 'Galerie Moreau', lon: -74.0013, lat: 40.724 },
    orlov: { name: 'Orlov Pawn & Loan', lon: -73.946, lat: 40.8085 },
    hale: { name: 'Wohnung V. Hale', lon: -73.9915, lat: 40.766 },
    werkstatt: { name: 'Booker Lock & Key', lon: -73.9895, lat: 40.7205 },
  },
  crimeScene: 'juwelier',
  units: [
    { name: 'Alpha', lon: -73.995, lat: 40.7535 },
    { name: 'Bravo', lon: -73.983, lat: 40.737 },
    { name: 'Charlie', lon: -73.9755, lat: 40.7845 },
    { name: 'Delta', lon: -73.997, lat: 40.716 },
  ],
  suspects: [
    { id: 'hale', name: 'Victor Hale', age: 52, job: 'Ehem. Wachmann bei Halvorsen, vor 3 Monaten entlassen', height: '1,88 m', shoe: 46, smoker: 'Nichtraucher', notes: 'Kennt die Abläufe im Geschäft und ist verbittert über die Kündigung.', hue: 210 },
    { id: 'vega', name: 'Marisol Vega', age: 29, job: 'Auszubildende Goldschmiedin bei Halvorsen', height: '1,64 m', shoe: 38, smoker: 'Nichtraucherin', notes: 'Hat Schulden und Zugang zum Tresorraum.', hue: 330 },
    { id: 'booker', name: 'Raymond „Ray“ Booker', age: 41, job: 'Inhaber eines Schlüsseldienstes (Lower East Side)', height: '1,86 m', shoe: 45, smoker: 'Raucher', notes: 'Hat eine Insolvenz hinter sich. Seit Jahren unauffällig.', hue: 25, culprit: true },
    { id: 'pike', name: 'Jonah Pike', age: 34, job: 'Fahrradkurier, liefert regelmäßig an Halvorsen', height: '1,85 m', shoe: 45, smoker: 'Raucher (Drehtabak)', notes: 'Vorstrafe wegen Ladendiebstahls (2015).', hue: 140 },
    { id: 'moreau', name: 'Celeste Moreau', age: 45, job: 'Kunsthändlerin, SoHo', height: '1,70 m', shoe: 39, smoker: 'Gelegentlich Zigarillos', notes: 'Wollte den Saphir kaufen, Halvorsen hat abgelehnt.', hue: 280 },
    { id: 'orlov', name: 'Dmitri Orlov', age: 58, job: 'Pfandleiher in Harlem', height: '1,79 m', shoe: 44, smoker: 'Zigarren', notes: '1998 wegen Einbruchs verurteilt. Gilt als Hehler.', hue: 60 },
  ],
  cards: {
    tatbericht: { kind: 'dokument', icon: '📄', title: 'Tatbericht NYPD', text: 'Einbruch um 02:10. Die Alarmanlage wurde mit dem gültigen Code deaktiviert. Das Schloss der Hintertür ist unbeschädigt. Ein Portier im Nachbarhaus war im Dienst.' },
    foto: { kind: 'beweis', icon: '📷', title: 'Überwachungsfoto', text: 'Eine Kamera hat den Täter von hinten aufgenommen. Er trägt eine Kapuze und ist im Vergleich mit dem Türrahmen etwa 1,85 m groß.' },
    schuh: { kind: 'fund', icon: '👣', title: 'Schuhabdruck', text: 'Abdruck im Staub am Hintereingang. Profil eines Arbeitsstiefels, Größe 45.' },
    kippe: { kind: 'fund', icon: '🚬', title: 'Zigarettenstummel', text: 'Frische Kippe neben dem Hintereingang. Ins Labor geschickt.' },
    dietrich: { kind: 'fund', icon: '🔧', title: 'Abgebrochene Dietrichspitze', text: 'Eine feine Stahlspitze aus einem professionellen Öffnungswerkzeug. So etwas gibt es nicht im Baumarkt.' },
    becher: { kind: 'fund', icon: '☕', title: 'Kaffeebecher', text: "Leerer Becher von Gus's Deli an der 6th Avenue. Noch lauwarm." },
    labor: { kind: 'dokument', icon: '🧪', title: 'Laborbefund', text: 'Speichel am Zigarettenstummel: männliche DNA, nicht in der Datenbank. Die Marke ist „Lucky Strike“.' },
    codeliste: { kind: 'aussage', icon: '🔢', title: 'Wer kannte den Code?', text: 'Halvorsen: „Den Alarmcode kannten nur Victor Hale, Marisol Vega und die Firma, die die Anlage eingebaut hat.“' },
    gus_aussage: { kind: 'aussage', icon: '🗨️', title: 'Aussage Gus', text: 'Um 01:45 kaufte ein großer Mann mit Kapuze einen schwarzen Kaffee und zahlte bar.' },
    schluesselbund: { kind: 'aussage', icon: '🔑', title: 'Riesiger Schlüsselbund', text: 'Gus: „Er hatte einen Bund mit mindestens 50 Schlüsseln am Gürtel. Das hat ständig geklimpert.“' },
    logo: { kind: 'aussage', icon: '🅱️', title: 'Logo auf der Tasche', text: 'Portier Luis: „Er trug schwere Stiefel. Auf seiner Werkzeugtasche war ein großes B mit einem Schlüssel darin.“' },
    alibi_vega: { kind: 'aussage', icon: '🏥', title: 'Alibi Vega (unbestätigt)', text: 'Vega sagt, sie war die ganze Nacht mit ihrer Mutter in der Notaufnahme des Bellevue.' },
    bellevue_ok: { kind: 'dokument', icon: '📋', title: 'Bestätigung Bellevue', text: 'Laut Schwester Whitfield war Marisol Vega von 00:00 bis 06:00 durchgehend in der Notaufnahme.' },
    gps_pike: { kind: 'dokument', icon: '🛰️', title: 'GPS-Log Swift Couriers', text: 'Das Kurierfahrrad von J. Pike war zwischen 01:30 und 02:45 in Williamsburg, Brooklyn.' },
    alibi_moreau: { kind: 'aussage', icon: '🥂', title: 'Vernissage-Fotos', text: 'Moreau war bis 03:00 auf ihrer Vernissage. Es gibt Social-Media-Fotos mit Zeitstempel.' },
    hale_schuhe: { kind: 'beweis', icon: '🥾', title: 'Hales Schuhe', text: 'Victor Hale hat Schuhgröße 46 und besitzt keine Arbeitsstiefel.' },
    orlov_tipp: { kind: 'aussage', icon: '☎️', title: 'Tipp von Orlov', text: 'Orlov: „Ray Booker hat gestern angerufen und gefragt, ob ich noch Kontakte nach Antwerpen habe.“' },
    kowalski: { kind: 'aussage', icon: '🏚️', title: 'Aussage der Nachbarin', text: 'Ray Booker ist seit gestern Abend verschwunden. Er hatte es sehr eilig und hat eine Zigarette nach der anderen geraucht.' },
    booker_offline: { kind: 'dokument', icon: '📵', title: 'Handy von Booker aus', text: 'Bookers Mobiltelefon ist seit 01:30 ausgeschaltet.' },
    // Erkenntnisse
    profil: { kind: 'erkenntnis', icon: '🧍', title: 'Täterprofil', text: 'Der Täter ist etwa 1,85 m groß, hat Schuhgröße 45 und trägt Arbeitsstiefel.' },
    insider: { kind: 'erkenntnis', icon: '🔐', title: 'Insiderwissen', text: 'Der Täter kannte den Alarmcode. Das waren nur Hale, Vega oder der Installateur der Anlage.' },
    profi: { kind: 'erkenntnis', icon: '🛠️', title: 'Profi am Werk', text: 'Die Hintertür wurde mit Spezialwerkzeug geöffnet. Der Täter beherrscht das Öffnen von Schlössern.' },
    dna: { kind: 'erkenntnis', icon: '🧬', title: 'Raucher am Tatort', text: 'Der Täter ist ein Mann und raucht Lucky Strike.' },
    handwerker: { kind: 'erkenntnis', icon: '🔑', title: 'Schlüssel-Profi', text: 'Spezialwerkzeug und ein riesiger Schlüsselbund: Der Täter arbeitet vermutlich bei einem Schlüsseldienst.' },
    spur_booker: { kind: 'erkenntnis', icon: '🎯', title: 'Spur: Booker Lock & Key', text: 'Das B mit Schlüssel ist das Logo von Booker Lock & Key. Diese Firma hat die Alarmanlage eingebaut und kennt den Code.' },
    vega_entlastet: { kind: 'erkenntnis', icon: '✅', title: 'Vega entlastet', text: 'Das Alibi von Marisol Vega ist bestätigt.', clears: 'vega' },
    pike_entlastet: { kind: 'erkenntnis', icon: '✅', title: 'Pike entlastet', text: 'Jonah Pike war zur Tatzeit nachweislich in Brooklyn.', clears: 'pike' },
    moreau_entlastet: { kind: 'erkenntnis', icon: '✅', title: 'Moreau entlastet', text: 'Celeste Moreau war zur Tatzeit vor vielen Zeugen auf ihrer Vernissage.', clears: 'moreau' },
    hale_entlastet: { kind: 'erkenntnis', icon: '✅', title: 'Hale entlastet', text: 'Hales Schuhgröße passt nicht zum Abdruck, und Arbeitsstiefel besitzt er nicht.', clears: 'hale' },
    hehler: { kind: 'erkenntnis', icon: '💎', title: 'Booker sucht einen Hehler', text: 'Booker hat bei Orlov nach Abnehmern in Antwerpen gefragt. Er will einen Edelstein verkaufen.' },
    untergetaucht: { kind: 'erkenntnis', icon: '🕳️', title: 'Booker ist untergetaucht', text: 'Booker hat sein Handy ausgeschaltet und ist seit der Tatnacht verschwunden.' },
    raucher_match: { kind: 'erkenntnis', icon: '🚬', title: 'Die Marke passt', text: 'Ray Booker raucht Lucky Strike, genau wie der Täter.' },
    zeitlinie: { kind: 'erkenntnis', icon: '⏱️', title: 'Der Täter hat gewartet', text: 'Der Täter stand ab 01:45 bei Gus und hat auf den richtigen Moment gewartet.' },
  },
  startCards: ['tatbericht', 'foto'],
  sceneItems: [
    { cardId: 'schuh', icon: 'shoe', dx: -38, dy: 26 },
    { cardId: 'kippe', icon: 'cig', dx: 55, dy: -40 },
    { cardId: 'dietrich', icon: 'pick', dx: -20, dy: -62 },
    { cardId: 'becher', icon: 'cup', dx: 95, dy: 70 },
  ],
  combos: [
    { a: 'foto', b: 'schuh', result: 'profil' },
    { a: 'tatbericht', b: 'codeliste', result: 'insider' },
    { a: 'tatbericht', b: 'dietrich', result: 'profi' },
    { a: 'kippe', b: 'labor', result: 'dna' },
    { a: 'profi', b: 'schluesselbund', result: 'handwerker' },
    { a: 'insider', b: 'logo', result: 'spur_booker' },
    { a: 'bellevue_ok', b: 'dossier_vega', result: 'vega_entlastet' },
    { a: 'gps_pike', b: 'dossier_pike', result: 'pike_entlastet' },
    { a: 'alibi_moreau', b: 'dossier_moreau', result: 'moreau_entlastet' },
    { a: 'hale_schuhe', b: 'profil', result: 'hale_entlastet' },
    { a: 'orlov_tipp', b: 'dossier_booker', result: 'hehler' },
    { a: 'kowalski', b: 'booker_offline', result: 'untergetaucht' },
    { a: 'dna', b: 'kowalski', result: 'raucher_match' },
    { a: 'gus_aussage', b: 'becher', result: 'zeitlinie' },
  ],
  contacts: [
    {
      id: 'halvorsen', name: 'Erik Halvorsen', role: 'Inhaber des Juweliergeschäfts', place: 'juwelier', hue: 200,
      questions: [
        { id: 'was', mode: 'any', text: 'Was genau wurde gestohlen?', answer: 'Der „Blaue Reiher“, ein Saphir mit 14 Karat aus Ceylon. Auf dem legalen Markt kann ihn niemand verkaufen, dafür ist er zu bekannt.' },
        { id: 'code', mode: 'any', text: 'Wer kannte den Alarmcode?', answer: 'Nur Victor Hale, Marisol Vega und die Firma, die die Anlage eingebaut hat. Den Code habe ich seit dem Einbau nicht geändert. Ein Fehler, ich weiß.', gives: ['codeliste'] },
        { id: 'firma', mode: 'person', text: 'Welche Firma hat die Anlage eingebaut?', answer: '(Er sucht in einem Ordner.) Ein kleiner Schlüsseldienst downtown, das war vor zwei Jahren. Auf der Rechnung steht nur „B. L. & K.“' },
        { id: 'foto', mode: 'any', requires: 'foto', text: 'Erkennen Sie die Person auf dem Foto?', answer: 'Wegen der Kapuze sehe ich kein Gesicht. Groß ist er, und breit. Marisol ist es jedenfalls nicht, sie ist winzig.' },
      ],
    },
    {
      id: 'luis', name: 'Luis Ortega', role: 'Nachtportier, The Laurent', place: 'laurent', hue: 30,
      questions: [
        { id: 'gesehen', mode: 'any', text: 'Haben Sie heute Nacht etwas bemerkt?', answer: 'Gegen 02:20 ist ein Mann mit einer großen Tasche schnell an meiner Tür vorbeigelaufen. Ganz ruhig, nicht gerannt, aber zügig.' },
        { id: 'stiefel', mode: 'person', requires: 'schuh', text: 'Trug er Arbeitsstiefel?', answer: '(Er schaut sich das Foto vom Abdruck an.) Ja, schwere Stiefel, ich habe sie auf dem Marmor gehört. Auf der Werkzeugtasche war ein Logo: ein großes B mit einem Schlüssel darin.', gives: ['logo'] },
      ],
    },
    {
      id: 'gus', name: 'Gus Papadakis', role: "Inhaber von Gus's Deli", place: 'deli', hue: 5, unlockedBy: ['becher'],
      questions: [
        { id: 'kunde', mode: 'any', text: 'Hatten Sie heute Nacht Kundschaft?', answer: 'Um Viertel vor zwei kam ein großer Typ mit Kapuze. Schwarzer Kaffee, bar bezahlt, kein Wort gesagt. Dann hat er draußen eine geraucht und zur 5th rübergeschaut.', gives: ['gus_aussage'] },
        { id: 'foto', mode: 'person', requires: 'foto', text: 'Ist das der Mann?', answer: 'Ja, die Kapuze, die Schultern. Und er hatte einen riesigen Schlüsselbund am Gürtel, bestimmt 50 Schlüssel. Das hat die ganze Zeit geklimpert.', gives: ['schluesselbund'] },
      ],
    },
    {
      id: 'vega', name: 'Marisol Vega', role: 'Verdächtige · Auszubildende Goldschmiedin', place: 'bellevue', hue: 330,
      questions: [
        { id: 'wo', mode: 'any', text: 'Wo waren Sie letzte Nacht?', answer: 'In der Notaufnahme vom Bellevue! Meine Mutter hatte Herzrasen, ich war die ganze Nacht bei ihr. Fragen Sie dort nach.', gives: ['alibi_vega'] },
        { id: 'code', mode: 'any', text: 'Sie kennen den Alarmcode?', answer: 'Ja. Aber das tun auch andere. Ich habe nichts gestohlen.' },
      ],
    },
    {
      id: 'bellevue', name: 'Dana Whitfield', role: 'Pflegekraft, Bellevue Notaufnahme', place: 'bellevue', hue: 180, unlockedBy: ['alibi_vega'],
      questions: [
        { id: 'tel', mode: 'any', text: 'War Marisol Vega letzte Nacht bei Ihnen?', answer: 'Am Telefon darf ich keine Auskunft über Patienten geben. Kommen Sie bitte vorbei.' },
        { id: 'vor', mode: 'person', text: 'Können Sie Vegas Anwesenheit bestätigen?', answer: '(Sie zeigt Ihnen das Besucherprotokoll.) Ja, von Mitternacht bis 6 Uhr war sie durchgehend am Bett ihrer Mutter. Ich habe ihr dreimal Kaffee gebracht.', gives: ['bellevue_ok'] },
      ],
    },
    {
      id: 'swift', name: 'Tom Reyes', role: 'Disponent, Swift Couriers', place: 'swift', hue: 100,
      questions: [
        { id: 'pike', mode: 'any', text: 'Wo war Jonah Pike um 2 Uhr?', answer: 'Jonah hatte die Nachtschicht und war in Brooklyn unterwegs. Ich schicke Ihnen das GPS-Log von seinem Fahrrad.', gives: ['gps_pike'] },
      ],
    },
    {
      id: 'moreau', name: 'Celeste Moreau', role: 'Verdächtige · Kunsthändlerin', place: 'galerie', hue: 280,
      questions: [
        { id: 'wo', mode: 'any', text: 'Wo waren Sie letzte Nacht?', answer: 'Auf meiner eigenen Vernissage, bis drei Uhr früh. Vierzig Gäste und hundert Fotos auf Instagram. Reicht Ihnen das?', gives: ['alibi_moreau'] },
        { id: 'motiv', mode: 'person', text: 'Sie wollten den Saphir kaufen?', answer: 'Natürlich. Halvorsen hat abgelehnt. Ich bin Sammlerin, Detective, und keine Diebin. Ich kaufe Dinge, ich stehle sie nicht.' },
      ],
    },
    {
      id: 'hale', name: 'Victor Hale', role: 'Verdächtiger · Ehem. Wachmann', place: 'hale', hue: 210,
      questions: [
        { id: 'wo', mode: 'any', text: 'Wo waren Sie letzte Nacht?', answer: 'Zu Hause. Seit der Kündigung kann ich kaum schlafen. Ich hasse Halvorsen, aber ich bin kein Dieb.' },
        { id: 'schuhe', mode: 'person', requires: 'schuh', text: 'Dürfen wir Ihre Schuhe sehen?', answer: '(Er öffnet den Schrank: Halbschuhe und Sneaker, alle in Größe 46.) Arbeitsstiefel? Ich habe 20 Jahre in Anzug und Krawatte gearbeitet.', gives: ['hale_schuhe'] },
      ],
    },
    {
      id: 'orlov', name: 'Dmitri Orlov', role: 'Verdächtiger · Pfandleiher', place: 'orlov', hue: 60,
      questions: [
        { id: 'wo', mode: 'any', text: 'Wo waren Sie letzte Nacht?', answer: 'Zu Hause, allein mit meiner Katze. Für so etwas bin ich zu alt, Detective.' },
        { id: 'stein', mode: 'person', text: 'Hat Ihnen jemand einen Saphir angeboten?', answer: '(Er beugt sich über den Tresen.) Noch nicht. Aber Ray Booker, der Schlüsseldienst, hat gestern angerufen. Er wollte wissen, ob ich noch Kontakte nach Antwerpen habe. Komisch, oder?', gives: ['orlov_tipp'] },
      ],
    },
    {
      id: 'kowalski', name: 'Irena Kowalski', role: 'Nachbarin von Booker Lock & Key', place: 'werkstatt', hue: 0, unlockedBy: ['logo', 'handwerker', 'orlov_tipp'],
      questions: [
        { id: 'ray', mode: 'any', text: 'Kennen Sie Ray Booker?', answer: 'Den Schlüsseldienst unten? Ray ist seit gestern Abend weg. Er hatte es furchtbar eilig und hat eine Lucky nach der anderen geraucht. Sein Laden ist zu.', gives: ['kowalski'] },
      ],
    },
    {
      id: 'booker', name: 'Ray Booker', role: 'Verdächtiger · Schlüsseldienst', place: 'werkstatt', hue: 25, unlockedBy: ['logo', 'handwerker', 'orlov_tipp', 'kowalski'],
      questions: [
        { id: 'anruf', mode: 'any', text: 'Mobilnummer anrufen', answer: '„Der gewünschte Gesprächspartner ist zurzeit nicht erreichbar.“ (Laut Funkzellenabfrage ist das Handy seit 01:30 aus.)', gives: ['booker_offline'] },
      ],
    },
  ],
  timed: [{ round: 4, card: 'labor', needs: 'kippe' }],
  dropItems: [
    { icon: 'cig', title: 'Zigarettenstummel (Lucky Strike)' },
    { icon: 'ticket', title: 'Zerknüllter Fahrschein' },
    { icon: 'cup', title: 'Kaffeebecher' },
    { icon: 'paper', title: 'Zerrissener Stadtplan' },
    { icon: 'glove', title: 'Arbeitshandschuh' },
  ],
  fugitiveIntro: 'Du bist Ray Booker. Der „Blaue Reiher“ steckt in deiner Werkzeugtasche. Halte 18 Runden durch, bis dein Kontakt dich aus der Stadt bringt. Jede U-Bahn-Fahrt, jede Kamera und jedes Taxi kann dich verraten.',
};

export const CASES = [saphirCase];

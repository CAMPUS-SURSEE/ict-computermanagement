/* bausteine.js — die Bausteine des Design-Systems (Namensraum «UI»).

   Jeder Baustein hat hier genau EINEN Bauer: die gemeinsamen bauen das
   Markup von Dashboard-Style (.ds-*-Klassen aus vendor/dashboard-style/
   ds.css), die ICT-eigenen das aus bausteine.css. Seiten bauen nur über
   UI.*, Rahmen.* (rahmen.js), Bewegung.* (unten, über DS.motion) und
   F.* (fenster.js); Kopien von el/knopf/symbol/chip/karte gibt es nicht
   mehr. rahmen.js hängt die Überlagerungen an UI an (UI.dialog,
   UI.bestaetigen, UI.blatt, UI.meldung, UI.tipp, UI.adresse).

   Grundsätze:
     - DOM nur über createElement/textContent; nie innerHTML mit Daten.
       Die Sinnbilder kommen aus Dashboard-Style (DS.icons) und entstehen
       über DS.icons.iconElement, ohne innerHTML.
     - Jeder Bauer gibt einen DOM-Knoten zurück und nimmt ein Objekt mit
       Optionen; die alten Positionsparameter (F.karte, F.kachel, …)
       funktionieren weiter.
     - Was sich an Ort und Stelle ändern muss (Schalter, Status, Chip,
       Fortschritt, Suche), bekommt Methoden am Knoten (.setzen …), damit
       Seiten nicht neu aufbauen müssen – Neuaufbau zerstört Fokus und
       spielt Übergänge nicht.
     - Sichtbare Texte Schweizer Hochdeutsch; Leerwert «–».
     - Tooltips: Bauer setzen data-tipp; UI.tipp (rahmen.js) zeigt sie.

   ------------------------------------------------------------------
   API
   ------------------------------------------------------------------
   DOM-Helfer
     UI.$(id)                         → Element | null
     UI.el(tag, klasse?, text?)       → Element (text per textContent)
     UI.leeren(knoten)                → knoten (ohne Kinder)
     UI.anhaengen(eltern, kinder)     → eltern (Array oder ein Knoten; falsy übersprungen)
     UI.text(wert)                    → "" für null/undefined/false, sonst String
     UI.gleichwertig(a, b)            → boolean («leer» = null = undefined = "";
                                        sonst gleicher Text: true = "true";
                                        ein Boolean ist nie gleich «leer»)
     UI.textSetzen(knoten, text)      → knoten (schreibt nur, wenn anders)
     UI.id(praefix = 'ui')            → eindeutige id («ui-feld-3»)
     UI.kinderAbgleichen(behaelter, [knoten…]) → behaelter
                                        Kinder auf die Liste bringen, ohne bleibende
                                        Knoten zu bewegen (Fokus bleibt; Filter)

   Für alle Bauer von Bedienelementen (knopf, chip, kachel, listenZeile,
   eingabe, schalter, Einträge von kennwerte/verteilung, leerzustand.aktion):
     fokus: 'schluessel'  setzt data-fokus – damit finden F.zeichneBereich,
                          Rahmen.stillZeichnen und der Rückfokus der Ebenen das
                          neu gebaute Element wieder (jedes Bedienelement ohne id).

   Sinnbilder (EIN Set aus DS.icons, Lucide-Stil, siehe SINNBILDER unten)
     UI.sinnbild(name, groesse = 20, klasse?) → <svg class="icon …" aria-hidden>
     UI.SINNBILDER                    → { deutscher Name: Glyphe in DS.icons } (eingefroren)
       Grössen: 20 Navigation/Icon-Knöpfe/Banner, 16 in Knöpfen/Chips/Listen,
       18 Filter-Chip-Haken, 24 Leerzustand.

   Knöpfe
     UI.knopf(text, klasse?, beiKlick?)                 (kompatibel)
     UI.knopf({ text, variante: 'primaer'|'tonal'|'leise'|'still'|'sinnbild',
                sinnbild, klein, weiter, titel, label, beiKlick, typ = 'button',
                id, href, gedrueckt, deaktiviert, gesperrt, fokus, klasse })  → button | a
       variante 'sinnbild' (oder sinnbild ohne text) = runder Icon-Knopf;
       label/titel werden aria-label. titel = Tooltip (data-tipp).
       weiter: true hängt einen Pfeil an, der beim Hover nachrückt.
       gesperrt: 'Grund' = gesperrt MIT Grund (aria-disabled, fokussierbar,
       der Tooltip nennt den Grund statt titel); deaktiviert = disabled ohne Grund.
       Beispiel: UI.knopf({ text: 'Speichern', variante: 'primaer', beiKlick: speichern })
     UI.knopfText(knopf, text)        Beschriftung ändern, Icon bleibt.
     UI.knopfSperren(knopf, grund|'') → knopf
       Sperre mit Grund an Ort und Stelle setzen bzw. aufheben ('' hebt auf,
       der frühere Tooltip kehrt zurück). Darf bei jedem Tastendruck laufen.
     UI.knopfSperre(knopf) → { grund, tipp }
       Liest die Sperre mit Grund ('' = frei) und den Tooltip des freien
       Knopfs, ohne etwas zu ändern (F.seitenkopf: Knopf bleibt stehen, nur
       die Sperre wechselt).
     UI.knopfUebernehmen(alt, neu) → boolean
       Der stehende Knopf «alt» übernimmt den beiKlick-Handler von «neu»
       (F.seitenkopf); false, wenn «neu» ohne beiKlick gebaut wurde.
     UI.beschaeftigt(knopf, an, text = 'Wird gespeichert …') → Promise
       an = true: sofort gesperrt (aria-disabled + aria-busy, Fokus bleibt,
       Klicks werden geschluckt), Spinner erst nach 200 ms in gleicher
       Breite; schliesst Fehlermeldungen (UI.meldungenFehlerSchliessen,
       falls rahmen.js sie anbietet).
       an = false: hält einen sichtbaren Spinner mind. 450 ms, dann kehrt
       die Beschriftung zurück (Promise löst danach auf).
     UI.beschaeftigtAbwarten(knopf) → Promise
       Wartet, bis der Spinner gehen darf (bricht einen noch nicht
       sichtbaren ab); der Knopf bleibt gesperrt. Vor einem Neuaufbau.

   Status, Hinweise
     UI.status(text, ton = 'neutral', { sinnbild, titel }) → span.ds-status
       ton: 'erfolg' | 'warnung' | 'gefahr' | 'neutral' | 'laeuft' (Spinner)
            | 'wartet' (Uhr) | 'aus' (Verbot); alte Töne 'info'/'leise'/'marke'
            → neutral. Standard-Icons wie ChatBob: erfolg=check, warnung und
            gefahr=achtung (Dreieck), neutral=info. sinnbild: Name oder false
            (nur wo der Text allein eindeutig ist). titel: Tooltip; der Chip
            wird dann ein Tabstopp (Tooltip auch per Tastatur).
       .setzen(text, ton, optionen) aktualisiert an Ort und Stelle (ein
       laufender Spinner dreht weiter).
     UI.banner(textOderKnoten, ton?, knopfKnoten?, { rolle, sinnbild })  (kompatibel zu F.banner)
     UI.banner({ titel, text, ton, knopf: Knoten|Knoten[], rolle, sinnbild }) → div.ds-alert
       ton: 'info' (Standard, neutral) | 'erfolg' | 'warnung' | 'gefahr'.
       titel wird als <strong> vorangestellt. .textKnoten = div.ds-alert__text.
     UI.leerzustand({ sinnbild = 'info', titel, text, aktion: { text, beiKlick,
                      variante = 'tonal', sinnbild } | Knoten })     → div.ds-empty
     UI.leerzustand(titel, text)                                    (kompatibel)
     UI.hinweis(text) → p.ds-muted      UI.meta(text) → p.ds-meta
     UI.teile([text|Knoten, …]) → span.ds-parts (Teile mit «·»; leere fallen weg)

   Laden
     UI.spinner(klein?) → span.ds-spinner[.ds-spinner--sm]
     UI.ladezeile(text = 'Wird geladen …') → div.ds-loading (erscheint nach 200 ms)
     UI.skelettSeite({ karten = 2, text = 'Wird geladen …', kopf = true }) → div.ds-skeleton
       role=status; erscheint nach 200 ms, pulsiert.

   Karten, Kacheln
     UI.karte({ titel, unter, aktionen: [Knoten], fuss: [Knoten], sinnbild, breit,
                gefuellt, ebene = 2, klasse, id }) → section.ds-card mit .inhalt
                (div.karte-inhalt), .kopf, .aktionen (div.karte-kopf-aktionen | null),
                .fuss (div.ds-card__links | null: Fusszeile unter einer Haarlinie;
                im Kartenraster unten bündig). sinnbild: 20 px vor dem Titel.
     UI.karte(titel, unter, breit)                                   (kompatibel)
     UI.kachel({ text, wert, unter, ton, sinnbild, beiKlick, href, zahl, titel })
       → div|button|a.ds-tile. Leerer Wert = «–». ton ('erfolg'|'warnung'|
       'gefahr') setzt ein Icon in die Beschriftung, nie Farbe auf die Zahl.
       zahl (Number) setzt data-zahl fürs Hochzählen beim ersten Zeigen.
     UI.kachel(beschriftung, wertText, unter, ton)                  (kompatibel)
     UI.kacheln([kachel, …]) → div.ds-tiles

   Datenzeilen
     UI.datenzeilen([zeile, …]) → div.datenzeilen
     UI.feldZeile(name, wert, { neben, gesperrt, hinweis }) → div.datenzeile
       wert: Text oder Knoten; leer → «–». gesperrt: Schloss + Tooltip
       (hinweis oder Standardtext).
     UI.feldGesperrt(name, wert, hinweis?)   → Schloss-Zeile   (kompatibel F.feldGesperrt)
     UI.feldFrei(name, knoten, mitSchloss?, hinweis?)          (kompatibel F.feldFrei)
     UI.formZeile(beschriftung, feldKnoten, { geaendert, hinweis, zusatz })
     UI.formZeile(beschriftung, feldKnoten, geaendert, hinweis, zusatz)   (kompatibel)
       → div.datenzeile.datenzeile-form; die Beschriftung ist ein <label>
       für das (erste) Feld; «(geändert)» für den Screenreader steckt im
       Label und erscheint nur mit .geaendert (Seiten schalten die Klasse
       an der Zeile um, wie bisher).
     UI.kennwerte([[name, wert], …]) → ul.ds-kv-list   (Wert rechts, leer «–»)
     UI.kennwerte([{ name, wert, href, beiKlick, ton, titel, fokus }, …])
       → klickbare Kennwerte (Bestandskarte, Mapping 7.2 #15): Zeilen als
       Link/Knopf mit 6-%-Ebene, Null leise, ton 'warnung'|'gefahr' als
       Sinnbild vor dem Namen (nie Farbe auf der Zahl).
     UI.fakten([[name, wert|Knoten], …]) → dl.ds-facts

   Chips, Zähler
     UI.chip({ text, gewaehlt, beiKlick(gewaehlt, e), entfernen: fn, titel, label,
               sinnbild, href, id, deaktiviert, umschalten = true }) → button.chip
       gewaehlt gesetzt = Filter-Umschalter (aria-pressed + Häkchen; ein Klick
       schaltet selbst um, beiKlick bekommt den neuen Zustand);
       entfernen = aktiver Filter mit × (aria-label «Filter «…» entfernen»);
       sonst Aktions-Chip. .setzen(gewaehlt), .istGewaehlt().
       Höchstens so breit wie seine Zeile: ein langer Text endet mit «…»,
       der Tooltip zeigt ihn dann ganz (ohne titel ist er der Text selbst).
     UI.chips([chip, …]) → div.ds-chips
     UI.zaehler(zahl, still?, { ploppen }) → span.zaehler (.setzen(zahl))
       leer (null/"") = verborgen; .setzen von leer auf eine Zahl ploppt
       einmal, Wert → Wert ohne Bewegung. ploppen: true ploppt schon beim
       Bauen (nur für eine Plakette, die genau jetzt erscheint).

   Formulare
     UI.eingabe({ art: 'text'|'zahl'|'datum'|'textbereich'|'auswahl'|'suche'|'mail'|'telefon',
                  id, name, wert, platzhalter, label (aria), werte: [text | [wert, text] |
                  { wert, text }] (auswahl), leer: 'Text der Leeroption' (auswahl),
                  vorschlaege: [texte] (datalist, bei jedem Aufruf aktualisiert), schmal,
                  gefuellt, zeilen, min, max, schritt, maxLaenge, pflicht, nurLesen,
                  gesperrt, klasse, beiEingabe(wert, feld), beiAenderung(wert, feld) })
       → input | select | textarea.feld-eingabe. Eine Auswahl behält einen
       unbekannten gespeicherten Wert als Option (.werteSetzen(werte, wert));
       eine Eingabe mit Vorschlägen hat .vorschlaegeSetzen(werte).
       Beispiel: UI.formZeile('Gebäude / Stock', UI.eingabe({ id: 'g-eingabe-GebaeudeStock',
                   wert: z.GebaeudeStock, vorschlaege: alleStockwerke, beiEingabe: setze }))
     UI.feld(beschriftung, feldKnoten, { hinweis, voll, klasse }) → div.ds-field
       (label[for] oben, Hinweis unten mit aria-describedby)
     UI.feldFehler(feld, meldung)   Fehler setzen (Rahmen, Meldung mit Icon darunter,
       aria-invalid, aria-describedby); die erste Eingabe löscht ihn; '' löscht.
     UI.feldHinweis(hinweisKnoten, text, { sinnbild, ton }) → hinweisKnoten
       Hinweis mit Sinnbild an Ort und Stelle (Live-Prüfung «in Ordnung»);
       ohne Text verborgen. ton färbt nur das Sinnbild.
     UI.hinweisPlatz({ id, klasse }) → div.hinweis-platz
       .setzen(schluessel, bauen() → Knoten, { aufdecken }) – Hinweis, der am
       Getippten hängt: gebaut nur bei neuem Schlüssel, '' = leer und verborgen,
       aufgedeckt nur, wenn er durch eine Eingabe erscheint; Fokus bleibt.
     UI.ankreuzen({ text, an, beiAenderung(an, kaestchen), id, name, wert,
                    art: 'checkbox'|'radio', gesperrt, klein, fokus }) → label.ds-check (.eingabe)
     UI.mehrfach({ legende, eintraege: [{ wert, text, zahl, an, gesperrt, fokus }], name,
                   fokus (Präfix: data-fokus «<fokus>-<wert>» je Kästchen),
                   beiAenderung(wert, an, gewaehlte) }) → fieldset.ds-field mit .mehrfach;
       .gewaehlt() → [werte], .setzen([werte]), .zahlenSetzen({ wert: zahl })
       (an Ort und Stelle, der Fokus bleibt).
     UI.datenliste(id, werte) → datalist (anlegen oder aktualisieren)
     UI.auswahlFuellen(select, werte, wert, leerText) → select
     UI.zahlText(n, nachkomma?) → «1’284», «7.5» (de-CH; ohne nachkomma höchstens
       eine Nachkommastelle, sonst genau so viele; Zahlen als Text gehen auch;
       leer → ""). Hilfe.zahlText (graph.js) führt hierher zurück.
     UI.zeitText(datum|iso) → «12.10.2026, 14.05» (Uhrzeit mit Punkt; ungültig → "")

   Suche, Schalter
     UI.suchfeld({ id, name, platzhalter, wert, label, kuerzel: '/', verzoegerung = 150,
                   beiEingabe(wert, feld), klasse }) → div.ds-search
       .eingabe (input.suche), .wert(), .setzen(wert) (schreibt nie, während
       getippt wird), .sofort() (wartende Eingabe sofort melden).
       Esc in einer gefüllten Suche leert sie und meldet das sofort
       (preventDefault: die Seite behandelt dieses Esc nicht mehr).
     UI.schalter({ an, gesperrt, deaktiviert, label, titel, beiWechsel(an, schalter), id, klasse })
       → button.schalter[role=switch]. Ein Klick schaltet an Ort und Stelle um
       (Übergang spielt); beiWechsel → false oder Promise(false)/Fehler setzt
       zurück. .setzen(an, gesperrt?, titel?), .sperren(bool), .istAn(),
       .istGesperrt(). Gesperrt = an + Schloss + aria-disabled (fokussierbar,
       Tooltip). Feuert «schalterwechsel».
     UI.schalterZeile({ schalter | an/gesperrt/titel/beiWechsel, name, unter,
                        wort: true | { an, aus, gesperrt }, zusatz: [Knoten], kompakt })
       → div.schalter-zeile (kompakt: .schalter-feld); Name = <label> des
       Schalters; Zustandswort «Aktiv»/«Inaktiv» (gesperrt ebenfalls «Aktiv»,
       das Schloss im Schalter zeigt die Sperre).

   Tabellen
     UI.tabelle(kopfzeilen, datenzeilen, { beschriftung, klasse }) → div.ds-table-wrap
       (kopfzeilen: Texte oder { text, zahl, klasse }; Zellen Text oder Knoten;
       leer «–»; .tabelle = das table; mit rollKanten: Blende am Rand nur,
       solange es seitlich weitergeht)
     UI.tabellenKopf([{ schluessel, text, sortierbar = true, zahl, klasse, titel }],
                     { sortiert, richtung: 'auf'|'ab', beiSortieren(schluessel, knopf) }) → thead
       aria-sort an allen sortierbaren th; .sortierungSetzen(schluessel, richtung).
     UI.sortierKnopf(text, richtung?) → button.ds-table__sort (.richtungSetzen(r))
     UI.tabellenRahmen(table, { id, klasse }) → div.tabelle-rahmen (mit rollKanten)
     UI.rollKanten(element) → element; setzt data-gerollt-x / data-gerollt beim Rollen
       und data-mehr-rechts, solange rechts noch Inhalt liegt (auch nach Grössenwechseln),
       dazu --rollleiste (Breite einer senkrechten Rollleiste; die Blende lässt sie aus).
       bausteine.css blendet .tabelle-rahmen / .ds-table-wrap daran aus.

   Listen
     UI.hinweisZeile({ ton: 'gefahr'|'warnung'|'info'|'erfolg', titel, text, sinnbild })
     UI.hinweise([zeile, …]) → div.hinweise
     UI.listenZeile({ titel, unter: Text|[Teile]|Knoten, href, beiKlick, aktionen: [Knöpfe],
                      status: Knoten|[Knoten], aktuell, marke, sinnbild, titelTipp, pfeil,
                      fokus, klasse })
       → a | button | div.listen-zeile (ganze Zeile klickbar mit Pfeil, solange
       keine Aktionen; sonst wird der Titel zum Link).
     UI.zeilenliste([zeile, …]) → div.zeilenliste
     UI.zahlmarke(zahl, ton?: 'warnung'|'gefahr') → span.zahlmarke (32-px-Pille vorne
       in einer Listenzeile: UI.listenZeile({ marke: UI.zahlmarke(3, 'gefahr') }))
     UI.zeitachse([{ titel, zeit: Text|Knoten, zeitSinnbild, text, still, zusatz: [Knoten],
                     aktionen: [Knöpfe], klasse }]) → ol.zeitachse
       (zeitSinnbild: 16-px-Sinnbild vor der Meta-Zeile, z. B. 'sync' beim Abgleich)

   Diagramme
     UI.balken(anteil 0..1, ton?: 'still'|'warnung'|'gefahr') → div.balken (.setzen(anteil))
     UI.saeulen([zahl | { wert, titel, hervorgehoben }], { max, hervorheben: index, label })
       → div.saeulen[role=img]
     UI.verteilung([{ text, zahl, anteil, titel, beiKlick, href }], { max, klasse })
       → ul.verteilung (Name · Zahl · Balken; klickbare Zeilen mit 6-%-Ebene)
     UI.fortschritt({ anteil, text, detail, unbestimmt, label }) → div.ds-progress
       (.setzen({ … }) ändert nur, was sich ändert; der Balken gleitet weiter)
   ------------------------------------------------------------------ */

"use strict";

/* ==================================================================
   Bewegung — die deutsche Hülle um DS.motion und DS.indicator
   (vendor/dashboard-style/ds.js). Früher bewegung.js; die Klassen und
   Keyframes kommen jetzt aus Dashboard-Style (.ds-enter, .ds-leave,
   .ds-stagger …), die Zeiten aus seinen Tokens. Hier steht nur, was ICT
   darüber hinaus braucht: Varianten mit deutschen Namen, ein Ein- oder
   Austritt wartet auf ALLE eigenen Animationen (siehe eintreten), das
   Hochzählen in Schweizer Schreibweise und der erste Auftritt einer
   Ansicht (auftritt).

   Grundregeln:
     - Auftritte werden AUSDRÜCKLICH ausgelöst (erstes Zeigen, Wechsel der
       Ansicht), nie von Zeichenfunktionen selbst. Aktualisierte Daten
       (Auto-Nachladen, BroadcastChannel) animieren nie.
     - Ladeanzeigen erscheinen erst nach LADE_VERZOEGERUNG_MS und bleiben
       dann mindestens LADE_MINDESTENS_MS stehen.
     - Reduzierte Bewegung läuft über die Tokens (1 ms); hier zählen nur
       hochzaehlen (zeigt sofort das Ziel) und weiches Rollen.

   API (unverändert)
     Bewegung.LADE_VERZOEGERUNG_MS  200  (= DS.motion.LOADER_DELAY_MS = --ds-delay-loader)
     Bewegung.LADE_MINDESTENS_MS    450  (= DS.motion.LOADER_MIN_VISIBLE_MS)
     Bewegung.ZAEHLEN_MS            600  (= DS.motion.COUNT_UP_MS = --ds-dur-glide)
     Bewegung.STAFFEL_MAX           5    (= DS.motion.STAGGER_MAX, Stufen 0…5)
     Bewegung.reduziert() → boolean
     Bewegung.staffeln(elemente, { ab = 0, max = STAFFEL_MAX })   (--ds-i über das CSSOM)
     Bewegung.wiederholen(el, ...klassen)
     Bewegung.abgeschlossen(el, { zeit = 1000, ereignis = 'animationend', eigenschaft }) → Promise
     Bewegung.eintreten(el, variante = '') → Promise
       '' | 'blenden' | 'skalieren' | 'schieben' | 'tausch' | 'verzoegert' |
       'ploppen' | 'aufziehen' | 'aufrichten'
       (= .ds-enter mit --fade, --scale, --slide, --swap, --delayed, --pop,
       --fill-x, --fill-y)
     Bewegung.austreten(el, variante = '', { dann = 'entfernen' | 'verbergen' | 'behalten' }) → Promise
       '' | 'sinken' | 'skalieren' | 'schieben'  (= .ds-leave --sink, --scale, --slide)
     Bewegung.aufdecken(el) → Promise   (Inhalt ersetzt seinen Platzhalter)
     Bewegung.ladeHaltenMs(start, jetzt) → ms     Bewegung.ladeAbwarten(start, jetzt) → Promise
     Bewegung.kurveAusgleiten(t) → 0…1  (ease-out cubic)
     Bewegung.hochzaehlen(el, ziel, { format, dauer = 600 })   (Standardformat de-CH, «1’284»)
     Bewegung.zahlenHochzaehlen(behaelter)   jedes [data-zahl], behält « %» usw.
     Bewegung.aufziehen(behaelter)   .balken-fuell und .saeule-fuell wachsen einmal
     Bewegung.auftritt(behaelter, { wurzel = true })   staffelt .karten, .ds-grid-2,
       .ds-stack, .ds-tiles, .zeilenliste, zählt hoch, zieht Balken auf (erstes Zeigen)
     Bewegung.indikator(spur, { aktiv, klasse }) → { aktualisieren(), zerstoeren() }
       (= DS.indicator.createIndicator)
   ================================================================== */

const Bewegung = (function () {

  if (typeof DS === "undefined" || !DS.motion || !DS.indicator) {
    throw new Error("bausteine.js braucht vendor/dashboard-style/ds.js (vorher laden).");
  }
  const M = DS.motion;

  /** Längste Animation des Systems (--ds-dur-glide) plus Reserve. */
  const STANDARD_FRIST_MS = 1000;

  const EINTRITT_VARIANTEN = { blenden: "fade", skalieren: "scale", schieben: "slide", tausch: "swap",
    verzoegert: "delayed", ploppen: "pop", aufziehen: "fill-x", aufrichten: "fill-y" };
  const AUSTRITT_VARIANTEN = { sinken: "sink", skalieren: "scale", schieben: "slide" };

  /* Raster, deren Kinder beim ersten Zeigen gestaffelt einblenden. */
  const STAFFEL_RASTER = ".karten, .ds-grid-2, .ds-stack, .ds-tiles, .zeilenliste";

  const zahlFormat = (function () {
    try { return new Intl.NumberFormat("de-CH"); } catch (e) { return null; }
  })();

  function zahlText(wert) {
    const gerundet = Math.round(wert);
    return zahlFormat ? zahlFormat.format(gerundet) : String(gerundet);
  }

  function reduziert() { return M.prefersReducedMotion(); }

  function staffeln(elemente, optionen) {
    const o = optionen || {};
    M.stagger(Array.from(elemente || []), { from: o.ab || 0, max: o.max });
  }

  function wiederholen(element) {
    M.replay.apply(null, arguments);
  }

  function abgeschlossen(element, optionen) {
    if (!element) return Promise.resolve();
    const o = optionen || {};
    return M.settled(element, { timeout: o.zeit || STANDARD_FRIST_MS, event: o.ereignis, property: o.eigenschaft });
  }

  function eintrittKlassen(variante) {
    const v = EINTRITT_VARIANTEN[variante];
    return v ? ["ds-enter", "ds-enter--" + v] : ["ds-enter"];
  }

  function austrittKlassen(variante) {
    const v = AUSTRITT_VARIANTEN[variante];
    return v ? ["ds-leave", "ds-leave--" + v] : ["ds-leave"];
  }

  function alleAustrittKlassen() {
    return ["ds-leave"].concat(Object.keys(AUSTRITT_VARIANTEN).map(function (v) { return "ds-leave--" + AUSTRITT_VARIANTEN[v]; }));
  }

  /* Ein Eintritt besteht aus ZWEI Animationen (Deckkraft und Bewegung).
     DS.motion.enter wartet auf das erste animationend; ein gleich danach
     gestarteter Austritt hielte das zweite für sein eigenes Ende und
     entfernte das Element ohne Bewegung. Darum wartet ein Ein- oder
     Austritt hier auf ALLE eigenen Animationen (Web Animations API, mit
     Frist), und eine Laufnummer pro Element sorgt dafür, dass ein
     überholter Lauf die Klassen eines neueren nicht wegnimmt (aufdecken
     während eines laufenden Eintritts). */
  const EINTRITT_KEYFRAMES = ["ds-fade-in", "ds-lift-in", "ds-grow-in", "ds-shift-in", "ds-roll-in",
    "ds-pop-in", "ds-draw", "ds-fill-x", "ds-fill-y"];
  const AUSTRITT_KEYFRAMES = ["ds-fade-out", "ds-sink-out", "ds-scale-out", "ds-slide-out", "ds-roll-out"];
  const laeufe = new WeakMap();

  function neuerLauf(element) {
    const nr = (laeufe.get(element) || 0) + 1;
    laeufe.set(element, nr);
    return nr;
  }

  function animationenAbwarten(element, namen) {
    const eigene = element.getAnimations
      ? element.getAnimations().filter(function (a) { return namen.indexOf(a.animationName) !== -1; })
      : [];
    // Ohne Animation (verborgen, ausgehängt, kein Web-Animations-API): Ereignis mit Frist.
    if (!eigene.length) return abgeschlossen(element);
    return Promise.race([
      Promise.all(eigene.map(function (a) { return a.finished.catch(function () {}); })),
      new Promise(function (r) { setTimeout(r, STANDARD_FRIST_MS); })
    ]);
  }

  function eintreten(element, variante) {
    if (!element) return Promise.resolve();
    const lauf = neuerLauf(element);
    const klassen = eintrittKlassen(variante);
    element.classList.remove.apply(element.classList, alleAustrittKlassen());
    wiederholen.apply(null, [element].concat(klassen));
    return animationenAbwarten(element, EINTRITT_KEYFRAMES).then(function () {
      if (laeufe.get(element) === lauf) element.classList.remove.apply(element.classList, klassen);
    });
  }

  function austreten(element, variante, optionen) {
    if (!element) return Promise.resolve();
    const lauf = neuerLauf(element);
    const dann = (optionen && optionen.dann) || "entfernen";
    const klassen = austrittKlassen(variante);
    element.classList.remove("ds-enter");
    element.classList.add.apply(element.classList, klassen);
    return animationenAbwarten(element, AUSTRITT_KEYFRAMES).then(function () {
      if (laeufe.get(element) !== lauf) return;   // ein neuerer Ein- oder Austritt gilt
      if (dann === "entfernen") {
        element.remove();
      } else if (dann === "verbergen") {
        element.hidden = true;
        element.classList.remove.apply(element.classList, klassen);
      }
    });
  }

  /* Frisch geladener Inhalt ersetzt seinen Platzhalter: bricht einen noch
     laufenden Eintritt im selben Takt ab (kein Bild mit halber Deckkraft)
     und spielt den Tausch-Eintritt. */
  function aufdecken(element) {
    if (!element) return Promise.resolve();
    if (element.classList.contains("ds-enter") && element.getAnimations) {
      element.getAnimations().forEach(function (a) { a.cancel(); });
    }
    return eintreten(element, "tausch");
  }

  function ladeHaltenMs(start, jetzt) { return M.loaderHoldMs(start, jetzt === undefined ? Date.now() : jetzt); }

  function ladeAbwarten(start, jetzt) { return M.settleLoader(start, jetzt === undefined ? Date.now() : jetzt); }

  function hochzaehlen(element, ziel, optionen) {
    const o = optionen || {};
    M.countUp(element, ziel, { format: o.format || zahlText, duration: o.dauer });
  }

  function mitSelbst(behaelter, selektor) {
    if (!behaelter || !behaelter.querySelectorAll) return [];
    const liste = Array.from(behaelter.querySelectorAll(selektor));
    if (behaelter.matches && behaelter.matches(selektor)) liste.unshift(behaelter);
    return liste;
  }

  function zahlenHochzaehlen(behaelter) {
    for (const wert of mitSelbst(behaelter, "[data-zahl]")) {
      const ziel = Number(wert.getAttribute("data-zahl"));
      if (!isFinite(ziel)) continue;
      // «88 %» zählt 88 und behält « %».
      const nachsatz = /\d/.test(wert.textContent) ? wert.textContent.replace(/^.*\d/, "") : "";
      hochzaehlen(wert, ziel, { format: function (z) { return zahlText(z) + nachsatz; } });
    }
  }

  function aufziehen(behaelter) {
    for (const f of mitSelbst(behaelter, ".balken-fuell")) eintreten(f, "aufziehen");
    for (const f of mitSelbst(behaelter, ".saeule-fuell")) eintreten(f, "aufrichten");
  }

  /* Laufnummer der Staffelung pro Raster: eine Ansicht, die während ihrer
     Staffelung verborgen und gleich wieder gezeigt wird, startet eine neue;
     die Frist der alten darf die Klasse dann nicht mitten darin entfernen. */
  const staffelLaeufe = new WeakMap();

  function auftritt(behaelter, optionen) {
    if (!behaelter) return;
    // Rahmen ruft den Auftritt für die ganze Ansicht auf und staffelt nur
    // die Raster DARIN; Seitenkopf, Banner und Werkzeugleiste erscheinen
    // mit der Ansicht selbst (wurzel: false).
    const mitWurzel = !optionen || optionen.wurzel !== false;
    const raster = mitWurzel ? mitSelbst(behaelter, STAFFEL_RASTER)
      : (behaelter.querySelectorAll ? Array.from(behaelter.querySelectorAll(STAFFEL_RASTER)) : []);
    for (const r of raster) {
      if (!r.lastElementChild) continue;
      const lauf = (staffelLaeufe.get(r) || 0) + 1;
      staffelLaeufe.set(r, lauf);
      staffeln(r.children);
      // wiederholen: stand die Klasse noch (zweiter Auftritt in der Frist), spielt die Staffelung neu.
      wiederholen(r, "ds-stagger");
      // Später eingefügte Kinder (Nachladen, «Mehr laden») blenden nicht erneut ein.
      abgeschlossen(r.lastElementChild).then(function () {
        if (staffelLaeufe.get(r) === lauf) r.classList.remove("ds-stagger");
      });
    }
    zahlenHochzaehlen(behaelter);
    aufziehen(behaelter);
  }

  function indikator(spur, optionen) {
    const o = optionen || {};
    const i = DS.indicator.createIndicator(spur, { active: o.aktiv, className: o.klasse || "" });
    return {
      aktualisieren: function () { i.update(); },
      zerstoeren: function () { i.destroy(); }
    };
  }

  return Object.freeze({
    LADE_VERZOEGERUNG_MS: M.LOADER_DELAY_MS,
    LADE_MINDESTENS_MS: M.LOADER_MIN_VISIBLE_MS,
    ZAEHLEN_MS: M.COUNT_UP_MS,
    STAFFEL_MAX: M.STAGGER_MAX,
    reduziert: reduziert,
    staffeln: staffeln,
    wiederholen: wiederholen,
    abgeschlossen: abgeschlossen,
    eintreten: eintreten,
    austreten: austreten,
    aufdecken: aufdecken,
    ladeHaltenMs: ladeHaltenMs,
    ladeAbwarten: ladeAbwarten,
    kurveAusgleiten: M.easeOutCubic,
    hochzaehlen: hochzaehlen,
    zahlenHochzaehlen: zahlenHochzaehlen,
    aufziehen: aufziehen,
    auftritt: auftritt,
    indikator: indikator
  });
})();

const UI = (function () {

  /* ==================================================================
     DOM-Helfer
     ================================================================== */

  const SVG_NS = "http://www.w3.org/2000/svg";

  function $(id) { return document.getElementById(id); }

  function el(tag, klasse, text) {
    const k = document.createElement(tag);
    if (klasse) k.className = klasse;
    if (text !== undefined && text !== null) k.textContent = String(text);
    return k;
  }

  function leeren(knoten) {
    if (!knoten) return knoten;
    while (knoten.firstChild) knoten.removeChild(knoten.firstChild);
    return knoten;
  }

  function anhaengen(eltern, kinder) {
    if (!eltern || !kinder) return eltern;
    const liste = (kinder.nodeType || typeof kinder === "string") ? [kinder] : Array.from(kinder);
    for (const k of liste) {
      if (k === null || k === undefined || k === false || k === "") continue;
      eltern.appendChild(typeof k === "string" ? document.createTextNode(k) : k);
    }
    return eltern;
  }

  function text(wert) {
    return (wert === null || wert === undefined || wert === false) ? "" : String(wert);
  }

  /* «Gleich wie gespeichert»: leer, null und undefined gelten als dasselbe,
     sonst entscheidet der Text (true = "true", 3 = "3"). Damit gilt ein Hin
     und Her im Formular wieder als unverändert.
     Ein Boolean ist NIE gleich «leer»: Was ein leerer Wert bedeutet, weiss
     nur die Seite (InDomaene: leer wird als «Ja» gezeigt). Früher galt
     leer = false – dann liess sich ein leeres «In Domäne» nie auf «Nein»
     setzen, weil der Entwurf das Abwählen als «unverändert» verwarf. Die
     Seite gibt die Bedeutung von leer an F.entwurf ({ leer: { Feld: Wert } }). */
  function gleichwertig(a, b) {
    const nA = (a === null || a === undefined) ? "" : a;
    const nB = (b === null || b === undefined) ? "" : b;
    return String(nA) === String(nB);
  }

  /* Schreibt nur, wenn sich der Text ändert: ein gleicher Text löst keine
     Neuzeichnung und keine Ansage im Screenreader aus. */
  function textSetzen(knoten, wert) {
    const t = text(wert);
    if (knoten && knoten.textContent !== t) knoten.textContent = t;
    return knoten;
  }

  let laufnummer = 0;
  function id(praefix) {
    laufnummer += 1;
    return (praefix || "ui") + "-" + laufnummer;
  }

  /* Text oder Knoten in einen Behälter: Knoten werden eingehängt, alles
     andere als Text gesetzt. */
  function inhaltSetzen(behaelter, inhalt) {
    if (inhalt && inhalt.nodeType) behaelter.appendChild(inhalt);
    else if (Array.isArray(inhalt)) anhaengen(behaelter, inhalt);
    else behaelter.textContent = text(inhalt);
    return behaelter;
  }

  function istLeer(wert) {
    return wert === null || wert === undefined || wert === false || String(wert).trim() === "";
  }

  /* Bringt die Kinder eines Behälters auf die Liste «soll», ohne bleibende
     Knoten zu bewegen (ein bewegter Knoten verlöre den Fokus): erst fallen
     die überzähligen heraus, dann kommen fehlende an ihren Platz. Für
     Filter über einer festen Grundliste (die Reihenfolge ist eine Teilfolge
     derselben Liste). Anders als «hidden» bleiben so auch :first-child-
     und Haarlinien-Regeln richtig. */
  function kinderAbgleichen(behaelter, soll) {
    if (!behaelter) return behaelter;
    const liste = (soll || []).filter(Boolean);
    const menge = new Set(liste);
    for (const kind of Array.from(behaelter.children)) if (!menge.has(kind)) kind.remove();
    liste.forEach(function (knoten, i) {
      const da = behaelter.children[i];
      if (da !== knoten) behaelter.insertBefore(knoten, da || null);
    });
    return behaelter;
  }

  function istOptionen(a) {
    return !!a && typeof a === "object" && !a.nodeType && !Array.isArray(a);
  }


  /* ==================================================================
     Sinnbilder – EIN Set, das von Dashboard-Style (DS.icons: Lucide-Stil
     auf dem 24er-Raster, Strich 2, runde Enden, currentColor). Hier steht
     nur die Zuordnung der deutschen Namen, die Seiten und Navigation
     benutzen, zu den Glyphen von DS.icons. Ein neues Sinnbild kommt in
     Dashboard-Style dazu (docs/icons.md), dann hier ein deutscher Name.
     ================================================================== */

  const SINNBILDER = {
    /* Pfeile und Winkel */
    pfeilRechts: "arrowRight", pfeilLinks: "arrowLeft", pfeilHoch: "arrowUp", pfeilRunter: "arrowDown",
    chevronUnten: "chevronDown", chevronOben: "chevronUp", chevronRechts: "chevronRight", chevronLinks: "chevronLeft",
    extern: "external",
    /* Aktionen */
    plus: "plus", schliessen: "close", minus: "minimize", menue: "menu", suche: "search", neuSchreiben: "compose",
    zuruecksetzen: "reset", sync: "sync", kopieren: "copy", papierkorb: "trash", abmelden: "logout",
    filter: "filter", spalten: "columns", dichte: "rows", herunterladen: "download", sortieren: "sort",
    bearbeiten: "pencil", speichern: "save", mehr: "moreVertical",
    /* Kommunikation */
    chat: "chat", mail: "mail", telefon: "phone", globus: "globe", flagge: "flag", daumenHoch: "thumbUp",
    daumenRunter: "thumbDown", verknuepfung: "link",
    /* Status (check mit pathLength="1" für «zeichnen») */
    check: "check", checkKreis: "checkCircle", achtung: "alert", achtungKreis: "alertCircle", info: "info",
    uhr: "clock", aus: "ban", kalender: "calendar", aktivitaet: "activity", online: "wifi", offline: "wifiOff",
    /* Orte und Dinge */
    uebersicht: "overview", einstellungen: "settings", prozessor: "cpu", schloss: "lock", benutzer: "user",
    benutzerGruppe: "users", ticket: "ticket", datei: "file", dateiText: "fileText", dateiCode: "fileCode",
    ordner: "folder", laptop: "laptop", edu: "graduationCap", software: "apps", monitor: "monitor",
    festplatte: "hardDrive", server: "server", schild: "shield", diagramm: "barChart", liste: "list",
    gebaeude: "building", ort: "mapPin", schluessel: "key", kamera: "video",
    /* Lebenszyklus eines Geräts */
    archiv: "archive", lager: "box", ausgeben: "userPlus", reaktivieren: "undo", verlauf: "history"
  };

  /* Andere Namen für dieselben Glyphen: die Namen von app.js und der
     Navigation (admin, telefone, csv, pfeil, winkel) gelten weiter. */
  const ALIASE = {
    admin: "laptop",
    telefone: "telefon",
    csv: "herunterladen",
    pfeil: "pfeilRechts",
    winkel: "chevronRechts",
    lupe: "suche",
    neu: "plus",
    loeschen: "papierkorb",
    warnung: "achtung",
    fehler: "achtungKreis",
    erfolg: "checkKreis"
  };
  for (const name of Object.keys(ALIASE)) SINNBILDER[name] = SINNBILDER[ALIASE[name]];
  Object.freeze(SINNBILDER);

  /* Ein Sinnbild als <svg class="icon …">, gebaut mit DS.icons.iconElement
     (createElementNS, ohne innerHTML). */
  function sinnbild(name, groesse, klasse) {
    const glyphe = DS.icons[SINNBILDER[name]];
    if (typeof glyphe !== "string") {
      // Ein Tippfehler soll beim Prüfen auffallen, aber keine Seite zerstören.
      console.error("UI.sinnbild: unbekanntes Sinnbild «" + name + "»");
      const leer = document.createElementNS(SVG_NS, "svg");
      leer.setAttribute("class", "icon" + (klasse ? " " + klasse : ""));
      leer.setAttribute("aria-hidden", "true");
      return leer;
    }
    const svg = DS.icons.iconElement(glyphe, groesse || 20, "icon" + (klasse ? " " + klasse : ""));
    svg.setAttribute("focusable", "false");
    return svg;
  }


  /* ==================================================================
     Knöpfe
     ================================================================== */

  /* Der Klick-Handler (beiKlick) jedes Knopfs: ein stehen gebliebener Knopf
     kann ihn von seinem neu gebauten Nachfolger übernehmen (F.seitenkopf
     baut die Kopfknöpfe bei jedem Tastendruck, lässt aber die sichtbaren
     stehen – mit Fokus und Zustandsebene). Der Handler läuft dann am
     SICHTBAREN Knopf: ev.currentTarget ist der Knopf im Dokument. */
  const knopfHandler = new WeakMap();

  /* Varianten von UI.knopf → Modifikatoren von .ds-btn (Dashboard-Style). */
  const KNOPF_VARIANTEN = { primaer: "ds-btn--primary", tonal: "ds-btn--tonal", leise: "ds-btn--text", still: "ds-btn--quiet", scheibe: "ds-btn--disc" };

  function knopf(a, klasse, beiKlick) {
    const o = istOptionen(a) ? a : { text: a, klasse: klasse, beiKlick: beiKlick };
    const k = el(o.href ? "a" : "button");
    const klassen = ["ds-btn"];
    const nurSinnbild = o.variante === "sinnbild" || (!!o.sinnbild && istLeer(o.text));
    const variante = KNOPF_VARIANTEN[o.variante] || "";
    if (nurSinnbild) klassen.push("ds-btn--icon");
    // Ein Icon-Knopf ohne eigene Variante ist gedämpft (wie bisher knopf-sinnbild).
    if (variante) klassen.push(variante);
    else if (nurSinnbild) klassen.push("ds-btn--quiet");
    if (o.klein) klassen.push("ds-btn--sm");
    if (o.weiter) klassen.push("knopf-weiter");
    if (o.klasse) klassen.push(o.klasse);
    k.className = klassen.join(" ");

    if (o.href) k.href = o.href;
    else k.type = o.typ || "button";
    if (o.id) k.id = o.id;

    if (o.sinnbild) k.appendChild(sinnbild(o.sinnbild, o.sinnbildGroesse || (nurSinnbild ? (o.klein ? 18 : 20) : 16)));
    if (!istLeer(o.text)) {
      if (o.sinnbild || o.weiter) k.appendChild(el("span", null, o.text));
      else k.appendChild(document.createTextNode(String(o.text)));
    }
    if (o.weiter) k.appendChild(sinnbild("pfeilRechts", 16));

    const name = o.label || (nurSinnbild ? o.titel : "");
    if (name) k.setAttribute("aria-label", name);
    if (o.titel) k.setAttribute("data-tipp", o.titel);
    fokusSetzen(k, o.fokus);
    if (o.gedrueckt !== undefined) k.setAttribute("aria-pressed", o.gedrueckt ? "true" : "false");
    if (o.deaktiviert) {
      if (o.href) k.setAttribute("aria-disabled", "true");
      else k.disabled = true;
    }
    if (o.gesperrt) knopfSperren(k, o.gesperrt);
    if (o.beiKlick) {
      k.addEventListener("click", o.beiKlick);
      knopfHandler.set(k, o.beiKlick);
    }
    return k;
  }

  /* Gesperrt MIT Grund (api.md §9.9): aria-disabled statt disabled, damit
     der Knopf fokussierbar bleibt und der Tooltip den Grund nennt – auch
     per Tastatur. Klicks schluckt der Zuhörer unten (Fangphase). Ein
     leerer Grund hebt die Sperre auf; der frühere Tooltip (titel) kehrt
     zurück. An Ort und Stelle: aufrufbar bei jedem Tastendruck. */
  const freieTipps = new WeakMap();

  function tippSchreiben(k, t) {
    if (typeof UI.tipp === "function") UI.tipp(k, t || null);
    else if (t) k.setAttribute("data-tipp", t);
    else k.removeAttribute("data-tipp");
  }

  function knopfSperren(k, grund) {
    if (!k) return k;
    const gesperrt = freieTipps.has(k);
    if (grund) {
      if (!gesperrt) freieTipps.set(k, k.getAttribute("data-tipp") || "");
      if (k.getAttribute("aria-disabled") !== "true") k.setAttribute("aria-disabled", "true");
      if (k.getAttribute("data-tipp") !== String(grund)) tippSchreiben(k, String(grund));
    } else if (gesperrt) {
      const frei = freieTipps.get(k);
      freieTipps.delete(k);
      k.removeAttribute("aria-disabled");
      if ((k.getAttribute("data-tipp") || "") !== frei) tippSchreiben(k, frei);
    }
    return k;
  }

  /* Die Sperre mit Grund eines Knopfs, ohne sie zu ändern: { grund, tipp }
     – grund "" heisst nicht gesperrt (über knopfSperren), tipp ist der
     Tooltip des freien Knopfs (der gesperrte zeigt stattdessen den Grund).
     F.seitenkopf vergleicht damit die Gestalt eines Kopfknopfs ohne seine
     Sperre und schaltet nur sie um, statt den Knopf neu zu bauen. */
  function knopfSperre(k) {
    if (!k || !k.getAttribute) return { grund: "", tipp: "" };
    if (freieTipps.has(k)) return { grund: k.getAttribute("data-tipp") || "", tipp: freieTipps.get(k) || "" };
    return { grund: "", tipp: k.getAttribute("data-tipp") || "" };
  }

  /* data-fokus: der stabile Schlüssel, über den F.zeichneBereich,
     Rahmen.stillZeichnen und der Rückfokus der Ebenen ein neu gebautes
     Bedienelement wiederfinden (api.md §8). Jedes Bedienelement ohne id
     braucht einen. */
  function fokusSetzen(k, schluessel) {
    if (k && !istLeer(schluessel)) k.setAttribute("data-fokus", String(schluessel));
    return k;
  }

  /* Der stehende Knopf übernimmt den Handler des neuen (siehe knopfHandler). */
  function knopfUebernehmen(alt, neu) {
    if (!alt || !neu || !knopfHandler.has(neu)) return false;
    const vorher = knopfHandler.get(alt);
    const jetzt = knopfHandler.get(neu);
    if (vorher !== jetzt) {
      if (vorher) alt.removeEventListener("click", vorher);
      alt.addEventListener("click", jetzt);
      knopfHandler.set(alt, jetzt);
    }
    return true;
  }

  /* Ändert nur die Beschriftung; ein Icon und ein laufender Spinner bleiben. */
  function knopfText(k, neuerText) {
    if (!k) return k;
    const huelle = k.querySelector(":scope > .ds-btn__swap");
    const ziel = huelle || k;
    const span = ziel.querySelector(":scope > span:not(.ds-sr):not(.zaehler):not(.ds-spinner)");
    if (span) textSetzen(span, neuerText);
    else if (!ziel.querySelector(":scope > svg")) textSetzen(ziel, neuerText);
    else {
      for (const n of Array.from(ziel.childNodes)) if (n.nodeType === 3) n.remove();
      ziel.appendChild(el("span", null, neuerText));
    }
    return k;
  }

  /* --- Beschäftigt (ChatBob setBusy/settleBusy) --- */

  const beschaeftigtZustaende = new WeakMap();

  /* Gesperrte und beschäftigte Knöpfe bleiben fokussierbar (ein disabled-
     Knopf verliert den Fokus) und behalten die Zeigerereignisse (für den
     Tooltip mit dem Grund). EIN Zuhörer in der Fangphase schluckt darum
     ihre Klicks – auch den synthetischen Klick, den Enter in einem
     Formular auslöst. */
  document.addEventListener("click", function (e) {
    const ziel = e.target instanceof Element
      ? e.target.closest('button[aria-disabled="true"], a[aria-disabled="true"], [role="switch"][aria-disabled="true"], [role="button"][aria-disabled="true"], .ds-btn[aria-busy="true"]')
      : null;
    if (!ziel) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  /* Tauscht den Inhalt mit einem kurzen Einblenden (150 ms). Die
     zurückkehrende Beschriftung verlässt ihre Hülle danach wieder. */
  function inhaltTauschen(k, knoten, auspacken) {
    const huelle = el("span", "ds-btn__swap");
    anhaengen(huelle, knoten);
    leeren(k).appendChild(huelle);
    return Bewegung.eintreten(huelle, "blenden").then(function () {
      if (auspacken && huelle.parentNode === k) {
        while (huelle.firstChild) k.insertBefore(huelle.firstChild, huelle);
        huelle.remove();
      }
    });
  }

  function beschaeftigtAbwarten(k) {
    const zustand = k ? beschaeftigtZustaende.get(k) : null;
    if (!zustand) return Promise.resolve();
    clearTimeout(zustand.uhr);
    return zustand.gezeigtAb
      ? Bewegung.ladeAbwarten(zustand.gezeigtAb - Bewegung.LADE_VERZOEGERUNG_MS)
      : Promise.resolve();
  }

  function beschaeftigt(k, an, beschriftung) {
    if (!k) return Promise.resolve();
    if (an) {
      if (beschaeftigtZustaende.has(k) || k.disabled) return Promise.resolve();
      if (typeof UI.meldungenFehlerSchliessen === "function") UI.meldungenFehlerSchliessen();
      k.setAttribute("aria-disabled", "true");
      k.setAttribute("aria-busy", "true");
      const zustand = { gezeigtAb: 0, uhr: 0, inhalt: null };
      zustand.uhr = setTimeout(function () {
        zustand.gezeigtAb = Date.now();
        zustand.inhalt = Array.from(k.childNodes);
        k.style.width = k.offsetWidth + "px";
        inhaltTauschen(k, [spinner(true), el("span", "ds-sr", beschriftung || "Wird gespeichert …")], false);
      }, Bewegung.LADE_VERZOEGERUNG_MS);
      beschaeftigtZustaende.set(k, zustand);
      return Promise.resolve();
    }
    const zustand = beschaeftigtZustaende.get(k);
    if (!zustand) return Promise.resolve();
    return beschaeftigtAbwarten(k).then(function () {
      if (beschaeftigtZustaende.get(k) !== zustand) return;
      beschaeftigtZustaende.delete(k);
      if (zustand.inhalt) inhaltTauschen(k, zustand.inhalt, true);
      k.style.width = "";
      k.removeAttribute("aria-disabled");
      k.removeAttribute("aria-busy");
    });
  }


  /* ==================================================================
     Status-Chip
     ================================================================== */

  const STATUS_TOENE = {
    erfolg: "erfolg", warnung: "warnung", gefahr: "gefahr", neutral: "neutral", laeuft: "laeuft",
    wartet: "neutral", aus: "neutral",
    // Kompatibilität mit den alten Chip-Tönen (kein Blau mehr):
    info: "neutral", leise: "neutral", marke: "neutral", fehler: "gefahr", ok: "erfolg"
  };

  /* Wie ChatBob statusBadge: Warnung UND Fehler tragen das Dreieck; die
     beiden unterscheiden Fläche und Text. Der Kreis (achtungKreis) gehört
     zu Bannern und Meldungen. */
  const STATUS_SINNBILDER = {
    erfolg: "check", warnung: "achtung", gefahr: "achtung", neutral: "info",
    wartet: "uhr", aus: "aus", info: "info", leise: "info", marke: "check", fehler: "achtung", ok: "check"
  };

  /* Töne → Modifikatoren von .ds-status; neutral hat keinen. */
  const STATUS_KLASSEN = { erfolg: "ds-status--ok", warnung: "ds-status--warning", gefahr: "ds-status--error", laeuft: "ds-status--running" };

  function statusSetzen(s, beschriftung, ton, optionen) {
    const o = optionen || {};
    const roh = ton || "neutral";
    const t = STATUS_TOENE[roh] || "neutral";
    const klasse = "ds-status" + (STATUS_KLASSEN[t] ? " " + STATUS_KLASSEN[t] : "") + (o.klasse ? " " + o.klasse : "");
    if (s.className !== klasse) s.className = klasse;

    // Das Symbol nur tauschen, wenn es sich ändert: ein laufender Spinner dreht weiter.
    const symbol = o.sinnbild === false ? ""
      : t === "laeuft" ? "#spinner"
        : (o.sinnbild || STATUS_SINNBILDER[roh] || STATUS_SINNBILDER[t]);
    if (s.getAttribute("data-symbol") !== symbol) {
      const alt = s.querySelector(":scope > svg, :scope > .ds-spinner");
      if (alt) alt.remove();
      if (symbol === "#spinner") {
        s.insertBefore(el("span", "ds-spinner ds-status__spinner"), s.firstChild).setAttribute("aria-hidden", "true");
      } else if (symbol) {
        s.insertBefore(sinnbild(symbol, 16), s.firstChild);
      }
      s.setAttribute("data-symbol", symbol);
    }

    let beschriftungsKnoten = s.querySelector(":scope > .status-text");
    if (!beschriftungsKnoten) beschriftungsKnoten = s.appendChild(el("span", "status-text"));
    textSetzen(beschriftungsKnoten, beschriftung);

    // Ein Chip mit Erklärung ist ein Tabstopp: der Tooltip erscheint mit
    // der Tastatur sofort (UI.tipp), sonst wäre er nur mit der Maus zu lesen.
    if (o.titel) {
      s.setAttribute("data-tipp", o.titel);
      s.tabIndex = 0;
    } else if (o.titel !== undefined) {
      s.removeAttribute("data-tipp");
      s.removeAttribute("tabindex");
    }
    return s;
  }

  function status(beschriftung, ton, optionen) {
    const s = el("span");
    statusSetzen(s, beschriftung, ton, optionen);
    s.setzen = function (b, t, o) { return statusSetzen(s, b, t, o); };
    return s;
  }


  /* ==================================================================
     Banner, Hinweise, Leerzustand, Texte
     ================================================================== */

  const BANNER_TOENE = { info: "info", neutral: "info", erfolg: "erfolg", warnung: "warnung", gefahr: "gefahr", fehler: "gefahr" };
  const BANNER_KLASSEN = { erfolg: "ds-alert--success", warnung: "ds-alert--warning", gefahr: "ds-alert--error" };
  const BANNER_SINNBILDER = { info: "info", erfolg: "checkKreis", warnung: "achtung", gefahr: "achtungKreis" };

  function banner(a, ton, knopfKnoten, optionen) {
    const o = istOptionen(a) ? a : Object.assign({ text: a, ton: ton, knopf: knopfKnoten }, optionen || {});
    const t = BANNER_TOENE[o.ton] || "info";
    const b = el("div", "ds-alert" + (BANNER_KLASSEN[t] ? " " + BANNER_KLASSEN[t] : ""));
    if (o.rolle) b.setAttribute("role", o.rolle);
    b.appendChild(sinnbild(o.sinnbild || BANNER_SINNBILDER[t], 20));

    const textKnoten = el("div", "ds-alert__text");
    if (!istLeer(o.titel)) {
      textKnoten.appendChild(el("strong", null, o.titel));
      if (o.text) textKnoten.appendChild(document.createTextNode(" "));
    }
    if (o.text && (o.text.nodeType || Array.isArray(o.text))) anhaengen(textKnoten, o.text);
    else if (!istLeer(o.text)) textKnoten.appendChild(document.createTextNode(String(o.text)));
    b.appendChild(textKnoten);

    if (Array.isArray(o.knopf)) {
      if (o.knopf.length) b.appendChild(anhaengen(el("div", "banner-knoepfe"), o.knopf));
    } else if (o.knopf) {
      b.appendChild(o.knopf);
    }
    b.textKnoten = textKnoten;
    return b;
  }

  function leerzustand(a, textZeile) {
    const o = istOptionen(a) ? a : { titel: a, text: textZeile };
    const l = el("div", "ds-empty");
    const scheibe = el("span", "ds-empty__disc");
    scheibe.setAttribute("aria-hidden", "true");
    scheibe.appendChild(sinnbild(o.sinnbild || "info", 24));
    l.appendChild(scheibe);
    if (!istLeer(o.titel)) l.appendChild(el("p", "ds-empty__title", o.titel));
    if (o.text && o.text.nodeType) l.appendChild(anhaengen(el("p", "ds-empty__text"), o.text));
    else if (!istLeer(o.text)) l.appendChild(el("p", "ds-empty__text", o.text));
    if (o.aktion) {
      l.appendChild(o.aktion.nodeType ? o.aktion : knopf({
        text: o.aktion.text, variante: o.aktion.variante || "tonal",
        sinnbild: o.aktion.sinnbild, beiKlick: o.aktion.beiKlick, href: o.aktion.href, fokus: o.aktion.fokus
      }));
    }
    if (o.rolle) l.setAttribute("role", o.rolle);
    return l;
  }

  function hinweis(inhalt) { return inhaltSetzen(el("p", "ds-muted"), inhalt); }

  function meta(inhalt) { return inhaltSetzen(el("p", "ds-meta"), inhalt); }

  function teile(liste) {
    const aussen = el("span", "ds-parts");
    const innen = el("span", "ds-parts__list");
    for (const t of liste || []) {
      if (t && t.nodeType) innen.appendChild(anhaengen(el("span"), t));
      else if (!istLeer(t)) innen.appendChild(el("span", null, t));
    }
    aussen.appendChild(innen);
    return aussen;
  }


  /* ==================================================================
     Laden
     ================================================================== */

  function spinner(klein) {
    const s = el("span", "ds-spinner" + (klein ? " ds-spinner--sm" : ""));
    s.setAttribute("aria-hidden", "true");
    return s;
  }

  function ladezeile(beschriftung) {
    const z = el("div", "ds-loading");
    z.setAttribute("role", "status");
    z.appendChild(spinner());
    z.appendChild(el("span", null, beschriftung || "Wird geladen …"));
    return z;
  }

  function skelettZeile(zusatz) {
    const z = el("span", "ds-skeleton__line" + (zusatz ? " " + zusatz : ""));
    z.setAttribute("aria-hidden", "true");
    return z;
  }

  function skelettSeite(optionen) {
    const o = optionen || {};
    const anzahl = o.karten === undefined ? 2 : o.karten;
    const s = el("div", "ds-skeleton");
    s.setAttribute("role", "status");
    s.appendChild(el("span", "ds-sr", o.text || "Wird geladen …"));
    if (o.kopf !== false) {
      s.appendChild(skelettZeile("ds-skeleton__line--heading"));
      s.appendChild(skelettZeile("ds-skeleton__line--lead"));
    }
    for (let i = 0; i < anzahl; i++) {
      const karte = el("div", "ds-skeleton__card");
      karte.setAttribute("aria-hidden", "true");
      karte.appendChild(skelettZeile("ds-skeleton__line--title"));
      karte.appendChild(skelettZeile());
      karte.appendChild(skelettZeile(i % 2 ? "ds-skeleton__line--mid" : "ds-skeleton__line--short"));
      s.appendChild(karte);
    }
    return s;
  }


  /* ==================================================================
     Karten und Kacheln
     ================================================================== */

  function karte(a, unter, breit) {
    const o = istOptionen(a) ? a : { titel: a, unter: unter, breit: breit };
    const k = el("section", "ds-card"
      + (o.breit ? " karte-breit" : "") + (o.gefuellt ? " ds-card--filled" : "")
      + (o.klasse ? " " + o.klasse : ""));
    if (o.id) k.id = o.id;
    k.kopf = null;
    k.aktionen = null;
    k.unter = null;

    const aktionen = (o.aktionen || []).filter(Boolean);
    if (!istLeer(o.titel) || aktionen.length) {
      const kopf = el("div", "ds-card__row");
      if (!istLeer(o.titel)) {
        const h = el("h" + (o.ebene || 2), "ds-card__title");
        // Sinnbild vor dem Titel (Bestandskarten, Mapping 7.2 #15).
        if (o.sinnbild) h.appendChild(sinnbild(o.sinnbild, 20));
        h.appendChild(document.createTextNode(String(o.titel)));
        kopf.appendChild(h);
      }
      if (aktionen.length) {
        k.aktionen = anhaengen(el("div", "karte-kopf-aktionen"), aktionen);
        kopf.appendChild(k.aktionen);
      }
      k.appendChild(kopf);
      k.kopf = kopf;
    }
    // Beschreibung unter dem Titel: leiser Text im Rhythmus der Karte (.unter).
    if (o.unter && o.unter.nodeType) k.unter = k.appendChild(anhaengen(el("p", "ds-muted"), o.unter));
    else if (!istLeer(o.unter)) k.unter = k.appendChild(el("p", "ds-muted", o.unter));

    const inhalt = el("div", "karte-inhalt");
    k.appendChild(inhalt);
    k.inhalt = inhalt;

    // Fusszeile unter einer Haarlinie (Links und Aktionen der Karte); in
    // einem Kartenraster steht sie unten bündig (.ds-card__links).
    const fuss = (o.fuss || []).filter(Boolean);
    k.fuss = fuss.length ? anhaengen(el("div", "ds-card__links"), fuss) : null;
    if (k.fuss) k.appendChild(k.fuss);
    return k;
  }

  const KACHEL_SINNBILDER = { erfolg: "checkKreis", warnung: "achtung", gefahr: "achtungKreis" };

  function kachel(a, wertText, unter, ton) {
    const o = istOptionen(a) ? a : { text: a, wert: wertText, unter: unter, ton: ton };
    const tag = o.href ? "a" : (o.beiKlick ? "button" : "div");
    const k = el(tag, "ds-tile" + (o.klasse ? " " + o.klasse : ""));
    if (tag === "button") k.type = "button";
    if (o.href) k.href = o.href;
    if (o.beiKlick) k.addEventListener("click", o.beiKlick);
    if (o.titel) {
      k.setAttribute("data-tipp", o.titel);
      if (tag === "div") k.tabIndex = 0;   // Tooltip auch per Tastatur
    }
    fokusSetzen(k, o.fokus);

    // Spans statt p: in button und a ist nur Phrasierungsinhalt erlaubt.
    const beschriftung = el("span", "ds-tile__label");
    const symbol = o.sinnbild || KACHEL_SINNBILDER[o.ton];
    if (symbol) beschriftung.appendChild(sinnbild(symbol, 20, KACHEL_SINNBILDER[o.ton] ? "t-" + o.ton : ""));
    beschriftung.appendChild(el("span", null, o.text));
    k.appendChild(beschriftung);

    const leer = istLeer(o.wert);
    const wert = el("span", "ds-tile__value" + (leer ? " leer" : ""), leer ? "–" : String(o.wert));
    if (!leer && typeof o.zahl === "number" && isFinite(o.zahl)) wert.setAttribute("data-zahl", String(o.zahl));
    k.appendChild(wert);

    if (o.unter && o.unter.nodeType) k.appendChild(anhaengen(el("span", "ds-tile__note"), o.unter));
    else if (!istLeer(o.unter)) k.appendChild(el("span", "ds-tile__note", o.unter));
    return k;
  }

  function kacheln(liste) { return anhaengen(el("div", "ds-tiles"), liste || []); }


  /* ==================================================================
     Datenzeilen
     ================================================================== */

  const SCHLOSS_TEXT = "Vom Abgleich gesetzt.";

  /* Schloss mit Tooltip; role=img + aria-label, damit der Grund auch ohne
     Zeiger gelesen wird. */
  function schloss(hinweisText) {
    const s = el("span", "schloss");
    const t = hinweisText || SCHLOSS_TEXT;
    s.setAttribute("role", "img");
    s.setAttribute("aria-label", "Gesperrt: " + t);
    s.setAttribute("data-tipp", t);
    s.appendChild(sinnbild("schloss", 16));
    return s;
  }

  function datenzeilen(zeilen) { return anhaengen(el("div", "datenzeilen"), zeilen || []); }

  function feldZeile(name, wert, optionen) {
    const o = optionen || {};
    const z = el("div", "datenzeile");
    const n = el("div", "datenzeile-name", name);
    if (o.gesperrt) n.appendChild(schloss(o.hinweis));
    z.appendChild(n);

    const w = el("div", "datenzeile-wert");
    if (wert && (wert.nodeType || Array.isArray(wert))) {
      anhaengen(w, wert);
    } else if (istLeer(wert)) {
      w.classList.add("leer");
      w.textContent = "–";
    } else {
      w.textContent = String(wert);
    }
    if (!istLeer(o.neben)) w.appendChild(el("span", "datenzeile-neben", o.neben));
    z.appendChild(w);
    return z;
  }

  function feldGesperrt(name, wert, hinweisText) {
    return feldZeile(name, wert, { gesperrt: true, hinweis: hinweisText });
  }

  function feldFrei(name, knoten, mitSchloss, hinweisText) {
    return feldZeile(name, knoten || "", { gesperrt: !!mitSchloss, hinweis: hinweisText });
  }

  function formZeile(beschriftung, feld, a, hinweisText, zusatz) {
    const o = istOptionen(a) ? a : { geaendert: !!a, hinweis: hinweisText, zusatz: zusatz };
    const z = el("div", "datenzeile datenzeile-form");

    // Die Beschriftung ist das Label des (ersten) Felds.
    const steuer = feld && feld.matches
      ? (feld.matches("input, select, textarea") ? feld : feld.querySelector("input, select, textarea"))
      : null;
    const name = el(steuer ? "label" : "div", "datenzeile-name", beschriftung);
    if (steuer) {
      if (!steuer.id) steuer.id = id("ui-feld");
      name.htmlFor = steuer.id;
    }
    name.appendChild(el("span", "geaendert-text ds-sr", " (geändert)"));
    z.appendChild(name);

    const wert = el("div", "datenzeile-wert");
    if (feld) wert.appendChild(feld);
    if (o.hinweis && o.hinweis.nodeType) wert.appendChild(anhaengen(el("div", "datenzeile-hinweis"), o.hinweis));
    else if (!istLeer(o.hinweis)) wert.appendChild(el("div", "datenzeile-hinweis", o.hinweis));
    if (o.zusatz) wert.appendChild(o.zusatz);
    z.appendChild(wert);

    z.classList.toggle("geaendert", !!o.geaendert);
    return z;
  }

  /* Kennwerte: [[name, wert], …] → ul.kennwerte (Wert rechts, leer «–»).
     Mit Objekten [{ name, wert, href, beiKlick, ton, titel, fokus }] die
     klickbare Fassung der Bestandskarte (Mapping 7.2 #15): Zeilen mit Ziel
     sind Links bzw. Knöpfe mit 6-%-Ebene und Fokusring (dieselben Klassen
     wie UI.verteilung, ohne Balken), der Wert steht rechts (500,
     tabellarisch), eine Null leise. ton ('warnung'|'gefahr') setzt ein
     Sinnbild vor den Namen und sagt dem Screenreader «(zu prüfen)» bzw.
     «(dringend)» – die Zahl wird nie gefärbt. titel = Tooltip; eine Zeile
     ohne Ziel wird damit ein Tabstopp. */
  function kennwerte(paare) {
    if ((paare || []).some(istOptionen)) return kennwerteKlickbar(paare);
    const liste = el("ul", "ds-kv-list");
    for (const p of paare || []) {
      const li = el("li");
      li.appendChild(el("span", null, p[0]));
      const leer = istLeer(p[1]) && !(p[1] && p[1].nodeType);
      const w = el("strong", leer ? "leer" : null);
      if (p[1] && p[1].nodeType) w.appendChild(p[1]);
      else w.textContent = leer ? "–" : String(p[1]);
      li.appendChild(w);
      liste.appendChild(li);
    }
    return liste;
  }

  function kennwerteKlickbar(eintraege) {
    const ul = el("ul", "verteilung verteilung-klickbar kennwerte-klickbar");
    for (const e of eintraege) {
      if (!e) continue;
      const li = el("li");
      const tag = e.href ? "a" : (e.beiKlick ? "button" : "div");
      const z = el(tag, "verteilung-zeile");
      if (tag === "a") z.href = e.href;
      if (tag === "button") z.type = "button";
      if (e.beiKlick) z.addEventListener("click", e.beiKlick);
      fokusSetzen(z, e.fokus);
      if (e.titel) {
        z.setAttribute("data-tipp", e.titel);
        if (tag === "div") z.tabIndex = 0;
      }
      const name = el("span", "verteilung-name");
      if (e.ton === "warnung" || e.ton === "gefahr") {
        name.appendChild(sinnbild("achtung", 16, "kennwert-ton t-" + e.ton));
        name.appendChild(document.createTextNode(text(e.name)));
        name.appendChild(el("span", "ds-sr", e.ton === "gefahr" ? " (dringend)" : " (zu prüfen)"));
      } else {
        name.textContent = text(e.name);
      }
      const leer = istLeer(e.wert);
      const still = leer || e.wert === 0 || e.wert === "0";
      const wert = leer ? "–" : (typeof e.wert === "number" ? zahlFormat(e.wert) : String(e.wert));
      anhaengen(z, [name, el("span", "verteilung-zahl" + (still ? " leer" : ""), wert)]);
      li.appendChild(z);
      ul.appendChild(li);
    }
    return ul;
  }

  function fakten(paare) {
    const dl = el("dl", "ds-facts");
    for (const p of paare || []) {
      const gruppe = el("div");
      gruppe.appendChild(el("dt", null, p[0]));
      const dd = el("dd");
      if (p[1] && (p[1].nodeType || Array.isArray(p[1]))) anhaengen(dd, p[1]);
      else dd.textContent = istLeer(p[1]) ? "–" : String(p[1]);
      gruppe.appendChild(dd);
      dl.appendChild(gruppe);
    }
    return dl;
  }


  /* ==================================================================
     Filter-Chips und Zähler
     ================================================================== */

  /* Filter-Chip. Mit «gewaehlt» ein Umschalter (aria-pressed, Häkchen);
     mit «entfernen» ein aktiver Filter mit ×, der sich beim Klick
     entfernt; ohne beides ein einfacher Aktions-Chip. */
  function chip(a) {
    const o = istOptionen(a) ? a : { text: a };
    const entfernbar = typeof o.entfernen === "function";
    const umschalter = !entfernbar && o.gewaehlt !== undefined;
    const c = el(o.href ? "a" : "button", "chip" + (entfernbar ? " chip-entfernbar" : "") + (o.klasse ? " " + o.klasse : ""));
    if (o.href) c.href = o.href;
    else c.type = "button";
    if (o.id) c.id = o.id;
    if (umschalter) c.appendChild(sinnbild("check", 18, "chip-haken"));
    if (o.sinnbild) c.appendChild(sinnbild(o.sinnbild, 18));
    c.appendChild(el("span", "chip-text", o.text));
    if (entfernbar) {
      c.appendChild(sinnbild("schliessen", 18, "chip-x"));
      c.setAttribute("aria-label", o.label || ("Filter «" + text(o.text) + "» entfernen"));
      c.addEventListener("click", o.entfernen);
    } else if (o.label) {
      c.setAttribute("aria-label", o.label);
    }
    // Ohne titel trägt der Chip seinen eigenen Text als Tooltip: UI.tipp
    // zeigt ihn nur, wenn der Text gekürzt ist («…», bausteine.css .chip-text).
    if (o.titel || !istLeer(o.text)) c.setAttribute("data-tipp", o.titel || text(o.text));
    fokusSetzen(c, o.fokus);
    if (o.deaktiviert) c.disabled = true;

    let gewaehlt = !!o.gewaehlt;
    function zeigen() { if (umschalter) c.setAttribute("aria-pressed", gewaehlt ? "true" : "false"); }
    c.setzen = function (an) { gewaehlt = !!an; zeigen(); return c; };
    c.istGewaehlt = function () { return gewaehlt; };
    if (o.beiKlick) {
      c.addEventListener("click", function (e) {
        if (umschalter && o.umschalten !== false) { gewaehlt = !gewaehlt; zeigen(); }
        o.beiKlick(umschalter ? gewaehlt : undefined, e);
      });
    }
    zeigen();
    return c;
  }

  function chips(liste) { return anhaengen(el("div", "ds-chips"), liste || []); }

  /* Zahl-Plakette (Mapping 7.2 #16). Leer (null, "") ist sie verborgen.
     Erscheint sie (.setzen von leer auf eine Zahl), ploppt sie einmal
     (.6 → 1); ein neuer Wert ändert sich ohne Bewegung. Beim Bauen bleibt
     sie ruhig, weil ein Bauer auch beim Neuzeichnen läuft – ausser mit
     { ploppen: true } für eine Plakette, die genau jetzt erscheint. */
  function zaehler(zahl, still, optionen) {
    const z = el("span", "zaehler" + (still ? " zaehler-still" : ""), zahl);
    z.setzen = function (n) {
      const warLeer = z.textContent === "";
      textSetzen(z, n);
      if (warLeer && z.textContent !== "") Bewegung.eintreten(z, "ploppen");
      return z;
    };
    if (optionen && optionen.ploppen && z.textContent !== "") Bewegung.eintreten(z, "ploppen");
    return z;
  }


  /* ==================================================================
     Formularfelder
     ================================================================== */

  const EINGABE_TYPEN = { text: "text", zahl: "number", datum: "date", suche: "search", mail: "email", telefon: "tel" };

  /* Vorschlagslisten (<datalist>) liegen gesammelt in einem verborgenen
     Behälter. Jeder Aufruf aktualisiert die Liste – früher wurde sie
     einmal gebaut und nie mehr erneuert (Inventar §8 Nr. 10). */
  function datenlisteSetzen(listenId, werte, ohneFeldId) {
    let liste = $(listenId);
    if (!liste) {
      let ablage = $("ui-datenlisten");
      if (!ablage) {
        ablage = el("div");
        ablage.id = "ui-datenlisten";
        ablage.hidden = true;
        (document.body || document.documentElement).appendChild(ablage);
      }
      liste = el("datalist");
      liste.id = listenId;
      if (ohneFeldId) {
        liste.setAttribute("data-ohne-feld-id", "");
        datenlistenAufraeumenBald();
      }
      ablage.appendChild(liste);
    }
    const neu = [];
    for (const w of werte || []) {
      const t = text(w).trim();
      if (t && neu.indexOf(t) === -1) neu.push(t);
    }
    const alt = Array.from(liste.options).map(function (op) { return op.value; });
    if (alt.length !== neu.length || alt.some(function (w, i) { return w !== neu[i]; })) {
      leeren(liste);
      for (const t of neu) {
        const op = el("option");
        op.value = t;
        liste.appendChild(op);
      }
    }
    return liste;
  }

  /* Ein Feld ohne id bekommt bei jedem Bauen eine neue Liste (es gibt
     keinen Schlüssel, unter dem die alte wiederzufinden wäre). Damit
     Bereiche, die bei jedem Tastendruck neu gebaut werden, keine Listen
     ansammeln, verschwinden solche Listen, sobald kein Feld im Dokument
     mehr auf sie zeigt – im nächsten Takt, wenn die Seite ihre neuen Felder
     eingehängt hat. Ein später eingehängtes Feld holt sich seine Liste beim
     Fokus zurück (eingabe). */
  let datenlistenUhr = 0;

  function datenlistenAufraeumenBald() {
    if (datenlistenUhr) return;
    datenlistenUhr = setTimeout(function () {
      datenlistenUhr = 0;
      const ablage = $("ui-datenlisten");
      if (!ablage) return;
      for (const l of Array.from(ablage.querySelectorAll("datalist[data-ohne-feld-id]"))) {
        if (!document.querySelector("[list=\"" + CSS.escape(l.id) + "\"]")) l.remove();
      }
    }, 0);
  }

  /* Optionen einer Auswahl: Texte, [wert, text] oder { wert, text }. Ein
     gespeicherter Wert, den die Liste nicht (mehr) kennt, bleibt als
     eigene Option erhalten, statt still verloren zu gehen. */
  function auswahlFuellen(auswahl, werte, wert, leerText) {
    leeren(auswahl);
    const aktuell = text(wert);
    const optionen = (werte || []).map(function (w) {
      if (Array.isArray(w)) return { wert: text(w[0]), text: text(w[1] === undefined ? w[0] : w[1]) };
      if (istOptionen(w)) return { wert: text(w.wert), text: text(w.text === undefined ? w.wert : w.text) };
      return { wert: text(w), text: text(w) };
    });
    if (leerText !== undefined && leerText !== null) optionen.unshift({ wert: "", text: leerText });
    if (aktuell !== "" && !optionen.some(function (op) { return op.wert === aktuell; })) {
      optionen.unshift({ wert: aktuell, text: aktuell });
    }
    for (const op of optionen) {
      const o = el("option", null, op.text);
      o.value = op.wert;
      auswahl.appendChild(o);
    }
    auswahl.value = aktuell;
    // Ohne passende Option (und ohne Leeroption) die erste wählen, nie «nichts».
    if (auswahl.selectedIndex === -1 && auswahl.options.length) auswahl.selectedIndex = 0;
    return auswahl;
  }

  function eingabe(optionen) {
    const o = optionen || {};
    const art = o.art || "text";
    let f;
    if (art === "textbereich") {
      f = el("textarea");
      if (o.zeilen) f.rows = o.zeilen;
    } else if (art === "auswahl") {
      f = el("select");
    } else {
      f = el("input");
      f.type = EINGABE_TYPEN[art] || "text";
    }
    f.className = "ds-input" + (o.gefuellt ? " ds-input--filled" : "")
      + (o.schmal ? " eingabe-schmal" : "") + (o.klasse ? " " + o.klasse : "");
    if (o.id) f.id = o.id;
    fokusSetzen(f, o.fokus);
    if (o.name) f.name = o.name;
    if (o.label) f.setAttribute("aria-label", o.label);
    if (o.platzhalter) f.placeholder = o.platzhalter;
    if (o.pflicht) f.required = true;
    if (o.nurLesen) f.readOnly = true;
    if (o.gesperrt) f.disabled = true;
    if (o.maxLaenge) f.maxLength = o.maxLaenge;
    if (art === "zahl") {
      if (o.min !== undefined) f.min = String(o.min);
      if (o.max !== undefined) f.max = String(o.max);
      if (o.schritt !== undefined) f.step = String(o.schritt);
    }

    if (art === "auswahl") {
      auswahlFuellen(f, o.werte, o.wert, o.leer);
      f.werteSetzen = function (werte, wert) {
        return auswahlFuellen(f, werte, wert === undefined ? f.value : wert, o.leer);
      };
    } else {
      f.value = text(o.wert);
      if (art !== "datum") {
        f.autocomplete = o.autocomplete || "off";
        f.spellcheck = false;
      }
    }

    if (o.vorschlaege && f.tagName === "INPUT") {
      const ohneFeldId = !f.id;
      if (ohneFeldId) f.id = id("ui-feld");
      const listenId = f.id + "-vorschlaege";
      let letzte = o.vorschlaege;
      datenlisteSetzen(listenId, letzte, ohneFeldId);
      f.setAttribute("list", listenId);
      f.vorschlaegeSetzen = function (werte) { letzte = werte; datenlisteSetzen(listenId, werte, ohneFeldId); };
      // Wurde die Liste weggeräumt, bevor das Feld eingehängt war: zurückholen.
      if (ohneFeldId) f.addEventListener("focus", function () { datenlisteSetzen(listenId, letzte, true); });
    }

    if (o.beiEingabe) f.addEventListener("input", function () { o.beiEingabe(f.value, f); });
    if (o.beiAenderung) f.addEventListener("change", function () { o.beiAenderung(f.value, f); });
    return f;
  }

  /* Feld mit Beschriftung oben und Hinweis unten (Filter, Dialoge). */
  function feld(beschriftung, feldKnoten, optionen) {
    const o = optionen || {};
    const f = el("div", "ds-field" + (o.voll ? " ds-field--full" : "") + (o.klasse ? " " + o.klasse : ""));
    const steuer = feldKnoten && feldKnoten.matches
      ? (feldKnoten.matches("input, select, textarea") ? feldKnoten : feldKnoten.querySelector("input, select, textarea"))
      : null;
    const label = el(steuer ? "label" : "span", "ds-field__label", beschriftung);
    if (steuer) {
      if (!steuer.id) steuer.id = id("ui-feld");
      label.htmlFor = steuer.id;
    }
    f.appendChild(label);
    if (feldKnoten) f.appendChild(feldKnoten);
    if (!istLeer(o.hinweis)) {
      const h = el("p", "ds-field__hint", o.hinweis);
      h.id = id("ui-hinweis");
      f.appendChild(h);
      if (steuer) beschreibungHinzu(steuer, h.id);
    }
    return f;
  }

  function beschreibungHinzu(steuer, beschreibungsId) {
    const alt = (steuer.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
    if (alt.indexOf(beschreibungsId) === -1) alt.push(beschreibungsId);
    steuer.setAttribute("aria-describedby", alt.join(" "));
  }

  function beschreibungWeg(steuer, beschreibungsId) {
    const rest = (steuer.getAttribute("aria-describedby") || "").split(/\s+/)
      .filter(function (t) { return t && t !== beschreibungsId; });
    if (rest.length) steuer.setAttribute("aria-describedby", rest.join(" "));
    else steuer.removeAttribute("aria-describedby");
  }

  /* Feldfehler (ChatBob setFieldError): Fehlerrahmen, Meldung mit Icon
     unter dem Feld (nie in einem <label>), aria-invalid und
     aria-describedby. Die erste Eingabe löscht ihn; "" löscht ausdrücklich. */
  function feldFehler(steuer, meldung) {
    if (!steuer) return;
    const altId = steuer.getAttribute("data-fehler-id");
    if (altId) {
      const alt = $(altId);
      if (alt) alt.remove();
      beschreibungWeg(steuer, altId);
      steuer.removeAttribute("data-fehler-id");
    }
    if (istLeer(meldung)) {
      steuer.removeAttribute("aria-invalid");
      return;
    }
    steuer.setAttribute("aria-invalid", "true");
    const meldungsId = id("ui-fehler");
    const m = el("p", "ds-field__hint ds-field__hint--error");
    m.id = meldungsId;
    m.appendChild(sinnbild("achtung", 16));
    m.appendChild(el("span", null, meldung));
    const anker = steuer.closest("label, .ds-search, .ds-inline-form") || steuer;
    anker.insertAdjacentElement("afterend", m);
    beschreibungHinzu(steuer, meldungsId);
    steuer.setAttribute("data-fehler-id", meldungsId);
    steuer.addEventListener("input", function weg() {
      if (steuer.getAttribute("data-fehler-id") === meldungsId) feldFehler(steuer, "");
    }, { once: true });
  }

  /* Feldhinweis mit Sinnbild an Ort und Stelle (Live-Prüfung «in
     Ordnung»): schreibt Text und Sinnbild in einen vorhandenen Hinweis
     (.ds-field__hint oder .datenzeile-hinweis, z. B. aus UI.feld/UI.formZeile)
     und verbirgt ihn ohne Text. Den Fehlerfall zeigt UI.feldFehler. Der
     Ton färbt nur das Sinnbild; der Text bleibt leise. */
  function feldHinweis(knoten, inhalt, optionen) {
    if (!knoten) return knoten;
    const o = optionen || {};
    leeren(knoten);
    knoten.classList.toggle("mit-sinnbild", !!o.sinnbild);
    if (o.sinnbild) knoten.appendChild(sinnbild(o.sinnbild, 16, o.ton ? "t-" + o.ton : ""));
    if (!istLeer(inhalt)) knoten.appendChild(el("span", null, inhalt));
    knoten.hidden = istLeer(inhalt);
    return knoten;
  }

  /* Platz für einen Hinweis, der am Getippten hängt (Banner unter einem
     Feld: «Name schon vergeben», «Diese Kurzwahl gibt es schon»).
     .setzen(schluessel, bauen, { aufdecken }) baut nur, wenn sich der
     Schlüssel ändert: Tippen ohne neue Lage lässt den Hinweis stehen (kein
     Flackern, keine neue Ansage). Ein leerer Schlüssel leert und verbirgt
     ihn. aufdecken: true deckt ihn auf, wenn er dadurch ERSCHEINT (eine
     Eingabe hat ihn gebracht, api.md §9.1); beim Neuzeichnen steht er
     ruhig da. Stand der Fokus darin, geht er auf das erste Bedienelement
     des neuen Inhalts, sonst auf das Feld seiner Zeile. */
  function hinweisPlatz(optionen) {
    const o = optionen || {};
    const p = el("div", "hinweis-platz" + (o.klasse ? " " + o.klasse : ""));
    if (o.id) p.id = o.id;
    p.hidden = true;
    let schluessel = "";
    p.setzen = function (neu, bauen, optionenSetzen) {
      const s = text(neu);
      if (s === schluessel) return p;
      const warLeer = !schluessel;
      schluessel = s;
      const fokusDrin = p.contains(document.activeElement);
      leeren(p);
      p.hidden = !s;
      const knoten = s && typeof bauen === "function" ? bauen() : null;
      if (knoten) anhaengen(p, knoten);
      if (knoten && knoten.nodeType && warLeer && optionenSetzen && optionenSetzen.aufdecken) Bewegung.aufdecken(knoten);
      if (fokusDrin) {
        const zeile = p.closest(".datenzeile, .ds-field");
        const ziel = p.querySelector("button, a[href]")
          || (zeile ? zeile.querySelector("input, select, textarea") : null);
        if (ziel) ziel.focus();
      }
      return p;
    };
    p.schluessel = function () { return schluessel; };
    return p;
  }

  /* Kontrollkästchen oder Optionsfeld mit Text, eine 40-px-Zeile. */
  function ankreuzen(optionen) {
    const o = optionen || {};
    const z = el("label", "ds-check" + (o.klein ? " ds-check--sm" : "") + (o.klasse ? " " + o.klasse : ""));
    const k = el("input");
    k.type = o.art === "radio" ? "radio" : "checkbox";
    if (o.id) k.id = o.id;
    if (o.name) k.name = o.name;
    if (o.wert !== undefined) k.value = text(o.wert);
    fokusSetzen(k, o.fokus);
    k.checked = !!o.an;
    if (o.gesperrt) k.disabled = true;
    z.appendChild(k);
    z.appendChild(el("span", null, o.text));
    if (o.beiAenderung) k.addEventListener("change", function () { o.beiAenderung(k.checked, k); });
    z.eingabe = k;
    return z;
  }

  /* Mehrfachauswahl als fieldset mit legend (eine Gruppe von Kästchen hat
     so einen Namen); die Zahlen lassen sich an Ort und Stelle ändern, ohne
     dass der Fokus verloren geht. fokus: Präfix für data-fokus der
     Kästchen («<fokus>-<wert>»; ein Eintrag kann mit e.fokus abweichen). */
  function mehrfach(optionen) {
    const o = optionen || {};
    const gruppe = el("fieldset", "ds-field" + (o.klasse ? " " + o.klasse : ""));
    if (!istLeer(o.legende)) gruppe.appendChild(el("legend", "ds-field__label", o.legende));
    const liste = el("div", "mehrfach");
    const name = o.name || id("ui-mehrfach");
    const zahlen = Object.create(null);
    const kaestchen = [];
    for (const e of o.eintraege || []) {
      const wert = text(e.wert === undefined ? e.text : e.wert);
      const zeile = ankreuzen({ text: e.text === undefined ? wert : e.text, an: e.an, name: name, wert: wert,
        gesperrt: e.gesperrt, fokus: e.fokus || (o.fokus ? o.fokus + "-" + wert : undefined) });
      if (e.zahl !== undefined) {
        const z = el("span", "anzahl", zahlFormat(e.zahl));
        zeile.appendChild(z);
        zahlen[wert] = z;
      }
      zeile.eingabe.addEventListener("change", function () {
        if (o.beiAenderung) o.beiAenderung(wert, zeile.eingabe.checked, gruppe.gewaehlt());
      });
      kaestchen.push(zeile.eingabe);
      liste.appendChild(zeile);
    }
    gruppe.appendChild(liste);
    gruppe.gewaehlt = function () {
      return kaestchen.filter(function (k) { return k.checked; }).map(function (k) { return k.value; });
    };
    gruppe.setzen = function (werte) {
      const soll = (werte || []).map(text);
      for (const k of kaestchen) k.checked = soll.indexOf(k.value) !== -1;
      return gruppe;
    };
    gruppe.zahlenSetzen = function (neu) {
      for (const wert of Object.keys(zahlen)) {
        textSetzen(zahlen[wert], zahlFormat(neu && neu[wert] !== undefined ? neu[wert] : 0));
      }
      return gruppe;
    };
    return gruppe;
  }

  /* Zahlen in Schweizer Schreibweise («1’284», «7.5»), EIN Formatierer für
     alle Seiten (Hilfe.zahlText in graph.js führt hierher zurück).
     Ohne «nachkomma» höchstens eine Nachkommastelle (Zählwerte bleiben
     ganz), mit «nachkomma» genau so viele. Zahlen als Text («12») gehen
     auch; leer → "", Unlesbares bleibt als Text stehen. */
  const zahlFormatierer = Object.create(null);

  function formatierer(nachkomma) {
    const k = nachkomma === undefined ? "standard" : String(nachkomma);
    if (!(k in zahlFormatierer)) {
      try {
        zahlFormatierer[k] = new Intl.NumberFormat("de-CH", nachkomma === undefined
          ? { maximumFractionDigits: 1 }
          : { minimumFractionDigits: nachkomma, maximumFractionDigits: nachkomma });
      } catch (e) {
        zahlFormatierer[k] = null;
      }
    }
    return zahlFormatierer[k];
  }

  function zahlFormat(n, nachkomma) {
    if (n === null || n === undefined || n === "") return "";
    const zahl = typeof n === "number" ? n : (typeof n === "string" && n.trim() !== "" ? Number(n) : NaN);
    if (!isFinite(zahl)) return text(n);
    const f = formatierer(nachkomma);
    return f ? f.format(zahl) : String(zahl);
  }

  /* «12.10.2026, 14.05»: Datum und Uhrzeit für die Anzeige, Uhrzeit mit
     Punkt (Schweizer Schreibweise) in lokaler Zeit. wert: Date oder
     ISO-Zeitstempel (Graph liefert UTC); ungültig oder leer → "".
     Hilfe.datumZeitText (graph.js) bleibt bei «14:05»: so liest Excel die
     CSV-Datei als Zeit. */
  function zeitText(wert) {
    if (wert === null || wert === undefined || wert === "") return "";
    const d = wert instanceof Date ? wert : new Date(wert);
    if (isNaN(d.getTime())) return "";
    const zwei = function (n) { return String(n).padStart(2, "0"); };
    return zwei(d.getDate()) + "." + zwei(d.getMonth() + 1) + "." + d.getFullYear()
      + ", " + zwei(d.getHours()) + "." + zwei(d.getMinutes());
  }


  /* ==================================================================
     Suche
     ================================================================== */

  /* Gefüllte Pille mit EINEM Icon (Fehler E6). beiEingabe kommt verzögert
     (Standard 150 ms). setzen() schreibt nie in ein Feld, in dem gerade
     getippt wird (Fehler B4); sofort() löst eine wartende Eingabe aus. */
  function suchfeld(optionen) {
    const o = optionen || {};
    const huelle = el("div", "ds-search" + (o.klasse ? " " + o.klasse : ""));
    huelle.appendChild(sinnbild("suche", 20));
    const f = el("input", "ds-input");
    f.type = "search";
    if (o.id) f.id = o.id;
    if (o.name) f.name = o.name;
    f.placeholder = o.platzhalter || "Suchen";
    f.value = text(o.wert);
    f.autocomplete = "off";
    f.spellcheck = false;
    f.setAttribute("aria-label", o.label || o.platzhalter || "Suchen");
    huelle.appendChild(f);
    if (o.kuerzel) {
      const k = el("kbd", "kuerzel", o.kuerzel);
      k.setAttribute("aria-hidden", "true");
      huelle.appendChild(k);
      f.setAttribute("aria-keyshortcuts", o.kuerzel);
    }

    const verzoegerung = o.verzoegerung === undefined ? 150 : o.verzoegerung;
    let uhr = 0;
    function melden() { uhr = 0; if (o.beiEingabe) o.beiEingabe(f.value, f); }
    f.addEventListener("input", function () {
      clearTimeout(uhr);
      if (verzoegerung > 0) uhr = setTimeout(melden, verzoegerung);
      else melden();
    });

    /* Esc leert eine gefüllte Suche – immer, nicht nur solange nichts
       anderes auf der Seite Esc beansprucht (eine Detailseite fragte mit
       offenem Entwurf sonst «Änderung verwerfen?»). preventDefault sagt
       den Seiten (F.ereignisse), dass Esc erledigt ist; erst Esc in der
       leeren Suche geht weiter. Offene Ebenen fängt rahmen.js vorher ab. */
    f.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape" || ev.defaultPrevented || ev.isComposing || f.value === "") return;
      ev.preventDefault();
      f.value = "";
      // Wie das native Leeren: ein input-Ereignis, die Suche gilt sofort.
      f.dispatchEvent(new Event("input", { bubbles: true }));
      huelle.sofort();
    });

    huelle.eingabe = f;
    huelle.wert = function () { return f.value; };
    huelle.setzen = function (wert) {
      if (uhr || document.activeElement === f) return huelle;
      if (f.value !== text(wert)) f.value = text(wert);
      return huelle;
    };
    huelle.sofort = function () {
      if (uhr) { clearTimeout(uhr); melden(); }
      return huelle;
    };
    return huelle;
  }


  /* ==================================================================
     Schalter
     ================================================================== */

  const SCHALTER_WOERTER = { an: "Aktiv", aus: "Inaktiv", gesperrt: "Aktiv" };

  /* button[role=switch]. Ein Klick schaltet an Ort und Stelle um (der
     Übergang spielt), dann kommt beiWechsel(an, schalter). Gibt beiWechsel
     false zurück oder ein Promise, das false liefert oder scheitert,
     springt der Schalter zurück. Gesperrt = an + aria-disabled (bleibt
     fokussierbar, Tooltip nennt den Grund). */
  function schalter(optionen) {
    const o = optionen || {};
    const s = el("button", "schalter" + (o.klasse ? " " + o.klasse : ""));
    s.type = "button";
    s.setAttribute("role", "switch");
    if (o.id) s.id = o.id;
    fokusSetzen(s, o.fokus);
    if (o.label) s.setAttribute("aria-label", o.label);
    let an = !!o.an;
    let gesperrt = !!o.gesperrt;
    let deaktiviert = !!o.deaktiviert;
    let tipp = o.titel || "";

    function zeigen() {
      s.setAttribute("aria-checked", (an || gesperrt) ? "true" : "false");
      s.classList.toggle("gesperrt", gesperrt);
      if (gesperrt || deaktiviert) s.setAttribute("aria-disabled", "true");
      else s.removeAttribute("aria-disabled");
      if (tipp) s.setAttribute("data-tipp", tipp);
      else s.removeAttribute("data-tipp");
      s.dispatchEvent(new CustomEvent("schalterwechsel", { detail: { an: an || gesperrt, gesperrt: gesperrt } }));
    }

    s.addEventListener("click", function () {
      if (gesperrt || deaktiviert) return;
      const neu = !an;
      an = neu;
      zeigen();
      if (!o.beiWechsel) return;
      const zurueck = function () { if (an === neu) { an = !neu; zeigen(); } };
      const ergebnis = o.beiWechsel(neu, s);
      if (ergebnis === false) zurueck();
      else if (ergebnis && typeof ergebnis.then === "function") {
        ergebnis.then(function (r) { if (r === false) zurueck(); }, zurueck);
      }
    });

    s.setzen = function (neuAn, neuGesperrt, neuerTipp) {
      an = !!neuAn;
      if (neuGesperrt !== undefined && neuGesperrt !== null) gesperrt = !!neuGesperrt;
      if (neuerTipp !== undefined) tipp = neuerTipp || "";
      zeigen();
      return s;
    };
    s.sperren = function (aus) { deaktiviert = !!aus; zeigen(); return s; };
    s.istAn = function () { return an || gesperrt; };
    s.istGesperrt = function () { return gesperrt; };
    zeigen();
    return s;
  }

  /* Zeile mit Schalter, Name (+ Unterzeile), Zustandswort und Zusatz
     (Chips) rechts. Der Name ist ein <label> für den Schalter. */
  function schalterZeile(optionen) {
    const o = optionen || {};
    const s = o.schalter || schalter({ an: o.an, gesperrt: o.gesperrt, titel: o.titel, beiWechsel: o.beiWechsel });
    const z = el("div", (o.kompakt ? "schalter-feld" : "schalter-zeile") + (o.klasse ? " " + o.klasse : ""));
    z.appendChild(s);

    const textKnoten = el("div", "schalter-text");
    const name = el("label", "schalter-name", o.name);
    if (!s.id) s.id = id("ui-schalter");
    name.htmlFor = s.id;
    textKnoten.appendChild(name);
    if (o.unter && o.unter.nodeType) textKnoten.appendChild(anhaengen(el("span", "schalter-unter"), o.unter));
    else if (!istLeer(o.unter)) textKnoten.appendChild(el("span", "schalter-unter", o.unter));
    z.appendChild(textKnoten);

    if (o.wort) {
      const woerter = Object.assign({}, SCHALTER_WOERTER, istOptionen(o.wort) ? o.wort : {});
      const w = el("span", "schalter-wort");
      w.setAttribute("aria-hidden", "true");   // der Zustand steht schon in aria-checked
      const nachfuehren = function () {
        textSetzen(w, s.istGesperrt && s.istGesperrt() ? woerter.gesperrt
          : (s.getAttribute("aria-checked") === "true" ? woerter.an : woerter.aus));
      };
      s.addEventListener("schalterwechsel", nachfuehren);
      nachfuehren();
      z.appendChild(w);
    }

    const zusatz = el("div", "schalter-zusatz");
    anhaengen(zusatz, o.zusatz || []);
    if (zusatz.firstChild) z.appendChild(zusatz);
    z.schalter = s;
    z.zusatz = zusatz;
    return z;
  }


  /* ==================================================================
     Tabellen
     ================================================================== */

  function zelleFuellen(zelle, wert) {
    if (wert && (wert.nodeType || Array.isArray(wert))) anhaengen(zelle, wert);
    else zelle.textContent = istLeer(wert) ? "–" : String(wert);
    return zelle;
  }

  function spalteLesen(s) {
    return istOptionen(s) ? s : { text: s };
  }

  /* Schlichte Tabelle in einer Karte (läuft bis an den Kartenrand).
     kopfzeilen: Texte oder { text, zahl, klasse }; Zellen dürfen Knoten
     sein; leere Zellen zeigen «–». */
  function tabelle(kopfzeilen, datenzeilen, optionen) {
    const o = optionen || {};
    const spalten = (kopfzeilen || []).map(spalteLesen);
    const rahmen = el("div", "ds-table-wrap");
    const t = el("table", "ds-table" + (o.klasse ? " " + o.klasse : ""));
    if (!istLeer(o.beschriftung)) t.appendChild(el("caption", "ds-sr", o.beschriftung));
    const kopf = el("thead");
    const reihe = el("tr");
    for (const s of spalten) {
      const th = el("th", ((s.zahl ? "ds-num" : "") + (s.klasse ? " " + s.klasse : "")).trim() || null, s.text);
      th.scope = "col";
      reihe.appendChild(th);
    }
    kopf.appendChild(reihe);
    t.appendChild(kopf);
    const koerper = el("tbody");
    for (const z of datenzeilen || []) {
      const tr = el("tr");
      (Array.isArray(z) ? z : []).forEach(function (wert, i) {
        const s = spalten[i] || {};
        tr.appendChild(zelleFuellen(el("td", ((s.zahl ? "ds-num" : "") + (s.klasse ? " " + s.klasse : "")).trim() || null), wert));
      });
      koerper.appendChild(tr);
    }
    t.appendChild(koerper);
    rahmen.appendChild(t);
    rahmen.tabelle = t;
    // Blende nur, solange es seitlich weitergeht (data-mehr-rechts / data-gerollt-x).
    return rollKanten(rahmen);
  }

  const SORT_ARIA = { auf: "ascending", ab: "descending", ascending: "ascending", descending: "descending" };

  /* Sortierknopf im th; der 16-px-Pfeil steht nur an der sortierten Spalte. */
  function sortierKnopf(beschriftung, richtung) {
    const k = el("button", "ds-table__sort");
    k.type = "button";
    k.appendChild(el("span", null, beschriftung));
    k.richtungSetzen = function (r) {
      const alt = k.querySelector(":scope > svg");
      if (alt) alt.remove();
      const aria = SORT_ARIA[r];
      if (aria) k.appendChild(sinnbild(aria === "ascending" ? "pfeilHoch" : "pfeilRunter", 16));
      return k;
    };
    k.richtungSetzen(richtung);
    return k;
  }

  /* Kopf einer Liste mit sortierbaren Spalten. spalten: [{ schluessel,
     text, sortierbar = true, zahl, klasse, titel }]. aria-sort steht an
     ALLEN sortierbaren th (none/ascending/descending). sortierungSetzen()
     aktualisiert an Ort und Stelle – der Fokus bleibt auf dem Knopf. */
  function tabellenKopf(spalten, optionen) {
    const o = optionen || {};
    const kopf = el("thead");
    const reihe = el("tr");
    const knoepfe = Object.create(null);
    for (const roh of spalten || []) {
      const s = spalteLesen(roh);
      const th = el("th", ((s.zahl ? "ds-num" : "") + (s.klasse ? " " + s.klasse : "")).trim() || null);
      th.scope = "col";
      // Die Erklärung einer Spalte hängt am fokussierbaren Element (Sortier-
      // knopf, sonst ein Tabstopp um den Text): so erscheint sie auch per
      // Tastatur und wird dem Screenreader als Beschreibung genannt.
      if (s.sortierbar === false || s.schluessel === undefined) {
        if (s.titel) {
          const t = el("span", "tabelle-kopf-text", s.text);
          t.tabIndex = 0;
          t.setAttribute("data-tipp", s.titel);
          th.appendChild(t);
        } else {
          th.textContent = text(s.text);
        }
      } else {
        const k = sortierKnopf(s.text, null);
        if (s.titel) k.setAttribute("data-tipp", s.titel);
        k.addEventListener("click", function () { if (o.beiSortieren) o.beiSortieren(s.schluessel, k); });
        th.appendChild(k);
        knoepfe[s.schluessel] = { th: th, knopf: k };
      }
      reihe.appendChild(th);
    }
    kopf.appendChild(reihe);
    kopf.sortierungSetzen = function (schluessel, richtung) {
      for (const sch of Object.keys(knoepfe)) {
        const aktiv = sch === String(schluessel) && SORT_ARIA[richtung];
        knoepfe[sch].th.setAttribute("aria-sort", aktiv ? SORT_ARIA[richtung] : "none");
        knoepfe[sch].knopf.richtungSetzen(aktiv ? richtung : null);
      }
      return kopf;
    };
    kopf.sortierungSetzen(o.sortiert, o.richtung);
    return kopf;
  }

  /* Rollkanten: data-gerollt-x (seitlich gerollt → Haarlinie an der
     klebenden ersten Spalte), data-gerollt (nach unten gerollt) und
     data-mehr-rechts (rechts liegt noch Inhalt → z. B. eine Ausblende-Maske
     am rechten Rand, die nur steht, solange es dort wirklich weitergeht).
     Ändert sich die Grösse des Rollers oder seines Inhalts (erstes Kind),
     wird neu geprüft. */
  const beobachteteRoller = new WeakSet();
  const rollerVon = new WeakMap();
  const groessenBeobachter = typeof ResizeObserver === "function"
    ? new ResizeObserver(function (eintraege) {
      for (const e of eintraege) {
        const r = rollerVon.get(e.target);
        if (!r) continue;
        // Ausgehängt (neu gezeichnet): nicht weiter beobachten, sonst hielte
        // der Beobachter jede alte Tabelle fest.
        if (!r.isConnected) {
          for (const k of [r, r.firstElementChild]) if (k) groessenBeobachter.unobserve(k);
          continue;
        }
        kantenPruefen(r);
      }
    })
    : null;

  function kantenPruefen(r) {
    r.toggleAttribute("data-gerollt-x", r.scrollLeft > 0);
    r.toggleAttribute("data-gerollt", r.scrollTop > 0);
    r.toggleAttribute("data-mehr-rechts", r.scrollLeft + r.clientWidth < r.scrollWidth - 1);
    // Breite der senkrechten Rollleiste: die Blende rechts lässt sie aus.
    const leiste = r.offsetWidth - r.clientWidth - r.clientLeft * 2;
    const alt = r.style.getPropertyValue("--rollleiste");
    const neu = leiste > 0 ? leiste + "px" : "";
    if (alt !== neu) {
      if (neu) r.style.setProperty("--rollleiste", neu);
      else r.style.removeProperty("--rollleiste");
    }
  }

  function rollKanten(element) {
    if (!element || beobachteteRoller.has(element)) return element;
    beobachteteRoller.add(element);
    element.addEventListener("scroll", function () { kantenPruefen(element); }, { passive: true });
    if (groessenBeobachter) {
      for (const k of [element, element.firstElementChild]) {
        if (!k) continue;
        rollerVon.set(k, element);
        groessenBeobachter.observe(k);
      }
    }
    kantenPruefen(element);
    return element;
  }

  /* Rahmen einer seitenfüllenden Liste (eigener Scroller, klebender Kopf
     und erste Spalte). */
  function tabellenRahmen(tabellenKnoten, optionen) {
    const o = optionen || {};
    const r = el("div", "tabelle-rahmen" + (o.klasse ? " " + o.klasse : ""));
    if (o.id) r.id = o.id;
    if (tabellenKnoten) r.appendChild(tabellenKnoten);
    return rollKanten(r);
  }


  /* ==================================================================
     Hinweisliste, Listenzeilen, Zeitachse
     ================================================================== */

  const HINWEIS_SINNBILDER = { gefahr: "achtungKreis", warnung: "achtung", erfolg: "checkKreis", info: "info" };

  function hinweisZeile(optionen) {
    const o = optionen || {};
    const ton = HINWEIS_SINNBILDER[o.ton] ? o.ton : "info";
    const z = el("div", "hinweis-zeile t-" + ton);
    z.appendChild(sinnbild(o.sinnbild || HINWEIS_SINNBILDER[ton], 20));
    const t = el("div", "hinweis-zeile-text");
    if (!istLeer(o.titel)) t.appendChild(el("span", "hinweis-zeile-titel", o.titel));
    if (o.text && o.text.nodeType) t.appendChild(anhaengen(el("span", "hinweis-zeile-inhalt"), o.text));
    else if (!istLeer(o.text)) t.appendChild(el("span", "hinweis-zeile-inhalt", o.text));
    z.appendChild(t);
    return z;
  }

  function hinweise(zeilen) { return anhaengen(el("div", "hinweise"), zeilen || []); }

  /* Zeile einer umrandeten Liste: Titel 500 + Unterzeile. Ohne Aktionen
     ist die ganze Zeile der Link (href) oder Knopf (beiKlick) mit Pfeil;
     mit Aktionen ist sie ein div, der Titel wird zum Link. */
  function listenZeile(optionen) {
    const o = optionen || {};
    const aktionen = (o.aktionen || []).filter(Boolean);
    const ganz = !aktionen.length && (o.href || o.beiKlick);
    const tag = ganz ? (o.href ? "a" : "button") : "div";
    const z = el(tag, "listen-zeile" + (o.aktuell ? " aktuell" : "") + (o.klasse ? " " + o.klasse : ""));
    if (tag === "a") z.href = o.href;
    if (tag === "button") z.type = "button";
    if (ganz && o.beiKlick) z.addEventListener("click", o.beiKlick);
    if (o.aktuell) z.setAttribute("aria-current", "true");
    if (o.titelTipp) z.setAttribute("data-tipp", o.titelTipp);
    if (ganz) fokusSetzen(z, o.fokus);

    // Vorne: eine Zahlmarke (UI.zahlmarke) oder ein Sinnbild.
    if (o.marke) z.appendChild(o.marke);
    if (o.sinnbild) z.appendChild(sinnbild(o.sinnbild, 20, "t-leise"));
    const t = el("span", "listen-zeile-text");
    const titel = el("span", "listen-zeile-titel");
    if (!ganz && o.href) {
      const a = el("a", "name-link", o.titel);
      a.href = o.href;
      if (o.beiKlick) a.addEventListener("click", o.beiKlick);
      fokusSetzen(a, o.fokus);
      titel.appendChild(a);
    } else {
      titel.textContent = text(o.titel);
    }
    t.appendChild(titel);
    if (Array.isArray(o.unter)) t.appendChild(anhaengen(el("span", "listen-zeile-unter"), [teile(o.unter)]));
    else if (o.unter && o.unter.nodeType) t.appendChild(anhaengen(el("span", "listen-zeile-unter"), o.unter));
    else if (!istLeer(o.unter)) t.appendChild(el("span", "listen-zeile-unter", o.unter));
    z.appendChild(t);

    anhaengen(z, Array.isArray(o.status) ? o.status : (o.status ? [o.status] : []));
    // In einem Link oder Knopf kein Bedienelement im Bedienelement.
    if (ganz) for (const st of Array.from(z.querySelectorAll(".ds-status[tabindex]"))) st.removeAttribute("tabindex");
    if (aktionen.length) z.appendChild(anhaengen(el("div", "listen-zeile-aktionen"), aktionen));
    if (ganz) {
      const pfeil = el("span", "listen-zeile-pfeil");
      pfeil.setAttribute("aria-hidden", "true");
      pfeil.appendChild(sinnbild(o.pfeil || "pfeilRechts", 16));
      z.appendChild(pfeil);
    }
    return z;
  }

  function zeilenliste(zeilen) { return anhaengen(el("div", "zeilenliste"), zeilen || []); }

  /* Zahlmarke (Mapping 7.2 #14, Handlungsbedarf): 32-px-Pille mit der
     Zahl vorne in einer Listenzeile (UI.listenZeile({ marke })), tonal
     nach Dringlichkeit ('warnung' | 'gefahr', sonst neutral). Die
     Dringlichkeit steht immer auch als Wort in der Zeile (Status
     «Dringend»), nie nur in der Farbe. */
  function zahlmarke(zahl, ton) {
    const t = ton === "warnung" || ton === "gefahr" ? " ton-" + ton : "";
    return el("span", "zahlmarke" + t, typeof zahl === "number" ? zahlFormat(zahl) : text(zahl));
  }

  /* Zeitachse: [{ titel, zeit, text, still, zusatz: [Knoten], aktionen: [Knoten] }]. */
  function zeitachse(eintraege) {
    const liste = el("ol", "zeitachse");
    for (const e of eintraege || []) {
      const li = el("li", "zeitachse-eintrag" + (e.still ? " still" : "") + (e.klasse ? " " + e.klasse : ""));
      const kopf = el("div", "zeitachse-kopf");
      if (!istLeer(e.titel)) kopf.appendChild(el("span", "zeitachse-titel", e.titel));
      const zeitKnoten = !!e.zeit && (!!e.zeit.nodeType || Array.isArray(e.zeit));
      if (zeitKnoten || !istLeer(e.zeit) || e.zeitSinnbild) {
        // Meta-Zeile; ein Sinnbild davor (Abgleich: «sync», Mapping 7.2 #13).
        const zeit = el("span", "zeitachse-zeit");
        if (e.zeitSinnbild) zeit.appendChild(sinnbild(e.zeitSinnbild, 16));
        if (zeitKnoten) anhaengen(zeit, e.zeit);
        else if (!istLeer(e.zeit)) {
          if (e.zeitSinnbild) zeit.appendChild(el("span", null, e.zeit));
          else zeit.textContent = String(e.zeit);
        }
        kopf.appendChild(zeit);
      }
      anhaengen(kopf, e.zusatz || []);
      li.appendChild(kopf);
      if (e.text && e.text.nodeType) li.appendChild(anhaengen(el("div", "zeitachse-text"), e.text));
      else if (!istLeer(e.text)) li.appendChild(el("div", "zeitachse-text", e.text));
      if (e.aktionen && e.aktionen.length) li.appendChild(anhaengen(el("div", "zeitachse-aktionen"), e.aktionen));
      liste.appendChild(li);
    }
    return liste;
  }


  /* ==================================================================
     Balken, Säulen, Fortschritt
     ================================================================== */

  function anteilBegrenzen(a) {
    const n = Number(a);
    return isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
  }

  /* 4-px-Balken für Verteilungen; der Wert steht immer daneben als Zahl,
     der Balken ist darum für den Screenreader verborgen. */
  function balken(anteil, ton) {
    const b = el("div", "balken" + (ton === "still" ? " still" : (ton ? " ton-" + ton : "")));
    b.setAttribute("aria-hidden", "true");
    const f = el("span", "balken-fuell");
    b.appendChild(f);
    b.setzen = function (neu) { f.style.setProperty("--anteil", String(anteilBegrenzen(neu))); return b; };
    b.setzen(anteil);
    return b;
  }

  /* Mini-Verteilung: werte = Zahlen oder { wert, titel, hervorgehoben }.
     Höhen relativ zum grössten Wert (oder optionen.max). */
  function saeulen(werte, optionen) {
    const o = optionen || {};
    const liste = (werte || []).map(function (w) { return istOptionen(w) ? w : { wert: w }; });
    const max = o.max || Math.max.apply(null, liste.map(function (w) { return Number(w.wert) || 0; }).concat([0])) || 1;
    const s = el("div", "saeulen" + (o.klasse ? " " + o.klasse : ""));
    s.setAttribute("role", "img");
    if (o.label) s.setAttribute("aria-label", o.label);
    liste.forEach(function (w, i) {
      const saeule = el("div", "saeule" + ((w.hervorgehoben || o.hervorheben === i) ? " hervorgehoben" : ""));
      if (w.titel) saeule.setAttribute("data-tipp", w.titel);
      const f = el("span", "saeule-fuell");
      f.style.setProperty("--anteil", String(anteilBegrenzen((Number(w.wert) || 0) / max)));
      saeule.appendChild(f);
      s.appendChild(saeule);
    });
    return s;
  }

  /* Verteilung (Mapping 7.2 #12): Zeilen mit Name, Zahl und Balken.
     eintraege: [{ text, zahl, anteil?, titel?, beiKlick?, href? }]; der
     Anteil ist sonst zahl / grösste Zahl (oder optionen.max). Der Name
     steht einzeilig, der ganze Name im Tooltip. Die Balken wachsen nur mit
     Bewegung.auftritt (erstes Zeigen), neu gezeichnete springen. */
  function verteilung(eintraege, optionen) {
    const o = optionen || {};
    const liste = (eintraege || []).filter(Boolean);
    const groesste = o.max || Math.max.apply(null, liste.map(function (e) { return Number(e.zahl) || 0; }).concat([0])) || 1;
    const klickbar = liste.some(function (e) { return e.beiKlick || e.href; });
    const ul = el("ul", "verteilung" + (klickbar ? " verteilung-klickbar" : "") + (o.klasse ? " " + o.klasse : ""));
    for (const e of liste) {
      const li = el("li");
      const tag = e.href ? "a" : (e.beiKlick ? "button" : "div");
      const z = el(tag, "verteilung-zeile");
      if (tag === "a") z.href = e.href;
      if (tag === "button") z.type = "button";
      if (e.beiKlick) z.addEventListener("click", e.beiKlick);
      if (tag !== "div") fokusSetzen(z, e.fokus);
      z.setAttribute("data-tipp", e.titel || text(e.text));
      z.appendChild(el("span", "verteilung-name", e.text));
      z.appendChild(el("span", "verteilung-zahl", zahlFormat(Number(e.zahl) || 0)));
      z.appendChild(balken(e.anteil !== undefined ? e.anteil : (Number(e.zahl) || 0) / groesste));
      li.appendChild(z);
      ul.appendChild(li);
    }
    return ul;
  }

  /* Fortschritt (linear): anteil 0..1 oder unbestimmt; Text und Detail
     darunter. setzen() ändert nur, was sich ändert – der Balken gleitet
     weiter, statt neu zu beginnen. */
  function fortschritt(optionen) {
    const g = el("div", "ds-progress");
    const spur = el("div", "ds-progress__track");
    spur.setAttribute("role", "progressbar");
    spur.setAttribute("aria-valuemin", "0");
    spur.setAttribute("aria-valuemax", "100");
    const balkenKnoten = el("span", "ds-progress__bar");
    spur.appendChild(balkenKnoten);
    const textKnoten = el("p", "ds-progress__label");
    textKnoten.setAttribute("aria-live", "polite");
    const detail = el("p", "ds-progress__detail");
    anhaengen(g, [spur, textKnoten, detail]);

    g.setzen = function (o) {
      o = o || {};
      if (o.label !== undefined) spur.setAttribute("aria-label", o.label);
      if (o.unbestimmt !== undefined) g.classList.toggle("ds-progress--indeterminate", !!o.unbestimmt);
      if (g.classList.contains("ds-progress--indeterminate")) {
        spur.removeAttribute("aria-valuenow");
      } else if (o.anteil !== undefined) {
        const a = anteilBegrenzen(o.anteil);
        balkenKnoten.style.setProperty("--ds-progress", String(a));
        spur.setAttribute("aria-valuenow", String(Math.round(a * 100)));
      }
      if (o.text !== undefined) textSetzen(textKnoten, o.text);
      if (o.detail !== undefined) textSetzen(detail, o.detail);
      return g;
    };
    g.setzen(Object.assign({ anteil: 0 }, optionen || {}));
    return g;
  }


  /* ==================================================================
     Öffentliche Schnittstelle. rahmen.js hängt UI.dialog, UI.bestaetigen,
     UI.blatt, UI.meldung, UI.tipp und UI.adresse an dieses Objekt an.
     ================================================================== */

  return {
    // DOM
    $: $, el: el, leeren: leeren, anhaengen: anhaengen, text: text, gleichwertig: gleichwertig,
    textSetzen: textSetzen, id: id, kinderAbgleichen: kinderAbgleichen,
    // Sinnbilder
    sinnbild: sinnbild, SINNBILDER: SINNBILDER,
    // Knöpfe
    knopf: knopf, knopfText: knopfText, knopfUebernehmen: knopfUebernehmen, knopfSperren: knopfSperren,
    knopfSperre: knopfSperre,
    beschaeftigt: beschaeftigt, beschaeftigtAbwarten: beschaeftigtAbwarten,
    // Status, Hinweise
    status: status, banner: banner, leerzustand: leerzustand, hinweis: hinweis, meta: meta, teile: teile,
    // Laden
    spinner: spinner, ladezeile: ladezeile, skelettSeite: skelettSeite,
    // Karten, Kacheln
    karte: karte, kachel: kachel, kacheln: kacheln,
    // Datenzeilen
    datenzeilen: datenzeilen, feldZeile: feldZeile, feldGesperrt: feldGesperrt, feldFrei: feldFrei,
    formZeile: formZeile, kennwerte: kennwerte, fakten: fakten,
    // Chips, Zähler
    chip: chip, chips: chips, zaehler: zaehler,
    // Formulare
    eingabe: eingabe, feld: feld, feldFehler: feldFehler, feldHinweis: feldHinweis, hinweisPlatz: hinweisPlatz,
    ankreuzen: ankreuzen, mehrfach: mehrfach,
    datenliste: datenlisteSetzen, auswahlFuellen: auswahlFuellen, zahlText: zahlFormat, zeitText: zeitText,
    // Suche, Schalter
    suchfeld: suchfeld, schalter: schalter, schalterZeile: schalterZeile,
    // Tabellen
    tabelle: tabelle, tabellenKopf: tabellenKopf, sortierKnopf: sortierKnopf,
    tabellenRahmen: tabellenRahmen, rollKanten: rollKanten,
    // Listen
    hinweisZeile: hinweisZeile, hinweise: hinweise, listenZeile: listenZeile, zeilenliste: zeilenliste,
    zahlmarke: zahlmarke, zeitachse: zeitachse,
    // Diagramme
    balken: balken, saeulen: saeulen, verteilung: verteilung, fortschritt: fortschritt
  };
})();

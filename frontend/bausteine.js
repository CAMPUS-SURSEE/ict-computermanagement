/* bausteine.js – die Bausteine des Design-Systems (Namensraum «UI») und
   die deutsche Hülle um die Bewegung von Dashboard-Style («Bewegung»).

   Jeder Baustein hat hier genau EINEN Bauer: die gemeinsamen bauen das
   Markup von Dashboard-Style 1.6.2 (.ds-*-Klassen aus vendor/dashboard-
   style/ds.css), die ICT-eigenen das aus bausteine.css. Seiten bauen nur
   über UI.*, Rahmen.* (rahmen.js), Bewegung.* (unten, über DS.motion) und
   F.* (fenster.js). rahmen.js hängt die Überlagerungen und weitere
   Funktionen an UI an (UI.dialog, UI.bestaetigen, UI.blatt, UI.ebeneOffen,
   UI.meldung, UI.meldungenFehlerSchliessen, UI.tipp, UI.speicherleiste,
   UI.seitenkopf, UI.adresse; Signaturen im Kopfkommentar von rahmen.js).

   Grundsätze:
     - DOM nur über createElement/textContent; nie innerHTML mit Daten.
       Die Sinnbilder kommen aus Dashboard-Style (DS.icons) und entstehen
       über DS.icons.iconElement, ohne innerHTML.
     - Jeder Bauer gibt einen DOM-Knoten zurück und nimmt ein Objekt mit
       Optionen.
     - Was sich an Ort und Stelle ändern muss (Schalter, Status, Chip,
       Fortschritt, Suche), bekommt Methoden am Knoten (.setzen …), damit
       Seiten nicht neu aufbauen müssen – Neuaufbau zerstört Fokus und
       spielt Übergänge nicht. Wo doch neu gezeichnet wird, gleicht
       UI.abgleichen (DS.dom.morphChildren) den Bestand ab, statt zu leeren.
     - Sichtbare Texte Schweizer Hochdeutsch; Leerwert «–».
     - Tooltips: Bauer setzen data-tip (DS.overlay.tooltips zeigt ihn, von
       rahmen.js einmal je Seite gestartet). Ein Tooltip, der nur den
       sichtbaren Text wiederholt (gekürzte Namen, Chips), zeigt
       Dashboard-Style nur, solange der Text wirklich abgeschnitten ist.
       Nie ein Browser-title.
     - Drückbare ICT-Bausteine (Chip mit ×, Listenzeile, Verteilungszeile,
       klickbare Kennwerte) tragen data-ds-ripple: DS.ripple (von rahmen.js
       einmal je Seite gestartet) gibt ihnen die Welle und .ds-pressed,
       bausteine.css die Zustandsebene im Druckmodell von Dashboard-Style.

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
     UI.abgleichen(behaelter, [knoten…], { ersetzen, reihenfolgeHalten,
                   beiEinfuegen(knoten), beiEntfernen(knoten) → Promise? }) → behaelter
                                        = DS.dom.morphChildren: die Kinder werden den neu
                                        gebauten Knoten angeglichen, bleibende Knoten an Ort
                                        und Stelle gepatcht (Fokus, Laufzeitklassen und
                                        Zuhörer bleiben; darum Zuhörer am Behälter oder
                                        data-ds-replace). Schlüssel: data-ds-key, sonst id.
                                        Nimmt auch das Optionsobjekt von Bewegung.umordnen
                                        unverändert (holdOrder, onInsert, onRemove).
     UI.kinderAbgleichen(behaelter, [knoten…]) → behaelter
                                        Kinder auf eine Teilfolge DERSELBEN Knoten bringen,
                                        ohne bleibende zu bewegen (Fokus bleibt; Filter über
                                        einer festen Grundliste)

   Für alle Bauer von Bedienelementen (knopf, chip, kachel, listenZeile,
   eingabe, schalter, Einträge von kennwerte/verteilung, leerzustand.aktion):
     fokus: 'schluessel'  setzt data-fokus – damit finden F.zeichneBereich,
                          Rahmen.stillZeichnen und der Rückfokus der Ebenen das
                          neu gebaute Element wieder (jedes Bedienelement ohne id).

   Sinnbilder (EIN Set aus DS.icons, Lucide-Stil, siehe SINNBILDER unten)
     UI.sinnbild(name, groesse = 20, klasse?) → <svg class="icon …" aria-hidden>
     UI.SINNBILDER                    → { deutscher Name: Glyphe in DS.icons } (eingefroren)
       Grössen: 20 Navigation/Icon-Knöpfe/Banner, 16 in Knöpfen/Status-Chips/
       Listen, 18 in Chips (führendes Sinnbild, Haken, ×), 24 Leerzustand.

   Knöpfe
     UI.knopf({ text, variante: 'primaer'|'tonal'|'leise'|'still'|'scheibe'|'sinnbild',
                sinnbild, klein, weiter, titel, label, beiKlick, typ = 'button',
                id, href, gedrueckt, deaktiviert, gesperrt, fokus, klasse,
                beschaeftigt, fertig })  → button | a  (.ds-btn)
       variante 'sinnbild' (oder sinnbild ohne text) = runder Icon-Knopf;
       'scheibe' (.ds-btn--disc, mit sinnbild ohne text) = runder Icon-Knopf,
       hinter dessen Sinnbild beim Hover eine volle Scheibe einblendet;
       label/titel werden aria-label. titel = Tooltip (data-tip).
       weiter: true hängt einen Pfeil an (er bewegt sich beim Hover nicht).
       gesperrt: 'Grund' = gesperrt MIT Grund (aria-disabled, fokussierbar,
       der Tooltip nennt den Grund statt titel); deaktiviert = disabled ohne Grund.
       beschaeftigt: 'Wird gespeichert …' (oder true) baut die Gesichter von
       DS.motion.busy schon beim Bauen (.ds-btn__faces): der Knopf ist von
       Anfang an so breit wie sein breitestes Gesicht und springt nie.
       fertig: 'Gespeichert' dazu das Erfolgsgesicht (Häkchen + Text).
       Beispiel: UI.knopf({ text: 'Speichern', variante: 'primaer', beiKlick: speichern })
     UI.knopfText(knopf, text)        Beschriftung ändern; Icon, Gesichter und
                                      ein laufender Spinner bleiben.
     UI.knopfSperren(knopf, grund|'') → knopf
       Sperre mit Grund an Ort und Stelle setzen bzw. aufheben ('' hebt auf,
       der frühere Tooltip kehrt zurück). Darf bei jedem Tastendruck laufen.
     UI.knopfUebernehmen(alt, neu) → boolean
       Der stehende Knopf «alt» übernimmt den beiKlick-Handler von «neu»
       (F.seitenkopf); false, wenn «neu» ohne beiKlick gebaut wurde.
     UI.beschaeftigt(knopf, arbeit, { text = 'Wird gespeichert …', fertig }) → Promise<Ergebnis>
       = DS.motion.busy: arbeit ist eine Funktion (→ Promise) oder ein
       Promise. aria-busy sofort (Klick, Enter und Leertaste sperrt die
       Wache von Dashboard-Style, DS.motion.guard; der Fokus
       bleibt), das Gesicht mit Spinner und text erst nach --ds-delay-loader
       und dann mindestens --ds-hold-loader; mit fertig: 'Gespeichert'
       danach das Erfolgsgesicht für --ds-hold-success. Texte zeigen die
       Gesichter nur, wenn UI.knopf sie gebaut hat (beschaeftigt, fertig);
       an einem Knopf ohne Gesichter entstehen sie beim Start nur mit
       Spinner bzw. Häkchen, damit er nicht breiter wird. Scheitert die
       Arbeit, ist der Knopf sofort wieder frei und das Promise wird mit dem
       Fehler verworfen. Schliesst beim Start offene Fehlermeldungen
       (UI.meldungenFehlerSchliessen, falls rahmen.js sie anbietet). Das
       Ergebnis meldet die Seite selbst (UI.meldung).

   Status, Hinweise
     UI.status(text, ton = 'neutral', { sinnbild, titel, klasse }) → span.ds-status
       ton: 'erfolg' | 'warnung' | 'gefahr' | 'neutral' | 'laeuft' (Spinner)
            | 'wartet' (Uhr) | 'aus' (Verbot). Standard-Sinnbilder: erfolg=check, warnung und
            gefahr=achtung (Dreieck), neutral=info. sinnbild: Name oder false
            (nur wo der Text allein eindeutig ist). titel: Tooltip; der Chip
            wird dann ein Tabstopp (Tooltip auch per Tastatur).
       .setzen(text, ton, optionen) aktualisiert an Ort und Stelle: Farbe und
       Sinnbild gleiten (status.css), ein laufender Spinner dreht weiter.
     UI.banner({ titel, text, ton, knopf: Knoten|Knoten[], rolle, sinnbild }) → div.ds-alert
       ton: 'info' (Standard, neutral) | 'erfolg' | 'warnung' | 'gefahr'.
       titel wird als <strong> vorangestellt. .textKnoten = div.ds-alert__text.
       rolle: Standard 'alert' für gefahr, sonst 'status'; null = keine
       (ein Hinweis, der mit der Seite steht und nicht angesagt werden soll).
       Knöpfe werden kompakt (.ds-btn--sm). Kommen und Gehen eines Banners
       über Bewegung.umordnen (flip) auf seinem Stapel.
     UI.leerzustand({ sinnbild = 'info', titel, text, aktion: { text, beiKlick, href,
                      variante = 'tonal', sinnbild, fokus } | Knoten, rolle })  → div.ds-empty
     UI.hinweis(text) → p.ds-muted      UI.meta(text) → p.ds-meta
     UI.teile([text|Knoten, …]) → span.ds-parts (Teile mit «·»; leere fallen weg)

   Laden (Ladeanzeigen erscheinen erst nach --ds-delay-loader)
     UI.spinner(klein?, { verzoegert }) → span.ds-spinner[.ds-spinner--sm]
       Der Bogen-Spinner hat keine eigene Verzögerung: in .ds-loading, einem
       Knopf oder einem Status-Chip wartet der Behälter; frei stehend mit
       verzoegert: true (Hülle span.ds-enter.ds-enter--delayed).
     UI.ladezeile(text = 'Wird geladen …') → div.ds-loading (Formen-Loader .ds-loader--sm)
     UI.skelettSeite({ karten = 2, text = 'Wird geladen …', kopf = true }) → div.ds-skeleton
       role=status; erscheint verzögert, dann läuft eine ruhige Welle.

   Karten, Kacheln
     UI.karte({ titel, unter, aktionen: [Knoten], fuss: [Knoten], sinnbild, breit,
                gefuellt, ebene = 2, href, beiKlick, fokus, marke, klasse, id }) → section.ds-card
                mit .inhalt (div.karte-inhalt), .kopf, .aktionen (div.karte-kopf-aktionen
                | null), .fuss (div.ds-card__links | null: Fusszeile unter einer
                Haarlinie; im Kartenraster unten bündig). sinnbild: 20 px vor dem Titel.
       href und/oder beiKlick: die ganze Karte öffnet etwas (.ds-card--interactive
       von Dashboard-Style in der Form mit .ds-card__action): der Titel wird
       der Link (href) bzw. Knopf, seine Fläche spannt sich über die Karte,
       Aktionen und Links darin bleiben bedienbar. fokus gilt dem Titel.
       marke: UI.zahlmarke(…) vor dem Titel, über Titel und Beschreibung
       (.karte-marke; die Punkte des Handlungsbedarfs).
     UI.kachel({ text, wert, unter, ton, sinnbild, beiKlick, href, zahl, schluessel, titel,
                 fokus, klasse })
       → div|button|a.ds-tile. Leerer Wert = «–». ton ('erfolg'|'warnung'|
       'gefahr') setzt ein Icon in die Beschriftung, nie Farbe auf die Zahl.
       zahl (Number): Rohwert fürs Hochzählen beim ersten Zeigen (gemerkt
       am Knoten, nie im Markup); es zählt im Format von wert.
       schluessel: data-ds-key der Kachel; mit zahl zählt sie nach einem
       stillen Neuzeichnen (Bewegung.kennzahlenStill) vom gezeigten Wert.
     UI.kacheln([kachel, …]) → div.ds-tiles

   Datenzeilen
     UI.datenzeilen([zeile, …]) → dl.ds-facts.ds-facts--rows (nur Lesezeilen) bzw.
       div.ds-form.ds-form--rows (sobald ein Feld darin steht; Lesezeilen
       werden dort Felder mit .ds-field__value)
     UI.feldZeile(name, wert, { neben, gesperrt, hinweis }) → div > dt + dd
       wert: Text oder Knoten; leer → «–» (.ds-muted). gesperrt: .ds-lock
       nach dem Wert, mit Tooltip (hinweis oder Standardtext).
     UI.feldGesperrt(name, wert, hinweis?)   → Zeile mit Schloss
     UI.schloss(hinweis?) → span.ds-lock (role=img, Grund als Name und Tooltip)
     UI.formZeile(beschriftung, feldKnoten, { geaendert, hinweis, zusatz })
       → div.ds-field; die Beschriftung ist ein <label> für das (erste) Feld
       (bei einem Kästchen benennt sie die Gruppe); «(geändert)» für den
       Screenreader und der Punkt erscheinen nur mit .ds-field--changed.
     UI.formZeileGeaendert(zeile, an) → zeile   Punkt «geändert» an Ort und Stelle
     UI.kennwerte([[name, wert], …]) → ul.ds-kv-list   (Wert rechts, leer «–» leise)
     UI.kennwerte([{ name, wert, href, beiKlick, ton, titel, fokus }, …])
       → ul.ds-kv-list--interactive (Bestandskarte der Übersicht): Zeilen als
       Link/Knopf (.ds-kv-list__row) mit Zustandsebene und Welle, Null leise,
       ton 'warnung'|'gefahr' als .ds-kv-list__icon vor dem Wert, mit Wort für
       den Screenreader (nie Farbe auf der Zahl).
     UI.fakten([[name, wert|Knoten], …]) → dl.ds-facts

   Chips, Zähler
     UI.chip({ text, gewaehlt, beiKlick(gewaehlt, e), entfernen: fn, titel, label,
               sinnbild, href, id, deaktiviert, art: 'kaestchen'|'radio', name, wert,
               fokus, klasse })
       gewaehlt gesetzt = Filter-Umschalter: label.ds-chip von Dashboard-Style
       (input.ds-chip__input + .ds-chip__body mit Haken, der sich zeichnet).
       Ein Klick schaltet selbst um, beiKlick bekommt den neuen Zustand.
       art: 'radio' = genau einer der Gruppe ist gewählt (input[type=radio]
       mit name und wert; beiKlick nur am neu gewählten). id, fokus und
       deaktiviert gelten dem Kästchen; .eingabe = das Kästchen.
       entfernen = aktiver Filter mit × (button.chip, aria-label «Filter «…»
       entfernen»); sonst Aktions-Chip (button|a.chip). Beide ICT-eigen
       (Dashboard-Style hat nur Chips auf Kästchen), mit Welle und dem
       Druckmodell von Dashboard-Style; höchstens so breit wie ihre Zeile,
       ein langer Text endet mit «…» und der Tooltip zeigt ihn dann ganz.
       Alle: .setzen(gewaehlt), .istGewaehlt().
     UI.chips([chip, …], { legende }) → Reihe von Filter-Chips: mit legende
       eine Gruppe (fieldset.ds-chips von Dashboard-Style mit legend.ds-sr),
       sonst div.ds-chips, sobald ein Umschalt-Chip oder eine Gruppe darin
       steht. Jede andere Reihe (Status-Chips, Chips mit ×, Links) ist
       div.chip-zeile (ICT); ohne Chip nimmt sie keinen Platz.
     UI.zaehler(zahl, still?) → span.zaehler (.setzen(zahl))
       leer (null/"") = verborgen; .setzen von leer auf eine Zahl ploppt
       einmal, Wert → Wert ohne Bewegung.

   Formulare
     UI.eingabe({ art: 'text'|'zahl'|'datum'|'textbereich'|'auswahl'|'suche'|'mail'|'telefon',
                  id, name, wert, platzhalter, label (aria), werte: [text | [wert, text] |
                  { wert, text }] (auswahl), leer: 'Text der Leeroption' (auswahl),
                  vorschlaege: [texte] (datalist, bei jedem Aufruf aktualisiert), schmal,
                  gefuellt, zeilen, min, max, schritt, maxLaenge, pflicht, nurLesen,
                  gesperrt, klasse, beiEingabe(wert, feld), beiAenderung(wert, feld) })
       → input | select | textarea.ds-input. Eine Auswahl behält einen
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
       .setzen(schluessel, bauen() → Knoten, { ausEingabe }) – Hinweis, der am
       Getippten hängt: gebaut nur bei neuem Schlüssel, '' = leer und verborgen;
       mit ausEingabe kommt und geht er über FLIP auf seinem Stapel (darunter
       gleitet, er blendet ein), sonst ruhig; Fokus bleibt.
       .schluessel() → der gezeigte Schlüssel (steht am Knoten).
     UI.ankreuzen({ text, an, beiAenderung(an, kaestchen), id, name, wert,
                    art: 'checkbox'|'radio', gesperrt, klein, fokus }) → label.ds-check (.eingabe)
     UI.mehrfach({ legende, eintraege: [{ wert, text, zahl, an, gesperrt, fokus }], name,
                   fokus (Präfix: data-fokus «<fokus>-<wert>» je Kästchen),
                   beiAenderung(wert, an, gewaehlte) }) → fieldset.ds-field mit .mehrfach;
       .gewaehlt() → [werte], .setzen([werte]), .zahlenSetzen({ wert: zahl })
       (an Ort und Stelle, der Fokus bleibt).
     UI.zahlText(n, nachkomma?) → «1’284», «7.5» (de-CH; ohne nachkomma höchstens
       eine Nachkommastelle, sonst genau so viele; Zahlen als Text gehen auch;
       leer → ""). Hilfe.zahlText (graph.js) führt hierher zurück.
     UI.zeitText(datum|iso) → «12.10.2026, 14.05» (Uhrzeit mit Punkt; ungültig → "")

   Suche, Schalter
     UI.suchfeld({ id, name, platzhalter, wert, label, kuerzel: '/', verzoegerung = 150,
                   beiEingabe(wert, feld), klasse }) → div.ds-search
       .eingabe (input), .wert(), .setzen(wert) (schreibt nie, während
       getippt wird), .sofort() (wartende Eingabe sofort melden).
       Esc in einer gefüllten Suche leert sie und meldet das sofort
       (preventDefault: die Seite und DS.overlay behandeln dieses Esc nicht mehr).
     UI.schalter({ an, gesperrt, deaktiviert, label, titel, beiWechsel(an, schalter), id,
                   fokus, klasse }) → label.ds-switch (Schalter von Dashboard-Style)
       mit input[type=checkbox][role=switch] (.eingabe; id und fokus gelten
       ihm). Ein Klick schaltet an Ort und Stelle um (der Griff gleitet);
       beiWechsel → false oder Promise(false)/Fehler setzt zurück.
       .setzen(an, gesperrt?, titel?), .sperren(bool), .istAn(),
       .istGesperrt(). Gesperrt = an + Schloss im Griff + aria-disabled
       (fokussierbar, Tooltip nennt den Grund; ICT-eigen, .schalter-gesperrt);
       deaktiviert = aria-disabled im gesperrten Aussehen von Dashboard-
       Style, ebenfalls fokussierbar. Feuert «schalterwechsel».
     UI.schalterZeile({ schalter | an/gesperrt/titel/beiWechsel, name, unter,
                        wort: true | { an, aus, gesperrt }, zusatz: [Knoten], kompakt })
       → div.schalter-zeile (kompakt: der Schalter selbst mit .schalter-feld);
       Name = .ds-switch__label (benennt das Kästchen), Zustandswort
       «Aktiv»/«Inaktiv» als .ds-switch__state mit beiden Wörtern
       (Dashboard-Style blendet über; gesperrt ebenfalls «Aktiv», das
       Schloss im Griff zeigt die Sperre). .schalter, .zusatz.

   Tabellen
     UI.tabelle(kopfzeilen, datenzeilen, { beschriftung, klasse }) → div.ds-table-wrap
       (kopfzeilen: Texte oder { text, zahl, klasse }; Zellen Text oder Knoten;
       leer «–»; .tabelle = das table; die Randblende beim seitlichen Rollen
       kommt von Dashboard-Style)
     UI.tabellenKopf([{ schluessel, text, sortierbar = true, zahl, klasse, titel }],
                     { sortiert, richtung: 'auf'|'ab', beiSortieren(schluessel, knopf) }) → thead
       aria-sort an allen sortierbaren th; .sortierungSetzen(schluessel, richtung).
       Der Pfeil (.ds-table__sort-arrow) steht nur an der sortierten Spalte;
       «ab» dreht ihn über aria-sort am th auf der Feder statt zu springen.
     UI.tabellenRahmen(table, { id, klasse }) → div.ds-table-wrap.ds-table-wrap--fill.tabelle-rahmen
       Liste über die ganze Seite (Dashboard-Style: eigener Scroller, Kopf
       klebt, table bekommt .ds-table--pin-first, die erste Spalte klebt;
       Kanten über DS.dom.scrollEdges). Ist table .ds-table--interactive (je
       Zeile ein a.ds-table__row-link), öffnet auch ein Klick in eine Zelle
       ohne eigenes Bedienelement den Zeilenlink (DS.ripple: schlicht über
       den Link selbst, Ctrl-, Shift- und Mittelklick in einem neuen Tab,
       mit markiertem Text nicht), und die Welle läuft über die ganze Zeile.
     UI.rollKanten(element) → element; setzt data-gerollt-x / data-gerollt beim Rollen
       und data-mehr-rechts, solange rechts noch Inhalt liegt (auch nach Grössenwechseln),
       dazu --rollleiste (Breite einer senkrechten Rollleiste; die Blende lässt sie aus).
       Für ICT-eigene Roller (.tabelle-rahmen, der Zeitstrahl); .ds-table-wrap
       blendet Dashboard-Style selbst aus. Ein erneuter Aufruf prüft die Kanten
       nur neu: nach UI.abgleichen für jeden behaltenen Roller nötig (der
       Abgleich gleicht seine Attribute der losgelösten Vorlage an).

   Listen
     UI.hinweisZeile({ ton: 'gefahr'|'warnung'|'info'|'erfolg', titel, text, sinnbild })
       → div.ds-alert.ds-alert--plain (ein Befund in einer Karte)
     UI.hinweise([zeile, …]) → div.hinweise
     UI.listenZeile({ titel, unter: Text|[Teile]|Knoten, href, beiKlick, aktionen: [Knöpfe],
                      status: Knoten|[Knoten], aktuell, sinnbild, titelTipp, fokus, klasse })
       → li.ds-list__item; mit href/beiKlick ist der Titel .ds-list__action
       (die ganze Zeile öffnet, mit Welle; Aktionen bleiben bedienbar).
     UI.zeilenliste([zeile, …]) → ul.ds-list (.ds-list--interactive, sobald eine
       Zeile öffnet)
     UI.zahlmarke(zahl, ton?: 'warnung'|'gefahr') → span.zahlmarke (32-px-Pille vor
       dem Titel einer Karte: UI.karte({ marke: UI.zahlmarke(3, 'gefahr') }))
     UI.zeitachse([{ titel, zeit: Text|Knoten, zeitSinnbild, text, still, zusatz: [Knoten],
                     aktionen: [Knöpfe], klasse }]) → ol.ds-timeline
       (zeitSinnbild: 16-px-Sinnbild vor der Meta-Zeile, z. B. 'sync' beim Abgleich)

   Diagramme
     UI.balken(anteil 0..1, ton?: 'still'|'warnung'|'gefahr') → div.balken (.setzen(anteil):
       der Balken gleitet auf --ds-ease-value)
     UI.saeulen([zahl | { wert, titel, hervorgehoben }], { max, hervorheben: index, label })
       → div.saeulen[role=img]
     UI.verteilung([{ text, zahl, anteil, titel, beiKlick, href, fokus }], { max, klasse })
       → ul.verteilung (Name · Zahl · Balken; klickbare Zeilen mit Zustandsebene und Welle)
     UI.fortschritt({ anteil, text, detail, unbestimmt, wartet, flach, label }) → div.ds-progress
       (.setzen({ … }) ändert nur, was sich ändert; --ds-progress steht auf
       .ds-progress, der Balken gleitet weiter. unbestimmt: zwei Segmente,
       aria-valuetext statt aria-valuenow; wartet: nur der Text; flach:
       ohne Welle, für dichte Zellen)
   ------------------------------------------------------------------ */

"use strict";

/* ==================================================================
   Bewegung – die deutsche Hülle um DS.motion und DS.indicator
   (vendor/dashboard-style/ds.js, Dashboard-Style 1.6.2). Jede Funktion
   reicht an genau eine Funktion von Dashboard-Style weiter; Zeiten,
   Kurven, Unterbrechung (ein späterer Aufruf übernimmt vom aktuellen
   Stand), inert und Fokus regelt Dashboard-Style. Hier stehen nur die
   deutschen Namen der Varianten, das Hochzählen in Schweizer Schreibweise
   und der erste Auftritt einer Ansicht (auftritt). Bewegung ist auf jedem
   Gerät gleich.

   Grundregeln:
     - Auftritte werden AUSDRÜCKLICH ausgelöst (erstes Zeigen einer Ansicht),
       nie von Zeichenfunktionen selbst. Aktualisierte Daten (Auto-
       Nachladen, BroadcastChannel) spielen nie einen Auftritt: sie gleichen
       ab (UI.abgleichen), gleiten (umordnen) und zählen vom gezeigten Wert.
     - Ladeanzeigen erscheinen erst nach --ds-delay-loader und bleiben dann
       mindestens --ds-hold-loader stehen (ladeAbwarten).

   API (Dashboard-Style rechts)
     Bewegung.eintreten(el, variante = '') → Promise                    = DS.motion.enter
       '' | 'blenden' | 'skalieren' | 'schieben' | 'tausch' | 'verzoegert' |
       'ploppen' | 'aufziehen' | 'aufrichten'
       (= '', fade, scale, slide, swap, delayed, pop, fill-x, fill-y)
       Hebt hidden und inert auf.
     Bewegung.austreten(el, variante = '', { dann = 'entfernen' | 'verbergen' | 'behalten', fokus })
       → Promise                                                         = DS.motion.leave
       '' | 'sinken' | 'skalieren' | 'schieben' | 'ploppen'
       (= '', sink, scale, slide, pop). Ein Fokus darin geht vorher auf
       fokus (Element oder Funktion), sonst zum Auslöser; das Element wird
       inert. dann: entfernen = remove, verbergen = hidden, behalten = bleibt
       unsichtbar und inert bis eintreten/abbrechen.
     Bewegung.abbrechen(el)                                              = DS.motion.cancel
     Bewegung.abgeschlossen(el, { zeit, ereignis, eigenschaft, uebergaenge, namen, unterbaum })
       → Promise                                                         = DS.motion.settled
       (ohne zeit rechnet Dashboard-Style die Frist selbst)
     Bewegung.aufdecken(el) → Promise   Inhalt ersetzt seinen Platzhalter:
       bricht Laufendes ab und spielt den Tausch-Eintritt (cancel + enter 'swap')
     Bewegung.auftritt(behaelter, { wurzel = true })   erstes Zeigen einer Ansicht:
       staffelt .karten, .ds-grid-2, .ds-stack, .ds-tiles, .zeilenliste
       (DS.motion.staggerOnce: nur beim ersten Mal, nur Sichtbares), zählt
       Kacheln hoch und zieht Balken auf (jedes Element nur einmal).
     Bewegung.hochzaehlen(el, ziel, { format, dauer, von }) → { cancel(), finished }
                                                                         = DS.motion.countUp
       zählt vom gezeigten Wert; Standardformat de-CH («1’284»).
     Bewegung.kennzahlenStill(wurzel, zeichnen) → Ergebnis von zeichnen()
       Stilles Neuzeichnen mit Kennzahlen: jede Kachel in wurzel, die mit
       schluessel und zahl gebaut ist (UI.kachel), zählt danach vom
       gezeigten Wert zum neuen, wenn sich ihre Zahl geändert hat; eine
       neue Kachel zeigt ihren Wert. Beim ersten Zeigen zählt auftritt.
     Bewegung.aufziehen(behaelter)   .balken-fuell und .saeule-fuell wachsen einmal
     Bewegung.ladeAbwarten(start, { element, verzoegerung, mindestens }) → Promise
                                                                         = DS.motion.settleLoader
       (mit element liest Dashboard-Style die Zeiten aus dessen Tokens)
     Bewegung.umordnen(behaelter, aendern(optionen), { eintraege, live, max, halten }) → Promise
                                                                         = DS.motion.flip
       Einträge gleiten an ihren neuen Platz, neue blenden ein, entfernte
       aus. aendern bekommt das Optionsobjekt von Dashboard-Style; es geht
       unverändert an UI.abgleichen: Bewegung.umordnen(liste, o => UI.abgleichen(liste, neu, o)).
       live: true hält eine Umordnung aus Abfragedaten an, solange Zeiger
       oder Fokus in der Liste sind (höchstens halten ms).
     Bewegung.wechseln(aktualisieren, { art = 'durchblenden' | 'vor' | 'zurueck' | 'behaelter', von })
       → Promise                                                         = DS.motion.transition
       Nur Navigation (Ansichtswechsel), nie Daten.
     Bewegung.indikator(spur, { aktiv, klasse, beobachten = true, name, zeigen }) → { aktualisieren(), zerstoeren() }
                                                                         = DS.indicator.createIndicator
       Die Pille folgt aria-current/-pressed/-selected/-checked selbst;
       aktualisieren() braucht es nur mit beobachten: false. zeigen (reveal):
       die Spur rollt den aktiven Eintrag selbst ins Bild.
     Bewegung.kachelZahlMerken(wertKnoten, ziel, wertText, schluessel)   nur für UI.kachel:
       merkt den Rohwert fürs Hochzählen (am Knoten bzw. je Schlüssel) und
       zählt im Format von wertText (Text davor und danach, Nachkommastellen).
   ================================================================== */

const Bewegung = (function () {

  if (typeof DS === "undefined" || !DS.motion || !DS.indicator || !DS.dom) {
    throw new Error("bausteine.js braucht vendor/dashboard-style/ds.js (vorher laden).");
  }
  const M = DS.motion;

  const EINTRITT_VARIANTEN = { blenden: "fade", skalieren: "scale", schieben: "slide", tausch: "swap",
    verzoegert: "delayed", ploppen: "pop", aufziehen: "fill-x", aufrichten: "fill-y" };
  const AUSTRITT_VARIANTEN = { sinken: "sink", skalieren: "scale", schieben: "slide", ploppen: "pop" };
  const DANACH = { entfernen: "remove", verbergen: "hide", behalten: "keep" };
  const WECHSEL_ARTEN = { durchblenden: "fade-through", vor: "forward", zurueck: "back", behaelter: "container" };

  /* Raster, deren Kinder beim ersten Zeigen gestaffelt einblenden. */
  const STAFFEL_RASTER = ".karten, .ds-grid-2, .ds-stack, .ds-tiles, .zeilenliste";

  const zahlFormate = new Map();

  /* de-CH mit genau «nachkomma» Stellen («1’284», «15.7»). */
  function zahlText(wert, nachkomma) {
    const n = nachkomma || 0;
    if (!zahlFormate.has(n)) {
      let f = null;
      try { f = new Intl.NumberFormat("de-CH", { minimumFractionDigits: n, maximumFractionDigits: n }); } catch (e) { f = null; }
      zahlFormate.set(n, f);
    }
    const f = zahlFormate.get(n);
    return f ? f.format(wert) : Number(wert).toFixed(n);
  }

  /* Format, in dem eine Kachel zählt: so wie ihr Wert gebaut wurde, mit
     dem Text davor und danach («88 %» zählt 88 und behält « %») und
     ebenso vielen Nachkommastellen («15.7 GB» endet nicht als «16 GB»). */
  function kachelFormat(wertText) {
    const t = String(wertText);
    const erste = t.search(/\d/);
    if (erste === -1) return function (n) { return zahlText(n); };
    const letzte = t.length - 1 - t.split("").reverse().join("").search(/\d/);
    const zahl = t.slice(erste, letzte + 1);
    const punkt = zahl.lastIndexOf(".");
    const nachkomma = punkt === -1 ? 0 : zahl.length - punkt - 1;
    const vor = t.slice(0, erste);
    const nach = t.slice(letzte + 1);
    return function (n) { return vor + zahlText(n, nachkomma) + nach; };
  }

  /* Nur gesetzte Optionen weitergeben: ein undefined überschriebe die
     Vorgabe von Dashboard-Style (etwa die selbst gerechnete Frist). */
  function optionen(paare) {
    const o = {};
    for (const k of Object.keys(paare)) if (paare[k] !== undefined) o[k] = paare[k];
    return o;
  }

  function eintreten(element, variante) {
    return M.enter(element, EINTRITT_VARIANTEN[variante] || "");
  }

  function austreten(element, variante, o) {
    const w = o || {};
    return M.leave(element, AUSTRITT_VARIANTEN[variante] || "",
      optionen({ then: DANACH[w.dann] || "remove", focus: w.fokus }));
  }

  function abbrechen(element) {
    if (element) M.cancel(element);
  }

  function abgeschlossen(element, o) {
    const w = o || {};
    return M.settled(element, optionen({
      timeout: w.zeit, event: w.ereignis, property: w.eigenschaft,
      transitions: w.uebergaenge, names: w.namen, subtree: w.unterbaum
    }));
  }

  function aufdecken(element) {
    if (!element) return Promise.resolve();
    M.cancel(element);
    return M.enter(element, "swap");
  }

  function hochzaehlen(element, ziel, o) {
    const w = o || {};
    return M.countUp(element, ziel, optionen({ format: w.format || zahlText, duration: w.dauer, from: w.von }));
  }

  function mitSelbst(behaelter, selektor) {
    if (!behaelter || !behaelter.querySelectorAll) return [];
    const liste = Array.from(behaelter.querySelectorAll(selektor));
    if (behaelter.matches && behaelter.matches(selektor)) liste.unshift(behaelter);
    return liste;
  }

  /* Kennzahlen der Kacheln (UI.kachel mit zahl). Beim ersten Zeigen zählt
     eine Kachel von 0 hoch (auftritt). Zeichnet die Seite still neu
     (kennzahlenStill), zählt eine Kachel mit Schlüssel, deren Zahl sich
     geändert hat, vom gezeigten Wert zum neuen – kein Sprung, kein
     Auftritt von 0. Die Rohwerte stehen am Knoten bzw. je Schlüssel, nie
     im Markup. */
  const kachelZahlen = new WeakMap();     // Wertknoten → { ziel, format } fürs erste Zeigen
  const gezeigteKennzahlen = new Map();   // Schlüssel → zuletzt gebaute Zahl
  let stillGezeigt = null;                // während kennzahlenStill: Schlüssel → gezeigte Zahl
  let stillOffen = [];                    // während kennzahlenStill: [{ schluessel, von, ziel, format }]

  function kachelZahlMerken(wertKnoten, ziel, wertText, schluessel) {
    const format = kachelFormat(wertText);
    if (schluessel) {
      const vorher = stillGezeigt ? stillGezeigt.get(schluessel) : undefined;
      gezeigteKennzahlen.set(schluessel, ziel);
      if (vorher !== undefined) {
        // Die Kachel steht schon da: kein erstes Zeigen, sondern nachzählen.
        if (vorher !== ziel) stillOffen.push({ schluessel: schluessel, von: vorher, ziel: ziel, format: format });
        return;
      }
    }
    kachelZahlen.set(wertKnoten, { ziel: ziel, format: format });
  }

  function zahlenHochzaehlen(behaelter) {
    for (const wert of mitSelbst(behaelter, ".ds-tile__value")) {
      const z = kachelZahlen.get(wert);
      if (!z) continue;
      kachelZahlen.delete(wert);   // nur beim ersten Zeigen
      hochzaehlen(wert, z.ziel, { format: z.format });
    }
  }

  function kennzahlenStill(wurzel, zeichnen) {
    const gezeigt = new Map();
    if (wurzel) {
      for (const t of wurzel.querySelectorAll(".ds-tile[data-ds-key]")) {
        const s = t.getAttribute("data-ds-key");
        if (gezeigteKennzahlen.has(s)) gezeigt.set(s, gezeigteKennzahlen.get(s));
      }
    }
    const aussen = [stillGezeigt, stillOffen];
    stillGezeigt = gezeigt;
    stillOffen = [];
    try {
      return zeichnen();
    } finally {
      const offen = stillOffen;
      stillGezeigt = aussen[0];
      stillOffen = aussen[1];
      for (const z of offen) {
        const wert = wurzel ? wurzel.querySelector('.ds-tile[data-ds-key="' + CSS.escape(z.schluessel) + '"] > .ds-tile__value') : null;
        if (wert) hochzaehlen(wert, z.ziel, { von: z.von, format: z.format });
      }
    }
  }

  /* Balken und Säulen wachsen nur beim ersten Zeigen ihres Elements. */
  const aufgezogen = new WeakSet();

  function aufziehen(behaelter) {
    for (const [selektor, variante] of [[".balken-fuell", "fill-x"], [".saeule-fuell", "fill-y"]]) {
      for (const f of mitSelbst(behaelter, selektor)) {
        if (aufgezogen.has(f)) continue;
        aufgezogen.add(f);
        M.enter(f, variante);
      }
    }
  }

  function auftritt(behaelter, o) {
    if (!behaelter) return;
    // Rahmen ruft den Auftritt für die ganze Ansicht auf und staffelt nur
    // die Raster DARIN; Seitenkopf, Banner und Werkzeugleiste erscheinen
    // mit der Ansicht selbst (wurzel: false).
    const mitWurzel = !o || o.wurzel !== false;
    const raster = mitWurzel ? mitSelbst(behaelter, STAFFEL_RASTER)
      : (behaelter.querySelectorAll ? Array.from(behaelter.querySelectorAll(STAFFEL_RASTER)) : []);
    // staggerOnce merkt sich jedes Raster (data-ds-staggered): ein zweiter
    // Auftritt derselben Ansicht staffelt nicht noch einmal.
    for (const r of raster) if (r.firstElementChild) M.staggerOnce(r);
    zahlenHochzaehlen(behaelter);
    aufziehen(behaelter);
  }

  function ladeAbwarten(start, o) {
    // Früher (start, jetzt): eine Zahl als zweites Argument gilt weiter.
    if (typeof o === "number") return M.settleLoader(start, o);
    const w = o || {};
    return M.settleLoader(start, optionen({ element: w.element, delay: w.verzoegerung, minVisible: w.mindestens }));
  }

  function umordnen(behaelter, aendern, o) {
    const w = o || {};
    return M.flip(behaelter, aendern, optionen({ items: w.eintraege, live: w.live, max: w.max, hold: w.halten }));
  }

  function wechseln(aktualisieren, o) {
    const w = o || {};
    return M.transition(aktualisieren, optionen({ type: WECHSEL_ARTEN[w.art] || "fade-through", from: w.von }));
  }

  function indikator(spur, o) {
    const w = o || {};
    const i = DS.indicator.createIndicator(spur, {
      active: w.aktiv, className: w.klasse || "", observe: w.beobachten !== false, name: w.name || "",
      reveal: !!w.zeigen
    });
    return {
      aktualisieren: function () { i.update(); },
      zerstoeren: function () { i.destroy(); }
    };
  }

  return Object.freeze({
    eintreten: eintreten,
    austreten: austreten,
    abbrechen: abbrechen,
    abgeschlossen: abgeschlossen,
    aufdecken: aufdecken,
    auftritt: auftritt,
    hochzaehlen: hochzaehlen,
    kennzahlenStill: kennzahlenStill,
    aufziehen: aufziehen,
    ladeAbwarten: ladeAbwarten,
    umordnen: umordnen,
    wechseln: wechseln,
    indikator: indikator,
    /* Nur für UI.kachel (siehe kachelZahlMerken). */
    kachelZahlMerken: kachelZahlMerken
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

  /* id eines Teils (Name, Hinweis) eines Bedienelements: abgeleitet von
     dessen id bzw. data-fokus, damit ein neu gebautes Element dieselben
     ids trägt wie das gezeigte – sonst ersetzte UI.abgleichen es bei jedem
     Neuzeichnen (aria-labelledby/-describedby wichen ab). Nur ohne beides
     eine laufende Nummer. */
  function teilId(steuer, teil) {
    const basis = steuer && (steuer.id || (steuer.getAttribute("data-fokus")
      ? "ui-" + steuer.getAttribute("data-fokus").replace(/\s+/g, "-") : ""));
    return basis ? basis + "-" + teil : id("ui-" + teil);
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

  /* Stilles Nachzeichnen (DS.dom.morphChildren): die Kinder des Behälters
     werden den neu gebauten, noch nicht eingehängten Knoten angeglichen.
     Bleibende Knoten werden an Ort und Stelle gepatcht statt ersetzt:
     Fokus, Schreibmarke, Laufzeitklassen von Dashboard-Style und Zuhörer
     bleiben, ein Status-Sinnbild spielt seinen Auftritt nicht noch einmal.
     Zuhörer darum am Behälter (Delegation) oder data-ds-replace auf dem
     Knoten, dessen Teilbaum frisch sein muss. Zeilen bekommen einen
     Schlüssel (data-ds-key, sonst gilt die id). Die Optionen nimmt es
     deutsch oder so, wie Bewegung.umordnen (DS.motion.flip) sie übergibt. */
  function abgleichen(behaelter, knoten, o) {
    if (!behaelter) return behaelter;
    const w = o || {};
    const ds = {};
    const replace = w.ersetzen !== undefined ? w.ersetzen : w.replace;
    const holdOrder = w.reihenfolgeHalten !== undefined ? w.reihenfolgeHalten : w.holdOrder;
    const onInsert = w.beiEinfuegen || w.onInsert;
    const onRemove = w.beiEntfernen || w.onRemove;
    if (replace !== undefined) ds.replace = !!replace;
    if (holdOrder !== undefined) ds.holdOrder = !!holdOrder;
    if (onInsert) ds.onInsert = onInsert;
    if (onRemove) ds.onRemove = onRemove;
    const liste = (knoten && knoten.nodeType ? [knoten] : Array.from(knoten || []))
      .filter(function (k) { return k !== null && k !== undefined && k !== false && k !== ""; })
      .map(function (k) { return typeof k === "string" ? document.createTextNode(k) : k; });
    DS.dom.morphChildren(behaelter, liste, ds);
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
    return DS.icons.iconElement(glyphe, groesse || 20, "icon" + (klasse ? " " + klasse : ""));
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

  const BESCHAEFTIGT_TEXT = "Wird gespeichert …";

  function knopf(optionen) {
    const o = optionen || {};
    const k = el(o.href ? "a" : "button");
    const klassen = ["ds-btn"];
    const nurSinnbild = o.variante === "sinnbild" || (!!o.sinnbild && istLeer(o.text));
    const variante = KNOPF_VARIANTEN[o.variante] || "";
    if (nurSinnbild) klassen.push("ds-btn--icon");
    // Ein Icon-Knopf ohne eigene Variante ist gedämpft (wie bisher knopf-sinnbild).
    if (variante) klassen.push(variante);
    else if (nurSinnbild) klassen.push("ds-btn--quiet");
    if (o.klein) klassen.push("ds-btn--sm");
    if (o.klasse) klassen.push(o.klasse);
    k.className = klassen.join(" ");

    if (o.href) k.href = o.href;
    else k.type = o.typ || "button";
    if (o.id) k.id = o.id;

    if (o.sinnbild) k.appendChild(sinnbild(o.sinnbild, nurSinnbild ? (o.klein ? 18 : 20) : 16));
    if (!istLeer(o.text)) {
      if (o.sinnbild || o.weiter) k.appendChild(el("span", null, o.text));
      else k.appendChild(document.createTextNode(String(o.text)));
    }
    if (o.weiter) k.appendChild(sinnbild("pfeilRechts", 16));
    if (o.beschaeftigt || o.fertig) {
      gesichterSichern(k, typeof o.beschaeftigt === "string" ? o.beschaeftigt : BESCHAEFTIGT_TEXT, o.fertig);
    }

    const name = o.label || (nurSinnbild ? o.titel : "");
    if (name) k.setAttribute("aria-label", name);
    if (o.titel) k.setAttribute("data-tip", o.titel);
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

  /* Gesperrt MIT Grund: aria-disabled statt disabled, damit der Knopf
     fokussierbar bleibt und der Tooltip den Grund nennt – auch per
     Tastatur. Klick, Enter und Leertaste sperrt die Wache von Dashboard-
     Style (DS.motion.guard, mit DS.ripple.attach gestartet). Ein leerer
     Grund hebt die Sperre auf; der frühere Tooltip (titel) kehrt zurück.
     An Ort und Stelle: aufrufbar bei jedem Tastendruck. */
  const freieTipps = new WeakMap();

  function tippSchreiben(k, t) {
    if (t) k.setAttribute("data-tip", t);
    else k.removeAttribute("data-tip");
  }

  function knopfSperren(k, grund) {
    if (!k) return k;
    const gesperrt = freieTipps.has(k);
    if (grund) {
      if (!gesperrt) freieTipps.set(k, k.getAttribute("data-tip") || "");
      if (k.getAttribute("aria-disabled") !== "true") k.setAttribute("aria-disabled", "true");
      if (k.getAttribute("data-tip") !== String(grund)) tippSchreiben(k, String(grund));
    } else if (gesperrt) {
      const frei = freieTipps.get(k);
      freieTipps.delete(k);
      k.removeAttribute("aria-disabled");
      if ((k.getAttribute("data-tip") || "") !== frei) tippSchreiben(k, frei);
    }
    return k;
  }

  /* data-fokus: der stabile Schlüssel, über den F.zeichneBereich,
     Rahmen.stillZeichnen und der Rückfokus der Ebenen ein neu gebautes
     Bedienelement wiederfinden. Jedes Bedienelement ohne id braucht einen. */
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

  /* Das Gesicht in Ruhe (die Beschriftung) eines Knopfs mit Gesichtern. */
  function ruheGesicht(k) {
    return k.querySelector(":scope > .ds-btn__faces > .ds-btn__face:not(.ds-btn__face--busy, .ds-btn__face--done)");
  }

  /* Ändert nur die Beschriftung; Icon, Gesichter und ein laufender
     Spinner bleiben. */
  function knopfText(k, neuerText) {
    if (!k) return k;
    const ziel = ruheGesicht(k) || k;
    const span = ziel.querySelector(":scope > span:not(.ds-sr, .zaehler, .ds-spinner, .ds-btn__faces, .ds-press-ripple)");
    if (span) textSetzen(span, neuerText);
    else if (!ziel.querySelector(":scope > svg, :scope > .zaehler")) textSetzen(ziel, neuerText);
    else {
      for (const n of Array.from(ziel.childNodes)) if (n.nodeType === 3) n.remove();
      const neu = el("span", null, neuerText);
      const zaehlerKnoten = ziel.querySelector(":scope > .zaehler");
      ziel.insertBefore(neu, zaehlerKnoten || ziel.querySelector(":scope > svg:last-child:not(:first-child)") || null);
    }
    return k;
  }

  /* --- Beschäftigt (DS.motion.busy) --- */

  /* Die Gesichter von DS.motion.busy (button.css «Faces»): die Beschriftung
     wandert in das Ruhegesicht, dazu das Gesicht mit Spinner und Text und,
     mit fertigText, das Erfolgsgesicht. Alle liegen in EINER Rasterzelle,
     der Knopf ist so breit wie das breiteste. Ein Icon-Knopf zeigt nur
     Spinner bzw. Häkchen. Steht das Gerüst schon, ändern sich nur die
     Texte, die gegeben sind (sonst bleibt der Text vom Bauen).
     spaet: das Gerüst entsteht erst beim Start der Arbeit (UI.beschaeftigt
     an einem Knopf ohne Gesichter). Dann tragen die neuen Gesichter nur
     Spinner bzw. Häkchen, ohne Text: ein Text verbreiterte den Knopf mitten
     im Klick. Gesichter mit Text baut UI.knopf({ beschaeftigt, fertig }). */
  function gesichterSichern(k, beschaeftigtText, fertigText, spaet) {
    const nurSinnbild = spaet || k.classList.contains("ds-btn--icon");
    let gesichter = k.querySelector(":scope > .ds-btn__faces");
    if (!gesichter) {
      const ruhe = el("span", "ds-btn__face");
      for (const n of Array.from(k.childNodes)) {
        // Welle und andere Knoten von Dashboard-Style bleiben am Knopf.
        if (n.nodeType === 1 && n.hasAttribute("data-ds-keep")) continue;
        ruhe.appendChild(n);
      }
      gesichter = el("span", "ds-btn__faces");
      gesichter.appendChild(ruhe);
      k.insertBefore(gesichter, k.firstChild);
    }
    let arbeit = gesichter.querySelector(":scope > .ds-btn__face--busy");
    if (!arbeit) {
      arbeit = el("span", "ds-btn__face ds-btn__face--busy");
      arbeit.setAttribute("aria-hidden", "true");
      arbeit.appendChild(spinner(true));
      if (!nurSinnbild) arbeit.appendChild(el("span", null, beschaeftigtText || BESCHAEFTIGT_TEXT));
      gesichter.appendChild(arbeit);
    } else if (beschaeftigtText) {
      const t = arbeit.querySelector(":scope > span:not(.ds-spinner)");
      if (t) textSetzen(t, beschaeftigtText);
    }
    if (fertigText) {
      let fertig = gesichter.querySelector(":scope > .ds-btn__face--done");
      if (!fertig) {
        fertig = el("span", "ds-btn__face ds-btn__face--done");
        fertig.setAttribute("aria-hidden", "true");
        fertig.appendChild(sinnbild("check", 16));
        if (!nurSinnbild) fertig.appendChild(el("span"));
        gesichter.appendChild(fertig);
      }
      const t = fertig.querySelector(":scope > span");
      if (t) textSetzen(t, fertigText);
    }
    return gesichter;
  }

  function beschaeftigt(k, arbeit, o) {
    const w = istOptionen(o) ? o : {};
    if (!k) return Promise.resolve(typeof arbeit === "function" ? arbeit() : arbeit);
    const fertigText = w.fertig || null;
    gesichterSichern(k, w.text, fertigText, true);
    if (typeof UI.meldungenFehlerSchliessen === "function") UI.meldungenFehlerSchliessen();
    // Das Erfolgsgesicht zeigt DS.motion.busy nur, wo der Knopf eines hat.
    return DS.motion.busy(k, arbeit);
  }


  /* ==================================================================
     Status-Chip
     ================================================================== */

  const STATUS_TOENE = {
    erfolg: "erfolg", warnung: "warnung", gefahr: "gefahr", neutral: "neutral", laeuft: "laeuft",
    wartet: "neutral", aus: "neutral"
  };

  /* Warnung UND Fehler tragen das Dreieck; die beiden unterscheiden
     Fläche und Text. Der Kreis (achtungKreis) gehört zu Bannern und
     Meldungen. */
  const STATUS_SINNBILDER = {
    erfolg: "check", warnung: "achtung", gefahr: "achtung", neutral: "info",
    wartet: "uhr", aus: "aus"
  };

  /* Töne → Modifikatoren von .ds-status; neutral hat keinen. */
  const STATUS_KLASSEN = { erfolg: "ds-status--ok", warnung: "ds-status--warning", gefahr: "ds-status--error", laeuft: "ds-status--running" };

  /* Klassen nur über classList: className überschriebe die Laufzeitklassen
     von Dashboard-Style (ds-enter*, ds-pressed). Die Farbe gleitet dann
     über --ds-dur-medium (status.css). */
  const eigeneStatusKlassen = new WeakMap();

  function statusSetzen(s, beschriftung, ton, optionen) {
    const o = optionen || {};
    const roh = ton || "neutral";
    const t = STATUS_TOENE[roh] || "neutral";
    s.classList.add("ds-status");
    for (const k of Object.keys(STATUS_KLASSEN)) s.classList.toggle(STATUS_KLASSEN[k], k === t);
    const alteKlassen = eigeneStatusKlassen.get(s) || [];
    const neueKlassen = o.klasse ? String(o.klasse).split(/\s+/).filter(Boolean) : [];
    for (const k of alteKlassen) if (neueKlassen.indexOf(k) === -1) s.classList.remove(k);
    for (const k of neueKlassen) s.classList.add(k);
    eigeneStatusKlassen.set(s, neueKlassen);

    // Das Symbol nur tauschen, wenn es sich ändert: ein laufender Spinner
    // dreht weiter. Ein neues Sinnbild blendet über @starting-style ein.
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
    // der Tastatur sofort, sonst wäre er nur mit der Maus zu lesen.
    if (o.titel) {
      s.setAttribute("data-tip", o.titel);
      s.tabIndex = 0;
    } else if (o.titel !== undefined) {
      s.removeAttribute("data-tip");
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

  /* Banner (.ds-alert): role=alert für Fehler, sonst status (alert.css);
     rolle: null lässt die Rolle weg. Die Aktion ist ein kompakter Knopf
     (.ds-btn--sm), den Dashboard-Style über und unter die Textzeile ragen
     lässt; mehrere stehen in .banner-knoepfe. */
  function banner(optionen) {
    const o = optionen || {};
    const t = BANNER_TOENE[o.ton] || "info";
    const b = el("div", "ds-alert" + (BANNER_KLASSEN[t] ? " " + BANNER_KLASSEN[t] : ""));
    const rolle = o.rolle === undefined ? (t === "gefahr" ? "alert" : "status") : o.rolle;
    if (rolle) b.setAttribute("role", rolle);
    b.appendChild(sinnbild(o.sinnbild || BANNER_SINNBILDER[t], 20));

    const textKnoten = el("div", "ds-alert__text");
    if (!istLeer(o.titel)) {
      textKnoten.appendChild(el("strong", null, o.titel));
      if (o.text) textKnoten.appendChild(document.createTextNode(" "));
    }
    if (o.text && (o.text.nodeType || Array.isArray(o.text))) anhaengen(textKnoten, o.text);
    else if (!istLeer(o.text)) textKnoten.appendChild(document.createTextNode(String(o.text)));
    b.appendChild(textKnoten);

    const knoepfe = (Array.isArray(o.knopf) ? o.knopf : [o.knopf]).filter(Boolean);
    for (const k of knoepfe) if (k.classList && k.classList.contains("ds-btn")) k.classList.add("ds-btn--sm");
    if (Array.isArray(o.knopf)) {
      if (knoepfe.length) b.appendChild(anhaengen(el("div", "banner-knoepfe"), knoepfe));
    } else if (o.knopf) {
      b.appendChild(o.knopf);
    }
    b.textKnoten = textKnoten;
    return b;
  }

  function leerzustand(optionen) {
    const o = optionen || {};
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

  /* Bogen-Spinner für Zeilen, Zellen und Knöpfe. Er hat keine eigene
     Verzögerung: frei stehend wartet er mit verzoegert in einer Hülle
     .ds-enter--delayed (nie .ds-enter auf dem Spinner selbst, das ersetzte
     seine Schleife). */
  function spinner(klein, o) {
    const s = el("span", "ds-spinner" + (klein ? " ds-spinner--sm" : ""));
    s.setAttribute("aria-hidden", "true");
    if (!o || !o.verzoegert) return s;
    const huelle = el("span", "ds-enter ds-enter--delayed");
    huelle.appendChild(s);
    return huelle;
  }

  /* Ladezeile mit dem Formen-Loader (Block-Loader von Dashboard-Style). */
  function ladezeile(beschriftung) {
    const z = el("div", "ds-loading");
    z.setAttribute("role", "status");
    const loader = el("span", "ds-loader ds-loader--sm");
    loader.setAttribute("aria-hidden", "true");
    z.appendChild(loader);
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

  function karte(optionen) {
    const o = optionen || {};
    const offen = !istLeer(o.titel) && !!(o.href || o.beiKlick);
    const k = el("section", "ds-card"
      + (offen ? " ds-card--interactive" : "") + (o.marke ? " karte-marke" : "")
      + (o.breit ? " karte-breit" : "") + (o.gefuellt ? " ds-card--filled" : "")
      + (o.klasse ? " " + o.klasse : ""));
    if (o.id) k.id = o.id;
    k.kopf = null;
    k.aktionen = null;
    k.unter = null;

    const aktionen = (o.aktionen || []).filter(Boolean);
    if (!istLeer(o.titel) || aktionen.length) {
      const kopf = el("div", "ds-card__row");
      if (o.marke) kopf.appendChild(o.marke);
      if (!istLeer(o.titel)) {
        const h = el("h" + (o.ebene || 2), "ds-card__title");
        // Sinnbild vor dem Titel (Bestandskarten der Übersicht).
        if (o.sinnbild) h.appendChild(sinnbild(o.sinnbild, 20));
        if (offen) {
          // Die Form mit .ds-card__action: ihre Fläche (::after) spannt sich
          // über die Karte, die übrigen Bedienelemente bleiben darüber.
          const ziel = el(o.href ? "a" : "button", "ds-card__action", o.titel);
          if (o.href) ziel.href = o.href;
          else ziel.type = "button";
          if (o.beiKlick) ziel.addEventListener("click", o.beiKlick);
          fokusSetzen(ziel, o.fokus);
          h.appendChild(ziel);
        } else {
          h.appendChild(document.createTextNode(String(o.titel)));
        }
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

  function kachel(optionen) {
    const o = optionen || {};
    const tag = o.href ? "a" : (o.beiKlick ? "button" : "div");
    const k = el(tag, "ds-tile" + (o.klasse ? " " + o.klasse : ""));
    if (tag === "button") k.type = "button";
    if (o.href) k.href = o.href;
    if (o.beiKlick) k.addEventListener("click", o.beiKlick);
    if (o.titel) {
      k.setAttribute("data-tip", o.titel);
      if (tag === "div") k.tabIndex = 0;   // Tooltip auch per Tastatur
    }
    fokusSetzen(k, o.fokus);
    if (!istLeer(o.schluessel)) k.setAttribute("data-ds-key", String(o.schluessel));

    // Spans statt p: in button und a ist nur Phrasierungsinhalt erlaubt.
    const beschriftung = el("span", "ds-tile__label");
    const symbol = o.sinnbild || KACHEL_SINNBILDER[o.ton];
    if (symbol) beschriftung.appendChild(sinnbild(symbol, 20, KACHEL_SINNBILDER[o.ton] ? "t-" + o.ton : ""));
    beschriftung.appendChild(el("span", null, o.text));
    k.appendChild(beschriftung);

    const leer = istLeer(o.wert);
    const wert = el("span", "ds-tile__value" + (leer ? " leer" : ""), leer ? "–" : String(o.wert));
    // Der Rohwert fürs Hochzählen (Bewegung.auftritt beim ersten Zeigen,
    // Bewegung.kennzahlenStill danach); «88 %» zählt 88 und behält « %».
    if (!leer && typeof o.zahl === "number" && isFinite(o.zahl)) {
      Bewegung.kachelZahlMerken(wert, o.zahl, String(o.wert), istLeer(o.schluessel) ? "" : String(o.schluessel));
    }
    k.appendChild(wert);

    if (o.unter && o.unter.nodeType) k.appendChild(anhaengen(el("span", "ds-tile__note"), o.unter));
    else if (!istLeer(o.unter)) k.appendChild(el("span", "ds-tile__note", o.unter));
    return k;
  }

  function kacheln(liste) { return anhaengen(el("div", "ds-tiles"), liste || []); }


  /* ==================================================================
     Datenzeilen
     Lesen: .ds-facts--rows von Dashboard-Style (Name in einer Spalte von
     36 %, Wert daneben, Haarlinien; unter 520 px Inhalt der Name über dem
     Wert). Bearbeiten: .ds-form--rows (Beschriftung über dem Feld, der
     Punkt «geändert» über .ds-field--changed). Ein Wert aus dem Abgleich
     trägt das Schloss .ds-lock.
     ================================================================== */

  const SCHLOSS_TEXT = "Vom Abgleich gesetzt.";

  /* Schloss (.ds-lock): role=img mit dem Grund als Name und Tooltip; kein
     Tabstopp (ein Antippen zeigt den Tooltip). */
  function schloss(hinweisText) {
    const t = hinweisText || SCHLOSS_TEXT;
    const s = el("span", "ds-lock");
    s.setAttribute("role", "img");
    s.setAttribute("aria-label", "Gesperrt: " + t);
    s.setAttribute("data-tip", t);
    s.appendChild(sinnbild("schloss", 16));
    return s;
  }

  /* Der Wert einer Lesezeile, leer «–» (leise). */
  function wertFuellen(behaelter, wert, o) {
    if (wert && (wert.nodeType || Array.isArray(wert))) anhaengen(behaelter, wert);
    else if (istLeer(wert)) behaelter.appendChild(el("span", "ds-muted", "–"));
    else behaelter.appendChild(document.createTextNode(String(wert)));
    if (!istLeer(o.neben)) behaelter.appendChild(el("span", "datenzeile-neben", o.neben));
    if (o.gesperrt) behaelter.appendChild(schloss(o.hinweis));
    return behaelter;
  }

  /* Eine Lesezeile ist zunächst ein Fakt (div > dt + dd). Steht sie in
     einer Liste mit Feldern (UI.datenzeilen), wird sie dort zum Feld mit
     .ds-field__value (role=group, die Beschriftung benennt es). */
  function feldZeile(name, wert, optionen) {
    const o = optionen || {};
    const z = el("div", "datenzeile");
    const dt = el("dt", null, name);
    const dd = wertFuellen(el("dd"), wert, o);
    anhaengen(z, [dt, dd]);
    z.alsFeld = function () {
      const f = el("div", "ds-field datenzeile");
      const nameId = id("ui-wert");
      const beschriftung = el("span", "ds-field__label", name);
      beschriftung.id = nameId;
      f.setAttribute("role", "group");
      f.setAttribute("aria-labelledby", nameId);
      const w = el("span", "ds-field__value");
      while (dd.firstChild) w.appendChild(dd.firstChild);
      anhaengen(f, [beschriftung, w]);
      for (const k of Array.from(z.attributes)) if (k.name !== "class") f.setAttribute(k.name, k.value);
      return f;
    };
    return z;
  }

  function feldGesperrt(name, wert, hinweisText) {
    return feldZeile(name, wert, { gesperrt: true, hinweis: hinweisText });
  }

  /* Liste der Zeilen: nur Lesezeilen → dl.ds-facts.ds-facts--rows; sobald
     ein Feld (UI.formZeile, F.feld) darin steht → div.ds-form.ds-form--rows,
     Lesezeilen darin als Feld mit Wert. */
  function datenzeilen(zeilen) {
    const liste = (zeilen || []).filter(Boolean);
    const formular = liste.some(function (z) { return z.classList && z.classList.contains("ds-field"); });
    if (!formular) return anhaengen(el("dl", "ds-facts ds-facts--rows datenzeilen"), liste);
    return anhaengen(el("div", "ds-form ds-form--rows datenzeilen"), liste.map(function (z) {
      return typeof z.alsFeld === "function" ? z.alsFeld() : z;
    }));
  }

  /* Ein Feld zum Bearbeiten (.ds-field in .ds-form--rows): Beschriftung
     (<label> für das erste Steuerelement) mit dem Punkt «geändert» und
     «(geändert)» für den Screenreader (.ds-field__changed, nur mit
     .ds-field--changed), darunter das Feld, der Hinweis (.ds-field__hint,
     aria-describedby) und ein Zusatz. Seiten schalten «geändert» mit
     UI.formZeileGeaendert(zeile, an). */
  function formZeile(beschriftung, feld, optionen) {
    const o = optionen || {};
    const z = el("div", "ds-field datenzeile");

    // Die Beschriftung ist das Label des (ersten) Felds.
    const steuer = feld && feld.matches
      ? (feld.matches("input, select, textarea") ? feld : feld.querySelector("input, select, textarea"))
      : null;
    const name = el(steuer && !steuer.closest(".ds-check") ? "label" : "span", "ds-field__label", beschriftung);
    if (steuer) {
      if (!steuer.id) steuer.id = teilId(steuer, "feld");
      if (name.tagName === "LABEL") name.htmlFor = steuer.id;
      else {
        name.id = teilId(steuer, "beschriftung");
        z.setAttribute("role", "group");
        z.setAttribute("aria-labelledby", name.id);
      }
    }
    name.appendChild(el("span", "ds-field__changed ds-sr", " (geändert)"));
    z.appendChild(name);

    if (feld) z.appendChild(feld);
    if (o.hinweis && o.hinweis.nodeType || !istLeer(o.hinweis)) {
      const h = el("p", "ds-field__hint");
      if (o.hinweis.nodeType) h.appendChild(o.hinweis);
      else h.textContent = String(o.hinweis);
      h.id = steuer ? teilId(steuer, "hinweis") : id("ui-hinweis");
      if (steuer) beschreibungHinzu(steuer, h.id);
      z.appendChild(h);
    }
    if (o.zusatz) z.appendChild(o.zusatz);
    formZeileGeaendert(z, !!o.geaendert);
    return z;
  }

  function formZeileGeaendert(zeile, an) {
    if (zeile && zeile.classList.contains("ds-field--changed") !== !!an) zeile.classList.toggle("ds-field--changed", !!an);
    return zeile;
  }

  /* Kennwerte: [[name, wert], …] → ul.ds-kv-list (Wert rechts, leer «–»
     leise: strong.ds-muted). Mit Objekten [{ name, wert, href, beiKlick,
     ton, titel, fokus }] die klickbare Fassung der Bestandskarte
     (Übersicht): .ds-kv-list--interactive, Zeilen mit Ziel sind Links bzw.
     Knöpfe (.ds-kv-list__row) mit Zustandsebene, Welle und Fokusring, der
     Wert steht rechts, eine Null leise. ton ('warnung'|'gefahr') setzt
     .ds-kv-list__icon vor den Wert und sagt dem Screenreader «zu prüfen»
     bzw. «dringend» – die Zahl wird nie gefärbt. titel = Tooltip; eine
     Zeile ohne Ziel wird damit ein Tabstopp. */
  function kennwerte(paare) {
    if ((paare || []).some(istOptionen)) return kennwerteKlickbar(paare);
    const liste = el("ul", "ds-kv-list");
    for (const p of paare || []) {
      const li = el("li");
      li.appendChild(el("span", null, p[0]));
      const leer = istLeer(p[1]) && !(p[1] && p[1].nodeType);
      const w = el("strong", leer ? "ds-muted" : null);
      if (p[1] && p[1].nodeType) w.appendChild(p[1]);
      else w.textContent = leer ? "–" : String(p[1]);
      li.appendChild(w);
      liste.appendChild(li);
    }
    return liste;
  }

  const KENNWERT_TOENE = { warnung: ["warning", "achtung", "zu prüfen"], gefahr: ["error", "achtung", "dringend"] };

  function kennwertZeile(e, tag) {
    const z = el(tag, "ds-kv-list__row");
    if (tag === "a") z.href = e.href;
    if (tag === "button") z.type = "button";
    if (e.beiKlick) z.addEventListener("click", e.beiKlick);
    fokusSetzen(z, e.fokus);
    if (e.titel) {
      z.setAttribute("data-tip", e.titel);
      if (tag === "div") z.tabIndex = 0;
    }
    return z;
  }

  function kennwerteKlickbar(eintraege) {
    const ul = el("ul", "ds-kv-list ds-kv-list--interactive");
    for (const e of eintraege) {
      if (!e) continue;
      const li = el("li");
      const z = kennwertZeile(e, e.href ? "a" : (e.beiKlick ? "button" : "div"));
      const leer = istLeer(e.wert);
      const still = leer || e.wert === 0 || e.wert === "0";
      const wert = el("strong", still ? "ds-muted" : null);
      const ton = KENNWERT_TOENE[e.ton];
      if (ton) {
        wert.appendChild(sinnbild(ton[1], 16, "ds-kv-list__icon ds-kv-list__icon--" + ton[0]));
        wert.appendChild(el("span", "ds-sr", ton[2] + ": "));
      }
      wert.appendChild(document.createTextNode(leer ? "–" : (typeof e.wert === "number" ? zahlFormat(e.wert) : String(e.wert))));
      anhaengen(z, [el("span", null, text(e.name)), wert]);
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

  /* Filter-Chip. Mit «gewaehlt» ein Umschalter: der Chip von Dashboard-
     Style auf einem Kästchen (label.ds-chip > input.ds-chip__input +
     .ds-chip__body mit dem Haken, der sich zeichnet, und dem Platz, der
     sich öffnet). Mit «entfernen» ein aktiver Filter mit ×, ohne beides
     ein Aktions-Chip: beide sind Knöpfe bzw. Links (button|a.chip), die
     es in Dashboard-Style nicht gibt. */
  function chip(a) {
    const o = istOptionen(a) ? a : { text: a };
    if (typeof o.entfernen !== "function" && o.gewaehlt !== undefined) return umschaltChip(o);
    const entfernbar = typeof o.entfernen === "function";
    const c = el(o.href ? "a" : "button", "chip" + (entfernbar ? " chip-entfernbar" : "") + (o.klasse ? " " + o.klasse : ""));
    if (o.href) c.href = o.href;
    else c.type = "button";
    if (o.id) c.id = o.id;
    c.setAttribute("data-ds-ripple", "");
    if (o.sinnbild) c.appendChild(sinnbild(o.sinnbild, 18));
    c.appendChild(el("span", "chip-text", o.text));
    if (entfernbar) {
      c.appendChild(sinnbild("schliessen", 18, "chip-x"));
      c.setAttribute("aria-label", o.label || ("Filter «" + text(o.text) + "» entfernen"));
      c.addEventListener("click", o.entfernen);
    } else if (o.label) {
      c.setAttribute("aria-label", o.label);
    }
    // Ein titel ist immer ein Tooltip; ohne titel zeigt der Chip seinen
    // eigenen Text nur, solange er mit «…» gekürzt ist.
    if (o.titel) c.setAttribute("data-tip", o.titel);
    else if (!istLeer(o.text)) c.setAttribute("data-tip", text(o.text));
    fokusSetzen(c, o.fokus);
    if (o.deaktiviert) {
      if (o.href) c.setAttribute("aria-disabled", "true");
      else c.disabled = true;
    }
    if (o.beiKlick) c.addEventListener("click", function (e) { o.beiKlick(undefined, e); });
    c.setzen = function () { return c; };
    c.istGewaehlt = function () { return false; };
    return c;
  }

  function umschaltChip(o) {
    const c = el("label", "ds-chip" + (o.klasse ? " " + o.klasse : ""));
    const k = el("input", "ds-chip__input");
    const radio = o.art === "radio";
    k.type = radio ? "radio" : "checkbox";
    if (o.name) k.name = o.name;
    if (o.wert !== undefined) k.value = text(o.wert);
    if (o.id) k.id = o.id;
    if (o.label) k.setAttribute("aria-label", o.label);
    fokusSetzen(k, o.fokus);
    k.checked = !!o.gewaehlt;
    if (o.deaktiviert) k.disabled = true;
    const koerper = el("span", "ds-chip__body");
    koerper.appendChild(sinnbild("check", 18, "ds-chip__check"));
    if (o.sinnbild) koerper.appendChild(sinnbild(o.sinnbild, 18));
    koerper.appendChild(el("span", null, o.text));
    anhaengen(c, [k, koerper]);
    if (o.titel) c.setAttribute("data-tip", o.titel);
    // Ein Radio meldet change nur am neu gewählten Chip (genau einer der
    // Gruppe ist gewählt; Dashboard-Style lässt beide Plätze zugleich gleiten).
    k.addEventListener("change", function (e) { if (o.beiKlick) o.beiKlick(k.checked, e); });
    c.eingabe = k;
    c.setzen = function (an) { k.checked = !!an; return c; };
    c.istGewaehlt = function () { return k.checked; };
    return c;
  }

  /* Eine Reihe von Filter-Chips ist .ds-chips von Dashboard-Style (DS.ripple
     lässt ihre Chips beim Umschalten gleiten): mit legende eine benannte
     Gruppe (fieldset mit legend.ds-sr), sonst div.ds-chips, sobald ein
     Umschalt-Chip (.ds-chip) oder eine Gruppe darin steht. Jede andere
     Reihe (Status-Chips, Links) ist keine Filtergruppe: div.chip-zeile
     (bausteine.css). */
  function chips(liste, o) {
    const w = o || {};
    const filter = (liste || []).some(function (k) {
      return !!k && !!k.classList && (k.classList.contains("ds-chip") || k.classList.contains("ds-chips"));
    });
    if (istLeer(w.legende)) return anhaengen(el("div", filter ? "ds-chips" : "chip-zeile"), liste || []);
    const gruppe = el("fieldset", "ds-chips");
    gruppe.appendChild(el("legend", "ds-sr", w.legende));
    return anhaengen(gruppe, liste || []);
  }

  /* Zahl-Plakette (Zähler an «Filter» und «Spalten»). Leer (null, "") ist
     sie verborgen. Erscheint sie (.setzen von leer auf eine Zahl), ploppt
     sie einmal (.6 → 1); ein neuer Wert ändert sich ohne Bewegung. Beim
     Bauen bleibt sie ruhig, weil ein Bauer auch beim Neuzeichnen läuft. */
  function zaehler(zahl, still) {
    const z = el("span", "zaehler" + (still ? " zaehler-still" : ""), zahl);
    z.setzen = function (n) {
      const warLeer = z.textContent === "";
      textSetzen(z, n);
      if (warLeer && z.textContent !== "") Bewegung.eintreten(z, "ploppen");
      return z;
    };
    return z;
  }


  /* ==================================================================
     Formularfelder
     ================================================================== */

  const EINGABE_TYPEN = { text: "text", zahl: "number", datum: "date", suche: "search", mail: "email", telefon: "tel" };

  /* Vorschlagslisten (<datalist>) liegen gesammelt in einem verborgenen
     Behälter. Jeder Aufruf aktualisiert die Liste: neue Werte (ein eben
     gespeicherter Standort) erscheinen sofort als Vorschlag. */
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
      if (!steuer.id) steuer.id = teilId(steuer, "feld");
      label.htmlFor = steuer.id;
    }
    f.appendChild(label);
    if (feldKnoten) f.appendChild(feldKnoten);
    if (!istLeer(o.hinweis)) {
      const h = el("p", "ds-field__hint", o.hinweis);
      h.id = steuer ? teilId(steuer, "hinweis") : id("ui-hinweis");
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

  /* Feldfehler: Fehlerrahmen, Meldung mit Icon unter dem Feld (nie in
     einem <label>), aria-invalid und aria-describedby; Dashboard-Style
     blendet die Meldung ein und öffnet ihr den Platz. Die erste Eingabe
     löscht ihn; "" löscht ausdrücklich. */
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
    m.appendChild(sinnbild("achtungKreis", 16));
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
     (.ds-field__hint, z. B. aus UI.feld/UI.formZeile) und verbirgt ihn
     ohne Text. Ein Sinnbild vorne legt Dashboard-Style neben die erste
     Zeile; ton 'erfolg' ist .ds-field__hint--success (Sinnbild in
     --ds-success, Text leise), ein anderer Ton färbt nur das Sinnbild. Den
     Fehlerfall zeigt UI.feldFehler. */
  function feldHinweis(knoten, inhalt, optionen) {
    if (!knoten) return knoten;
    const o = optionen || {};
    leeren(knoten);
    const erfolg = !!o.sinnbild && o.ton === "erfolg";
    knoten.classList.toggle("ds-field__hint--success", erfolg);
    if (o.sinnbild) knoten.appendChild(sinnbild(o.sinnbild, 16, o.ton && !erfolg ? "t-" + o.ton : ""));
    if (!istLeer(inhalt)) knoten.appendChild(el("span", null, inhalt));
    knoten.hidden = istLeer(inhalt);
    return knoten;
  }

  /* Platz für einen Hinweis, der am Getippten hängt (Banner unter einem
     Feld: «Name schon vergeben», «Diese Kurzwahl gibt es schon»).
     .setzen(schluessel, bauen, { ausEingabe }) baut nur, wenn sich der
     Schlüssel ändert: Tippen ohne neue Lage lässt den Hinweis stehen (kein
     Flackern, keine neue Ansage). Ein leerer Schlüssel leert und verbirgt
     ihn. ausEingabe: true – eine Eingabe hat ihn gebracht, geändert oder
     weggenommen: dann wie ein Banner, das kommt oder geht, über FLIP auf
     seinem Stapel (Dashboard-Style, Alert: DS.motion.flip; nie
     .ds-enter--swap pro Tastendruck). Stapel ist die Liste der Zeilen um
     seine .datenzeile (sonst sein Elternelement): was darunter steht,
     gleitet, der Hinweis blendet ohne Hub ein. Beim Neuzeichnen steht er
     ruhig da. Stand der Fokus darin, geht er auf das erste Bedienelement
     des neuen Inhalts, sonst auf das Feld seiner Zeile. Der Schlüssel
     steht am Knoten (data-hinweis-schluessel): ein Platz, den
     UI.abgleichen stehen lässt, übernimmt ihn mit dem Inhalt aus dem
     neuen Bau. */
  function hinweisPlatz(optionen) {
    const o = optionen || {};
    const p = el("div", "hinweis-platz" + (o.klasse ? " " + o.klasse : ""));
    if (o.id) p.id = o.id;
    p.hidden = true;
    const schluessel = function () { return p.getAttribute("data-hinweis-schluessel") || ""; };
    p.setzen = function (neu, bauen, optionenSetzen) {
      const s = text(neu);
      if (s === schluessel()) return p;
      const warLeer = !schluessel();
      if (s) p.setAttribute("data-hinweis-schluessel", s);
      else p.removeAttribute("data-hinweis-schluessel");
      const fokusDrin = p.contains(document.activeElement);
      let knoten = null;
      function fuellen() {
        leeren(p);
        p.hidden = !s;
        knoten = s && typeof bauen === "function" ? bauen() : null;
        if (knoten) anhaengen(p, knoten);
      }
      const zeile = p.closest(".datenzeile");
      const stapel = zeile && zeile.parentElement ? zeile.parentElement : p.parentElement;
      if (optionenSetzen && optionenSetzen.ausEingabe && stapel && p.isConnected) {
        // Verborgene Einträge zählen nicht: ein Platz, der direkt im Stapel
        // steht, ist beim Erscheinen neu (FLIP blendet ihn ein), nie ein
        // Eintrag, der von der Ecke oben links her gleitet.
        Bewegung.umordnen(stapel, fuellen, { eintraege: ":scope > :not([hidden])" });
        if (knoten && knoten.nodeType && warLeer && p.parentElement !== stapel) Bewegung.eintreten(knoten, "blenden");
      } else {
        fuellen();
      }
      if (fokusDrin) {
        const feldZeile = p.closest(".datenzeile, .ds-field");
        const ziel = p.querySelector("button, a[href]")
          || (feldZeile ? feldZeile.querySelector("input, select, textarea") : null);
        if (ziel) ziel.focus();
      }
      return p;
    };
    p.schluessel = schluessel;
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

  /* Gefüllte Pille mit der Lupe vorne. beiEingabe kommt verzögert (Standard 150 ms). setzen() schreibt nie in
     ein Feld, in dem gerade getippt wird (sonst sprängen Text und
     Schreibmarke); sofort() löst eine wartende Eingabe aus. */
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
       den Seiten (F.ereignisse) und DS.overlay (das ein Esc mit
       defaultPrevented übergeht), dass Esc erledigt ist: eine Suche in einem
       Blatt leert sich, das Blatt bleibt offen. Erst Esc in der leeren Suche
       geht weiter. */
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

  /* Schalter von Dashboard-Style (label.ds-switch > input[role=switch] +
     .ds-switch__track): der Griff gleitet und wächst auf der Feder, Halo
     und Fokusring kommen von dort. Ein Klick schaltet an Ort und Stelle
     um, dann kommt beiWechsel(an, schalter). Gibt beiWechsel false zurück
     oder ein Promise, das false liefert oder scheitert, springt der
     Schalter zurück.
     ICT-eigen ist nur die Sperre: gesperrt = an + Schloss im Griff +
     aria-disabled (fokussierbar, der Tooltip nennt den Grund: ein Wert aus
     dem Abgleich), deaktiviert = aria-disabled im gesperrten Aussehen.
     Beide bleiben fokussierbar (disabled verlöre Fokus und Tooltip); ihre
     Klick, Leertaste und Klick aufs Label sperrt die Wache von Dashboard-
     Style (DS.motion.guard) für aria-disabled. */
  function schalter(optionen) {
    const o = optionen || {};
    const s = el("label", "ds-switch" + (o.klasse ? " " + o.klasse : ""));
    const k = el("input");
    k.type = "checkbox";
    k.setAttribute("role", "switch");
    if (o.id) k.id = o.id;
    fokusSetzen(k, o.fokus);
    if (o.label) k.setAttribute("aria-label", o.label);
    const spur = el("span", "ds-switch__track");
    spur.setAttribute("aria-hidden", "true");
    const schlossKnoten = sinnbild("schloss", 12, "schalter-schloss");
    spur.appendChild(schlossKnoten);
    anhaengen(s, [k, spur]);

    /* Der Zustand steht im DOM (data-an, .schalter-gesperrt, data-
       deaktiviert, data-tip), nicht in dieser Funktion: ein Schalter, den
       UI.abgleichen stehen lässt, übernimmt ihn so mit den Attributen aus
       dem neuen Bau, und seine Methoden lesen den gezeigten Stand. */
    const istAnRoh = function () { return s.getAttribute("data-an") === "true"; };
    const istGesperrt = function () { return s.classList.contains("schalter-gesperrt"); };
    const istDeaktiviert = function () { return s.hasAttribute("data-deaktiviert"); };

    function zeigen(an, gesperrt, deaktiviert, tipp) {
      s.setAttribute("data-an", an ? "true" : "false");
      s.classList.toggle("schalter-gesperrt", gesperrt);
      s.toggleAttribute("data-deaktiviert", deaktiviert);
      k.checked = an || gesperrt;
      if (gesperrt || deaktiviert) k.setAttribute("aria-disabled", "true");
      else k.removeAttribute("aria-disabled");
      // Der Tooltip hängt am Kästchen: es deckt die Spur ab (Dashboard-Style
      // 2.0), Zeiger und Tastatur treffen also beide dasselbe Element.
      if (tipp) k.setAttribute("data-tip", tipp);
      else k.removeAttribute("data-tip");
      s.dispatchEvent(new CustomEvent("schalterwechsel", { detail: { an: an || gesperrt, gesperrt: gesperrt } }));
    }

    function tippJetzt() { return k.getAttribute("data-tip") || ""; }

    k.addEventListener("change", function () {
      if (istGesperrt() || istDeaktiviert()) { zeigen(istAnRoh(), istGesperrt(), istDeaktiviert(), tippJetzt()); return; }
      const neu = k.checked;
      zeigen(neu, false, false, tippJetzt());
      if (!o.beiWechsel) return;
      const zurueck = function () { if (istAnRoh() === neu) zeigen(!neu, istGesperrt(), istDeaktiviert(), tippJetzt()); };
      const ergebnis = o.beiWechsel(neu, s);
      if (ergebnis === false) zurueck();
      else if (ergebnis && typeof ergebnis.then === "function") {
        ergebnis.then(function (r) { if (r === false) zurueck(); }, zurueck);
      }
    });

    s.eingabe = k;
    s.setzen = function (neuAn, neuGesperrt, neuerTipp) {
      zeigen(!!neuAn,
        neuGesperrt !== undefined && neuGesperrt !== null ? !!neuGesperrt : istGesperrt(),
        istDeaktiviert(),
        neuerTipp !== undefined ? (neuerTipp || "") : tippJetzt());
      return s;
    };
    s.sperren = function (aus) { zeigen(istAnRoh(), istGesperrt(), !!aus, tippJetzt()); return s; };
    s.istAn = function () { return istAnRoh() || istGesperrt(); };
    s.istGesperrt = istGesperrt;
    zeigen(!!o.an, !!o.gesperrt, !!o.deaktiviert, o.titel || "");
    return s;
  }

  /* Zeile mit Schalter, Name (+ Unterzeile), Zustandswort und Zusatz
     (Chips). Name und Wort gehören in das Label des Schalters
     (.ds-switch__label, .ds-switch__state mit beiden Wörtern: Dashboard-
     Style blendet sie über). In der vollen Zeile ordnet .schalter-zeile
     die Teile neu (das Label hat dort keinen eigenen Kasten): das Wort
     ganz rechts, der Zusatz links davon. Der Name benennt das Kästchen
     (aria-labelledby), die Unterzeile beschreibt es. */
  function schalterZeile(optionen) {
    const o = optionen || {};
    const s = o.schalter || schalter({ an: o.an, gesperrt: o.gesperrt, titel: o.titel, beiWechsel: o.beiWechsel });
    const k = s.eingabe;

    const textKnoten = el("span", "ds-switch__label schalter-text");
    const name = el("span", "schalter-name", o.name);
    name.id = teilId(k, "name");
    textKnoten.appendChild(name);
    if (k && !k.hasAttribute("aria-label")) k.setAttribute("aria-labelledby", name.id);
    const unter = o.unter && o.unter.nodeType ? anhaengen(el("span", "schalter-unter"), o.unter)
      : (!istLeer(o.unter) ? el("span", "schalter-unter", o.unter) : null);
    if (unter) {
      unter.id = teilId(k, "unter");
      textKnoten.appendChild(unter);
      if (k) beschreibungHinzu(k, unter.id);
    }
    s.appendChild(textKnoten);

    if (o.wort) {
      const woerter = Object.assign({}, SCHALTER_WOERTER, istOptionen(o.wort) ? o.wort : {});
      const wort = el("span", "ds-switch__state");
      wort.setAttribute("aria-hidden", "true");   // der Zustand steht schon im Schalter
      const wortAn = el("span", "ds-switch__on", woerter.an);
      anhaengen(wort, [wortAn, el("span", "ds-switch__off", woerter.aus)]);
      // Gesperrt ist der Schalter an; ein eigenes Wort dafür ersetzt «an».
      const nachfuehren = function () {
        textSetzen(wortAn, s.istGesperrt && s.istGesperrt() ? woerter.gesperrt : woerter.an);
      };
      s.addEventListener("schalterwechsel", nachfuehren);
      nachfuehren();
      s.appendChild(wort);
    }

    const zusatz = el("div", "schalter-zusatz");
    anhaengen(zusatz, o.zusatz || []);
    let z;
    if (o.kompakt) {
      // Kompakt in einer Kopfzeile («ICT-Ablage  Aktiv»): der Schalter selbst.
      s.classList.add("schalter-feld");
      if (o.klasse) s.classList.add.apply(s.classList, String(o.klasse).split(/\s+/).filter(Boolean));
      z = s;
      if (zusatz.firstChild) {
        z = el("div", "schalter-feld-huelle");
        anhaengen(z, [s, zusatz]);
      }
    } else {
      z = el("div", "schalter-zeile" + (o.klasse ? " " + o.klasse : ""));
      z.appendChild(s);
      if (zusatz.firstChild) z.appendChild(zusatz);
    }
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
     sein; leere Zellen zeigen «–». Die Blende an den Rändern, solange es
     seitlich weitergeht, setzt Dashboard-Style (rollgebunden). */
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
    return rahmen;
  }

  const SORT_ARIA = { auf: "ascending", ab: "descending", ascending: "ascending", descending: "descending" };

  /* Sortierknopf im th. Der 16-px-Pfeil (.ds-table__sort-arrow) steht nur
     an der sortierten Spalte und zeigt immer nach oben; aria-sort=
     "descending" am th dreht ihn auf der Feder (table.css). Jeder
     Sortierknopf hält den Platz des Pfeils frei: nichts verschiebt sich. */
  function sortierKnopf(beschriftung, richtung) {
    const k = el("button", "ds-table__sort");
    k.type = "button";
    k.appendChild(el("span", null, beschriftung));
    k.richtungSetzen = function (r) {
      const pfeil = k.querySelector(":scope > .ds-table__sort-arrow");
      if (!SORT_ARIA[r]) { if (pfeil) pfeil.remove(); }
      else if (!pfeil) k.appendChild(sinnbild("pfeilHoch", 16, "ds-table__sort-arrow"));
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
          t.setAttribute("data-tip", s.titel);
          th.appendChild(t);
        } else {
          th.textContent = text(s.text);
        }
      } else {
        const k = sortierKnopf(s.text, null);
        if (s.titel) k.setAttribute("data-tip", s.titel);
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

  /* Rollkanten für ICT-eigene Roller (.tabelle-rahmen, Zeitstrahl):
     data-gerollt-x (seitlich gerollt → Haarlinie an der klebenden ersten
     Spalte), data-gerollt (nach unten gerollt) und data-mehr-rechts
     (rechts liegt noch Inhalt → eine Ausblende-Maske am rechten Rand, die
     nur steht, solange es dort wirklich weitergeht). Ändert sich die
     Grösse des Rollers oder seines Inhalts (erstes Kind), wird neu
     geprüft. Die .ds-table-wrap blendet Dashboard-Style selbst aus. */
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

  /* Ein zweiter Aufruf auf demselben Roller prüft nur neu: nach einem
     Abgleich (UI.abgleichen) steht der gezeigte Roller noch, trägt aber
     die Attribute seiner losgelösten Vorlage, also keine Kanten. Ein
     losgelöster Roller misst nichts (alles 0); der Grössenbeobachter
     meldet ihn, sobald er eingehängt ist. */
  function rollKanten(element) {
    if (!element) return element;
    if (!beobachteteRoller.has(element)) {
      beobachteteRoller.add(element);
      element.addEventListener("scroll", function () { kantenPruefen(element); }, { passive: true });
      if (groessenBeobachter) {
        for (const k of [element, element.firstElementChild]) {
          if (!k) continue;
          rollerVon.set(k, element);
          groessenBeobachter.observe(k);
        }
      }
    }
    if (element.isConnected) kantenPruefen(element);
    return element;
  }

  /* Rahmen einer seitenfüllenden Liste: .ds-table-wrap--fill von
     Dashboard-Style (eigener Scroller mit Haarlinie, klebender Kopf, Zellen
     mit «…») mit .ds-table--pin-first (die erste Spalte klebt, ihre
     Haarlinie erscheint beim seitlichen Rollen, die Blende nur rechts).
     DS.dom.scrollEdges meldet die Kanten auch ohne rollgebundene
     Animationen. Klickbare Zeilen (.ds-table--interactive): einen Klick in
     eine Zelle ohne eigenes Bedienelement reicht DS.ripple an den
     Zeilenlink weiter (Ctrl-, Shift- und Mittelklick in einem neuen Tab,
     mit markiertem Text nicht) und lässt die Welle über die ganze Zeile
     laufen. Wer vor einem neuen Tab etwas tun muss, hört auf click und
     auxclick der Zeile (app.js: Liste merken). */
  function tabellenRahmen(tabellenKnoten, optionen) {
    const o = optionen || {};
    const r = el("div", "ds-table-wrap ds-table-wrap--fill tabelle-rahmen" + (o.klasse ? " " + o.klasse : ""));
    if (o.id) r.id = o.id;
    if (tabellenKnoten) {
      tabellenKnoten.classList.add("ds-table--pin-first");
      r.appendChild(tabellenKnoten);
    }
    DS.dom.scrollEdges(r);
    return r;
  }


  /* ==================================================================
     Hinweisliste, Listenzeilen, Zeitachse
     ================================================================== */

  const HINWEIS_SINNBILDER = { gefahr: "achtungKreis", warnung: "achtung", erfolg: "checkKreis", info: "info" };
  const HINWEIS_KLASSEN = { gefahr: "ds-alert--error", warnung: "ds-alert--warning", erfolg: "ds-alert--success" };

  /* Ein Befund in einer Karte: .ds-alert--plain von Dashboard-Style (auf
     der Fläche der Karte, ohne Füllung; das Sinnbild in der Farbe der Art,
     der Text ruhig; Haarlinien zwischen aufeinanderfolgenden). Statisch,
     darum ohne Live-Rolle. */
  function hinweisZeile(optionen) {
    const o = optionen || {};
    const ton = HINWEIS_SINNBILDER[o.ton] ? o.ton : "info";
    const z = el("div", "ds-alert ds-alert--plain" + (HINWEIS_KLASSEN[ton] ? " " + HINWEIS_KLASSEN[ton] : ""));
    z.appendChild(sinnbild(o.sinnbild || HINWEIS_SINNBILDER[ton], 20));
    const t = el("div", "ds-alert__text");
    if (!istLeer(o.titel)) t.appendChild(el("p", "ds-alert__title", o.titel));
    if (o.text && o.text.nodeType) t.appendChild(anhaengen(el("p"), o.text));
    else if (!istLeer(o.text)) t.appendChild(el("p", null, o.text));
    z.appendChild(t);
    return z;
  }

  function hinweise(zeilen) { return anhaengen(el("div", "hinweise"), zeilen || []); }

  /* Zeile einer Zeilenliste (.ds-list__item von Dashboard-Style): Titel
     (.ds-list__title) + Unterzeile (.ds-list__meta). Mit href oder
     beiKlick ist der Titel der Link bzw. Knopf der Zeile (.ds-list__action):
     seine Fläche spannt sich über die Zeile, Zustandsebene, Welle und
     Fokusring kommen von Dashboard-Style, ein Winkel zeigt das Ziel;
     Aktionen (.ds-list__actions) und Status bleiben darüber bedienbar.
     aktuell: aria-current (getönt über --ds-list-current-bg, thema.css). */
  function listenZeile(optionen) {
    const o = optionen || {};
    const aktionen = (o.aktionen || []).filter(Boolean);
    const offen = !!(o.href || o.beiKlick);
    const z = el("li", "ds-list__item" + (o.klasse ? " " + o.klasse : ""));
    if (o.aktuell) z.setAttribute("aria-current", "true");

    if (o.sinnbild) z.appendChild(sinnbild(o.sinnbild, 20, "ds-list__icon"));
    const t = el("span", "ds-list__text");
    const titel = el("span", "ds-list__title");
    if (offen) {
      const ziel = el(o.href ? "a" : "button", "ds-list__action", o.titel);
      if (o.href) ziel.href = o.href;
      else ziel.type = "button";
      if (o.beiKlick) ziel.addEventListener("click", o.beiKlick);
      if (o.titelTipp) ziel.setAttribute("data-tip", o.titelTipp);
      fokusSetzen(ziel, o.fokus);
      titel.appendChild(ziel);
    } else {
      titel.textContent = text(o.titel);
      if (o.titelTipp) z.setAttribute("data-tip", o.titelTipp);
    }
    t.appendChild(titel);
    if (Array.isArray(o.unter)) t.appendChild(anhaengen(el("span", "ds-list__meta"), [teile(o.unter)]));
    else if (o.unter && o.unter.nodeType) t.appendChild(anhaengen(el("span", "ds-list__meta"), o.unter));
    else if (!istLeer(o.unter)) t.appendChild(el("span", "ds-list__meta", o.unter));
    z.appendChild(t);

    anhaengen(z, Array.isArray(o.status) ? o.status : (o.status ? [o.status] : []));
    if (aktionen.length) z.appendChild(anhaengen(el("span", "ds-list__actions"), aktionen));
    if (offen && !aktionen.length) z.appendChild(sinnbild("chevronRechts", 20, "ds-list__chevron"));
    return z;
  }

  /* Die umrandete Liste (.ds-list); klickbar (.ds-list--interactive),
     sobald eine Zeile einen Link oder Knopf trägt. Ohne Zeile ohne Platz. */
  function zeilenliste(zeilen) {
    const liste = (zeilen || []).filter(Boolean);
    const klickbar = liste.some(function (z) { return !!z.querySelector && !!z.querySelector(".ds-list__action"); });
    return anhaengen(el("ul", "ds-list zeilenliste" + (klickbar ? " ds-list--interactive" : "")), liste);
  }

  /* Zahlmarke (Handlungsbedarf): 32-px-Pille mit der Zahl vor dem Titel
     einer Karte (UI.karte({ marke })), tonal nach Dringlichkeit ('warnung' | 'gefahr', sonst
     neutral). Die Dringlichkeit steht immer auch als Wort in der Karte
     (Status «Dringend»), nie nur in der Farbe. */
  function zahlmarke(zahl, ton) {
    const t = ton === "warnung" || ton === "gefahr" ? " ton-" + ton : "";
    return el("span", "zahlmarke" + t, typeof zahl === "number" ? zahlFormat(zahl) : text(zahl));
  }

  /* Zeitachse: .ds-timeline von Dashboard-Style (Punkte auf einer Linie,
     Haarlinien ab der Textkante). [{ titel, zeit: Text|Knoten, zeitSinnbild,
     text: Text|Knoten, still, zusatz: [Knoten], aktionen: [Knoten], klasse }]:
     Kopf mit Titel und Zusatz (Status-Chips), Meta-Zeile (zeit, ein
     Sinnbild davor), Text (behält Zeilenumbrüche) bzw. ein Knoten an seiner
     Stelle (.ds-timeline__body: das Formular beim Bearbeiten), Text-Knöpfe.
     still: ein grauer Punkt (Abgleich, alte Zeitstempel; das Wort steht in
     der Zeile bzw. im Kartentext) über den Hook --ds-timeline-dot-color. */
  function zeitachse(eintraege) {
    const liste = el("ol", "ds-timeline zeitachse");
    liste.setAttribute("role", "list");
    for (const e of eintraege || []) {
      const li = el("li", "ds-timeline__item" + (e.still ? " zeitachse-still" : "") + (e.klasse ? " " + e.klasse : ""));
      const kopf = el("div", "ds-timeline__head");
      if (!istLeer(e.titel)) kopf.appendChild(el("p", "ds-timeline__title", e.titel));
      anhaengen(kopf, e.zusatz || []);
      li.appendChild(kopf);
      const zeitKnoten = !!e.zeit && (!!e.zeit.nodeType || Array.isArray(e.zeit));
      if (zeitKnoten || !istLeer(e.zeit) || e.zeitSinnbild) {
        const zeit = el("p", "ds-timeline__meta");
        if (e.zeitSinnbild) zeit.appendChild(sinnbild(e.zeitSinnbild, 16));
        if (zeitKnoten) anhaengen(zeit, e.zeit);
        else if (!istLeer(e.zeit)) zeit.appendChild(document.createTextNode(String(e.zeit)));
        li.appendChild(zeit);
      }
      if (e.text && e.text.nodeType) li.appendChild(anhaengen(el("div", "ds-timeline__body"), e.text));
      else if (!istLeer(e.text)) li.appendChild(el("p", "ds-timeline__text", e.text));
      if (e.aktionen && e.aktionen.length) li.appendChild(anhaengen(el("div", "ds-timeline__actions"), e.aktionen));
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
     der Balken ist darum für den Screenreader verborgen. Ein neuer Anteil
     am stehenden Balken gleitet (bausteine.css, --ds-ease-value). */
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
      if (w.titel) saeule.setAttribute("data-tip", w.titel);
      const f = el("span", "saeule-fuell");
      f.style.setProperty("--anteil", String(anteilBegrenzen((Number(w.wert) || 0) / max)));
      saeule.appendChild(f);
      s.appendChild(saeule);
    });
    return s;
  }

  /* Verteilung: Zeilen mit Name, Zahl und Balken.
     eintraege: [{ text, zahl, anteil?, titel?, beiKlick?, href?, fokus? }];
     der Anteil ist sonst zahl / grösste Zahl (oder optionen.max). Der Name
     steht einzeilig; der ganze Name erscheint als Tooltip, solange er
     gekürzt ist (ein titel immer). Die Balken wachsen beim ersten Zeigen
     (Bewegung.auftritt); .setzen an einem stehenden Balken gleitet. */
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
      if (tag !== "div") z.setAttribute("data-ds-ripple", "");
      if (e.beiKlick) z.addEventListener("click", e.beiKlick);
      if (tag !== "div") fokusSetzen(z, e.fokus);
      if (e.titel) z.setAttribute("data-tip", e.titel);
      else z.setAttribute("data-tip", text(e.text));
      z.appendChild(el("span", "verteilung-name", e.text));
      z.appendChild(el("span", "verteilung-zahl", zahlFormat(Number(e.zahl) || 0)));
      z.appendChild(balken(e.anteil !== undefined ? e.anteil : (Number(e.zahl) || 0) / groesste));
      li.appendChild(z);
      ul.appendChild(li);
    }
    return ul;
  }

  /* Fortschritt (linear, progress.css): anteil 0..1 oder unbestimmt; Text
     und Detail darunter. --ds-progress steht auf .ds-progress selbst: Spur,
     Lücke, Stopppunkt und Balken lesen den geerbten Wert und gleiten
     zusammen. setzen() ändert nur, was sich ändert – der Balken gleitet
     weiter, statt neu zu beginnen; wer unbestimmt aufhebt, gibt den ersten
     Anteil im selben Aufruf mit. wartet: nur der Text (die Spur hält ihren
     Platz); flach: ohne Welle, für dichte Zellen. */
  function fortschritt(optionen) {
    const g = el("div", "ds-progress");
    const spur = el("div", "ds-progress__track");
    spur.setAttribute("role", "progressbar");
    spur.setAttribute("aria-valuemin", "0");
    spur.setAttribute("aria-valuemax", "100");
    const balkenKnoten = el("div", "ds-progress__bar");
    spur.appendChild(balkenKnoten);
    const textKnoten = el("p", "ds-progress__label");
    textKnoten.setAttribute("aria-live", "polite");
    const detail = el("p", "ds-progress__detail");
    anhaengen(g, [spur, textKnoten, detail]);

    g.setzen = function (o) {
      o = o || {};
      if (o.label !== undefined) spur.setAttribute("aria-label", o.label);
      if (o.unbestimmt !== undefined) g.classList.toggle("ds-progress--indeterminate", !!o.unbestimmt);
      if (o.wartet !== undefined) g.classList.toggle("ds-progress--waiting", !!o.wartet);
      if (o.flach !== undefined) g.classList.toggle("ds-progress--flat", !!o.flach);
      if (o.text !== undefined) textSetzen(textKnoten, o.text);
      if (o.detail !== undefined) textSetzen(detail, o.detail);
      if (o.anteil !== undefined) g.style.setProperty("--ds-progress", String(anteilBegrenzen(o.anteil)));
      // Ohne bekannten Anteil sagt der Text, was läuft (aria-valuetext).
      if (g.classList.contains("ds-progress--indeterminate") || g.classList.contains("ds-progress--waiting")) {
        spur.removeAttribute("aria-valuenow");
        spur.setAttribute("aria-valuetext", textKnoten.textContent || "Wird geladen …");
      } else {
        spur.removeAttribute("aria-valuetext");
        const a = anteilBegrenzen(g.style.getPropertyValue("--ds-progress"));
        spur.setAttribute("aria-valuenow", String(Math.round(a * 100)));
      }
      return g;
    };
    g.setzen(Object.assign({ anteil: 0 }, optionen || {}));
    return g;
  }


  /* ==================================================================
     Öffentliche Schnittstelle. rahmen.js hängt UI.dialog, UI.bestaetigen,
     UI.blatt, UI.ebeneOffen, UI.meldung, UI.meldungenFehlerSchliessen,
     UI.tipp, UI.speicherleiste, UI.seitenkopf und UI.adresse an dieses
     Objekt an.
     ================================================================== */

  return {
    // DOM
    $: $, el: el, leeren: leeren, anhaengen: anhaengen, text: text, gleichwertig: gleichwertig,
    textSetzen: textSetzen, id: id, abgleichen: abgleichen, kinderAbgleichen: kinderAbgleichen,
    // Sinnbilder
    sinnbild: sinnbild, SINNBILDER: SINNBILDER,
    // Knöpfe
    knopf: knopf, knopfText: knopfText, knopfUebernehmen: knopfUebernehmen, knopfSperren: knopfSperren,
    beschaeftigt: beschaeftigt,
    // Status, Hinweise
    status: status, banner: banner, leerzustand: leerzustand, hinweis: hinweis, meta: meta, teile: teile,
    // Laden
    spinner: spinner, ladezeile: ladezeile, skelettSeite: skelettSeite,
    // Karten, Kacheln
    karte: karte, kachel: kachel, kacheln: kacheln,
    // Datenzeilen
    datenzeilen: datenzeilen, feldZeile: feldZeile, feldGesperrt: feldGesperrt,
    formZeile: formZeile, formZeileGeaendert: formZeileGeaendert, kennwerte: kennwerte, fakten: fakten, schloss: schloss,
    // Chips, Zähler
    chip: chip, chips: chips, zaehler: zaehler,
    // Formulare
    eingabe: eingabe, feld: feld, feldFehler: feldFehler, feldHinweis: feldHinweis, hinweisPlatz: hinweisPlatz,
    ankreuzen: ankreuzen, mehrfach: mehrfach,
    zahlText: zahlFormat, zeitText: zeitText,
    // Suche, Schalter
    suchfeld: suchfeld, schalter: schalter, schalterZeile: schalterZeile,
    // Tabellen
    tabelle: tabelle, tabellenKopf: tabellenKopf, tabellenRahmen: tabellenRahmen, rollKanten: rollKanten,
    // Listen
    hinweisZeile: hinweisZeile, hinweise: hinweise, listenZeile: listenZeile, zeilenliste: zeilenliste,
    zahlmarke: zahlmarke, zeitachse: zeitachse,
    // Diagramme
    balken: balken, saeulen: saeulen, verteilung: verteilung, fortschritt: fortschritt
  };
})();

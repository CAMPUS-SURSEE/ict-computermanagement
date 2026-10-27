/* rahmen.js – der Rahmen aller Seiten und die schwebenden Ebenen.

   Rahmen (Kopf, Schublade, Wechsel und Zustände der Seite) als
   klassisches Skript mit EINEM Namensraum «Rahmen»; Dialog, Seitenblatt,
   Meldung und Tooltip hängen sich an «UI» (bausteine.js) an. Aussehen und
   Verhalten kommen von Dashboard-Style: das App-Gerüst (.ds-app,
   .ds-topbar, .ds-drawer, .ds-panel, .ds-view), DS.overlay (modale
   Schublade, Dialog, Blatt, Meldungen und Tooltips: Fokusfalle, inert,
   Escape, Bildlaufsperre, Fokus zurück, Ansage), DS.motion (Wechsel,
   Ladeanzeigen), DS.indicator (Pille, über Bewegung.indikator) und
   DS.ripple (Druckwelle). Hier steht nur, was ICT darüber hinaus braucht;
   das Aussehen dazu in rahmen.css.

   Ladereihenfolge: konfig.js, vendor/dashboard-style/ds.js, bausteine.js,
   rahmen.js, MSAL … rahmen.js baut den Rahmen SOFORT beim Laden aus dem
   HTML-Gerüst (wie die Beispiel-App von Dashboard-Style, docs/components.md
   «App frame»):

     <html class="ds-theme ds-base">
     <head> … <link rel="expect" href="#rahmen-gebaut" blocking="render"> … </head>
     <body>
       <div class="ds-app ds-app--drawer" data-seite="index|client|benutzer|telefon|software|kamera|kamerarolle|styleguide">
         <a class="ds-skip" href="#inhalt">Zum Inhalt</a>
         <div class="ds-topbar" id="kopf"></div>
         <div class="ds-scrim"></div>
         <nav class="ds-drawer" id="schublade" aria-label="…" tabindex="-1"></nav>
         <div class="ds-panel">
           <main class="ds-view" id="tafel" tabindex="-1">
             <div class="ds-content"><div class="ds-page" id="inhalt" data-zustand="laden"> … </div></div>
           </main>
         </div>
       </div>
       <div class="ds-toasts"></div>
       <script src="…/ds.js"></script> <script src="bausteine.js"></script> <script src="rahmen.js"></script>
       <div id="rahmen-gebaut" hidden></div>
       <script …></script>
     </body>

   Das erste Bild wartet auf #rahmen-gebaut (rel=expect), also bis
   rahmen.js Kopf, Schublade und Ladezustand gebaut hat, nicht aber auf
   MSAL vom CDN. Zeigt Chrome eine halb geparste Seite, bricht es den
   Seitenübergang zwischen den HTML-Seiten ab (optional/view-transitions.css
   von Dashboard-Style).

   Zustände an .ds-app: data-drawer-open (modale Schublade offen; setzt
   DS.overlay), data-drawer-hidden (Seite ohne Schublade), data-scrolled
   (Tafel gerollt: Kante und Tönung oben; DS.dom.watchScrolled setzt es),
   und data-ds-* von Dashboard-Style.
   Der Ladebalken (span.ds-loadbar#ladebalken) steht nur, solange die Seite
   lädt, in .ds-content vor der Bahn; Dialoge und Blätter hängen als
   <dialog> am Ende von body; die Meldungsregion .ds-toasts steht ohne
   role und aria-live direkt nach .ds-app (DS.overlay.toast legt die
   Ansagen daneben an).

   Fehlt ein Teil, legt rahmen.js ihn an. Ohne .ds-app[data-seite] baut es
   keinen Rahmen; die UI-Ebenen (Dialog, Blatt,
   Meldung, Tooltip) gehen trotzdem. Der Kopf steht vom ersten Bild an:
   das Konto der zuletzt gezeigten Seite belegt ihn vor (sessionStorage),
   die Wortmarke wartet höchstens 300 ms auf ihre Schrift. Einmal je
   Seite startet rahmen.js DS.ripple.attach(document) und
   DS.overlay.tooltips(document), auch ohne Rahmen (Styleguide).

   ------------------------------------------------------------------
   API «Rahmen»
   ------------------------------------------------------------------
   Rahmen.HAUPTZIELE                 Gruppen der Hauptseite (einzige Quelle),
                                     [{titel?, eintraege:[{schluessel, text, titel?, sinnbild, href}]}]
   Rahmen.STARTZIEL                  Ansicht der Hauptseite ohne Hash («geraete»)
   Rahmen.zielText(schluessel)       «admin» → «ADMIN-Clients» (für Zurück-Links);
                                     ein Eintrag mit titel nennt diesen («geraete» → «Geräte»)
   Rahmen.navigation({gruppen, aktiv, beiWahl(schluessel, ereignis), label, verstecken, zurueck})
                                     Zeichnet die Schublade. Gleiche Struktur → nur
                                     aktiv/Zähler an Ort und Stelle (die Pille gleitet);
                                     neue Struktur → neu, Pille springt. Echte Links
                                     (href): Mittel-/Ctrl-Klick öffnen einen neuen Tab,
                                     ein schlichter Klick geht an beiWahl (falls da).
                                     verstecken: Seite ohne Schublade (Tafel volle Breite;
                                     kommt sie wieder, gleitet sie herein).
                                     zurueck: {text, href} – Zurück-Eintrag zuoberst
                                     (Detailseiten: «‹ ADMIN-Clients»), ein schlichter
                                     Link ohne Pille; null/fehlt = keiner.
   Rahmen.aktiv(schluessel)          aktiver Eintrag, die Pille gleitet (vor dem ersten
                                     Inhalt springt sie)
   Rahmen.zahl(schluessel, wert)     Zähler am Eintrag (leer/null = keiner); erscheint
                                     er (leer → Wert), ploppt er einmal
   Rahmen.konto({name, email})       Konto rechts im Kopf: Kapsel mit Initiale, Name
                                     und E-Mail (≤ 720 px nur die Initiale)
   Rahmen.abmelden(beiKlick|null)    Text-Knopf «Abmelden» in derselben Kapsel
   Rahmen.vorfuehrung({text, beiZuruecksetzen}) | null
                                     Warn-Banner als erster Block der Bahn
   Rahmen.wechseln(neu, {alt, nachOben=true, auftritt=true}) → Promise<boolean>
                                     Ansichtswechsel über DS.motion.transition
                                     ('fade-through'): neu() baut um (Funktion; gibt den
                                     eintretenden Knoten zurück) bzw. ersetzt den Inhalt
                                     durch den Knoten «neu»; die modale Schublade schliesst
                                     dabei. Der Fokus geht auf den neuen Titel, wo er sonst
                                     verloren wäre (im alten Inhalt – Standard: der sichtbare
                                     Inhalt der Bahn, sonst «alt» –, auf body, aus der
                                     modalen Schublade); Raster darin staffeln (auftritt).
                                     Letzter Aufruf gewinnt: ältere bauen nicht mehr und
                                     lösen mit false auf.
   Rahmen.zustand('laden', {text, fortschritt, karten})
   Rahmen.zustand('fehler', {titel, text, hinweis, knopfText, beiKlick, pfad})
   Rahmen.zustand('ende',   {titel, text, hinweis, knopfText, beiKlick, fokus, pfad})
                                     pfad: {text, href} – Zurück-Link «‹ Liste» über dem Titel
   Rahmen.zustand('inhalt') → Promise   (hält eine sichtbare Ladeanzeige ihre
                                     Mindestzeit, DS.motion.settleLoader; Staffelung +
                                     Hochzählen nur beim ERSTEN Inhalt)
   Rahmen.zustandJetzt()             'laden' | 'fehler' | 'ende' | 'inhalt'
   Rahmen.stillZeichnen(behaelter, zeichnen)  zeichnet ohne Bewegung neu (Nachladen,
                                     Speichern, Filtern). zeichnen() baut den Behälter selbst
                                     um – oder gibt die neuen, abgehängten Kinder zurück
                                     (Array/NodeList): dann gleicht DS.dom.morphChildren sie
                                     mit dem Bestand ab (Schlüssel data-ds-key bzw. id;
                                     bleibende Knoten behalten Fokus, Listener, Rollstand).
                                     Tafel und innere Roller bleiben stehen, ein
                                     verschwundener Fokus geht samt Schreibmarke an sein
                                     Gegenstück (data-fokus, id, sonst dieselbe Stelle,
                                     sonst der Seitentitel)
   Rahmen.fest(an)                   Tafel rollt nicht (Tabellenansichten, .ds-view--fill),
                                     solange das Fenster ≥ 601 × 720 px ist; darunter rollt
                                     sie, und die Liste ist höchstens so hoch wie die Tafel
   Rahmen.dokumentTitel(text)        «text – ICT-Inventar»
   Rahmen.schublade.oeffnen({ausloeser}) / .schliessen() → Promise / .offen()
                                     (DS.overlay; nur ≤ 900 px modal). ausloeser bekommt
                                     den Fokus nach dem Schliessen (Standard: Menüknopf)
   Rahmen.elemente()                 {app, kopf, schublade, tafel, bahn, ladebalken, meldungen}
                                     (ladebalken: null, solange nichts lädt)

   ------------------------------------------------------------------
   Erweiterungen von «UI» (alle über DS.overlay)
   ------------------------------------------------------------------
   UI.dialog({titel, inhalt?, knoepfe?, breit?, rolle?, fokus?, beschreibung?, beiSchliessen?(grund),
              fokusZurueck?(), klasse?})
     → {element, flaeche, inhalt, knoepfe, oben([Knoten]), titel(t), hoehe(css|null),
        schliessen(grund) → Promise, offen(), fokussieren(), sperren(an)}
     element ist ein natives <dialog class="ds-dialog"> (role dialog bzw. rolle;
     breit = .ds-dialog--wide, 560 px), flaeche seine .ds-dialog__box, inhalt
     der .ds-dialog__body: die eine Rollfläche, Titel und Knöpfe bleiben
     stehen. oben([…]) setzt, was zwischen Titel und Körper stehen bleibt
     (die Suche über einer Liste und ihre Trefferzahl); hoehe("560px") hält
     den Dialog beim Filtern gleich hoch (--ds-dialog-height).
     DS.overlay.open/close öffnen und schliessen es (Fokusfalle, Escape,
     Schleier, Fokus zurück zum Auslöser; ist er inzwischen neu gezeichnet,
     an sein Gegenstück über data-fokus bzw. id, sonst an fokusZurueck()).
     Der Fokus beginnt auf fokus, sonst dem ersten Feld, sonst dem ersten Knopf.
     beschreibung: id des Texts, der den Dialog beschreibt (aria-describedby).
     grund an beiSchliessen (aus ds-close): 'esc', 'schleier', 'knopf'
     ([data-close]), 'schliessen' oder was die Seite an schliessen() gibt.
     Gesperrt (sperren(true), z. B. während gelöscht wird: data-ds-busy)
     schliessen weder Esc noch Schleier noch [data-close]; schliessen() der
     Seite geht weiter. Der Schleier schliesst nur mit einem eigenen
     einfachen Klick (Dashboard-Style: nicht dem zweiten eines Doppelklicks,
     nicht in den ersten --ds-delay-dismiss).
   UI.bestaetigen({titel, text, ja, nein='Abbrechen', breit?}) → Promise<boolean>
     role=alertdialog, Fokus auf «Abbrechen»; löst bei Esc, Schleier und
     «Abbrechen» mit false auf.
   UI.blatt({titel, unter?, inhalt?, fuss?, breite: 560|720, beiSchliessen?(grund), fokusZurueck?(), klasse?})
     → {element, flaeche, koerper, fuss, titel(t), unter(t), schliessen(grund) → Promise, offen(),
        fokusSchliessen(), sperren(an)}
     natives <dialog class="ds-sheet">: Titel mit Unterzeile (.ds-sheet__heading,
     .ds-sheet__subtitle, live), Körper (.ds-sheet__body), Fusszeile
     (.ds-sheet__foot, leer ohne Platz); × ([data-close], grund 'knopf') und
     Schleier wie beim Dialog.
   UI.ebeneOffen() → boolean         eine Überlagerung ist offen (DS.overlay.topmost):
                                     Dialog, Blatt, modale Schublade, Menü, Vorschlagsliste
                                     (für Tastenkürzel der Seiten: Esc, Ctrl+S, «/»)
   UI.meldung(text, {ton:'erfolg'|'fehler'|'info', dauer, aktion:{text, beiKlick}}) → {schliessen, element}
     über DS.overlay.toast in der Region .ds-toasts. Fehler und Meldungen mit
     Aktion bleiben (mit ×), bis man sie schliesst; die übrigen gehen nach dauer
     bzw. der Lesezeit von Dashboard-Style. Ein neuer Fehler ersetzt den offenen
     (key), dieselbe Meldung startet die stehende neu (Dashboard-Style), und
     solange eine Meldung steht, hält die Tafel (bzw. das Blatt) an ihrem Ende
     Platz frei (data-toast-reserve, Dashboard-Style).
   UI.meldungenFehlerSchliessen()    (UI.beschaeftigt ruft es beim Start auf;
                                     DS.overlay.closeToasts)
   UI.tipp(element, text|null)       Tooltip-Text setzen (data-tip); wiederholt er
                                     nur den sichtbaren Text, zeigt DS.overlay.tooltips
                                     ihn nur, solange der Text abgeschnitten ist.
   UI.speicherleiste({beiSpeichern, beiVerwerfen, fokusZiel}) → {element, speichernKnopf,
     verwerfenKnopf, setzen({sichtbar, text, speichernText, verwerfenText, speichernAus,
     verwerfenAus}), beschaeftigt(arbeit) → Promise, sichtbar(), speicherbar()}
     .ds-savebar von Dashboard-Style (DS.overlay.savebar): trägt keine Höhe bei;
     solange sie steht, hält die Tafel Platz frei und rollt ein verdecktes
     fokussiertes Feld über sie, die Meldungen steigen über sie. Sie kommt und
     geht als .ds-presence; eine austretende Leiste friert ihren Inhalt ein
     (update). fokusZiel() → Element: wohin der Fokus geht, wenn er in der
     Leiste steht und sie geht oder ihr Knopf gesperrt wird (sonst die Tafel).
     beschaeftigt(arbeit) zeigt den Speichern-Knopf beschäftigt, solange arbeit
     läuft (UI.beschaeftigt → DS.motion.busy).
   UI.seitenkopf({titel, lead, unter:[Teile]|Text, status:[Knoten], aktionen:[Knoten],
                  pfad:{text, href}|null, ebene=1, id, titelId, element})
     → header.ds-page-head mit .knoten {pfad, pfadText, titel, lead, unter, status, aktionen}
       und .setzen({…}) (dieselben Schlüssel; ersetzt nur, was übergeben wird).
       element: einen vorhandenen <header> füllen statt einen neuen zu bauen.
   UI.adresse.client(liste, id, {neu, vorlage, bereich}|bereich) · benutzer(id, …) ·
     telefon(id, {neu, benutzer, vorlage, bereich}) · software(id, …) · kamera(id, {bereich}) ·
     kamerarolle(id, {bereich}) ·
     liste(tab, filter?) (filter: {suche, programm, stufe} → q/pg/ps, andere Schlüssel
     unverändert, oder URLSearchParams/Text) · listeMerken(adresse?) ·
     zurueckZurListe(tab) (gemerkt im Tab, sonst – neuer Tab – höchstens 12 h alt aus
     localStorage, sonst index.html#tab) · mock()       (hängt mock=1 selbst an)

   Grundsätze wie überall: kein Framework, kein innerHTML, Text nur über
   textContent, kein Browser-title. Bewegung nur über Dashboard-Style
   (DS.motion direkt bzw. Bewegung in bausteine.js). */

"use strict";

const Rahmen = (function () {

  if (typeof UI === "undefined" || typeof Bewegung === "undefined"
    || typeof DS === "undefined" || !DS.overlay || !DS.motion) {
    throw new Error("rahmen.js braucht vendor/dashboard-style/ds.js und bausteine.js (vorher laden).");
  }
  const M = DS.motion;

  /* ==================================================================
     Konstanten
     ================================================================== */

  const PRODUKT = "ICT-Inventar";
  const LISTE_SPEICHER = "ictinventar.listen";
  /** So lange gilt eine gemerkte Listenadresse in einem neuen Tab (ein
      Arbeitstag); im selben Tab gilt sie, solange der Tab lebt. */
  const LISTE_DAUER_MS = 12 * 60 * 60 * 1000;
  /** Die Ansicht der Hauptseite ohne Hash: die Übersicht des ersten Moduls. */
  const STARTZIEL = "geraete";
  /** Zuletzt gezeigtes Konto: der Kopf einer neuen Seite steht damit vom
      ersten Bild an da (Seitenwechsel, View Transition). */
  const KOPF_SPEICHER = "ictinventar.kopf";
  /** Längstens so lange bleibt die Wortmarke unsichtbar, bis ihre Schrift
      (Archivo) da ist – danach erscheint sie auch mit der Ersatzschrift. */
  const SCHRIFT_WARTEN_MS = 300;
  const SCHRIFT_MARKE = "650 22px Archivo";

  const FOKUSSIERBAR = "a[href], button:not([disabled]), input:not([disabled]):not([type=\"hidden\"]), "
    + "select:not([disabled]), textarea:not([disabled]), [tabindex], [contenteditable=\"true\"]";

  /* ==================================================================
     Kleine Helfer
     ================================================================== */

  const el = UI.el;
  /* Zahlen wie überall über den einen Formatierer in bausteine.js. */
  const zahlText = UI.zahlText;

  function knopf(o) { return UI.knopf(o); }

  function aktivesElement() {
    const a = document.activeElement;
    return a && a !== document.body && a !== document.documentElement ? a : null;
  }

  function sichtbar(k) {
    return !!k && !k.hidden && k.getClientRects().length > 0;
  }

  function fokussierbare(behaelter) {
    if (!behaelter) return [];
    return Array.from(behaelter.querySelectorAll(FOKUSSIERBAR)).filter(function (k) {
      return k.tabIndex >= 0 && !k.closest("[inert]") && k.getClientRects().length > 0;
    });
  }

  function fokusbereit(k) {
    return !!k && k.isConnected && !k.closest("[inert]") && k.getClientRects().length > 0;
  }

  function fehlerMeldungAusnahme(fehler) {
    setTimeout(function () { throw fehler; }, 0);
  }

  /* ==================================================================
     Adressen: EIN Ort für alle Fensteradressen
     ================================================================== */

  function istMock() {
    try { return new URLSearchParams(location.search).get("mock") === "1"; } catch (e) { return false; }
  }

  function adresseBauen(datei, paare, hash) {
    const sp = new URLSearchParams();
    for (const paar of paare) {
      const w = paar[1];
      if (w === undefined || w === null || w === "" || w === false) continue;
      sp.set(paar[0], w === true ? "1" : String(w));
    }
    if (istMock()) sp.set("mock", "1");
    const q = sp.toString();
    return datei + (q ? "?" + q : "") + (hash ? "#" + hash : "");
  }

  function adressOptionen(o) {
    return typeof o === "string" ? { bereich: o } : (o || {});
  }

  /* Gemerkte Listenadressen je Liste. sessionStorage gilt nur im Tab: ein
     per Ctrl-/Mittelklick geöffneter Tab (window.open mit noopener) startet
     ohne. Darum steht dieselbe Adresse mit Zeitpunkt auch im localStorage
     und dient dort als Rückfall – höchstens LISTE_DAUER_MS alt. */
  function gemerkteListen(speicher) {
    try {
      const roh = (speicher || sessionStorage).getItem(LISTE_SPEICHER);
      const karte = roh ? JSON.parse(roh) : null;
      return karte && typeof karte === "object" ? karte : {};
    } catch (e) {
      return {};
    }
  }

  function eigeneListenAdresse(url) {
    // Nur eigene Adressen der Hauptseite, und nur im selben Modus.
    return typeof url === "string" && /^(index(\.html)?)?[?#]/.test(url)
      && (/[?&]mock=1(&|#|$)/.test(url)) === istMock();
  }

  /* Die Filter einer Liste im Format des Hashs der Hauptseite
     («#benutzer?pg=Visio2019&ps=1»). filter: URLSearchParams, Text
     («pg=…&ps=…») oder ein Objekt; dessen bekannte Schlüssel heissen wie in
     app.js (parameterVon): suche → q, programm → pg, stufe → ps; andere
     Schlüssel gehen unverändert durch. Leere Werte fallen weg. */
  const FILTER_PARAMETER = { suche: "q", programm: "pg", stufe: "ps" };

  function filterText(filter) {
    if (!filter) return "";
    let p;
    if (filter instanceof URLSearchParams) p = new URLSearchParams(filter);
    else if (typeof filter === "string") p = new URLSearchParams(filter.replace(/^[?#]/, ""));
    else {
      p = new URLSearchParams();
      for (const k of Object.keys(filter)) {
        const w = filter[k];
        if (w === undefined || w === null || w === "" || w === false) continue;
        p.set(FILTER_PARAMETER[k] || k, String(w));
      }
    }
    return p.toString();
  }

  const adresse = {
    mock: istMock,

    client: function (liste, id, optionen) {
      const o = adressOptionen(optionen);
      return adresseBauen("client.html", [["liste", liste || "admin"], ["id", o.neu ? null : id],
        ["neu", !!o.neu], ["vorlage", o.vorlage]], o.bereich);
    },
    benutzer: function (id, optionen) {
      const o = adressOptionen(optionen);
      return adresseBauen("benutzer.html", [["id", o.neu ? null : id], ["neu", !!o.neu]], o.bereich);
    },
    /* «Nummer erfassen» im Benutzerfenster: { neu: true, benutzer: <Listen-ID> }.
       Nur die ID steht in der Adresse – Nummer und Name liest das Formular
       selbst aus der Zeile der Person (nichts Persönliches in der Adresse). */
    telefon: function (id, optionen) {
      const o = adressOptionen(optionen);
      return adresseBauen("telefon.html", [["id", o.neu ? null : id], ["neu", !!o.neu],
        ["benutzer", o.neu ? o.benutzer : null], ["vorlage", o.vorlage]], o.bereich);
    },
    software: function (id, optionen) {
      const o = adressOptionen(optionen);
      return adresseBauen("software.html", [["id", o.neu ? null : id], ["neu", !!o.neu]], o.bereich);
    },
    kamera: function (id, optionen) {
      const o = adressOptionen(optionen);
      return adresseBauen("kamera.html", [["id", o.neu ? null : id], ["neu", !!o.neu]], o.bereich);
    },
    kamerarolle: function (id, optionen) {
      const o = adressOptionen(optionen);
      return adresseBauen("kamerarolle.html", [["id", id]], o.bereich);
    },
    liste: function (tab, filter) {
      const f = filterText(filter);
      return adresseBauen("index.html", [], (tab || STARTZIEL) + (f ? "?" + f : ""));
    },

    /* Die Hauptseite merkt sich beim Öffnen eines Detailfensters die volle
       Listenadresse samt Filtern im Hash, je Liste. sessionStorage, weil
       document.referrer wegen «Referrer-Policy: no-referrer» leer ist; dazu
       localStorage mit Zeitpunkt für Tabs, die ohne sessionStorage starten. */
    listeMerken: function (adresseText) {
      let url = adresseText;
      if (!url) {
        const datei = location.pathname.split("/").pop() || "index.html";
        url = datei + location.search + location.hash;
      }
      const hash = url.indexOf("#") === -1 ? "" : url.slice(url.indexOf("#") + 1);
      const tab = hash.split("?")[0] || STARTZIEL;
      const karte = gemerkteListen();
      karte[tab] = url;
      try { sessionStorage.setItem(LISTE_SPEICHER, JSON.stringify(karte)); } catch (e) { /* privat */ }
      try {
        const dauer = gemerkteListen(localStorage);
        dauer[tab] = { url: url, zeit: Date.now() };
        localStorage.setItem(LISTE_SPEICHER, JSON.stringify(dauer));
      } catch (e) { /* privat oder voll: der Tab-Speicher genügt */ }
      return url;
    },

    zurueckZurListe: function (tab) {
      const ziel = tab || STARTZIEL;
      const url = gemerkteListen()[ziel];
      if (eigeneListenAdresse(url)) return url;
      let dauer = null;
      try { dauer = gemerkteListen(localStorage)[ziel]; } catch (e) { dauer = null; }
      if (dauer && eigeneListenAdresse(dauer.url) && Date.now() - Number(dauer.zeit) < LISTE_DAUER_MS) {
        return dauer.url;
      }
      return adresse.liste(ziel);
    }
  };

  /* ==================================================================
     Hauptziele (Schublade der Hauptseite) – einzige Quelle
     ================================================================== */

  /* Jedes Modul beginnt mit seiner eigenen Übersicht. In der Schublade heisst
     sie schlicht «Übersicht» (der Gruppentitel sagt, wovon); Seitentitel und
     Zurück-Links nennen das Modul (titel). */
  const HAUPTZIELE = [
    { titel: "Geräte", eintraege: [
      { schluessel: "geraete", text: "Übersicht", titel: "Geräte", sinnbild: "uebersicht" },
      { schluessel: "admin", text: "ADMIN-Clients", sinnbild: "admin" },
      { schluessel: "edu", text: "EDU-Clients", sinnbild: "edu" }
    ] },
    { titel: "Verzeichnis", eintraege: [
      { schluessel: "verzeichnis", text: "Übersicht", titel: "Verzeichnis", sinnbild: "uebersicht" },
      { schluessel: "benutzer", text: "Benutzer", sinnbild: "benutzer" },
      { schluessel: "telefone", text: "Telefonnummern", sinnbild: "telefon" },
      { schluessel: "software", text: "Software", sinnbild: "software" }
    ] },
    { titel: "Videoüberwachung", eintraege: [
      { schluessel: "videoueberwachung", text: "Übersicht", titel: "Videoüberwachung", sinnbild: "uebersicht" },
      { schluessel: "kameras", text: "Kameras", sinnbild: "kamera" },
      { schluessel: "kamerarechte", text: "Kamerarechte", sinnbild: "schild" }
    ] }
  ];
  for (const g of HAUPTZIELE) for (const e of g.eintraege) e.href = adresse.liste(e.schluessel);

  function zielText(schluessel) {
    for (const g of HAUPTZIELE) for (const e of g.eintraege) if (e.schluessel === schluessel) return e.titel || e.text;
    return zielText(STARTZIEL);
  }

  /* ==================================================================
     Rahmen aufbauen
     ================================================================== */

  const body = document.body;
  let app = body ? body.querySelector(":scope > .ds-app") : null;
  const seite = app ? app.getAttribute("data-seite") : null;
  const bereit = !!seite;

  let sprungmarke = null, kopf = null, schublade = null, schubladeListe = null, schleier = null;
  let schubladeZurueck = null;
  let menueKnopf = null, tafelRahmen = null, tafel = null, inhaltRahmen = null, bahn = null;
  let ladebalken = null, region = null;
  let zustandsBlock = null, vorfuehrBanner = null;
  let kapsel = null, kontoText = null, kontoInitiale = null, kontoName = null, kontoEmail = null;
  let kapselTrenner = null, abmeldenKnopf = null, abmeldenRueckruf = null;
  let indikator = null;

  /* Ein Teil des Gerüsts über seine id, sonst neu (ohne Platz im DOM). */
  function sichern(id, tag, klasse) {
    let k = document.getElementById(id);
    if (!k) {
      k = el(tag, klasse);
      k.id = id;
    }
    if (klasse) k.classList.add(klasse);
    return k;
  }

  /* Die Meldungsregion: direkt nach .ds-app, ohne role und aria-live (die
     Ansagen legt DS.overlay.toast daneben an). Ohne Rahmen am Ende von
     body. DS.overlay zieht sie in ein offenes Dialog oder Blatt um und
     bringt sie danach zurück; der Verweis hier bleibt gültig. */
  function regionHolen() {
    if (region) return region;
    region = body ? body.querySelector(":scope > .ds-toasts") : null;
    if (!region && body) {
      region = el("div", "ds-toasts");
      if (app) app.after(region);
      else body.appendChild(region);
    }
    return region;
  }

  /* Die Wortmarke wartet beim harten Laden auf ihre Schrift: in der
     Ersatzschrift ist sie 22 px schmaler und spränge nach ~150 ms in die
     richtige Breite (Archivo kommt mit display=swap). Ist die Schrift schon
     da (Seitenwechsel aus dem Speicher), zeigt sie sich sofort; sonst
     höchstens SCHRIFT_WARTEN_MS unsichtbar, nie länger. */
  const markenWartend = [];
  let markeSchriftDa = false;

  function wortmarke() {
    // Eine Marke nur aus dem Namen (.ds-brand__name): Dashboard-Style setzt
    // ihren Text auf die Kante der Navigationssinnbilder und lässt ihn auf
    // dem Telefon stehen.
    const w = el("span", "ds-brand__name wortmarke");
    w.appendChild(document.createTextNode("ICT"));
    w.appendChild(el("span", "wortmarke-punkt", "."));
    w.appendChild(document.createTextNode("INVENTAR"));
    if (!markeSchriftDa) {
      w.setAttribute("data-schrift-wartet", "");
      markenWartend.push(w);
    }
    return w;
  }

  function markenZeigen() {
    markeSchriftDa = true;
    for (const w of markenWartend.splice(0)) w.removeAttribute("data-schrift-wartet");
  }

  function markenSchriftAbwarten() {
    let da = false;
    try { da = !document.fonts || document.fonts.check(SCHRIFT_MARKE); } catch (e) { da = true; }
    if (da) { markenZeigen(); return; }
    setTimeout(markenZeigen, SCHRIFT_WARTEN_MS);
    document.fonts.load(SCHRIFT_MARKE).then(markenZeigen, markenZeigen);
  }

  /* Konto und «Abmelden» der zuletzt gezeigten Seite (sessionStorage, je
     Modus): kopfBauen belegt den Kopf damit vor, die Seite überschreibt ihn
     nur noch an Ort und Stelle. Sonst stünde der rechte Teil des Kopfs nach
     jedem Seitenwechsel einen Moment leer und spränge dann herein – bei
     echter Anmeldung bis Auth.anmeldungSicherstellen() fertig ist. */
  function kopfGemerkt() {
    try {
      const roh = sessionStorage.getItem(KOPF_SPEICHER);
      const alles = roh ? JSON.parse(roh) : null;
      const k = alles && typeof alles === "object" ? alles[istMock() ? "mock" : "echt"] : null;
      return k && typeof k === "object" ? k : {};
    } catch (e) {
      return {};
    }
  }

  function kopfMerken(aendern) {
    try {
      const roh = sessionStorage.getItem(KOPF_SPEICHER);
      const alles = (roh ? JSON.parse(roh) : null) || {};
      const modus = istMock() ? "mock" : "echt";
      const k = alles[modus] && typeof alles[modus] === "object" ? alles[modus] : {};
      aendern(k);
      alles[modus] = k;
      sessionStorage.setItem(KOPF_SPEICHER, JSON.stringify(alles));
    } catch (e) { /* privat: der Kopf füllt sich dann eben erst mit den Daten */ }
  }

  function geruestSichern() {
    app.classList.add("ds-app", "ds-app--drawer");

    sprungmarke = app.querySelector(":scope > .ds-skip");
    if (!sprungmarke) {
      sprungmarke = el("a", "ds-skip", "Zum Inhalt");
      sprungmarke.href = "#inhalt";
      app.insertBefore(sprungmarke, app.firstChild);
    }

    kopf = sichern("kopf", "div", "ds-topbar");
    if (!kopf.parentNode) sprungmarke.after(kopf);
    schublade = sichern("schublade", "nav", "ds-drawer");
    if (!schublade.parentNode) kopf.after(schublade);
    // Der Schleier steht VOR der Schublade (er deckt nur die Seite); ein
    // Klick darauf schliesst die modale Schublade (DS.overlay).
    schleier = app.querySelector(":scope > .ds-scrim");
    if (!schleier) {
      schleier = el("div", "ds-scrim");
      app.insertBefore(schleier, schublade);
    }

    tafel = sichern("tafel", "main", "ds-view");
    if (!tafel.hasAttribute("tabindex")) tafel.tabIndex = -1;
    tafelRahmen = tafel.parentElement && tafel.parentElement.classList.contains("ds-panel")
      ? tafel.parentElement : null;
    if (!tafelRahmen) {
      // Der Rahmen rundet die Tafel ab, ohne dass ihre Rollleiste die Ecke
      // eckig macht (Dashboard-Style .ds-panel).
      tafelRahmen = el("div", "ds-panel");
      if (tafel.parentNode) tafel.parentNode.insertBefore(tafelRahmen, tafel);
      else schublade.after(tafelRahmen);
      tafelRahmen.appendChild(tafel);
    }

    // Die Bahn: .ds-content (Polster, Container) > .ds-page#inhalt (Breite, Rhythmus).
    bahn = sichern("inhalt", "div", "ds-page");
    if (!bahn.parentNode) tafel.appendChild(el("div", "ds-content")).appendChild(bahn);
    inhaltRahmen = bahn.parentElement;

    zustandsBlock = el("div", "bahn-zustand");
    bahn.insertBefore(zustandsBlock, bahn.firstChild);
    regionHolen();
  }

  function kopfBauen() {
    menueKnopf = knopf({ variante: "sinnbild", sinnbild: "menue", titel: "Navigation", klasse: "ds-topbar__menu" });
    menueKnopf.setAttribute("aria-label", "Navigation öffnen");
    menueKnopf.setAttribute("aria-controls", "schublade");
    menueKnopf.setAttribute("aria-expanded", "false");
    menueKnopf.addEventListener("click", function () {
      if (schubladeOffen()) schubladeSchliessen();
      else schubladeOeffnen();
    });

    const marke = el("a", "ds-brand");
    marke.href = adresse.liste(STARTZIEL);
    marke.setAttribute("aria-label", "ICT-Inventar, zur Übersicht");
    marke.appendChild(wortmarke());

    // Rechts EINE Kapsel (.ds-account--capsule): die Initiale in jeder
    // Breite (role=img, nennt das Konto selbst und zeigt es im Tooltip,
    // auch auf Antippen), Name und E-Mail daneben (aria-hidden, unter
    // 720 px weg), ein Trenner und «Abmelden».
    kapsel = el("div", "ds-account ds-account--capsule");
    kapsel.hidden = true;
    kontoText = el("div", "ds-account__text");
    kontoText.setAttribute("aria-hidden", "true");
    kontoName = el("div", "ds-account__name");
    kontoEmail = el("div", "ds-account__email");
    kontoText.appendChild(kontoName);
    kontoText.appendChild(kontoEmail);
    kontoInitiale = el("span", "ds-account__avatar");
    kontoInitiale.setAttribute("role", "img");
    kontoInitiale.tabIndex = 0;
    kontoText.hidden = true;
    kontoInitiale.hidden = true;

    kapselTrenner = el("span", "ds-account__divider");
    kapselTrenner.setAttribute("aria-hidden", "true");

    abmeldenKnopf = knopf({ text: "Abmelden", variante: "leise" });
    abmeldenKnopf.hidden = true;
    abmeldenKnopf.addEventListener("click", function (ev) { if (abmeldenRueckruf) abmeldenRueckruf(ev); });

    UI.anhaengen(kapsel, [kontoText, kontoInitiale, kapselTrenner, abmeldenKnopf]);

    UI.leeren(kopf);
    kopf.appendChild(menueKnopf);
    kopf.appendChild(marke);
    kopf.appendChild(kapsel);

    // Vorbelegen mit dem Konto der letzten Seite (siehe kopfGemerkt). Ein
    // vorbelegtes «Abmelden» bleibt bis zum Aufruf der Seite ohne Wirkung.
    const g = kopfGemerkt();
    if (g.konto) kontoZeigen(g.konto);
    if (g.abmelden && !istMock()) {
      abmeldenRueckruf = function () { if (typeof Auth !== "undefined" && Auth.abmelden) Auth.abmelden(); };
      abmeldenKnopf.hidden = false;
    }
    kapselAbgleichen();
  }

  function schubladeBauen() {
    schublade.tabIndex = -1;
    if (!schublade.getAttribute("aria-label")) {
      schublade.setAttribute("aria-label", seite === "index" ? "Hauptnavigation" : "Bereiche");
    }
    const schubladeKopf = el("div", "ds-drawer__head");
    schubladeKopf.setAttribute("aria-hidden", "true");
    schubladeKopf.appendChild(wortmarke());
    // Der Zurück-Eintrag (.ds-drawer__back) steht über der Liste und rollt
    // nicht mit ihr; eine Haarlinie auf der Textkante trennt ihn ab.
    schubladeZurueck = el("div", "ds-drawer__back");
    schubladeZurueck.hidden = true;
    schubladeListe = el("div", "ds-drawer__list");
    UI.leeren(schublade);
    schublade.appendChild(schubladeKopf);
    schublade.appendChild(schubladeZurueck);
    schublade.appendChild(schubladeListe);
  }

  function verdrahten() {
    // Die Sprungmarke fokussiert die Tafel, ohne einen #Hash in die Adresse
    // zu schreiben: die Hauptseite führt ihren Zustand im Hash.
    sprungmarke.addEventListener("click", function (ev) {
      ev.preventDefault();
      tafel.focus({ preventScroll: true });
    });

    // data-scrolled an .ds-app (Kante und Tönung oben), über einen 1-px-
    // Wächter von Dashboard-Style statt eines scroll-Listeners.
    DS.dom.watchScrolled(tafel);

    schubladeListe.addEventListener("click", beiSchubladeKlick);
  }

  function indexAktiv() {
    const h = (location.hash || "").replace(/^#/, "").split("?")[0];
    for (const g of HAUPTZIELE) for (const e of g.eintraege) if (e.schluessel === h) return h;
    return STARTZIEL;
  }

  /* ==================================================================
     Schublade: Navigation, Pille, Zähler
     ================================================================== */

  const nav = { signatur: null, aktiv: null, beiWahl: null };
  /** Die letzte Wahl kam aus der modalen Schublade: der Fokus geht danach
      auf die neue Seite (er stünde sonst auf dem Menüknopf). */
  let wahlAusModal = false;

  function eintraege() {
    return schubladeListe ? Array.from(schubladeListe.querySelectorAll(".ds-drawer__item")) : [];
  }

  function eintragVon(schluessel) {
    const s = String(schluessel);
    return eintraege().filter(function (k) { return k.getAttribute("data-schluessel") === s; })[0] || null;
  }

  function markieren(schluessel) {
    const s = schluessel === null || schluessel === undefined ? null : String(schluessel);
    for (const k of eintraege()) {
      if (s !== null && k.getAttribute("data-schluessel") === s) k.setAttribute("aria-current", "page");
      else k.removeAttribute("aria-current");
    }
  }

  function eintragBauen(e) {
    const k = el(e.href ? "a" : "button", "ds-drawer__item");
    if (e.href) k.href = e.href;
    else k.type = "button";
    k.setAttribute("data-schluessel", String(e.schluessel));
    if (e.sinnbild) k.appendChild(UI.sinnbild(e.sinnbild, 20));
    k.appendChild(el("span", "ds-drawer__label", e.text));
    // Zähler am Ende (.ds-drawer__count); der Screenreader liest «Benutzer, 12».
    const zaehler = el("span", "ds-drawer__count");
    zaehler.hidden = true;
    zaehler.appendChild(el("span", "ds-sr", ", "));
    zaehler.appendChild(el("span", "schublade-zahl"));
    k.appendChild(zaehler);
    return k;
  }

  /* Die Pille (DS.indicator über Bewegung.indikator) folgt aria-current
     selbst und gleitet zum neuen Eintrag. Neu gesetzt springt sie an ihren
     Platz: beim Bauen der Liste und vor dem ersten Inhalt. zeigen (reveal):
     ist die Liste höher als das Fenster, rollt nur sie den aktiven Eintrag
     ins Bild und behält ihren Griff sichtbar (.ds-drawer__list--overflow). */
  function pilleSetzen() {
    if (indikator) { indikator.zerstoeren(); indikator = null; }
    if (!eintraege().length) return;
    indikator = Bewegung.indikator(schubladeListe, {
      aktiv: "[aria-current=\"page\"]", klasse: "ds-drawer__indicator", zeigen: true
    });
  }

  function listeBauen(gruppen, aktiv) {
    if (indikator) { indikator.zerstoeren(); indikator = null; }
    UI.leeren(schubladeListe);
    gruppen.forEach(function (g, i) {
      const gruppe = el("div", "ds-drawer__group");
      if (g.titel) {
        const id = "schublade-gruppe-" + i;
        const titel = el("p", "ds-drawer__heading", g.titel);
        titel.id = id;
        gruppe.setAttribute("role", "group");
        gruppe.setAttribute("aria-labelledby", id);
        gruppe.appendChild(titel);
      }
      for (const e of g.eintraege) gruppe.appendChild(eintragBauen(e));
      schubladeListe.appendChild(gruppe);
    });
    nav.aktiv = aktiv;
    // Der aktive Eintrag ist vom ersten Bild an markiert: nichts blendet
    // beim Laden an seinen Platz, die Pille springt (gleitet nicht).
    markieren(aktiv);
    pilleSetzen();
  }

  /* Zurück-Eintrag der Detailseiten: ein schlichter Link zur Liste (keine
     Pille, kein beiWahl – er verlässt die Seite). Er steht über den Gruppen
     und trägt den Namen der Liste; der Pfeil sagt «zurück», das aria-label
     auch dem Screenreader. Solange er steht und die Schublade fest daneben
     steht (über 900 px), blendet Dashboard-Style den Zurück-Link über dem
     Seitentitel (.ds-page-head__back) aus. */
  const zurueckStand = { signatur: null };

  function zurueckSetzen(z) {
    const gueltig = !!(z && z.href && z.text);
    const signatur = gueltig ? z.text + "\u0000" + z.href : "";
    if (signatur === zurueckStand.signatur) return;
    zurueckStand.signatur = signatur;
    UI.leeren(schubladeZurueck);
    schubladeZurueck.hidden = !gueltig;
    if (!gueltig) return;
    const a = el("a", "ds-drawer__item schublade-eintrag-zurueck");
    a.href = z.href;
    a.setAttribute("aria-label", "Zurück zu " + z.text);
    a.setAttribute("data-tip", "Zurück zu " + z.text);
    a.appendChild(UI.sinnbild("pfeilLinks", 20));
    a.appendChild(el("span", "ds-drawer__label", z.text));
    schubladeZurueck.appendChild(a);
  }

  function navigation(optionen) {
    if (!bereit) return;
    const o = optionen || {};
    const verstecken = !!o.verstecken;
    if (verstecken !== app.hasAttribute("data-drawer-hidden")) {
      if (verstecken) {
        schubladeSchliessen();
        app.setAttribute("data-drawer-hidden", "");
      } else {
        // Kommt die Schublade wieder, gleitet sie von links herein
        // (Dashboard-Style: data-drawer-hidden weg, dann enter(drawer)).
        app.removeAttribute("data-drawer-hidden");
        Bewegung.eintreten(schublade);
      }
    }
    zurueckSetzen(verstecken ? null : o.zurueck);
    if (o.label) schublade.setAttribute("aria-label", o.label);
    nav.beiWahl = typeof o.beiWahl === "function" ? o.beiWahl : null;

    const gruppen = (verstecken ? [] : (o.gruppen || [])).filter(function (g) {
      return g && g.eintraege && g.eintraege.length;
    });
    const signatur = JSON.stringify(gruppen.map(function (g) {
      return [g.titel || "", g.eintraege.map(function (e) {
        return [String(e.schluessel), e.text || "", e.sinnbild || "", e.href || ""];
      })];
    }));
    const aktiv = o.aktiv === undefined ? nav.aktiv : o.aktiv;
    if (signatur !== nav.signatur) {
      nav.signatur = signatur;
      listeBauen(gruppen, aktiv);
    } else {
      aktivSetzen(aktiv);
    }
    for (const g of gruppen) {
      for (const e of g.eintraege) if (Object.prototype.hasOwnProperty.call(e, "zahl")) zahl(e.schluessel, e.zahl);
    }
  }

  function aktivSetzen(schluessel) {
    if (!bereit) return;
    nav.aktiv = schluessel;
    markieren(schluessel);
    // Vor dem ersten Inhalt (die Seite korrigiert beim Start den aktiven
    // Eintrag) springt die Pille, statt beim Laden schon zu gleiten;
    // danach folgt sie aria-current selbst.
    if (!inhaltGezeigt) pilleSetzen();
  }

  function zahl(schluessel, wert) {
    if (!bereit) return;
    const k = eintragVon(schluessel);
    if (!k) return;
    const text = (wert === null || wert === undefined || wert === false || wert === "")
      ? "" : (typeof wert === "number" ? zahlText(wert) : String(wert));
    const zaehler = k.querySelector(".ds-drawer__count");
    const warLeer = zaehler.hidden;
    UI.textSetzen(zaehler.querySelector(".schublade-zahl"), text);
    zaehler.hidden = !text;
    // Ein Zähler, der erscheint, ploppt; ein neuer Wert ändert sich ohne Bewegung.
    if (warLeer && text) Bewegung.eintreten(zaehler, "ploppen");
  }

  /* Ein schlichter Klick auf einen Eintrag geht an beiWahl. Kam er aus der
     modalen Schublade, schliesst sie im Wechsel selbst (Rahmen.wechseln, so
     blendet die neue Ansicht unter ihr durch) – oder hier, wenn die Seite
     gar nicht wechselt (derselbe Eintrag, ein Abschnitt der Seite). */
  function beiSchubladeKlick(ev) {
    const k = ev.target && ev.target.closest ? ev.target.closest(".ds-drawer__item") : null;
    if (!k || !schubladeListe.contains(k)) return;
    const modifiziert = ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey;
    const warModal = schubladeOffen();
    if (nav.beiWahl && !modifiziert) {
      ev.preventDefault();
      wahlAusModal = warModal;
      const vorher = wechselMarke;
      try {
        nav.beiWahl(k.getAttribute("data-schluessel"), ev);
      } finally {
        if (vorher === wechselMarke) {
          wahlAusModal = false;
          if (warModal) schubladeSchliessen();
        }
      }
      return;
    }
    // Ein neuer Tab oder eine echte Navigation: die Schublade geht sofort.
    if (warModal) schubladeSchliessen();
  }

  /* ---------- Modale Schublade (≤ 900 px, DS.overlay) ---------- */

  function schubladeOffen() {
    return !!app && app.hasAttribute("data-drawer-open");
  }

  /* DS.overlay öffnet sie nur ≤ 900 px (darüber steht sie fest), setzt
     data-drawer-open und aria-expanded, fängt den Fokus, schliesst mit Esc
     und dem Schleier und beim Wachsen über 900 px. */
  /* ausloeser: wohin der Fokus nach dem Schliessen zurückgeht (Standard:
     der Menüknopf im Kopf), wenn eine Seite die Schublade aus einem
     anderen Knopf öffnet. */
  function schubladeOeffnen(optionen) {
    if (!bereit || app.hasAttribute("data-drawer-hidden")) return;
    const o = optionen && !(optionen instanceof Event) ? optionen : {};
    // DS.overlay fokussiert den aktiven Eintrag; der Fokus rollt ihn ins Bild.
    DS.overlay.open(schublade, { opener: o.ausloeser || menueKnopf });
  }

  function schubladeSchliessen() {
    if (!bereit || !schubladeOffen()) return Promise.resolve();
    return DS.overlay.close(schublade);
  }

  /* ==================================================================
     Kopf: Konto und Abmelden in einer Kapsel
     ================================================================== */

  /* Die Kapsel zeigt sich, sobald sie etwas trägt; den Trenner vor einem
     verborgenen «Abmelden» blendet Dashboard-Style selbst aus. */
  function kapselAbgleichen() {
    const ohneKonto = kontoInitiale.hidden;
    kapsel.hidden = ohneKonto && abmeldenKnopf.hidden;
    kapselTrenner.hidden = ohneKonto;
  }

  /* Die Initiale nennt das Konto in jeder Breite (aria-label, Tooltip);
     Name und E-Mail daneben sind nur fürs Auge (aria-hidden). */
  function kontoZeigen(k) {
    const name = k && k.name ? String(k.name) : "";
    const email = k && (k.email || k.adresse) ? String(k.email || k.adresse) : "";
    const ohne = !name && !email;
    kontoText.hidden = ohne;
    kontoInitiale.hidden = ohne;
    UI.textSetzen(kontoName, name || email);
    UI.textSetzen(kontoEmail, name ? email : "");
    const erstes = Array.from((name || email).trim())[0] || "?";
    kontoInitiale.textContent = erstes.toLocaleUpperCase("de-CH");
    kontoInitiale.setAttribute("aria-label", email ? "Angemeldet als " + [name, email].filter(Boolean).join(", ") : name);
    kontoInitiale.setAttribute("data-tip", [name, email].filter(Boolean).join("\n"));
    kapselAbgleichen();
    return { name: name, email: email };
  }

  function konto(k) {
    if (!bereit) return;
    const gezeigt = kontoZeigen(k);
    kopfMerken(function (m) { m.konto = gezeigt.name || gezeigt.email ? gezeigt : null; });
  }

  function abmelden(beiKlick) {
    if (!bereit) return;
    abmeldenRueckruf = typeof beiKlick === "function" ? beiKlick : null;
    abmeldenKnopf.hidden = !abmeldenRueckruf;
    kapselAbgleichen();
    kopfMerken(function (m) { m.abmelden = !!abmeldenRueckruf; });
  }

  /* ==================================================================
     Vorführmodus: Warn-Banner als erster Block der Bahn
     ================================================================== */

  let vorfuehrRueckruf = null;

  function vorfuehrung(o) {
    if (!bereit) return;
    if (!o) {
      if (vorfuehrBanner) vorfuehrBanner.remove();
      vorfuehrBanner = null;
      return;
    }
    vorfuehrRueckruf = typeof o.beiZuruecksetzen === "function" ? o.beiZuruecksetzen : null;
    const k = knopf({ text: "Vorführdaten zurücksetzen", variante: "leise" });
    k.addEventListener("click", vorfuehrungZuruecksetzen);
    const neu = UI.banner({
      ton: "warnung",
      text: o.text || "Vorführmodus mit erfundenen Daten. Änderungen bleiben nur in diesem Browser.",
      knopf: vorfuehrRueckruf ? k : null
    });
    neu.classList.add("bahn-vorfuehrung");
    if (vorfuehrBanner && vorfuehrBanner.parentNode) vorfuehrBanner.replaceWith(neu);
    else bahn.insertBefore(neu, bahn.firstChild);
    vorfuehrBanner = neu;
  }

  async function vorfuehrungZuruecksetzen() {
    const ja = await bestaetigen({
      titel: "Vorführdaten zurücksetzen?",
      text: "Alle Änderungen im Vorführmodus gehen verloren.",
      ja: "Zurücksetzen"
    });
    if (ja && vorfuehrRueckruf) vorfuehrRueckruf();
  }

  /* ==================================================================
     Seitenkopf: EIN Bauer für den Kopf jeder Ansicht und jeder Detailseite
     (.ds-page-head von Dashboard-Style mit __back, __row, __text, __status
     und __actions). Leere Teile nehmen keinen Platz (Dashboard-Style).
     ================================================================== */

  function teileListe(unter) {
    return (Array.isArray(unter) ? unter : (unter ? [unter] : [])).filter(function (t) {
      return t !== null && t !== undefined && t !== "" && t !== false;
    });
  }

  function seitenkopfSetzen(k, w) {
    const s = w || {};
    if (Object.prototype.hasOwnProperty.call(s, "pfad")) {
      const p = s.pfad;
      if (!p || !p.href) {
        k.pfad.hidden = true;
      } else {
        UI.textSetzen(k.pfadText, p.text || "Zurück");
        if (k.pfad.getAttribute("href") !== p.href) k.pfad.setAttribute("href", p.href);
        k.pfad.hidden = false;
      }
    }
    if (s.titel !== undefined) UI.textSetzen(k.titel, s.titel);
    if (s.lead !== undefined) UI.textSetzen(k.lead, s.lead);
    if (s.unter !== undefined) {
      const teile = teileListe(s.unter);
      UI.leeren(k.unter);
      if (teile.length) k.unter.appendChild(UI.teile(teile));
    }
    if (s.status !== undefined) UI.anhaengen(UI.leeren(k.status), (s.status || []).filter(Boolean));
    if (s.aktionen !== undefined) UI.anhaengen(UI.leeren(k.aktionen), (s.aktionen || []).filter(Boolean));
  }

  function seitenkopf(optionen) {
    const o = optionen || {};
    const wurzel = o.element || el("header");
    UI.leeren(wurzel);
    wurzel.classList.add("ds-page-head");
    if (o.id) wurzel.id = o.id;

    // Zurück-Link «‹ ADMIN-Clients»: ein echter Link (Mittelklick = neuer
    // Tab); der Screenreader liest «Zurück zu ADMIN-Clients». Steht die
    // Schublade fest daneben und trägt sie den Zurück-Eintrag, blendet
    // Dashboard-Style ihn aus.
    const pfad = el("a", "ds-btn ds-btn--text ds-btn--sm ds-page-head__back");
    pfad.appendChild(UI.sinnbild("pfeilLinks", 18));
    pfad.appendChild(el("span", "ds-sr", "Zurück zu "));
    const pfadText = el("span");
    pfad.appendChild(pfadText);
    pfad.hidden = true;

    const zeile = el("div", "ds-page-head__row");
    const textTeil = el("div", "ds-page-head__text");
    // Programmatisches Fokusziel beim Seiten- und Zustandswechsel (ohne Ring).
    const titel = el("h" + (o.ebene || 1), "ds-page-head__title");
    titel.tabIndex = -1;
    if (o.titelId) titel.id = o.titelId;
    const lead = el("p", "ds-page-head__lead");
    // Die Teile-Zeile («Haus A · Latitude 5540 · SN …») sieht aus wie der Lead.
    const unter = el("p", "ds-page-head__lead seitenkopf-unter");
    const status = el("div", "ds-page-head__status");
    const aktionen = el("div", "ds-page-head__actions");
    UI.anhaengen(textTeil, [titel, lead, unter, status]);
    UI.anhaengen(zeile, [textTeil, aktionen]);
    UI.anhaengen(wurzel, [pfad, zeile]);

    const knoten = { wurzel: wurzel, pfad: pfad, pfadText: pfadText, titel: titel, lead: lead,
      unter: unter, status: status, aktionen: aktionen };
    wurzel.knoten = knoten;
    wurzel.setzen = function (w) { seitenkopfSetzen(knoten, w); return wurzel; };
    seitenkopfSetzen(knoten, o);
    return wurzel;
  }

  /* ==================================================================
     Zustände der Tafel: laden, fehler, ende, inhalt
     ================================================================== */

  let zustandJetzt = "inhalt";
  let ladeStart = 0;
  let zustandsMarke = 0;
  let inhaltGezeigt = false;
  let ladeSkelett = null, ladeMeta = null, ladeText = "", ladeFortschritt = "";

  /** Der Ladezustand hat den Fokus aus dem Inhalt oder dem Zustandsblock
      («Erneut laden») an die Tafel genommen: der nächste Fehler- oder
      Inhaltszustand gibt ihn an seinen Titel weiter, statt ihn auf der
      Tafel (bzw. body) liegen zu lassen. */
  let fokusGeparkt = false;

  /* Der Seiteninhalt der Bahn: alles ausser Vorführ-Banner und Zustand. */
  function inhaltsKinder() {
    if (!bahn) return [];
    return Array.from(bahn.children).filter(function (k) {
      return k !== zustandsBlock && !k.classList.contains("bahn-vorfuehrung");
    });
  }

  function fokusImInhalt() {
    const a = aktivesElement();
    return !!a && inhaltsKinder().some(function (k) { return k.contains(a); });
  }

  /* Steht der Fokus noch dort, wo der Ladezustand ihn geparkt hat (auf der
     Tafel, oder er ist schon auf body gefallen)? */
  function fokusNochGeparkt() {
    const a = aktivesElement();
    return fokusGeparkt && (!a || a === tafel);
  }

  /* Der Ladebalken nach Dashboard-Style (Muster «Refresh»): ein
     span.ds-loadbar in .ds-content vor der Bahn; seine Ränder nehmen den
     Platz zurück, nichts rückt. Er blendet nach --ds-delay-loader ein (wie
     das Skelett) und geht mit DS.motion.leave. Jedes Laden bekommt einen
     neuen; ein noch austretender gibt seine id ab. */
  function ladebalkenZeigen() {
    if (ladebalken && ladebalken.isConnected && !ladebalken.hasAttribute("data-ds-leaving")) return;
    ladebalkenWeg();
    ladebalken = el("span", "ds-loadbar");
    ladebalken.id = "ladebalken";
    ladebalken.setAttribute("aria-hidden", "true");
    ladebalken.appendChild(el("span", "ds-loadbar__bar"));
    inhaltRahmen.insertBefore(ladebalken, bahn);
  }

  function ladebalkenWeg() {
    const alt = ladebalken;
    ladebalken = null;
    if (!alt || !alt.isConnected || alt.hasAttribute("data-ds-leaving")) return;
    alt.removeAttribute("id");
    Bewegung.austreten(alt);
  }

  function zustand(art, optionen) {
    if (!bereit) return Promise.resolve(false);
    const o = optionen || {};
    if (art === "laden") return ladenZeigen(o);
    if (art === "fehler" || art === "ende") return endeZeigen(art, o);
    return inhaltZeigen();
  }

  function ladenZeigen(o) {
    if (zustandJetzt !== "laden") {
      zustandsMarke += 1;
      zustandJetzt = "laden";
      ladeStart = Date.now();
      // Was gleich verschwindet, darf den Fokus nicht mit ins Nichts nehmen:
      // der Inhalt und der Zustandsblock («Erneut laden» wird gleich geleert).
      const a = aktivesElement();
      if (fokusImInhalt() || (a && zustandsBlock.contains(a))) {
        tafel.focus({ preventScroll: true });
        fokusGeparkt = true;
      }
      bahn.setAttribute("data-zustand", "laden");
      ladebalkenZeigen();
      const block = el("div", "zustand-laden");
      // Die Fortschrittszeile (.ds-skeleton__note) steht unter den
      // Platzhaltern für Titel und Lead: der Titel-Platzhalter liegt so
      // genau dort, wo der Seitentitel erscheinen wird. Sie ändert sich
      // laufend («ADMIN-Clients 50 / …») und wäre als Teil der Live-Region
      // zu gesprächig; angesagt wird der Text des Skeletts.
      ladeMeta = el("p", "ds-skeleton__note");
      ladeMeta.setAttribute("aria-hidden", "true");
      ladeSkelett = UI.skelettSeite({ karten: o.karten || 2, text: o.text || "Wird geladen …" });
      ladeSkelett.insertBefore(ladeMeta, ladeSkelett.querySelector(".ds-skeleton__card"));
      block.appendChild(ladeSkelett);
      UI.leeren(zustandsBlock).appendChild(block);
      M.resyncScroll(tafel);
      ladeText = "";
      ladeFortschritt = "";
    }
    if (o.text !== undefined) {
      ladeText = o.text || "";
      const sr = ladeSkelett && ladeSkelett.querySelector(".ds-sr");
      if (sr) UI.textSetzen(sr, ladeText || "Wird geladen …");
    }
    if (o.fortschritt !== undefined) ladeFortschritt = o.fortschritt || "";
    UI.textSetzen(ladeMeta, [ladeText, ladeFortschritt].filter(Boolean).join(" · "));
    return Promise.resolve(true);
  }

  function endeZeigen(art, o) {
    zustandsMarke += 1;
    const a = aktivesElement();
    const fokusDrin = fokusImInhalt() || (!!a && zustandsBlock.contains(a)) || fokusNochGeparkt();
    fokusGeparkt = false;
    zustandJetzt = art;
    bahn.setAttribute("data-zustand", art);
    ladebalkenWeg();

    const titel = o.titel || (art === "fehler" ? "Die Daten konnten nicht geladen werden" : "Erledigt");
    // pfad: der Zurück-Link «‹ ADMIN-Clients» bleibt auch im Fehler- und
    // Endzustand stehen – der Weg zurück zur Liste ist nie verbaut.
    const kopfTeil = seitenkopf({ titel: titel, pfad: o.pfad || null });
    const h1 = kopfTeil.knoten.titel;

    const beiKlick = typeof o.beiKlick === "function" ? o.beiKlick : function () { location.reload(); };
    let block;
    if (art === "fehler") {
      // Der Fehlerkasten: Fehlerfarbe, Text, «Erneut laden».
      const text = [o.text, o.hinweis].filter(Boolean).join(" ");
      block = UI.banner({
        ton: "gefahr", rolle: "alert", text: text || "Unbekannter Fehler.",
        knopf: knopf({ text: o.knopfText || "Erneut laden", variante: "leise", beiKlick: beiKlick })
      });
    } else {
      kopfTeil.setzen({ lead: [o.text, o.hinweis].filter(Boolean).join(" ") });
      block = el("div", "ds-form-actions");
      block.appendChild(knopf({ text: o.knopfText || "Zur Übersicht", variante: "primaer", beiKlick: beiKlick }));
    }
    UI.leeren(zustandsBlock);
    zustandsBlock.appendChild(kopfTeil);
    zustandsBlock.appendChild(block);
    dokumentTitel(titel);
    M.resyncScroll(tafel);
    Bewegung.aufdecken(zustandsBlock);
    if (fokusDrin || o.fokus) h1.focus({ preventScroll: true });
    return Promise.resolve(true);
  }

  function inhaltZeigen() {
    if (zustandJetzt === "inhalt") return Promise.resolve(false);
    const warLaden = zustandJetzt === "laden";
    const start = ladeStart;
    zustandJetzt = "inhalt";
    const marke = ++zustandsMarke;
    // Eine sichtbar gewordene Ladeanzeige bleibt ihre Mindestzeit stehen
    // (DS.motion.settleLoader liest Verzögerung und Haltezeit am Balken).
    return (warLaden ? M.settleLoader(start, { element: ladebalken || tafel }) : Promise.resolve()).then(function () {
      if (marke !== zustandsMarke) return false;
      ladebalkenWeg();
      bahn.removeAttribute("data-zustand");
      UI.leeren(zustandsBlock);
      ladeSkelett = null;
      M.resyncScroll(tafel);
      const kinder = inhaltsKinder().filter(sichtbar);
      for (const k of kinder) Bewegung.aufdecken(k);
      // Kam der Fokus von «Erneut laden» (bzw. aus dem Inhalt) und liegt
      // noch geparkt auf der Tafel: weiter an den Titel der Ansicht.
      if (fokusNochGeparkt()) {
        const titel = kinder.map(function (k) { return k.querySelector("h1, h2"); }).filter(sichtbar)[0];
        if (titel) seiteFokussieren(titel.parentNode);
      }
      fokusGeparkt = false;
      // Staffeln und Hochzählen nur beim allerersten Inhalt, nie beim
      // Nachladen oder nach einem erneuten Versuch.
      if (!inhaltGezeigt) {
        inhaltGezeigt = true;
        for (const k of kinder) Bewegung.auftritt(k, { wurzel: false });
      }
      return true;
    });
  }

  /* ==================================================================
     Still neu zeichnen (Auto-Nachladen, Speichern, Tippen, Filtern)
     ================================================================== */

  /* Der Schlüssel, über den ein neu gebautes Element wiedergefunden wird:
     data-fokus vor id (eine id kann bei jedem Bauen neu vergeben sein),
     zuletzt data-rolle (Roller). Auch der Rückfokus der Ebenen findet so
     einen neu gezeichneten Auslöser wieder. */
  function wiederfindSchluessel(k) {
    if (!k || !k.getAttribute) return null;
    if (k.hasAttribute("data-fokus")) return "[data-fokus=\"" + CSS.escape(k.getAttribute("data-fokus")) + "\"]";
    if (k.id) return "#" + CSS.escape(k.id);
    if (k.hasAttribute("data-rolle")) return "[data-rolle=\"" + CSS.escape(k.getAttribute("data-rolle")) + "\"]";
    return null;
  }

  function istKnotenListe(w) {
    return !!w && typeof w !== "string" && typeof w.length === "number"
      && Array.prototype.every.call(w, function (k) { return k && typeof k.nodeType === "number"; });
  }

  /* zeichnen() baut den Behälter ganz oder teilweise neu – ohne Bewegung –,
     oder es gibt seine neuen Kinder zurück: dann gleicht DS.dom.morphChildren
     sie mit dem Bestand ab, und was bleibt, behält Fokus, Schreibmarke,
     Listener und Rollstand von selbst (der Weg, auf den die Seiten
     umziehen; Zeilen tragen data-ds-key). Danach stehen die Tafel und alle
     inneren Roller (mit data-fokus, id oder data-rolle) wieder dort, wo sie
     waren. Ist das fokussierte Element dabei verschwunden, bekommt sein
     Gegenstück den Fokus (samt Schreibmarke und Rollposition im Feld):
     gefunden über data-fokus/id, sonst das Bedienelement an derselben
     Stelle, sonst der Seitentitel im Behälter. Das Gegenstück zu
     Rahmen.wechseln für Daten, die sich nur ändern; F.zeichneBereich
     benutzt es für die Detailseiten. */
  function stillZeichnen(behaelter, zeichnen) {
    if (!behaelter) { zeichnen(); return; }
    const aktiv = aktivesElement();
    const drin = !!aktiv && aktiv !== behaelter && behaelter.contains(aktiv);
    let schluessel = null, stelle = -1, auswahl = null, feldOben = 0;
    if (drin) {
      schluessel = wiederfindSchluessel(aktiv);
      stelle = fokussierbare(behaelter).indexOf(aktiv);
      try {
        if (typeof aktiv.selectionStart === "number") {
          auswahl = [aktiv.selectionStart, aktiv.selectionEnd, aktiv.selectionDirection];
        }
      } catch (e) { auswahl = null; }   // Feldart ohne Schreibmarke (Datum, Zahl)
      feldOben = aktiv.scrollTop || 0;
    }
    const rollen = [];
    for (const r of behaelter.querySelectorAll("[id], [data-fokus], [data-rolle]")) {
      if (!r.scrollTop && !r.scrollLeft) continue;
      const s = wiederfindSchluessel(r);
      if (s) rollen.push([s, r.scrollTop, r.scrollLeft]);
    }
    const tafelOben = tafel ? tafel.scrollTop : 0;

    const neu = zeichnen();
    if (istKnotenListe(neu)) DS.dom.morphChildren(behaelter, Array.from(neu));

    for (const r of rollen) {
      const k = behaelter.querySelector(r[0]);
      if (!k) continue;
      if (k.scrollTop !== r[1]) k.scrollTop = r[1];
      if (k.scrollLeft !== r[2]) k.scrollLeft = r[2];
    }
    if (tafel && tafel.scrollTop !== tafelOben) tafel.scrollTop = tafelOben;
    if (!drin || (aktiv.isConnected && behaelter.contains(aktiv))) return;

    let ziel = schluessel ? behaelter.querySelector(schluessel) : null;
    if (!ziel && stelle !== -1) {
      const liste = fokussierbare(behaelter);
      ziel = liste[Math.min(stelle, liste.length - 1)] || null;
    }
    if (!ziel) ziel = behaelter.querySelector(".ds-page-head__title");
    if (!ziel || !ziel.focus) return;
    ziel.focus({ preventScroll: true });
    if (auswahl && typeof ziel.setSelectionRange === "function") {
      try { ziel.setSelectionRange(auswahl[0], auswahl[1], auswahl[2] || "none"); } catch (e) { /* ohne Schreibmarke */ }
    }
    if (feldOben) ziel.scrollTop = feldOben;
  }

  /* ==================================================================
     Wechsel innerhalb der Seite (DS.motion.transition, fade-through)
     ================================================================== */

  let wechselMarke = 0;

  function seiteFokussieren(rein) {
    const ziel = rein && rein.querySelector ? rein.querySelector("h1, h2") : null;
    if (ziel) {
      if (!ziel.hasAttribute("tabindex")) ziel.setAttribute("tabindex", "-1");
      ziel.focus({ preventScroll: true });
    } else if (tafel) {
      tafel.focus({ preventScroll: true });
    }
  }

  function ersetzen(knoten) {
    for (const k of inhaltsKinder()) k.remove();
    if (knoten) bahn.appendChild(knoten);
    return knoten;
  }

  /* Mit View Transitions friert Dashboard-Style die Seite ein, ruft das
     Umbauen auf und spielt den Wechsel auf .ds-view (die alte Ansicht geht
     in --ds-dur-instant, die neue blendet ein und wächst); ohne sie tritt
     der zurückgegebene Knoten mit .ds-enter--swap ein. Die modale
     Schublade schliesst im Umbauen: die neue Ansicht blendet unter ihr
     durch. Ein neuerer Aufruf überholt: das Umbauen eines älteren läuft
     dann nicht mehr (sonst stünde dessen Ansicht im Inhalt, Pille und
     Adresse aber auf der neuen). */
  function wechseln(neu, optionen) {
    const o = optionen || {};
    if (!bereit) {
      if (typeof neu === "function") neu();
      return Promise.resolve(false);
    }
    const marke = ++wechselMarke;
    const ausModal = wahlAusModal;
    wahlAusModal = false;
    let rein = [];

    return M.transition(function () {
      if (marke !== wechselMarke) return undefined;
      if (schubladeOffen()) schubladeSchliessen();
      // Der Fokus geht auf die neue Seite nur, wo er sonst verloren wäre: im
      // ausgehenden Inhalt, schon auf <body> oder aus der modalen Schublade.
      const alt = (o.alt ? [].concat(o.alt) : inhaltsKinder()).filter(sichtbar);
      const aktiv = aktivesElement();
      const fokusSeite = alt.length > 0 && (!aktiv || ausModal
        || alt.some(function (k) { return k.contains(aktiv); }));
      const ergebnis = typeof neu === "function" ? neu() : ersetzen(neu);
      rein = (ergebnis ? [].concat(ergebnis) : inhaltsKinder()).filter(sichtbar);
      if (o.nachOben !== false) tafel.scrollTop = 0;
      if (fokusSeite) seiteFokussieren(rein[0]);
      // Gestaffelt werden nur Raster IN der neuen Ansicht, mit ihr zugleich.
      if (o.auftritt !== false) for (const k of rein) Bewegung.auftritt(k, { wurzel: false });
      return rein[0] || bahn;
    }, { type: "fade-through" }).then(function () {
      return marke === wechselMarke;
    });
  }

  /* .ds-view--fill von Dashboard-Style: wo Platz ist (ab 601 × 720 px),
     rollt die Tafel nicht und das letzte sichtbare Kind der Bahn (die
     Ansicht) füllt den Rest; darunter rollt sie, und die Liste ist
     höchstens etwas weniger hoch als das Fenster. */
  function fest(an) {
    if (!tafel || tafel.classList.contains("ds-view--fill") === !!an) return;
    tafel.classList.toggle("ds-view--fill", !!an);
    // Eine Tafel, die jetzt nicht mehr rollt, behält sonst Kante und Tönung.
    M.resyncScroll(tafel);
  }

  function dokumentTitel(text) {
    document.title = (text ? text + " – " : "") + PRODUKT;
  }

  /* ==================================================================
     Ebenen: Dialog und Seitenblatt (native <dialog> über DS.overlay)
     ================================================================== */

  /* Die offenen Ebenen von UI.dialog/UI.blatt, älteste zuerst: für den
     Grund beim Schliessen (beiSchliessen) und den Rückfokus. Fokusfalle,
     inert, Escape, Bildlaufsperre, verschachtelte Schleier, der Schutz des
     Schleiers (kein Schliessen durch den zweiten Klick eines Doppelklicks
     und in den ersten --ds-delay-dismiss), «beschäftigt» (data-ds-busy)
     und der Fokus zurück kommen von DS.overlay. */
  const ebenen = [];
  let ebenenZaehler = 0;

  /* Eine Überlagerung ist offen (Dialog, Blatt, modale Schublade, Menü,
     Vorschlagsliste): die Tastenkürzel der Seiten (Esc, Ctrl+S, «/»)
     gehören dann ihr. DS.overlay.topmost kennt die oberste Ebene, auch die
     von bausteine.js geöffneten; eine schliessende zählt nicht mehr. */
  function ebeneOffen() {
    return !!DS.overlay.topmost();
  }

  /* Der Grund aus dem Ereignis ds-close von DS.overlay, in den Wörtern, die
     beiSchliessen bekommt; was die Seite an schliessen() gibt, kommt
     unverändert zurück. */
  const SCHLIESS_GRUENDE = { escape: "esc", backdrop: "schleier", close: "knopf", api: "schliessen", removed: "schliessen" };

  function rueckrufEinmal(rueckruf) {
    let gerufen = false;
    return function (grund) {
      if (gerufen || typeof rueckruf !== "function") return;
      gerufen = true;
      try { rueckruf(grund); } catch (e) { fehlerMeldungAusnahme(e); }
    };
  }

  /* Ein Element wiederfinden, das die Seite inzwischen neu gezeichnet hat
     (Nachladen, Rundfunkkanal): über data-fokus, sonst die id (wie bei
     Rahmen.stillZeichnen). DS.overlay fragt das nur, wenn der Auslöser weg
     ist; die id allein fände es selbst. */
  function wiederfinden(schluessel) {
    return schluessel ? document.querySelector(schluessel) : null;
  }

  function ebeneOeffnen(ebene) {
    ebenen.push(ebene);
    body.appendChild(ebene.element);
    // Schliesst DS.overlay die Ebene (Esc, Schleier, ×, schliessen()), sagt
    // ds-close, warum – sofort beim Beginn des Austritts. Nur die eigene:
    // ein Dialog aus einem Blatt steckt während er offen ist IM Blatt.
    ebene.element.addEventListener("ds-close", function (ev) {
      if (ev.target !== ebene.element || !ebene.offen) return;
      const grund = ev.detail && ev.detail.reason;
      ebeneGeschlossen(ebene, SCHLIESS_GRUENDE[grund] || grund || "schliessen");
    });
    DS.overlay.open(ebene.element, {
      opener: ebene.ausloeser,
      returnTo: function () {
        const zwilling = wiederfinden(ebene.rueckSchluessel);
        if (zwilling) return zwilling;
        return typeof ebene.fokusZurueck === "function" ? ebene.fokusZurueck() : null;
      }
    });
  }

  /* Zustand und Fokus wechseln sofort (DS.overlay gibt den Fokus im selben
     Takt zurück), nur die Pixel gehen einen Moment später: so kann die
     Seite gleich nach «await UI.bestaetigen(…)» wieder fokussieren und
     schreiben. Ein zweites close() während des Austritts gibt dasselbe
     Promise zurück. */
  function ebeneGeschlossen(ebene, grund) {
    ebene.offen = false;
    const i = ebenen.indexOf(ebene);
    if (i !== -1) ebenen.splice(i, 1);
    ebene.fertig = DS.overlay.close(ebene.element).then(function () { ebene.element.remove(); });
    ebene.melden(grund);
  }

  function ebeneAnlegen(art, element, flaeche, o) {
    const ausloeser = aktivesElement();
    return {
      art: art, element: element, flaeche: flaeche,
      ausloeser: ausloeser, rueckSchluessel: wiederfindSchluessel(ausloeser), fokusZurueck: o.fokusZurueck,
      offen: true, fertig: null, melden: rueckrufEinmal(o.beiSchliessen)
    };
  }

  function schliesserVon(ebene) {
    return function (grund) {
      if (ebene.offen) DS.overlay.close(ebene.element, { reason: grund || "schliessen" });
      return ebene.fertig || Promise.resolve();
    };
  }

  /* Gesperrt (sperren(true), während ein Vorgang aus der Ebene läuft):
     data-ds-busy – Esc, Schleier und [data-close] schliessen nicht,
     schliessen() der Seite schon. Sichtbar ändert sich nichts: der
     beschäftigte Knopf ist die Rückmeldung. */
  function sperrerVon(element) {
    return function (an) { element.toggleAttribute("data-ds-busy", !!an); };
  }

  /* ---------- Dialog ---------- */

  function dialog(optionen) {
    const o = optionen || {};
    const id = "dialog-" + (++ebenenZaehler);
    const wurzel = el("dialog", "ds-dialog" + (o.breit ? " ds-dialog--wide" : "") + (o.klasse ? " " + o.klasse : ""));
    wurzel.setAttribute("role", o.rolle || "dialog");
    wurzel.setAttribute("aria-labelledby", id + "-titel");
    const schleierEl = el("div", "ds-dialog__backdrop");
    schleierEl.setAttribute("data-close", "");
    const flaeche = el("div", "ds-dialog__box");
    const titelEl = el("h2", "ds-dialog__title", o.titel || "");
    titelEl.id = id + "-titel";
    // Der Körper ist die eine Rollfläche: Titel, was darüber steht (oben)
    // und die Knöpfe bleiben stehen (Dashboard-Style, .ds-dialog__body).
    const inhalt = el("div", "ds-dialog__body");
    const knoepfe = el("div", "ds-dialog__actions");
    UI.anhaengen(inhalt, o.inhalt);
    UI.anhaengen(knoepfe, o.knoepfe);
    if (o.beschreibung) wurzel.setAttribute("aria-describedby", o.beschreibung);
    flaeche.appendChild(titelEl);
    flaeche.appendChild(inhalt);
    flaeche.appendChild(knoepfe);
    wurzel.appendChild(schleierEl);
    wurzel.appendChild(flaeche);

    const ebene = ebeneAnlegen("dialog", wurzel, flaeche, o);
    const schliessen = schliesserVon(ebene);

    /* Was zwischen Titel und Körper stehen bleibt (die Suche über einer
       Liste und ihre Trefferzahl, Dashboard-Style «A search over a list»):
       ersetzt die bisherigen Knoten an Ort und Stelle; bleibende Knoten
       behalten Fokus und Schreibmarke. */
    let obenKnoten = [];
    function oben(knoten) {
      const neu = (knoten || []).filter(Boolean);
      for (const k of obenKnoten) if (neu.indexOf(k) === -1) k.remove();
      for (const k of neu) if (k.parentNode !== flaeche || k.nextElementSibling !== inhalt) flaeche.insertBefore(k, inhalt);
      obenKnoten = neu;
    }

    /* Der Fokus beginnt auf «fokus», sonst dem ersten Feld, sonst dem
       ersten Knopf (bei Fragen «Abbrechen», die sichere Wahl) – nicht auf
       dem ersten Tabstopp, den DS.overlay beim Öffnen nimmt (erzwingen).
       Die Seite füllt Inhalt und Knöpfe oft erst nach dem Öffnen: dann
       steht der Fokus auf der Fläche, und im nächsten Takt geht er weiter –
       ausser die Seite hat ihn inzwischen selbst gesetzt. */
    function fokussieren(erzwingen) {
      if (!ebene.offen) return;
      const aktiv = document.activeElement;
      if (erzwingen !== true && aktiv && aktiv !== flaeche && flaeche.contains(aktiv)) return;
      const vorgabe = typeof o.fokus === "function" ? o.fokus() : o.fokus;
      const ziel = (vorgabe && vorgabe.isConnected ? vorgabe : null)
        || flaeche.querySelector("input:not([disabled]):not([type=\"hidden\"]), select:not([disabled]), textarea:not([disabled])")
        || knoepfe.querySelector("button:not([disabled])");
      if (ziel) ziel.focus();
    }

    ebeneOeffnen(ebene);
    fokussieren(true);
    setTimeout(fokussieren, 0);

    return {
      element: wurzel,
      flaeche: flaeche,
      inhalt: inhalt,
      knoepfe: knoepfe,
      oben: oben,
      titel: function (t) { UI.textSetzen(titelEl, t); },
      /** Feste Höhe (CSS-Länge, «560px»), damit eine Liste beim Filtern den
          Dialog nicht springen lässt; nie höher als das Fenster. null hebt sie auf. */
      hoehe: function (wert) {
        if (wert) wurzel.style.setProperty("--ds-dialog-height", String(wert));
        else wurzel.style.removeProperty("--ds-dialog-height");
      },
      schliessen: schliessen,
      offen: function () { return ebene.offen; },
      fokussieren: function () { fokussieren(); },
      /** Solange gesperrt (z. B. während gelöscht wird), schliessen Esc,
          Schleier und [data-close] nicht; schliessen() der Seite geht weiter. */
      sperren: sperrerVon(wurzel)
    };
  }

  /* Ja/Nein-Frage statt window.confirm. Der Titel fragt, der Text nennt die
     Folge, der Hauptknopf benennt sie («Eintrag löschen», nie «OK»). Wie
     DS.overlay.confirm, aber mit den Knöpfen von UI.knopf und dem Fokus
     auf «Abbrechen». */
  function bestaetigen(optionen) {
    const o = optionen || {};
    return new Promise(function (aufloesen) {
      let antwort = false;
      const textId = "dialog-text-" + (ebenenZaehler + 1);
      const nein = knopf({ text: o.nein || "Abbrechen", variante: "leise" });
      const ja = knopf({ text: o.ja || "Bestätigen", variante: "primaer" });
      const inhalt = [];
      if (o.text) {
        const p = el("p", "ds-dialog__text", o.text);
        p.id = textId;
        inhalt.push(p);
      }
      const d = dialog({
        titel: o.titel || "Bestätigen", inhalt: inhalt, knoepfe: [nein, ja], rolle: "alertdialog",
        breit: !!o.breit, fokus: nein, beschreibung: o.text ? textId : null,
        beiSchliessen: function () { aufloesen(antwort); }
      });
      nein.addEventListener("click", function () { d.schliessen("abbrechen"); });
      ja.addEventListener("click", function () { antwort = true; d.schliessen("ja"); });
    });
  }

  /* ---------- Seitenblatt ---------- */

  function blatt(optionen) {
    const o = optionen || {};
    const id = "blatt-" + (++ebenenZaehler);
    const breit = (o.breite || 560) >= 720 || o.breit;
    const wurzel = el("dialog", "ds-sheet" + (o.klasse ? " " + o.klasse : ""));
    wurzel.setAttribute("aria-labelledby", id + "-titel");
    const schleierEl = el("div", "ds-sheet__backdrop");
    schleierEl.setAttribute("data-close", "");
    const flaeche = el("section", "ds-sheet__panel" + (breit ? " ds-sheet__panel--wide" : ""));

    // Kopf: Titel und Unterzeile (Trefferzahl, live) in .ds-sheet__heading.
    const kopfTeil = el("div", "ds-sheet__head");
    const kopfText = el("div", "ds-sheet__heading");
    const titelEl = el("h2", "ds-sheet__title", o.titel || "");
    titelEl.id = id + "-titel";
    const unterEl = el("p", "ds-sheet__subtitle", o.unter || "");
    unterEl.setAttribute("aria-live", "polite");
    kopfText.appendChild(titelEl);
    kopfText.appendChild(unterEl);
    const zu = knopf({ variante: "sinnbild", sinnbild: "schliessen", titel: "Schliessen" });
    zu.setAttribute("data-close", "");
    zu.setAttribute("autofocus", "");
    kopfTeil.appendChild(kopfText);
    kopfTeil.appendChild(zu);

    // Der Körper ist ein eigener Tabstopp (Pfeiltasten rollen ihn); seine
    // Kante oben beim Rollen meldet DS.overlay (watchScrolled) selbst.
    const koerper = el("div", "ds-sheet__body");
    koerper.tabIndex = 0;
    koerper.setAttribute("role", "region");
    koerper.setAttribute("aria-labelledby", id + "-titel");
    // Fusszeile (Trefferzahl, «Fertig»): bleibt stehen, leer nimmt sie keinen Platz.
    const fuss = el("div", "ds-sheet__foot");
    UI.anhaengen(koerper, o.inhalt);
    UI.anhaengen(fuss, o.fuss);

    flaeche.appendChild(kopfTeil);
    flaeche.appendChild(koerper);
    flaeche.appendChild(fuss);
    wurzel.appendChild(schleierEl);
    wurzel.appendChild(flaeche);

    const ebene = ebeneAnlegen("blatt", wurzel, flaeche, o);
    ebeneOeffnen(ebene);

    return {
      element: wurzel,
      flaeche: flaeche,
      koerper: koerper,
      fuss: fuss,
      titel: function (t) { UI.textSetzen(titelEl, t); },
      unter: function (t) { UI.textSetzen(unterEl, t); },
      schliessen: schliesserVon(ebene),
      offen: function () { return ebene.offen; },
      /** Fokusziel, wenn der Körper unter dem Fokus neu gebaut wurde. */
      fokusSchliessen: function () { zu.focus({ preventScroll: true }); },
      sperren: sperrerVon(wurzel)
    };
  }

  /* ==================================================================
     Meldung (Snackbar, DS.overlay.toast)
     ================================================================== */

  const ART_JE_TON = { erfolg: "success", fehler: "error", info: "info" };

  /* Alles Übrige bringt DS.overlay.toast: dieselbe Meldung (Ton und Text,
     ohne Aktion) startet die stehende neu, statt sich zu stapeln (dreimal
     Ctrl+S ergibt ein «Gespeichert.», angesagt wird jedes Mal); ein neuer
     Fehler ersetzt den offenen (Schlüssel «fehler»; stand der Fokus auf dem
     alten, geht er auf das × des neuen); Fehler und Meldungen mit Aktion
     bleiben mit ×, bis man sie schliesst (WCAG 2.2.1), und halten am Ende
     der Tafel bzw. des Blatts Platz frei (data-toast-reserve); über einer
     sichtbaren Speicherleiste steigen die Meldungen von selbst. */
  function meldung(text, optionen) {
    const o = optionen || {};
    const ton = o.ton === "fehler" || o.ton === "info" ? o.ton : "erfolg";
    const toastOptionen = { kind: ART_JE_TON[ton], closeLabel: "Meldung schliessen" };
    if (o.dauer > 0) toastOptionen.timeout = o.dauer;
    if (ton === "fehler") toastOptionen.key = "fehler";
    if (o.aktion && o.aktion.text) {
      const aktion = o.aktion;
      toastOptionen.action = {
        label: aktion.text,
        onClick: function (ev) { if (typeof aktion.beiKlick === "function") aktion.beiKlick(ev); }
      };
    }
    const h = DS.overlay.toast(regionHolen(), text === null || text === undefined ? "" : String(text), toastOptionen);
    return { schliessen: function () { return h.close(); }, element: h.el };
  }

  function fehlerSchliessen() {
    return DS.overlay.closeToasts(regionHolen(), { kind: "error" });
  }

  /* ==================================================================
     Tooltip (DS.overlay.tooltips)
     ================================================================== */

  /* data-tip setzen oder (ohne Text) entfernen. Wiederholt der Text nur,
     was das Element ohnehin zeigt, zeigt DS.overlay.tooltips ihn nur,
     solange der Text abgeschnitten ist; ein Bild (role=img) und ein
     gesperrtes Bedienelement zeigen ihren Tooltip auch auf Antippen. */
  function tipp(element, text) {
    if (!element) return element;
    const t = text === null || text === undefined || text === false ? "" : String(text);
    if (t) element.setAttribute("data-tip", t);
    else element.removeAttribute("data-tip");
    return element;
  }

  /* ==================================================================
     Speicherleiste (.ds-savebar über DS.overlay.savebar)
     ================================================================== */

  let leiste = null;
  const SPEICHERN_BESCHAEFTIGT = "Wird gespeichert …";

  /* Die Leiste ist .ds-savebar von Dashboard-Style: das letzte Kind der
     Tafel, klebt an ihrem unteren Rand und nimmt keinen Platz. Kommen und
     Gehen (.ds-presence), den Platz am Tafelende (data-ds-savebar, auch
     scroll-padding für fokussierte Felder), den Rest-Platz nach dem Gehen
     am Ende (data-ds-savebar-rest), das Anheben der Meldungen und die
     Rettung des Fokus aus der gehenden Leiste macht DS.overlay.savebar. */
  function leisteBauen() {
    const huelle = el("div", "ds-savebar");
    const element = el("div", "ds-savebar__bar ds-presence");
    element.hidden = true;
    element.setAttribute("role", "region");
    element.setAttribute("aria-label", "Ungespeicherte Änderungen");
    const anzahl = el("p", "ds-savebar__text");
    const knoepfe = el("div", "ds-savebar__actions");
    const verwerfen = knopf({ text: "Verwerfen", variante: "leise" });
    // Die Gesichter von DS.motion.busy stehen schon beim Bauen: der Knopf
    // ist von Anfang an so breit wie «Wird gespeichert …» und springt nie.
    const speichern = knopf({ text: "Speichern", variante: "primaer", beschaeftigt: SPEICHERN_BESCHAEFTIGT });
    knoepfe.appendChild(verwerfen);
    knoepfe.appendChild(speichern);
    element.appendChild(anzahl);
    element.appendChild(knoepfe);
    huelle.appendChild(element);
    (tafel || body).appendChild(huelle);

    const z = { beschaeftigt: false, lauf: null, speichernText: "", speichernAus: false,
      beiSpeichern: null, beiVerwerfen: null, fokusZiel: null };

    function fokusZiel() {
      const ziel = typeof z.fokusZiel === "function" ? z.fokusZiel() : null;
      return ziel && fokusbereit(ziel) && !ziel.disabled && !element.contains(ziel) ? ziel : null;
    }
    const steuerung = DS.overlay.savebar(huelle, { focusTarget: fokusZiel });

    speichern.addEventListener("click", function (ev) {
      if (typeof z.beiSpeichern === "function") z.beiSpeichern(ev);
    });
    verwerfen.addEventListener("click", function (ev) {
      if (typeof z.beiVerwerfen === "function") z.beiVerwerfen(ev);
    });

    /* Der Fokus darf nicht auf einem Knopf stehen, der gleich gesperrt
       wird (er fiele auf body, der nächste Tab begänne beim Seitenanfang):
       er geht dorthin, wohin ihn auch die gehende Leiste gibt (fenster.js:
       das zuletzt bearbeitete Feld, sonst der Titel), sonst die Tafel. */
    function sperren(k, aus) {
      if (aus && !k.disabled && k === document.activeElement) {
        const ziel = fokusZiel();
        if (ziel) ziel.focus();
        else if (tafel) tafel.focus({ preventScroll: true });
      }
      k.disabled = aus;
    }

    /* Der Speichern-Knopf ist beschäftigt, solange «arbeit» läuft
       (UI.beschaeftigt → DS.motion.busy: sofort gesperrt, das Gesicht mit
       Spinner erst nach --ds-delay-loader und dann mindestens
       --ds-hold-loader). Danach gelten wieder die gewünschten Texte und
       Sperren. */
    function beschaeftigt(arbeit) {
      z.beschaeftigt = true;
      speichern.disabled = false;
      const lauf = UI.beschaeftigt(speichern, arbeit, { text: SPEICHERN_BESCHAEFTIGT });
      z.lauf = lauf;
      const frei = function () {
        // Ein neuerer Lauf gilt; DS.motion.busy gibt einem zweiten Aufruf
        // während des ersten denselben Lauf zurück: dessen Ende gilt dann.
        if (z.lauf !== lauf) return;
        z.lauf = null;
        z.beschaeftigt = false;
        if (z.speichernText) UI.knopfText(speichern, z.speichernText);
        sperren(speichern, !!z.speichernAus);
      };
      lauf.then(frei, frei);
      return lauf;
    }

    /* Texte und Sperren – alles ausser der Sichtbarkeit. */
    function anwenden(s) {
      if (s.text !== undefined) UI.textSetzen(anzahl, s.text);
      if (s.verwerfenText !== undefined) UI.knopfText(verwerfen, s.verwerfenText);
      // Solange der Knopf beschäftigt ist, gehören Beschriftung und Sperre dem
      // Spinner; gewünscht wird trotzdem gemerkt und danach übernommen.
      if (s.speichernText !== undefined) {
        z.speichernText = s.speichernText;
        if (!z.beschaeftigt) UI.knopfText(speichern, s.speichernText);
      }
      if (s.speichernAus !== undefined) {
        z.speichernAus = !!s.speichernAus;
        if (!z.beschaeftigt) sperren(speichern, z.speichernAus);
      }
      if (s.verwerfenAus !== undefined) sperren(verwerfen, !!s.verwerfenAus);
    }

    /* Eine austretende Leiste friert ihren Inhalt ein: nach dem Speichern
       sänke sie sonst mit «0 Änderungen» weg, und ihr Knopf tauschte mitten
       im Austritt den Spinner gegen «Speichern». Was in dieser Zeit kommt,
       wendet savebar().update nach dem Austritt an (oder sofort, wenn sie
       wieder erscheint). */
    function setzen(w) {
      const s = Object.assign({}, w || {});
      const sichtbarWunsch = s.sichtbar;
      delete s.sichtbar;
      if (sichtbarWunsch === true && !steuerung.shown) {
        // show() wendet zuerst an, was während eines Austritts wartete.
        steuerung.show();
        anwenden(s);
        return;
      }
      if (sichtbarWunsch === false && steuerung.shown) steuerung.hide();
      steuerung.update(function () { anwenden(s); });
    }

    return {
      element: element,
      api: {
        element: element,
        speichernKnopf: speichern,
        verwerfenKnopf: verwerfen,
        setzen: setzen,
        beschaeftigt: beschaeftigt,
        sichtbar: function () { return steuerung.shown; },
        speicherbar: function () {
          return steuerung.shown && !z.beschaeftigt && !speichern.disabled
            && speichern.getAttribute("aria-disabled") !== "true";
        }
      },
      zustand: z
    };
  }

  /* optionen: { beiSpeichern, beiVerwerfen, fokusZiel() → Element|null }.
     fokusZiel nennt, wohin der Fokus geht, wenn er in der Leiste steht und
     sie verschwindet oder ihr Knopf gesperrt wird (fenster.js: das zuletzt
     bearbeitete Feld, sonst der Titel); ohne Ziel die Tafel. */
  function speicherleiste(optionen) {
    if (!leiste) leiste = leisteBauen();
    const o = optionen || {};
    if (typeof o.beiSpeichern === "function") leiste.zustand.beiSpeichern = o.beiSpeichern;
    if (typeof o.beiVerwerfen === "function") leiste.zustand.beiVerwerfen = o.beiVerwerfen;
    if (typeof o.fokusZiel === "function") leiste.zustand.fokusZiel = o.fokusZiel;
    return leiste.api;
  }

  /* ==================================================================
     Start
     ================================================================== */

  // Einmal je Seite, mit und ohne Rahmen: die Druckwelle auf allen
  // Bedienelementen von Dashboard-Style, die Tooltips.
  // attach() stellt auch die Wache von DS.motion.guard auf: ein gesperrter
  // (aria-disabled), beschäftigter oder gerade erfolgreicher Knopf nimmt
  // weder Klick noch Enter, Leertaste oder Formularabsenden an.
  DS.ripple.attach(document);
  if (body) DS.overlay.tooltips(document);

  if (bereit) {
    geruestSichern();
    kopfBauen();
    schubladeBauen();
    markenSchriftAbwarten();
    verdrahten();
    if (seite === "index") {
      navigation({ gruppen: HAUPTZIELE, aktiv: indexAktiv(), label: "Hauptnavigation" });
    }
    // Das HTML startet im Ladezustand: vor dem ersten Skript der Seite blitzt
    // nichts Halbfertiges auf; Skelett und Ladebalken erscheinen verzögert.
    if (bahn.getAttribute("data-zustand") === "laden") {
      bahn.removeAttribute("data-zustand");
      zustandJetzt = "inhalt";
      ladenZeigen({});
    }
  }

  /* ---------- An UI anhängen ---------- */

  UI.dialog = dialog;
  UI.bestaetigen = bestaetigen;
  UI.blatt = blatt;
  UI.ebeneOffen = ebeneOffen;
  UI.meldung = meldung;
  UI.meldungenFehlerSchliessen = fehlerSchliessen;
  UI.tipp = tipp;
  UI.speicherleiste = speicherleiste;
  UI.seitenkopf = seitenkopf;
  UI.adresse = adresse;

  return {
    HAUPTZIELE: HAUPTZIELE,
    STARTZIEL: STARTZIEL,
    zielText: zielText,
    navigation: navigation,
    aktiv: aktivSetzen,
    zahl: zahl,
    konto: konto,
    abmelden: abmelden,
    vorfuehrung: vorfuehrung,
    wechseln: wechseln,
    zustand: zustand,
    zustandJetzt: function () { return zustandJetzt; },
    stillZeichnen: stillZeichnen,
    fest: fest,
    dokumentTitel: dokumentTitel,
    schublade: {
      oeffnen: schubladeOeffnen,
      schliessen: schubladeSchliessen,
      offen: schubladeOffen
    },
    elemente: function () {
      return { app: app, kopf: kopf, schublade: schublade, tafel: tafel, bahn: bahn,
        ladebalken: ladebalken, meldungen: regionHolen() };
    }
  };
})();

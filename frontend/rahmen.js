/* rahmen.js — der Rahmen aller Seiten und die schwebenden Ebenen.

   Port von ChatBob app/src/views/shell.js (Rahmen, Schublade, Seitenwechsel),
   ui/confirm.js + widget/ui/dialog.js (Dialog), ui/drawer.js (Seitenblatt),
   ui/toast.js (Meldung) und ui/tooltip.js (Tooltip) — als klassisches
   Skript mit EINEM Namensraum «Rahmen»; die Ebenen hängen sich an «UI»
   (bausteine.js) an. Aussehen: rahmen.css.

   Ladereihenfolge: konfig.js, bewegung.js, bausteine.js, rahmen.js, MSAL …
   rahmen.js baut den Rahmen SOFORT beim Laden aus dem HTML-Gerüst:

     <body class="app" data-seite="index|client|benutzer|telefon|software|kamera|kamerarolle|styleguide">
       <a class="sprungmarke" href="#inhalt">Zum Inhalt</a>
       <header class="kopf" id="kopf"></header>
       <nav class="schublade" id="schublade" aria-label="…"></nav>
       <div class="tafel-rahmen">
         <main class="tafel" id="tafel" tabindex="-1">
           <div class="ladebalken" id="ladebalken" hidden></div>
           <div class="bahn" id="inhalt" data-zustand="laden"> … </div>
         </main>
       </div>
     </body>

   Fehlt ein Teil, legt rahmen.js ihn an. Ohne body[data-seite] baut es
   keinen Rahmen (Rahmen.bereit = false); die UI-Ebenen (Dialog, Blatt,
   Meldung, Tooltip) gehen trotzdem. Der Kopf steht vom ersten Bild an:
   das Konto der zuletzt gezeigten Seite belegt ihn vor (sessionStorage),
   die Wortmarke wartet höchstens 300 ms auf ihre Schrift.

   ------------------------------------------------------------------
   API «Rahmen»
   ------------------------------------------------------------------
   Rahmen.HAUPTZIELE                 Gruppen der Hauptseite (einzige Quelle),
                                     [{titel?, eintraege:[{schluessel, text, sinnbild, href}]}]
   Rahmen.zielText(schluessel)       «admin» → «ADMIN-Clients» (für Zurück-Links)
   Rahmen.navigation({gruppen, aktiv, beiWahl(schluessel, ereignis), label, verstecken, zurueck})
                                     Zeichnet die Schublade. Gleiche Struktur → nur
                                     aktiv/Zähler an Ort und Stelle (die Pille gleitet);
                                     neue Struktur → neu, Pille springt. Echte Links
                                     (href): Mittel-/Ctrl-Klick öffnen einen neuen Tab,
                                     ein schlichter Klick geht an beiWahl (falls da).
                                     verstecken: Seite ohne Schublade (Tafel volle Breite).
                                     zurueck: {text, href} – Zurück-Eintrag zuoberst
                                     (Detailseiten: «‹ ADMIN-Clients»), ein schlichter
                                     Link ohne Pille; null/fehlt = keiner.
   Rahmen.aktiv(schluessel)          aktiver Eintrag, die Pille gleitet
   Rahmen.zahl(schluessel, wert)     Zähler am Eintrag (leer/null = keiner); erscheint
                                     er (leer → Wert), ploppt er einmal
   Rahmen.konto({name, email})       Konto rechts im Kopf: Kapsel mit Initiale, Name
                                     und E-Mail (≤ 720 px nur die Initiale)
   Rahmen.abmelden(beiKlick|null)    Text-Knopf «Abmelden» in derselben Kapsel
   Rahmen.vorfuehrung({text, beiZuruecksetzen}) | null
                                     Warn-Banner als erster Block der Bahn
   Rahmen.wechseln(neu, {alt, nachOben=true, auftritt=true}) → Promise<boolean>
                                     Fade-through wie ChatBob shell.show: «alt» (Standard:
                                     der sichtbare Inhalt der Bahn) blendet 100 ms aus,
                                     dann baut neu() um (Funktion; gibt den eintretenden
                                     Knoten zurück) bzw. ersetzt den Inhalt durch den
                                     Knoten «neu», der tritt ein ('tausch'), Karten
                                     staffeln. Letzter Aufruf gewinnt (false für ältere).
   Rahmen.zustand('laden', {text, fortschritt, karten})
   Rahmen.zustand('fehler', {titel, text, hinweis, knopfText, beiKlick, pfad})
   Rahmen.zustand('ende',   {titel, text, hinweis, knopfText, beiKlick, fokus, pfad})
                                     pfad: {text, href} – Zurück-Link «‹ Liste» über dem Titel
   Rahmen.zustand('inhalt') → Promise   (hält ein sichtbares Skelett ≥ 450 ms;
                                     Staffelung + Hochzählen nur beim ERSTEN Inhalt)
   Rahmen.zustandJetzt()             'laden' | 'fehler' | 'ende' | 'inhalt'
   Rahmen.erstauftritt(behaelter, {wurzel})  Staffelung + Hochzählen (= Bewegung.auftritt)
   Rahmen.stillZeichnen(behaelter, zeichnen)  zeichnet ohne Bewegung neu (Nachladen,
                                     Speichern, Filtern): Tafel und innere Roller bleiben
                                     stehen, ein verschwundener Fokus geht samt Schreibmarke
                                     an sein Gegenstück (data-fokus, id, sonst dieselbe
                                     Stelle, sonst der Seitentitel)
   Rahmen.fest(an)                   Tafel rollt nicht (Tabellenansichten), solange das
                                     Fenster ≥ 601 × 720 px ist; darunter rollt sie, und
                                     die Liste ist höchstens so hoch wie die Tafel
   Rahmen.dokumentTitel(text)        «text – ICT-Inventar»
   Rahmen.schublade.oeffnen() / .schliessen() / .offen()
   Rahmen.elemente()                 {kopf, schublade, tafel, bahn, ladebalken}

   ------------------------------------------------------------------
   Erweiterungen von «UI»
   ------------------------------------------------------------------
   UI.dialog({titel, inhalt?, knoepfe?, breit?, rolle?, fokus?, beiSchliessen?(grund), klasse?})
     → {element, flaeche, inhalt, knoepfe, titel(t), schliessen(grund) → Promise, offen(), fokussieren(),
        sperren(an)}   (gesperrt: Esc und Schleier schliessen nicht, z. B. während gelöscht wird)
     Der Schleier schliesst nur mit einem eigenen einfachen Klick (nicht dem
     zweiten eines Doppelklicks, nicht in den ersten 300 ms).
     Titel und Knöpfe bleiben stehen, nur der Inhalt rollt (eine Rollfläche).
     Eine Trefferliste darin trägt die Klasse .dialog-liste: sie rollt selbst
     und nimmt die Resthöhe; ist dafür kein Platz, rollt der ganze Inhalt mit
     ihr (data-knapp) und das Suchfeld darüber klebt oben.
   UI.bestaetigen({titel, text, ja, nein='Abbrechen'}) | (titel, frage, knopfText) → Promise<boolean>
     löst bei Esc, Schleier und «Abbrechen» mit false auf.
   UI.blatt({titel, unter?, inhalt?, fuss?, breite: 560|720, beiSchliessen?(grund), klasse?})
     → {element, flaeche, koerper, fuss, titel(t), unter(t), schliessen(grund) → Promise, offen(),
        fokusSchliessen(), sperren(an)}
   UI.ebeneOffen() → boolean         ein Dialog oder Blatt ist offen
   UI.meldung(text, {ton:'erfolg'|'fehler'|'info', dauer, aktion:{text, beiKlick}}) → {schliessen, element}
     (kompatibel: UI.meldung(text, true) = Fehler). Fehler bleiben mit ×.
     Angesagt wird über EINE Live-Region (#ansage), die von Anfang an da ist;
     die sichtbaren Meldungen ziehen bei offener Ebene in deren Wurzel um.
   UI.meldungenFehlerSchliessen()    (UI.beschaeftigt ruft es beim Start auf)
   UI.meldungenAusrichten()          nach Layoutwechseln
   UI.tipp(element, text|null)       Tooltip-Text setzen; UI.tipp.verbergen()
   UI.speicherleiste({beiSpeichern, beiVerwerfen, fokusZiel}) → {element, speichernKnopf,
     verwerfenKnopf, setzen({sichtbar, text, meta, speichernText, verwerfenText, speichernAus,
     verwerfenAus, beschaeftigt}), sichtbar(), speicherbar()}
     Trägt keine Höhe bei; solange sie steht, hält die Tafel Platz frei und rollt
     ein verdecktes fokussiertes Feld über sie. Eine austretende Leiste friert
     ihren Inhalt ein. fokusZiel() → Element: wohin der Fokus geht, wenn er in
     der Leiste steht und sie geht oder ihr Knopf gesperrt wird (sonst die Tafel).
   UI.seitenkopf({titel, lead, unter:[Teile]|Text, status:[Knoten], aktionen:[Knoten],
                  pfad:{text, href}|null, ebene=1, id, titelId, element})
     → header.seitenkopf mit .knoten {pfad, pfadText, titel, lead, unter, status, aktionen}
       und .setzen({…}) (dieselben Schlüssel; ersetzt nur, was übergeben wird).
       element: einen vorhandenen <header> füllen statt einen neuen zu bauen.
   UI.adresse.client(liste, id, {neu, vorlage, bereich}|bereich) · benutzer(id, …) ·
     telefon(id, {neu, benutzer, vorlage, bereich}) · software(id, …) · kamera(id, {neu, bereich}) ·
     kamerarolle(id, {bereich}) ·
     liste(tab, filter?) (filter: {suche, programm, stufe} → q/pg/ps, andere Schlüssel
     unverändert, oder URLSearchParams/Text) · listeMerken(adresse?) ·
     zurueckZurListe(tab) (gemerkt im Tab, sonst – neuer Tab – höchstens 12 h alt aus
     localStorage, sonst index.html#tab) · mock()       (hängt mock=1 selbst an)

   Grundsätze wie überall: kein Framework, kein innerHTML, Text nur über
   textContent. Bewegung nur über Klassen/Tokens (bewegung.css). */

"use strict";

const Rahmen = (function () {

  if (typeof UI === "undefined" || typeof Bewegung === "undefined") {
    throw new Error("rahmen.js braucht bewegung.js und bausteine.js (vorher laden).");
  }

  /* ==================================================================
     Konstanten
     ================================================================== */

  /** Muss der Grenze der modalen Schublade in rahmen.css entsprechen. */
  const MODAL_ABFRAGE = "(max-width: 900px)";
  /** Ab hier zeigt das Konto nur noch die Initiale (rahmen.css §7). */
  const SCHMAL_ABFRAGE = "(max-width: 720px)";
  /** Abstand eines in die Liste gerollten Eintrags zu ihrem Rand (--a2). */
  const LISTEN_RAND_PX = 8;
  /** Ausblenden beim Wechsel (--dauer-sofort) plus Reserve. */
  const AUSBLENDEN_FRIST_MS = 250;
  /** So lange steht eine Erfolgs- oder Info-Meldung; Fehler bleiben. */
  const MELDUNG_SICHTBAR_MS = 3200;
  /** Abstand der Meldung zur Tafelkante (--a6) und zu Inhalt darüber (--a2). */
  const MELDUNG_ABSTAND_PX = 24;
  const LUECKE_PX = 8;
  /** Mehr gleichzeitige Meldungen verdrängen die älteste (nie einen Fehler). */
  const MELDUNG_HOECHSTENS = 3;
  /** Material: Tooltip nach 500 ms; 100 ms, um auf den Tooltip zu wechseln. */
  const TIPP_VERZOEGERUNG_MS = 500;
  const TIPP_GNADE_MS = 100;
  /** Ein Klick auf einen Schleier so kurz nach dem Öffnen gehört noch zur
      Geste, die die Ebene geöffnet hat (Doppelklick, doppeltes Tippen). */
  const SCHLEIER_SPERRE_MS = 300;
  const PRODUKT = "ICT-Inventar";
  const LISTE_SPEICHER = "ictinventar.listen";
  /** So lange gilt eine gemerkte Listenadresse in einem neuen Tab (ein
      Arbeitstag); im selben Tab gilt sie, solange der Tab lebt. */
  const LISTE_DAUER_MS = 12 * 60 * 60 * 1000;
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

  /* Tab bleibt im Behälter: am Ende wieder zum Anfang und umgekehrt.
     «ersatz» nimmt den Fokus, wenn im Behälter nichts fokussierbar ist
     (der Behälter selbst ist es nicht immer). */
  function tabFangen(ev, behaelter, ersatz) {
    if (ev.key !== "Tab" || !behaelter) return;
    const liste = fokussierbare(behaelter);
    if (!liste.length) { ev.preventDefault(); (ersatz || behaelter).focus(); return; }
    const erstes = liste[0];
    const letztes = liste[liste.length - 1];
    const aktiv = document.activeElement;
    const draussen = !behaelter.contains(aktiv);
    if (ev.shiftKey && (aktiv === erstes || aktiv === behaelter || draussen)) {
      ev.preventDefault();
      letztes.focus();
    } else if (!ev.shiftKey && (aktiv === letztes || draussen)) {
      ev.preventDefault();
      erstes.focus();
    }
  }

  function fehlerMeldungAusnahme(fehler) {
    setTimeout(function () { throw fehler; }, 0);
  }

  /* ==================================================================
     Adressen (Fehler A1, A2, A4, A6): EIN Ort für alle Fensteradressen
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
      return adresseBauen("index.html", [], (tab || "uebersicht") + (f ? "?" + f : ""));
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
      const tab = hash.split("?")[0] || "uebersicht";
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
      const ziel = tab || "uebersicht";
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
     Hauptziele (Schublade der Hauptseite) — einzige Quelle
     ================================================================== */

  const HAUPTZIELE = [
    { eintraege: [
      { schluessel: "uebersicht", text: "Übersicht", sinnbild: "uebersicht" }
    ] },
    { titel: "Geräte", eintraege: [
      { schluessel: "admin", text: "ADMIN-Clients", sinnbild: "admin" },
      { schluessel: "edu", text: "EDU-Clients", sinnbild: "edu" }
    ] },
    { titel: "Verzeichnis", eintraege: [
      { schluessel: "benutzer", text: "Benutzer", sinnbild: "benutzer" },
      { schluessel: "telefone", text: "Telefonnummern", sinnbild: "telefon" },
      { schluessel: "software", text: "Software", sinnbild: "software" }
    ] },
    { titel: "Videoüberwachung", eintraege: [
      { schluessel: "kameras", text: "Kameras", sinnbild: "kamera" },
      { schluessel: "kamerarechte", text: "Kamerarechte", sinnbild: "schild" }
    ] }
  ];
  for (const g of HAUPTZIELE) for (const e of g.eintraege) e.href = adresse.liste(e.schluessel);

  function zielText(schluessel) {
    for (const g of HAUPTZIELE) for (const e of g.eintraege) if (e.schluessel === schluessel) return e.text;
    return "Übersicht";
  }

  /* ==================================================================
     Rahmen aufbauen
     ================================================================== */

  const body = document.body;
  const seite = body ? body.getAttribute("data-seite") : null;
  const bereit = !!seite;
  const modalAbfrage = window.matchMedia ? window.matchMedia(MODAL_ABFRAGE) : null;
  const schmalAbfrage = window.matchMedia ? window.matchMedia(SCHMAL_ABFRAGE) : null;

  let sprungmarke = null, kopf = null, schublade = null, schubladeListe = null, schleier = null;
  let schubladeZurueck = null;
  let menueKnopf = null, tafelRahmen = null, tafel = null, ladebalken = null, bahn = null;
  let zustandsBlock = null, vorfuehrBanner = null;
  let kapsel = null, kontoEl = null, kontoInitiale = null, kontoName = null, kontoEmail = null;
  let kapselTrenner = null, abmeldenKnopf = null, abmeldenRueckruf = null;
  let indikator = null;

  function sichern(id, tag, klasse) {
    let k = document.getElementById(id);
    if (!k) {
      k = el(tag, klasse);
      k.id = id;
    }
    return k;
  }

  /* Die Wortmarke wartet beim harten Laden auf ihre Schrift: in der
     Ersatzschrift ist sie 22 px schmaler und spränge nach ~150 ms in die
     richtige Breite (Archivo kommt mit display=swap). Ist die Schrift schon
     da (Seitenwechsel aus dem Speicher), zeigt sie sich sofort; sonst
     höchstens SCHRIFT_WARTEN_MS unsichtbar, nie länger. */
  const markenWartend = [];
  let markeSchriftDa = false;

  function wortmarke() {
    const w = el("span", "wortmarke");
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
    body.classList.add("app");

    sprungmarke = body.querySelector(":scope > .sprungmarke");
    if (!sprungmarke) {
      sprungmarke = el("a", "sprungmarke", "Zum Inhalt");
      sprungmarke.href = "#inhalt";
      body.insertBefore(sprungmarke, body.firstChild);
    }

    kopf = sichern("kopf", "header", "kopf");
    if (!kopf.parentNode) sprungmarke.after(kopf);
    schublade = sichern("schublade", "nav", "schublade");
    if (!schublade.parentNode) kopf.after(schublade);

    tafel = sichern("tafel", "main", "tafel");
    tafel.classList.add("tafel");
    if (!tafel.hasAttribute("tabindex")) tafel.tabIndex = -1;
    tafelRahmen = tafel.parentElement && tafel.parentElement.classList.contains("tafel-rahmen")
      ? tafel.parentElement : null;
    if (!tafelRahmen) {
      // Der Rahmen rundet die Tafel ab, ohne dass ihre Rollleiste die Ecke
      // eckig macht (rahmen.css §4).
      tafelRahmen = el("div", "tafel-rahmen");
      if (tafel.parentNode) tafel.parentNode.insertBefore(tafelRahmen, tafel);
      else schublade.after(tafelRahmen);
      tafelRahmen.appendChild(tafel);
    }

    bahn = sichern("inhalt", "div", "bahn");
    bahn.classList.add("bahn");
    if (!bahn.parentNode) tafel.appendChild(bahn);

    ladebalken = sichern("ladebalken", "div", "ladebalken");
    ladebalken.classList.add("ladebalken");
    ladebalken.setAttribute("aria-hidden", "true");
    if (!ladebalken.parentNode) { ladebalken.hidden = true; tafel.insertBefore(ladebalken, tafel.firstChild); }

    zustandsBlock = el("div", "bahn-zustand");
    bahn.insertBefore(zustandsBlock, bahn.firstChild);
  }

  function kopfBauen() {
    kopf.classList.add("kopf");

    menueKnopf = knopf({ variante: "sinnbild", sinnbild: "menue", titel: "Navigation", klasse: "kopf-menue" });
    menueKnopf.setAttribute("aria-label", "Navigation öffnen");
    menueKnopf.setAttribute("aria-controls", "schublade");
    menueKnopf.setAttribute("aria-expanded", "false");
    menueKnopf.addEventListener("click", function () { schubladeSetzen(true); });

    const marke = el("a", "kopf-marke");
    marke.href = adresse.liste("uebersicht");
    marke.setAttribute("aria-label", "ICT-Inventar, zur Übersicht");
    marke.appendChild(wortmarke());

    // Rechts EINE Kapsel: Initiale, Name und E-Mail, ein Trenner, «Abmelden».
    kapsel = el("div", "kopf-konto");
    kapsel.hidden = true;

    kontoEl = el("div", "konto");
    kontoEl.hidden = true;
    kontoInitiale = el("span", "konto-initiale");
    const kontoText = el("div", "konto-text");
    kontoName = el("div", "konto-name");
    kontoEmail = el("div", "konto-email");
    kontoText.appendChild(kontoName);
    kontoText.appendChild(kontoEmail);
    kontoEl.appendChild(kontoInitiale);
    kontoEl.appendChild(kontoText);

    kapselTrenner = el("span", "kopf-konto-trenner");
    kapselTrenner.setAttribute("aria-hidden", "true");

    abmeldenKnopf = knopf({ text: "Abmelden", variante: "leise", klasse: "kopf-abmelden" });
    abmeldenKnopf.hidden = true;
    abmeldenKnopf.addEventListener("click", function (ev) { if (abmeldenRueckruf) abmeldenRueckruf(ev); });

    kapsel.appendChild(kontoEl);
    kapsel.appendChild(kapselTrenner);
    kapsel.appendChild(abmeldenKnopf);

    UI.leeren(kopf);
    kopf.appendChild(menueKnopf);
    kopf.appendChild(marke);
    kopf.appendChild(kapsel);

    initialeEinrichten();
    if (schmalAbfrage) {
      if (schmalAbfrage.addEventListener) schmalAbfrage.addEventListener("change", initialeEinrichten);
      else if (schmalAbfrage.addListener) schmalAbfrage.addListener(initialeEinrichten);
    }

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
    schublade.classList.add("schublade");
    schublade.tabIndex = -1;
    if (!schublade.getAttribute("aria-label")) {
      schublade.setAttribute("aria-label", seite === "index" ? "Hauptnavigation" : "Bereiche");
    }
    const schubladeKopf = el("div", "schublade-kopf");
    schubladeKopf.setAttribute("aria-hidden", "true");
    schubladeKopf.appendChild(wortmarke());
    // Der Zurück-Eintrag steht über der Liste und rollt nicht mit ihr.
    schubladeZurueck = el("div", "schublade-zurueck");
    schubladeZurueck.hidden = true;
    schubladeListe = el("div", "schublade-liste");
    UI.leeren(schublade);
    schublade.appendChild(schubladeKopf);
    schublade.appendChild(schubladeZurueck);
    schublade.appendChild(schubladeListe);

    schleier = el("div", "schublade-schleier");
    schublade.parentNode.insertBefore(schleier, schublade);
  }

  function verdrahten() {
    // Die Sprungmarke fokussiert die Tafel, ohne einen #Hash in die Adresse
    // zu schreiben: die Hauptseite führt ihren Zustand im Hash.
    sprungmarke.addEventListener("click", function (ev) {
      ev.preventDefault();
      tafel.focus({ preventScroll: true });
    });

    // Die Kante oben in der Tafel zeigt sich nur, solange Inhalt darunter rollt.
    tafel.addEventListener("scroll", function () {
      const gerollt = tafel.scrollTop > 0;
      if (gerollt !== tafel.hasAttribute("data-gerollt")) tafel.toggleAttribute("data-gerollt", gerollt);
      // Das Polster einer gegangenen Speicherleiste fällt, sobald es aus dem Bild ist.
      leisteRestFreigeben(false);
    }, { passive: true });

    // Wie bei Dialog und Blatt: der zweite Klick eines Doppelklicks auf den
    // Menüknopf schliesst die eben geöffnete Schublade nicht gleich wieder.
    schleierVerdrahten(schleier, function () { return schubladeOffenSeit; }, function () { schubladeSetzen(false); });
    schubladeListe.addEventListener("click", beiSchubladeKlick);

    if (modalAbfrage) {
      const wechsel = function () {
        // Über die Grenze gewachsen: die modale wird zur festen Schublade.
        if (!modalAbfrage.matches) schubladeSetzen(false, { fokusZurueck: false });
        if (indikator) indikator.aktualisieren();
        meldungenAusrichten();
      };
      if (modalAbfrage.addEventListener) modalAbfrage.addEventListener("change", wechsel);
      else if (modalAbfrage.addListener) modalAbfrage.addListener(wechsel);
    }

    if (typeof ResizeObserver === "function") {
      new ResizeObserver(function () { ueberlaufPruefen(); }).observe(schubladeListe);
    }
  }

  function indexAktiv() {
    const h = (location.hash || "").replace(/^#/, "").split("?")[0];
    for (const g of HAUPTZIELE) for (const e of g.eintraege) if (e.schluessel === h) return h;
    return "uebersicht";
  }

  /* ==================================================================
     Schublade: Navigation, Pille, Zähler
     ================================================================== */

  const nav = { signatur: null, aktiv: null, beiWahl: null };
  /** Die letzte Wahl kam aus der modalen Schublade: der Fokus geht danach
      auf die neue Seite (er stünde sonst auf einem verborgenen Eintrag). */
  let wahlAusModal = false;

  function eintraege() {
    return schubladeListe ? Array.from(schubladeListe.querySelectorAll(".schublade-eintrag")) : [];
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
    const k = el(e.href ? "a" : "button", "schublade-eintrag");
    if (e.href) k.href = e.href;
    else k.type = "button";
    k.setAttribute("data-schluessel", String(e.schluessel));
    if (e.sinnbild) k.appendChild(UI.sinnbild(e.sinnbild, 20));
    k.appendChild(el("span", "schublade-text", e.text));
    k.appendChild(el("span", "schublade-zahl"));
    return k;
  }

  function listeBauen(gruppen, aktiv) {
    if (indikator) { indikator.zerstoeren(); indikator = null; }
    UI.leeren(schubladeListe);
    gruppen.forEach(function (g, i) {
      const gruppe = el("div", "schublade-gruppe");
      if (g.titel) {
        const id = "schublade-gruppe-" + i;
        const titel = el("p", "schublade-titel", g.titel);
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
    if (gruppen.length) {
      indikator = Bewegung.indikator(schubladeListe, {
        aktiv: "[aria-current=\"page\"]", klasse: "schublade-indikator"
      });
    }
    aktivZeigen();
  }

  /* Zurück-Eintrag der Detailseiten: ein schlichter Link zur Liste (keine
     Pille, kein beiWahl – er verlässt die Seite). Er steht über den Gruppen
     und trägt den Namen der Liste; der Pfeil sagt «zurück», das aria-label
     auch dem Screenreader. Solange er steht (body[data-zurueck]), weicht der
     Zurück-Link über dem Seitentitel, wenn die Schublade fest daneben steht
     (rahmen.css §5). */
  const zurueckStand = { signatur: null };

  function zurueckSetzen(z) {
    const gueltig = !!(z && z.href && z.text);
    const signatur = gueltig ? z.text + "\u0000" + z.href : "";
    if (signatur === zurueckStand.signatur) return;
    zurueckStand.signatur = signatur;
    UI.leeren(schubladeZurueck);
    schubladeZurueck.hidden = !gueltig;
    body.toggleAttribute("data-zurueck", gueltig);
    if (!gueltig) return;
    const a = el("a", "schublade-eintrag schublade-eintrag-zurueck");
    a.href = z.href;
    a.setAttribute("aria-label", "Zurück zu " + z.text);
    a.appendChild(UI.sinnbild("pfeilLinks", 20));
    a.appendChild(el("span", "schublade-text", z.text));
    schubladeZurueck.appendChild(a);
  }

  function navigation(optionen) {
    if (!bereit) return;
    const o = optionen || {};
    const verstecken = !!o.verstecken;
    if (verstecken !== body.hasAttribute("data-ohne-schublade")) {
      body.toggleAttribute("data-ohne-schublade", verstecken);
      if (verstecken) schubladeSetzen(false, { fokusZurueck: false });
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
    if (indikator && !inhaltGezeigt) {
      // Vor dem ersten Inhalt (die Seite korrigiert beim Start den aktiven
      // Eintrag) springt die Pille, statt beim Laden schon zu gleiten.
      indikator.zerstoeren();
      indikator = Bewegung.indikator(schubladeListe, {
        aktiv: "[aria-current=\"page\"]", klasse: "schublade-indikator"
      });
    } else if (indikator) {
      // Nur ein ANDERER Eintrag gleitet (Bewegung.indikator merkt sich den letzten).
      indikator.aktualisieren();
    }
    aktivZeigen();
  }

  function zahl(schluessel, wert) {
    if (!bereit) return;
    const k = eintragVon(schluessel);
    if (!k) return;
    const text = (wert === null || wert === undefined || wert === false || wert === "")
      ? "" : (typeof wert === "number" ? zahlText(wert) : String(wert));
    const z = k.querySelector(".schublade-zahl");
    const warLeer = z.textContent === "";
    UI.textSetzen(z, text);
    // Mapping 7.2 #16: ein Zähler, der erscheint, ploppt (.6 → 1); ein
    // neuer Wert ändert sich ohne Bewegung.
    if (warLeer && text) Bewegung.eintreten(z, "ploppen");
  }

  function ueberlaufPruefen() {
    if (!schubladeListe) return false;
    const ueber = schubladeListe.scrollHeight > schubladeListe.clientHeight + 1;
    if (ueber !== schubladeListe.hasAttribute("data-ueberlauf")) schubladeListe.toggleAttribute("data-ueberlauf", ueber);
    return ueber;
  }

  /* Hält den aktiven Eintrag in einer Liste sichtbar, die höher ist als das
     Fenster. Nur die Liste rollt, sofort (scrollIntoView rollte auch die
     Seite); ihr Griff bleibt sichtbar, solange sie überläuft. */
  function aktivZeigen() {
    if (!ueberlaufPruefen()) return;
    const k = schubladeListe.querySelector("[aria-current=\"page\"]");
    if (!k) return;
    const l = schubladeListe.getBoundingClientRect();
    const r = k.getBoundingClientRect();
    let d = 0;
    if (r.top < l.top + LISTEN_RAND_PX) d = r.top - l.top - LISTEN_RAND_PX;
    else if (r.bottom > l.bottom - LISTEN_RAND_PX) {
      d = Math.min(r.bottom - l.bottom + LISTEN_RAND_PX, r.top - l.top - LISTEN_RAND_PX);
    }
    schubladeListe.scrollTop += d;
  }

  function beiSchubladeKlick(ev) {
    const k = ev.target && ev.target.closest ? ev.target.closest(".schublade-eintrag") : null;
    if (!k || !schubladeListe.contains(k)) return;
    const modifiziert = ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey;
    const warModal = schubladeOffen;
    if (nav.beiWahl && !modifiziert) {
      ev.preventDefault();
      if (warModal) {
        wahlAusModal = true;
        schubladeSetzen(false, { fokusZurueck: false });
      }
      const vorher = wechselMarke;
      try {
        nav.beiWahl(k.getAttribute("data-schluessel"), ev);
      } finally {
        // Kein Wechsel ausgelöst (derselbe Eintrag, oder die Seite rollt nur
        // zu einem Abschnitt): stünde der Fokus noch in der geschlossenen
        // Schublade, geht er zum Menüknopf. Hat die Seite ihn selbst gesetzt
        // (Abschnittstitel), bleibt er dort.
        if (warModal && vorher === wechselMarke) {
          wahlAusModal = false;
          const a = aktivesElement();
          if (!a || schublade.contains(a)) menueKnopf.focus();
        }
      }
      return;
    }
    // Ein neuer Tab oder eine echte Navigation: der Fokus geht sofort zurück.
    if (warModal) schubladeSetzen(false);
  }

  /* ---------- Modale Schublade (≤ 900 px) ---------- */

  let schubladeOffen = false;
  let schubladeOffenSeit = 0;

  function schubladeSetzen(offen, optionen) {
    const fokusZurueck = !optionen || optionen.fokusZurueck !== false;
    if (!bereit || offen === schubladeOffen) return;
    if (offen && (!modalAbfrage || !modalAbfrage.matches || body.hasAttribute("data-ohne-schublade"))) return;
    schubladeOffen = offen;
    if (offen) schubladeOffenSeit = Date.now();
    body.toggleAttribute("data-schublade-offen", offen);
    menueKnopf.setAttribute("aria-expanded", String(offen));
    inertSetzen();
    if (offen) {
      tippVerbergen();
      // Die Pille gleitet in der modalen Schublade nicht; sie muss nur beim
      // Öffnen an ihrem Platz sein.
      if (indikator) indikator.aktualisieren();
      aktivZeigen();
      const ziel = schubladeListe.querySelector("[aria-current=\"page\"]")
        || schubladeListe.querySelector(".schublade-eintrag");
      (ziel || schublade).focus();
    } else if (fokusZurueck) {
      menueKnopf.focus();
    }
  }

  /* Alles hinter einer offenen Ebene (Dialog, Blatt, modale Schublade) ist
     ausser Reichweite. Meldungen und Tooltip bleiben bedienbar. */
  function inertSetzen() {
    if (!body) return;
    const oben = ebeneOben();
    for (const kind of Array.from(body.children)) {
      if (kind.tagName === "SCRIPT" || kind.tagName === "TEMPLATE") continue;
      let aus = false;
      if (oben) aus = kind !== oben.element && kind !== region && kind !== tippEl && kind !== ansage;
      else if (schubladeOffen) aus = kind === kopf || kind === tafelRahmen || kind === sprungmarke;
      if (kind.inert !== aus) kind.inert = aus;
    }
  }

  /* ==================================================================
     Kopf: Konto und Abmelden in einer Kapsel
     ================================================================== */

  /* Die Kapsel zeigt sich, sobald sie etwas trägt; der Trenner nur
     zwischen Konto und «Abmelden». */
  function kapselAbgleichen() {
    kapsel.hidden = kontoEl.hidden && abmeldenKnopf.hidden;
    kapselTrenner.hidden = kontoEl.hidden || abmeldenKnopf.hidden;
  }

  /* Breit stehen Name und E-Mail daneben: die Initiale ist dann Schmuck.
     Schmal (≤ 720 px) steht sie allein und nennt das Konto selbst – als
     Tabstopp mit Tooltip, auch auf Antippen. */
  function initialeEinrichten() {
    const allein = !!(schmalAbfrage && schmalAbfrage.matches);
    if (allein) {
      kontoInitiale.tabIndex = 0;
      kontoInitiale.setAttribute("role", "img");
      kontoInitiale.removeAttribute("aria-hidden");
    } else {
      if (document.activeElement === kontoInitiale) kontoInitiale.blur();
      kontoInitiale.removeAttribute("tabindex");
      kontoInitiale.removeAttribute("role");
      kontoInitiale.setAttribute("aria-hidden", "true");
    }
  }

  function kontoZeigen(k) {
    const name = k && k.name ? String(k.name) : "";
    const email = k && (k.email || k.adresse) ? String(k.email || k.adresse) : "";
    kontoEl.hidden = !name && !email;
    UI.textSetzen(kontoName, name || email);
    UI.textSetzen(kontoEmail, name ? email : "");
    const erstes = Array.from((name || email).trim())[0] || "?";
    kontoInitiale.textContent = erstes.toLocaleUpperCase("de-CH");
    kontoInitiale.setAttribute("aria-label", email ? "Angemeldet als " + [name, email].filter(Boolean).join(", ") : name);
    kontoInitiale.setAttribute("data-tipp", [name, email].filter(Boolean).join("\n"));
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
     Seitenkopf: EIN Bauer für den Kopf jeder Ansicht (ChatBob pageHeader:
     Titel 24/32 + Lead) und jeder Detailseite (Mapping 7.2 #7: Zurück-Link
     darüber, Teile-Zeile, Status-Chips, Aktionen rechts). Leere Teile
     nehmen keinen Platz (rahmen.css :empty).
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
    wurzel.classList.add("seitenkopf");
    if (o.id) wurzel.id = o.id;

    // Zurück-Link «‹ ADMIN-Clients»: ein echter Link (Mittelklick = neuer Tab).
    const pfad = el("a", "knopf knopf-leise knopf-klein seitenkopf-pfad");
    pfad.appendChild(UI.sinnbild("chevronLinks", 16));
    const pfadText = el("span");
    pfad.appendChild(pfadText);
    pfad.hidden = true;

    const zeile = el("div", "seitenkopf-zeile");
    const textTeil = el("div", "seitenkopf-text");
    // Programmatisches Fokusziel beim Seiten- und Zustandswechsel (ohne Ring).
    const titel = el("h" + (o.ebene || 1), "seitenkopf-titel");
    titel.tabIndex = -1;
    if (o.titelId) titel.id = o.titelId;
    const lead = el("p", "seitenkopf-lead");
    const unter = el("p", "seitenkopf-unter");
    const status = el("div", "seitenkopf-status");
    const aktionen = el("div", "seitenkopf-aktionen");
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
      ladebalken.hidden = false;
      const block = el("div", "zustand-laden");
      ladeMeta = el("p", "zustand-fortschritt");
      // Die Zeile ändert sich laufend («ADMIN-Clients 50 / …»): sie wäre als
      // Live-Region zu gesprächig; angesagt wird der Text des Skeletts.
      ladeMeta.setAttribute("aria-hidden", "true");
      ladeSkelett = UI.skelettSeite({ karten: o.karten || 2, text: o.text || "Wird geladen …" });
      // Die Meta-Zeile steht unter den Platzhaltern für Titel und Lead (wo
      // sonst der Lead stünde): der Titel-Platzhalter liegt so genau dort,
      // wo der Seitentitel erscheinen wird.
      ladeSkelett.insertBefore(ladeMeta, ladeSkelett.querySelector(".skelett-karte"));
      block.appendChild(ladeSkelett);
      UI.leeren(zustandsBlock).appendChild(block);
      ladeText = "";
      ladeFortschritt = "";
    }
    if (o.text !== undefined) {
      ladeText = o.text || "";
      const sr = ladeSkelett && ladeSkelett.querySelector(".nur-sr");
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
    ladebalken.hidden = true;

    const titel = o.titel || (art === "fehler" ? "Die Daten konnten nicht geladen werden" : "Erledigt");
    // pfad: der Zurück-Link «‹ ADMIN-Clients» bleibt auch im Fehler- und
    // Endzustand stehen – der Weg zurück zur Liste ist nie verbaut.
    const kopfTeil = seitenkopf({ titel: titel, pfad: o.pfad || null });
    const h1 = kopfTeil.knoten.titel;

    const beiKlick = typeof o.beiKlick === "function" ? o.beiKlick : function () { location.reload(); };
    let block;
    if (art === "fehler") {
      // Der Fehlerkasten wie bei ChatBob: Fehlerfarbe, Text, «Erneut laden».
      const text = [o.text, o.hinweis].filter(Boolean).join(" ");
      block = UI.banner({
        ton: "gefahr", rolle: "alert", text: text || "Unbekannter Fehler.",
        knopf: knopf({ text: o.knopfText || "Erneut laden", variante: "leise", beiKlick: beiKlick })
      });
    } else {
      kopfTeil.setzen({ lead: [o.text, o.hinweis].filter(Boolean).join(" ") });
      block = el("div", "aktionszeile");
      block.appendChild(knopf({ text: o.knopfText || "Zur Übersicht", variante: "primaer", beiKlick: beiKlick }));
    }
    UI.leeren(zustandsBlock);
    zustandsBlock.appendChild(kopfTeil);
    zustandsBlock.appendChild(block);
    dokumentTitel(titel);
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
    // Eine sichtbar gewordene Ladeanzeige bleibt mindestens 450 ms stehen.
    return (warLaden ? Bewegung.ladeAbwarten(start) : Promise.resolve()).then(function () {
      if (marke !== zustandsMarke) return false;
      ladebalken.hidden = true;
      bahn.removeAttribute("data-zustand");
      UI.leeren(zustandsBlock);
      ladeSkelett = null;
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
     zuletzt data-rolle (Roller). */
  function wiederfindSchluessel(k) {
    if (!k || !k.getAttribute) return null;
    if (k.hasAttribute("data-fokus")) return "[data-fokus=\"" + CSS.escape(k.getAttribute("data-fokus")) + "\"]";
    if (k.id) return "#" + CSS.escape(k.id);
    if (k.hasAttribute("data-rolle")) return "[data-rolle=\"" + CSS.escape(k.getAttribute("data-rolle")) + "\"]";
    return null;
  }

  /* zeichnen() baut den Behälter ganz oder teilweise neu – ohne Bewegung.
     Danach stehen die Tafel und alle inneren Roller (mit data-fokus, id
     oder data-rolle) wieder dort, wo sie waren. Ist das fokussierte
     Element dabei verschwunden, bekommt sein Gegenstück den Fokus (samt
     Schreibmarke und Rollposition im Feld): gefunden über data-fokus/id,
     sonst das Bedienelement an derselben Stelle, sonst der Seitentitel im
     Behälter. Ein stehen gebliebenes Element behält ihn ohnehin. Das
     Gegenstück zu Rahmen.wechseln für Daten, die sich nur ändern (api.md
     §9.1/§9.2); F.zeichneBereich benutzt es für die Detailseiten. */
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

    zeichnen();

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
    if (!ziel) ziel = behaelter.querySelector(".seitenkopf-titel");
    if (!ziel || !ziel.focus) return;
    ziel.focus({ preventScroll: true });
    if (auswahl && typeof ziel.setSelectionRange === "function") {
      try { ziel.setSelectionRange(auswahl[0], auswahl[1], auswahl[2] || "none"); } catch (e) { /* ohne Schreibmarke */ }
    }
    if (feldOben) ziel.scrollTop = feldOben;
  }

  /* ==================================================================
     Wechsel innerhalb der Seite (Fade-through wie ChatBob shell.show)
     ================================================================== */

  let wechselMarke = 0;

  /** Unter dieser Deckkraft verschwindet ein abgebrochener Eintritt sofort,
      statt noch auszublenden (er war ohnehin kaum zu sehen). */
  const KAUM_SICHTBAR = 0.3;
  /** Elemente, deren Deckkraft eintrittBeenden inline festhält (nur diese
      Angabe nimmt wechseln wieder weg). */
  const deckkraftGehalten = new WeakSet();

  /* Ein noch laufender Eintritt besitzt die Deckkraft: sonst begänne das
     Ausblenden nie (und es käme kein transitionend). Er wird nicht zu Ende
     gespielt (finish() liesse die halb eingeblendete Ansicht in einem Bild
     auf volle Deckkraft springen), sondern dort abgebrochen, wo er steht:
     die erreichte Deckkraft bleibt als Ausgangswert stehen, von dort blendet
     .wechsel-weg aus. Ist kaum etwas zu sehen, ist sie gleich weg.
     Gibt true zurück, wenn ein Eintritt lief (dann muss der Aufrufer das
     Layout lesen, bevor er .wechsel-weg setzt). */
  function eintrittBeenden(k) {
    if (!k.classList.contains("eintritt") || !k.getAnimations) return false;
    const deckkraft = parseFloat(getComputedStyle(k).opacity);
    for (const a of k.getAnimations()) a.cancel();
    k.classList.remove("eintritt", "eintritt--tausch");
    k.style.setProperty("opacity", String(isFinite(deckkraft) && deckkraft >= KAUM_SICHTBAR ? deckkraft : 0));
    deckkraftGehalten.add(k);
    return true;
  }

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

  function wechseln(neu, optionen) {
    const o = optionen || {};
    if (!bereit) {
      if (typeof neu === "function") neu();
      return Promise.resolve(false);
    }
    const marke = ++wechselMarke;
    const ausModal = wahlAusModal;
    wahlAusModal = false;
    if (schubladeOffen) schubladeSetzen(false, { fokusZurueck: false });
    tippVerbergen();

    const alt = (o.alt ? [].concat(o.alt) : inhaltsKinder()).filter(sichtbar);
    let warten = Promise.resolve();
    if (alt.length) {
      let beendet = false;
      for (const k of alt) beendet = eintrittBeenden(k) || beendet;
      // Wie ChatBob shell.show (void outgoing.offsetWidth): erst das Lesen
      // des Layouts übernimmt das Ende des Eintritts als Ausgangswert.
      // Ohne diesen Schritt begänne im selben Takt kein Übergang – ein
      // Klick während eines Eintritts liesse den alten Inhalt in einem
      // Bild verschwinden statt 100 ms auszublenden.
      if (beendet) void alt[0].offsetWidth;
      // Im selben Takt: die stehen gebliebene Deckkraft weg, .wechsel-weg
      // dazu – der Übergang läuft von ihr aus auf 0.
      for (const k of alt) {
        k.classList.add("wechsel-weg");
        if (deckkraftGehalten.delete(k)) k.style.removeProperty("opacity");
      }
      if (getComputedStyle(alt[0]).opacity !== "0") {
        warten = Bewegung.abgeschlossen(alt[0], {
          ereignis: "transitionend", eigenschaft: "opacity", zeit: AUSBLENDEN_FRIST_MS
        });
      }
    }
    return warten.then(function () {
      if (marke !== wechselMarke) return false;   // ein neuerer Wechsel hat übernommen
      for (const k of alt) k.classList.remove("wechsel-weg");
      // Der Fokus geht auf die neue Seite nur, wo er sonst verloren wäre: im
      // ausgehenden Inhalt, schon auf <body> oder in der modalen Schublade.
      const aktiv = aktivesElement();
      const fokusSeite = alt.length > 0 && (!aktiv || ausModal
        || alt.some(function (k) { return k.contains(aktiv); }));
      let rein = typeof neu === "function" ? neu() : ersetzen(neu);
      rein = rein ? [].concat(rein) : inhaltsKinder();
      rein = rein.filter(sichtbar);
      if (o.nachOben !== false) {
        tafel.scrollTop = 0;
        tafel.removeAttribute("data-gerollt");
      }
      if (fokusSeite) seiteFokussieren(rein[0]);
      for (const k of rein) Bewegung.eintreten(k, "tausch");
      // Wie ChatBob: gestaffelt werden nur Raster IN der neuen Ansicht.
      if (o.auftritt !== false) for (const k of rein) Bewegung.auftritt(k, { wurzel: false });
      return true;
    });
  }

  function erstauftritt(behaelter, optionen) {
    Bewegung.auftritt(behaelter, optionen);
  }

  function fest(an) {
    if (tafel) tafel.toggleAttribute("data-fest", !!an);
  }

  function dokumentTitel(text) {
    document.title = (text ? text + " – " : "") + PRODUKT;
  }

  /* ==================================================================
     Ebenen: Dialog und Seitenblatt
     ================================================================== */

  const ebenen = [];
  let ebenenZaehler = 0;

  function ebeneOben() { return ebenen.length ? ebenen[ebenen.length - 1] : null; }
  function ebeneOffen() { return ebenen.length > 0; }

  function ebeneOeffnen(ebene) {
    if (schubladeOffen) schubladeSetzen(false, { fokusZurueck: false });
    tippVerbergen();
    body.appendChild(ebene.element);
    ebenen.push(ebene);
    inertSetzen();
    meldungenUmziehen();
  }

  /* Zustand und Fokus wechseln sofort, nur die Pixel gehen einen Moment
     später (ChatBob createDialog): so kann die Seite gleich nach
     «await UI.bestaetigen(…)» wieder fokussieren und schreiben. */
  function ebeneSchliessen(ebene) {
    const i = ebenen.indexOf(ebene);
    if (i !== -1) ebenen.splice(i, 1);
    inertSetzen();
    // Meldungen, die in der Ebene standen, bleiben auf der Seite stehen,
    // statt mit ihr zu gehen (sie gleiten an die neue Kante).
    meldungenUmziehen();
    fokusZurueckGeben(ebene);
    ebene.element.setAttribute("data-schliesst", "");
    return Bewegung.abgeschlossen(ebene.flaeche).then(function () {
      ebene.element.remove();
    });
  }

  /* Wie F.zeichneBereich findet die Ebene ihren Auslöser über
     wiederfindSchluessel (oben: data-fokus › id › data-rolle) wieder: hat
     die Seite den Bereich dahinter neu gezeichnet (Nachladen,
     BroadcastChannel), ist der alte Knoten weg, ein gleichwertiger neuer
     aber da. (Früher stand hier eine zweite Funktion gleichen Namens ohne
     data-rolle; als spätere Deklaration galt sie im ganzen Rahmen, und
     Rahmen.stillZeichnen stellte Roller mit nur data-rolle nie wieder her.) */

  function fokusbereit(k) {
    return !!k && k.isConnected && !k.closest("[inert]") && k.getClientRects().length > 0;
  }

  function fokusZurueckGeben(ebene) {
    const aktiv = aktivesElement();
    if (aktiv && !ebene.element.contains(aktiv)) return;   // schon woanders hin bewegt
    let ziel = ebene.rueckfokus;
    if (!fokusbereit(ziel)) {
      ziel = ebene.rueckSchluessel ? document.querySelector(ebene.rueckSchluessel) : null;
      if (!fokusbereit(ziel)) ziel = null;
    }
    if (!ziel) {
      const oben = ebeneOben();
      ziel = oben ? (fokussierbare(oben.falle)[0] || oben.falle) : tafel;
    }
    if (ziel && ziel.focus) ziel.focus({ preventScroll: true });
    else if (aktiv) aktiv.blur();
  }

  function rueckrufEinmal(rueckruf) {
    let gerufen = false;
    return function (grund) {
      if (gerufen || typeof rueckruf !== "function") return;
      gerufen = true;
      try { rueckruf(grund); } catch (e) { fehlerMeldungAusnahme(e); }
    };
  }

  /* Der Schleier schliesst nur mit einem eigenen, einfachen Klick. Der
     zweite Klick eines Doppelklicks auf «Löschen …» oder «Filter» träfe
     sonst schon den eben erschienenen Schleier und schlösse die Ebene
     wieder: sie blitzte nur auf, UI.bestaetigen löste stumm mit false auf.
     Darum zählt ein Klick nur, wenn er auf dem Schleier gedrückt wurde,
     kein Folgeklick ist (detail > 1) und die Ebene schon 300 ms offen ist.
     offenSeit() liefert den Zeitpunkt des letzten Öffnens. */
  function schleierVerdrahten(schleierEl, offenSeit, schliessen) {
    let gedrueckt = false;
    schleierEl.addEventListener("pointerdown", function (ev) { gedrueckt = ev.target === schleierEl; });
    schleierEl.addEventListener("click", function (ev) {
      const eigen = gedrueckt;
      gedrueckt = false;
      if (!eigen || ev.detail > 1 || Date.now() - offenSeit() < SCHLEIER_SPERRE_MS) return;
      schliessen();
    });
  }

  /* ---------- Dialog ---------- */

  /* Eine Liste im Dialog (.dialog-liste) nimmt die Resthöhe und rollt
     selbst (rahmen.css). Bleibt ihr weniger als LISTE_MIN_PX – gut eine
     Listenzeile –, obwohl sie mehr zu zeigen hätte, ist der Dialog knapp
     (data-knapp): die Liste steht dann in voller Länge im Inhalt, und der
     Inhalt ist die eine Rollfläche. Geprüft wird nach dem Öffnen, wenn sich
     das Fenster ändert und wenn die Seite den Inhalt neu füllt (Tippen in
     der Suche) – höchstens einmal je Bild, still und ohne Bewegung. Zum
     Messen wird data-knapp kurz entfernt (im selben Takt, nie zu sehen);
     die Rollstellung des Inhalts bleibt dabei erhalten. */
  const LISTE_MIN_PX = 112;

  function knappBeobachten(wurzel, flaeche, inhalt, ebene) {
    let geplant = 0;
    function pruefen() {
      geplant = 0;
      if (!ebene.offen) return;
      const liste = inhalt.querySelector(":scope > .dialog-liste");
      const vorher = flaeche.hasAttribute("data-knapp");
      if (!liste) {
        if (vorher) flaeche.removeAttribute("data-knapp");
        return;
      }
      const oben = inhalt.scrollTop;
      if (vorher) flaeche.removeAttribute("data-knapp");
      inhalt.style.removeProperty("scroll-padding-top");
      const knapp = liste.clientHeight < LISTE_MIN_PX && liste.scrollHeight > liste.clientHeight + 1;
      if (knapp) {
        flaeche.setAttribute("data-knapp", "");
        /* Das klebende Suchfeld läge sonst über einer Zeile, die der Browser
           beim Zurück-Tabben an die Oberkante rollt: Fokus und Name wären
           verdeckt. Der Abstand oben hält die Zeile darunter (Feld + 8 px
           Luft, wie der Flächenschatten in rahmen.css). */
        const ueber = liste.previousElementSibling;
        if (ueber) {
          const luft = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--a2")) || 8;
          inhalt.style.scrollPaddingTop = (ueber.offsetHeight + luft) + "px";
        }
        if (vorher) inhalt.scrollTop = oben;
      }
    }
    function planen() {
      if (!geplant && ebene.offen) geplant = requestAnimationFrame(pruefen);
    }
    const groesse = typeof ResizeObserver === "function" ? new ResizeObserver(planen) : null;
    if (groesse) groesse.observe(wurzel);
    else window.addEventListener("resize", planen);
    const inhaltWache = new MutationObserver(planen);
    inhaltWache.observe(inhalt, { childList: true, subtree: true });
    planen();
    ebene.knappLoesen = function () {
      if (geplant) cancelAnimationFrame(geplant);
      geplant = 0;
      if (groesse) groesse.disconnect();
      else window.removeEventListener("resize", planen);
      inhaltWache.disconnect();
    };
  }

  function dialog(optionen) {
    const o = optionen || {};
    const id = "dialog-" + (++ebenenZaehler);
    const wurzel = el("div", "dialog" + (o.breit ? " dialog-breit" : "") + (o.klasse ? " " + o.klasse : ""));
    const schleierEl = el("div", "dialog-schleier");
    const flaeche = el("div", "dialog-flaeche");
    flaeche.tabIndex = -1;
    flaeche.setAttribute("role", o.rolle || "dialog");
    flaeche.setAttribute("aria-modal", "true");
    flaeche.setAttribute("aria-labelledby", id + "-titel");
    const titelEl = el("h2", "dialog-titel", o.titel || "");
    titelEl.id = id + "-titel";
    const inhalt = el("div", "dialog-inhalt");
    const knoepfe = el("div", "dialog-knoepfe");
    UI.anhaengen(inhalt, o.inhalt);
    UI.anhaengen(knoepfe, o.knoepfe);
    flaeche.appendChild(titelEl);
    flaeche.appendChild(inhalt);
    flaeche.appendChild(knoepfe);
    wurzel.appendChild(schleierEl);
    wurzel.appendChild(flaeche);

    const ausloeser = aktivesElement();
    const ebene = {
      art: "dialog", element: wurzel, flaeche: flaeche, falle: flaeche,
      rueckfokus: ausloeser, rueckSchluessel: wiederfindSchluessel(ausloeser),
      offen: true, schliessen: null, sperre: false, offenSeit: Date.now()
    };
    const melden = rueckrufEinmal(o.beiSchliessen);
    let fertig = null;

    function schliessen(grund) {
      if (!ebene.offen) return fertig || Promise.resolve();
      ebene.offen = false;
      if (ebene.knappLoesen) ebene.knappLoesen();
      melden(grund || "schliessen");
      fertig = ebeneSchliessen(ebene);
      return fertig;
    }
    ebene.schliessen = schliessen;

    /* Der Fokus beginnt auf dem ersten Feld, sonst auf dem ersten Knopf
       (bei Fragen «Abbrechen», die sichere Wahl). Erst im nächsten Takt:
       die Seite füllt Inhalt und Knöpfe oft gleich nach dem Öffnen und
       setzt den Fokus dann selbst. */
    function fokussieren() {
      if (!ebene.offen) return;
      const aktiv = document.activeElement;
      if (aktiv && aktiv !== flaeche && flaeche.contains(aktiv)) return;
      const vorgabe = typeof o.fokus === "function" ? o.fokus() : o.fokus;
      const ziel = (vorgabe && vorgabe.isConnected ? vorgabe : null)
        || inhalt.querySelector("input:not([disabled]):not([type=\"hidden\"]), select:not([disabled]), textarea:not([disabled])")
        || knoepfe.querySelector("button:not([disabled])")
        || flaeche;
      ziel.focus();
    }

    schleierVerdrahten(schleierEl, function () { return ebene.offenSeit; }, function () {
      if (!ebene.sperre) schliessen("schleier");
    });
    ebeneOeffnen(ebene);
    flaeche.focus({ preventScroll: true });
    if (o.fokus) fokussieren();
    setTimeout(fokussieren, 0);
    knappBeobachten(wurzel, flaeche, inhalt, ebene);

    return {
      element: wurzel,
      flaeche: flaeche,
      inhalt: inhalt,
      knoepfe: knoepfe,
      titel: function (t) { UI.textSetzen(titelEl, t); },
      schliessen: schliessen,
      offen: function () { return ebene.offen; },
      fokussieren: fokussieren,
      /** Solange gesperrt (z. B. während gelöscht wird), schliessen Esc und
          Schleier nicht; schliessen() der Seite geht weiter. */
      sperren: function (an) { ebene.sperre = !!an; }
    };
  }

  /* Ja/Nein-Frage statt window.confirm. Der Titel fragt, der Text nennt die
     Folge, der Hauptknopf benennt sie («Eintrag löschen», nie «OK»). */
  function bestaetigen(a, frage, knopfText) {
    const o = a && typeof a === "object" ? a : { titel: a, text: frage, ja: knopfText };
    return new Promise(function (aufloesen) {
      let antwort = false;
      const textId = "dialog-text-" + (ebenenZaehler + 1);
      const nein = knopf({ text: o.nein || "Abbrechen", variante: "leise" });
      const ja = knopf({ text: o.ja || "Bestätigen", variante: "primaer" });
      const inhalt = [];
      if (o.text) {
        const p = el("p", "dialog-text", o.text);
        p.id = textId;
        inhalt.push(p);
      }
      const d = dialog({
        titel: o.titel || "Bestätigen", inhalt: inhalt, knoepfe: [nein, ja], rolle: "alertdialog",
        breit: !!o.breit, fokus: nein,
        beiSchliessen: function () { aufloesen(antwort); }
      });
      if (o.text) d.flaeche.setAttribute("aria-describedby", textId);
      nein.addEventListener("click", function () { d.schliessen("abbrechen"); });
      ja.addEventListener("click", function () { antwort = true; d.schliessen("ja"); });
    });
  }

  /* ---------- Seitenblatt ---------- */

  function blatt(optionen) {
    const o = optionen || {};
    const id = "blatt-" + (++ebenenZaehler);
    const breit = (o.breite || 560) >= 720 || o.breit;
    const wurzel = el("div", "blatt" + (breit ? " blatt-breit" : "") + (o.klasse ? " " + o.klasse : ""));
    const schleierEl = el("div", "blatt-schleier");
    const flaeche = el("section", "blatt-flaeche");
    flaeche.tabIndex = -1;
    flaeche.setAttribute("role", "dialog");
    flaeche.setAttribute("aria-modal", "true");
    flaeche.setAttribute("aria-labelledby", id + "-titel");

    const kopfTeil = el("div", "blatt-kopf");
    const kopfText = el("div", "blatt-kopf-text");
    const titelEl = el("h2", "blatt-titel", o.titel || "");
    titelEl.id = id + "-titel";
    const unterEl = el("p", "blatt-unter", o.unter || "");
    kopfText.appendChild(titelEl);
    kopfText.appendChild(unterEl);
    const zu = knopf({ variante: "sinnbild", sinnbild: "schliessen", titel: "Schliessen", klasse: "blatt-schliessen" });
    kopfTeil.appendChild(kopfText);
    kopfTeil.appendChild(zu);

    // Der Körper ist ein eigener Tabstopp (Pfeiltasten rollen ihn).
    const koerper = el("div", "blatt-koerper");
    koerper.tabIndex = 0;
    koerper.setAttribute("role", "region");
    koerper.setAttribute("aria-labelledby", id + "-titel");
    const fuss = el("div", "blatt-fuss");
    UI.anhaengen(koerper, o.inhalt);
    UI.anhaengen(fuss, o.fuss);

    flaeche.appendChild(kopfTeil);
    flaeche.appendChild(koerper);
    flaeche.appendChild(fuss);
    wurzel.appendChild(schleierEl);
    wurzel.appendChild(flaeche);

    const ausloeser = aktivesElement();
    const ebene = {
      art: "blatt", element: wurzel, flaeche: flaeche, falle: flaeche, koerper: koerper,
      rueckfokus: ausloeser, rueckSchluessel: wiederfindSchluessel(ausloeser),
      offen: true, schliessen: null, sperre: false, offenSeit: Date.now()
    };
    const melden = rueckrufEinmal(o.beiSchliessen);
    let fertig = null;

    function schliessen(grund) {
      if (!ebene.offen) return fertig || Promise.resolve();
      ebene.offen = false;
      melden(grund || "schliessen");
      fertig = ebeneSchliessen(ebene);
      return fertig;
    }
    ebene.schliessen = schliessen;

    koerper.addEventListener("scroll", function () {
      const gerollt = koerper.scrollTop > 0;
      if (gerollt !== flaeche.hasAttribute("data-gerollt")) flaeche.toggleAttribute("data-gerollt", gerollt);
    }, { passive: true });
    zu.addEventListener("click", function () { schliessen("knopf"); });
    schleierVerdrahten(schleierEl, function () { return ebene.offenSeit; }, function () {
      if (!ebene.sperre) schliessen("schleier");
    });

    ebeneOeffnen(ebene);
    zu.focus({ preventScroll: true });

    return {
      element: wurzel,
      flaeche: flaeche,
      koerper: koerper,
      fuss: fuss,
      titel: function (t) { UI.textSetzen(titelEl, t); },
      unter: function (t) { UI.textSetzen(unterEl, t); },
      schliessen: schliessen,
      offen: function () { return ebene.offen; },
      /** Fokusziel, wenn der Körper unter dem Fokus neu gebaut wurde. */
      fokusSchliessen: function () { zu.focus({ preventScroll: true }); },
      sperren: function (an) { ebene.sperre = !!an; }
    };
  }

  /* EIN Tastenwächter in der Fangphase: Esc schliesst nur die oberste Ebene
     (ein Dialog über einem Blatt), Tab bleibt in ihr. Danach die modale
     Schublade. Seiten-Handler (Esc = Verwerfen) sehen die Taste dann nicht. */
  window.addEventListener("keydown", function (ev) {
    const oben = ebeneOben();
    if (oben) {
      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        tippVerbergen();
        // Eine gesperrte Ebene (es wird gerade gelöscht) bleibt offen; die
        // Taste erreicht trotzdem keine Seite (kein «Verwerfen?» dahinter).
        if (!oben.sperre) oben.schliessen("esc");
      } else if (ev.key === "Tab") {
        // Die ganze Ebene: Fläche und die Meldungen, die in ihr stehen.
        tabFangen(ev, oben.element, oben.falle);
      }
      return;
    }
    if (schubladeOffen) {
      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        schubladeSetzen(false);
      } else if (ev.key === "Tab") {
        tabFangen(ev, schublade);
      }
    }
  }, true);

  /* ==================================================================
     Meldung (Snackbar)
     ================================================================== */

  let region = null;
  /** Die Ansage für Screenreader: EINE Live-Region, die von Anfang an da ist
      und nie umzieht. Eine Live-Region, die im selben Takt wie ihr erster
      Inhalt entsteht oder umgehängt wird, sagen Screenreader oft nicht an. */
  let ansage = null;
  let ansageUhr = 0;
  /** Offene Fehlermeldungen und wie man jede schliesst. */
  const offeneFehler = new Map();
  /** Worum es in einer Meldung geht (der Fokus kehrt dorthin zurück). */
  const herkunft = new WeakMap();
  const meldungsDaten = new WeakMap();

  /* Die sichtbare Region ist keine Live-Region (sie zieht in Ebenen um);
     angesagt wird über «ansage». */
  function regionSichern() {
    if (!region) region = el("div", "meldungen");
    if (regionPlatzieren() && offeneFehler.size) platzReservieren();
    return region;
  }

  function ansageEinrichten() {
    if (ansage || !body) return;
    ansage = el("div", "nur-sr");
    ansage.id = "ansage";
    ansage.setAttribute("role", "status");
    ansage.setAttribute("aria-live", "polite");
    body.appendChild(ansage);
  }

  /* Leeren und im nächsten Takt neu schreiben: so wird auch derselbe Text
     (zweimal «Gespeichert.») wieder angesagt. Danach räumt sie sich, damit
     im Lesemodus kein alter Text stehen bleibt. */
  function ansagen(text) {
    if (!ansage) ansageEinrichten();
    if (!ansage) return;
    clearTimeout(ansageUhr);
    ansage.textContent = "";
    ansageUhr = setTimeout(function () {
      ansage.textContent = text;
      ansageUhr = setTimeout(function () { ansage.textContent = ""; }, MELDUNG_SICHTBAR_MS * 2);
    }, 50);
  }

  /* Bei offener Ebene leben die Meldungen IN ihr: sonst lägen sie hinter
     ihrem Schleier ausser Reichweite der Tab-Falle. Aber in der Wurzel der
     Ebene, nicht in ihrer Fläche: die Fläche tritt mit transform ein, und
     ein transformierter Vorfahr ist der Bezug für position: fixed – die
     Meldung stünde während des Eintritts mitten im Dialog bzw. rechts
     ausserhalb des Fensters und spränge danach an ihren Platz. */
  function regionWirt() {
    const oben = ebeneOben();
    return oben ? oben.element : body;
  }

  function regionLage() {
    const s = getComputedStyle(region);
    return { links: parseFloat(s.left) || 0, unten: parseFloat(s.bottom) || 0 };
  }

  function regionPlatzieren() {
    const wirt = regionWirt();
    const umzug = region.parentElement !== wirt;
    const gezeigt = region.isConnected && region.children.length > 0;
    const vorher = gezeigt ? regionLage() : null;
    if (umzug) {
      // Ein umgehängter Knoten spielt seine CSS-Animationen neu: bereits
      // gezeigte Meldungen werden darum vorher als gezeigt markiert.
      for (const m of Array.from(region.children)) {
        if (!m.classList.contains("austritt")) m.setAttribute("data-gezeigt", "");
      }
      wirt.appendChild(region);
    }
    regionAusrichten();
    if (vorher) gleitenVon(vorher);
    return umzug;
  }

  /* Lage eines Elements ohne seinen laufenden Eintritt: getBoundingClientRect
     enthält das transform der Animation (die Speicherleiste beginnt 8 px
     tiefer, das Blatt 24 px weiter rechts). Gemessen im selben Takt, in dem
     der Eintritt beginnt, käme die Meldung sonst ohne Lücke auf der Leiste
     bzw. 48 statt 24 px neben der Blattkante zu stehen. */
  function ruheLage(k) {
    const r = k.getBoundingClientRect();
    let dx = 0, dy = 0;
    try {
      const m = new DOMMatrixReadOnly(getComputedStyle(k).transform);
      dx = m.m41;
      dy = m.m42;
    } catch (e) { /* «none» oder ohne DOMMatrix: keine Verschiebung */ }
    return { left: r.left - dx, top: r.top - dy };
  }

  function leisteOben() {
    if (!leiste || !leiste.zustand.sichtbar || !leiste.element.isConnected) return null;
    return ruheLage(leiste.element).top;
  }

  /* Links an der Tafel (bzw. am offenen Blatt) ausrichten, unten über einer
     sichtbaren Speicherleiste (Fehler E1). Über das CSSOM, CSP-sicher. */
  function regionAusrichten() {
    if (!region) return;
    const oben = ebeneOben();
    const bezug = oben && oben.art === "blatt" ? oben.flaeche : tafel;
    const links = bezug ? Math.max(0, Math.round(ruheLage(bezug).left)) : 0;
    region.style.setProperty("--meldung-links", (links + MELDUNG_ABSTAND_PX) + "px");
    const leisteTop = oben ? null : leisteOben();
    if (leisteTop !== null) {
      region.style.setProperty("--meldung-unten",
        (Math.max(0, Math.round(window.innerHeight - leisteTop)) + LUECKE_PX) + "px");
    } else {
      region.style.removeProperty("--meldung-unten");
    }
  }

  /* Sichtbare Meldungen gleiten an ihren neuen Platz, statt in einem Bild
     dorthin zu springen: die Region beginnt, wo sie stand, und ihre
     Verschiebung läuft per Übergang weg (rahmen.css). */
  function gleitenVon(vorher) {
    const jetzt = regionLage();
    const dx = Math.round(vorher.links - jetzt.links);
    const dy = Math.round(jetzt.unten - vorher.unten);
    if (!dx && !dy) return;
    region.style.setProperty("transition", "none");
    region.style.setProperty("--meldung-verschub", dx + "px");
    region.style.setProperty("--meldung-verschub-y", dy + "px");
    void region.offsetWidth;
    region.style.removeProperty("transition");
    region.style.removeProperty("--meldung-verschub");
    region.style.removeProperty("--meldung-verschub-y");
  }

  function meldungenAusrichten() {
    if (!region || !region.isConnected) return;
    const vorher = region.children.length ? regionLage() : null;
    regionAusrichten();
    if (vorher) gleitenVon(vorher);
    if (offeneFehler.size) platzReservieren();
  }

  function meldungenUmziehen() {
    if (region && region.isConnected) regionPlatzieren();
    platzReservieren();
  }

  function platzFrei(k) {
    k.removeAttribute("data-meldung-platz");
    k.style.removeProperty("--meldung-reserve");
  }

  /* Solange ein Fehler offen ist, hält der Roller darunter (Tafel bzw. der
     Körper des Blatts) an seinem Ende Platz frei und rollt das Element,
     um das es geht, über die Meldung. */
  function platzReservieren(urheber) {
    for (const m of Array.from(offeneFehler.keys())) if (!m.isConnected) offeneFehler.delete(m);
    const oben = ebeneOben();
    const roller = oben && oben.art === "blatt" ? oben.koerper : tafel;
    for (const k of Array.from(document.querySelectorAll("[data-meldung-platz]"))) if (k !== roller) platzFrei(k);
    if (!roller) return;
    if (!offeneFehler.size || !region || !region.isConnected) { platzFrei(roller); return; }
    const regionTop = region.getBoundingClientRect().top;
    const leisteTop = oben ? null : leisteOben();
    const basis = leisteTop !== null ? leisteTop : window.innerHeight;
    roller.style.setProperty("--meldung-reserve", (Math.max(0, Math.round(basis - regionTop)) + LUECKE_PX) + "px");
    roller.setAttribute("data-meldung-platz", "");
    if (urheber && urheber.isConnected && roller.contains(urheber)
      && urheber.getBoundingClientRect().bottom > regionTop - LUECKE_PX) {
      urheber.scrollIntoView({ block: "nearest" });
    }
  }

  function ersatzFokus() {
    const oben = ebeneOben();
    if (oben) return fokussierbare(oben.falle)[0] || oben.falle;
    return tafel;
  }

  function fehlerSchliessen() {
    for (const schliessen of Array.from(offeneFehler.values())) schliessen();
  }

  function meldung(text, optionen) {
    let o = optionen;
    if (o === true) o = { ton: "fehler" };
    else if (typeof o === "string") o = { ton: o };
    o = o || {};
    const ton = o.ton === "fehler" || o.ton === "info" ? o.ton : "erfolg";
    const textWert = text === null || text === undefined ? "" : String(text);
    const wirt = regionSichern();

    // Dieselbe Meldung steht schon: nur ihre Zeit beginnt neu (dreimal
    // Ctrl+S ergibt keinen Stapel «Gespeichert.»).
    if (ton !== "fehler") {
      for (const m of Array.from(wirt.children)) {
        const d = meldungsDaten.get(m);
        if (d && !m.classList.contains("austritt") && d.ton === ton && d.text === textWert) {
          d.neuStarten();
          ansagen(textWert);
          return d.griff;
        }
      }
    }

    ansagen(textWert);
    const item = el("div", "meldung meldung-" + ton);
    item.appendChild(UI.sinnbild(ton === "erfolg" ? "checkKreis" : (ton === "fehler" ? "achtungKreis" : "info"), 20));
    item.appendChild(el("span", "meldung-text", textWert));

    // Wo der Fokus war: schliesst man eine fokussierte Meldung, kehrt er
    // dorthin zurück.
    const aktiv = aktivesElement();
    const vorige = aktiv && wirt.contains(aktiv) ? aktiv.closest(".meldung") : null;
    const urheber = vorige ? (herkunft.get(vorige) || null) : aktiv;
    herkunft.set(item, urheber);

    let uhr = 0;
    function schliessen() {
      if (!item.isConnected || item.classList.contains("austritt")) return;
      clearTimeout(uhr);
      offeneFehler.delete(item);
      if (item.contains(document.activeElement)) {
        const ziel = urheber && urheber.isConnected && !urheber.closest("[inert]") ? urheber : ersatzFokus();
        if (ziel) ziel.focus({ preventScroll: true });
      }
      Bewegung.austreten(item).then(function () { platzReservieren(); });
    }
    const griff = { schliessen: schliessen, element: item };

    if (o.aktion && o.aktion.text) {
      const aktion = knopf({ text: o.aktion.text, variante: "leise", klein: true, klasse: "meldung-aktion" });
      aktion.addEventListener("click", function (ev) {
        schliessen();
        if (typeof o.aktion.beiKlick === "function") o.aktion.beiKlick(ev);
      });
      item.appendChild(aktion);
    }

    if (ton === "fehler") {
      // Fehler liest man in Ruhe und schliesst sie selbst: keine Uhr. Ein
      // neuerer Fehler ersetzt den letzten, statt sich zu stapeln.
      const zu = knopf({ variante: "sinnbild", sinnbild: "schliessen", titel: "Meldung schliessen", klein: true, klasse: "meldung-schliessen" });
      zu.addEventListener("click", schliessen);
      item.appendChild(zu);
      const fokusUebernehmen = !!vorige && vorige.contains(document.activeElement);
      fehlerSchliessen();
      offeneFehler.set(item, schliessen);
      wirt.appendChild(item);
      eingetreten(item);
      if (fokusUebernehmen) zu.focus({ preventScroll: true });
      platzReservieren(urheber);
      zuvieleSchliessen(wirt);
      return griff;
    }

    // Die Uhr hält an, solange Zeiger oder Fokus auf der Meldung sind.
    const dauer = o.dauer || MELDUNG_SICHTBAR_MS;
    function starten() { clearTimeout(uhr); uhr = setTimeout(schliessen, dauer); }
    function anhalten() { clearTimeout(uhr); }
    item.addEventListener("pointerenter", anhalten);
    item.addEventListener("pointerleave", starten);
    item.addEventListener("focusin", anhalten);
    item.addEventListener("focusout", starten);
    meldungsDaten.set(item, { ton: ton, text: textWert, neuStarten: starten, griff: griff });
    starten();
    wirt.appendChild(item);
    eingetreten(item);
    zuvieleSchliessen(wirt);
    return griff;
  }

  /* Hat eine Meldung ihren Auftritt gespielt, bleibt sie beim Umzug in eine
     andere Ebene ruhig (rahmen.css: [data-gezeigt]). */
  function eingetreten(item) {
    Bewegung.abgeschlossen(item).then(function () { item.setAttribute("data-gezeigt", ""); });
  }

  function zuvieleSchliessen(wirt) {
    const lebend = Array.from(wirt.children).filter(function (m) { return !m.classList.contains("austritt"); });
    let zuviel = lebend.length - MELDUNG_HOECHSTENS;
    for (const m of lebend) {
      if (zuviel <= 0) break;
      const d = meldungsDaten.get(m);
      if (d) { d.griff.schliessen(); zuviel -= 1; }
    }
  }

  /* ==================================================================
     Tooltip
     ================================================================== */

  const TIPP_SELEKTOR = "[data-tipp], button[title], a.knopf[title], [role=\"switch\"][title], "
    + ".status[title], .chip[title], th button[title]";

  let tippEl = null;
  let tippZiel = null;
  let tippUhr = 0;
  let tippGnade = 0;
  let tippMarke = 0;

  function normal(t) {
    return String(t || "").replace(/[\s,]+/g, " ").trim().toLocaleLowerCase("de-CH");
  }

  /* Text, den das Element sichtbar zeigt (unsichtbare 1-px-Beschriftungen
     wie .nur-sr zählen nicht). */
  function sichtbarerText(element) {
    let t = "";
    for (const n of Array.from(element.childNodes)) {
      if (n.nodeType === 3) t += n.textContent;
      else if (n.nodeType === 1) {
        const r = n.getBoundingClientRect();
        if (r.width > 1 && r.height > 1) t += " " + sichtbarerText(n);
      }
    }
    return t;
  }

  /* Das Element zu einem Knoten; ein title wird beim ersten Kontakt zu
     data-tipp, damit der Browser-Tooltip nie daneben erscheint. */
  function tippBesitzer(knoten) {
    const e = knoten && knoten.closest ? knoten.closest(TIPP_SELEKTOR) : null;
    if (e && e.hasAttribute("title")) {
      e.setAttribute("data-tipp", e.getAttribute("title") || "");
      e.removeAttribute("title");
    }
    return e;
  }

  function beschreibungen(e) {
    return (e.getAttribute("aria-describedby") || "").split(" ").filter(Boolean);
  }

  function tippLoesen() {
    if (!tippZiel) return;
    const rest = beschreibungen(tippZiel).filter(function (i) { return i !== tippEl.id; });
    if (rest.length) tippZiel.setAttribute("aria-describedby", rest.join(" "));
    else tippZiel.removeAttribute("aria-describedby");
  }

  /* Mittig 8 px unter dem Element, im Fenster gehalten; darüber, wenn unten
     kein Platz ist. */
  function tippPlatzieren(e) {
    const r = e.getBoundingClientRect();
    const b = tippEl.offsetWidth;
    const h = tippEl.offsetHeight;
    const links = Math.min(Math.max(LUECKE_PX, r.left + r.width / 2 - b / 2), window.innerWidth - b - LUECKE_PX);
    const unten = r.bottom + LUECKE_PX;
    const oben = unten + h + LUECKE_PX <= window.innerHeight ? unten : Math.max(LUECKE_PX, r.top - LUECKE_PX - h);
    tippEl.style.left = Math.round(Math.max(LUECKE_PX, links)) + "px";
    tippEl.style.top = Math.round(oben) + "px";
  }

  /* Ist der Text des Elements abgeschnitten (Ellipse in einer Listenzelle,
     einzeiliger Name)? Dann sagt ein Tooltip mit demselben Text doch etwas:
     er zeigt den ganzen Wert. Geprüft werden das Element und seine
     Nachfahren, die selbst beschneiden. */
  function abgeschnitten(element) {
    const liste = [element].concat(Array.from(element.querySelectorAll("*")).slice(0, 24));
    return liste.some(function (n) {
      // Unsichtbare 1-px-Beschriftungen (.nur-sr) beschneiden absichtlich;
      // Sinnbilder (SVG) haben keinen Text.
      if (n instanceof SVGElement || n.clientWidth <= 1 || n.clientHeight <= 1) return false;
      const s = getComputedStyle(n);
      return (s.overflowX !== "visible" && n.scrollWidth > n.clientWidth + 1)
        || (s.overflowY !== "visible" && n.scrollHeight > n.clientHeight + 1);
    });
  }

  function tippZeigen(e) {
    clearTimeout(tippUhr);
    clearTimeout(tippGnade);
    const text = e.getAttribute("data-tipp") || "";
    if (!e.isConnected || !text || e.closest("[inert]")
      || (normal(sichtbarerText(e)) === normal(text) && !abgeschnitten(e))) {
      tippVerbergen();
      return;
    }
    if (tippZiel !== e) tippLoesen();
    tippZiel = e;
    tippEl.textContent = text;
    // Beschreibung nur, wenn der Tooltip mehr sagt als der Name des Elements.
    const name = normal(e.getAttribute("aria-label") || e.textContent || "");
    if (e.getAttribute("aria-hidden") !== "true" && name.indexOf(normal(text)) === -1
      && beschreibungen(e).indexOf(tippEl.id) === -1) {
      e.setAttribute("aria-describedby", beschreibungen(e).concat(tippEl.id).join(" "));
    }
    tippMarke += 1;
    tippEl.classList.remove("austritt");
    tippEl.hidden = false;
    tippPlatzieren(e);
  }

  function tippVerbergen() {
    if (!tippEl) return;
    clearTimeout(tippUhr);
    clearTimeout(tippGnade);
    tippLoesen();
    tippZiel = null;
    if (tippEl.hidden || tippEl.classList.contains("austritt")) return;
    const marke = tippMarke;
    Bewegung.austreten(tippEl, "", { dann: "behalten" }).then(function () {
      if (marke !== tippMarke) return;
      tippEl.hidden = true;
      tippEl.classList.remove("austritt");
    });
  }

  function tippBald() {
    clearTimeout(tippGnade);
    if (tippEl.hidden) { tippVerbergen(); return; }
    tippGnade = setTimeout(tippVerbergen, TIPP_GNADE_MS);
  }

  function tippEinrichten() {
    if (tippEl || !body) return;
    tippEl = el("div", "tipp");
    tippEl.id = "tipp";
    tippEl.setAttribute("role", "tooltip");
    tippEl.hidden = true;
    body.appendChild(tippEl);

    document.addEventListener("pointerover", function (ev) {
      if (ev.pointerType === "touch") return;   // Touch kennt kein Schweben
      const e = tippBesitzer(ev.target);
      if (!e) {
        // Wurde das Element unter dem Zeiger ersetzt (Neuzeichnen der Liste,
        // Seitenkopf-Aktionen), kam nie ein pointerout: der Tooltip stünde
        // mit dem alten Text neben einem anderen Element.
        if (tippZiel && !tippEl.contains(ev.target)
          && (!tippZiel.isConnected || !tippZiel.contains(ev.target))) tippBald();
        return;
      }
      if (e === tippZiel) { clearTimeout(tippGnade); return; }
      tippVerbergen();
      tippZiel = e;
      tippUhr = setTimeout(function () { tippZeigen(e); }, TIPP_VERZOEGERUNG_MS);
    });
    document.addEventListener("pointerout", function (ev) {
      const e = tippBesitzer(ev.target);
      if (!e || e !== tippZiel) return;
      const naechstes = ev.relatedTarget;
      if (naechstes && (e.contains(naechstes) || tippEl.contains(naechstes))) return;
      tippBald();
    });
    tippEl.addEventListener("pointerenter", function () { clearTimeout(tippGnade); });
    tippEl.addEventListener("pointerleave", function (ev) {
      if (ev.relatedTarget && tippZiel && tippZiel.contains(ev.relatedTarget)) return;
      if (tippZiel) tippBald();
    });
    /* Mit der Tastatur sofort. Auch für einen Besitzer, der selbst nicht
       fokussierbar ist (th mit Erklärung um den Sortierknopf), wenn das
       fokussierte Element sein einziges Bedienelement ist. */
    document.addEventListener("focusin", function (ev) {
      const e = tippBesitzer(ev.target);
      if (!e || !ev.target.matches || !ev.target.matches(":focus-visible")) return;
      if (e === ev.target || fokussierbare(e).length === 1) tippZeigen(e);
    });
    document.addEventListener("focusout", function (ev) {
      if (tippZiel && (ev.target === tippZiel || tippZiel.contains(ev.target))) tippVerbergen();
    });
    document.addEventListener("pointerdown", function () { if (tippZiel) tippVerbergen(); });
    // Ein Element, das sonst nichts tut (die Initiale), zeigt ihn auf Klick:
    // auf Touch der einzige Weg.
    document.addEventListener("click", function (ev) {
      const e = tippBesitzer(ev.target);
      if (e && e.getAttribute("role") === "img") tippZeigen(e);
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && tippZiel) tippVerbergen();
    });
    // scroll blubbert nicht: in der Fangphase verbirgt jeder Roller ihn.
    // Ausnahme: mit der Tastatur gezeigt. Dann kommt das Rollen meist vom
    // Fokus selbst (der Browser rollt das Element ins Bild, etwa eine Spalte
    // rechts in einer breiten Liste) – der Tooltip folgt, solange das
    // Element zu sehen ist, statt sofort wieder zu verschwinden.
    document.addEventListener("scroll", function () {
      if (!tippZiel) return;
      const fokus = document.activeElement;
      if (!tippEl.hidden && !tippEl.classList.contains("austritt") && fokus && tippZiel.contains(fokus)
        && fokus.matches(":focus-visible")) {
        const r = tippZiel.getBoundingClientRect();
        if (r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth) {
          tippPlatzieren(tippZiel);
          return;
        }
      }
      tippVerbergen();
    }, { capture: true, passive: true });
  }

  function tipp(element, text) {
    if (!element) return element;
    element.removeAttribute("title");
    if (text) element.setAttribute("data-tipp", String(text));
    else element.removeAttribute("data-tipp");
    if (tippZiel === element && tippEl && !tippEl.hidden) {
      if (text) tippEl.textContent = String(text);
      else tippVerbergen();
    }
    return element;
  }
  tipp.verbergen = tippVerbergen;

  /* ==================================================================
     Speicherleiste
     ================================================================== */

  let leiste = null;

  function leisteBauen() {
    const element = el("div", "speicherleiste");
    element.hidden = true;
    element.setAttribute("role", "region");
    element.setAttribute("aria-label", "Ungespeicherte Änderungen");
    const textTeil = el("div", "speicherleiste-text");
    const anzahl = el("span", "speicherleiste-anzahl");
    const meta = el("span", "speicherleiste-meta");
    textTeil.appendChild(anzahl);
    textTeil.appendChild(meta);
    const knoepfe = el("div", "speicherleiste-knoepfe");
    const verwerfen = knopf({ text: "Verwerfen", variante: "leise" });
    const speichern = knopf({ text: "Speichern", variante: "primaer" });
    knoepfe.appendChild(verwerfen);
    knoepfe.appendChild(speichern);
    element.appendChild(textTeil);
    element.appendChild(knoepfe);
    (tafel || body).appendChild(element);

    const z = { sichtbar: false, generation: 0, beschaeftigt: false, speichernText: "", speichernAus: false,
      beiSpeichern: null, beiVerwerfen: null, fokusZiel: null, reserve: 0, austritt: false, ausstehend: null };
    speichern.addEventListener("click", function (ev) {
      if (speichern.disabled || speichern.getAttribute("aria-disabled") === "true") return;
      if (typeof z.beiSpeichern === "function") z.beiSpeichern(ev);
    });
    verwerfen.addEventListener("click", function (ev) {
      if (verwerfen.disabled) return;
      if (typeof z.beiVerwerfen === "function") z.beiVerwerfen(ev);
    });
    if (typeof ResizeObserver === "function") {
      new ResizeObserver(function () {
        if (!z.sichtbar) return;
        masseSetzen();
        meldungenAusrichten();
      }).observe(element);
    }

    /* Platz am Tafelende (Spec 7.2 #1). Die Leiste klebt im Roller, trägt
       aber keine Höhe bei (rahmen.css: negativer Rand in ihrer eigenen
       Höhe, --leiste-hoehe): sie liegt im unteren Polster der Bahn, und
       Kommen und Gehen verschieben nichts. Solange sie steht, gilt an der
       Tafel --leiste-reserve = Höhe + Abstand unten + 8 px: als
       scroll-padding-bottom (Fokus und scrollIntoView halten Felder über
       ihr) und als Mindestpolster der Bahn (eine umbrechende, höhere Leiste
       verdeckt das Ende nicht). */
    function masseSetzen() {
      const h = element.offsetHeight;
      if (!h) return;
      element.style.setProperty("--leiste-hoehe", h + "px");
      const unten = parseFloat(getComputedStyle(element).bottom) || 0;
      z.reserve = Math.round(h + unten + LUECKE_PX);
      if (tafel && z.sichtbar) tafel.style.setProperty("--leiste-reserve", z.reserve + "px");
    }

    function reserveSetzen(an) {
      if (!tafel) return;
      if (an) {
        leisteRestFreigeben(true);
        tafel.style.setProperty("--leiste-reserve", z.reserve + "px");
        tafel.setAttribute("data-leiste", "");
        return;
      }
      // Geht die Leiste, bleibt ihr Platz als Polster stehen, bis die Tafel
      // weit genug vom Ende weg ist: stünde sie am Ende, rutschte sonst der
      // ganze Inhalt um diese Höhe nach unten.
      tafel.style.setProperty("--leiste-rest", z.reserve + "px");
      tafel.setAttribute("data-leiste-rest", "");
      tafel.removeAttribute("data-leiste");
      tafel.style.removeProperty("--leiste-reserve");
      leisteRestFreigeben(false);
    }

    /* Steht ein Element der Tafel (das fokussierte Feld) unter der Leiste,
       rollt die Tafel es darüber – beim Erscheinen der Leiste und bei jedem
       Fokuswechsel, solange sie steht (Fehler: Leiste verdeckt das Feld,
       WCAG 2.4.11). Ein hohes Feld rollt höchstens bis zu seinem Anfang. */
    function ueberLeisteHalten(k) {
      if (!z.sichtbar || !tafel || !k || k === tafel || !tafel.contains(k) || element.contains(k)) return;
      const t = tafel.getBoundingClientRect();
      const r = k.getBoundingClientRect();
      if (!r.height) return;
      const grenze = t.bottom - z.reserve;
      if (r.bottom <= grenze) return;
      const d = Math.min(r.bottom - grenze, Math.max(0, r.top - t.top - LUECKE_PX));
      if (d > 0) tafel.scrollTop += d;
    }

    if (tafel) {
      tafel.addEventListener("focusin", function (ev) {
        if (!z.sichtbar) return;
        const ziel = ev.target;
        // Nach dem eigenen Rollen des Browsers (Fokus ins Bild) nachsehen.
        requestAnimationFrame(function () { if (document.activeElement === ziel) ueberLeisteHalten(ziel); });
      });
    }

    /* Der Fokus darf weder mit der Leiste verschwinden noch auf einem Knopf
       stehen, der gleich gesperrt wird (er fiele auf body, der nächste Tab
       begänne beim Seitenanfang). Ziel: was die Seite nennt (fenster.js:
       das zuletzt bearbeitete Feld, sonst der Titel), sonst die Tafel. */
    function fokusRetten() {
      if (!element.contains(document.activeElement)) return;
      let ziel = typeof z.fokusZiel === "function" ? z.fokusZiel() : null;
      if (!ziel || !fokusbereit(ziel) || ziel.disabled || element.contains(ziel)) ziel = null;
      if (ziel) ziel.focus();
      else if (tafel) tafel.focus({ preventScroll: true });
    }

    function sperren(k, aus) {
      if (aus && !k.disabled && k === document.activeElement) fokusRetten();
      k.disabled = aus;
    }

    function zeigen(an) {
      if (an === z.sichtbar) return;
      z.sichtbar = an;
      const generation = ++z.generation;
      if (an) {
        z.austritt = false;
        element.hidden = false;
        masseSetzen();
        reserveSetzen(true);
        Bewegung.eintreten(element);   // Blende + 8 px Heben, 250 ms
        ueberLeisteHalten(document.activeElement);
      } else {
        fokusRetten();
        z.austritt = true;
        reserveSetzen(false);
        Bewegung.austreten(element, "sinken", { dann: "behalten" }).then(function () {
          if (generation !== z.generation) return;   // inzwischen wieder gezeigt
          element.hidden = true;
          element.classList.remove("austritt", "austritt--sinken");
          z.austritt = false;
          ausstehendeAnwenden();
        });
      }
      meldungenAusrichten();
    }

    /* Texte, Sperren und «beschäftigt» – alles ausser der Sichtbarkeit. */
    function anwenden(s) {
      if (s.text !== undefined) UI.textSetzen(anzahl, s.text);
      if (s.meta !== undefined) UI.textSetzen(meta, s.meta);
      if (s.verwerfenText !== undefined) UI.knopfText(verwerfen, s.verwerfenText);
      // Solange der Knopf beschäftigt ist, gehören Beschriftung und Sperre dem
      // Spinner; gewünscht wird trotzdem gemerkt und danach übernommen.
      const frei = function () { return !z.beschaeftigt && speichern.getAttribute("aria-busy") !== "true"; };
      if (s.speichernText !== undefined) {
        z.speichernText = s.speichernText;
        if (frei()) UI.knopfText(speichern, s.speichernText);
      }
      if (s.speichernAus !== undefined) {
        z.speichernAus = !!s.speichernAus;
        if (frei()) sperren(speichern, z.speichernAus);
      }
      if (s.beschaeftigt !== undefined && !!s.beschaeftigt !== z.beschaeftigt) {
        z.beschaeftigt = !!s.beschaeftigt;
        if (z.beschaeftigt) {
          speichern.disabled = false;
          UI.beschaeftigt(speichern, true, "Wird gespeichert …");
        } else {
          UI.beschaeftigt(speichern, false).then(function () {
            if (z.beschaeftigt) return;
            if (z.speichernText) UI.knopfText(speichern, z.speichernText);
            sperren(speichern, !!z.speichernAus);
          });
        }
      }
      if (s.verwerfenAus !== undefined) sperren(verwerfen, !!s.verwerfenAus);
    }

    function ausstehendeAnwenden() {
      if (!z.ausstehend) return;
      const a = z.ausstehend;
      z.ausstehend = null;
      anwenden(a);
    }

    /* Eine austretende Leiste friert ihren Inhalt ein: nach dem Speichern
       sänke sie sonst mit «0 Änderungen» weg, und ihr Knopf tauschte mitten
       im Austritt den Spinner gegen «Speichern». Was in dieser Zeit kommt,
       gilt nach dem Austritt (oder sofort, wenn sie wieder erscheint). */
    function setzen(w) {
      const s = Object.assign({}, w || {});
      const sichtbar = s.sichtbar;
      delete s.sichtbar;
      const geht = sichtbar === false && z.sichtbar;
      if (geht || (z.austritt && sichtbar !== true)) {
        z.ausstehend = Object.assign(z.ausstehend || {}, s);
        if (geht) zeigen(false);
        return;
      }
      ausstehendeAnwenden();
      anwenden(s);
      if (sichtbar !== undefined) zeigen(!!sichtbar);
    }

    return {
      element: element,
      zustand: z,
      api: {
        element: element,
        speichernKnopf: speichern,
        verwerfenKnopf: verwerfen,
        setzen: setzen,
        sichtbar: function () { return z.sichtbar; },
        speicherbar: function () {
          return z.sichtbar && !z.beschaeftigt && !speichern.disabled
            && speichern.getAttribute("aria-disabled") !== "true";
        }
      }
    };
  }

  /* Das Polster, das eine gegangene Leiste stehen liess, fällt weg, sobald
     es niemand mehr sieht (die Tafel steht weiter als sein Mass vom Ende
     weg) – oder sofort (sofort = true), wenn die Leiste wiederkommt. */
  function leisteRestFreigeben(sofort) {
    if (!tafel || !tafel.hasAttribute("data-leiste-rest")) return;
    const rest = parseFloat(tafel.style.getPropertyValue("--leiste-rest")) || 0;
    if (!sofort && tafel.scrollHeight - tafel.scrollTop - tafel.clientHeight < rest) return;
    tafel.removeAttribute("data-leiste-rest");
    tafel.style.removeProperty("--leiste-rest");
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
    // nichts Halbfertiges auf, nach 200 ms erscheinen Skelett und Ladebalken.
    if (bahn.getAttribute("data-zustand") === "laden") {
      bahn.removeAttribute("data-zustand");
      zustandJetzt = "inhalt";
      ladenZeigen({});
    }
  }
  if (body) {
    tippEinrichten();
    ansageEinrichten();
  }

  /* ---------- An UI anhängen ---------- */

  UI.dialog = dialog;
  UI.bestaetigen = bestaetigen;
  UI.blatt = blatt;
  UI.ebeneOffen = ebeneOffen;
  UI.meldung = meldung;
  UI.meldung.fehlerSchliessen = fehlerSchliessen;
  UI.meldungenFehlerSchliessen = fehlerSchliessen;
  UI.meldungenAusrichten = meldungenAusrichten;
  UI.tipp = tipp;
  UI.speicherleiste = speicherleiste;
  UI.seitenkopf = seitenkopf;
  UI.adresse = adresse;

  return {
    HAUPTZIELE: HAUPTZIELE,
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
    erstauftritt: erstauftritt,
    stillZeichnen: stillZeichnen,
    fest: fest,
    dokumentTitel: dokumentTitel,
    schublade: {
      oeffnen: function () { schubladeSetzen(true); },
      schliessen: function () { schubladeSetzen(false); },
      offen: function () { return schubladeOffen; }
    },
    elemente: function () {
      return { kopf: kopf, schublade: schublade, tafel: tafel, bahn: bahn, ladebalken: ladebalken };
    },
    bereit: bereit
  };
})();

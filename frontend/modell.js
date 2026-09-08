/* modell.js — gemeinsame Logik von Hauptseite, Clientfenster,
   Benutzerfenster, Telefonfenster und Softwarefenster.

   Enthält:
     1. Geschäftsjahr-Helfer (1. August bis 31. Juli, Schreibweise «2026/2027»)
     2. Programmspalten aus der Liste «Software»
     3. Berechtigungsstufen (0 / 1 / 2)
     4. Clientstatus (Aktiv / Lager / Archiviert)
     5. Verlauf (Note-Spalte mit JSON-Array in allen Listen)
     6. Anreicherung und Verknüpfung ADMIN-Clients ↔ Benutzer
     7. Telefonnummern: Normalisierung, Kurzwahl, Status, Verknüpfung mit Benutzern

   Setzt spalten.js und graph.js (Hilfe) voraus. Keine Abhängigkeit zu einer
   bestimmten Seite: alles sind reine Funktionen über den übergebenen Daten.

   Alle abgeleiteten Felder beginnen mit «__», damit sie sich nie mit einer
   SharePoint-Spalte beissen. */

"use strict";

const Modell = (function () {

  /* ==================================================================
     1. Geschäftsjahr
     ================================================================== */

  /**
   * Geschäftsjahr eines Datums. Monat ≥ August → «Jahr/Jahr+1»,
   * sonst «Jahr-1/Jahr».
   * @param {Date|string|null} wert
   * @returns {string} z. B. «2026/2027», oder "" bei ungültigem Datum.
   */
  function gjVonDatum(wert) {
    const d = wert instanceof Date ? wert : Hilfe.datum(wert);
    if (!d) return "";
    const j = d.getFullYear();
    return d.getMonth() + 1 >= 8 ? (j + "/" + (j + 1)) : ((j - 1) + "/" + j);
  }

  /**
   * Das laufende Geschäftsjahr.
   * @returns {string}
   */
  function gjAktuell() {
    return gjVonDatum(new Date());
  }

  /** Erstes Jahr eines GJ als Zahl, oder null wenn die Form nicht stimmt. */
  function gjZahl(gj) {
    const t = String(gj || "").trim();
    const m = /^(\d{4})\s*\/\s*(\d{4})$/.exec(t);
    return m ? Number(m[1]) : null;
  }

  /** Ist das ein gültiges Geschäftsjahr in der Form «2026/2027»? */
  function gjGueltig(gj) {
    const n = gjZahl(gj);
    if (n === null) return false;
    return gjZahl(gj) + 1 === Number(String(gj).split("/")[1].trim());
  }

  /**
   * Geschäftsjahr um n Jahre verschieben.
   * @param {string} gj  z. B. «2023/2024»
   * @param {number} n   z. B. 5
   * @returns {string}   «2028/2029», oder "" wenn gj nicht lesbar ist.
   */
  function gjPlus(gj, n) {
    const j = gjZahl(gj);
    if (j === null) return "";
    const neu = j + (Number(n) || 0);
    return neu + "/" + (neu + 1);
  }

  /**
   * Vergleich zweier Geschäftsjahre. Leere/ungültige Werte sortieren ans Ende.
   * @returns {number} <0 wenn a vor b liegt, 0 bei gleich, >0 sonst.
   */
  function gjVergleich(a, b) {
    const x = gjZahl(a), y = gjZahl(b);
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return x - y;
  }

  /**
   * Lückenlose Liste von Geschäftsjahren.
   * @param {string} von  z. B. «2019/2020»
   * @param {string} bis  z. B. «2031/2032» (einschliesslich)
   * @returns {string[]}  leer, wenn die Grenzen nicht lesbar sind.
   */
  function gjListe(von, bis) {
    const a = gjZahl(von), b = gjZahl(bis);
    if (a === null || b === null || b < a) return [];
    const liste = [];
    // Sicherheitsgrenze: ein Zeitstrahl über 60 Jahre wäre ein Datenfehler.
    for (let j = a; j <= b && liste.length < 60; j++) liste.push(j + "/" + (j + 1));
    return liste;
  }

  /**
   * Das kleinste gültige Geschäftsjahr einer Liste.
   * Ungültige und leere Einträge werden übergangen.
   * @param {Array<string>} liste
   * @returns {string} "" wenn kein Eintrag ein Geschäftsjahr ist.
   */
  function gjMin(liste) {
    let kleinstes = "";
    for (const gj of (liste || [])) {
      if (!gjGueltig(gj)) continue;
      if (!kleinstes || gjVergleich(gj, kleinstes) < 0) kleinstes = gj;
    }
    return kleinstes;
  }

  /**
   * Das grösste gültige Geschäftsjahr einer Liste.
   * @param {Array<string>} liste
   * @returns {string} "" wenn kein Eintrag ein Geschäftsjahr ist.
   */
  function gjMax(liste) {
    let groesstes = "";
    for (const gj of (liste || [])) {
      if (!gjGueltig(gj)) continue;
      if (!groesstes || gjVergleich(gj, groesstes) > 0) groesstes = gj;
    }
    return groesstes;
  }

  /**
   * Vorschlag für das Ersatzjahr: Beschaffungsjahr + 5.
   * @param {string} beschaffungsjahr
   * @returns {string} "" wenn kein Beschaffungsjahr hinterlegt ist.
   */
  function ersatzVorschlag(beschaffungsjahr) {
    return gjPlus(beschaffungsjahr, 5);
  }

  /** Auswahlliste für Datalists im Gerätefenster: 2015/2016 … 2035/2036. */
  function gjAuswahl() {
    return gjListe("2015/2016", "2035/2036");
  }


  /* ==================================================================
     2. Programme und Berechtigungsstufen
     ================================================================== */

  /**
   * Berechtigungsstufe eines Programmwerts.
   *   0 = deaktiviert (auch leer, null, «0»)
   *   1 = manuell aktiviert, im Frontend umschaltbar
   *   2 = aus AD-Gruppe, im Frontend gesperrt
   * @param {*} wert
   * @returns {0|1|2}
   */
  function stufe(wert) {
    if (wert === 2 || wert === "2") return 2;
    if (wert === 1 || wert === "1" || wert === true) return 1;
    return 0;
  }

  /* Die AD-Gruppen einer Software-Zeile: eine Gruppe je Zeile der
     Note-Spalte «AdGruppen», leere Zeilen und Doppelte fallen weg.
     Dieselbe Umrechnung steht in Inventar-Gemeinsam.ps1 (ConvertTo-Programm) —
     beide Seiten müssen dasselbe lesen. */
  function adGruppen(wert) {
    const gefunden = [];
    for (const z of Hilfe.zeilen(wert)) {
      if (gefunden.indexOf(z) === -1) gefunden.push(z);
    }
    return gefunden;
  }

  /**
   * Ein Programm aus einer Zeile der Liste «Software».
   * @param {Object} zeile  flache Zeile mit Title, Name, Kategorie, AdGruppen, Reihenfolge
   * @returns {{i:string,d:string,t:string,g:string,q:string,adGruppen:string[],
   *            reihenfolge:number,bemerkung:string,zeilenId:string}|null}
   *          null, wenn die Zeile keine Programm-Id trägt.
   */
  function programmSpalte(zeile) {
    const id = String((zeile && zeile.Title) || "").trim();
    if (!id) return null;
    const r = Number(zeile.Reihenfolge);
    return {
      i: id,
      d: String(zeile.Name || "").trim() || id,
      t: "Text",
      g: String(zeile.Kategorie || "").trim() || "Programme",
      q: "programm",
      adGruppen: adGruppen(zeile.AdGruppen),
      reihenfolge: isNaN(r) || zeile.Reihenfolge === null || zeile.Reihenfolge === ""
        ? Number.MAX_SAFE_INTEGER : r,
      bemerkung: String(zeile.Bemerkung || ""),
      zeilenId: String(zeile.id || "")
    };
  }

  /**
   * Spaltenobjekte für die Programme aus der Liste «Software» — dieselbe Form
   * wie die Einträge in spalten.js, plus «adGruppen», «reihenfolge» und die
   * Listen-Id der Software-Zeile (zum Öffnen des Softwarefensters).
   *
   * Sortiert nach «Reihenfolge», bei Gleichstand nach Name. Zeilen ohne
   * Programm-Id fallen weg: ohne Id gibt es keine Spalte in der Benutzer-Liste.
   *
   * @param {Array} softwareZeilen  Zeilen der Liste «Software»
   * @returns {Array}
   */
  function programmSpalten(softwareZeilen) {
    const liste = [];
    for (const z of (softwareZeilen || [])) {
      const p = programmSpalte(z);
      if (p) liste.push(p);
    }
    liste.sort(function (a, b) {
      if (a.reihenfolge !== b.reihenfolge) return a.reihenfolge - b.reihenfolge;
      return Hilfe.vergleiche(a.d, b.d);
    });
    return liste;
  }

  /**
   * Kategorien in der Reihenfolge, in der sie angezeigt werden: nach der
   * kleinsten «Reihenfolge» ihrer Programme. Ohne diese Ableitung hinge die
   * Anzeige an der Zufallsreihenfolge der Listenzeilen.
   * @param {Array} spalten  Ergebnis von programmSpalten()
   * @returns {string[]}
   */
  function programmKategorien(spalten) {
    const gesehen = [];
    for (const p of (spalten || [])) {
      if (gesehen.indexOf(p.g) === -1) gesehen.push(p.g);
    }
    return gesehen;
  }

  /**
   * Taugt der Text als Programm-Id, also als interner Spaltenname der
   * Benutzer-Liste? Buchstaben und Ziffern, Beginn mit einem Buchstaben,
   * höchstens 30 Zeichen. Dieselbe Regel prüft Test-ProgrammId in
   * Inventar-Gemeinsam.ps1.
   * @param {string} id
   * @returns {boolean}
   */
  function programmIdGueltig(id) {
    return /^[A-Za-z][A-Za-z0-9]{0,29}$/.test(String(id || "").trim());
  }

  /**
   * Tooltip-Text für einen gesperrten Schalter (Stufe 2).
   * @param {{adGruppen:string[]}} spalte
   */
  function sperrHinweis(spalte) {
    const g = (spalte && spalte.adGruppen) || [];
    if (!g.length) return "Berechtigung wird vom Abgleich verwaltet und kann hier nicht geändert werden.";
    return "Berechtigung aus AD-Gruppe «" + g.join("», «") + "» übernommen";
  }


  /* ==================================================================
     3. Gerätestatus
     ================================================================== */

  /* Die drei erlaubten Werte der Spalte «Status» der Client-Listen. Leer
     oder unbekannt gilt als «Aktiv» — so war die Liste vor der Einführung
     der Spalte, und so schreibt es auch der Sync. */
  const STATUS_WERTE = ["Aktiv", "Lager", "Archiviert"];

  /**
   * Statuswert auf einen der drei erlaubten Werte bringen.
   * @param {*} wert
   * @returns {"Aktiv"|"Lager"|"Archiviert"}
   */
  function status(wert) {
    const t = String(wert === null || wert === undefined ? "" : wert).trim().toLowerCase();
    for (const s of STATUS_WERTE) if (s.toLowerCase() === t) return s;
    return "Aktiv";
  }

  /** Ist das Gerät archiviert? */
  function istArchiviert(zeile) {
    return status(zeile && zeile.Status) === "Archiviert";
  }

  /* Textfarbe je Status (Klassen aus design.css). «Aktiv» bleibt bewusst
     ohne Farbe: der Normalfall braucht keine Auszeichnung. */
  const STATUS_TON = { Aktiv: "", Lager: "info", Archiviert: "still" };

  /** CSS-Klasse für einen Statuswert, oder "" für den Normalfall. */
  function statusKlasse(wert) {
    const ton = STATUS_TON[status(wert)];
    return ton ? "t-" + ton : "";
  }


  /* ==================================================================
     4. Verlauf

     Beide Listen haben eine Note-Spalte «Verlauf». Darin steht ein
     JSON-Array; jeder Eintrag sieht so aus:

       { "id": "<GUID>", "datum": "2026-09-03", "text": "Freitext",
         "quelle": "manuell" | "sync", "erstellt": "2026-09-03T14:05:00Z" }

     «datum» ist das Datum des Ereignisses (vom Menschen gewählt),
     «erstellt» der Zeitstempel der Erfassung. Der Sync hängt Einträge mit
     quelle = "sync" an, das Frontend schreibt "manuell".

     Grundsatz: kaputte Daten dürfen nie zum Absturz führen. Was sich nicht
     lesen lässt, wird stillschweigend zu einem leeren Verlauf.
     ================================================================== */

  const VERLAUF_QUELLEN = ["manuell", "sync"];

  /** Heute als «JJJJ-MM-TT» in Ortszeit (nicht UTC — sonst kippt es abends). */
  function heuteIso() {
    const d = new Date();
    return d.getFullYear() + "-"
      + String(d.getMonth() + 1).padStart(2, "0") + "-"
      + String(d.getDate()).padStart(2, "0");
  }

  /* Jetzt als «JJJJ-MM-TTThh:mm:ssZ» (UTC, ohne Millisekunden). Genau diese
     Form schreibt auch der Sync (ToIso in Inventar-Gemeinsam.ps1) — beide
     Seiten sollen denselben Zeitstempel erzeugen, nicht zwei Varianten. */
  function jetztIso() {
    return new Date().toISOString().replace(/\.\d+Z$/, "Z");
  }

  /** «2026-09-03» → «03.09.2026». Unlesbares bleibt unverändert. */
  function datumSchweiz(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "").trim());
    return m ? m[3] + "." + m[2] + "." + m[1] : String(iso || "");
  }

  /** Ist das ein Datum in der Form «JJJJ-MM-TT»? */
  function datumIsoGueltig(iso) {
    const t = String(iso || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
    const d = new Date(t + "T12:00:00Z");
    return !isNaN(d.getTime());
  }

  /* Eine eindeutige Kennung. crypto.randomUUID gibt es in allen aktuellen
     Browsern; der Rückfall ist für ältere und für unsichere Kontexte da. */
  function verlaufId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "x" + Date.now().toString(16) + "-"
      + Math.random().toString(16).slice(2, 10);
  }

  /**
   * Verlauf aus dem Rohwert der Spalte lesen.
   * @param {*} roh  Zeichenkette aus SharePoint (oder bereits ein Array)
   * @returns {Array<{id:string,datum:string,text:string,quelle:string,erstellt:string}>}
   *          absteigend sortiert; bei leerem oder kaputtem Wert leer.
   */
  function verlaufLesen(roh) {
    let daten = roh;
    if (typeof daten === "string") {
      const t = daten.trim();
      if (!t) return [];
      try { daten = JSON.parse(t); } catch (e) { return []; }
    }
    if (!Array.isArray(daten)) return [];

    const liste = [];
    for (const e of daten) {
      if (!e || typeof e !== "object") continue;
      const text = String(e.text === null || e.text === undefined ? "" : e.text);
      const datum = String(e.datum || "").trim();
      liste.push({
        id: String(e.id || "").trim() || verlaufId(),
        datum: datumIsoGueltig(datum) ? datum : "",
        text: text,
        quelle: VERLAUF_QUELLEN.indexOf(e.quelle) > -1 ? e.quelle : "manuell",
        erstellt: String(e.erstellt || "").trim()
      });
    }
    return verlaufSortieren(liste);
  }

  /* Jüngstes Ereignis zuoberst: nach «datum» absteigend, bei gleichem Datum
     nach «erstellt» absteigend. Einträge ohne Datum sortieren ans Ende. */
  function verlaufSortieren(liste) {
    return liste.slice().sort(function (a, b) {
      if (a.datum !== b.datum) {
        if (!a.datum) return 1;
        if (!b.datum) return -1;
        return a.datum < b.datum ? 1 : -1;
      }
      const ea = a.erstellt || "", eb = b.erstellt || "";
      if (ea === eb) return 0;
      return ea < eb ? 1 : -1;
    });
  }

  /**
   * Verlauf für die Spalte serialisieren. Kompaktes JSON ohne Einrückung;
   * ein leerer Verlauf wird zur leeren Zeichenkette, damit in SharePoint
   * kein «[]» stehen bleibt.
   * @param {Array} liste
   * @returns {string}
   */
  function verlaufSchreiben(liste) {
    const sauber = (liste || []).map(function (e) {
      return {
        id: String(e.id || "").trim() || verlaufId(),
        datum: String(e.datum || "").trim(),
        text: String(e.text === null || e.text === undefined ? "" : e.text),
        quelle: VERLAUF_QUELLEN.indexOf(e.quelle) > -1 ? e.quelle : "manuell",
        erstellt: String(e.erstellt || "").trim() || jetztIso()
      };
    });
    if (!sauber.length) return "";
    return JSON.stringify(verlaufSortieren(sauber));
  }

  /**
   * Ein neuer Eintrag aus dem Frontend.
   * @param {string} datum  «JJJJ-MM-TT», Standard heute
   * @param {string} text   Freitext, mehrzeilig erlaubt
   * @returns {Object}
   */
  function verlaufEintrag(datum, text) {
    const d = String(datum || "").trim();
    return {
      id: verlaufId(),
      datum: datumIsoGueltig(d) ? d : heuteIso(),
      text: String(text === null || text === undefined ? "" : text),
      quelle: "manuell",
      erstellt: jetztIso()
    };
  }

  /** Nur die Texte eines Verlaufs — für den Volltextindex. */
  function verlaufTexte(roh) {
    return verlaufLesen(roh).map(e => e.text).join("  ");
  }


  /* ==================================================================
     5. Anreicherung und Verknüpfung
     ================================================================== */

  /** Normalform für den Vergleich von PC-Namen und Logins. */
  function schluessel(wert) {
    return String(wert === null || wert === undefined ? "" : wert).trim().toLowerCase();
  }

  /* Volltextindex aus den angegebenen Spalten.

     Die Verlaufsspalte enthält JSON; würde es roh in den Index wandern,
     fände die Suche nach «manuell» oder «sync» jede einzelne Zeile.
     Deshalb gehen von dort nur die Freitexte hinein. */
  function suchtext(zeile, spalten) {
    const teile = [];
    for (const s of spalten) {
      const w = zeile[s.i];
      if (w === null || w === undefined || w === "" || w === false) continue;
      teile.push(s.i === "Verlauf" ? verlaufTexte(w) : String(w));
    }
    return teile.join("  ").toLowerCase();
  }

  /**
   * Weicht das SCCM-Primärgerät von der Inhaberschaft ab?
   *
   * Nur ein gesetztes Primärgerät kann abweichen: ohne Angabe aus SCCM gibt
   * es nichts zu vergleichen. Ist dagegen ein Primärgerät gemeldet und die
   * Person Inhaberin keines Geräts, ist das sehr wohl eine Abweichung.
   *
   * SCCM ist dabei nur Hinweisgeber: die Inhaberschaft wird ausschliesslich
   * von Hand gepflegt, kein Abgleich schreibt sie.
   *
   * @param {string} primaer   Wert von SCCMPrimaerGeraet
   * @param {string} computer  Wert von Computer (das Gerät der Person)
   * @returns {boolean}
   */
  function primaerWeichtAb(primaer, computer) {
    const p = String(primaer === null || primaer === undefined ? "" : primaer).trim();
    if (!p) return false;
    return schluessel(p) !== schluessel(computer);
  }

  /**
   * Status der Ersatzplanung eines Geräts.
   * @returns {"ok"|"bald"|"ueberfaellig"|"unbekannt"}
   */
  function ersatzStatus(ersatzGeplant, beschaffungsjahr) {
    const geplant = String(ersatzGeplant || "").trim();
    if (!geplant) {
      // Ohne Ersatzjahr entscheidet ein allfälliger Vorschlag aus dem
      // Beschaffungsjahr; fehlt auch das, ist der Status unbekannt.
      const vorschlag = ersatzVorschlag(beschaffungsjahr);
      if (!vorschlag) return "unbekannt";
      const v = gjVergleich(vorschlag, gjAktuell());
      return v < 0 ? "ueberfaellig" : (v === 0 ? "bald" : "ok");
    }
    const v = gjVergleich(geplant, gjAktuell());
    if (v < 0) return "ueberfaellig";
    if (v === 0) return "bald";
    return "ok";
  }

  /* In welche Client-Liste gehört ein Name? Es gibt genau eine Regel: alles,
     was mit «EDU» beginnt, gehört zu den EDU-Clients, alles Übrige zu den
     ADMIN-Clients. Dieselbe Regel steht in Inventar-Gemeinsam.ps1
     (Get-ClientListe) — der Sync teilt danach auf, das Frontend prüft damit
     nur, ob ein von Hand erfasster Name zur offenen Liste passt. */
  const EDU_PRAEFIX = "EDU";

  /**
   * Zuständige Client-Liste für einen Namen.
   * @param {string} name
   * @returns {"admin"|"edu"}
   */
  function clientListe(name) {
    const n = String(name === null || name === undefined ? "" : name).trim();
    return n.toUpperCase().indexOf(EDU_PRAEFIX) === 0 ? "edu" : "admin";
  }

  /* Die abgeleiteten Felder, die ein Client ganz für sich hat — ohne einen
     Blick in die Benutzer-Liste. Sie gelten für beide Client-Listen gleich;
     die Inhaberschaft kommt nur bei den ADMIN-Clients dazu. */
  function clientGrundfelder(clients) {
    const liste = clients || [];

    /* PC-Namen sind kein Schlüssel: es darf mehrere Clients mit demselben
       Namen geben (ein ersetztes Gerät, das archiviert liegen bleibt).
       Deshalb steht unter jedem Namen eine LISTE. */
    const nachName = new Map();
    for (const c of liste) {
      c.__status = status(c.Status);
      c.__archiviert = c.__status === "Archiviert";
      const k = schluessel(c.Title);
      if (!nachName.has(k)) nachName.set(k, []);
      nachName.get(k).push(c);
    }
    for (const c of liste) {
      c.__namensDublette = (nachName.get(schluessel(c.Title)) || []).length > 1;
      c.__inSccm = Hilfe.istJa(c.SCCM_Found);
      c.__online = Hilfe.istJa(c.SCCM_Online);
      c.__ersatzJahr = String(c.ErsatzGeplant || "").trim()
        || ersatzVorschlag(c.Beschaffungsjahr);
      c.__ersatzStatus = ersatzStatus(c.ErsatzGeplant, c.Beschaffungsjahr);
    }
    return nachName;
  }

  /**
   * Abgeleitete Felder für eine Client-Liste ohne Inhaberschaft — die
   * EDU-Clients. Sie sind Schulungsgeräte und gehören niemandem persönlich;
   * die Spalte «Computer» der Benutzer-Liste zeigt bewusst nie auf sie.
   *
   * Die Inhaber-Felder werden trotzdem gesetzt (leer), damit Tabelle,
   * Fenster und CSV-Ausgabe für beide Listen derselbe Code sein können.
   *
   * @param {Array} clients  Zeilen der Liste «EDU-Clients»
   * @returns {{clients:Array}}
   */
  function clientsAnreichern(clients) {
    const liste = clients || [];
    clientGrundfelder(liste);
    for (const c of liste) {
      c.__inhaberAlle = [];
      c.__inhaber = null;
      c.__inhaberName = "";
      c.__mehrfachInhaber = false;
      c.__such = suchtext(c, SPALTEN_CLIENT);
    }
    return { clients: liste };
  }

  /**
   * Verknüpft ADMIN-Clients und Benutzer und hängt abgeleitete Felder an.
   * Verändert die übergebenen Objekte in place und gibt sie zurück.
   *
   * Clients bekommen:
   *   __inhaber       Benutzerzeile des Inhabers, sonst null
   *   __inhaberName   Anzeigename des Inhabers, sonst "" (Tabellenspalte
   *                   «Inhaber»)
   *   __inhaberAlle   alle Benutzerzeilen, deren Feld «Computer» auf diesen
   *                   Client zeigt — im Normalfall keine oder genau eine
   *   __mehrfachInhaber true, wenn mehr als eine Person darauf zeigt; das
   *                   ist ein zu bereinigender Datenfehler, kein Zustand
   *   __status        "Aktiv" | "Lager" | "Archiviert" (leer gilt als Aktiv)
   *   __archiviert    true/false
   *   __namensDublette true, wenn ein weiterer Client genauso heisst
   *   __ersatzStatus  "ok" | "bald" | "ueberfaellig" | "unbekannt"
   *   __ersatzJahr    ErsatzGeplant, oder der Vorschlag falls leer
   *   __inSccm        true/false
   *   __online        true/false
   *   __such          Volltextindex (klein geschrieben)
   *
   * Benutzer bekommen:
   *   __client        Clientzeile oder null (bevorzugt ein nicht
   *                   archiviertes Gerät, wenn mehrere gleich heissen);
   *                   der ADMIN-Client, dessen Inhaber die Person ist
   *   __clientAlle    alle Clientzeilen mit diesem Namen
   *   __clientMehrdeutig true, wenn es mehr als eine ist
   *   __hatGeraet     true/false
   *   __adAktiv       true/false
   *   __primaerAbweichung  true, wenn SCCMPrimaerGeraet ≠ Computer (beide gesetzt)
   *   __name          Anzeigename, ersatzweise der Login
   *   __such          Volltextindex
   *
   * @param {Array} clients    Zeilen der Liste «ADMIN-Clients»
   * @param {Array} benutzer   Zeilen der Benutzer-Liste
   * @param {Array} software   Zeilen der Liste «Software» (optional)
   * @returns {{clients:Array, benutzer:Array, programmSpalten:Array}}
   */
  function anreichern(clients, benutzer, software) {
    const geraete = clients || [];
    const leute = benutzer || [];
    const pSpalten = programmSpalten(software);

    for (const c of geraete) c.__inhaberAlle = [];
    const nachName = clientGrundfelder(geraete);

    for (const b of leute) {
      const pcName = String(b.Computer || "").trim();
      const treffer = pcName ? (nachName.get(schluessel(pcName)) || []) : [];
      /* Bei mehreren gleichnamigen Geräten gewinnt das nicht archivierte:
         die Zuordnung meint fast immer das Gerät, das im Einsatz steht. */
      const c = treffer.filter(z => !z.__archiviert)[0] || treffer[0] || null;
      b.__client = c;
      b.__clientAlle = treffer.slice();
      b.__clientMehrdeutig = treffer.length > 1;
      b.__hatGeraet = !!pcName;
      b.__name = String(b.Anzeigename || "").trim() || String(b.Title || "").trim();
      b.__adAktiv = Hilfe.istJa(b.ADAktiviert);
      b.__primaerAbweichung = primaerWeichtAb(b.SCCMPrimaerGeraet, pcName);
      b.__such = suchtext(b, SPALTEN_BENUTZER);
      if (c) c.__inhaberAlle.push(b);
    }

    for (const c of geraete) {
      /* Ein Client hat genau einen Inhaber. Zeigen mehrere Personen darauf,
         ist das ein Altlast- oder Tippfehler: der erste Name gilt als
         Inhaber, die übrigen meldet das Clientfenster zur Bereinigung. */
      c.__inhaberAlle.sort((a, b) => Hilfe.vergleiche(a.__name, b.__name));
      c.__inhaber = c.__inhaberAlle[0] || null;
      c.__inhaberName = c.__inhaber ? c.__inhaber.__name : "";
      c.__mehrfachInhaber = c.__inhaberAlle.length > 1;
      /* Der Volltext kennt alle Namen, auch die überzähligen — sonst wäre
         eine falsche Zuordnung nicht auffindbar. */
      c.__such = (suchtext(c, SPALTEN_CLIENT) + "  "
        + c.__inhaberAlle.map(b => b.__name).join(", ")).toLowerCase();
    }

    return { clients: geraete, benutzer: leute, programmSpalten: pSpalten };
  }


  /* ==================================================================
     6. Telefonnummern

     Die Liste «Telefonnummern» kennt Kurzwahlen (373) und vollständige
     Nummern (+41 41 926 23 73). Verglichen wird immer über die Ziffernfolge
     mit Landesvorwahl: 41419262373. Dieselben Regeln stehen in
     Inventar-Gemeinsam.ps1 (Get-TelefonZiffern, Format-Telefon,
     Get-TelefonKurzwahl) — beide Seiten müssen dasselbe rechnen.
     ================================================================== */

  /* Nummernblock des Hauses ohne Kurzwahl. Aus konfig.js, sonst Standard. */
  function telefonPraefix() {
    const p = (typeof KONFIG !== "undefined" && KONFIG.telefonPraefix) || "+41 41 926 2";
    return String(p);
  }

  /**
   * Nummer → Ziffernfolge mit Landesvorwahl («41…»). Eine reine Kurzwahl
   * (ein bis vier Ziffern) wird mit dem Präfix ergänzt. Leer → "".
   * @param {*} nummer
   * @returns {string}
   */
  function telefonZiffern(nummer) {
    const z = String(nummer === null || nummer === undefined ? "" : nummer).replace(/\D/g, "");
    if (!z) return "";
    if (z.length <= 4) return telefonPraefix().replace(/\D/g, "") + z;
    if (z.indexOf("0041") === 0) return z.slice(2);
    if (z.indexOf("00") === 0) return z.slice(2);
    if (z.charAt(0) === "0") return "41" + z.slice(1);
    return z;
  }

  /**
   * Beliebige Schreibweise → «+41 41 926 23 73». Nur Schweizer Nummern
   * (41 + 9 Ziffern) werden gruppiert, alles andere bekommt nur das «+».
   * @param {*} nummer
   * @returns {string}
   */
  function telefonFormat(nummer) {
    const z = telefonZiffern(nummer);
    if (!z) return "";
    if (z.length === 11 && z.indexOf("41") === 0) {
      return "+41 " + z.slice(2, 4) + " " + z.slice(4, 7) + " " + z.slice(7, 9) + " " + z.slice(9, 11);
    }
    return "+" + z;
  }

  /**
   * Kurzwahl einer Nummer im Hausblock: «+41 41 926 23 73» → «373».
   * Liegt die Nummer ausserhalb des Blocks, kommt "" zurück.
   * @param {*} nummer
   * @returns {string}
   */
  function telefonKurzwahl(nummer) {
    const z = telefonZiffern(nummer);
    const p = telefonPraefix().replace(/\D/g, "");
    if (!z || !p || z.indexOf(p) !== 0) return "";
    const rest = z.slice(p.length);
    return rest.length >= 1 && rest.length <= 4 ? rest : "";
  }

  /** Vollständige Nummer zu einer Kurzwahl: «373» → «+41 41 926 23 73». */
  function telefonVoll(kurzwahl) {
    const k = String(kurzwahl || "").replace(/\D/g, "");
    if (!k || k.length > 4) return "";
    return telefonFormat(k);
  }

  /* Die drei erlaubten Werte der Spalte «Status» der Telefonliste. Leer
     gilt als «Aktiv». «Frei» heisst: sofort vergebbar. */
  const TELEFON_STATUS_WERTE = ["Aktiv", "Inaktiv", "Frei"];
  const TELEFON_TYPEN = ["Person", "Dienst", "Raum", "Notruf"];

  /** Statuswert auf einen der drei erlaubten Werte bringen. */
  function telefonStatus(wert) {
    const t = String(wert === null || wert === undefined ? "" : wert).trim().toLowerCase();
    for (const s of TELEFON_STATUS_WERTE) if (s.toLowerCase() === t) return s;
    return "Aktiv";
  }

  const TELEFON_STATUS_TON = { Aktiv: "", Inaktiv: "still", Frei: "warnung" };

  /** CSS-Klasse für einen Telefonstatus, oder "" für den Normalfall. */
  function telefonStatusKlasse(wert) {
    const ton = TELEFON_STATUS_TON[telefonStatus(wert)];
    return ton ? "t-" + ton : "";
  }

  /**
   * Verknüpft Telefonnummern mit Benutzern und hängt abgeleitete Felder an.
   * Verändert die übergebenen Objekte in place und gibt sie zurück.
   *
   * Die Verknüpfung läuft zweifach: bevorzugt LIVE über die Spalte «Telefon»
   * der Benutzer-Liste (AD-Attribut telephoneNumber, vom Sync gepflegt), sonst
   * über die Spalte «Benutzer» der Telefonliste (Login, vom Sync geschrieben).
   * So stimmt die Anzeige auch, bevor die Telefon-Phase des Syncs gelaufen ist.
   *
   * Telefonnummern bekommen:
   *   __ziffern        Ziffernfolge zum Vergleichen
   *   __kurzwahl       Kurzwahl (Title, ersatzweise aus der Nummer)
   *   __nummer         formatierte Nummer (Telefonnummer, ersatzweise aus der Kurzwahl)
   *   __status         "Aktiv" | "Inaktiv" | "Frei"
   *   __benutzerZeile  Benutzerzeile oder null
   *   __benutzerName   Anzeigename der Person, sonst ""
   *   __benutzerQuelle "telefon" (AD-Feld der Person) | "login" (Spalte Benutzer) | ""
   *   __abteilung      Abteilung der Person, sonst ""
   *   __zugewiesen     true, wenn eine Person, ein Name oder ein Dienst dran hängt
   *                    und der Status nicht «Frei» ist
   *   __such           Volltextindex
   *
   * Benutzer bekommen:
   *   __telefone       Array der Telefonzeilen dieser Person
   *   __hatTelefon     true/false
   *
   * @param {Array} telefone  Zeilen der Liste «Telefonnummern»
   * @param {Array} benutzer  Zeilen der Benutzer-Liste (angereichert oder roh)
   * @returns {{telefone:Array, benutzer:Array}}
   */
  function telefoneAnreichern(telefone, benutzer) {
    const nummern = telefone || [];
    const leute = benutzer || [];

    const nachZiffern = new Map();
    const nachLogin = new Map();
    for (const b of leute) {
      b.__telefone = [];
      b.__hatTelefon = false;
      const z = telefonZiffern(b.Telefon);
      if (z && !nachZiffern.has(z)) nachZiffern.set(z, b);
      const l = schluessel(b.Title);
      if (l && !nachLogin.has(l)) nachLogin.set(l, b);
    }

    for (const t of nummern) {
      const kurz = String(t.Title || "").trim();
      const voll = String(t.Telefonnummer || "").trim();
      t.__ziffern = telefonZiffern(voll) || telefonZiffern(kurz);
      t.__kurzwahl = kurz || telefonKurzwahl(voll);
      t.__nummer = voll || telefonVoll(kurz);
      t.__status = telefonStatus(t.Status);

      let b = t.__ziffern ? (nachZiffern.get(t.__ziffern) || null) : null;
      let quelle = b ? "telefon" : "";
      if (!b) {
        const l = schluessel(t.Benutzer);
        if (l && nachLogin.has(l)) { b = nachLogin.get(l); quelle = "login"; }
      }
      t.__benutzerZeile = b;
      t.__benutzerQuelle = quelle;
      t.__benutzerName = b ? (String(b.Anzeigename || "").trim() || String(b.Title || "").trim()) : "";
      t.__abteilung = b ? String(b.Abteilung || "").trim() : "";
      t.__zugewiesen = t.__status !== "Frei"
        && !!(b || String(t.Name || "").trim() || String(t.Benutzer || "").trim());
      if (b) { b.__telefone.push(t); b.__hatTelefon = true; }

      t.__such = (suchtext(t, SPALTEN_TELEFON) + "  " + t.__benutzerName + "  "
        + t.__abteilung + "  " + t.__ziffern + "  " + t.__nummer).toLowerCase();
    }

    return { telefone: nummern, benutzer: leute };
  }

  return {
    // Geschäftsjahr
    gjVonDatum: gjVonDatum,
    gjAktuell: gjAktuell,
    gjPlus: gjPlus,
    gjVergleich: gjVergleich,
    gjListe: gjListe,
    gjZahl: gjZahl,
    gjGueltig: gjGueltig,
    gjMin: gjMin,
    gjMax: gjMax,
    gjAuswahl: gjAuswahl,
    ersatzVorschlag: ersatzVorschlag,
    ersatzStatus: ersatzStatus,
    primaerWeichtAb: primaerWeichtAb,
    // Programme (Liste «Software»)
    stufe: stufe,
    programmSpalte: programmSpalte,
    programmSpalten: programmSpalten,
    programmKategorien: programmKategorien,
    programmIdGueltig: programmIdGueltig,
    adGruppen: adGruppen,
    sperrHinweis: sperrHinweis,
    // Status
    STATUS_WERTE: STATUS_WERTE,
    status: status,
    istArchiviert: istArchiviert,
    statusKlasse: statusKlasse,
    // Verlauf
    verlaufLesen: verlaufLesen,
    verlaufSchreiben: verlaufSchreiben,
    verlaufEintrag: verlaufEintrag,
    verlaufSortieren: verlaufSortieren,
    verlaufTexte: verlaufTexte,
    verlaufId: verlaufId,
    heuteIso: heuteIso,
    jetztIso: jetztIso,
    datumSchweiz: datumSchweiz,
    datumIsoGueltig: datumIsoGueltig,
    // Verknüpfung
    anreichern: anreichern,
    clientsAnreichern: clientsAnreichern,
    clientListe: clientListe,
    EDU_PRAEFIX: EDU_PRAEFIX,
    schluessel: schluessel,
    // Telefonnummern
    telefonPraefix: telefonPraefix,
    telefonZiffern: telefonZiffern,
    telefonFormat: telefonFormat,
    telefonKurzwahl: telefonKurzwahl,
    telefonVoll: telefonVoll,
    TELEFON_STATUS_WERTE: TELEFON_STATUS_WERTE,
    TELEFON_TYPEN: TELEFON_TYPEN,
    telefonStatus: telefonStatus,
    telefonStatusKlasse: telefonStatusKlasse,
    telefoneAnreichern: telefoneAnreichern
  };
})();

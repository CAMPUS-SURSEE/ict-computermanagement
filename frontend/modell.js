/* modell.js — gemeinsame Logik von Hauptseite, Gerätefenster und
   Benutzerfenster.

   Enthält:
     1. Geschäftsjahr-Helfer (1. August bis 31. Juli, Schreibweise «2026/2027»)
     2. Programmspalten aus programme.json
     3. Berechtigungsstufen (0 / 1 / 2)
     4. Anreicherung und Verknüpfung Computer ↔ Benutzer

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

  /**
   * Spaltenobjekte für die Programme aus programme.json — dieselbe Form wie
   * die Einträge in spalten.js, plus das Feld «adGruppen».
   * @param {{programme:Array}} programme  Inhalt von programme.json
   * @returns {Array<{i:string,d:string,t:string,g:string,q:string,adGruppen:string[]}>}
   */
  function programmSpalten(programme) {
    const liste = (programme && programme.programme) || [];
    return liste.map(function (p) {
      return {
        i: p.id,
        d: p.name || p.id,
        t: "Text",
        g: p.kategorie || "Programme",
        q: "programm",
        adGruppen: Array.isArray(p.adGruppen) ? p.adGruppen.slice() : [],
        vorschlaege: Array.isArray(p.vorschlaege) ? p.vorschlaege.slice() : []
      };
    });
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
     3. Anreicherung und Verknüpfung
     ================================================================== */

  /** Normalform für den Vergleich von PC-Namen und Logins. */
  function schluessel(wert) {
    return String(wert === null || wert === undefined ? "" : wert).trim().toLowerCase();
  }

  /** Volltextindex aus den angegebenen Spalten. */
  function suchtext(zeile, spalten) {
    const teile = [];
    for (const s of spalten) {
      const w = zeile[s.i];
      if (w === null || w === undefined || w === "" || w === false) continue;
      teile.push(String(w));
    }
    return teile.join("  ").toLowerCase();
  }

  /**
   * Weicht das SCCM-Primärgerät von der Zuordnung ab?
   *
   * Nur ein gesetztes Primärgerät kann abweichen: ohne Angabe aus SCCM gibt
   * es nichts zu vergleichen. Ist dagegen ein Primärgerät gemeldet und kein
   * Gerät zugeordnet, ist das sehr wohl eine Abweichung — dann fehlt die
   * Zuordnung.
   *
   * @param {string} primaer   Wert von SCCMPrimaerGeraet
   * @param {string} computer  Wert von Computer (die Zuordnung)
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

  /**
   * Verknüpft Computer und Benutzer und hängt abgeleitete Felder an.
   * Verändert die übergebenen Objekte in place und gibt sie zurück.
   *
   * Computer bekommen:
   *   __benutzer      Array der zugeordneten Benutzerzeilen
   *   __benutzerNamen Anzeigenamen, Komma-getrennt (Tabellenspalte «Benutzer»)
   *   __ersatzStatus  "ok" | "bald" | "ueberfaellig" | "unbekannt"
   *   __ersatzJahr    ErsatzGeplant, oder der Vorschlag falls leer
   *   __inSccm        true/false
   *   __online        true/false
   *   __such          Volltextindex (klein geschrieben)
   *
   * Benutzer bekommen:
   *   __computer      Computerzeile oder null
   *   __hatGeraet     true/false
   *   __adAktiv       true/false
   *   __primaerAbweichung  true, wenn SCCMPrimaerGeraet ≠ Computer (beide gesetzt)
   *   __name          Anzeigename, ersatzweise der Login
   *   __such          Volltextindex
   *
   * @param {Array} computer   Zeilen der Computer-Liste
   * @param {Array} benutzer   Zeilen der Benutzer-Liste
   * @param {Object} programme Inhalt von programme.json (optional)
   * @returns {{computer:Array, benutzer:Array, programmSpalten:Array}}
   */
  function anreichern(computer, benutzer, programme) {
    const geraete = computer || [];
    const leute = benutzer || [];
    const pSpalten = programmSpalten(programme);

    const nachName = new Map();
    for (const c of geraete) {
      c.__benutzer = [];
      nachName.set(schluessel(c.Title), c);
    }

    for (const b of leute) {
      const pcName = String(b.Computer || "").trim();
      const c = pcName ? (nachName.get(schluessel(pcName)) || null) : null;
      b.__computer = c;
      b.__hatGeraet = !!pcName;
      b.__name = String(b.Anzeigename || "").trim() || String(b.Title || "").trim();
      b.__adAktiv = Hilfe.istJa(b.ADAktiviert);
      b.__primaerAbweichung = primaerWeichtAb(b.SCCMPrimaerGeraet, pcName);
      b.__such = suchtext(b, SPALTEN_BENUTZER);
      if (c) c.__benutzer.push(b);
    }

    for (const c of geraete) {
      c.__benutzer.sort((a, b) => Hilfe.vergleiche(a.__name, b.__name));
      c.__benutzerNamen = c.__benutzer.map(b => b.__name).join(", ");
      c.__inSccm = Hilfe.istJa(c.SCCM_Found);
      c.__online = Hilfe.istJa(c.SCCM_Online);
      c.__ersatzJahr = String(c.ErsatzGeplant || "").trim()
        || ersatzVorschlag(c.Beschaffungsjahr);
      c.__ersatzStatus = ersatzStatus(c.ErsatzGeplant, c.Beschaffungsjahr);
      c.__such = (suchtext(c, SPALTEN_COMPUTER) + "  " + c.__benutzerNamen).toLowerCase();
    }

    return { computer: geraete, benutzer: leute, programmSpalten: pSpalten };
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
    // Programme
    stufe: stufe,
    programmSpalten: programmSpalten,
    sperrHinweis: sperrHinweis,
    // Verknüpfung
    anreichern: anreichern,
    schluessel: schluessel
  };
})();

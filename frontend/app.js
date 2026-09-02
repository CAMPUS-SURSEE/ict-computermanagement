/* app.js — Oberfläche der Hauptseite des Computer Inventars.

   Vier Ansichten:
     Übersicht   Kennzahlen zu Geräten und Benutzern, Ersatzplanung als
                 Zeitstrahl, Verteilungen.
     Geräte      Tabelle der Computer-Liste, mit Suche, Facetten, Spaltenwahl.
     Benutzer    Tabelle der Benutzer-Liste, mit Programm-Filter je Stufe.
     Software    Eine Karte je Programm aus programme.json.

   Aufbau der Datei:
     1. Spaltenwissen und Filterdefinitionen
     2. Zustand und Adresszeile (Hash)
     3. DOM-Helfer
     4. Laden und Anreichern
     5. Filtern, Sortieren, Tabellen zeichnen
     6. Übersicht, Software
     7. Detailfenster und Rundfunkkanal
     8. Start

   Grundsätze: kein Framework, keine globalen Variablen ausser den Modulen
   aus den anderen Dateien, kein Inline-Script, und niemals innerHTML mit
   Daten aus SharePoint. Texte gehen ausschliesslich über textContent in
   die Seite. */

"use strict";

(function () {

/* ==================================================================
   1. Spaltenwissen und Filterdefinitionen
   ================================================================== */

/* Abgeleitete Spalten der Geräte-Tabelle. Sie stehen nicht in SharePoint;
   modell.js rechnet sie beim Anreichern aus. */
const GERAETE_ZUSATZ = [
  { i: "__benutzerNamen", d: "Benutzer", t: "Text", g: "Abgeleitet", q: "abgeleitet" },
  { i: "__ersatzText",    d: "Ersatzstatus", t: "Text", g: "Abgeleitet", q: "abgeleitet" },
  { i: "__hatBenutzer",   d: "Benutzer zugeordnet", t: "Text", g: "Abgeleitet", q: "abgeleitet" }
];

const BENUTZER_ZUSATZ = [
  { i: "__hatGeraetText", d: "Gerät zugeordnet", t: "Text", g: "Abgeleitet", q: "abgeleitet" }
];

const ERSATZ_TEXT = {
  ok: "im Plan", bald: "dieses Geschäftsjahr",
  ueberfaellig: "überfällig", unbekannt: "unbekannt"
};
const ERSATZ_TON = {
  ok: "erfolg", bald: "warnung", ueberfaellig: "gefahr", unbekannt: "leise"
};

const ZEITRAEUME = [
  { w: "7",    d: "in den letzten 7 Tagen" },
  { w: "30",   d: "in den letzten 30 Tagen" },
  { w: "90",   d: "in den letzten 90 Tagen" },
  { w: "ae30", d: "älter als 30 Tage" },
  { w: "ae90", d: "älter als 90 Tage" },
  { w: "leer", d: "kein Wert" }
];

const SPEICHERSTUFEN = [
  { w: "u20",  d: "unter 20 GB" },
  { w: "u50",  d: "unter 50 GB" },
  { w: "ab50", d: "50 GB und mehr" },
  { w: "leer", d: "kein Wert" }
];

const PROGRAMM_STUFEN = [
  { w: "",  d: "beliebig aktiv (1 oder 2)" },
  { w: "1", d: "nur manuell (1)" },
  { w: "2", d: "nur aus AD-Gruppe (2)" }
];

/* Beschreibung der beiden Tabellenansichten. Alles, was sich zwischen
   Geräten und Benutzern unterscheidet, steht hier — der Rest des Codes ist
   für beide derselbe. */
const TAB = {
  geraete: {
    schluessel: "geraete",
    namensSpalte: "Title",
    standard: ["Title", "__benutzerNamen", "GebaeudeStock", "Beschaffungsjahr",
               "ErsatzGeplant", "SCCM_Model", "SCCM_OSVersion", "SCCM_LastActive"],
    sortSpalte: "Title",
    facetten: [
      { k: "Beschaffungsjahr",  d: "Beschaffungsjahr" },
      { k: "ErsatzGeplant",     d: "Ersatz geplant" },
      { k: "__ersatzText",      d: "Ersatzstatus" },
      { k: "GebaeudeStock",     d: "Gebäude / Stock" },
      { k: "__hatBenutzer",     d: "Benutzer zugeordnet" },
      { k: "SCCM_Found",        d: "In SCCM" },
      { k: "SCCM_Online",       d: "Online" },
      { k: "SCCM_ClientActive", d: "Client aktiv" },
      { k: "SCCM_Manufacturer", d: "Hersteller" },
      { k: "SCCM_Model",        d: "Modell" },
      { k: "SCCM_ChassisType",  d: "Gehäusetyp" },
      { k: "SCCM_OSVersion",    d: "OS-Version" },
      { k: "SCCM_EPEnabled",    d: "Defender aktiv" }
    ],
    zeitspalten: [
      { k: "SCCM_LastActive",      d: "Zuletzt aktiv" },
      { k: "SCCM_LastConsoleUse",  d: "Letzte Benutzeranmeldung" },
      { k: "SCCM_LastBoot",        d: "Letzter Neustart" },
      { k: "SCCM_EPSignatureDate", d: "Defender-Signatur" }
    ],
    hatSpeicher: true,
    hatProgramme: false,
    csvName: "Geraete"
  },
  benutzer: {
    schluessel: "benutzer",
    namensSpalte: "Anzeigename",
    standard: ["Anzeigename", "Title", "Abteilung", "Funktion", "Computer", "ADAktiviert"],
    sortSpalte: "Anzeigename",
    facetten: [
      { k: "Abteilung",       d: "Abteilung" },
      { k: "Firma",           d: "Firma" },
      { k: "Funktion",        d: "Funktion" },
      { k: "__hatGeraetText", d: "Gerät zugeordnet" },
      { k: "ADAktiviert",     d: "AD-Konto aktiv" }
    ],
    zeitspalten: [
      { k: "ADLetzterSync", d: "Letzter AD-Sync" }
    ],
    hatSpeicher: false,
    hatProgramme: true,
    csvName: "Benutzer"
  }
};

/* Spaltenliste einer Ansicht. Bei den Benutzern kommen die Programmspalten
   aus programme.json dazu, die erst zur Laufzeit bekannt sind. */
function spaltenListe(tab) {
  if (tab === "benutzer") {
    return SPALTEN_BENUTZER.concat(BENUTZER_ZUSATZ, programmSpalten);
  }
  return SPALTEN_COMPUTER.concat(GERAETE_ZUSATZ);
}

/* Nachschlagewerk interner Name → Spaltenobjekt. Wird nach dem Laden der
   Programme neu aufgebaut. */
const SPALTE = { geraete: {}, benutzer: {} };

function spaltenIndexAufbauen() {
  for (const tab of ["geraete", "benutzer"]) {
    SPALTE[tab] = {};
    for (const s of spaltenListe(tab)) SPALTE[tab][s.i] = s;
  }
}

function spalte(tab, schluessel) { return SPALTE[tab][schluessel] || null; }

function beschriftung(tab, schluessel) {
  const s = spalte(tab, schluessel);
  return s ? s.d : schluessel;
}


/* ==================================================================
   2. Zustand und Adresszeile
   ================================================================== */

const ANSICHTEN = ["uebersicht", "geraete", "benutzer", "software"];
const KANAL_NAME = "computerinventar";
const SPEICHER_SPALTEN = "computerinventar.spalten.";   // + Ansicht
const SPEICHER_DICHTE  = "computerinventar.dichte.";    // + Ansicht

function leererTabZustand(tab) {
  return {
    suche: "",
    facetten: {},        // { schluessel: [werte] }
    zeit: {},            // { schluessel: zeitraum }
    speicher: "",
    programm: "",        // interner Name eines Programms
    programmStufe: "",   // "" | "1" | "2"
    sortSpalte: TAB[tab].sortSpalte,
    sortAuf: true,
    spalten: TAB[tab].standard.slice(),
    dicht: false
  };
}

const zustand = {
  ansicht: "uebersicht",
  geraete: leererTabZustand("geraete"),
  benutzer: leererTabZustand("benutzer"),
  software: { suche: "" }
};

let geraete = [];          // angereicherte Computer-Zeilen
let benutzer = [];         // angereicherte Benutzer-Zeilen
let programme = null;      // Inhalt von programme.json
let programmSpalten = [];  // Spaltenobjekte daraus
const sichtbar = { geraete: [], benutzer: [] };

/* Zuletzt selbst geschriebener Hash. Damit lässt sich das eigene
   hashchange-Ereignis von einem Klick auf Vor/Zurück unterscheiden. */
let eigenerHash = null;

const mockModus = new URLSearchParams(location.search).get("mock") === "1";

/* ---------- Hash schreiben und lesen ----------

   Form: #<ansicht>?q=…&f=…&z=…&sp=…&pg=…&ps=…&s=…&c=…&d=kompakt
   «c» = sichtbare Spalten (Komma-getrennt), «d» = Dichte. Beide gelten für
   die Ansicht im Hash. Fehlen sie, gilt die im Browser gemerkte Auswahl. */

function hashSchreiben() {
  const p = new URLSearchParams();
  const a = zustand.ansicht;

  if (a === "software") {
    if (zustand.software.suche) p.set("q", zustand.software.suche);
  } else if (a === "geraete" || a === "benutzer") {
    const z = zustand[a];
    if (z.suche) p.set("q", z.suche);

    const f = [];
    for (const k of Object.keys(z.facetten)) {
      const w = z.facetten[k];
      if (w && w.length) f.push(k + ":" + w.join("|"));
    }
    if (f.length) p.set("f", f.join(";"));

    const t = [];
    for (const k of Object.keys(z.zeit)) if (z.zeit[k]) t.push(k + ":" + z.zeit[k]);
    if (t.length) p.set("z", t.join(";"));

    if (z.speicher) p.set("sp", z.speicher);
    if (z.programm) {
      p.set("pg", z.programm);
      if (z.programmStufe) p.set("ps", z.programmStufe);
    }
    if (z.sortSpalte !== TAB[a].sortSpalte || !z.sortAuf) {
      p.set("s", z.sortSpalte + ":" + (z.sortAuf ? "auf" : "ab"));
    }
    p.set("c", z.spalten.join(","));
    if (z.dicht) p.set("d", "kompakt");
  }

  const text = p.toString();
  const neu = "#" + a + (text ? "?" + text : "");
  if (location.hash === neu) return;
  eigenerHash = neu;

  /* Bewusst replaceState statt location.hash: zwei Zuweisungen im selben
     Durchlauf verwirft der Browser stillschweigend, und jede Filteränderung
     als Verlaufseintrag würde die Zurück-Taste unbrauchbar machen. */
  if (window.history && history.replaceState) {
    history.replaceState(null, "", location.pathname + location.search + neu);
  } else {
    location.hash = neu;
  }
}

function hashLesen() {
  const roh = location.hash.replace(/^#/, "");
  const trenn = roh.indexOf("?");
  const name = (trenn === -1 ? roh : roh.slice(0, trenn)) || "uebersicht";
  const p = new URLSearchParams(trenn === -1 ? "" : roh.slice(trenn + 1));

  zustand.ansicht = ANSICHTEN.indexOf(name) > -1 ? name : "uebersicht";
  const a = zustand.ansicht;

  if (a === "software") {
    zustand.software.suche = p.get("q") || "";
    return;
  }
  if (a !== "geraete" && a !== "benutzer") return;

  const z = zustand[a];
  z.suche = p.get("q") || "";

  z.facetten = {};
  for (const teil of (p.get("f") || "").split(";")) {
    if (!teil) continue;
    const i = teil.indexOf(":");
    if (i === -1) continue;
    z.facetten[teil.slice(0, i)] = teil.slice(i + 1).split("|").filter(Boolean);
  }

  z.zeit = {};
  for (const teil of (p.get("z") || "").split(";")) {
    if (!teil) continue;
    const i = teil.indexOf(":");
    if (i === -1) continue;
    z.zeit[teil.slice(0, i)] = teil.slice(i + 1);
  }

  z.speicher = p.get("sp") || "";
  z.programm = p.get("pg") || "";
  z.programmStufe = p.get("ps") || "";

  const s = p.get("s");
  if (s) {
    const i = s.indexOf(":");
    z.sortSpalte = i === -1 ? s : s.slice(0, i);
    z.sortAuf = i === -1 ? true : s.slice(i + 1) !== "ab";
  } else {
    z.sortSpalte = TAB[a].sortSpalte;
    z.sortAuf = true;
  }

  /* Spalten und Dichte: steht der Parameter im Link, gewinnt er; sonst
     bleibt, was im Browser gemerkt ist. Ungültige Namen werden erst nach
     dem Laden der Programme aussortiert (spaltenPruefen). */
  const c = p.get("c");
  if (c !== null) {
    const liste = c.split(",").filter(Boolean);
    if (liste.length) z.spalten = liste;
  }
  const d = p.get("d");
  if (d !== null) z.dicht = d === "kompakt";
}

/* Gemerkte Spalten und Dichte aus dem Browser holen. */
function einstellungenLaden() {
  for (const tab of ["geraete", "benutzer"]) {
    try {
      const roh = localStorage.getItem(SPEICHER_SPALTEN + tab);
      if (roh) {
        const liste = JSON.parse(roh);
        if (Array.isArray(liste) && liste.length) zustand[tab].spalten = liste;
      }
      zustand[tab].dicht = localStorage.getItem(SPEICHER_DICHTE + tab) === "kompakt";
    } catch (e) { /* Ohne Speicher gilt die Standardauswahl. */ }
  }
}

function einstellungenMerken(tab) {
  try {
    localStorage.setItem(SPEICHER_SPALTEN + tab, JSON.stringify(zustand[tab].spalten));
    localStorage.setItem(SPEICHER_DICHTE + tab, zustand[tab].dicht ? "kompakt" : "normal");
  } catch (e) { /* Privater Modus: dann eben nur für diese Sitzung. */ }
}

/* Nach dem Laden der Programme: unbekannte Spaltennamen entfernen. */
function spaltenPruefen() {
  for (const tab of ["geraete", "benutzer"]) {
    const z = zustand[tab];
    z.spalten = z.spalten.filter(k => !!spalte(tab, k));
    if (!z.spalten.length) z.spalten = TAB[tab].standard.slice();
  }
}


/* ==================================================================
   3. DOM-Helfer. Alles über textContent, nie über innerHTML.
   ================================================================== */

function $(id) { return document.getElementById(id); }

function el(tag, klasse, text) {
  const n = document.createElement(tag);
  if (klasse) n.className = klasse;
  if (text !== undefined && text !== null) n.textContent = String(text);
  return n;
}

function leeren(knoten) {
  while (knoten.firstChild) knoten.removeChild(knoten.firstChild);
}

function anhaengen(eltern, kinder) {
  for (const k of kinder) if (k) eltern.appendChild(k);
  return eltern;
}

function knopf(text, klasse, beiKlick) {
  const k = el("button", "knopf" + (klasse ? " " + klasse : ""), text);
  k.type = "button";
  if (beiKlick) k.addEventListener("click", beiKlick);
  return k;
}

/* Sinnbilder als eingebettetes SVG: die Inhaltsrichtlinie erlaubt weder
   fremde Schriften noch fremde Bilder. */
const SVG_NS = "http://www.w3.org/2000/svg";

const SINNBILDER = {
  suche:      ["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z", "M20 20l-4.3-4.3"],
  filter:     ["M4 6h16", "M7 12h10", "M10 18h4"],
  spalten:    ["M4 5h16v14H4z", "M10 5v14", "M16 5v14"],
  dichte:     ["M4 7h16", "M4 12h16", "M4 17h16"],
  csv:        ["M12 4v10", "M8 11l4 4 4-4", "M5 19h14"],
  plus:       ["M12 5v14", "M5 12h14"],
  neuladen:   ["M20 12a8 8 0 1 1-2.6-5.9", "M20 4v5h-5"],
  abmelden:   ["M15 5H6v14h9", "M14 12h7", "M18 9l3 3-3 3"],
  schliessen: ["M6 6l12 12", "M18 6L6 18"]
};

function sinnbild(name) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  for (const d of (SINNBILDER[name] || [])) {
    const pfad = document.createElementNS(SVG_NS, "path");
    pfad.setAttribute("d", d);
    svg.appendChild(pfad);
  }
  return svg;
}

function knopfSinnbild(id, name) {
  const k = $(id);
  if (k) k.insertBefore(sinnbild(name), k.firstChild);
}


/* ==================================================================
   4. Laden und Anreichern
   ================================================================== */

const fortschritt = { geraete: 0, benutzer: 0, programme: false };

function fortschrittZeigen() {
  const teile = ["Geräte " + fortschritt.geraete, "Benutzer " + fortschritt.benutzer,
                 "Programme" + (fortschritt.programme ? " ✓" : " …")];
  $("lade-fortschritt").textContent = teile.join("  /  ");
}

function zeigeLaden(text) {
  $("lade").hidden = false;
  $("lade-text").textContent = text;
  $("fehler").hidden = true;
  $("reiter").hidden = true;
  for (const a of ANSICHTEN) $("ansicht-" + a).hidden = true;
}

function zeigeFehler(titel, text, hinweis) {
  $("lade").hidden = true;
  $("fehler").hidden = false;
  $("fehler-titel").textContent = titel;
  $("fehler-text").textContent = text;
  $("fehler-hinweis").textContent = hinweis || "";
  $("reiter").hidden = true;
  for (const a of ANSICHTEN) $("ansicht-" + a).hidden = true;
}

function zeigeInhalt() {
  $("lade").hidden = true;
  $("fehler").hidden = true;
  $("reiter").hidden = false;
}

/* Zusätzliche Felder, die nur die Hauptseite braucht (Facettenwerte als
   lesbarer Text). modell.js liefert die eigentliche Verknüpfung. */
function nachbereiten() {
  for (const c of geraete) {
    c.__ersatzText = ERSATZ_TEXT[c.__ersatzStatus] || "unbekannt";
    c.__hatBenutzer = c.__benutzer.length ? "Ja" : "Nein";
  }
  for (const b of benutzer) {
    b.__hatGeraetText = b.__hatGeraet ? "Ja" : "Nein";
  }
}

/* «still» lädt im Hintergrund nach, ohne die Ladeanzeige einzublenden. */
async function datenLaden(still) {
  if (!still) {
    fortschritt.geraete = 0; fortschritt.benutzer = 0; fortschritt.programme = false;
    zeigeLaden("Daten werden geladen …");
    fortschrittZeigen();
  }

  const [rohGeraete, rohBenutzer, rohProgramme] = await Promise.all([
    Daten.computer(function (n) {
      fortschritt.geraete = n; if (!still) fortschrittZeigen();
    }),
    Daten.benutzer(function (n) {
      fortschritt.benutzer = n; if (!still) fortschrittZeigen();
    }),
    Daten.programme()
  ]);

  fortschritt.geraete = rohGeraete.length;
  fortschritt.benutzer = rohBenutzer.length;
  fortschritt.programme = true;
  if (!still) fortschrittZeigen();

  programme = rohProgramme;
  programmSpalten = Modell.programmSpalten(programme);
  spaltenIndexAufbauen();
  spaltenPruefen();

  const ergebnis = Modell.anreichern(rohGeraete, rohBenutzer, programme);
  geraete = ergebnis.computer;
  benutzer = ergebnis.benutzer;
  nachbereiten();
}


/* ==================================================================
   5. Filtern, Sortieren, Tabellen
   ================================================================== */

function zeilenVon(tab) { return tab === "benutzer" ? benutzer : geraete; }

/* Wert einer Facette als Text, inklusive der abgeleiteten. */
function facettenWert(zeile, schluessel) {
  const w = zeile[schluessel];
  if (w === null || w === undefined) return "";
  if (w === true) return "Ja";
  if (w === false) return "";
  return String(w).trim();
}

function zeitPasst(wert, zeitraum) {
  const tage = Hilfe.tageHer(wert);
  if (zeitraum === "leer") return tage === null;
  if (tage === null) return false;
  if (zeitraum === "7")    return tage <= 7;
  if (zeitraum === "30")   return tage <= 30;
  if (zeitraum === "90")   return tage <= 90;
  if (zeitraum === "ae30") return tage > 30;
  if (zeitraum === "ae90") return tage > 90;
  return true;
}

function speicherPasst(wert, stufe) {
  if (wert === null || wert === undefined || wert === "") return stufe === "leer";
  const n = Number(wert);
  if (isNaN(n)) return stufe === "leer";
  if (stufe === "u20")  return n < 20;
  if (stufe === "u50")  return n < 50;
  if (stufe === "ab50") return n >= 50;
  return false;
}

function filtern(tab) {
  const z = zustand[tab];
  const worte = z.suche.trim().toLowerCase().split(/\s+/).filter(Boolean);

  return zeilenVon(tab).filter(function (zeile) {
    for (const wort of worte) if (zeile.__such.indexOf(wort) === -1) return false;

    for (const k of Object.keys(z.facetten)) {
      const werte = z.facetten[k];
      if (!werte || !werte.length) continue;
      if (werte.indexOf(facettenWert(zeile, k)) === -1) return false;
    }

    for (const k of Object.keys(z.zeit)) {
      if (!z.zeit[k]) continue;
      if (!zeitPasst(zeile[k], z.zeit[k])) return false;
    }

    if (z.speicher && !speicherPasst(zeile.SCCM_DiskCFreeGB, z.speicher)) return false;

    if (z.programm) {
      const stufe = Modell.stufe(zeile[z.programm]);
      if (z.programmStufe) {
        if (String(stufe) !== z.programmStufe) return false;
      } else if (stufe === 0) return false;
    }

    return true;
  });
}

function sortieren(tab, zeilen) {
  const z = zustand[tab];
  const schluessel = z.sortSpalte;
  const richtung = z.sortAuf ? 1 : -1;
  const s = spalte(tab, schluessel);
  const typ = s ? s.t : "Text";
  const istProgramm = s && s.q === "programm";

  return zeilen.slice().sort(function (a, b) {
    let x = a[schluessel], y = b[schluessel];

    if (istProgramm) return (Modell.stufe(x) - Modell.stufe(y)) * richtung;
    if (typ === "DateTime") {
      const dx = Hilfe.datum(x), dy = Hilfe.datum(y);
      if (!dx && !dy) return 0;
      if (!dx) return 1;            // leere Werte immer ans Ende
      if (!dy) return -1;
      return (dx.getTime() - dy.getTime()) * richtung;
    }
    if (typ === "Number") {
      const nx = (x === "" || x === null || x === undefined) ? null : Number(x);
      const ny = (y === "" || y === null || y === undefined) ? null : Number(y);
      if (nx === null && ny === null) return 0;
      if (nx === null) return 1;
      if (ny === null) return -1;
      return (nx - ny) * richtung;
    }
    if (typ === "Boolean") return ((x ? 1 : 0) - (y ? 1 : 0)) * richtung;
    return Hilfe.vergleiche(x, y) * richtung;
  });
}

function neuBerechnen(tab) {
  sichtbar[tab] = sortieren(tab, filtern(tab));
}

/* ---------- Zellinhalt ---------- */

function stufenZelle(td, wert, spaltenObjekt) {
  const stufe = Modell.stufe(wert);
  if (stufe === 0) { td.appendChild(el("span", "t-still", "–")); return td; }
  if (stufe === 1) { td.appendChild(el("span", "t-erfolg", "an")); return td; }
  const gesperrt = el("span", "t-erfolg", "AD");
  gesperrt.title = Modell.sperrHinweis(spaltenObjekt);
  td.appendChild(gesperrt);
  return td;
}

function zelle(tab, zeile, schluessel) {
  const s = spalte(tab, schluessel);
  const wert = zeile[schluessel];
  const td = el("td");

  // Namensspalte: echter Verweis, damit Mittelklick und Ctrl-Klick wirken.
  if (schluessel === TAB[tab].namensSpalte) {
    if (tab === "geraete") {
      const punkt = el("span", "punkt" + (zeile.__online ? "" : " punkt-aus"));
      punkt.title = zeile.__online ? "online" : "nicht online";
      td.appendChild(punkt);
    }
    const text = String(wert || "").trim()
      || (tab === "benutzer" ? String(zeile.Title || "(ohne Namen)") : "(ohne Namen)");
    const link = el("a", "name-link", text);
    link.href = tab === "benutzer" ? benutzerUrl(zeile.id) : geraetUrl(zeile.id);
    link.target = (tab === "benutzer" ? "benutzer-" : "geraet-") + zeile.id;
    link.rel = "noopener";
    link.title = text + " — Detail in neuem Fenster öffnen";
    td.appendChild(link);
    return td;
  }

  if (s && s.q === "programm") return stufenZelle(td, wert, s);

  if (schluessel === "__ersatzText") {
    const ton = ERSATZ_TON[zeile.__ersatzStatus] || "leise";
    td.appendChild(el("span", "t-" + ton, ERSATZ_TEXT[zeile.__ersatzStatus] || "unbekannt"));
    return td;
  }

  if (!s) {
    td.textContent = wert === null || wert === undefined ? "" : String(wert);
    if (td.textContent) td.title = td.textContent;
    return td;
  }
  if (s.t === "Boolean") {
    td.appendChild(wert ? el("span", "t-erfolg", "✓") : el("span", "t-still", "–"));
    return td;
  }
  if (s.t === "DateTime") {
    td.textContent = Hilfe.datumZeitText(wert);
    td.title = Hilfe.relativText(wert);
    return td;
  }
  if (s.t === "Number") {
    td.className = "zahl";
    td.textContent = Hilfe.zahlText(wert);
    return td;
  }
  if (s.t === "Note") {
    const z = Hilfe.zeilen(wert);
    td.textContent = z.length ? z[0] + (z.length > 1 ? "  (+" + (z.length - 1) + ")" : "") : "";
    if (z.length) td.title = z.join("\n");
    return td;
  }
  const text = wert === null || wert === undefined ? "" : String(wert);
  if (text === "Ja") td.appendChild(el("span", "t-erfolg", "Ja"));
  else if (text === "Nein") td.appendChild(el("span", "t-still", "Nein"));
  else { td.textContent = text; if (text) td.title = text; }
  return td;
}

/* ---------- Tabelle zeichnen ---------- */

function zeichneTabelle(tab) {
  const z = zustand[tab];
  const kopf = $(tab + "-kopf");
  const koerper = $(tab + "-koerper");
  leeren(kopf);
  leeren(koerper);

  const kopfZeile = el("tr");
  for (const schluessel of z.spalten) {
    const th = el("th", null, beschriftung(tab, schluessel));
    th.scope = "col";
    th.title = "Nach «" + beschriftung(tab, schluessel) + "» sortieren";
    if (z.sortSpalte === schluessel) {
      th.className = "sortiert";
      th.setAttribute("aria-sort", z.sortAuf ? "ascending" : "descending");
      th.appendChild(el("span", "pfeil", z.sortAuf ? "↑" : "↓"));
    }
    th.addEventListener("click", function () {
      if (z.sortSpalte === schluessel) z.sortAuf = !z.sortAuf;
      else { z.sortSpalte = schluessel; z.sortAuf = true; }
      neuBerechnen(tab);
      zeichneTabelle(tab);
      hashSchreiben();
    });
    kopfZeile.appendChild(th);
  }
  kopf.appendChild(kopfZeile);

  for (const zeile of sichtbar[tab]) {
    const tr = el("tr");
    for (const schluessel of z.spalten) tr.appendChild(zelle(tab, zeile, schluessel));
    tr.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest("a")) return;
      detailOeffnen(tab, zeile.id, e.ctrlKey || e.metaKey || e.shiftKey);
    });
    tr.addEventListener("auxclick", function (e) {
      if (e.button !== 1) return;
      if (e.target.closest && e.target.closest("a")) return;
      e.preventDefault();
      detailOeffnen(tab, zeile.id, true);
    });
    koerper.appendChild(tr);
  }

  const alle = zeilenVon(tab).length;
  $(tab + "-leer").hidden = sichtbar[tab].length > 0;
  $(tab + "-tabelle").hidden = sichtbar[tab].length === 0;
  $(tab + "-anzahl").textContent = sichtbar[tab].length === alle
    ? alle + (tab === "benutzer" ? " Benutzer" : " Geräte")
    : sichtbar[tab].length + " von " + alle;
}

/* ---------- Chips und Zähler ---------- */

function aktiveFilter(tab) {
  const z = zustand[tab];
  let n = 0;
  for (const k of Object.keys(z.facetten)) n += (z.facetten[k] || []).length;
  for (const k of Object.keys(z.zeit)) if (z.zeit[k]) n++;
  if (z.speicher) n++;
  if (z.programm) n++;
  return n;
}

function zaehlerAnzeigen(tab) {
  const z = zustand[tab];
  const filterKnopf = $(tab + "-knopf-filter");
  const anzahl = aktiveFilter(tab);
  let marke = filterKnopf.querySelector(".zaehler");
  if (anzahl) {
    if (!marke) { marke = el("span", "zaehler"); filterKnopf.appendChild(marke); }
    marke.textContent = String(anzahl);
    filterKnopf.title = anzahl === 1 ? "1 Filter aktiv" : anzahl + " Filter aktiv";
    filterKnopf.classList.add("aktiv");
  } else {
    if (marke) marke.remove();
    filterKnopf.title = "Filter öffnen";
    filterKnopf.classList.remove("aktiv");
  }

  const spaltenKnopf = $(tab + "-knopf-spalten");
  let sm = spaltenKnopf.querySelector(".zaehler");
  if (!sm) { sm = el("span", "zaehler zaehler-still"); spaltenKnopf.appendChild(sm); }
  sm.textContent = String(z.spalten.length);
  spaltenKnopf.title = z.spalten.length + " Spalten sichtbar";
}

function zeichneChips(tab) {
  const z = zustand[tab];
  const ziel = $(tab + "-chips");
  leeren(ziel);
  let anzahl = 0;

  function chip(text, entfernen) {
    const c = el("button", "chip chip-marke");
    c.type = "button";
    c.appendChild(document.createTextNode(text));
    c.appendChild(el("span", "x", "×"));
    c.title = "Filter entfernen";
    c.addEventListener("click", function () {
      entfernen();
      neuBerechnen(tab);
      zeichneAnsicht();
      hashSchreiben();
    });
    ziel.appendChild(c);
    anzahl++;
  }

  if (z.suche) {
    chip("Suche: " + z.suche, function () {
      z.suche = "";
      $(tab + "-suche").value = "";
    });
  }
  for (const k of Object.keys(z.facetten)) {
    const werte = z.facetten[k];
    if (!werte || !werte.length) continue;
    for (const w of werte) {
      chip(beschriftung(tab, k) + ": " + (w || "(leer)"), function () {
        z.facetten[k] = z.facetten[k].filter(x => x !== w);
        if (!z.facetten[k].length) delete z.facetten[k];
      });
    }
  }
  for (const k of Object.keys(z.zeit)) {
    const w = z.zeit[k];
    if (!w) continue;
    const stufe = ZEITRAEUME.find(s => s.w === w);
    chip(beschriftung(tab, k) + ": " + (stufe ? stufe.d : w), function () { delete z.zeit[k]; });
  }
  if (z.speicher) {
    const stufe = SPEICHERSTUFEN.find(s => s.w === z.speicher);
    chip("Freier Speicher C: " + (stufe ? stufe.d : z.speicher), function () { z.speicher = ""; });
  }
  if (z.programm) {
    // Die Stufe kann aus einem von Hand zusammengebauten Link kommen und
    // dann unbekannt sein — dann steht der rohe Wert im Chip.
    const stufe = PROGRAMM_STUFEN.find(s => s.w === z.programmStufe);
    chip("Berechtigung: " + beschriftung(tab, z.programm)
      + (z.programmStufe ? " (" + (stufe ? stufe.d : z.programmStufe) + ")" : ""),
      function () { z.programm = ""; z.programmStufe = ""; });
  }

  if (anzahl > 1) {
    const alle = el("button", "chip", "Alle Filter entfernen");
    alle.type = "button";
    alle.addEventListener("click", function () {
      filterZuruecksetzen(tab);
      $(tab + "-suche").value = "";
      neuBerechnen(tab);
      zeichneAnsicht();
      hashSchreiben();
    });
    ziel.appendChild(alle);
  }

  zaehlerAnzeigen(tab);
}

function filterZuruecksetzen(tab) {
  const z = zustand[tab];
  z.suche = "";
  z.facetten = {};
  z.zeit = {};
  z.speicher = "";
  z.programm = "";
  z.programmStufe = "";
}

/* ---------- Panels ---------- */

function panelsSchliessen() {
  for (const tab of ["geraete", "benutzer"]) {
    for (const art of ["filterleiste", "spaltenwahl"]) {
      const p = $(tab + "-" + art);
      if (p) p.hidden = true;
    }
    for (const art of ["filter", "spalten"]) {
      const k = $(tab + "-knopf-" + art);
      if (k) k.setAttribute("aria-expanded", "false");
    }
  }
}

function panelUmschalten(tab, art) {
  const id = tab + "-" + (art === "filter" ? "filterleiste" : "spaltenwahl");
  const warZu = $(id).hidden;
  panelsSchliessen();
  if (!warZu) return;
  if (art === "filter") zeichneFilterleiste(tab); else zeichneSpaltenwahl(tab);
  $(id).hidden = false;
  $(tab + "-knopf-" + art).setAttribute("aria-expanded", "true");
}

function panelKopf(titel, unter) {
  const kopf = el("div", "panel-kopf");
  const links = el("div");
  links.appendChild(el("h2", null, titel));
  if (unter) links.appendChild(el("p", "hinweis", unter));

  const zu = el("button", "knopf knopf-leise");
  zu.type = "button";
  zu.setAttribute("aria-label", "Panel schliessen");
  zu.appendChild(sinnbild("schliessen"));
  zu.addEventListener("click", panelsSchliessen);

  anhaengen(kopf, [links, zu]);
  return kopf;
}

/* Zählt die Werte einer Spalte und liefert die häufigsten zuerst. */
function verteilung(tab, schluessel) {
  const zaehler = new Map();
  for (const z of zeilenVon(tab)) {
    const w = facettenWert(z, schluessel);
    if (!w) continue;
    zaehler.set(w, (zaehler.get(w) || 0) + 1);
  }
  return Array.from(zaehler.entries())
    .sort((a, b) => b[1] - a[1] || Hilfe.vergleiche(a[0], b[0]));
}

function nachFilter(tab) {
  neuBerechnen(tab);
  zeichneChips(tab);
  zeichneTabelle(tab);
  hashSchreiben();
}

function zeichneFilterleiste(tab) {
  const z = zustand[tab];
  const ziel = $(tab + "-filterleiste");
  leeren(ziel);
  ziel.appendChild(panelKopf("Filter",
    "Die Zahl in Klammern zeigt, wie viele Zeilen den Wert haben."));

  const koerper = el("div", "panel-koerper");
  const gitter = el("div", "filtergitter");

  for (const facette of TAB[tab].facetten) {
    const werte = verteilung(tab, facette.k);
    if (!werte.length) continue;

    const feld = el("div", "filterfeld");
    feld.appendChild(el("label", null, facette.d));
    const kasten = el("div", "mehrfach");
    const gewaehlt = z.facetten[facette.k] || [];

    for (const [wert, anzahl] of werte) {
      const label = el("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = gewaehlt.indexOf(wert) > -1;
      box.addEventListener("change", function () {
        const liste = (z.facetten[facette.k] || []).slice();
        const i = liste.indexOf(wert);
        if (box.checked && i === -1) liste.push(wert);
        if (!box.checked && i > -1) liste.splice(i, 1);
        if (liste.length) z.facetten[facette.k] = liste;
        else delete z.facetten[facette.k];
        nachFilter(tab);
      });
      label.appendChild(box);
      label.appendChild(document.createTextNode(wert + " "));
      label.appendChild(el("span", "zahl", "(" + anzahl + ")"));
      kasten.appendChild(label);
    }
    feld.appendChild(kasten);
    gitter.appendChild(feld);
  }

  for (const zs of TAB[tab].zeitspalten) {
    const feld = el("div", "filterfeld");
    feld.appendChild(el("label", null, zs.d));
    const auswahl = document.createElement("select");
    auswahl.appendChild(new Option("alle", ""));
    for (const s of ZEITRAEUME) auswahl.appendChild(new Option(s.d, s.w));
    auswahl.value = z.zeit[zs.k] || "";
    auswahl.addEventListener("change", function () {
      if (auswahl.value) z.zeit[zs.k] = auswahl.value;
      else delete z.zeit[zs.k];
      nachFilter(tab);
    });
    feld.appendChild(auswahl);
    gitter.appendChild(feld);
  }

  if (TAB[tab].hatSpeicher) {
    const feld = el("div", "filterfeld");
    feld.appendChild(el("label", null, "Freier Speicher Laufwerk C:"));
    const wahl = document.createElement("select");
    wahl.appendChild(new Option("alle", ""));
    for (const s of SPEICHERSTUFEN) wahl.appendChild(new Option(s.d, s.w));
    wahl.value = z.speicher;
    wahl.addEventListener("change", function () {
      z.speicher = wahl.value;
      nachFilter(tab);
    });
    feld.appendChild(wahl);
    gitter.appendChild(feld);
  }

  if (TAB[tab].hatProgramme) {
    const feld = el("div", "filterfeld");
    feld.appendChild(el("label", null, "Berechtigung für Programm"));

    const wahl = document.createElement("select");
    wahl.appendChild(new Option("kein Programmfilter", ""));
    for (const p of programmSpalten.slice().sort((a, b) => Hilfe.vergleiche(a.d, b.d))) {
      wahl.appendChild(new Option(p.d, p.i));
    }
    wahl.value = z.programm;

    const stufenWahl = document.createElement("select");
    for (const s of PROGRAMM_STUFEN) stufenWahl.appendChild(new Option(s.d, s.w));
    stufenWahl.value = z.programmStufe;
    stufenWahl.disabled = !z.programm;

    wahl.addEventListener("change", function () {
      z.programm = wahl.value;
      if (!z.programm) z.programmStufe = "";
      stufenWahl.disabled = !z.programm;
      nachFilter(tab);
    });
    stufenWahl.addEventListener("change", function () {
      z.programmStufe = stufenWahl.value;
      nachFilter(tab);
    });

    feld.appendChild(wahl);
    const zweite = el("div", "feld-hinweis");
    feld.appendChild(zweite);
    feld.appendChild(stufenWahl);
    gitter.appendChild(feld);
  }

  koerper.appendChild(gitter);

  const werkzeuge = el("div", "werkzeugzeile");
  werkzeuge.appendChild(knopf("Alle Filter entfernen", null, function () {
    filterZuruecksetzen(tab);
    $(tab + "-suche").value = "";
    nachFilter(tab);
    zeichneFilterleiste(tab);
  }));
  koerper.appendChild(werkzeuge);
  ziel.appendChild(koerper);
}

function zeichneSpaltenwahl(tab) {
  const z = zustand[tab];
  const alleSpalten = spaltenListe(tab);
  const ziel = $(tab + "-spaltenwahl");
  leeren(ziel);
  ziel.appendChild(panelKopf("Spalten der Tabelle",
    "Die Auswahl steht in der Adresse (c=…) und bleibt in diesem Browser gespeichert."));

  const koerper = el("div", "panel-koerper");

  const gruppen = [];
  for (const s of alleSpalten) if (gruppen.indexOf(s.g) === -1) gruppen.push(s.g);

  for (const gruppe of gruppen) {
    const spalten = alleSpalten.filter(s => s.g === gruppe);
    if (!spalten.length) continue;

    const block = el("div", "spaltengruppe");
    block.appendChild(el("h3", null, gruppe));
    const liste = el("div", "liste");

    for (const s of spalten) {
      const label = el("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = z.spalten.indexOf(s.i) > -1;
      box.addEventListener("change", function () {
        if (box.checked) {
          if (z.spalten.indexOf(s.i) === -1) z.spalten.push(s.i);
        } else {
          z.spalten = z.spalten.filter(x => x !== s.i);
        }
        // Reihenfolge immer wie in der Spaltenliste: die Tabelle bleibt ruhig.
        z.spalten.sort((a, b) =>
          alleSpalten.findIndex(s2 => s2.i === a) - alleSpalten.findIndex(s2 => s2.i === b));
        if (!z.spalten.length) z.spalten = [TAB[tab].namensSpalte];
        einstellungenMerken(tab);
        zeichneTabelle(tab);
        zaehlerAnzeigen(tab);
        hashSchreiben();
      });
      label.appendChild(box);
      label.appendChild(document.createTextNode(s.d));
      liste.appendChild(label);
    }
    block.appendChild(liste);
    koerper.appendChild(block);
  }

  function setzen(liste) {
    z.spalten = liste;
    einstellungenMerken(tab);
    zeichneSpaltenwahl(tab);
    zeichneTabelle(tab);
    zaehlerAnzeigen(tab);
    hashSchreiben();
  }

  const werkzeuge = el("div", "werkzeugzeile");
  anhaengen(werkzeuge, [
    knopf("Standardspalten", null, function () { setzen(TAB[tab].standard.slice()); }),
    knopf("Nur Name", null, function () { setzen([TAB[tab].namensSpalte]); }),
    knopf("Alle Spalten", null, function () { setzen(alleSpalten.map(s => s.i)); })
  ]);
  koerper.appendChild(werkzeuge);
  ziel.appendChild(koerper);
}

/* ---------- CSV ---------- */

function csvWert(tab, zeile, schluessel) {
  const s = spalte(tab, schluessel);
  const wert = zeile[schluessel];
  if (s && s.q === "programm") return String(Modell.stufe(wert));
  if (!s) return wert === null || wert === undefined ? "" : String(wert);
  if (s.t === "Boolean") return wert ? "Ja" : "Nein";
  if (s.t === "DateTime") return Hilfe.datumZeitText(wert);
  if (s.t === "Note") return Hilfe.zeilen(wert).join(" / ");
  return wert === null || wert === undefined ? "" : String(wert);
}

function csvExport(tab) {
  const z = zustand[tab];
  const trenner = ";";
  const zeilen = [];

  function feld(text) {
    const t = String(text === null || text === undefined ? "" : text);
    return '"' + t.replace(/"/g, '""') + '"';
  }

  zeilen.push(z.spalten.map(k => feld(beschriftung(tab, k))).join(trenner));
  for (const zeile of sichtbar[tab]) {
    zeilen.push(z.spalten.map(k => feld(csvWert(tab, zeile, k))).join(trenner));
  }

  // Byte Order Mark, damit Excel unter Windows die Umlaute richtig liest.
  const inhalt = "﻿" + zeilen.join("\r\n") + "\r\n";
  const blob = new Blob([inhalt], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const heute = new Date();
  const name = "Inventar_" + TAB[tab].csvName + "_" + heute.getFullYear()
    + String(heute.getMonth() + 1).padStart(2, "0")
    + String(heute.getDate()).padStart(2, "0") + ".csv";

  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

/* ---------- Sprung in eine Tabelle mit gesetztem Filter ---------- */

function springeMitFilter(tab, setzen) {
  filterZuruecksetzen(tab);
  setzen(zustand[tab]);
  zustand.ansicht = tab;
  panelsSchliessen();
  neuBerechnen(tab);
  zeichneAnsicht();
  hashSchreiben();
  const rahmen = $(tab + "-rahmen");
  if (rahmen) rahmen.scrollTop = 0;
}

function facetteSetzen(z, schluessel, wert) { z.facetten[schluessel] = [wert]; }


/* ==================================================================
   6a. Übersicht
   ================================================================== */

function kachel(wert, text, ton, unter, aktion) {
  const k = el(aktion ? "button" : "div", "kachel" + (ton ? " ton-" + ton : ""));
  if (aktion) k.type = "button";
  const klein = String(wert).length > 7 ? " klein" : "";
  anhaengen(k, [el("div", "kachel-wert" + klein, wert), el("div", "kachel-text", text)]);
  if (unter) k.appendChild(el("div", "kachel-unter", unter));
  if (aktion) {
    k.addEventListener("click", aktion);
    k.title = "In der Liste anzeigen";
  } else {
    k.dataset.klickbar = "nein";
  }
  return k;
}

function zaehle(liste, pruefung) {
  let n = 0;
  for (const z of liste) if (pruefung(z)) n++;
  return n;
}

function zeichneUebersicht() {
  /* ---- Kennzahlen Geräte ---- */
  const zielG = $("kacheln-geraete");
  leeren(zielG);

  const online = zaehle(geraete, z => z.__online);
  const ohneSccm = zaehle(geraete, z => !z.__inSccm);
  const ueberfaellig = zaehle(geraete, z => z.__ersatzStatus === "ueberfaellig");
  const ohneJahr = zaehle(geraete, z => !String(z.Beschaffungsjahr || "").trim());
  const ohneBenutzer = zaehle(geraete, z => z.__benutzer.length === 0);

  const kachelnG = [
    [geraete.length, "Geräte gesamt", null, null,
      () => springeMitFilter("geraete", function () { })],
    [online, "gerade online", online ? "erfolg" : null, null,
      () => springeMitFilter("geraete", z => facetteSetzen(z, "SCCM_Online", "Ja"))],
    [ohneSccm, "nicht in SCCM", ohneSccm ? "warnung" : null, null,
      () => springeMitFilter("geraete", z => facetteSetzen(z, "SCCM_Found", "Nein"))],
    [ueberfaellig, "Ersatz überfällig", ueberfaellig ? "gefahr" : null,
      "Ersatz geplant vor " + Modell.gjAktuell(),
      () => springeMitFilter("geraete", z => facetteSetzen(z, "__ersatzText", ERSATZ_TEXT.ueberfaellig))],
    [ohneJahr, "ohne Beschaffungsjahr", ohneJahr ? "warnung" : null, null,
      () => springeMitFilter("geraete", z => facetteSetzen(z, "__ersatzText", ERSATZ_TEXT.unbekannt))],
    [ohneBenutzer, "ohne Benutzer", null, null,
      () => springeMitFilter("geraete", z => facetteSetzen(z, "__hatBenutzer", "Nein"))]
  ];
  for (const [w, t, ton, unter, aktion] of kachelnG) {
    zielG.appendChild(kachel(w, t, ton, unter, aktion));
  }

  /* ---- Kennzahlen Benutzer ---- */
  const zielB = $("kacheln-benutzer");
  leeren(zielB);

  const ohneGeraet = zaehle(benutzer, b => !b.__hatGeraet);
  const inaktiv = zaehle(benutzer, b => !b.__adAktiv);
  const abweichung = zaehle(benutzer, b => b.__primaerAbweichung);

  const kachelnB = [
    [benutzer.length, "Benutzer gesamt", null, null,
      () => springeMitFilter("benutzer", function () { })],
    [ohneGeraet, "ohne Gerät", null, null,
      () => springeMitFilter("benutzer", z => facetteSetzen(z, "__hatGeraetText", "Nein"))],
    [ohneBenutzer, "Geräte ohne Benutzer", null, null,
      () => springeMitFilter("geraete", z => facetteSetzen(z, "__hatBenutzer", "Nein"))],
    [inaktiv, "AD-Konto deaktiviert", inaktiv ? "gefahr" : null, null,
      () => springeMitFilter("benutzer", z => facetteSetzen(z, "ADAktiviert", "Nein"))],
    [abweichung, "Primärgerät weicht ab", abweichung ? "warnung" : null,
      "SCCM-Primärgerät ≠ zugeordnetes Gerät", null]
  ];
  for (const [w, t, ton, unter, aktion] of kachelnB) {
    zielB.appendChild(kachel(w, t, ton, unter, aktion));
  }

  zeichneZeitstrahl();
  zeichneVerteilungen();
}

/* ---------- Ersatzplanung als Zeitstrahl ---------- */

function zeichneZeitstrahl() {
  const ziel = $("zeitstrahl");
  const legende = $("zeitstrahl-legende");
  leeren(ziel);
  leeren(legende);

  const heute = Modell.gjAktuell();
  let von = heute, bis = heute;
  for (const g of geraete) {
    const b = String(g.Beschaffungsjahr || "").trim();
    const e = String(g.ErsatzGeplant || "").trim();
    if (b && Modell.gjVergleich(b, von) < 0) von = b;
    if (e && Modell.gjVergleich(e, von) < 0) von = e;
    if (b && Modell.gjVergleich(b, bis) > 0) bis = b;
    if (e && Modell.gjVergleich(e, bis) > 0) bis = e;
  }

  const jahre = Modell.gjListe(von, bis);
  if (!jahre.length) {
    ziel.appendChild(el("p", "hinweis",
      "Noch keine Beschaffungs- oder Ersatzjahre erfasst."));
    return;
  }

  const beschafft = new Map();
  const ersatz = new Map();
  for (const g of geraete) {
    const b = String(g.Beschaffungsjahr || "").trim();
    const e = String(g.ErsatzGeplant || "").trim();
    if (b) beschafft.set(b, (beschafft.get(b) || 0) + 1);
    if (e) ersatz.set(e, (ersatz.get(e) || 0) + 1);
  }

  let hoechste = 1;
  for (const j of jahre) {
    hoechste = Math.max(hoechste, beschafft.get(j) || 0, ersatz.get(j) || 0);
  }

  const achse = el("div", "zeitstrahl-achse");

  for (const jahr of jahre) {
    const nB = beschafft.get(jahr) || 0;
    const nE = ersatz.get(jahr) || 0;
    const vergleich = Modell.gjVergleich(jahr, heute);

    const tick = el("div", "zeitstrahl-tick"
      + (vergleich === 0 ? " aktuell" : "")
      + (vergleich < 0 ? " vergangen" : ""));

    const saeulen = el("div", "zeitstrahl-saeulen");

    /* Eine Säule ohne Geräte ist nur ein Strich und nicht anklickbar —
       sonst landet man in einer leeren Liste. */
    function saeule(anzahl, klasse, hinweis, schluessel) {
      const s = el(anzahl ? "button" : "div", "saeule " + klasse);
      if (anzahl) {
        s.type = "button";
        s.addEventListener("click", function () {
          springeMitFilter("geraete", z => facetteSetzen(z, schluessel, jahr));
        });
      }
      s.style.height = Math.max(3, Math.round(anzahl / hoechste * 84)) + "px";
      s.title = anzahl + hinweis;
      return s;
    }

    const a = saeule(nB, "saeule-a",
      " Gerät(e) beschafft im Geschäftsjahr " + jahr, "Beschaffungsjahr");

    const b = saeule(nE,
      "saeule-b" + (vergleich < 0 ? " gefahr" : (vergleich === 0 ? " warnung" : "")),
      " Gerät(e) zum Ersatz geplant im Geschäftsjahr " + jahr
        + (vergleich < 0 ? " — überfällig" : ""), "ErsatzGeplant");

    anhaengen(saeulen, [a, b]);
    tick.appendChild(saeulen);
    tick.appendChild(el("div", "zeitstrahl-linie"));
    tick.appendChild(el("div", "zeitstrahl-werte", nB + " / " + nE));
    const label = el("div", "zeitstrahl-label", jahr.replace("/", "/​"));
    label.title = "Geschäftsjahr " + jahr
      + (vergleich === 0 ? " (laufendes Geschäftsjahr)" : "");
    tick.appendChild(label);
    achse.appendChild(tick);
  }

  ziel.appendChild(achse);

  anhaengen(legende, [
    el("span", "zeitstrahl-marke", "beschafft (linke Säule)"),
    el("span", "zeitstrahl-marke warnung", "Ersatz geplant (rechte Säule)"),
    el("span", "zeitstrahl-marke gefahr", "Ersatz überfällig"),
    el("span", null, "Laufendes Geschäftsjahr: " + heute)
  ]);
}

/* ---------- Verteilungen ---------- */

function verteilungsKarte(titel, eintraege, beiKlick) {
  const karte = el("div", "karte");
  const kopf = el("div", "karte-kopf");
  kopf.appendChild(el("h2", "karte-titel", titel));
  karte.appendChild(kopf);

  const block = el("div", "karte-inhalt");
  karte.appendChild(block);

  if (!eintraege.length) {
    block.appendChild(el("p", "hinweis", "Keine Werte vorhanden."));
    return karte;
  }

  const groesste = eintraege[0][1];
  for (const [name, anzahl] of eintraege.slice(0, 10)) {
    const zeile = el("button", "liste-zeile");
    zeile.type = "button";

    const links = el("span");
    const beschriftet = el("span", "verteilung-name", name);
    beschriftet.title = name;
    links.appendChild(beschriftet);
    const spur = el("span", "spur");
    const fuell = el("span", "fuell");
    fuell.style.width = Math.max(2, Math.round(anzahl / groesste * 100)) + "%";
    spur.appendChild(fuell);
    links.appendChild(spur);

    anhaengen(zeile, [links, el("span", "zusatz", anzahl)]);
    zeile.addEventListener("click", function () { beiKlick(name); });
    block.appendChild(zeile);
  }

  if (eintraege.length > 10) {
    const rest = eintraege.slice(10).reduce((s, e) => s + e[1], 0);
    block.appendChild(el("p", "hinweis",
      "und " + (eintraege.length - 10) + " weitere Werte mit zusammen " + rest + " Zeilen"));
  }
  return karte;
}

function zeichneVerteilungen() {
  const ziel = $("verteilungen");
  leeren(ziel);

  ziel.appendChild(verteilungsKarte("Geräte nach Modell", verteilung("geraete", "SCCM_Model"),
    w => springeMitFilter("geraete", z => facetteSetzen(z, "SCCM_Model", w))));

  ziel.appendChild(verteilungsKarte("Geräte nach OS-Version", verteilung("geraete", "SCCM_OSVersion"),
    w => springeMitFilter("geraete", z => facetteSetzen(z, "SCCM_OSVersion", w))));

  ziel.appendChild(verteilungsKarte("Geräte nach Gebäude / Stock", verteilung("geraete", "GebaeudeStock"),
    w => springeMitFilter("geraete", z => facetteSetzen(z, "GebaeudeStock", w))));

  ziel.appendChild(verteilungsKarte("Benutzer nach Abteilung", verteilung("benutzer", "Abteilung"),
    w => springeMitFilter("benutzer", z => facetteSetzen(z, "Abteilung", w))));

  ziel.appendChild(verteilungsKarte("Benutzer nach Firma", verteilung("benutzer", "Firma"),
    w => springeMitFilter("benutzer", z => facetteSetzen(z, "Firma", w))));
}


/* ==================================================================
   6b. Software
   ================================================================== */

function zeichneSoftware() {
  const ziel = $("software-liste");
  leeren(ziel);

  const suche = zustand.software.suche.trim().toLowerCase();
  const kategorien = (programme && programme.kategorien) || [];
  let gezeigt = 0;

  /* Zählen: je Programm die Benutzer mit Stufe 1 und mit Stufe 2. */
  const zaehler = new Map();
  for (const p of programmSpalten) zaehler.set(p.i, { eins: 0, zwei: 0 });
  for (const b of benutzer) {
    for (const p of programmSpalten) {
      const s = Modell.stufe(b[p.i]);
      if (s === 0) continue;
      const e = zaehler.get(p.i);
      if (s === 1) e.eins++; else e.zwei++;
    }
  }

  const reihenfolge = kategorien.slice();
  for (const p of programmSpalten) if (reihenfolge.indexOf(p.g) === -1) reihenfolge.push(p.g);

  for (const kategorie of reihenfolge) {
    const spalten = programmSpalten.filter(function (p) {
      if (p.g !== kategorie) return false;
      if (!suche) return true;
      return p.d.toLowerCase().indexOf(suche) > -1
        || p.i.toLowerCase().indexOf(suche) > -1
        || p.adGruppen.join(" ").toLowerCase().indexOf(suche) > -1;
    });
    if (!spalten.length) continue;

    const block = el("section", "sw-kategorie");
    block.appendChild(el("h2", null, kategorie));
    const gitter = el("div", "sw-gitter");

    for (const p of spalten) {
      const e = zaehler.get(p.i) || { eins: 0, zwei: 0 };
      const karte = el("button", "sw-karte");
      karte.type = "button";
      karte.title = "Benutzer mit dieser Berechtigung anzeigen";
      karte.addEventListener("click", function () {
        springeMitFilter("benutzer", function (z) {
          z.programm = p.i;
          z.programmStufe = "";
        });
      });

      const kopf = el("div", "sw-kopf");
      const name = el("div", "sw-name", p.d);
      name.title = p.d + "  (" + p.i + ")";
      kopf.appendChild(name);

      const zahlen = el("div", "sw-zahlen");
      const z1 = el("div", "sw-zahl");
      z1.appendChild(el("b", null, e.eins));
      z1.appendChild(el("span", "t-leise", "manuell"));
      z1.title = e.eins + " Benutzer mit Stufe 1 (manuell aktiviert)";
      const z2 = el("div", "sw-zahl");
      // Grün nur, wenn es tatsächlich Berechtigungen aus dem AD gibt —
      // eine farbige Null hätte keine Aussage.
      z2.appendChild(el("b", e.zwei ? "t-erfolg" : null, e.zwei));
      z2.appendChild(el("span", "t-leise", "aus AD"));
      z2.title = e.zwei + " Benutzer mit Stufe 2 (durch AD-Gruppe)";
      anhaengen(zahlen, [z1, z2]);
      kopf.appendChild(zahlen);
      karte.appendChild(kopf);

      if (p.adGruppen.length) {
        const chips = el("div", "chips");
        for (const g of p.adGruppen) chips.appendChild(el("span", "chip chip-info", g));
        karte.appendChild(chips);
      } else {
        karte.appendChild(el("p", "hinweis", "Keine AD-Gruppe hinterlegt."));
      }

      if (p.vorschlaege && p.vorschlaege.length) {
        karte.appendChild(el("p", "sw-vorschlaege",
          "Vorschlag: " + p.vorschlaege.join(", ")));
      }

      gitter.appendChild(karte);
      gezeigt++;
    }
    block.appendChild(gitter);
    ziel.appendChild(block);
  }

  if (!gezeigt) {
    const leer = el("div", "leerzustand");
    anhaengen(leer, [
      el("p", "leer-titel", "Kein Programm gefunden"),
      el("p", "leer-text", "Die Suche «" + suche + "» passt auf keinen Eintrag "
        + "in programme.json.")
    ]);
    ziel.appendChild(leer);
  }

  $("software-anzahl").textContent = gezeigt === programmSpalten.length
    ? programmSpalten.length + " Programme"
    : gezeigt + " von " + programmSpalten.length + " Programmen";
}


/* ==================================================================
   7. Detailfenster und Rundfunkkanal
   ================================================================== */

function geraetUrl(id) {
  return "geraet.html?id=" + encodeURIComponent(id) + (mockModus ? "&mock=1" : "");
}

function benutzerUrl(id) {
  return "benutzer.html?id=" + encodeURIComponent(id) + (mockModus ? "&mock=1" : "");
}

/* Pro Datensatz genau ein Fenster: der Fenstername «geraet-<id>» bzw.
   «benutzer-<id>» holt ein bestehendes Fenster nach vorne, statt ein
   weiteres zu öffnen. */
function detailOeffnen(tab, id, neuesFenster) {
  if (id === null || id === undefined) return;
  const url = tab === "benutzer" ? benutzerUrl(id) : geraetUrl(id);
  const name = (tab === "benutzer" ? "benutzer-" : "geraet-") + id;
  window.open(url, neuesFenster ? "_blank" : name);
}

function neuesGeraetOeffnen() {
  window.open("geraet.html?neu=1" + (mockModus ? "&mock=1" : ""), "geraet-neu");
}

let hinweisZeitgeber = null;

function hinweisZeigen(text) {
  const band = $("hinweisband");
  band.textContent = text;
  band.hidden = false;
  clearTimeout(hinweisZeitgeber);
  hinweisZeitgeber = setTimeout(function () { band.hidden = true; }, 2600);
}

/* Still nachladen, ohne Filter, Sortierung oder Rollposition zu verlieren. */
let ladeLaeuft = false;

async function stillNeuLaden() {
  if (ladeLaeuft) return;
  ladeLaeuft = true;
  const rahmen = $(zustand.ansicht + "-rahmen");
  const rollen = rahmen ? rahmen.scrollTop : 0;
  try {
    await datenLaden(true);
    standAnzeigen();
    neuBerechnen("geraete");
    neuBerechnen("benutzer");
    zeichneAnsicht();
    if (rahmen) rahmen.scrollTop = rollen;
    hinweisZeigen("Liste aktualisiert");
  } catch (fehler) {
    hinweisZeigen("Die Liste konnte nicht aktualisiert werden");
  } finally {
    ladeLaeuft = false;
  }
}

/* Auf Meldungen aus den Detailfenstern hören. Fehlt BroadcastChannel im
   Browser, bleibt die Seite still: dann hilft «Neu laden». */
const MELDUNGEN = ["zeile-geaendert", "zeile-neu", "zeile-geloescht",
                   "benutzer-geaendert", "benutzer-neu", "benutzer-geloescht"];

function kanalVerbinden() {
  if (!window.BroadcastChannel) return;
  let zeitgeber = null;
  const kanal = new BroadcastChannel(KANAL_NAME);
  kanal.addEventListener("message", function (ereignis) {
    const typ = ereignis.data && ereignis.data.typ;
    if (MELDUNGEN.indexOf(typ) === -1) return;
    // Mehrere Meldungen kurz hintereinander ergeben ein einziges Nachladen.
    clearTimeout(zeitgeber);
    zeitgeber = setTimeout(stillNeuLaden, 250);
  });
}


/* ==================================================================
   Zeichnen der gewählten Ansicht
   ================================================================== */

function dichteAnwenden(tab) {
  const z = zustand[tab];
  const bereich = $("ansicht-" + tab);
  if (bereich) bereich.classList.toggle("dicht", z.dicht);
  const k = $(tab + "-knopf-dichte");
  if (!k) return;
  k.classList.toggle("aktiv", z.dicht);
  k.setAttribute("aria-pressed", z.dicht ? "true" : "false");
  k.title = z.dicht ? "Zur normalen Zeilenhöhe wechseln" : "Zu kompakten Zeilen wechseln";
}

function zeichneAnsicht() {
  for (const a of ANSICHTEN) $("ansicht-" + a).hidden = a !== zustand.ansicht;
  for (const k of document.querySelectorAll(".reiter-knopf")) {
    k.classList.toggle("aktiv", k.dataset.ansicht === zustand.ansicht);
  }

  if (zustand.ansicht === "uebersicht") zeichneUebersicht();

  for (const tab of ["geraete", "benutzer"]) {
    if (zustand.ansicht !== tab) continue;
    $(tab + "-suche").value = zustand[tab].suche;
    dichteAnwenden(tab);
    zeichneChips(tab);
    zeichneTabelle(tab);
    if (!$(tab + "-filterleiste").hidden) zeichneFilterleiste(tab);
    if (!$(tab + "-spaltenwahl").hidden) zeichneSpaltenwahl(tab);
  }
  if (zustand.ansicht !== "geraete" && zustand.ansicht !== "benutzer") panelsSchliessen();

  if (zustand.ansicht === "software") {
    $("software-suche").value = zustand.software.suche;
    zeichneSoftware();
  }
}


/* ==================================================================
   8. Start
   ================================================================== */

function standAnzeigen() {
  const letzterSync = geraete.reduce(function (max, z) {
    const d = Hilfe.datum(z.SCCM_LastSync);
    return d && (!max || d > max) ? d : max;
  }, null);
  $("stand").textContent = letzterSync
    ? "Daten Stand: " + Hilfe.datumZeitText(letzterSync) + " (" + Hilfe.relativText(letzterSync) + ")"
    : "Daten Stand: unbekannt";
}

function mockBandZeigen() {
  const band = $("mock-band");
  band.hidden = false;
  band.appendChild(document.createTextNode(
    "Vorführmodus (?mock=1): alle Personen, Geräte und Zahlen auf dieser Seite "
    + "sind erfunden. Es besteht keine Verbindung zu SharePoint."));
  band.appendChild(knopf("Vorführ-Änderungen zurücksetzen", "knopf-leise", function () {
    if (!window.confirm("Alle im Vorführmodus gemachten Änderungen verwerfen?")) return;
    Mock.zuruecksetzen();
    location.reload();
  }));
}

async function start() {
  einstellungenLaden();
  hashLesen();

  try {
    if (mockModus) {
      mockBandZeigen();
      $("konto").textContent = "Vorführmodus";
    } else {
      zeigeLaden("Anmeldung wird geprüft …");
      const konto = await Auth.anmeldungSicherstellen();
      $("konto").textContent = konto ? (konto.name || konto.adresse) : "";
      $("knopf-abmelden").hidden = false;
    }

    await datenLaden();
    standAnzeigen();
    neuBerechnen("geraete");
    neuBerechnen("benutzer");
    zeigeInhalt();
    zeichneAnsicht();
    /* Den Zustand einmal in die Adresse schreiben: so enthält der Link von
       Anfang an auch Spalten (c=) und Dichte (d=). */
    hashSchreiben();

  } catch (fehler) {
    const meldung = fehler && fehler.message ? fehler.message : String(fehler);
    zeigeFehler("Die Daten konnten nicht geladen werden", meldung,
      mockModus ? "" : "Zum Anschauen ohne Anmeldung die Seite mit ?mock=1 aufrufen.");
  }
}

/* ---------- Ereignisse ---------- */

function tabEreignisse(tab) {
  let sucheZeitgeber = null;
  $(tab + "-suche").addEventListener("input", function () {
    clearTimeout(sucheZeitgeber);
    sucheZeitgeber = setTimeout(function () {
      zustand[tab].suche = $(tab + "-suche").value;
      nachFilter(tab);
    }, 150);
  });

  $(tab + "-knopf-filter").addEventListener("click", function () {
    panelUmschalten(tab, "filter");
  });
  $(tab + "-knopf-spalten").addEventListener("click", function () {
    panelUmschalten(tab, "spalten");
  });
  $(tab + "-knopf-dichte").addEventListener("click", function () {
    zustand[tab].dicht = !zustand[tab].dicht;
    einstellungenMerken(tab);
    dichteAnwenden(tab);
    hashSchreiben();
  });
  $(tab + "-knopf-csv").addEventListener("click", function () { csvExport(tab); });

  knopfSinnbild(tab + "-knopf-filter", "filter");
  knopfSinnbild(tab + "-knopf-spalten", "spalten");
  knopfSinnbild(tab + "-knopf-dichte", "dichte");
  knopfSinnbild(tab + "-knopf-csv", "csv");
  const feld = $(tab + "-suche");
  feld.parentNode.insertBefore(sinnbild("suche"), feld);
}

/* Ein Klick neben ein offenes Panel schliesst es.

   Bewusst nur EIN Zuhörer für beide Tabellen: mit je einem pro Tab hätte
   der Zuhörer der anderen Ansicht jeden Klick INNERHALB eines offenen
   Panels als «daneben» gewertet und es sofort wieder geschlossen. */
function ausserhalbSchliessen() {
  document.addEventListener("mousedown", function (e) {
    for (const tab of ["geraete", "benutzer"]) {
      const bereich = $(tab + "-werkzeuge");
      if (bereich && bereich.contains(e.target)) return;
    }
    panelsSchliessen();
  });
}

function ereignisseVerbinden() {
  tabEreignisse("geraete");
  tabEreignisse("benutzer");
  ausserhalbSchliessen();

  const swFeld = $("software-suche");
  swFeld.parentNode.insertBefore(sinnbild("suche"), swFeld);
  let swZeitgeber = null;
  swFeld.addEventListener("input", function () {
    clearTimeout(swZeitgeber);
    swZeitgeber = setTimeout(function () {
      zustand.software.suche = swFeld.value;
      zeichneSoftware();
      hashSchreiben();
    }, 150);
  });

  knopfSinnbild("knopf-neu", "plus");
  knopfSinnbild("knopf-neuladen", "neuladen");
  knopfSinnbild("knopf-abmelden", "abmelden");
  $("knopf-neu").title = "Ein neues Gerät in einem eigenen Fenster erfassen";

  for (const k of document.querySelectorAll(".reiter-knopf")) {
    k.addEventListener("click", function () {
      zustand.ansicht = k.dataset.ansicht;
      zeichneAnsicht();
      hashSchreiben();
    });
  }

  $("knopf-neu").addEventListener("click", neuesGeraetOeffnen);

  $("knopf-neuladen").addEventListener("click", async function () {
    try {
      await datenLaden();
      standAnzeigen();
      neuBerechnen("geraete");
      neuBerechnen("benutzer");
      zeigeInhalt();
      zeichneAnsicht();
    } catch (fehler) {
      zeigeFehler("Die Daten konnten nicht neu geladen werden",
        fehler && fehler.message ? fehler.message : String(fehler), "");
    }
  });

  $("knopf-abmelden").addEventListener("click", function () { Auth.abmelden(); });
  $("knopf-nochmal").addEventListener("click", function () { location.reload(); });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { panelsSchliessen(); return; }
    if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const ziel = e.target;
      const tippt = ziel && (ziel.tagName === "INPUT" || ziel.tagName === "TEXTAREA"
                             || ziel.tagName === "SELECT" || ziel.isContentEditable);
      if (tippt) return;
      e.preventDefault();
      let tab = zustand.ansicht;
      if (tab !== "geraete" && tab !== "benutzer" && tab !== "software") {
        tab = "geraete";
        zustand.ansicht = tab;
        zeichneAnsicht();
        hashSchreiben();
      }
      const feld = $(tab + "-suche");
      if (feld) { feld.focus(); feld.select(); }
    }
  });

  window.addEventListener("hashchange", function () {
    if (location.hash === eigenerHash) { eigenerHash = null; return; }
    eigenerHash = null;
    hashLesen();
    if (!geraete.length && !benutzer.length) return;
    spaltenPruefen();
    neuBerechnen("geraete");
    neuBerechnen("benutzer");
    zeichneAnsicht();
  });

  kanalVerbinden();
}

spaltenIndexAufbauen();
ereignisseVerbinden();
start();

})();

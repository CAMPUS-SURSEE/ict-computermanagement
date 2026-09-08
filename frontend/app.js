/* app.js — Oberfläche der Hauptseite des ICT-Inventars.

   Sechs Ansichten:
     Übersicht       Kennzahlen zu beiden Client-Listen, Benutzern und
                     Telefonnummern, Ersatzplanung als Zeitstrahl, Verteilungen.
     ADMIN-Clients   Tabelle der Liste «ADMIN-Clients», mit Suche, Facetten,
                     Spaltenwahl. Diese Geräte haben einen Inhaber.
     EDU-Clients     Dieselbe Tabelle für die Liste «EDU-Clients» — Schulungs-
                     geräte, die bewusst niemandem persönlich gehören.
     Benutzer        Tabelle der Benutzer-Liste, mit Programm-Filter je Stufe.
     Telefonnummern  Tabelle der Telefonliste; nicht zugewiesene Nummern sind
                     hervorgehoben, neue Nummern werden im eigenen Fenster erfasst.
     Software        Eine Karte je Zeile der Liste «Software»; erfasst und
                     geändert wird im Softwarefenster.

   Die vier Tabellenansichten (TABELLEN) teilen sich den gesamten Code für
   Suche, Filter, Spalten, Sortierung, CSV und Adresszeile; was sich
   unterscheidet, steht in TAB. Die beiden Client-Listen unterscheiden sich
   nur in einem Punkt: bei den EDU-Clients gibt es keine Inhaberschaft.

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

/* Abgeleitete Spalten der beiden Client-Tabellen. Sie stehen nicht in
   SharePoint; modell.js rechnet sie beim Anreichern aus. */
const CLIENT_ZUSATZ = [
  { i: "__inhaberName",   d: "Inhaber", t: "Text", g: "Abgeleitet", q: "abgeleitet" },
  /* «Status» als abgeleitete Spalte, damit ein leeres Feld überall als
     «Aktiv» erscheint — filtern, sortieren und exportieren inbegriffen.
     Die rohe Spalte «Status» bleibt in der Spaltenwahl erreichbar. */
  { i: "__statusText",    d: "Status", t: "Text", g: "Abgeleitet", q: "abgeleitet" },
  { i: "__ersatzText",    d: "Ersatzstatus", t: "Text", g: "Abgeleitet", q: "abgeleitet" },
  { i: "__hatInhaber",    d: "Inhaber gesetzt", t: "Text", g: "Abgeleitet", q: "abgeleitet" }
];

/* Die Inhaber-Spalten gibt es nur bei den ADMIN-Clients: EDU-Clients gehören
   niemandem persönlich, eine Spalte «Inhaber» wäre dort immer leer. */
const INHABER_SPALTEN = ["__inhaberName", "__hatInhaber"];

const BENUTZER_ZUSATZ = [
  { i: "__hatGeraetText", d: "Gerät zugeordnet", t: "Text", g: "Abgeleitet", q: "abgeleitet" },
  { i: "__hatTelefonText", d: "Telefonnummer zugeordnet", t: "Text", g: "Abgeleitet", q: "abgeleitet" }
];

/* Abgeleitete Spalten der Telefonliste. Die Person kommt live aus der
   Benutzer-Liste (AD-Feld «Telefon»), nicht aus SharePoint. */
const TELEFON_ZUSATZ = [
  { i: "__statusText",        d: "Status",             t: "Text", g: "Abgeleitet", q: "abgeleitet" },
  { i: "__zugewiesenText",    d: "Zugewiesen",         t: "Text", g: "Abgeleitet", q: "abgeleitet" },
  { i: "__benutzerName",      d: "Person (AD)",        t: "Text", g: "Abgeleitet", q: "abgeleitet" },
  { i: "__abteilung",         d: "Abteilung (AD)",     t: "Text", g: "Abgeleitet", q: "abgeleitet" },
  { i: "__benutzerQuelleText", d: "Verknüpfung",       t: "Text", g: "Abgeleitet", q: "abgeleitet" },
  { i: "__nameAbweichungText", d: "Name weicht vom AD ab", t: "Text", g: "Abgeleitet", q: "abgeleitet" }
];

const TELEFON_QUELLE_TEXT = {
  telefon: "über AD-Telefonnummer", login: "über Spalte Benutzer", "": "keine Person"
};

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

/* Beschreibung der Tabellenansichten. Alles, was sich zwischen ihnen
   unterscheidet, steht hier — der Rest des Codes ist für alle derselbe.

   Die beiden Client-Listen sind bis auf die Inhaberschaft gleich; sie
   entstehen darum aus einer gemeinsamen Beschreibung. */
function clientTab(schluessel, titel, mitInhaber, csvName) {
  const standard = ["Title", "__statusText", "__inhaberName", "GebaeudeStock",
                    "Beschaffungsjahr", "ErsatzGeplant", "SCCM_Model",
                    "SCCM_OSVersion", "SCCM_LastActive"];
  const facetten = [
    { k: "__statusText",      d: "Status" },
    { k: "Beschaffungsjahr",  d: "Beschaffungsjahr" },
    { k: "ErsatzGeplant",     d: "Ersatz geplant" },
    { k: "__ersatzText",      d: "Ersatzstatus" },
    { k: "GebaeudeStock",     d: "Gebäude / Stock" },
    { k: "__hatInhaber",      d: "Inhaber gesetzt" },
    { k: "SCCM_Found",        d: "In SCCM" },
    { k: "SCCM_Online",       d: "Online" },
    { k: "SCCM_ClientActive", d: "Client aktiv" },
    { k: "SCCM_Manufacturer", d: "Hersteller" },
    { k: "SCCM_Model",        d: "Modell" },
    { k: "SCCM_ChassisType",  d: "Gehäusetyp" },
    { k: "SCCM_OSVersion",    d: "OS-Version" },
    { k: "SCCM_EPEnabled",    d: "Defender aktiv" }
  ];
  return {
    schluessel: schluessel,
    titel: titel,
    mitInhaber: mitInhaber,
    einheit: " " + titel,
    namensSpalte: "Title",
    standard: mitInhaber ? standard : standard.filter(k => INHABER_SPALTEN.indexOf(k) === -1),
    sortSpalte: "Title",
    facetten: mitInhaber ? facetten : facetten.filter(f => INHABER_SPALTEN.indexOf(f.k) === -1),
    zeitspalten: [
      { k: "SCCM_LastActive",      d: "Zuletzt aktiv" },
      { k: "SCCM_LastConsoleUse",  d: "Letzte Benutzeranmeldung" },
      { k: "SCCM_LastBoot",        d: "Letzter Neustart" },
      { k: "SCCM_EPSignatureDate", d: "Defender-Signatur" }
    ],
    hatSpeicher: true,
    hatProgramme: false,
    csvName: csvName
  };
}

const TAB = {
  admin: clientTab("admin", "ADMIN-Clients", true, "ADMIN-Clients"),
  edu: clientTab("edu", "EDU-Clients", false, "EDU-Clients"),
  benutzer: {
    schluessel: "benutzer",
    namensSpalte: "Anzeigename",
    standard: ["Anzeigename", "Title", "Abteilung", "Funktion", "Computer", "ADAktiviert"],
    sortSpalte: "Anzeigename",
    facetten: [
      { k: "Abteilung",        d: "Abteilung" },
      { k: "Firma",            d: "Firma" },
      { k: "Funktion",         d: "Funktion" },
      { k: "__hatGeraetText",  d: "Gerät zugeordnet" },
      { k: "__hatTelefonText", d: "Telefonnummer zugeordnet" },
      { k: "ADAktiviert",      d: "AD-Konto aktiv" }
    ],
    zeitspalten: [
      { k: "ADLetzterSync", d: "Letzter AD-Sync" }
    ],
    hatSpeicher: false,
    hatProgramme: true,
    csvName: "Benutzer",
    einheit: " Benutzer"
  },
  telefone: {
    schluessel: "telefone",
    namensSpalte: "Title",
    standard: ["Title", "Telefonnummer", "Name", "Typ", "__statusText", "__zugewiesenText",
               "__benutzerName", "__abteilung", "Apparat", "Standort"],
    sortSpalte: "Title",
    facetten: [
      { k: "__zugewiesenText",     d: "Zugewiesen" },
      { k: "__statusText",         d: "Status" },
      { k: "Typ",                  d: "Typ" },
      { k: "__abteilung",          d: "Abteilung (AD)" },
      { k: "__benutzerQuelleText", d: "Verknüpfung mit Person" },
      { k: "__nameAbweichungText", d: "Name weicht vom AD ab" },
      { k: "Apparat",              d: "Apparat" },
      { k: "Standort",             d: "Standort" }
    ],
    zeitspalten: [
      { k: "ADLetzterSync", d: "Letzter AD-Sync" }
    ],
    hatSpeicher: false,
    hatProgramme: false,
    csvName: "Telefonnummern",
    einheit: " Telefonnummern"
  }
};

/* Die vier Tabellenansichten. Alles, was «für jede Tabelle» gilt, läuft
   über diese Liste. */
const TABELLEN = ["admin", "edu", "benutzer", "telefone"];

/* Die beiden Client-Tabellen. Wo im Code «tab === "admin"» stünde, ist fast
   immer diese Frage gemeint: geht es um eine Liste von Geräten? */
const CLIENT_TABELLEN = ["admin", "edu"];

function istClientTab(tab) { return CLIENT_TABELLEN.indexOf(tab) > -1; }

/* Spaltenliste einer Ansicht. Bei den Benutzern kommen die Programmspalten
   aus der Liste «Software» dazu, die erst zur Laufzeit bekannt sind. */
function spaltenListe(tab) {
  if (tab === "benutzer") {
    return SPALTEN_BENUTZER.concat(BENUTZER_ZUSATZ, programmSpalten);
  }
  if (tab === "telefone") {
    return SPALTEN_TELEFON.concat(TELEFON_ZUSATZ);
  }
  const alle = SPALTEN_CLIENT.concat(CLIENT_ZUSATZ);
  return TAB[tab].mitInhaber ? alle : alle.filter(s => INHABER_SPALTEN.indexOf(s.i) === -1);
}

/* Nachschlagewerk interner Name → Spaltenobjekt. Wird nach dem Laden der
   Programme neu aufgebaut. */
const SPALTE = { admin: {}, edu: {}, benutzer: {}, telefone: {} };

function spaltenIndexAufbauen() {
  for (const tab of TABELLEN) {
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

const ANSICHTEN = ["uebersicht", "admin", "edu", "benutzer", "telefone", "software"];
const SPEICHER_SPALTEN = "ictinventar.spalten.";   // + Ansicht
const SPEICHER_DICHTE  = "ictinventar.dichte";     // alle Listen
const SPEICHER_ARCHIV  = "ictinventar.archiv.";    // + Client-Ansicht

/* Der Wert der Statusspalte, der ein Gerät aus der Liste nimmt. */
const ARCHIVIERT = "Archiviert";

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
    dicht: false,
    /* Nur bei den Geräten in Gebrauch: archivierte Geräte sind
       standardmässig ausgeblendet. */
    archiv: false
  };
}

const zustand = {
  ansicht: "uebersicht",
  admin: leererTabZustand("admin"),
  edu: leererTabZustand("edu"),
  benutzer: leererTabZustand("benutzer"),
  telefone: leererTabZustand("telefone"),
  software: { suche: "" }
};

let adminClients = [];     // angereicherte Zeilen der Liste «ADMIN-Clients»
let eduClients = [];       // angereicherte Zeilen der Liste «EDU-Clients»
let benutzer = [];         // angereicherte Benutzer-Zeilen
let telefone = [];         // angereicherte Zeilen der Telefonliste
let software = [];         // Zeilen der Liste «Software»
let programmSpalten = [];  // Spaltenobjekte daraus
const sichtbar = { admin: [], edu: [], benutzer: [], telefone: [] };

/* Zuletzt selbst geschriebener Hash. Damit lässt sich das eigene
   hashchange-Ereignis von einem Klick auf Vor/Zurück unterscheiden. */
let eigenerHash = null;

const mockModus = new URLSearchParams(location.search).get("mock") === "1";

/* ---------- Hash schreiben und lesen ----------

   Form: #<ansicht>?q=…&f=…&z=…&sp=…&pg=…&ps=…&s=…&c=…&d=kompakt
   «c» = sichtbare Spalten (Komma-getrennt), «d» = Dichte. Beide gelten für
   die Ansicht im Hash. Fehlen sie, gilt die im Browser gemerkte Auswahl. */

function hashSchreiben(alsVerlaufseintrag) {
  const p = new URLSearchParams();
  const a = zustand.ansicht;

  if (a === "software") {
    if (zustand.software.suche) p.set("q", zustand.software.suche);
  } else if (TABELLEN.indexOf(a) > -1) {
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
    if (istClientTab(a) && z.archiv) p.set("ar", "1");
  }

  const text = p.toString();
  const neu = "#" + a + (text ? "?" + text : "");
  if (location.hash === neu) return;
  eigenerHash = neu;

  /* Ein Ansichtswechsel (Übersicht → ADMIN-Clients) ist ein Schritt, den die
     Zurück-Taste rückgängig machen soll: pushState. Filter, Sortierung und
     Spaltenwahl ersetzen dagegen nur den aktuellen Eintrag — jede Änderung
     als Verlaufseintrag würde die Zurück-Taste unbrauchbar machen. Bewusst
     nicht location.hash: zwei Zuweisungen im selben Durchlauf verwirft der
     Browser stillschweigend. */
  const adresse = location.pathname + location.search + neu;
  if (window.history && history.replaceState) {
    if (alsVerlaufseintrag) history.pushState(null, "", adresse);
    else history.replaceState(null, "", adresse);
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
  if (TABELLEN.indexOf(a) === -1) return;

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

  /* Archivierte: steht der Parameter im Link, gewinnt er; sonst bleibt,
     was im Browser gemerkt ist. */
  if (istClientTab(a)) {
    const ar = p.get("ar");
    if (ar !== null) z.archiv = ar === "1";
  }
}

/* Gemerkte Spalten und Dichte aus dem Browser holen.

   Namen, die es nicht mehr gibt — etwa das umbenannte «__benutzerNamen» —
   räumt spaltenPruefen() weg, sobald auch die Programmspalten geladen
   sind. Hier wird darum noch nicht gefiltert. */
function einstellungenLaden() {
  for (const tab of TABELLEN) {
    try {
      const roh = localStorage.getItem(SPEICHER_SPALTEN + tab);
      if (roh) {
        const liste = JSON.parse(roh);
        if (Array.isArray(liste) && liste.length) zustand[tab].spalten = liste;
      }
      zustand[tab].dicht = localStorage.getItem(SPEICHER_DICHTE) === "kompakt";
    } catch (e) { /* Ohne Speicher gilt die Standardauswahl. */ }
  }
  /* Der Archiv-Schalter wird wie Spalten und Dichte gemerkt, je Client-
     Liste einzeln. Fehlt der Eintrag, bleibt er AUS — archivierte Geräte
     sind ausgeblendet. */
  for (const tab of CLIENT_TABELLEN) {
    try {
      zustand[tab].archiv = localStorage.getItem(SPEICHER_ARCHIV + tab) === "1";
    } catch (e) { /* Ohne Speicher bleibt es beim Standard. */ }
  }
}

function einstellungenMerken(tab) {
  try {
    localStorage.setItem(SPEICHER_SPALTEN + tab, JSON.stringify(zustand[tab].spalten));
    localStorage.setItem(SPEICHER_DICHTE, zustand[tab].dicht ? "kompakt" : "normal");
    if (istClientTab(tab)) {
      localStorage.setItem(SPEICHER_ARCHIV + tab, zustand[tab].archiv ? "1" : "0");
    }
  } catch (e) { /* Privater Modus: dann eben nur für diese Sitzung. */ }
}

/* Nach dem Laden der Programme: unbekannte Spaltennamen entfernen. */
function spaltenPruefen() {
  for (const tab of TABELLEN) {
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
  archiv:     ["M4 9h16v10H4z", "M3 5h18v4H3z", "M10 13h4"],
  plus:       ["M12 5v14", "M5 12h14"],
  abmelden:   ["M15 5H6v14h9", "M14 12h7", "M18 9l3 3-3 3"],
  schliessen: ["M6 6l12 12", "M18 6L6 18"],
  /* Übersicht: dieselben Sinnbilder wie in der Navigation, dazu ein Pfeil
     für «Liste öffnen» und ein Winkel am Ende einer Aufgabenzeile. */
  admin:      ["M4 6h16v10H4z", "M2 19h20"],
  edu:        ["M12 4L2 9l10 5 10-5z", "M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"],
  benutzer:   ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M4 20c0-3.3 3.6-5.5 8-5.5s8 2.2 8 5.5"],
  telefone:   ["M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"],
  pfeil:      ["M5 12h14", "M13 6l6 6-6 6"],
  winkel:     ["M9 6l6 6-6 6"]
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

const fortschritt = { admin: 0, edu: 0, benutzer: 0, telefone: 0, software: 0 };

function fortschrittZeigen() {
  const teile = ["ADMIN-Clients " + fortschritt.admin, "EDU-Clients " + fortschritt.edu,
                 "Benutzer " + fortschritt.benutzer,
                 "Telefonnummern " + fortschritt.telefone,
                 "Software " + fortschritt.software];
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
  for (const c of adminClients.concat(eduClients)) {
    c.__ersatzText = ERSATZ_TEXT[c.__ersatzStatus] || "unbekannt";
    c.__hatInhaber = c.__inhaber ? "Ja" : "Nein";
    // __status setzt Modell.anreichern; hier nur als Facettenwert gespiegelt.
    c.__statusText = c.__status;
  }
  for (const b of benutzer) {
    b.__hatGeraetText = b.__hatGeraet ? "Ja" : "Nein";
    b.__hatTelefonText = b.__hatTelefon ? "Ja" : "Nein";
  }
  for (const t of telefone) {
    t.__statusText = t.__status;
    t.__zugewiesenText = t.__zugewiesen ? "Ja" : "Nein";
    t.__benutzerQuelleText = TELEFON_QUELLE_TEXT[t.__benutzerQuelle] || TELEFON_QUELLE_TEXT[""];
    /* Der Name in der Liste ist Handarbeit; steht im AD eine andere Person
       hinter der Nummer, ist die Liste veraltet — ein Fall für den Sync
       oder für einen Menschen. */
    const b = t.__benutzerZeile;
    const name = String(t.Name || "").trim();
    t.__nameAbweichung = !!(b && name && Modell.schluessel(name) !== Modell.schluessel(b.Anzeigename));
    t.__nameAbweichungText = t.__nameAbweichung ? "Ja" : "Nein";
  }
}

/* «still» lädt im Hintergrund nach, ohne die Ladeanzeige einzublenden. */
async function datenLaden(still) {
  if (!still) {
    for (const k of Object.keys(fortschritt)) fortschritt[k] = 0;
    zeigeLaden("Daten werden geladen …");
    fortschrittZeigen();
  }

  const [rohAdmin, rohEdu, rohBenutzer, rohTelefone, rohSoftware] = await Promise.all([
    Daten.clients("admin", function (n) {
      fortschritt.admin = n; if (!still) fortschrittZeigen();
    }),
    listeLaden("edu", function (n) {
      fortschritt.edu = n; if (!still) fortschrittZeigen();
    }),
    Daten.benutzer(function (n) {
      fortschritt.benutzer = n; if (!still) fortschrittZeigen();
    }),
    listeLaden("telefon", function (n) {
      fortschritt.telefone = n; if (!still) fortschrittZeigen();
    }),
    listeLaden("software", function (n) {
      fortschritt.software = n; if (!still) fortschrittZeigen();
    })
  ]);

  fortschritt.admin = rohAdmin.length;
  fortschritt.edu = rohEdu.length;
  fortschritt.benutzer = rohBenutzer.length;
  fortschritt.telefone = rohTelefone.length;
  fortschritt.software = rohSoftware.length;
  if (!still) fortschrittZeigen();

  software = rohSoftware;
  programmSpalten = Modell.programmSpalten(software);
  spaltenIndexAufbauen();
  spaltenPruefen();

  const ergebnis = Modell.anreichern(rohAdmin, rohBenutzer, software);
  adminClients = ergebnis.clients;
  benutzer = ergebnis.benutzer;
  eduClients = Modell.clientsAnreichern(rohEdu).clients;
  telefone = Modell.telefoneAnreichern(rohTelefone, benutzer).telefone;
  nachbereiten();
}

/* Nachzügler-Listen: «EDU-Clients», «Telefonnummern» und «Software» sind
   jünger als der Rest. Solange in konfig.js keine Listen-ID steht oder die
   Liste in SharePoint noch fehlt, bleibt die betroffene Ansicht leer und
   sagt, was zu tun ist — die übrigen laufen ganz normal weiter. Eine
   fehlende Liste soll nie die ganze Seite lahmlegen. */
const listenHinweis = { edu: "", telefon: "", software: "" };

const LISTEN_KONFIG = {
  edu: { titel: "EDU-Clients", schluessel: "eduClientListId" },
  telefon: { titel: "Telefonnummern", schluessel: "telefonListId" },
  software: { titel: "Software", schluessel: "softwareListId" }
};

async function listeLaden(liste, fortschrittRuf) {
  const k = LISTEN_KONFIG[liste];
  listenHinweis[liste] = "";
  if (!Daten.mockModus && !KONFIG.listeBereit(liste)) {
    listenHinweis[liste] = "In konfig.js fehlt die Listen-ID der Liste «" + k.titel + "». "
      + "Die ID steht in den Listeneinstellungen in SharePoint und gehört als "
      + k.schluessel + " in konfig.js.";
    return [];
  }
  try {
    if (liste === "edu") return await Daten.clients("edu", fortschrittRuf);
    if (liste === "telefon") return await Daten.telefone(fortschrittRuf);
    return await Daten.software(fortschrittRuf);
  } catch (e) {
    listenHinweis[liste] = "Die Liste «" + k.titel + "» konnte nicht geladen werden: "
      + (e && e.message ? e.message : String(e));
    return [];
  }
}


/* ==================================================================
   5. Filtern, Sortieren, Tabellen
   ================================================================== */

function zeilenVon(tab) {
  if (tab === "benutzer") return benutzer;
  if (tab === "telefone") return telefone;
  if (tab === "edu") return eduClients;
  return adminClients;
}

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

/* Sind archivierte Geräte gerade sichtbar? Entweder weil der Schalter an
   ist, oder weil ausdrücklich nach dem Status «Archiviert» gefiltert wird —
   sonst führte dieser Filter in eine garantiert leere Liste. */
function archivSichtbar(tab) {
  const z = zustand[tab];
  if (!z || !istClientTab(tab)) return true;
  if (z.archiv) return true;
  const gewaehlt = z.facetten["__statusText"] || [];
  return gewaehlt.indexOf(ARCHIVIERT) > -1;
}

function filtern(tab) {
  const z = zustand[tab];
  const worte = z.suche.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const archivWeg = istClientTab(tab) && !archivSichtbar(tab);

  return zeilenVon(tab).filter(function (zeile) {
    if (archivWeg && zeile.__archiviert) return false;
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

function alleNeuBerechnen() {
  for (const tab of TABELLEN) neuBerechnen(tab);
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
    if (istClientTab(tab)) {
      const punkt = el("span", "punkt" + (zeile.__online ? "" : " punkt-aus"));
      punkt.title = zeile.__online ? "online" : "nicht online";
      td.appendChild(punkt);
    }
    const text = String(wert || "").trim()
      || (tab === "benutzer" ? String(zeile.Title || "(ohne Namen)")
        : (tab === "telefone" ? (zeile.__kurzwahl || "(ohne Kurzwahl)") : "(ohne Namen)"));
    const link = el("a", "name-link", text);
    link.href = detailUrl(tab, zeile.id);
    link.title = text + " — Detail öffnen";
    td.appendChild(link);
    return td;
  }

  if (s && s.q === "programm") return stufenZelle(td, wert, s);

  /* Telefonliste: Status in Textfarbe, «Zugewiesen: Nein» als Warnung, die
     Person aus dem AD als Verweis ins Benutzerfenster. */
  if (tab === "telefone") {
    if (schluessel === "__statusText" || schluessel === "Status") {
      const st = Modell.telefonStatus(schluessel === "Status" ? wert : zeile.__status);
      const klasse = Modell.telefonStatusKlasse(st);
      td.appendChild(klasse ? el("span", klasse, st) : document.createTextNode(st));
      td.title = st === "Frei" ? "Frei — sofort vergebbar"
        : (st === "Inaktiv" ? "Inaktiv — vorhanden, aber nicht in Teams" : "In Betrieb");
      return td;
    }
    /* «Zugewiesen» ist der Normalfall und bleibt schwarz; nur die nicht
       zugewiesene Nummer bekommt einen Chip (Styleguide 4.7). */
    if (schluessel === "__zugewiesenText") {
      if (zeile.__zugewiesen) {
        td.textContent = "Ja";
        td.title = "Nummer ist vergeben";
      } else {
        td.appendChild(el("span", "chip chip-warnung", "Nicht zugewiesen"));
        td.title = "Nummer ist niemandem zugewiesen";
      }
      return td;
    }
    /* Die Nummer einer nicht zugewiesenen Zeile in --warnung (styles.css). */
    if (schluessel === "Telefonnummer" && !zeile.__zugewiesen) {
      td.appendChild(el("span", "zeile-frei-wert", wert === null || wert === undefined ? "" : String(wert)));
      return td;
    }
    if (schluessel === "__nameAbweichungText") {
      td.appendChild(zeile.__nameAbweichung ? el("span", "t-warnung", "Ja") : el("span", "t-still", "Nein"));
      if (zeile.__nameAbweichung) td.title = "Liste: " + zeile.Name + " — AD: " + zeile.__benutzerName;
      return td;
    }
    if (schluessel === "__benutzerName" && zeile.__benutzerZeile) {
      const b = zeile.__benutzerZeile;
      const link = el("a", "name-link", zeile.__benutzerName);
      link.href = benutzerUrl(b.id);
      link.title = (b.Title || "") + " — Benutzer öffnen";
      td.appendChild(link);
      if (!b.__adAktiv) {
        td.appendChild(document.createTextNode(" "));
        td.appendChild(el("span", "t-gefahr", "(AD-Konto deaktiviert)"));
      }
      return td;
    }
  }

  /* Status: die Farbe sitzt auf dem Text, nie auf einer Fläche.
     «Aktiv» bleibt schwarz — der Normalfall braucht keine Auszeichnung. */
  if (istClientTab(tab) && (schluessel === "__statusText" || schluessel === "Status")) {
    const s = Modell.status(schluessel === "Status" ? wert : zeile.__status);
    const klasse = Modell.statusKlasse(s);
    td.appendChild(klasse ? el("span", klasse, s) : document.createTextNode(s));
    td.title = s === "Archiviert"
      ? "Archiviert — standardmässig ausgeblendet"
      : (s === "Lager" ? "Im Lager, niemandem zugeteilt" : "Im Einsatz");
    return td;
  }

  /* Der Inhaber ist genau eine Person; sie bekommt einen Verweis ins
     Benutzerfenster. Zeigen mehrere Personen auf denselben Client, ist das
     ein zu bereinigender Datenfehler und wird als Chip angezeigt.
     Nur die ADMIN-Clients haben Inhaber. */
  if (istClientTab(tab) && schluessel === "__inhaberName") {
    if (!zeile.__inhaber) {
      td.appendChild(el("span", "t-still", "–"));
      td.title = "Kein Inhaber gesetzt";
      return td;
    }
    const b = zeile.__inhaber;
    const link = el("a", "name-link", zeile.__inhaberName);
    link.href = benutzerUrl(b.id);
    link.title = (b.Title || "") + " — Benutzer öffnen";
    td.appendChild(link);
    if (zeile.__mehrfachInhaber) {
      td.appendChild(document.createTextNode(" "));
      const chip = el("span", "chip chip-warnung",
        "+" + (zeile.__inhaberAlle.length - 1));
      chip.title = "Mehrere Personen zeigen auf diesen Client: "
        + zeile.__inhaberAlle.map(p => p.__name).join(", ");
      td.appendChild(chip);
    }
    return td;
  }

  /* Der Verlauf steht als JSON in der Spalte; roh wäre er in einer Tabelle
     unlesbar. Gezeigt wird darum der jüngste Eintrag. */
  if (schluessel === "Verlauf") {
    const liste = Modell.verlaufLesen(wert);
    if (!liste.length) { td.appendChild(el("span", "t-still", "–")); return td; }
    const juengster = liste[0];
    td.textContent = Modell.datumSchweiz(juengster.datum) + "  " + juengster.text
      + (liste.length > 1 ? "  (+" + (liste.length - 1) + ")" : "");
    td.title = liste.map(e => Modell.datumSchweiz(e.datum) + "  " + e.text).join("\n");
    return td;
  }

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
    /* Nicht zugewiesene Telefonnummern fallen in der Liste auf: Kurzwahl
       und Nummer in --warnung, dazu der Chip in der Spalte «Zugewiesen».
       Farbe nur auf Text, nie als Fläche (Styleguide 1). */
    if (tab === "telefone" && !zeile.__zugewiesen) {
      tr.className = "zeile-frei";
      tr.title = "Nicht zugewiesen";
    }
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

  /* Bezugsgrösse ist, was ohne Filter zu sehen wäre: sind die archivierten
     ausgeblendet, gehören sie nicht in den Nenner — sonst stünde dort
     dauerhaft «x von y», ohne dass jemand einen Filter gesetzt hätte. */
  const grundmenge = istClientTab(tab) && !archivSichtbar(tab)
    ? zeilenVon(tab).filter(z => !z.__archiviert) : zeilenVon(tab);
  const alle = grundmenge.length;
  $(tab + "-leer").hidden = sichtbar[tab].length > 0;
  $(tab + "-tabelle").hidden = sichtbar[tab].length === 0;
  $(tab + "-anzahl").textContent = sichtbar[tab].length === alle
    ? alle + TAB[tab].einheit
    : sichtbar[tab].length + " von " + alle;

  /* Fehlt eine der jüngeren Listen noch, sagt die leere Tabelle, was zu
     tun ist — statt bloss «keine Treffer». */
  if (tab === "edu") {
    $("edu-leer").textContent = listenHinweis.edu && !eduClients.length
      ? listenHinweis.edu : "Kein EDU-Client passt zu den aktuellen Filtern.";
  }
  if (tab === "telefone") {
    $("telefone-leer").textContent = listenHinweis.telefon && !telefone.length
      ? listenHinweis.telefon : "Keine Telefonnummer passt zu den aktuellen Filtern.";
  }
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

  /* Der Archiv-Schalter ist kein gewöhnlicher Filter — er nimmt einen
     Filter WEG. Als Chip steht er trotzdem hier, damit sichtbar ist,
     warum plötzlich mehr Geräte in der Liste stehen. Er zählt nicht in
     «anzahl» mit: «Alle Filter entfernen» soll ihn nicht umlegen. */
  if (istClientTab(tab) && z.archiv) {
    const c = el("button", "chip");
    c.type = "button";
    c.appendChild(document.createTextNode("Archivierte eingeblendet"));
    c.appendChild(el("span", "x", "×"));
    c.title = "Archivierte Geräte wieder ausblenden";
    c.addEventListener("click", function () {
      z.archiv = false;
      einstellungenMerken(tab);
      archivAnwenden(tab);
      nachFilter(tab);
    });
    ziel.appendChild(c);
  }

  if (anzahl > 0) {
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
  for (const tab of TABELLEN) {
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

/* Zählt die Werte einer Spalte und liefert die häufigsten zuerst.

   Solange archivierte Geräte ausgeblendet sind, zählen sie auch hier nicht
   mit — sonst verspräche die Facette Zeilen, die die Liste gar nicht zeigt.
   Einzige Ausnahme ist die Statusfacette selbst: ohne sie liesse sich
   «Archiviert» nie anwählen. */
function verteilung(tab, schluessel) {
  const archivWeg = istClientTab(tab) && schluessel !== "__statusText"
    && !archivSichtbar(tab);
  const zaehler = new Map();
  for (const z of zeilenVon(tab)) {
    if (archivWeg && z.__archiviert) continue;
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

  /* Archivierte Geräte sind standardmässig ausgeblendet. Der Schalter
     steht hier bei den Filtern — er nimmt einen Filter weg. */
  if (istClientTab(tab)) {
    const archivierte = zaehle(zeilenVon(tab), g => g.__archiviert);
    const zeileArchiv = el("label", "panel-schalter");
    const box = el("input");
    box.type = "checkbox";
    box.checked = z.archiv;
    box.addEventListener("change", function () {
      z.archiv = box.checked;
      einstellungenMerken(tab);
      nachFilter(tab);
    });
    zeileArchiv.appendChild(box);
    zeileArchiv.appendChild(document.createTextNode("Archivierte Geräte anzeigen "));
    zeileArchiv.appendChild(el("span", "zahl", "(" + archivierte + ")"));
    koerper.appendChild(zeileArchiv);
  }

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
    const auswahl = el("select", "feld-eingabe");
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
    const wahl = el("select", "feld-eingabe");
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

    const wahl = el("select", "feld-eingabe");
    wahl.appendChild(new Option("kein Programmfilter", ""));
    for (const p of programmSpalten.slice().sort((a, b) => Hilfe.vergleiche(a.d, b.d))) {
      wahl.appendChild(new Option(p.d, p.i));
    }
    wahl.value = z.programm;

    const stufenWahl = el("select", "feld-eingabe");
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
  /* «Alle Filter entfernen» steht als Chip in der Filterzeile — sichtbar,
     ohne das Panel zu öffnen. Hier nicht noch einmal. */
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

  /* Zeilenhöhe: gilt für alle drei Listen, gemerkt im Browser. */
  const dichte = el("label", "panel-schalter");
  const box = el("input");
  box.type = "checkbox";
  box.checked = z.dicht;
  box.addEventListener("change", function () { dichteSetzen(box.checked); });
  dichte.appendChild(box);
  dichte.appendChild(document.createTextNode("Kompakte Zeilen (alle Listen)"));
  koerper.appendChild(dichte);
  ziel.appendChild(koerper);
}

/* ---------- CSV ---------- */

function csvWert(tab, zeile, schluessel) {
  const s = spalte(tab, schluessel);
  const wert = zeile[schluessel];
  if (s && s.q === "programm") return String(Modell.stufe(wert));
  // Status leer heisst «Aktiv» — das gehört auch so in den Export.
  if (istClientTab(tab) && (schluessel === "Status" || schluessel === "__statusText")) {
    return Modell.status(schluessel === "Status" ? wert : zeile.__status);
  }
  // Der Verlauf als Klartext, ein Eintrag je Abschnitt.
  if (schluessel === "Verlauf") {
    return Modell.verlaufLesen(wert)
      .map(e => Modell.datumSchweiz(e.datum) + " " + e.text).join(" / ");
  }
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
  const gewechselt = zustand.ansicht !== tab;
  zustand.ansicht = tab;
  panelsSchliessen();
  neuBerechnen(tab);
  zeichneAnsicht();
  hashSchreiben(gewechselt);
  const rahmen = $(tab + "-rahmen");
  if (rahmen) rahmen.scrollTop = 0;
}

function facetteSetzen(z, schluessel, wert) { z.facetten[schluessel] = [wert]; }


/* ==================================================================
   6a. Übersicht
   ================================================================== */

/* Eine Kennzahl ist ein Fünfer: [Wert, Text, Ton, Unterzeile, Aktion].
   Der Ton färbt die Zahl (erfolg, warnung, gefahr); ohne Ton bleibt sie
   schwarz, eine Null grau. Die Aktion öffnet die passende Liste gefiltert. */

function zaehle(liste, pruefung) {
  let n = 0;
  for (const z of liste) if (pruefung(z)) n++;
  return n;
}

/* Die Clients, die für Kennzahlen und Planung zählen: alles ausser den
   archivierten. Ein ausgemustertes Gerät verzerrt sonst jede Zahl — es ist
   weder online noch ersatzbedürftig, steht aber im Nenner. Die archivierten
   bekommen dafür eine eigene Zeile. */
function aktiveClients(tab) {
  return zeilenVon(tab).filter(z => !z.__archiviert);
}

/* Offen ist eine Kennzahl, wenn sie einen Warn- oder Gefahrenton trägt und
   grösser als null ist. Sie erscheint dann zusätzlich unter «Handlungs-
   bedarf»; in ihrer Bestandskarte bleibt sie trotzdem stehen, damit jede
   Karte immer dieselben Zeilen zeigt, ganz gleich, wie die Daten stehen. */
function istOffen(w, ton) {
  return Boolean(ton) && ton !== "erfolg" && w > 0;
}

const TON_RANG = { gefahr: 0, warnung: 1 };

/* Die gesammelten offenen Punkte aller Listen; zeichneUebersicht leert
   die Liste, die Bestandskarten füllen sie, am Ende wird sie gezeichnet. */
let offenePunkte = [];

function offenMerken(herkunft, liste) {
  for (const [w, t, ton, unter, aktion] of liste) {
    if (istOffen(w, ton)) offenePunkte.push({ w, t, ton, herkunft, unter, aktion });
  }
}

/* Eine Zeile unter «Handlungsbedarf»: Zahl als getönte Marke, daneben der
   Text mit Herkunft, rechts ein Winkel, wenn ein Klick in die Liste führt. */
function aufgabeZeile(p) {
  const z = el(p.aktion ? "button" : "div", "aufgabe ton-" + p.ton);
  if (p.aktion) {
    z.type = "button";
    z.title = "In der Liste anzeigen";
    z.addEventListener("click", p.aktion);
  }
  const text = el("span", "aufgabe-text");
  anhaengen(text, [
    el("span", "aufgabe-titel", p.t),
    el("span", "aufgabe-unter", p.unter ? p.herkunft + " · " + p.unter : p.herkunft)
  ]);
  anhaengen(z, [el("span", "aufgabe-zahl", p.w), text, p.aktion ? sinnbild("winkel") : null]);
  return z;
}

function zeichneHandlungsbedarf() {
  const ziel = $("kacheln-handlungsbedarf");
  leeren(ziel);
  /* Gefahr vor Warnung, sonst in der Reihenfolge der Listen; sort ist
     stabil, darum bleibt die Reihenfolge innerhalb eines Tons erhalten. */
  offenePunkte.sort((a, b) => (TON_RANG[a.ton] ?? 9) - (TON_RANG[b.ton] ?? 9));
  for (const p of offenePunkte) ziel.appendChild(aufgabeZeile(p));

  const n = offenePunkte.length;
  const zaehler = $("handlungsbedarf-anzahl");
  zaehler.textContent = n === 1 ? "1 offener Punkt" : n + " offene Punkte";
  zaehler.hidden = n === 0;
  $("handlungsbedarf-leer").hidden = n > 0;
  ziel.hidden = n === 0;
}

/* Eine Bestandskarte: Kopf mit Sinnbild, Titel und Sprung in die Liste;
   darunter die erste Kennzahl gross, die übrigen als Zeilen. */
function bestandKarte(tab, liste, hinweis) {
  const ziel = $("bestand-" + tab);
  leeren(ziel);

  const kopf = el("div", "bestand-kopf");
  const oeffnen = el("button", "knopf knopf-still knopf-sinnbild");
  oeffnen.type = "button";
  oeffnen.title = ANSICHT_TITEL[tab] + " öffnen";
  oeffnen.setAttribute("aria-label", ANSICHT_TITEL[tab] + " öffnen");
  oeffnen.appendChild(sinnbild("pfeil"));
  oeffnen.addEventListener("click", () => springeMitFilter(tab, function () { }));
  anhaengen(kopf, [sinnbild(tab), el("h2", "bestand-titel", ANSICHT_TITEL[tab]), oeffnen]);
  ziel.appendChild(kopf);

  const [haupt, ...rest] = liste;
  const h = el(haupt[4] ? "button" : "div", "bestand-haupt");
  if (haupt[4]) {
    h.type = "button";
    h.title = "In der Liste anzeigen";
    h.addEventListener("click", haupt[4]);
  }
  anhaengen(h, [
    el("span", "bestand-wert" + (haupt[0] ? "" : " leer"), haupt[0]),
    el("span", "bestand-text", haupt[1]),
    el("span", "bestand-unter", haupt[3] || "")
  ]);
  ziel.appendChild(h);

  const zeilen = el("div", "bestand-liste");
  for (const [w, t, ton, unter, aktion] of rest) {
    const z = el(aktion ? "button" : "div", "bestand-zeile");
    if (aktion) {
      z.type = "button";
      z.addEventListener("click", aktion);
    }
    /* Die Unterzeile steht hier nur im Tooltip; in der Zeile wäre sie
       abgeschnitten. Unter «Handlungsbedarf» steht sie ausgeschrieben. */
    const text = el("span", "bestand-zeile-text", t);
    if (unter) z.title = t + " — " + unter;
    const zahl = el("span", "bestand-zahl" + (w ? (ton ? " t-" + ton : "") : " leer"), w);
    anhaengen(z, [text, zahl]);
    zeilen.appendChild(z);
  }
  ziel.appendChild(zeilen);

  if (hinweis) ziel.appendChild(el("p", "bestand-hinweis hinweis", hinweis));
  offenMerken(ANSICHT_TITEL[tab], liste);
}

/* Die Kennzahlen einer Client-Liste. Beide Listen bekommen denselben Satz;
   «ohne Inhaber» fällt bei den EDU-Clients weg, weil es dort bewusst keine
   Inhaberschaft gibt. */
function clientKacheln(tab) {
  const alleZeilen = zeilenVon(tab);
  const imEinsatz = aktiveClients(tab);
  const archiviert = alleZeilen.length - imEinsatz.length;
  const online = zaehle(imEinsatz, z => z.__online);
  const ohneSccm = zaehle(imEinsatz, z => !z.__inSccm);
  const ueberfaellig = zaehle(imEinsatz, z => z.__ersatzStatus === "ueberfaellig");
  const ohneJahr = zaehle(imEinsatz, z => !String(z.Beschaffungsjahr || "").trim());

  /* Ein Sprung in die Liste mit einer Facette blendet die archivierten
     weiter aus — genau wie die Zahl sie nicht mitzählt. */
  const kacheln = [
    [imEinsatz.length, "im Einsatz", null,
      archiviert ? "ohne " + archiviert + " archivierte" : "keine archivierten",
      () => springeMitFilter(tab, function () { })],
    [online, "gerade online", online ? "erfolg" : null, null,
      () => springeMitFilter(tab, z => facetteSetzen(z, "SCCM_Online", "Ja"))],
    [ohneSccm, "nicht in SCCM", ohneSccm ? "warnung" : null, null,
      () => springeMitFilter(tab, z => facetteSetzen(z, "SCCM_Found", "Nein"))],
    [ueberfaellig, "Ersatz überfällig", ueberfaellig ? "gefahr" : null,
      "geplant vor " + Modell.gjAktuell(),
      () => springeMitFilter(tab, z => facetteSetzen(z, "__ersatzText", ERSATZ_TEXT.ueberfaellig))],
    [ohneJahr, "ohne Beschaffungsjahr", ohneJahr ? "warnung" : null, null,
      () => springeMitFilter(tab, z => facetteSetzen(z, "__ersatzText", ERSATZ_TEXT.unbekannt))]
  ];
  if (TAB[tab].mitInhaber) {
    const ohneInhaber = zaehle(imEinsatz, z => !z.__inhaber);
    kacheln.push([ohneInhaber, "ohne Inhaber", ohneInhaber ? "warnung" : null, null,
      () => springeMitFilter(tab, z => facetteSetzen(z, "__hatInhaber", "Nein"))]);
  }
  kacheln.push([archiviert, "archiviert", null, "ausgeblendet",
    () => springeMitFilter(tab, z => facetteSetzen(z, "__statusText", ARCHIVIERT))]);

  /* Fehlt die EDU-Liste noch, steht hier statt lauter Nullen der Weg dahin. */
  const hinweis = tab === "edu" && listenHinweis.edu && !alleZeilen.length ? listenHinweis.edu : null;
  bestandKarte(tab, kacheln, hinweis);
}

function zeichneUebersicht() {
  offenePunkte = [];

  /* ---- Kennzahlen der beiden Client-Listen ---- */
  clientKacheln("admin");
  clientKacheln("edu");

  /* ---- Kennzahlen Benutzer ---- */
  const ohneGeraet = zaehle(benutzer, b => !b.__hatGeraet);
  const inaktiv = zaehle(benutzer, b => !b.__adAktiv);
  const abweichung = zaehle(benutzer, b => b.__primaerAbweichung);
  const ohneTelefon = zaehle(benutzer, b => b.__adAktiv && !b.__hatTelefon);

  bestandKarte("benutzer", [
    [benutzer.length, "Benutzer gesamt", null, null,
      () => springeMitFilter("benutzer", function () { })],
    [ohneGeraet, "ohne Gerät", null, null,
      () => springeMitFilter("benutzer", z => facetteSetzen(z, "__hatGeraetText", "Nein"))],
    [ohneTelefon, "ohne Telefonnummer", null, "aktive AD-Konten",
      () => springeMitFilter("benutzer", function (z) {
        facetteSetzen(z, "__hatTelefonText", "Nein");
        facetteSetzen(z, "ADAktiviert", "Ja");
      })],
    [inaktiv, "AD-Konto deaktiviert", inaktiv ? "gefahr" : null, null,
      () => springeMitFilter("benutzer", z => facetteSetzen(z, "ADAktiviert", "Nein"))],
    [abweichung, "Primärgerät weicht ab", abweichung ? "warnung" : null,
      "SCCM-Primärgerät ≠ ADMIN-Client", null]
  ], null);

  /* ---- Kennzahlen Telefonnummern ---- */
  const zugewiesen = zaehle(telefone, t => t.__zugewiesen);
  const nichtZugewiesen = telefone.length - zugewiesen;
  const frei = zaehle(telefone, t => t.__status === "Frei");
  const inaktivT = zaehle(telefone, t => t.__status === "Inaktiv");
  const nameWeicht = zaehle(telefone, t => t.__nameAbweichung);

  /* «zugewiesen» ist der Normalfall und bleibt schwarz. */
  bestandKarte("telefone", [
    [telefone.length, "Telefonnummern", null, null,
      () => springeMitFilter("telefone", function () { })],
    [zugewiesen, "zugewiesen", null, null,
      () => springeMitFilter("telefone", z => facetteSetzen(z, "__zugewiesenText", "Ja"))],
    [frei, "frei", null, "sofort vergebbar",
      () => springeMitFilter("telefone", z => facetteSetzen(z, "__statusText", "Frei"))],
    [inaktivT, "inaktiv", null, "nicht in Teams",
      () => springeMitFilter("telefone", z => facetteSetzen(z, "__statusText", "Inaktiv"))],
    [nichtZugewiesen, "nicht zugewiesen", nichtZugewiesen ? "warnung" : null, null,
      () => springeMitFilter("telefone", z => facetteSetzen(z, "__zugewiesenText", "Nein"))],
    [nameWeicht, "Name weicht vom AD ab", nameWeicht ? "warnung" : null,
      "Liste und AD nennen verschiedene Personen",
      () => springeMitFilter("telefone", z => facetteSetzen(z, "__nameAbweichungText", "Ja"))]
  ], listenHinweis.telefon && !telefone.length ? listenHinweis.telefon : null);

  zeichneHandlungsbedarf();

  for (const tab of CLIENT_TABELLEN) zeichneZeitstrahl(tab);
  zeichneZeitstrahlLegende();
  zeichneVerteilungen();
}

/* ---------- Ersatzplanung als Zeitstrahl ---------- */

/* Je Client-Liste ein Zeitstrahl. Zwei Listen in einer Achse wären zwar
   kompakter, aber ein Klick auf eine Säule müsste dann in zwei Tabellen
   zugleich springen — darum lieber zwei ehrliche Achsen. */
function zeichneZeitstrahl(tab) {
  const ziel = $("zeitstrahl-" + tab);
  leeren(ziel);

  /* Geplant wird nur für Clients, die im Einsatz sind: ein archiviertes
     Gerät braucht keinen Ersatz mehr. */
  const planbar = aktiveClients(tab);

  const heute = Modell.gjAktuell();
  let von = heute, bis = heute;
  for (const g of planbar) {
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
  for (const g of planbar) {
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
          springeMitFilter(tab, z => facetteSetzen(z, schluessel, jahr));
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
}

/* Beide Achsen teilen sich eine Legende unter der Karte. */
function zeichneZeitstrahlLegende() {
  const legende = $("zeitstrahl-legende");
  leeren(legende);
  anhaengen(legende, [
    el("span", "zeitstrahl-marke", "beschafft (linke Säule)"),
    el("span", "zeitstrahl-marke warnung", "Ersatz geplant (rechte Säule)"),
    el("span", "zeitstrahl-marke gefahr", "Ersatz überfällig"),
    el("span", null, "Laufendes Geschäftsjahr: " + Modell.gjAktuell()),
    el("span", null, "Ohne archivierte Geräte")
  ]);
}

/* ---------- Verteilungen ---------- */

/* Mehr als acht Zeilen macht eine Verteilungskarte nicht lesbarer; der
   Rest steht als Summe darunter. */
const VERTEILUNG_ZEILEN = 8;

function verteilungsKarte(titel, eintraege, beiKlick) {
  const karte = el("div", "karte");
  const kopf = el("div", "karte-kopf");
  const h = el("h3", "karte-titel", titel);
  h.title = titel;
  kopf.appendChild(h);
  karte.appendChild(kopf);

  const block = el("div", "karte-inhalt");
  karte.appendChild(block);

  if (!eintraege.length) {
    block.appendChild(el("p", "hinweis", "Keine Werte vorhanden."));
    return karte;
  }

  const groesste = eintraege[0][1];
  for (const [name, anzahl] of eintraege.slice(0, VERTEILUNG_ZEILEN)) {
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

  if (eintraege.length > VERTEILUNG_ZEILEN) {
    const rest = eintraege.slice(VERTEILUNG_ZEILEN).reduce((s, e) => s + e[1], 0);
    block.appendChild(el("p", "hinweis",
      "und " + (eintraege.length - VERTEILUNG_ZEILEN) + " weitere Werte mit zusammen " + rest + " Zeilen"));
  }
  return karte;
}

function zeichneVerteilungen() {
  const ziel = $("verteilungen");
  leeren(ziel);

  function karteFuer(tab, spaltenName, titel) {
    return verteilungsKarte(TAB[tab].titel + " nach " + titel,
      verteilung(tab, spaltenName),
      w => springeMitFilter(tab, z => facetteSetzen(z, spaltenName, w)));
  }

  ziel.appendChild(karteFuer("admin", "SCCM_Model", "Modell"));
  ziel.appendChild(karteFuer("admin", "SCCM_OSVersion", "OS-Version"));
  ziel.appendChild(karteFuer("edu", "SCCM_Model", "Modell"));
  ziel.appendChild(karteFuer("edu", "SCCM_OSVersion", "OS-Version"));
  ziel.appendChild(karteFuer("admin", "GebaeudeStock", "Gebäude / Stock"));

  ziel.appendChild(verteilungsKarte("Benutzer nach Abteilung", verteilung("benutzer", "Abteilung"),
    w => springeMitFilter("benutzer", z => facetteSetzen(z, "Abteilung", w))));
}


/* ==================================================================
   6b. Software
   ================================================================== */

function zeichneSoftware() {
  const ziel = $("software-liste");
  leeren(ziel);

  const suche = zustand.software.suche.trim().toLowerCase();
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

  /* Fehlt die Liste «Software» noch, sagt die Ansicht, was zu tun ist —
     ohne sie gibt es weder Programme noch Berechtigungen. */
  if (listenHinweis.software && !software.length) {
    const leer = el("div", "leerzustand");
    anhaengen(leer, [
      el("p", "leer-titel", "Die Liste «Software» fehlt"),
      el("p", "leer-text", listenHinweis.software)
    ]);
    ziel.appendChild(leer);
    $("software-anzahl").textContent = "";
    return;
  }

  for (const kategorie of Modell.programmKategorien(programmSpalten)) {
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

      /* Die Karte ist keine Schaltfläche mehr, sondern trägt zwei: den
         Namen (öffnet das Softwarefenster zum Bearbeiten) und die Zahlen
         (zeigen die berechtigten Benutzer). Eine Schaltfläche in einer
         Schaltfläche wäre ungültiges HTML. */
      const karte = el("div", "sw-karte");

      const kopf = el("div", "sw-kopf");
      const name = el("a", "sw-name name-link", p.d);
      name.href = softwareUrl(p.zeilenId);
      name.title = p.d + "  (" + p.i + ") — Programm bearbeiten";
      kopf.appendChild(name);

      const zahlen = el("button", "sw-zahlen");
      zahlen.type = "button";
      zahlen.title = "Benutzer mit dieser Berechtigung anzeigen";
      zahlen.addEventListener("click", function () {
        springeMitFilter("benutzer", function (z) {
          z.programm = p.i;
          z.programmStufe = "";
        });
      });
      const z1 = el("span", "sw-zahl");
      z1.appendChild(el("b", null, e.eins));
      z1.appendChild(el("span", "t-leise", "manuell"));
      const z2 = el("span", "sw-zahl");
      // Grün nur, wenn es tatsächlich Berechtigungen aus dem AD gibt —
      // eine farbige Null hätte keine Aussage.
      z2.appendChild(el("b", e.zwei ? "t-erfolg" : null, e.zwei));
      z2.appendChild(el("span", "t-leise", "aus AD"));
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

      if (p.bemerkung) karte.appendChild(el("p", "sw-bemerkung", p.bemerkung));

      gitter.appendChild(karte);
      gezeigt++;
    }
    block.appendChild(gitter);
    ziel.appendChild(block);
  }

  if (!gezeigt) {
    const leer = el("div", "leerzustand");
    anhaengen(leer, [
      el("p", "leer-titel", programmSpalten.length ? "Kein Programm gefunden" : "Noch kein Programm erfasst"),
      el("p", "leer-text", programmSpalten.length
        ? "Die Suche «" + suche + "» passt auf keinen Eintrag in der Liste «Software»."
        : "Mit «Neue Software» das erste Programm erfassen.")
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

/* Das Clientfenster bedient beide Listen; welche gemeint ist, steht als
   «liste» in der Adresse. Ohne den Parameter würde eine Listen-ID aus der
   einen Liste in der anderen gesucht — und dort nicht gefunden. */
function clientUrl(tab, id) {
  return "client.html?liste=" + encodeURIComponent(tab)
    + "&id=" + encodeURIComponent(id) + (mockModus ? "&mock=1" : "");
}

function benutzerUrl(id) {
  return "benutzer.html?id=" + encodeURIComponent(id) + (mockModus ? "&mock=1" : "");
}

function telefonUrl(id) {
  return "telefon.html?id=" + encodeURIComponent(id) + (mockModus ? "&mock=1" : "");
}

function softwareUrl(id) {
  return "software.html?id=" + encodeURIComponent(id) + (mockModus ? "&mock=1" : "");
}

function detailUrl(tab, id) {
  if (tab === "benutzer") return benutzerUrl(id);
  if (tab === "telefone") return telefonUrl(id);
  return clientUrl(tab, id);
}

/* Detailseiten öffnen im selben Tab; die Zurück-Taste führt zur Liste mit
   allen Filtern, weil der Zustand im Hash steht. Wer mehrere Datensätze
   nebeneinander braucht, nimmt Ctrl-Klick, Shift-Klick oder die mittlere
   Maustaste — dann ein neuer Tab. */
function detailOeffnen(tab, id, neuerTab) {
  if (id === null || id === undefined) return;
  if (neuerTab) window.open(detailUrl(tab, id), "_blank");
  else location.href = detailUrl(tab, id);
}

function neuenClientOeffnen(tab) {
  location.href = "client.html?liste=" + encodeURIComponent(tab) + "&neu=1"
    + (mockModus ? "&mock=1" : "");
}

function neueTelefonnummerOeffnen() {
  location.href = "telefon.html?neu=1" + (mockModus ? "&mock=1" : "");
}

function neueSoftwareOeffnen() {
  location.href = "software.html?neu=1" + (mockModus ? "&mock=1" : "");
}

let hinweisZeitgeber = null;

function hinweisZeigen(text) {
  const band = $("hinweisband");
  band.textContent = text;
  band.hidden = false;
  clearTimeout(hinweisZeitgeber);
  hinweisZeitgeber = setTimeout(function () { band.hidden = true; }, 2600);
}

/* Still nachladen, ohne Filter, Sortierung oder Rollposition zu verlieren.

   «leise» ist der automatische Takt: Er meldet weder Erfolg noch Misserfolg,
   weil niemand danach gefragt hat. Ein Nachladen, das eine Änderung aus
   einem Detailfenster einsammelt, sagt dagegen kurz Bescheid. */
let ladeLaeuft = false;
let letzteAktualisierung = Date.now();

async function stillNeuLaden(leise) {
  if (ladeLaeuft) return;
  ladeLaeuft = true;
  const rahmen = $(zustand.ansicht + "-rahmen");
  const rollen = rahmen ? rahmen.scrollTop : 0;
  try {
    await datenLaden(true);
    standAnzeigen();
    alleNeuBerechnen();
    zeichneAnsicht();
    if (rahmen) rahmen.scrollTop = rollen;
    if (!leise) hinweisZeigen("Liste aktualisiert");
  } catch (fehler) {
    /* Beim automatischen Takt bleibt der bisherige Stand einfach stehen:
       eine kurze Störung soll die Liste nicht mit Meldungen zupflastern.
       Der nächste Takt versucht es wieder. */
    if (!leise) hinweisZeigen("Die Liste konnte nicht aktualisiert werden");
  } finally {
    ladeLaeuft = false;
    letzteAktualisierung = Date.now();
  }
}

/* Der automatische Takt ersetzt den früheren Knopf «Neu laden». Geprüft wird
   oft, nachgeladen selten: nur wenn das Fenster sichtbar ist und der Takt
   abgelaufen ist. In einem Hintergrund-Tab wird gar nicht geholt — dafür
   sofort, sobald er wieder nach vorne kommt und die Daten alt sind. */
function autoNachladenPruefen() {
  if (document.hidden) return;
  if ($("reiter").hidden) return;   // noch am Laden oder im Fehlerbild
  if (Date.now() - letzteAktualisierung < KONFIG.autoTaktMs) return;
  stillNeuLaden(true);
}

function autoNachladenStarten() {
  letzteAktualisierung = Date.now();
  setInterval(autoNachladenPruefen, KONFIG.autoPruefTaktMs);
  document.addEventListener("visibilitychange", autoNachladenPruefen);
}

/* Auf Meldungen aus den Detailfenstern hören. Fehlt BroadcastChannel im
   Browser, bleibt die Seite still: dann holt sie die Änderung erst mit dem
   nächsten automatischen Takt. */
const MELDUNGEN = ["zeile-geaendert", "zeile-neu", "zeile-geloescht",
                   "benutzer-geaendert", "benutzer-neu", "benutzer-geloescht",
                   "telefon-geaendert", "telefon-neu", "telefon-geloescht",
                   "software-geaendert", "software-neu", "software-geloescht"];

function kanalVerbinden() {
  if (!window.BroadcastChannel) return;
  let zeitgeber = null;
  const kanal = new BroadcastChannel(KONFIG.kanalName);
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

/* Der Archiv-Schalter sitzt im Filter-Panel; hier ist nichts mehr
   nachzuführen ausser dem Panel selbst, wenn es offen ist. */
function archivAnwenden(tab) {
  if (!$(tab + "-filterleiste").hidden) zeichneFilterleiste(tab);
}

/* «Kompakt» gilt für alle Listen gleich und sitzt im Spalten-Panel. */
function dichteAnwenden(tab) {
  const z = zustand[tab];
  const bereich = $("ansicht-" + tab);
  if (bereich) bereich.classList.toggle("dicht", z.dicht);
}

function dichteSetzen(kompakt) {
  for (const t of TABELLEN) {
    zustand[t].dicht = kompakt;
    dichteAnwenden(t);
  }
  einstellungenMerken(zustand.ansicht);
  hashSchreiben();
}

/* Auf eine andere Ansicht umschalten und den Hash nachführen.

   Solange die Seite noch lädt oder einen Fehler zeigt (die Reiter sind dann
   ausgeblendet), wird nur der Zustand gemerkt — sonst stünde die leere
   Ansicht über der Lade- oder Fehlermeldung. */
function ansichtWechseln(name) {
  if (ANSICHTEN.indexOf(name) === -1) return;
  const gewechselt = zustand.ansicht !== name;
  zustand.ansicht = name;
  if (!$("reiter").hidden) zeichneAnsicht();
  hashSchreiben(gewechselt);
}

/* Tab-Titel und Reiter-Beschriftung je Ansicht. */
const ANSICHT_TITEL = {
  uebersicht: "Übersicht", admin: "ADMIN-Clients", edu: "EDU-Clients",
  benutzer: "Benutzer", telefone: "Telefonnummern", software: "Software"
};

function zeichneAnsicht() {
  for (const a of ANSICHTEN) $("ansicht-" + a).hidden = a !== zustand.ansicht;
  for (const k of document.querySelectorAll(".reiter-knopf")) {
    const aktiv = k.dataset.ansicht === zustand.ansicht;
    k.classList.toggle("aktiv", aktiv);
    if (aktiv) k.setAttribute("aria-current", "page"); else k.removeAttribute("aria-current");
  }
  document.title = (ANSICHT_TITEL[zustand.ansicht] || "Übersicht") + " — ICT-Inventar";

  if (zustand.ansicht === "uebersicht") zeichneUebersicht();

  for (const tab of TABELLEN) {
    if (zustand.ansicht !== tab) continue;
    $(tab + "-suche").value = zustand[tab].suche;
    dichteAnwenden(tab);
    if (istClientTab(tab)) archivAnwenden(tab);
    zeichneChips(tab);
    zeichneTabelle(tab);
    if (!$(tab + "-filterleiste").hidden) zeichneFilterleiste(tab);
    if (!$(tab + "-spaltenwahl").hidden) zeichneSpaltenwahl(tab);
  }
  if (TABELLEN.indexOf(zustand.ansicht) === -1) panelsSchliessen();

  if (zustand.ansicht === "software") {
    $("software-suche").value = zustand.software.suche;
    zeichneSoftware();
  }
}


/* ==================================================================
   8. Start
   ================================================================== */

function standAnzeigen() {
  const letzterSync = adminClients.concat(eduClients).reduce(function (max, z) {
    const d = Hilfe.datum(z.SCCM_LastSync);
    return d && (!max || d > max) ? d : max;
  }, null);
  const text = letzterSync
    ? "Daten Stand: " + Hilfe.datumZeitText(letzterSync) + " (" + Hilfe.relativText(letzterSync) + ")"
    : "Daten Stand: unbekannt";
  $("stand").textContent = text;
  $("stand").title = text
    + " — die Liste lädt sich alle "
    + Math.round(KONFIG.autoTaktMs / 60000) + " Minuten selbst nach";
}

function mockBandZeigen() {
  const band = $("mock-band");
  band.hidden = false;
  band.appendChild(document.createTextNode(
    "Vorführmodus (?mock=1): alle Personen, Clients, Programme und Zahlen auf "
    + "dieser Seite sind erfunden. Es besteht keine Verbindung zu SharePoint."));
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
    alleNeuBerechnen();
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
  $(tab + "-knopf-csv").addEventListener("click", function () { csvExport(tab); });

  knopfSinnbild(tab + "-knopf-filter", "filter");
  knopfSinnbild(tab + "-knopf-spalten", "spalten");
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
    for (const tab of TABELLEN) {
      const bereich = $(tab + "-werkzeuge");
      if (bereich && bereich.contains(e.target)) return;
    }
    panelsSchliessen();
  });
}

function ereignisseVerbinden() {
  for (const tab of TABELLEN) tabEreignisse(tab);
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

  for (const tab of CLIENT_TABELLEN) {
    const k = $(tab + "-knopf-neu");
    knopfSinnbild(tab + "-knopf-neu", "plus");
    k.title = "Einen neuen " + (tab === "edu" ? "EDU-Client" : "ADMIN-Client")
      + " in einem eigenen Fenster erfassen";
    k.addEventListener("click", function () { neuenClientOeffnen(tab); });
  }
  knopfSinnbild("knopf-neu-telefon", "plus");
  knopfSinnbild("knopf-neu-software", "plus");
  knopfSinnbild("knopf-abmelden", "abmelden");
  $("knopf-neu-telefon").title = "Eine neue Telefonnummer in einem eigenen Fenster erfassen";
  $("knopf-neu-telefon").addEventListener("click", neueTelefonnummerOeffnen);
  $("knopf-neu-software").title = "Ein neues Programm in einem eigenen Fenster erfassen";
  $("knopf-neu-software").addEventListener("click", neueSoftwareOeffnen);

  for (const k of document.querySelectorAll(".reiter-knopf")) {
    k.addEventListener("click", function () {
      ansichtWechseln(k.dataset.ansicht);
    });
  }

  /* Klick auf das Logo führt zur Übersicht. Modifizierte Klicks (neuer Tab,
     neues Fenster) bleiben dem Browser überlassen. */
  $("marke-logo").addEventListener("click", function (e) {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    ansichtWechseln("uebersicht");
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
      if (TABELLEN.indexOf(tab) === -1 && tab !== "software") {
        tab = "admin";
        ansichtWechseln(tab);
      }
      const feld = $(tab + "-suche");
      if (feld) { feld.focus(); feld.select(); }
    }
  });

  /* Kommt die Seite über die Zurück-Taste aus dem Cache des Browsers
     (bfcache), ist sie so alt wie beim Verlassen — die Änderung aus der
     Detailseite fehlt. Darum still nachladen. */
  window.addEventListener("pageshow", function (e) {
    if (e.persisted && !$("reiter").hidden) stillNeuLaden(true);
  });

  window.addEventListener("hashchange", function () {
    if (location.hash === eigenerHash) { eigenerHash = null; return; }
    eigenerHash = null;
    hashLesen();
    if (!adminClients.length && !eduClients.length && !benutzer.length
        && !telefone.length) return;
    spaltenPruefen();
    alleNeuBerechnen();
    zeichneAnsicht();
  });

  kanalVerbinden();
  autoNachladenStarten();
}

spaltenIndexAufbauen();
ereignisseVerbinden();
start();

})();

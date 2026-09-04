/* app.js — Oberfläche der Hauptseite des Computer Inventars.

   Fünf Ansichten:
     Übersicht       Kennzahlen zu Geräten, Benutzern und Telefonnummern,
                     Ersatzplanung als Zeitstrahl, Verteilungen.
     Geräte          Tabelle der Computer-Liste, mit Suche, Facetten, Spaltenwahl.
     Benutzer        Tabelle der Benutzer-Liste, mit Programm-Filter je Stufe.
     Telefonnummern  Tabelle der Telefonliste; nicht zugewiesene Nummern sind
                     hervorgehoben, neue Nummern werden im eigenen Fenster erfasst.
     Software        Eine Karte je Programm aus programme.json.

   Die drei Tabellenansichten (TABELLEN) teilen sich den gesamten Code für
   Suche, Filter, Spalten, Sortierung, CSV und Adresszeile; was sich
   unterscheidet, steht in TAB.

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
  /* «Status» als abgeleitete Spalte, damit ein leeres Feld überall als
     «Aktiv» erscheint — filtern, sortieren und exportieren inbegriffen.
     Die rohe Spalte «Status» bleibt in der Spaltenwahl erreichbar. */
  { i: "__statusText",    d: "Status", t: "Text", g: "Abgeleitet", q: "abgeleitet" },
  { i: "__ersatzText",    d: "Ersatzstatus", t: "Text", g: "Abgeleitet", q: "abgeleitet" },
  { i: "__hatBenutzer",   d: "Benutzer zugeordnet", t: "Text", g: "Abgeleitet", q: "abgeleitet" }
];

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

/* Beschreibung der beiden Tabellenansichten. Alles, was sich zwischen
   Geräten und Benutzern unterscheidet, steht hier — der Rest des Codes ist
   für beide derselbe. */
const TAB = {
  geraete: {
    schluessel: "geraete",
    namensSpalte: "Title",
    standard: ["Title", "__statusText", "__benutzerNamen", "GebaeudeStock",
               "Beschaffungsjahr", "ErsatzGeplant", "SCCM_Model",
               "SCCM_OSVersion", "SCCM_LastActive"],
    sortSpalte: "Title",
    facetten: [
      { k: "__statusText",      d: "Status" },
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
    csvName: "Benutzer"
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
    csvName: "Telefonnummern"
  }
};

/* Die drei Tabellenansichten. Alles, was «für jede Tabelle» gilt, läuft
   über diese Liste. */
const TABELLEN = ["geraete", "benutzer", "telefone"];

/* Spaltenliste einer Ansicht. Bei den Benutzern kommen die Programmspalten
   aus programme.json dazu, die erst zur Laufzeit bekannt sind. */
function spaltenListe(tab) {
  if (tab === "benutzer") {
    return SPALTEN_BENUTZER.concat(BENUTZER_ZUSATZ, programmSpalten);
  }
  if (tab === "telefone") {
    return SPALTEN_TELEFON.concat(TELEFON_ZUSATZ);
  }
  return SPALTEN_COMPUTER.concat(GERAETE_ZUSATZ);
}

/* Nachschlagewerk interner Name → Spaltenobjekt. Wird nach dem Laden der
   Programme neu aufgebaut. */
const SPALTE = { geraete: {}, benutzer: {}, telefone: {} };

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

const ANSICHTEN = ["uebersicht", "geraete", "benutzer", "telefone", "software"];
const KANAL_NAME = "computerinventar";
const SPEICHER_SPALTEN = "computerinventar.spalten.";   // + Ansicht
const SPEICHER_DICHTE  = "computerinventar.dichte.";    // + Ansicht
const SPEICHER_ARCHIV  = "computerinventar.archiv";     // nur Geräte

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
  geraete: leererTabZustand("geraete"),
  benutzer: leererTabZustand("benutzer"),
  telefone: leererTabZustand("telefone"),
  software: { suche: "" }
};

let geraete = [];          // angereicherte Computer-Zeilen
let benutzer = [];         // angereicherte Benutzer-Zeilen
let telefone = [];         // angereicherte Zeilen der Telefonliste
let programme = null;      // Inhalt von programme.json
let programmSpalten = [];  // Spaltenobjekte daraus
const sichtbar = { geraete: [], benutzer: [], telefone: [] };

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
    if (a === "geraete" && z.archiv) p.set("ar", "1");
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
  if (a === "geraete") {
    const ar = p.get("ar");
    if (ar !== null) z.archiv = ar === "1";
  }
}

/* Gemerkte Spalten und Dichte aus dem Browser holen. */
function einstellungenLaden() {
  for (const tab of TABELLEN) {
    try {
      const roh = localStorage.getItem(SPEICHER_SPALTEN + tab);
      if (roh) {
        const liste = JSON.parse(roh);
        if (Array.isArray(liste) && liste.length) zustand[tab].spalten = liste;
      }
      zustand[tab].dicht = localStorage.getItem(SPEICHER_DICHTE + tab) === "kompakt";
    } catch (e) { /* Ohne Speicher gilt die Standardauswahl. */ }
  }
  /* Der Archiv-Schalter wird wie Spalten und Dichte gemerkt. Fehlt der
     Eintrag, bleibt er AUS — archivierte Geräte sind ausgeblendet. */
  try {
    zustand.geraete.archiv = localStorage.getItem(SPEICHER_ARCHIV) === "1";
  } catch (e) { /* Ohne Speicher bleibt es beim Standard. */ }
}

function einstellungenMerken(tab) {
  try {
    localStorage.setItem(SPEICHER_SPALTEN + tab, JSON.stringify(zustand[tab].spalten));
    localStorage.setItem(SPEICHER_DICHTE + tab, zustand[tab].dicht ? "kompakt" : "normal");
    if (tab === "geraete") {
      localStorage.setItem(SPEICHER_ARCHIV, zustand.geraete.archiv ? "1" : "0");
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

const fortschritt = { geraete: 0, benutzer: 0, telefone: 0, programme: false };

function fortschrittZeigen() {
  const teile = ["Geräte " + fortschritt.geraete, "Benutzer " + fortschritt.benutzer,
                 "Telefonnummern " + fortschritt.telefone,
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
    fortschritt.geraete = 0; fortschritt.benutzer = 0; fortschritt.telefone = 0;
    fortschritt.programme = false;
    zeigeLaden("Daten werden geladen …");
    fortschrittZeigen();
  }

  const [rohGeraete, rohBenutzer, rohTelefone, rohProgramme] = await Promise.all([
    Daten.computer(function (n) {
      fortschritt.geraete = n; if (!still) fortschrittZeigen();
    }),
    Daten.benutzer(function (n) {
      fortschritt.benutzer = n; if (!still) fortschrittZeigen();
    }),
    telefoneLaden(function (n) {
      fortschritt.telefone = n; if (!still) fortschrittZeigen();
    }),
    Daten.programme()
  ]);

  fortschritt.geraete = rohGeraete.length;
  fortschritt.benutzer = rohBenutzer.length;
  fortschritt.telefone = rohTelefone.length;
  fortschritt.programme = true;
  if (!still) fortschrittZeigen();

  programme = rohProgramme;
  programmSpalten = Modell.programmSpalten(programme);
  spaltenIndexAufbauen();
  spaltenPruefen();

  const ergebnis = Modell.anreichern(rohGeraete, rohBenutzer, programme);
  geraete = ergebnis.computer;
  benutzer = ergebnis.benutzer;
  telefone = Modell.telefoneAnreichern(rohTelefone, benutzer).telefone;
  nachbereiten();
}

/* Die Telefonliste ist neu und darf noch fehlen: Solange in konfig.js keine
   Listen-ID steht, bleibt die Ansicht leer und die übrigen Ansichten laufen
   ganz normal. Eine fehlende Liste soll nicht die ganze Seite lahmlegen. */
let telefonHinweis = "";

async function telefoneLaden(fortschrittRuf) {
  telefonHinweis = "";
  if (!Daten.mockModus && !KONFIG.listeBereit("telefon")) {
    telefonHinweis = "In konfig.js fehlt die Listen-ID der Liste «Telefonnummern». "
      + "Die ID steht in den Listeneinstellungen in SharePoint und gehört als telefonListId in konfig.js.";
    return [];
  }
  try {
    return await Daten.telefone(fortschrittRuf);
  } catch (e) {
    telefonHinweis = "Die Liste «Telefonnummern» konnte nicht geladen werden: "
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
  return geraete;
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
function archivSichtbar() {
  const z = zustand.geraete;
  if (z.archiv) return true;
  const gewaehlt = z.facetten["__statusText"] || [];
  return gewaehlt.indexOf(ARCHIVIERT) > -1;
}

function filtern(tab) {
  const z = zustand[tab];
  const worte = z.suche.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const archivWeg = tab === "geraete" && !archivSichtbar();

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
    if (tab === "geraete") {
      const punkt = el("span", "punkt" + (zeile.__online ? "" : " punkt-aus"));
      punkt.title = zeile.__online ? "online" : "nicht online";
      td.appendChild(punkt);
    }
    const text = String(wert || "").trim()
      || (tab === "benutzer" ? String(zeile.Title || "(ohne Namen)")
        : (tab === "telefone" ? (zeile.__kurzwahl || "(ohne Kurzwahl)") : "(ohne Namen)"));
    const link = el("a", "name-link", text);
    link.href = detailUrl(tab, zeile.id);
    link.target = fensterName(tab, zeile.id);
    link.rel = "noopener";
    link.title = text + " — Detail in neuem Fenster öffnen";
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
      link.target = "benutzer-" + b.id;
      link.rel = "noopener";
      link.title = (b.Title || "") + " — Benutzerfenster öffnen";
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
  if (tab === "geraete" && (schluessel === "__statusText" || schluessel === "Status")) {
    const s = Modell.status(schluessel === "Status" ? wert : zeile.__status);
    const klasse = Modell.statusKlasse(s);
    td.appendChild(klasse ? el("span", klasse, s) : document.createTextNode(s));
    td.title = s === "Archiviert"
      ? "Archiviert — standardmässig ausgeblendet"
      : (s === "Lager" ? "Im Lager, niemandem zugeteilt" : "Im Einsatz");
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
  const grundmenge = tab === "geraete" && !archivSichtbar()
    ? zeilenVon(tab).filter(z => !z.__archiviert) : zeilenVon(tab);
  const alle = grundmenge.length;
  $(tab + "-leer").hidden = sichtbar[tab].length > 0;
  $(tab + "-tabelle").hidden = sichtbar[tab].length === 0;
  const einheit = { geraete: " Geräte", benutzer: " Benutzer", telefone: " Telefonnummern" };
  $(tab + "-anzahl").textContent = sichtbar[tab].length === alle
    ? alle + einheit[tab]
    : sichtbar[tab].length + " von " + alle;

  /* Fehlt die Telefonliste (noch), sagt die leere Tabelle, was zu tun ist. */
  if (tab === "telefone") {
    $("telefone-leer").textContent = telefonHinweis && !telefone.length
      ? telefonHinweis : "Keine Telefonnummer passt zu den aktuellen Filtern.";
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
  if (tab === "geraete" && z.archiv) {
    const c = el("button", "chip");
    c.type = "button";
    c.appendChild(document.createTextNode("Archivierte eingeblendet"));
    c.appendChild(el("span", "x", "×"));
    c.title = "Archivierte Geräte wieder ausblenden";
    c.addEventListener("click", function () {
      z.archiv = false;
      einstellungenMerken(tab);
      archivAnwenden();
      nachFilter(tab);
    });
    ziel.appendChild(c);
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
  const archivWeg = tab === "geraete" && schluessel !== "__statusText"
    && !archivSichtbar();
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
  // Status leer heisst «Aktiv» — das gehört auch so in den Export.
  if (tab === "geraete" && (schluessel === "Status" || schluessel === "__statusText")) {
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

/* Die Geräte, die für Kennzahlen und Planung zählen: alles ausser den
   archivierten. Ein ausgemustertes Gerät verzerrt sonst jede Zahl — es ist
   weder online noch ersatzbedürftig, steht aber im Nenner. Die archivierten
   bekommen dafür eine eigene Kachel. */
function aktiveGeraete() {
  return geraete.filter(z => !z.__archiviert);
}

function zeichneUebersicht() {
  /* ---- Kennzahlen Geräte ---- */
  const zielG = $("kacheln-geraete");
  leeren(zielG);

  const imEinsatz = aktiveGeraete();
  const archiviert = geraete.length - imEinsatz.length;
  const online = zaehle(imEinsatz, z => z.__online);
  const ohneSccm = zaehle(imEinsatz, z => !z.__inSccm);
  const ueberfaellig = zaehle(imEinsatz, z => z.__ersatzStatus === "ueberfaellig");
  const ohneJahr = zaehle(imEinsatz, z => !String(z.Beschaffungsjahr || "").trim());
  const ohneBenutzer = zaehle(imEinsatz, z => z.__benutzer.length === 0);

  /* Ein Sprung in die Geräteliste mit einer Facette blendet die
     archivierten weiter aus — genau wie die Kachel sie nicht mitzählt. */
  const kachelnG = [
    [imEinsatz.length, "Geräte im Einsatz",  null,
      archiviert ? "ohne " + archiviert + " archivierte" : "keine archivierten",
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
      () => springeMitFilter("geraete", z => facetteSetzen(z, "__hatBenutzer", "Nein"))],
    [archiviert, "archiviert", null, "in der Liste ausgeblendet",
      () => springeMitFilter("geraete", z => facetteSetzen(z, "__statusText", ARCHIVIERT))]
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

  /* ---- Kennzahlen Telefonnummern ---- */
  const zielT = $("kacheln-telefone");
  leeren(zielT);

  const zugewiesen = zaehle(telefone, t => t.__zugewiesen);
  const nichtZugewiesen = telefone.length - zugewiesen;
  const frei = zaehle(telefone, t => t.__status === "Frei");
  const inaktivT = zaehle(telefone, t => t.__status === "Inaktiv");
  const nameWeicht = zaehle(telefone, t => t.__nameAbweichung);
  const ohneTelefon = zaehle(benutzer, b => b.__adAktiv && !b.__hatTelefon);

  /* Sieben Kacheln wie bei den Geräten, damit sie in eine Reihe passen
     (Styleguide 4.5). «zugewiesen» ist der Normalfall und bleibt schwarz. */
  const kachelnT = [
    [telefone.length, "Telefonnummern", null, null,
      () => springeMitFilter("telefone", function () { })],
    [zugewiesen, "zugewiesen", null, null,
      () => springeMitFilter("telefone", z => facetteSetzen(z, "__zugewiesenText", "Ja"))],
    [nichtZugewiesen, "nicht zugewiesen", nichtZugewiesen ? "warnung" : null,
      "in der Liste hervorgehoben",
      () => springeMitFilter("telefone", z => facetteSetzen(z, "__zugewiesenText", "Nein"))],
    [frei, "frei — sofort vergebbar", null, null,
      () => springeMitFilter("telefone", z => facetteSetzen(z, "__statusText", "Frei"))],
    [inaktivT, "inaktiv", null, "nicht in Teams",
      () => springeMitFilter("telefone", z => facetteSetzen(z, "__statusText", "Inaktiv"))],
    [nameWeicht, "Name weicht vom AD ab", nameWeicht ? "warnung" : null,
      "Liste und AD nennen verschiedene Personen",
      () => springeMitFilter("telefone", z => facetteSetzen(z, "__nameAbweichungText", "Ja"))],
    [ohneTelefon, "Benutzer ohne Nummer", null, "aktive AD-Konten",
      () => springeMitFilter("benutzer", function (z) {
        facetteSetzen(z, "__hatTelefonText", "Nein");
        facetteSetzen(z, "ADAktiviert", "Ja");
      })]
  ];
  for (const [w, t, ton, unter, aktion] of kachelnT) {
    zielT.appendChild(kachel(w, t, ton, unter, aktion));
  }
  if (telefonHinweis && !telefone.length) {
    zielT.appendChild(el("p", "hinweis", telefonHinweis));
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

  /* Geplant wird nur für Geräte, die im Einsatz sind: ein archiviertes
     Gerät braucht keinen Ersatz mehr. */
  const planbar = aktiveGeraete();

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
    el("span", null, "Laufendes Geschäftsjahr: " + heute),
    el("span", null, "Ohne archivierte Geräte")
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

  ziel.appendChild(verteilungsKarte("Telefonnummern nach Typ", verteilung("telefone", "Typ"),
    w => springeMitFilter("telefone", z => facetteSetzen(z, "Typ", w))));

  ziel.appendChild(verteilungsKarte("Telefonnummern nach Abteilung (AD)",
    verteilung("telefone", "__abteilung"),
    w => springeMitFilter("telefone", z => facetteSetzen(z, "__abteilung", w))));
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

function telefonUrl(id) {
  return "telefon.html?id=" + encodeURIComponent(id) + (mockModus ? "&mock=1" : "");
}

function detailUrl(tab, id) {
  if (tab === "benutzer") return benutzerUrl(id);
  if (tab === "telefone") return telefonUrl(id);
  return geraetUrl(id);
}

/* Pro Datensatz genau ein Fenster: der Fenstername «geraet-<id>»,
   «benutzer-<id>» bzw. «telefon-<id>» holt ein bestehendes Fenster nach
   vorne, statt ein weiteres zu öffnen. */
function fensterName(tab, id) {
  return (tab === "benutzer" ? "benutzer-" : (tab === "telefone" ? "telefon-" : "geraet-")) + id;
}

function detailOeffnen(tab, id, neuesFenster) {
  if (id === null || id === undefined) return;
  window.open(detailUrl(tab, id), neuesFenster ? "_blank" : fensterName(tab, id));
}

function neuesGeraetOeffnen() {
  window.open("geraet.html?neu=1" + (mockModus ? "&mock=1" : ""), "geraet-neu");
}

function neueTelefonnummerOeffnen() {
  window.open("telefon.html?neu=1" + (mockModus ? "&mock=1" : ""), "telefon-neu");
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
                   "telefon-geaendert", "telefon-neu", "telefon-geloescht"];

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

/* Den Archiv-Schalter der Geräte-Werkzeugleiste nachführen. */
function archivAnwenden() {
  const k = $("geraete-knopf-archiv");
  if (!k) return;
  const an = zustand.geraete.archiv;
  k.classList.toggle("aktiv", an);
  k.setAttribute("aria-pressed", an ? "true" : "false");
  const archivierte = zaehle(geraete, g => g.__archiviert);
  k.title = (an ? "Archivierte Geräte ausblenden" : "Archivierte Geräte einblenden")
    + " — " + archivierte + " von " + geraete.length + " sind archiviert";
}

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

/* Auf eine andere Ansicht umschalten und den Hash nachführen.

   Solange die Seite noch lädt oder einen Fehler zeigt (die Reiter sind dann
   ausgeblendet), wird nur der Zustand gemerkt — sonst stünde die leere
   Ansicht über der Lade- oder Fehlermeldung. */
function ansichtWechseln(name) {
  if (ANSICHTEN.indexOf(name) === -1) return;
  zustand.ansicht = name;
  if (!$("reiter").hidden) zeichneAnsicht();
  hashSchreiben();
}

function zeichneAnsicht() {
  for (const a of ANSICHTEN) $("ansicht-" + a).hidden = a !== zustand.ansicht;
  for (const k of document.querySelectorAll(".reiter-knopf")) {
    k.classList.toggle("aktiv", k.dataset.ansicht === zustand.ansicht);
  }

  if (zustand.ansicht === "uebersicht") zeichneUebersicht();

  for (const tab of TABELLEN) {
    if (zustand.ansicht !== tab) continue;
    $(tab + "-suche").value = zustand[tab].suche;
    dichteAnwenden(tab);
    if (tab === "geraete") archivAnwenden();
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
  const letzterSync = geraete.reduce(function (max, z) {
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
  $(tab + "-knopf-dichte").addEventListener("click", function () {
    zustand[tab].dicht = !zustand[tab].dicht;
    einstellungenMerken(tab);
    dichteAnwenden(tab);
    hashSchreiben();
  });
  $(tab + "-knopf-csv").addEventListener("click", function () { csvExport(tab); });

  /* Nur die Geräte haben den Archiv-Schalter. */
  const archivKnopf = $(tab + "-knopf-archiv");
  if (archivKnopf) {
    archivKnopf.addEventListener("click", function () {
      zustand[tab].archiv = !zustand[tab].archiv;
      einstellungenMerken(tab);
      archivAnwenden();
      nachFilter(tab);
    });
  }

  knopfSinnbild(tab + "-knopf-filter", "filter");
  knopfSinnbild(tab + "-knopf-spalten", "spalten");
  knopfSinnbild(tab + "-knopf-dichte", "dichte");
  knopfSinnbild(tab + "-knopf-archiv", "archiv");   // nur bei den Geräten da
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

  knopfSinnbild("knopf-neu", "plus");
  knopfSinnbild("knopf-neu-telefon", "plus");
  knopfSinnbild("knopf-abmelden", "abmelden");
  $("knopf-neu").title = "Ein neues Gerät in einem eigenen Fenster erfassen";
  $("knopf-neu-telefon").title = "Eine neue Telefonnummer in einem eigenen Fenster erfassen";
  $("knopf-neu-telefon").addEventListener("click", neueTelefonnummerOeffnen);

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

  $("knopf-neu").addEventListener("click", neuesGeraetOeffnen);

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
        tab = "geraete";
        ansichtWechseln(tab);
      }
      const feld = $(tab + "-suche");
      if (feld) { feld.focus(); feld.select(); }
    }
  });

  window.addEventListener("hashchange", function () {
    if (location.hash === eigenerHash) { eigenerHash = null; return; }
    eigenerHash = null;
    hashLesen();
    if (!geraete.length && !benutzer.length && !telefone.length) return;
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

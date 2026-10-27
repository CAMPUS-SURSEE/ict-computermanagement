/* app.js – Oberfläche der Hauptseite des ICT-Inventars.

   Zehn Ansichten im gemeinsamen Rahmen (rahmen.js):
     Übersichten     Je Modul eine (Geräte, Verzeichnis, Videoüberwachung):
                     Handlungsbedarf, Bestand je Liste, Ersatzplanung als
                     Zeitstrahl (Clients, Kameras), Verteilungen.
     ADMIN-Clients   Tabelle der Liste «ADMIN-Clients» mit Suche, Filtern,
                     Spaltenwahl. Diese Geräte haben einen Inhaber.
     EDU-Clients     Dieselbe Tabelle für die Liste «EDU-Clients» –
                     Schulungsgeräte, die bewusst niemandem gehören.
     Benutzer        Tabelle der Benutzer-Liste, mit Programm-Filter je Stufe.
     Telefonnummern  Tabelle der Telefonliste.
     Software        Eine Karte je Programm der Liste «Software».
     Kameras         Tabelle der Liste «Kameras» (Hardware aus Milestone).
     Kamerarechte    Eine Karte je Rolle der Liste «Kamera-Rollen».

   Gebaut wird ausschliesslich über die Bausteine UI.* (bausteine.js,
   rahmen.js), Rahmen.* und Bewegung.*. Diese Datei kennt nur das, was die
   Hauptseite ausmacht: welche Spalten, Filter und Kennzahlen es gibt, wie
   der Zustand in der Adresse steht und wie die Ansichten zusammengesetzt
   sind.

   Zeichnen und Bewegung (Dashboard-Style, docs/motion.md):
     - Die Gerüste der Ansichten (Seitenkopf, Werkzeugleiste, Tabelle)
       entstehen einmal beim Start. Jede Zeichenfunktion baut danach ihren
       Inhalt neu als abgehängte Knoten und gleicht ihn mit UI.abgleichen
       (DS.dom.morphChildren) dem Bestand an: was bleibt, bleibt derselbe
       Knoten (Fokus, Rollstand, Zuhörer; kein Auftritt spielt noch einmal).
       Zeilen und Karten tragen darum einen Schlüssel (data-ds-key), jedes
       Bedienelement mit Zuhörer den seines data-fokus (schluesselSetzen):
       ein behaltener Knoten gehört so immer zum selben Datensatz.
     - Auftritte (Staffeln, Hochzählen, Balken) gibt es nur beim ersten
       Zeigen einer Ansicht (Rahmen.zustand('inhalt'), Rahmen.wechseln über
       DS.motion.transition und staggerOnce).
     - Ändern Benutzer Sortierung, Suche oder Filter, gleiten Zeilen, Karten
       und Chips an ihren neuen Platz (Bewegung.umordnen = DS.motion.flip);
       das automatische Nachladen und Meldungen anderer Fenster tun es mit
       live: true (gehalten, solange Zeiger oder Fokus in der Liste sind),
       Kennzahlen zählen dabei vom gezeigten Wert (Bewegung.hochzaehlen).

   Aufbau der Datei:
     1. Spaltenwissen und Filterdefinitionen
     2. Zustand und Adresse (Hash)
     3. Laden und Anreichern
     4. Filtern und Sortieren
     5. Hilfen: Sprünge, Adressen, Stelle in der Liste
     6. Tabellenansichten (Gerüst, Tabelle, Chips, Leerzustand)
     7. Filter- und Spaltenblatt
     8. CSV
     9. Übersicht
    10. Software
    11. Ansichten wechseln, Nachladen, Rundfunkkanal
    12. Start und Ereignisse

   Grundsätze: kein Framework, keine globalen Variablen ausser den
   Namensräumen der anderen Dateien, kein Inline-Skript, niemals innerHTML. */

"use strict";

(function () {

const $ = UI.$;
const el = UI.el;
const leeren = UI.leeren;
const anhaengen = UI.anhaengen;


/* ==================================================================
   1. Spaltenwissen und Filterdefinitionen
   ================================================================== */

/* Abgeleitete Spalten der beiden Client-Tabellen. Sie stehen nicht in
   SharePoint; modell.js und nachbereiten() rechnen sie beim Laden aus.

   Jede Kennzahl der Übersicht hat genau EIN Feld, aus dem sie zählt und
   nach dem ihr Sprung in die Liste filtert: wer «7 nicht in
   SCCM» anklickt, sieht genau diese sieben Zeilen. Darum gibt es die
   Ja/Nein-Felder unten, statt roh nach «SCCM_Found = Nein» zu filtern
   (leere Felder wären sonst gezählt, aber nicht gelistet). */
const CLIENT_ZUSATZ = [
  { i: "__inhaberName",   d: "Inhaber", t: "Text", g: "Abgeleitet", q: "abgeleitet" },
  /* «Status» als abgeleitete Spalte, damit ein leeres Feld überall als
     «Aktiv» erscheint – filtern, sortieren und exportieren inbegriffen. Sie
     ersetzt die rohe Spalte (ERSETZTE_SPALTEN). */
  { i: "__statusText",    d: "Status", t: "Text", g: "Abgeleitet", q: "abgeleitet" },
  { i: "__ersatzText",    d: "Ersatzstatus", t: "Text", g: "Abgeleitet", q: "abgeleitet" },
  { i: "__hatInhaber",    d: "Inhaber gesetzt", t: "Text", g: "Abgeleitet", q: "abgeleitet" },
  /* «In Domäne» als Text, damit ein leeres Feld überall als «Ja» erscheint –
     so gilt für die ganze Altlast dasselbe wie für den Sync. Ersetzt die
     rohe Ja/Nein-Spalte, die leer als «Nein» zeigte. */
  { i: "__domaeneText",   d: "In Domäne", t: "Text", g: "Abgeleitet", q: "abgeleitet" },
  { i: "__inSccmText",    d: "In SCCM", t: "Text", g: "Abgeleitet", q: "abgeleitet" },
  { i: "__onlineText",    d: "Online", t: "Text", g: "Abgeleitet", q: "abgeleitet" },
  { i: "__hatJahrText",   d: "Beschaffungsjahr erfasst", t: "Text", g: "Abgeleitet", q: "abgeleitet" }
];

/* Die Inhaber-Spalten gibt es nur bei den ADMIN-Clients: EDU-Clients gehören
   niemandem persönlich, eine Spalte «Inhaber» wäre dort immer leer. */
const INHABER_SPALTEN = ["__inhaberName", "__hatInhaber"];

const BENUTZER_ZUSATZ = [
  /* Der PC-Name des Geräts, dessen Inhaber die Person ist. In SharePoint
     steht nur seine Listen-ID («AdminClientId»); diese Spalte ersetzt sie
     (ERSETZTE_SPALTEN). */
  { i: "__computerName",   d: "ADMIN-Client", t: "Text", g: "Abgeleitet", q: "abgeleitet" },
  { i: "__hatGeraetText",  d: "Gerät zugeordnet", t: "Text", g: "Abgeleitet", q: "abgeleitet" },
  { i: "__hatTelefonText", d: "Telefonnummer zugeordnet", t: "Text", g: "Abgeleitet", q: "abgeleitet" },
  /* Ersetzt die rohe Spalte «AD-Konto aktiv» (ERSETZTE_SPALTEN): ein leeres
     Feld erscheint überall als «Nein». */
  { i: "__adAktivText",    d: "AD-Konto aktiv", t: "Text", g: "Abgeleitet", q: "abgeleitet" },
  { i: "__primaerText",    d: "Primärgerät weicht ab", t: "Text", g: "Abgeleitet", q: "abgeleitet" }
];

/* Abgeleitete Spalten der Telefonliste. Die Person kommt live aus der
   Benutzer-Liste (AD-Feld «Telefon»), nicht aus SharePoint. */
const TELEFON_ZUSATZ = [
  { i: "__statusText",         d: "Status",             t: "Text", g: "Abgeleitet", q: "abgeleitet" },
  { i: "__zugewiesenText",     d: "Zugewiesen",         t: "Text", g: "Abgeleitet", q: "abgeleitet" },
  { i: "__benutzerName",       d: "Person (AD)",        t: "Text", g: "Abgeleitet", q: "abgeleitet" },
  { i: "__abteilung",          d: "Abteilung (AD)",     t: "Text", g: "Abgeleitet", q: "abgeleitet" },
  { i: "__benutzerQuelleText", d: "Verknüpfung",        t: "Text", g: "Abgeleitet", q: "abgeleitet" },
  { i: "__nameAbweichungText", d: "Name weicht vom AD ab", t: "Text", g: "Abgeleitet", q: "abgeleitet" }
];

/* Abgeleitete Spalten der Kameraliste. «Sichtbar für» kommt aus der Liste
   «Kamera-Rollen» (live verknüpft, Modell.kamerasAnreichern) und ersetzt die
   Textspalte, die der Sync schreibt. Ja/Nein-Felder als Text, damit ein
   leeres Feld (Kamera nicht in Milestone) überall gleich erscheint. */
const KAMERA_ZUSATZ = [
  { i: "__statusText",        d: "Status",               t: "Text",   g: "Abgeleitet", q: "abgeleitet" },
  { i: "__inMilestoneText",   d: "In Milestone",         t: "Text",   g: "Abgeleitet", q: "abgeleitet" },
  { i: "__aktivText",         d: "In Milestone aktiv",   t: "Text",   g: "Abgeleitet", q: "abgeleitet" },
  { i: "__aufzeichnungText",  d: "Aufzeichnung",         t: "Text",   g: "Abgeleitet", q: "abgeleitet" },
  { i: "__rollenText",        d: "Sichtbar für",         t: "Text",   g: "Abgeleitet", q: "abgeleitet" },
  { i: "__rollenAnzahl",      d: "Anzahl Rollen",        t: "Number", g: "Abgeleitet", q: "abgeleitet" },
  { i: "__unbenanntText",     d: "Kanal ohne Namen",     t: "Text",   g: "Abgeleitet", q: "abgeleitet" },
  { i: "__ersatzText",        d: "Ersatzstatus",         t: "Text",   g: "Abgeleitet", q: "abgeleitet" },
  { i: "__hatJahrText",       d: "Beschaffungsjahr erfasst", t: "Text", g: "Abgeleitet", q: "abgeleitet" }
];

const TELEFON_QUELLE_TEXT = {
  telefon: "Über AD-Telefonnummer", login: "Über Spalte «Benutzer (AD)»", "": "Keine Person"
};

const ERSATZ_TEXT = {
  ok: "Im Plan", bald: "In diesem Geschäftsjahr",
  ueberfaellig: "Überfällig", unbekannt: "Nicht erfasst"
};

const ZEITRAEUME = [
  { w: "7",    d: "in den letzten 7 Tagen" },
  { w: "30",   d: "in den letzten 30 Tagen" },
  { w: "90",   d: "in den letzten 90 Tagen" },
  { w: "ae30", d: "älter als 30 Tage" },
  { w: "ae90", d: "älter als 90 Tage" },
  { w: "leer", d: "(leer)" }
];

const SPEICHERSTUFEN = [
  { w: "u20",  d: "unter 20 GB" },
  { w: "u50",  d: "unter 50 GB" },
  { w: "ab50", d: "50 GB und mehr" },
  { w: "leer", d: "(leer)" }
];

const PROGRAMM_STUFEN = [
  { w: "",  d: "beliebig (1 oder 2)" },
  { w: "1", d: "nur von Hand (1)" },
  { w: "2", d: "nur aus AD-Gruppe (2)" }
];

/* Beschreibung der Tabellenansichten. Alles, was sich zwischen ihnen
   unterscheidet, steht hier – der Rest des Codes ist für alle derselbe.
   Die beiden Client-Listen entstehen aus einer gemeinsamen Beschreibung. */
function clientTab(schluessel, mitInhaber, csvName) {
  const standard = ["Title", "__statusText", "__inhaberName", "GebaeudeStock",
                    "Beschaffungsjahr", "ErsatzGeplant", "SCCM_Model",
                    "SCCM_OSVersion", "SCCM_LastActive"];
  const facetten = [
    { k: "__statusText",      d: "Status" },
    { k: "Beschaffungsjahr",  d: "Beschaffungsjahr" },
    { k: "__hatJahrText",     d: "Beschaffungsjahr erfasst" },
    { k: "ErsatzGeplant",     d: "Ersatz geplant" },
    { k: "__ersatzText",      d: "Ersatzstatus" },
    { k: "GebaeudeStock",     d: "Gebäude / Stock" },
    { k: "__hatInhaber",      d: "Inhaber gesetzt" },
    { k: "__domaeneText",     d: "In Domäne" },
    { k: "__inSccmText",      d: "In SCCM" },
    { k: "__onlineText",      d: "Online" },
    { k: "SCCM_ClientActive", d: "SCCM-Client aktiv" },
    { k: "SCCM_Manufacturer", d: "Hersteller" },
    { k: "SCCM_Model",        d: "Modell" },
    { k: "SCCM_ChassisType",  d: "Gehäusetyp" },
    { k: "SCCM_OSVersion",    d: "OS-Version" },
    { k: "SCCM_EPEnabled",    d: "Defender aktiv" }
  ];
  return {
    mitInhaber: mitInhaber,
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
  admin: clientTab("admin", true, "ADMIN-Clients"),
  edu: clientTab("edu", false, "EDU-Clients"),
  benutzer: {
    namensSpalte: "Anzeigename",
    standard: ["Anzeigename", "Title", "Abteilung", "Funktion", "__computerName", "__adAktivText"],
    sortSpalte: "Anzeigename",
    facetten: [
      { k: "Abteilung",        d: "Abteilung" },
      { k: "Firma",            d: "Firma" },
      { k: "Funktion",         d: "Funktion" },
      { k: "__hatGeraetText",  d: "Gerät zugeordnet" },
      { k: "__hatTelefonText", d: "Telefonnummer zugeordnet" },
      { k: "__adAktivText",    d: "AD-Konto aktiv" },
      { k: "__primaerText",    d: "Primärgerät weicht ab" }
    ],
    zeitspalten: [{ k: "ADLetzterSync", d: "Letzter AD-Abgleich" }],
    hatSpeicher: false,
    hatProgramme: true,
    csvName: "Benutzer"
  },
  telefone: {
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
    zeitspalten: [{ k: "ADLetzterSync", d: "Letzter AD-Abgleich" }],
    hatSpeicher: false,
    hatProgramme: false,
    csvName: "Telefonnummern"
  },
  kameras: {
    namensSpalte: "Title",
    standard: ["Title", "ErsatzGeplant", "Gebaeude", "Raum", "Zustaendig", "MS_Modell", "MS_Adresse"],
    /* Erhöht, wenn sich die Standardspalten ändern: eine früher im Browser
       gemerkte Auswahl gilt dann nicht mehr (spaltenSpeicher). */
    spaltenStand: 2,
    sortSpalte: "Title",
    facetten: [
      { k: "__statusText",       d: "Status" },
      { k: "Gebaeude",           d: "Gebäude" },
      { k: "__inMilestoneText",  d: "In Milestone" },
      { k: "__aktivText",        d: "In Milestone aktiv" },
      { k: "__aufzeichnungText", d: "Aufzeichnung" },
      { k: "__unbenanntText",    d: "Kanal ohne Namen" },
      { k: "MS_Hersteller",      d: "Hersteller" },
      { k: "MS_Modell",          d: "Modell" },
      { k: "Zustaendig",         d: "Zuständig" },
      { k: "Qualitaet",          d: "Bildqualität" },
      { k: "Positionierung",     d: "Positionierung" },
      { k: "Beschaffungsjahr",   d: "Beschaffungsjahr" },
      { k: "__hatJahrText",      d: "Beschaffungsjahr erfasst" },
      { k: "__ersatzText",       d: "Ersatzstatus" }
    ],
    zeitspalten: [
      { k: "MS_Geaendert",   d: "In Milestone geändert" },
      { k: "MS_LetzterSync", d: "Letzter Milestone-Abgleich" }
    ],
    hatSpeicher: false,
    hatProgramme: false,
    hatRolle: true,
    csvName: "Kameras"
  }
};

/* Die fünf Tabellenansichten. Alles, was «für jede Tabelle» gilt, läuft
   über diese Liste. */
const TABELLEN = ["admin", "edu", "benutzer", "telefone", "kameras"];

/* Tabellen mit Status «Archiviert»: archivierte Zeilen sind dort
   standardmässig ausgeblendet (Schalter im Filterblatt, «ar» im Link). */
const ARCHIV_TABELLEN = ["admin", "edu", "kameras"];

function hatArchiv(tab) { return ARCHIV_TABELLEN.indexOf(tab) > -1; }

/* Die beiden Client-Tabellen. Wo im Code «tab === "admin"» stünde, ist fast
   immer diese Frage gemeint: geht es um eine Liste von Geräten? */
const CLIENT_TABELLEN = ["admin", "edu"];

function istClientTab(tab) { return CLIENT_TABELLEN.indexOf(tab) > -1; }

/* Texte je Ansicht: Einheit für Zahlen, Sinnbild. Einen Lead unter dem
   Titel gibt es nicht: Titel und Inhalt sagen genug.

   EINHEIT: Einzahl, Mehrzahl und – nur wo er abweicht – der Dativ der
   Mehrzahl (einheitDativ). */
const EINHEIT = {
  admin: ["ADMIN-Client", "ADMIN-Clients"], edu: ["EDU-Client", "EDU-Clients"],
  benutzer: ["Benutzer", "Benutzer", "Benutzern"], telefone: ["Telefonnummer", "Telefonnummern"],
  software: ["Programm", "Programme", "Programmen"], kameras: ["Kamera", "Kameras"],
  kamerarechte: ["Rolle", "Rollen"]
};

const SINNBILD = { admin: "laptop", edu: "edu", benutzer: "benutzer", telefone: "telefon", software: "software",
  kameras: "kamera", kamerarechte: "schild" };

const SUCH_PLATZHALTER = {
  admin: "PC-Name, Inhaber, Modell, Ort …",
  edu: "PC-Name, Modell, Ort …",
  benutzer: "Name, Login, Abteilung, Gerät …",
  telefone: "Kurzwahl, Nummer, Name, Abteilung …",
  software: "Programm, Programm-ID, AD-Gruppe …",
  kameras: "Name, Raum, Modell, IP-Adresse, Rolle …",
  kamerarechte: "Rolle, AD-Gruppe, Recht …"
};

function einheit(tab, n) { return EINHEIT[tab][n === 1 ? 0 : 1]; }

/* Nach «von» und «mit» steht der Dativ: «12 von 80 Benutzern». */
function einheitDativ(tab, n) { return n === 1 ? EINHEIT[tab][0] : (EINHEIT[tab][2] || EINHEIT[tab][1]); }

function anzahlText(tab, n) { return UI.zahlText(n) + " " + einheit(tab, n); }

/* Rohe SharePoint-Spalten, die eine abgeleitete vollständig ersetzt. Die
   abgeleitete zeigt dasselbe Feld, nur steht für ein leeres Feld ein Wert
   (leerer Status = «Aktiv», leeres «In Domäne» = «Ja», leeres «AD-Konto
   aktiv» = «Nein»). Stünden beide im Spaltenblatt, gäbe es zwei Spalten
   «Status» ohne erkennbaren Unterschied; darum nimmt die abgeleitete den
   Platz der rohen ein. */
const ERSETZTE_SPALTEN = {
  client: { Status: "__statusText", InDomaene: "__domaeneText" },
  /* «Computer» hielt bis Oktober 2026 den PC-Namen; gemerkte Spaltenwahl und
     alte Links zeigen dafür jetzt den Namen aus der Verknüpfung. */
  benutzer: { ADAktiviert: "__adAktivText", AdminClientId: "__computerName", Computer: "__computerName" },
  telefone: { Status: "__statusText" },
  kameras: { Status: "__statusText", MS_Gefunden: "__inMilestoneText", MS_Aktiv: "__aktivText",
             MS_Aufzeichnung: "__aufzeichnungText", MS_Rollen: "__rollenText" }
};

function ersetzteSpalten(tab) {
  if (istClientTab(tab)) return ERSETZTE_SPALTEN.client;
  return ERSETZTE_SPALTEN[tab] || {};
}

/* Rohe Spalten gegen ihre abgeleitete tauschen: die abgeleitete steht an
   der Stelle und in der Gruppe der rohen (Stammdaten). */
function mitErsatz(tab, roh, zusatz) {
  const ersatz = ersetzteSpalten(tab);
  const ersetzer = Object.keys(ersatz).map(k => ersatz[k]);
  const zusatzVon = {};
  for (const s of zusatz) zusatzVon[s.i] = s;
  return roh.map(s => ersatz[s.i] && zusatzVon[ersatz[s.i]] ? Object.assign({}, zusatzVon[ersatz[s.i]], { g: s.g }) : s)
    .concat(zusatz.filter(s => ersetzer.indexOf(s.i) === -1));
}

/* Alte Links und eine früher gemerkte Auswahl nennen vielleicht noch die
   rohe Spalte: sie zeigen dann die abgeleitete, und zwar nur einmal. */
function spaltenUebernehmen(tab, liste) {
  const ersatz = ersetzteSpalten(tab);
  const neu = [];
  for (const k of liste) {
    const n = ersatz[k] || k;
    if (neu.indexOf(n) === -1) neu.push(n);
  }
  return neu;
}

/* Spaltenliste einer Ansicht. Bei den Benutzern kommen die Programmspalten
   aus der Liste «Software» dazu, die erst zur Laufzeit bekannt sind. */
function spaltenListe(tab) {
  if (tab === "benutzer") return mitErsatz(tab, SPALTEN_BENUTZER, BENUTZER_ZUSATZ).concat(programmSpalten);
  if (tab === "telefone") return mitErsatz(tab, SPALTEN_TELEFON, TELEFON_ZUSATZ);
  if (tab === "kameras") return mitErsatz(tab, SPALTEN_KAMERA, KAMERA_ZUSATZ);
  const alle = mitErsatz(tab, SPALTEN_CLIENT, CLIENT_ZUSATZ);
  return TAB[tab].mitInhaber ? alle : alle.filter(s => INHABER_SPALTEN.indexOf(s.i) === -1);
}

/* Nachschlagewerk interner Name → Spaltenobjekt. Wird nach dem Laden der
   Programme neu aufgebaut. */
const SPALTE = { admin: {}, edu: {}, benutzer: {}, telefone: {}, kameras: {} };

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

/* Die Spalten, die gezeigt werden. Unbekannte Namen bleiben im Zustand
   stehen, solange die Liste «Software» nicht geladen werden konnte – es
   könnten Programmspalten sein, die beim nächsten Laden wieder da sind.
   Gezeigt werden sie dann nicht. */
function sichtbareSpalten(tab) {
  return zustand[tab].spalten.filter(k => !!spalte(tab, k));
}

/* Feste Reihenfolge der Spalten: zuerst die Standardspalten in
   ihrer Reihenfolge (die Namensspalte vorne), dann alle übrigen wie in der
   Spaltenliste. Eine neu gewählte Spalte reiht sich so an ihrem Platz ein,
   statt die Tabelle umzustellen. */
function spaltenOrdnen(tab, liste) {
  const reihe = TAB[tab].standard.concat(spaltenListe(tab).map(s => s.i)
    .filter(k => TAB[tab].standard.indexOf(k) === -1));
  const rang = k => { const i = reihe.indexOf(k); return i === -1 ? reihe.length : i; };
  const ohneDoppel = liste.filter((k, i) => liste.indexOf(k) === i);
  return ohneDoppel.sort((a, b) => rang(a) - rang(b));
}


/* ==================================================================
   2. Zustand und Adresse
   ================================================================== */

/* Je Modul eine Übersicht (Rahmen.HAUPTZIELE). «#uebersicht» aus alten
   Links führt zur ersten. */
const UEBERSICHTEN = ["geraete", "verzeichnis", "videoueberwachung"];
const ANSICHTEN = UEBERSICHTEN.concat(["admin", "edu", "benutzer", "telefone", "software", "kameras", "kamerarechte"]);
function istUebersicht(name) { return UEBERSICHTEN.indexOf(name) > -1; }
const SPEICHER_SPALTEN = "ictinventar.spalten.";   // + Ansicht
const SPEICHER_DICHTE  = "ictinventar.dichte";     // alle Listen
const SPEICHER_ARCHIV  = "ictinventar.archiv.";    // + Client-Ansicht

/* Der Wert der Statusspalte, der ein Gerät aus der Liste nimmt. */
const ARCHIVIERT = "Archiviert";

/* Leere Felder sind ein eigener Facettenwert. In Chips, im
   Filterblatt und in der Adresse heisst er so. */
const LEER_WERT = "(leer)";

function leererTabZustand(tab) {
  return {
    suche: "",
    facetten: {},        // { schluessel: [werte] }, "" = leeres Feld
    zeit: {},            // { schluessel: zeitraum }
    speicher: "",
    programm: "",        // interner Name eines Programms
    programmStufe: "",   // "" | "1" | "2"
    rolle: "",           // Listen-ID einer Kamera-Rolle (nur Kameras: «sichtbar für»)
    sortSpalte: TAB[tab].sortSpalte,
    sortAuf: true,
    spalten: TAB[tab].standard.slice(),
    dicht: false,
    /* Nur bei den Geräten: archivierte sind standardmässig ausgeblendet. */
    archiv: false
  };
}

const zustand = {
  ansicht: Rahmen.STARTZIEL,
  admin: leererTabZustand("admin"),
  edu: leererTabZustand("edu"),
  benutzer: leererTabZustand("benutzer"),
  telefone: leererTabZustand("telefone"),
  kameras: leererTabZustand("kameras"),
  software: { suche: "" },
  kamerarechte: leererRechteZustand()
};

/* Die Ansicht «Kamerarechte» ist keine Tabelle: eine Karte je Rolle, dazu
   die Suche. */
function leererRechteZustand() { return { suche: "" }; }

let adminClients = [];     // angereicherte Zeilen der Liste «ADMIN-Clients»
let eduClients = [];       // angereicherte Zeilen der Liste «EDU-Clients»
let benutzer = [];         // angereicherte Benutzer-Zeilen
let telefone = [];         // angereicherte Zeilen der Telefonliste
let software = [];         // Zeilen der Liste «Software»
let programmSpalten = [];  // Spaltenobjekte daraus
let kameras = [];          // angereicherte Zeilen der Liste «Kameras»
let kameraRollen = [];     // angereicherte Zeilen der Liste «Kamera-Rollen»
let syncZustand = null;    // { zeit, text } des letzten Sync-Laufs oder null (Daten.syncStatus)
const sichtbar = { admin: [], edu: [], benutzer: [], telefone: [], kameras: [] };

/* Ersetzt das frühere Signal «#reiter hidden»: erst nach dem ersten
   erfolgreichen Laden ist die Seite bedienbar (Nachladen, Ansichtswechsel
   mit Bewegung, Zurück aus dem Cache). */
let appBereit = false;

/* Zuletzt selbst geschriebener Hash. Damit lässt sich das eigene
   hashchange-Ereignis von einem Klick auf Vor/Zurück unterscheiden. */
let eigenerHash = null;

const mockModus = UI.adresse.mock();

/* ---------- Hash schreiben und lesen ----------

   Form: #<ansicht>?q=…&f=…&z=…&sp=…&pg=…&ps=…&s=…&c=…&d=kompakt&ar=1
   «c» = sichtbare Spalten (Komma-getrennt), «d» = Dichte (gilt für alle
   Listen), «ar» = archivierte Geräte eingeblendet (1) oder ausgeblendet
   (0). Fehlen c/d/ar (etwa in einem von Hand gekürzten Link), gilt die im
   Browser gemerkte Auswahl. */

function facettenWertKodieren(w) { return w === "" ? LEER_WERT : w; }
function facettenWertLesen(w) { return w === LEER_WERT ? "" : w; }

/* Die Parameter einer Ansicht. «sprung» lässt Sortierung, Spalten und
   Dichte weg (ein Link in eine gefilterte Liste soll nur filtern).

   Der Archivschalter der Geräte steht IMMER in der Adresse, als ar=1 oder
   ar=0: sonst gälte in einem neuen Tab, nach dem Neuladen oder
   über den Zurück-Link einer Detailseite wieder die im Browser gemerkte
   Einstellung, und die Liste zeigte mehr Geräte, als die Zahl versprach,
   die hierher geführt hat. */
function parameterVon(a, z, sprung) {
  const p = new URLSearchParams();
  if (a === "software" || a === "kamerarechte") {
    if (z.suche) p.set("q", z.suche);
    return p;
  }
  if (TABELLEN.indexOf(a) === -1) return p;
  if (z.suche) p.set("q", z.suche);

  const f = [];
  for (const k of Object.keys(z.facetten)) {
    const w = z.facetten[k];
    if (w && w.length) f.push(k + ":" + w.map(facettenWertKodieren).join("|"));
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
  if (z.rolle) p.set("ro", z.rolle);
  if (!sprung) {
    if (z.sortSpalte !== TAB[a].sortSpalte || !z.sortAuf) {
      p.set("s", z.sortSpalte + ":" + (z.sortAuf ? "auf" : "ab"));
    }
    p.set("c", z.spalten.join(","));
    if (z.dicht) p.set("d", "kompakt");
  }
  if (hatArchiv(a)) p.set("ar", z.archiv ? "1" : "0");
  return p;
}

function hashSchreiben(alsVerlaufseintrag) {
  const a = zustand.ansicht;
  const text = parameterVon(a, zustand[a] || {}, false).toString();
  const neu = "#" + a + (text ? "?" + text : "");
  if (location.hash === neu) return;
  eigenerHash = neu;

  /* Ein Ansichtswechsel ist ein Schritt, den die Zurück-Taste rückgängig
     machen soll: pushState. Filter, Sortierung und Spaltenwahl ersetzen nur
     den aktuellen Eintrag – sonst wäre die Zurück-Taste unbrauchbar. */
  const adresse = location.pathname + location.search + neu;
  if (alsVerlaufseintrag) history.pushState(null, "", adresse);
  else history.replaceState(null, "", adresse);
}

function hashLesen() {
  const roh = location.hash.replace(/^#/, "");
  const trenn = roh.indexOf("?");
  const name = (trenn === -1 ? roh : roh.slice(0, trenn)) || Rahmen.STARTZIEL;
  const p = new URLSearchParams(trenn === -1 ? "" : roh.slice(trenn + 1));

  zustand.ansicht = ANSICHTEN.indexOf(name) > -1 ? name : Rahmen.STARTZIEL;
  const a = zustand.ansicht;

  /* Dichte gilt für alle Listen: ein geteilter Link mit
     «d=kompakt» macht nicht nur die eine Liste kompakt. */
  const d = p.get("d");
  if (d !== null) for (const tab of TABELLEN) zustand[tab].dicht = d === "kompakt";

  if (a === "software") {
    zustand.software.suche = p.get("q") || "";
    return;
  }
  if (a === "kamerarechte") {
    zustand.kamerarechte.suche = p.get("q") || "";
    return;
  }
  if (TABELLEN.indexOf(a) === -1) return;

  const z = zustand[a];
  z.suche = p.get("q") || "";

  z.facetten = {};
  for (const teil of (p.get("f") || "").split(";")) {
    const i = teil.indexOf(":");
    if (i < 1) continue;
    const werte = teil.slice(i + 1).split("|").filter(w => w !== "").map(facettenWertLesen);
    if (werte.length) z.facetten[teil.slice(0, i)] = werte;
  }

  z.zeit = {};
  for (const teil of (p.get("z") || "").split(";")) {
    const i = teil.indexOf(":");
    if (i < 1) continue;
    z.zeit[teil.slice(0, i)] = teil.slice(i + 1);
  }

  z.speicher = p.get("sp") || "";
  z.programm = p.get("pg") || "";
  z.programmStufe = z.programm ? (p.get("ps") || "") : "";
  z.rolle = TAB[a].hatRolle ? (p.get("ro") || "") : "";

  const s = p.get("s");
  if (s) {
    const i = s.indexOf(":");
    z.sortSpalte = spaltenUebernehmen(a, [i === -1 ? s : s.slice(0, i)])[0];
    z.sortAuf = i === -1 ? true : s.slice(i + 1) !== "ab";
  } else {
    z.sortSpalte = TAB[a].sortSpalte;
    z.sortAuf = true;
  }

  /* Spalten: steht der Parameter im Link, gewinnt er; sonst bleibt, was im
     Browser gemerkt ist. Ungültige Namen räumt spaltenPruefen() weg. */
  const c = p.get("c");
  if (c !== null) {
    const liste = spaltenUebernehmen(a, c.split(",").filter(Boolean));
    if (liste.length) z.spalten = liste;
  }

  if (hatArchiv(a)) {
    const ar = p.get("ar");
    if (ar !== null) z.archiv = ar === "1";
  }
}

/* Gemerkte Spalten, Dichte und Archivschalter aus dem Browser holen. */
/* Schlüssel der gemerkten Spaltenwahl; mit TAB[tab].spaltenStand ein neuer,
   damit geänderte Standardspalten auch bei bisherigen Nutzern ankommen. */
function spaltenSpeicher(tab) {
  return SPEICHER_SPALTEN + tab + (TAB[tab].spaltenStand ? "." + TAB[tab].spaltenStand : "");
}

function einstellungenLaden() {
  let dicht = false;
  try { dicht = localStorage.getItem(SPEICHER_DICHTE) === "kompakt"; } catch (e) { /* ohne Speicher */ }
  for (const tab of TABELLEN) {
    zustand[tab].dicht = dicht;
    try {
      const roh = localStorage.getItem(spaltenSpeicher(tab));
      if (roh) {
        const liste = JSON.parse(roh);
        if (Array.isArray(liste) && liste.length) zustand[tab].spalten = spaltenUebernehmen(tab, liste);
      }
      if (hatArchiv(tab)) zustand[tab].archiv = localStorage.getItem(SPEICHER_ARCHIV + tab) === "1";
    } catch (e) { /* Ohne Speicher gilt die Standardauswahl. */ }
  }
}

function einstellungenMerken(tab) {
  try {
    localStorage.setItem(spaltenSpeicher(tab), JSON.stringify(zustand[tab].spalten));
    localStorage.setItem(SPEICHER_DICHTE, zustand[tab].dicht ? "kompakt" : "normal");
    if (hatArchiv(tab)) localStorage.setItem(SPEICHER_ARCHIV + tab, zustand[tab].archiv ? "1" : "0");
  } catch (e) { /* Privater Modus: dann eben nur für diese Sitzung. */ }
}

/* Unbekannte Spaltennamen entfernen (etwa ein umbenanntes Feld). Nur, wenn
   die Programme sicher bekannt sind. */
function spaltenPruefen() {
  for (const tab of TABELLEN) {
    const z = zustand[tab];
    z.spalten = z.spalten.filter(k => !!spalte(tab, k));
    if (!z.spalten.length) z.spalten = TAB[tab].standard.slice();
  }
}


/* ==================================================================
   3. Laden und Anreichern
   ================================================================== */

const fortschritt = { admin: 0, edu: 0, benutzer: 0, telefone: 0, software: 0, kameras: 0, kamerarechte: 0 };

function fortschrittText() {
  return ["ADMIN-Clients " + fortschritt.admin, "EDU-Clients " + fortschritt.edu,
    "Benutzer " + fortschritt.benutzer, "Telefonnummern " + fortschritt.telefone,
    "Software " + fortschritt.software, "Kameras " + fortschritt.kameras].join(" · ");
}

/* Zusätzliche Felder, die nur die Hauptseite braucht (Facettenwerte als
   lesbarer Text). modell.js liefert die eigentliche Verknüpfung. */
function nachbereiten() {
  for (const c of adminClients.concat(eduClients)) {
    c.__ersatzText = ERSATZ_TEXT[c.__ersatzStatus] || ERSATZ_TEXT.unbekannt;
    c.__hatInhaber = c.__inhaber ? "Ja" : "Nein";
    c.__domaeneText = c.InDomaene === false ? "Nein" : "Ja";
    c.__statusText = c.__status;
    c.__inSccmText = c.__inSccm ? "Ja" : "Nein";
    c.__onlineText = c.__online ? "Ja" : "Nein";
    c.__hatJahrText = String(c.Beschaffungsjahr || "").trim() ? "Ja" : "Nein";
  }
  for (const b of benutzer) {
    b.__hatGeraetText = b.__hatGeraet ? "Ja" : "Nein";
    b.__hatTelefonText = b.__hatTelefon ? "Ja" : "Nein";
    b.__adAktivText = b.__adAktiv ? "Ja" : "Nein";
    b.__primaerText = b.__primaerAbweichung ? "Ja" : "Nein";
  }
  for (const t of telefone) {
    t.__statusText = t.__status;
    t.__zugewiesenText = t.__zugewiesen ? "Ja" : "Nein";
    t.__benutzerQuelleText = TELEFON_QUELLE_TEXT[t.__benutzerQuelle] || TELEFON_QUELLE_TEXT[""];
    /* Der Name in der Liste ist Handarbeit; steht im AD eine andere Person
       hinter der Nummer, ist die Liste veraltet. */
    const b = t.__benutzerZeile;
    const name = String(t.Name || "").trim();
    t.__nameAbweichung = !!(b && name && Modell.schluessel(name) !== Modell.schluessel(b.Anzeigename));
    t.__nameAbweichungText = t.__nameAbweichung ? "Ja" : "Nein";
  }
  for (const k of kameras) {
    k.__statusText = k.__status;
    k.__inMilestoneText = k.__inMilestone ? "Ja" : "Nein";
    k.__aktivText = k.__inMilestone ? (k.__aktiv ? "Ja" : "Nein") : "";
    k.__aufzeichnungText = k.__inMilestone ? (k.__aufzeichnung ? "Ja" : "Nein") : "";
    k.__rollenText = k.__rollenNamen.join(", ");
    k.__rollenAnzahl = k.__rollenNamen.length;
    k.__unbenanntText = k.__unbenannt ? "Ja" : "Nein";
    k.__ersatzText = ERSATZ_TEXT[k.__ersatzStatus] || ERSATZ_TEXT.unbekannt;
    k.__hatJahrText = String(k.Beschaffungsjahr || "").trim() ? "Ja" : "Nein";
  }
}

/* Nachzügler-Listen: «EDU-Clients», «Telefonnummern» und «Software» sind
   jünger als der Rest. Fehlt ihre Listen-ID oder die Liste, bleibt die
   betroffene Ansicht leer und sagt, was zu tun ist – die übrigen laufen
   normal weiter. */
const listenHinweis = { edu: "", telefon: "", software: "", kamera: "", kamerarolle: "" };

const LISTEN_KONFIG = {
  edu: { titel: "EDU-Clients", schluessel: "eduClientListId" },
  telefon: { titel: "Telefonnummern", schluessel: "telefonListId" },
  software: { titel: "Software", schluessel: "softwareListId" },
  kamera: { titel: "Kameras", schluessel: "kameraListId" },
  kamerarolle: { titel: "Kamera-Rollen", schluessel: "kameraRolleListId" }
};

/* Hinweis zur Liste hinter einer Tabellenansicht ("" = alles in Ordnung). */
function hinweisVon(tab) {
  if (tab === "edu") return listenHinweis.edu;
  if (tab === "telefone") return listenHinweis.telefon;
  if (tab === "kameras") return listenHinweis.kamera;
  return "";
}

/* Der letzte gelungene Stand der Nachzügler-Listen (roh). Scheitert eine
   davon beim stillen Nachladen, gilt er weiter. */
const letzterStand = { edu: [], telefon: [], software: [], kamera: [], kamerarolle: [] };

/* Liefert die Zeilen, [] mit Hinweis (fehlt/Fehler beim ersten Laden) oder
   null (Fehler beim stillen Nachladen: alten Stand behalten). */
async function listeLaden(liste, fortschrittRuf, still) {
  const k = LISTEN_KONFIG[liste];
  if (!Daten.mockModus && !KONFIG.listeBereit(liste)) {
    listenHinweis[liste] = "In konfig.js fehlt die Listen-ID (" + k.schluessel + "). "
      + "Sie steht in SharePoint in den Listeneinstellungen.";
    return [];
  }
  try {
    let zeilen;
    if (liste === "edu") zeilen = await Daten.clients("edu", fortschrittRuf);
    else if (liste === "telefon") zeilen = await Daten.telefone(fortschrittRuf);
    else if (liste === "kamera") zeilen = await Daten.kameras(fortschrittRuf);
    else if (liste === "kamerarolle") zeilen = await Daten.kameraRollen(fortschrittRuf);
    else zeilen = await Daten.software(fortschrittRuf);
    listenHinweis[liste] = "";
    return zeilen;
  } catch (e) {
    if (still) return null;
    listenHinweis[liste] = "Die Liste «" + k.titel + "» konnte nicht geladen werden: "
      + (e && e.message ? e.message : String(e));
    return [];
  }
}

/* «still» lädt im Hintergrund nach, ohne Ladezustand. Gibt die Titel der
   Listen zurück, die dabei nicht geladen werden konnten. */
async function datenLaden(still) {
  if (!still) {
    for (const k of Object.keys(fortschritt)) fortschritt[k] = 0;
    Rahmen.zustand("laden", { text: "Daten werden geladen …", fortschritt: fortschrittText() });
  }
  const melden = function (k) {
    return function (n) {
      fortschritt[k] = n;
      if (!still) Rahmen.zustand("laden", { fortschritt: fortschrittText() });
    };
  };

  const [rohAdmin, rohEdu, rohBenutzer, rohTelefone, rohSoftware, rohKameras, rohRollen, sync] = await Promise.all([
    Daten.clients("admin", melden("admin")),
    listeLaden("edu", melden("edu"), still),
    Daten.benutzer(melden("benutzer")),
    listeLaden("telefon", melden("telefone"), still),
    listeLaden("software", melden("software"), still),
    listeLaden("kamera", melden("kameras"), still),
    listeLaden("kamerarolle", melden("kamerarechte"), still),
    Daten.syncStatus()
  ]);
  syncZustand = sync;

  const fehlgeschlagen = [];
  function stand(liste, roh) {
    if (roh === null) { fehlgeschlagen.push(LISTEN_KONFIG[liste].titel); return letzterStand[liste]; }
    letzterStand[liste] = roh;
    return roh;
  }
  const edu = stand("edu", rohEdu);
  const tel = stand("telefon", rohTelefone);
  const sw = stand("software", rohSoftware);
  const kam = stand("kamera", rohKameras);
  const rol = stand("kamerarolle", rohRollen);

  fortschritt.admin = rohAdmin.length;
  fortschritt.edu = edu.length;
  fortschritt.benutzer = rohBenutzer.length;
  fortschritt.telefone = tel.length;
  fortschritt.software = sw.length;
  fortschritt.kameras = kam.length;
  fortschritt.kamerarechte = rol.length;
  if (!still) Rahmen.zustand("laden", { fortschritt: fortschrittText() });

  software = sw;
  programmSpalten = Modell.programmSpalten(software);
  spaltenIndexAufbauen();
  /* Nur wenn die Programme sicher bekannt sind, dürfen unbekannte Spalten
     weg – sonst verlöre die Benutzerliste ihre Programmspalten für immer. */
  if (rohSoftware !== null && !listenHinweis.software) spaltenPruefen();

  const ergebnis = Modell.anreichern(rohAdmin, rohBenutzer, software);
  adminClients = ergebnis.clients;
  benutzer = ergebnis.benutzer;
  eduClients = Modell.clientsAnreichern(edu).clients;
  telefone = Modell.telefoneAnreichern(tel, benutzer).telefone;
  const video = Modell.kamerasAnreichern(kam, rol, benutzer);
  kameras = video.kameras;
  kameraRollen = video.rollen;
  nachbereiten();
  return fehlgeschlagen;
}


/* ==================================================================
   4. Filtern und Sortieren
   ================================================================== */

function zeilenVon(tab) {
  if (tab === "benutzer") return benutzer;
  if (tab === "telefone") return telefone;
  if (tab === "kameras") return kameras;
  if (tab === "edu") return eduClients;
  return adminClients;
}

/* Wert einer Facette als Text, inklusive der abgeleiteten; leer = "". */
function facettenWert(zeile, schluessel) {
  const w = zeile[schluessel];
  if (w === null || w === undefined || w === false) return "";
  if (w === true) return "Ja";
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
   ist, oder weil ausdrücklich nach «Archiviert» gefiltert wird – sonst
   führte dieser Filter in eine garantiert leere Liste. */
function archivSichtbar(tab) {
  const z = zustand[tab];
  if (!z || !hatArchiv(tab)) return true;
  if (z.archiv) return true;
  return (z.facetten.__statusText || []).indexOf(ARCHIVIERT) > -1;
}

/* Was ohne Filter zu sehen wäre: sind die archivierten ausgeblendet,
   gehören sie nicht in den Nenner. */
function grundmenge(tab) {
  return hatArchiv(tab) && !archivSichtbar(tab)
    ? zeilenVon(tab).filter(z => !z.__archiviert) : zeilenVon(tab);
}

function filtern(tab) {
  const z = zustand[tab];
  const worte = z.suche.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const archivWeg = hatArchiv(tab) && !archivSichtbar(tab);

  return zeilenVon(tab).filter(function (zeile) {
    if (archivWeg && zeile.__archiviert) return false;
    for (const wort of worte) if (zeile.__such.indexOf(wort) === -1) return false;

    for (const k of Object.keys(z.facetten)) {
      const werte = z.facetten[k];
      if (!werte || !werte.length) continue;
      if (werte.indexOf(facettenWert(zeile, k)) === -1) return false;
    }
    for (const k of Object.keys(z.zeit)) {
      if (z.zeit[k] && !zeitPasst(zeile[k], z.zeit[k])) return false;
    }
    if (z.speicher && !speicherPasst(zeile.SCCM_DiskCFreeGB, z.speicher)) return false;
    if (z.programm) {
      const stufe = Modell.stufe(zeile[z.programm]);
      if (z.programmStufe) {
        if (String(stufe) !== z.programmStufe) return false;
      } else if (stufe === 0) return false;
    }
    if (z.rolle && !(zeile.__rollen || []).some(e => String(e.rolle.id) === z.rolle)) return false;
    return true;
  });
}

/* Zahl einer Zahlenspalte; leer oder unlesbar = null. */
function zahlWert(w) {
  if (w === "" || w === null || w === undefined) return null;
  const n = Number(w);
  return isNaN(n) ? null : n;
}

function textLeer(w) { return w === null || w === undefined || String(w).trim() === ""; }

/* Leere Werte (in der Liste «–») stehen bei jedem Spaltentyp und in beiden
   Richtungen am Ende: wer sortiert, will zuerst die Werte sehen. */
function leerZuletzt(xLeer, yLeer) { return xLeer === yLeer ? 0 : (xLeer ? 1 : -1); }

function sortieren(tab, zeilen) {
  const z = zustand[tab];
  const schluessel = z.sortSpalte;
  const richtung = z.sortAuf ? 1 : -1;
  const s = spalte(tab, schluessel);
  const typ = s ? s.t : "Text";
  const istProgramm = s && s.q === "programm";

  return zeilen.slice().sort(function (a, b) {
    const x = a[schluessel], y = b[schluessel];
    if (istProgramm) {
      // Ohne Berechtigung (Stufe 0) zeigt die Zelle «–»: leer.
      const sx = Modell.stufe(x), sy = Modell.stufe(y);
      if (!sx || !sy) return leerZuletzt(!sx, !sy);
      return (sx - sy) * richtung;
    }
    if (typ === "DateTime") {
      const dx = Hilfe.datum(x), dy = Hilfe.datum(y);
      if (!dx || !dy) return leerZuletzt(!dx, !dy);
      return (dx.getTime() - dy.getTime()) * richtung;
    }
    if (typ === "Number") {
      const nx = zahlWert(x), ny = zahlWert(y);
      if (nx === null || ny === null) return leerZuletzt(nx === null, ny === null);
      return (nx - ny) * richtung;
    }
    if (typ === "Boolean") return ((x ? 1 : 0) - (y ? 1 : 0)) * richtung;
    const lx = textLeer(x), ly = textLeer(y);
    if (lx || ly) return leerZuletzt(lx, ly);
    return Hilfe.vergleiche(x, y) * richtung;
  });
}

/* Sortiert wird nur nach einer gewählten Spalte. Wird die sortierte Spalte
   im Spaltenblatt abgewählt (oder nennt ein Link eine Sortierung ohne ihre
   Spalte), gilt wieder die Standardsortierung nach dem Namen – sonst
   stünde die Liste in einer Reihenfolge, die kein Pfeil im Kopf erklärt. */
function sortierungPruefen(tab) {
  const z = zustand[tab];
  if (z.sortSpalte === TAB[tab].sortSpalte || z.spalten.indexOf(z.sortSpalte) > -1) return;
  z.sortSpalte = TAB[tab].sortSpalte;
  z.sortAuf = true;
}

function neuBerechnen(tab) {
  sortierungPruefen(tab);
  sichtbar[tab] = sortieren(tab, filtern(tab));
}

function alleNeuBerechnen() { for (const tab of TABELLEN) neuBerechnen(tab); }

function aktiveFilter(tab) {
  const z = zustand[tab];
  let n = 0;
  for (const k of Object.keys(z.facetten)) n += (z.facetten[k] || []).length;
  for (const k of Object.keys(z.zeit)) if (z.zeit[k]) n++;
  if (z.speicher) n++;
  if (z.programm) n++;
  if (z.rolle) n++;
  return n;
}

function filterZuruecksetzen(tab, mitSuche) {
  const z = zustand[tab];
  if (mitSuche) z.suche = "";
  z.facetten = {};
  z.zeit = {};
  z.speicher = "";
  z.programm = "";
  z.programmStufe = "";
  z.rolle = "";
}

function facetteSetzen(z, schluessel, wert) { z.facetten[schluessel] = [wert]; }

/* Zählt die Werte einer Spalte, die häufigsten zuerst; "" = leer.

   Solange archivierte Geräte ausgeblendet sind, zählen sie nicht mit –
   sonst verspräche die Facette Zeilen, die die Liste nicht zeigt. Die
   Statusfacette zählt sie immer (sonst liesse sich «Archiviert» nie
   anwählen). «ohneArchiv» erzwingt das Weglassen (Übersicht: ihr Sprung
   blendet die archivierten aus). */
function werteZaehlen(tab, schluessel, ohneArchiv) {
  const archivWeg = hatArchiv(tab)
    && (ohneArchiv || (schluessel !== "__statusText" && !archivSichtbar(tab)));
  const zaehler = new Map();
  for (const z of zeilenVon(tab)) {
    if (archivWeg && z.__archiviert) continue;
    const w = facettenWert(z, schluessel);
    zaehler.set(w, (zaehler.get(w) || 0) + 1);
  }
  return Array.from(zaehler.entries())
    .sort((a, b) => b[1] - a[1] || Hilfe.vergleiche(a[0], b[0]));
}

function zaehle(liste, pruefung) {
  let n = 0;
  for (const z of liste) if (pruefung(z)) n++;
  return n;
}

/* Die Clients, die für Kennzahlen und Planung zählen: alles ausser den
   archivierten. */
function aktiveClients(tab) { return zeilenVon(tab).filter(z => !z.__archiviert); }


/* ==================================================================
   5. Hilfen: Sprünge, Adressen, Stelle in der Liste
   ================================================================== */

/* Adresse einer Liste mit gesetztem Filter: dieselbe Form wie der Hash,
   gebaut vom selben Adressbauer wie die Sprünge der Detailseiten
   (UI.adresse.liste). Damit sind alle Sprünge echte Links (Mittel-/
   Ctrl-Klick: neuer Tab). */
function sprungAdresse(tab, setzen) {
  if (istUebersicht(tab)) return UI.adresse.liste(tab);
  const z = tab === "kamerarechte" || tab === "software" ? leererRechteZustand() : leererTabZustand(tab);
  if (setzen) setzen(z);
  return UI.adresse.liste(tab, parameterVon(tab, z, true));
}

function modifiziert(ev) {
  return !!ev && (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey || (ev.button !== undefined && ev.button > 0));
}

/* Klick auf einen Sprung-Link: ein schlichter Klick bleibt auf der Seite
   (kein Neuladen), ein modifizierter öffnet den Link wie gewohnt. */
function sprungKlick(tab, setzen) {
  return function (ev) {
    if (modifiziert(ev)) return;
    if (ev) ev.preventDefault();
    springeMitFilter(tab, setzen);
  };
}

/* In eine Liste springen, nur mit dem übergebenen Filter. Die archivierten
   Geräte sind danach ausgeblendet – genau wie die Kennzahl, die den Sprung
   ausgelöst hat, sie nicht mitzählt. */
function springeMitFilter(tab, setzen) {
  if (istUebersicht(tab) || tab === "software") return ansichtWechseln(tab);
  if (tab === "kamerarechte") {
    zustand.kamerarechte = leererRechteZustand();
    if (setzen) setzen(zustand.kamerarechte);
    if (zustand.ansicht === tab) {
      zeichneKamerarechteAnsicht();
      hashSchreiben();
      return Promise.resolve(true);
    }
    return ansichtWechseln(tab);
  }
  const z = zustand[tab];
  filterZuruecksetzen(tab, true);
  /* Auch gemerkt: sonst stünde nach dem Neuladen wieder die gemerkte
     Einstellung da, und die Liste zeigte mehr, als die Zahl versprach. */
  if (hatArchiv(tab) && z.archiv) { z.archiv = false; einstellungenMerken(tab); }
  if (setzen) setzen(z);
  neuBerechnen(tab);
  const k = knoten[tab];
  if (k && k.rahmen) { k.rahmen.scrollTop = 0; k.rahmen.scrollLeft = 0; }
  if (zustand.ansicht === tab) {
    zeichneTabellenAnsicht(tab);
    hashSchreiben();
    return Promise.resolve(true);
  }
  return ansichtWechseln(tab);
}

/* Detailseiten sind echte Links: sie öffnen im selben Tab, Ctrl-, Shift-
   oder Mittelklick in einem neuen. Vorher merkt sich die Seite die volle
   Listenadresse samt Filtern, damit der Zurück-Link der Detailseite genau
   hierher führt (tabellenGeruest, softwareKarte, rollenKarte). */
function detailAdresse(tab, id) {
  if (tab === "benutzer") return UI.adresse.benutzer(id);
  if (tab === "telefone") return UI.adresse.telefon(id);
  if (tab === "kameras") return UI.adresse.kamera(id);
  if (tab === "kamerarechte") return UI.adresse.kamerarolle(id);
  return UI.adresse.client(tab, id);
}

/* ---------- Stelle in der Liste ----------

   Die Zurück-Taste holt die Hauptseite aus dem Cache des Browsers: die
   Liste steht dort, wo sie war. Der Zurück-Link der Detailseite lädt sie
   dagegen neu, und die Tabelle stünde wieder oben. Darum merkt sich die
   Seite beim Öffnen eines Datensatzes im selben Tab die Adresse, die
   Rollposition und die geöffnete Zeile (sessionStorage, nur dieser Tab)
   und stellt sie beim ersten Inhalt einmal wieder her – nur wenn die Seite
   mit genau dieser Adresse geöffnet wird. */
const SPEICHER_STELLE = "ictinventar.listenstelle";

function stelleMerken(id) {
  const k = knoten[zustand.ansicht];
  const tafel = Rahmen.elemente().tafel;
  const stelle = {
    adresse: location.search + location.hash,
    ansicht: zustand.ansicht,
    oben: k && k.rahmen ? k.rahmen.scrollTop : 0,
    links: k && k.rahmen ? k.rahmen.scrollLeft : 0,
    tafel: tafel ? tafel.scrollTop : 0,
    id: id === null || id === undefined ? null : String(id)
  };
  try { sessionStorage.setItem(SPEICHER_STELLE, JSON.stringify(stelle)); } catch (e) { /* privat */ }
}

function stelleVergessen() {
  try { sessionStorage.removeItem(SPEICHER_STELLE); } catch (e) { /* privat */ }
}

/* Einmal lesen (danach ist sie verbraucht); null, wenn die Seite mit einer
   anderen Adresse geöffnet wurde. Vor dem ersten hashSchreiben aufrufen. */
function stelleHolen() {
  let stelle = null;
  try { stelle = JSON.parse(sessionStorage.getItem(SPEICHER_STELLE) || "null"); } catch (e) { stelle = null; }
  stelleVergessen();
  return stelle && typeof stelle === "object" && stelle.adresse === location.search + location.hash ? stelle : null;
}

/* Nach dem ersten Inhalt (vorher ist die Ansicht ausgeblendet und rollt
   nicht). Steht die geöffnete Zeile an der alten Stelle nicht mehr im
   Bild – gelöscht, umsortiert, die Liste ist kürzer geworden –, holt die
   Tabelle sie in die Mitte. */
function stelleWiederherstellen(stelle) {
  if (!stelle || stelle.ansicht !== zustand.ansicht) return;
  const k = knoten[zustand.ansicht];
  if (TABELLEN.indexOf(zustand.ansicht) === -1 || !k) {
    const tafel = Rahmen.elemente().tafel;
    if (tafel) tafel.scrollTop = Number(stelle.tafel) || 0;
    return;
  }
  const r = k.rahmen;
  r.scrollTop = Number(stelle.oben) || 0;
  r.scrollLeft = Number(stelle.links) || 0;
  const tr = stelle.id ? k.koerper.querySelector("tr[data-id=\"" + CSS.escape(stelle.id) + "\"]") : null;
  if (!tr) return;
  const kopfHoehe = k.kopfZeile.getBoundingClientRect().height;
  const rr = r.getBoundingClientRect();
  const zr = tr.getBoundingClientRect();
  if (zr.top < rr.top + kopfHoehe || zr.bottom > rr.top + r.clientHeight) {
    r.scrollTop += zr.top - rr.top - kopfHoehe - (r.clientHeight - kopfHoehe - zr.height) / 2;
  }
}


/* ==================================================================
   6. Tabellenansichten
   ================================================================== */

/* Die einmal gebauten Knoten je Ansicht. Sie bleiben stehen; nachgeführt
   werden nur ihre Werte (Fokus und Übergänge bleiben so erhalten). */
const knoten = {};

const NEU = {
  admin: { text: "Neuer ADMIN-Client", adresse: () => UI.adresse.client("admin", null, { neu: true }) },
  edu: { text: "Neuer EDU-Client", adresse: () => UI.adresse.client("edu", null, { neu: true }) },
  telefone: { text: "Neue Telefonnummer", adresse: () => UI.adresse.telefon(null, { neu: true }) },
  software: { text: "Neues Programm", adresse: () => UI.adresse.software(null, { neu: true }) }
};

function neuKnopf(tab) {
  if (!NEU[tab]) return null;
  /* Ein echter Link: Mittelklick öffnet das Formular in einem neuen Tab.
     Vorher die Liste merken, damit «Zurück» samt Filtern hierher führt. */
  return UI.knopf({ text: NEU[tab].text, variante: "primaer", sinnbild: "plus", href: NEU[tab].adresse(),
    id: tab + "-knopf-neu", klasse: "knopf-neu", beiKlick: function (ev) {
      UI.adresse.listeMerken();
      if (!modifiziert(ev)) stelleMerken(null);
    } });
}

/* Ein Knopf, der ein Blatt öffnet: aria-expanded für den Zustand; solange
   es offen ist, ist er tonal (bausteine.css: [aria-haspopup][aria-expanded]). */
function blattKnopf(tab, art, text, sinnbild, beiKlick) {
  const k = UI.knopf({ text: text, sinnbild: sinnbild, variante: "still", id: tab + "-knopf-" + art, beiKlick: beiKlick });
  k.setAttribute("aria-haspopup", "dialog");
  k.setAttribute("aria-expanded", "false");
  return k;
}

function knopfOffen(k, offen) {
  k.setAttribute("aria-expanded", offen ? "true" : "false");
}

/* Trefferzahl und «Neu …» bleiben zusammen am rechten Ende der Leiste,
   auch wenn sie umbricht. */
function leistenEnde(anzahl, neu) {
  return anhaengen(el("div", "werkzeugleiste-ende"), [anzahl, neu]);
}

function tabellenGeruest(tab) {
  const ansicht = $("ansicht-" + tab);
  const titel = Rahmen.zielText(tab);
  const kopf = UI.seitenkopf({ titel: titel, titelId: tab + "-titel" });

  const suchfeld = UI.suchfeld({
    id: tab + "-suche", platzhalter: SUCH_PLATZHALTER[tab], label: titel + " durchsuchen", kuerzel: "/",
    beiEingabe: function (wert) { zustand[tab].suche = wert; nachFilter(tab); }
  });
  const filterKnopf = blattKnopf(tab, "filter", "Filter", "filter", function () { filterOeffnen(tab); });
  const filterZaehler = UI.zaehler("");
  filterKnopf.appendChild(filterZaehler);
  const spaltenKnopf = blattKnopf(tab, "spalten", "Spalten", "spalten", function () { spaltenOeffnen(tab); });
  /* Mit dem Wert gebaut: die Zahl ist von Anfang an da und ploppt nicht
     beim ersten Zeigen der Liste (nur ein Filterzähler, der erscheint). */
  const spaltenZaehler = UI.zaehler(String(sichtbareSpalten(tab).length), true);
  spaltenKnopf.appendChild(spaltenZaehler);
  const csvKnopf = UI.knopf({ text: "CSV", sinnbild: "herunterladen", variante: "still", id: tab + "-knopf-csv",
    titel: "Sichtbare Zeilen und Spalten als CSV herunterladen",
    beiKlick: function () { csvExport(tab); } });
  const anzahl = el("p", "anzahl");
  anzahl.id = tab + "-anzahl";
  anzahl.setAttribute("aria-live", "polite");
  const leiste = anhaengen(el("div", "ds-action-bar"),
    [suchfeld, filterKnopf, spaltenKnopf, csvKnopf, leistenEnde(anzahl, neuKnopf(tab))]);

  // Aktive Filter als Chips mit × (ICT) und «Alle Filter entfernen»: keine
  // Filtergruppe von Dashboard-Style, darum .chip-zeile (UI.chips, §4.2);
  // ohne Filter leer und ohne Platz.
  const chips = el("div", "chip-zeile");
  chips.id = tab + "-chips";

  /* Jede Zeile öffnet ihren Datensatz (Dashboard-Style
     .ds-table--interactive: Zeiger, Zustands- und Fokusebene, Fokusring
     auf der Zeile). Ihr Link ist der Name (.ds-table__row-link); einen
     Klick in die übrigen Zellen reicht DS.ripple an ihn weiter (die
     klebende erste Spalte, .ds-table--pin-first, begrenzt ihn auf seine
     Zelle). Vor einem neuen Tab merkt sich die Seite die Liste für dessen
     Zurück-Link (linkGeoeffnet). */
  const tabelle = el("table", "ds-table ds-table--interactive");
  tabelle.id = tab + "-tabelle";
  tabelle.appendChild(el("caption", "ds-sr", titel));
  const kopfZeile = el("thead");
  const koerper = el("tbody");
  koerper.id = tab + "-koerper";
  anhaengen(tabelle, [kopfZeile, koerper]);
  const rahmen = UI.tabellenRahmen(tabelle, { id: tab + "-rahmen" });
  rahmen.setAttribute("data-rolle", tab + "-rahmen");

  /* Der Leerzustand steht in einer umrandeten Fläche an der Stelle der
     Liste. */
  const leer = UI.karte({ klasse: "tabelle-leer", id: tab + "-leer" });
  leer.hidden = true;

  anhaengen(ansicht, [kopf, leiste, chips, rahmen, leer]);

  /* EIN Zuhörer für alle Klicks in den Zeilen (sie werden abgeglichen,
     nicht neu gebaut): ein Link (Datensatz, Inhaber, Gerät) arbeitet wie
     jeder Link; vorher merkt sich die Seite die Liste und, im selben Tab,
     die Stelle darin. Ein Klick in eine Zelle ohne eigenes Bedienelement
     kommt vor DS.ripple hier vorbei, das ihn danach an den Zeilenlink
     weiterreicht (schlicht als dessen Klick, sonst in einem neuen Tab):
     auch dafür ist die Liste schon gemerkt. */
  function linkGeoeffnet(ev) {
    const tr = ev.target.closest ? ev.target.closest("tr[data-id]") : null;
    if (!tr) return;
    UI.adresse.listeMerken();
    const link = ev.target.closest("a[href]");
    if (!link) return;
    const neuerTab = ev.type === "auxclick" || ev.ctrlKey || ev.metaKey || ev.shiftKey;
    if (!neuerTab) stelleMerken(tr.getAttribute("data-id"));
  }
  koerper.addEventListener("click", linkGeoeffnet);
  koerper.addEventListener("auxclick", function (ev) { if (ev.button === 1) linkGeoeffnet(ev); });

  knoten[tab] = {
    ansicht: ansicht, kopf: kopf, suchfeld: suchfeld, filterKnopf: filterKnopf, filterZaehler: filterZaehler,
    spaltenKnopf: spaltenKnopf, spaltenZaehler: spaltenZaehler, anzahl: anzahl, chips: chips,
    tabelle: tabelle, kopfZeile: kopfZeile, kopfSignatur: null, koerper: koerper, rahmen: rahmen,
    leer: leer, leerArt: null, leerZeigt: false
  };
}

/* ---------- Zellinhalt ---------- */

function leerZelle(td) {
  td.appendChild(el("span", "t-still", "–"));
  return td;
}

/* Lange Werte enden in der Liste mit «…»; der Tooltip zeigt sie ganz
   (UI.tipp zeigt ihn nur, solange die Zelle wirklich abgeschnitten ist). */
function textZelle(td, text) {
  if (!text) return leerZelle(td);
  td.textContent = text;
  if (text.length > 32) UI.tipp(td, text);
  return td;
}

function stufenZelle(td, wert, spaltenObjekt) {
  const stufe = Modell.stufe(wert);
  if (stufe === 0) return leerZelle(td);
  if (stufe === 1) {
    td.appendChild(UI.status("An", "erfolg"));
    return td;
  }
  td.appendChild(UI.status("AD", "erfolg", { sinnbild: "schloss" }));
  UI.tipp(td, Modell.sperrHinweis(spaltenObjekt));
  return td;
}

/* Online-Zustand vor dem PC-Namen: Form (WLAN bzw. durchgestrichen) und
   ein unsichtbares Wort sagen ihn, die Farbe nur zusätzlich; der Tooltip
   schreibt ihn aus. Kennt SCCM das Gerät nicht, ist der Zustand unbekannt
   (nicht «offline»): dann steht ein leerer Platz gleicher Breite da, damit
   die Namen der Spalte fluchten. */
function onlineZeichen(zeile) {
  const z = el("span", "name-zustand");
  if (!zeile.__inSccm) {
    z.setAttribute("aria-hidden", "true");
    return z;
  }
  const online = !!zeile.__online;
  z.classList.add(online ? "t-erfolg" : "t-still");
  z.appendChild(UI.sinnbild(online ? "online" : "offline", 16));
  z.appendChild(el("span", "ds-sr", online ? "online: " : "offline: "));
  const zuletzt = Hilfe.relativText(zeile.SCCM_LastActive);
  UI.tipp(z, online ? "Online" : "Offline" + (zuletzt ? " – zuletzt aktiv " + zuletzt : ""));
  return z;
}

/* Bildqualität vor dem Kameranamen: bei «Genügend» eine gelbe, bei
   «Schlecht» eine rote Kamera; Tooltip und unsichtbares Wort sagen es
   auch ohne Farbe. Sonst bleibt der Platz leer (die Namen fluchten). */
const QUALITAET_TON = { "Genügend": "t-warnung", "Schlecht": "t-gefahr" };

function qualitaetZeichen(zeile) {
  const z = el("span", "name-zustand");
  const wert = String(zeile.Qualitaet || "").trim();
  const ton = QUALITAET_TON[wert];
  if (!ton) {
    z.setAttribute("aria-hidden", "true");
    return z;
  }
  z.classList.add(ton);
  z.appendChild(UI.sinnbild("kamera", 16));
  z.appendChild(el("span", "ds-sr", "Bildqualität " + wert.toLowerCase() + ": "));
  UI.tipp(z, "Bildqualität " + wert.toLowerCase());
  return z;
}

function personLink(b, text) {
  const link = el("a", "name-link", text);
  link.href = UI.adresse.benutzer(b.id);
  return link;
}

function zelle(tab, zeile, schluessel) {
  const s = spalte(tab, schluessel);
  const wert = zeile[schluessel];
  const td = el("td");

  // Namensspalte: der Link der Zeile (.ds-table__row-link, siehe tabellenGeruest).
  if (schluessel === TAB[tab].namensSpalte) {
    td.className = "ds-nowrap";
    if (istClientTab(tab)) td.appendChild(onlineZeichen(zeile));
    else if (tab === "kameras") td.appendChild(qualitaetZeichen(zeile));
    const text = String(wert || "").trim()
      || (tab === "benutzer" ? String(zeile.Title || "(ohne Namen)")
        : (tab === "telefone" ? (zeile.__kurzwahl || "(ohne Kurzwahl)") : "(ohne Namen)"));
    const link = el("a", "name-link ds-table__row-link", text);
    link.href = detailAdresse(tab, zeile.id);
    link.setAttribute("data-fokus", tab + "-zeile-" + zeile.id);
    td.appendChild(link);
    return td;
  }

  if (s && s.q === "programm") return stufenZelle(td, wert, s);

  if (tab === "telefone") {
    /* «Frei» ist kein Problem, sondern ein Angebot: neutral mit Haken im
       Kreis, auf allen Seiten gleich (Telefon- und Benutzerseite). «Aktiv»
       ist der Normalfall und bleibt Text. Einen Tooltip braucht nur
       «Inaktiv». */
    if (schluessel === "__statusText") {
      const st = zeile.__status;
      if (st === "Frei") td.appendChild(UI.status("Frei", "neutral", { sinnbild: "checkKreis" }));
      else if (st === "Inaktiv") td.appendChild(UI.status("Inaktiv", "aus"));
      else td.textContent = st;
      UI.tipp(td, st === "Inaktiv" ? "Vorhanden, aber nicht in Teams" : null);
      return td;
    }
    /* «Zugewiesen» ist der Normalfall und bleibt Text; nur die nicht
       zugewiesene Nummer, die nicht frei ist, bekommt den Warnstatus. Eine
       freie Nummer ist mit Absicht niemandem zugewiesen: «Nein» als Text
       (ihr Status «Frei» steht daneben). Keine getönte Zeile. */
    if (schluessel === "__zugewiesenText") {
      if (zeile.__zugewiesen) td.textContent = "Ja";
      else if (zeile.__status === "Frei") td.textContent = "Nein";
      else td.appendChild(UI.status("Nicht zugewiesen", "warnung"));
      return td;
    }
    if (schluessel === "__nameAbweichungText") {
      if (!zeile.__nameAbweichung) { td.textContent = "Nein"; return td; }
      td.appendChild(UI.status("Weicht ab", "warnung"));
      UI.tipp(td, "Liste: " + zeile.Name + " – AD: " + zeile.__benutzerName);
      return td;
    }
    if (schluessel === "__benutzerName" && zeile.__benutzerZeile) {
      const b = zeile.__benutzerZeile;
      td.className = "ds-nowrap";
      td.appendChild(personLink(b, zeile.__benutzerName));
      // Eine Regel, ein Text und ein Ton für alle Seiten (Modell.adStatus).
      const ad = Modell.adStatus(b);
      if (!ad.aktiv) {
        td.appendChild(document.createTextNode(" "));
        td.appendChild(UI.status(ad.text, ad.ton));
      }
      return td;
    }
  }

  if (tab === "kameras") {
    /* Der Normalfall bleibt Text; nur was auffällt, bekommt einen Status. */
    if (schluessel === "__aufzeichnungText") {
      if (!zeile.__inMilestone) return leerZelle(td);
      if (zeile.__aufzeichnung) td.textContent = "Ja";
      else td.appendChild(UI.status("Keine Aufzeichnung", "warnung"));
      return td;
    }
    if (schluessel === "__aktivText") {
      if (!zeile.__inMilestone) return leerZelle(td);
      if (zeile.__aktiv) td.textContent = "Ja";
      else td.appendChild(UI.status("Deaktiviert", "warnung", { sinnbild: "aus" }));
      return td;
    }
    if (schluessel === "__inMilestoneText") {
      if (zeile.__inMilestone) td.textContent = "Ja";
      else td.appendChild(UI.status(String(zeile.MS_HardwareId || "").trim() ? "Nicht mehr" : "Nie", "neutral"));
      return td;
    }
    if (schluessel === "__unbenanntText") {
      if (!zeile.__unbenannt) { td.textContent = "Nein"; return td; }
      td.appendChild(UI.status(zeile.__unbenannt === 1 ? "1 Kanal" : zeile.__unbenannt + " Kanäle", "warnung"));
      return td;
    }
    if (schluessel === "__rollenText") {
      if (!zeile.__rollenNamen.length) return leerZelle(td);
      return textZelle(td, zeile.__rollenText);
    }
  }

  /* Status: der Normalfall «Aktiv» bleibt Text; Lager und Archiv bekommen
     einen Status mit eigenem Sinnbild. */
  if (hatArchiv(tab) && schluessel === "__statusText") {
    const st = zeile.__status;
    if (st === "Lager") td.appendChild(UI.status("Lager", "neutral", { sinnbild: "lager" }));
    else if (st === ARCHIVIERT) td.appendChild(UI.status(ARCHIVIERT, "neutral", { sinnbild: "archiv" }));
    else td.textContent = st;
    return td;
  }

  /* Der Inhaber ist genau eine Person; mehr als ein Inhaber ist ein zu
     bereinigender Datenfehler. */
  if (istClientTab(tab) && schluessel === "__inhaberName") {
    if (!zeile.__inhaber) return leerZelle(td);
    td.className = "ds-nowrap";
    td.appendChild(personLink(zeile.__inhaber, zeile.__inhaberName));
    if (zeile.__mehrfachInhaber) {
      td.appendChild(document.createTextNode(" "));
      td.appendChild(UI.status("+" + (zeile.__inhaberAlle.length - 1), "warnung", {
        titel: "Mehr als ein Inhaber: " + zeile.__inhaberAlle.map(p => p.__name).join(", ")
      }));
    }
    return td;
  }

  /* Der Verlauf steht als JSON in der Spalte; gezeigt wird der jüngste
     Eintrag, der Tooltip nennt alle. */
  if (schluessel === "Verlauf") {
    const liste = Modell.verlaufLesen(wert);
    if (!liste.length) return leerZelle(td);
    const juengster = liste[0];
    td.textContent = Modell.datumSchweiz(juengster.datum) + "  " + juengster.text
      + (liste.length > 1 ? "  (+" + (liste.length - 1) + ")" : "");
    UI.tipp(td, liste.map(e => Modell.datumSchweiz(e.datum) + "  " + e.text).join("\n"));
    return td;
  }

  /* Das Gerät der Person: Verweis über die Listen-ID (der Name ist kein
     Schlüssel), ein archiviertes mit Status. Zeigt die ID ins Leere
     (Gerät gelöscht), steht eine Warnung. */
  if (tab === "benutzer" && schluessel === "__computerName") {
    if (zeile.__geraetFehlt) {
      td.appendChild(UI.status("Gerät fehlt", "warnung", { titel: "Listen-ID " + zeile.__clientId + " fehlt in der Liste «ADMIN-Clients»" }));
      return td;
    }
    const c = zeile.__client;
    if (!c) return leerZelle(td);
    td.className = "ds-nowrap";
    const link = el("a", "name-link", String(c.Title || "").trim() || "(ohne Namen)");
    link.href = detailAdresse("admin", c.id);
    td.appendChild(link);
    if (c.__archiviert) {
      td.appendChild(document.createTextNode(" "));
      td.appendChild(UI.status(ARCHIVIERT, "neutral", { sinnbild: "archiv" }));
    }
    return td;
  }

  /* Ein deaktiviertes AD-Konto ist eine Abweichung (Kennzahl «AD-Konto
     deaktiviert»): Status mit Sinnbild statt farbigem Text. Regel und Ton
     wie auf allen Seiten (Modell.adStatus); in der Spalte genügt das kurze
     Wort, ihr Kopf sagt schon «AD-Konto». */
  if (tab === "benutzer" && schluessel === "__adAktivText") {
    const ad = Modell.adStatus(zeile);
    if (ad.aktiv) td.textContent = "Ja";
    else td.appendChild(UI.status(ad.kurz, ad.ton));
    return td;
  }

  /* Das geplante Ersatzjahr als Chip in der Farbe seines Ersatzstatus:
     überfällig als Gefahr, im laufenden Geschäftsjahr als Warnung mit
     Kalender, später als Erfolg. Der grüne Chip für den Normalfall ist
     eine bewusste Ausnahme (Entscheid vom 19.10.2026, STYLEGUIDE.md §4.3).
     Nur ein Jahr ohne Ersatzstatus (ungültig, nicht erfasst) bleibt Text.
     Das Statuswort steht für Screenreader im Chip (.ds-sr, wie beim
     Online-Zeichen; Status nie nur über Farbe), sichtbar im Tooltip –
     ohne Tabstopp je Zeile. */
  if (schluessel === "ErsatzGeplant" && String(wert || "").trim()) {
    const st = zeile.__ersatzStatus;
    const jahr = String(wert).trim();
    const tipp = ERSATZ_TEXT[st] || ERSATZ_TEXT.unbekannt;
    if (st === "ueberfaellig" || st === "bald" || st === "ok") {
      const ton = st === "ueberfaellig" ? "gefahr" : (st === "bald" ? "warnung" : "erfolg");
      const marke = UI.status(jahr, ton, st === "bald" ? { sinnbild: "kalender" } : undefined);
      marke.insertBefore(el("span", "ds-sr", tipp + ": "), marke.querySelector(".status-text"));
      UI.tipp(marke, tipp);
      td.appendChild(marke);
    } else {
      td.textContent = jahr;
      UI.tipp(td, tipp);
    }
    return td;
  }

  if (schluessel === "__ersatzText") {
    const st = zeile.__ersatzStatus;
    if (st === "ueberfaellig") td.appendChild(UI.status(ERSATZ_TEXT.ueberfaellig, "gefahr"));
    else if (st === "bald") td.appendChild(UI.status(ERSATZ_TEXT.bald, "warnung", { sinnbild: "kalender" }));
    else td.textContent = ERSATZ_TEXT[st] || ERSATZ_TEXT.unbekannt;
    return td;
  }

  if (!s) return textZelle(td, wert === null || wert === undefined ? "" : String(wert));
  if (s.t === "Boolean") { td.textContent = wert ? "Ja" : "Nein"; return td; }
  if (s.t === "DateTime") {
    const text = UI.zeitText(wert);
    if (!text) return leerZelle(td);
    td.textContent = text;
    UI.tipp(td, Hilfe.relativText(wert));
    return td;
  }
  if (s.t === "Number") {
    td.className = "ds-num";
    const text = Hilfe.zahlText(wert);
    if (!text) return leerZelle(td);
    td.textContent = text;
    return td;
  }
  if (s.t === "Note") {
    const z = Hilfe.zeilen(wert);
    if (!z.length) return leerZelle(td);
    td.textContent = z[0] + (z.length > 1 ? "  (+" + (z.length - 1) + ")" : "");
    if (z.length > 1 || z[0].length > 32) UI.tipp(td, z.join("\n"));
    return td;
  }
  return textZelle(td, wert === null || wert === undefined ? "" : String(wert).trim());
}

/* ---------- Tabelle ---------- */

function sortierRichtung(tab) { return zustand[tab].sortAuf ? "auf" : "ab"; }

/* Wie eine Zeichenfunktion ihre Änderung zeigt (Dashboard-Style,
   docs/motion.md «Data motion»):
     undefined   still abgleichen (erstes Zeichnen, Ansichtswechsel, neue
                 Spalten, Sprung aus der Übersicht, Vor/Zurück)
     'umordnen'  der Benutzer sortiert, sucht oder filtert: Zeilen, Karten
                 und Chips gleiten an ihren neuen Platz, neue blenden ein
     'live'      Daten kamen von selbst (Nachladen, anderes Fenster): wie
                 'umordnen', aber gehalten, solange Zeiger oder Fokus in der
                 Liste sind; Kennzahlen zählen vom gezeigten Wert */
function zeigen(behaelter, neu, art, eintraege) {
  if (!art) { UI.abgleichen(behaelter, neu); return; }
  Bewegung.umordnen(behaelter, function (o) { UI.abgleichen(behaelter, neu, o); },
    { eintraege: eintraege, live: art === "live" });
}

/* Jedes Bedienelement mit Zuhörer trägt einen data-fokus; als Schlüssel
   (data-ds-key) sorgt er dafür, dass UI.abgleichen einen behaltenen Knoten
   samt Zuhörer nur in sein eigenes Gegenstück patcht, nie in den Knopf
   eines anderen Datensatzes (die Zuhörer der neuen Knoten verfallen). */
function schluesselSetzen(knotenListe) {
  for (const k of [].concat(knotenListe)) {
    if (!k || !k.querySelectorAll) continue;
    for (const f of [k].concat(Array.from(k.querySelectorAll("[data-fokus]")))) {
      if (!f.hasAttribute("data-fokus") || f.hasAttribute("data-ds-key")) continue;
      const fokus = f.getAttribute("data-fokus");
      f.setAttribute("data-ds-key", fokus);
      // Steht er allein in einem Listeneintrag (Verteilung, Kennwerte),
      // trägt auch der Eintrag den Schlüssel: so gleitet die Zeile beim
      // Umordnen als Ganzes an ihren neuen Platz.
      const li = f.parentElement;
      if (li && li.tagName === "LI" && li.children.length === 1 && !li.hasAttribute("data-ds-key")) {
        li.setAttribute("data-ds-key", "zeile-" + fokus);
      }
    }
  }
  return knotenListe;
}

/* Kopf und Körper. Der Kopf entsteht nur neu, wenn sich die Spalten
   ändern; sonst wird nur die Sortierung nachgeführt (der Fokus bleibt auf
   dem Sortierknopf). Der Körper wird abgeglichen (art wie bei zeigen). */
function zeichneTabelle(tab, art) {
  const k = knoten[tab];
  const z = zustand[tab];
  const spalten = sichtbareSpalten(tab);
  const signatur = spalten.join(",");

  if (k.kopfSignatur !== signatur) {
    const neu = UI.tabellenKopf(spalten.map(function (s) {
      const sp = spalte(tab, s);
      return { schluessel: s, text: beschriftung(tab, s), zahl: !!sp && sp.t === "Number" };
    }), {
      sortiert: z.sortSpalte, richtung: sortierRichtung(tab),
      beiSortieren: function (schluessel) {
        if (z.sortSpalte === schluessel) z.sortAuf = !z.sortAuf;
        else { z.sortSpalte = schluessel; z.sortAuf = true; }
        k.kopfZeile.sortierungSetzen(z.sortSpalte, sortierRichtung(tab));
        neuBerechnen(tab);
        koerperZeichnen(tab, sichtbareSpalten(tab), "umordnen");
        hashSchreiben();
      }
    });
    k.tabelle.replaceChild(neu, k.kopfZeile);
    k.kopfZeile = neu;
    k.kopfSignatur = signatur;
    // Andere Spalten: die Zeilen gleiten nicht, sie ändern nur ihre Zellen.
    art = undefined;
  } else {
    k.kopfZeile.sortierungSetzen(z.sortSpalte, sortierRichtung(tab));
  }

  koerperZeichnen(tab, spalten, art);
  UI.textSetzen(k.anzahl, trefferText(tab, false));
  leerzustandZeigen(tab, art);
}

/* Eine Zeile je Datensatz, Schlüssel = Listen-ID: ein bleibender
   Datensatz behält seine Zeile (Fokus, laufende Bewegung), auch wenn er
   umsortiert wird. Über 50 bewegte Zeilen landet die Änderung ohne
   Bewegung (DS.motion.flip). */
function koerperZeichnen(tab, spalten, art) {
  const k = knoten[tab];
  const zeilen = sichtbar[tab].map(function (zeile) {
    const tr = el("tr");
    tr.setAttribute("data-ds-key", String(zeile.id));
    tr.setAttribute("data-id", String(zeile.id));
    for (const schluessel of spalten) tr.appendChild(zelle(tab, zeile, schluessel));
    return tr;
  });
  zeigen(k.koerper, zeilen, art);
}

function trefferText(tab, mitEinheit) {
  const gezeigt = sichtbar[tab].length;
  const alle = grundmenge(tab).length;
  if (gezeigt === alle) return anzahlText(tab, alle);
  return UI.zahlText(gezeigt) + " von " + UI.zahlText(alle) + (mitEinheit ? " " + einheitDativ(tab, alle) : "");
}

/* ---------- Leerzustand ---------- */

/* Vier Fälle: die Liste fehlt (Konfiguration), sie ist leer, alles ist
   archiviert und ausgeblendet, oder die Filter lassen nichts übrig. Jeder
   sagt, was zu tun ist. */
function leerArt(tab) {
  if (sichtbar[tab].length) return null;
  const hinweis = hinweisVon(tab);
  if (!zeilenVon(tab).length) return hinweis ? "konfig" : "leer";
  const z = zustand[tab];
  if (!z.suche.trim() && !aktiveFilter(tab) && hatArchiv(tab) && !archivSichtbar(tab)) return "archiv";
  return "filter";
}

const LEER_TEXT = {
  admin: "Neue Geräte erscheinen nach dem nächsten SCCM-Abgleich oder über «Neuer ADMIN-Client».",
  edu: "Neue Geräte erscheinen nach dem nächsten SCCM-Abgleich oder über «Neuer EDU-Client».",
  benutzer: "Benutzer kommen mit dem nächsten Abgleich aus dem Active Directory.",
  telefone: "Die erste Nummer lässt sich über «Neue Telefonnummer» erfassen.",
  kameras: "Kameras kommen mit dem nächsten Abgleich aus Milestone."
};

function leerzustandBauen(tab, art) {
  const titel = Rahmen.zielText(tab);
  let l;
  if (art === "konfig") {
    l = UI.leerzustand({ sinnbild: SINNBILD[tab], titel: "Liste «" + titel + "» nicht verfügbar",
      text: hinweisVon(tab) });
  } else if (art === "leer") {
    l = UI.leerzustand({ sinnbild: SINNBILD[tab], titel: "Noch keine " + titel, text: LEER_TEXT[tab] });
  } else if (art === "archiv") {
    l = UI.leerzustand({ sinnbild: "archiv", titel: "Alle " + titel + " sind archiviert",
      aktion: { text: "Archivierte anzeigen", fokus: tab + "-leer-aktion", beiKlick: function () {
        zustand[tab].archiv = true;
        einstellungenMerken(tab);
        knoten[tab].suchfeld.eingabe.focus();
        nachFilter(tab);
      } } });
  } else {
    l = UI.leerzustand({ sinnbild: "suche", titel: "Keine Treffer",
      aktion: { text: "Filter zurücksetzen", fokus: tab + "-leer-aktion", beiKlick: function () {
        filterZuruecksetzen(tab, true);
        suchfeldAngleichen(tab);
        knoten[tab].suchfeld.eingabe.focus();
        nachFilter(tab);
      } } });
  }
  return l;
}

/* Der Leerzustand ersetzt die Liste an ihrer Stelle. Lässt ein Filter des
   Benutzers nichts übrig, blendet er ein, sobald die Zeilen gegangen sind;
   bringt das Zurücksetzen Zeilen zurück, tritt er aus, während sie
   einblenden (Dashboard-Style, docs/components.md «Empty state»). Sonst
   (erstes Zeichnen, Nachladen) wechselt er ohne Bewegung. Sein Inhalt
   entsteht nur neu, wenn sich der Fall ändert (die Knöpfe der Fälle tun
   Verschiedenes, darum ersetzt statt abgeglichen). */
function leerzustandZeigen(tab, art) {
  const k = knoten[tab];
  const fall = leerArt(tab);
  const schluessel = fall === "konfig" ? fall + hinweisVon(tab) : fall;
  if (schluessel !== k.leerArt) {
    k.leerArt = schluessel;
    if (fall) leeren(k.leer.inhalt).appendChild(leerzustandBauen(tab, fall));
  }
  const bewegt = art === "umordnen";
  if (fall && !k.leerZeigt) {
    k.leerZeigt = true;
    k.rahmen.hidden = true;
    if (bewegt) Bewegung.eintreten(k.leer, "blenden");
    else { Bewegung.abbrechen(k.leer); k.leer.hidden = false; }
  } else if (!fall && k.leerZeigt) {
    k.leerZeigt = false;
    k.rahmen.hidden = false;
    if (bewegt) Bewegung.austreten(k.leer, "", { dann: "verbergen", fokus: k.suchfeld.eingabe });
    else { Bewegung.abbrechen(k.leer); k.leer.hidden = true; }
  }
}

/* ---------- Chips und Zähler ---------- */

function zaehlerAnzeigen(tab) {
  const k = knoten[tab];
  const n = aktiveFilter(tab);
  k.filterZaehler.setzen(n || "");
  UI.tipp(k.filterKnopf, n ? (n === 1 ? "1 Filter aktiv" : n + " Filter aktiv") : null);
  const sp = sichtbareSpalten(tab).length;
  k.spaltenZaehler.setzen(sp);
  UI.tipp(k.spaltenKnopf, sp === 1 ? "1 Spalte sichtbar" : sp + " Spalten sichtbar");
}

/* Name eines Filters, wie ihn das Filterblatt nennt. Der Chip trägt
   denselben Namen, damit er sich seinem Filter zuordnen lässt; nur ein
   Filter, den das Blatt nicht kennt (aus einem Link), heisst wie seine
   Spalte. */
const SPEICHER_NAME = "Freier Speicher auf Laufwerk C";
const ROLLE_FILTER_NAME = "Sichtbar für Rolle";

function filterName(tab, schluessel) {
  const f = TAB[tab].facetten.find(x => x.k === schluessel)
    || TAB[tab].zeitspalten.find(x => x.k === schluessel);
  return f ? f.d : beschriftung(tab, schluessel);
}

/* Ein Chip je aktivem Filter aus dem Blatt («Hersteller: HP ×»), ICT-eigen
   (UI.chip mit entfernen: Dashboard-Style hat keinen Chip mit ×). Entfernt
   der Benutzer einen, wirkt das sofort: der Fokus geht an seinen Nachbarn,
   der Chip tritt aus und die übrigen rücken nach (Bewegung.umordnen).

   Die Suche bekommt keinen Chip: ihr Text steht im Suchfeld, dessen ×
   leert sie. Ein Chip erschiene sonst beim ersten Tastendruck und schöbe
   die Tabelle unter der Schreibmarke nach unten (beim Leeren zurück). */
function zeichneChips(tab, art) {
  const k = knoten[tab];
  const z = zustand[tab];
  const liste = [];
  let filterChips = 0;

  function chip(schluessel, text, entfernen, label) {
    liste.push(UI.chip({ text: text, label: label, fokus: tab + "-chip-" + schluessel,
      entfernen: function (ev) { chipEntfernen(tab, ev.currentTarget, entfernen); } }));
  }

  for (const f of Object.keys(z.facetten)) {
    for (const w of z.facetten[f] || []) {
      filterChips++;
      chip("f-" + f + "-" + w, filterName(tab, f) + ": " + facettenWertKodieren(w), function () {
        z.facetten[f] = (z.facetten[f] || []).filter(x => x !== w);
        if (!z.facetten[f].length) delete z.facetten[f];
      });
    }
  }
  for (const f of Object.keys(z.zeit)) {
    const w = z.zeit[f];
    if (!w) continue;
    filterChips++;
    const stufe = ZEITRAEUME.find(s => s.w === w);
    chip("z-" + f + "-" + w, filterName(tab, f) + ": " + (stufe ? stufe.d : w), function () { delete z.zeit[f]; });
  }
  if (z.speicher) {
    filterChips++;
    const stufe = SPEICHERSTUFEN.find(s => s.w === z.speicher);
    chip("speicher-" + z.speicher, SPEICHER_NAME + ": " + (stufe ? stufe.d : z.speicher), function () { z.speicher = ""; });
  }
  if (z.programm) {
    filterChips++;
    // Eine Stufe aus einem von Hand gebauten Link kann unbekannt sein.
    const stufe = PROGRAMM_STUFEN.find(s => s.w === z.programmStufe);
    // «nur von Hand (1)» heisst im Chip nur «nur von Hand» (keine Doppelklammer).
    chip("programm-" + z.programm + "-" + z.programmStufe, "Berechtigung: " + beschriftung(tab, z.programm)
      + (z.programmStufe ? " · " + (stufe ? stufe.d.replace(/\s*\(\d\)$/, "") : z.programmStufe) : ""),
      function () { z.programm = ""; z.programmStufe = ""; });
  }
  if (z.rolle) {
    filterChips++;
    const r = kameraRollen.find(x => String(x.id) === z.rolle);
    chip("rolle-" + z.rolle, ROLLE_FILTER_NAME + ": " + (r ? String(r.Title || "").trim() : "Rolle " + z.rolle), function () { z.rolle = ""; });
  }
  /* Der Archivschalter nimmt einen Filter WEG; als Chip steht er trotzdem
     hier, damit sichtbar ist, warum mehr Geräte in der Liste stehen. Er
     zählt nicht als Filter: «Alle Filter entfernen» legt ihn nicht um. */
  if (hatArchiv(tab) && z.archiv) {
    chip("archiv", "Archivierte eingeblendet", function () { z.archiv = false; einstellungenMerken(tab); },
      "Archivierte Geräte wieder ausblenden");
  }
  /* Entfernt die Filter dieser Zeile, nicht die Suche (die steht im Feld
     und hat keinen Chip) – wie «Filter zurücksetzen» im Filterblatt. Der
     Knopf verschwindet dabei; der Fokus geht an den Filterknopf. */
  if (filterChips > 1) {
    liste.push(UI.knopf({ text: "Alle Filter entfernen", variante: "leise", klein: true, fokus: tab + "-chips-alle",
      beiKlick: function () {
        k.filterKnopf.focus({ preventScroll: true });
        filterZuruecksetzen(tab, false);
        nachFilter(tab);
      } }));
  }
  zeigen(k.chips, schluesselSetzen(liste), art);
}

/* Der Schlüssel eines Chips nennt Filter und Wert: ein behaltener Chip
   entfernt darum immer genau seinen Filter. */
function chipEntfernen(tab, chip, entfernen) {
  const k = knoten[tab];
  if (document.activeElement === chip) {
    const alle = Array.from(k.chips.querySelectorAll(".chip:not([data-ds-leaving])"));
    const i = alle.indexOf(chip);
    (alle[i + 1] || alle[i - 1] || k.filterKnopf).focus({ preventScroll: true });
  }
  entfernen();
  nachFilter(tab);
}

/* ---------- Ganze Ansicht ---------- */

function dichteAnwenden() {
  for (const tab of TABELLEN) if (knoten[tab]) knoten[tab].tabelle.classList.toggle("ds-table--dense", zustand[tab].dicht);
}

function zeichneTabellenAnsicht(tab, art) {
  const k = knoten[tab];
  k.suchfeld.setzen(zustand[tab].suche);
  dichteAnwenden();
  zaehlerAnzeigen(tab);
  zeichneChips(tab, art);
  zeichneTabelle(tab, art);
}

/* Nach jeder Änderung des Benutzers an Suche oder Filtern: Tabelle, Chips,
   Zähler und Adresse nachführen; Zeilen und Chips gleiten. */
function nachFilter(tab) {
  neuBerechnen(tab);
  zeichneTabellenAnsicht(tab, "umordnen");
  hashSchreiben();
  blattNachfuehren(tab);
}


/* ==================================================================
   7. Filter- und Spaltenblatt
   ================================================================== */

/* Das offene Blatt: { tab, art, blatt, nachfuehren() }. Es wird nie neu
   gebaut; nach Änderungen und nach dem Nachladen führt nachfuehren() nur
   Zahlen und Häkchen an Ort und Stelle nach. */
let offenesBlatt = null;

function blattNachfuehren(tab) {
  if (offenesBlatt && offenesBlatt.tab === tab) offenesBlatt.nachfuehren();
}

/* Eine Facette als Gruppe von Kästchen (fieldset + legend). */
function facettenGruppe(tab, f) {
  const z = zustand[tab];
  const werte = werteZaehlen(tab, f.k);
  const gewaehlt = z.facetten[f.k] || [];
  const g = UI.mehrfach({
    legende: f.d, name: tab + "-f-" + f.k, fokus: tab + "-f-" + f.k,
    eintraege: werte.map(([w, n]) => ({ wert: w, text: w === "" ? LEER_WERT : w, zahl: n, an: gewaehlt.indexOf(w) > -1 })),
    beiAenderung: function (w, an, alle) {
      if (alle.length) z.facetten[f.k] = alle;
      else delete z.facetten[f.k];
      nachFilter(tab);
    }
  });
  g.werte = werte.map(e => e[0]);
  return g;
}

function filterOeffnen(tab) {
  if (offenesBlatt) return;
  const k = knoten[tab];
  const z = zustand[tab];
  const inhalt = [];

  /* Archivierte Geräte sind standardmässig ausgeblendet; der Schalter
     steht hier, weil er einen Filter wegnimmt. */
  let archivGruppe = null;
  if (hatArchiv(tab)) {
    archivGruppe = UI.mehrfach({
      legende: "Archiv", name: tab + "-archiv",
      eintraege: [{ wert: "an", text: "Archivierte Geräte anzeigen", zahl: zaehle(zeilenVon(tab), g => g.__archiviert),
        an: z.archiv, fokus: tab + "-archiv" }],
      beiAenderung: function (w, an) {
        z.archiv = an;
        einstellungenMerken(tab);
        nachFilter(tab);
      }
    });
    inhalt.push(archivGruppe);
  }

  /* Zeiträume, Speicher und Programm: jede Auswahl mit Beschriftung.
     Sie stehen vor den langen Kästchenlisten, damit sie ohne Rollen
     erreichbar sind (der Programmfilter ist der häufigste der Benutzer). */
  const auswahlen = [];
  const felder = el("div", "ds-form-grid ds-form-grid--2");
  for (const zs of TAB[tab].zeitspalten) {
    const a = UI.eingabe({ art: "auswahl", id: tab + "-zeit-" + zs.k, leer: "Alle",
      werte: ZEITRAEUME.map(s => [s.w, s.d]), wert: z.zeit[zs.k] || "",
      beiAenderung: function (w) {
        if (w) z.zeit[zs.k] = w; else delete z.zeit[zs.k];
        nachFilter(tab);
      } });
    a.lesen = () => z.zeit[zs.k] || "";
    auswahlen.push(a);
    felder.appendChild(UI.feld(zs.d, a));
  }
  if (TAB[tab].hatSpeicher) {
    const a = UI.eingabe({ art: "auswahl", id: tab + "-speicher", leer: "Alle",
      werte: SPEICHERSTUFEN.map(s => [s.w, s.d]), wert: z.speicher,
      beiAenderung: function (w) { z.speicher = w; nachFilter(tab); } });
    a.lesen = () => z.speicher;
    auswahlen.push(a);
    felder.appendChild(UI.feld(SPEICHER_NAME, a));
  }
  let programmWahl = null, stufenWahl = null;
  const programmWerte = () => programmSpalten.slice().sort((a, b) => Hilfe.vergleiche(a.d, b.d)).map(p => [p.i, p.d]);
  if (TAB[tab].hatProgramme) {
    programmWahl = UI.eingabe({ art: "auswahl", id: tab + "-programm", leer: "Kein Programmfilter",
      werte: programmWerte(), wert: z.programm,
      beiAenderung: function (w) {
        z.programm = w;
        if (!w) z.programmStufe = "";
        stufenWahl.disabled = !w;
        stufenWahl.value = z.programmStufe;
        nachFilter(tab);
      } });
    programmWahl.lesen = () => z.programm;
    stufenWahl = UI.eingabe({ art: "auswahl", id: tab + "-programmstufe",
      werte: PROGRAMM_STUFEN.map(s => [s.w, s.d]), wert: z.programmStufe,
      beiAenderung: function (w) { z.programmStufe = w; nachFilter(tab); } });
    stufenWahl.lesen = () => z.programmStufe;
    stufenWahl.disabled = !z.programm;
    auswahlen.push(programmWahl, stufenWahl);
    felder.appendChild(UI.feld("Berechtigung für Programm", programmWahl));
    felder.appendChild(UI.feld("Berechtigungsstufe", stufenWahl));
  }
  let rollenWahl = null;
  const rollenWerte = () => kameraRollen.filter(r => r.__inMilestone)
    .slice().sort((a, b) => Hilfe.vergleiche(a.Title, b.Title)).map(r => [String(r.id), String(r.Title || "").trim()]);
  if (TAB[tab].hatRolle) {
    rollenWahl = UI.eingabe({ art: "auswahl", id: tab + "-rolle", leer: "Alle Rollen",
      werte: rollenWerte(), wert: z.rolle,
      beiAenderung: function (w) { z.rolle = w; nachFilter(tab); } });
    rollenWahl.lesen = () => z.rolle;
    auswahlen.push(rollenWahl);
    felder.appendChild(UI.feld(ROLLE_FILTER_NAME, rollenWahl, { hinweis: "Rolle aus Milestone, die die Kamera sehen darf." }));
  }
  if (felder.childNodes.length) inhalt.push(felder);

  const gruppen = {};
  for (const f of TAB[tab].facetten) {
    gruppen[f.k] = facettenGruppe(tab, f);
    inhalt.push(gruppen[f.k]);
  }

  /* Ohne Filter gesperrt (nachfuehren); Klicks auf den gesperrten Knopf
     schluckt das Fundament. */
  const zuruecksetzen = UI.knopf({ text: "Filter zurücksetzen", variante: "tonal", beiKlick: function () {
    filterZuruecksetzen(tab, false);
    nachFilter(tab);
  } });
  const blatt = UI.blatt({
    titel: "Filter", unter: trefferText(tab, true), inhalt: inhalt,
    fuss: [zuruecksetzen, UI.knopf({ text: "Fertig", variante: "primaer", beiKlick: function () { blatt.schliessen("fertig"); } })],
    beiSchliessen: function () {
      knopfOffen(k.filterKnopf, false);
      offenesBlatt = null;
    }
  });
  knopfOffen(k.filterKnopf, true);

  function nachfuehren() {
    if (archivGruppe) {
      archivGruppe.zahlenSetzen({ an: zaehle(zeilenVon(tab), g => g.__archiviert) });
      archivGruppe.setzen(z.archiv ? ["an"] : []);
    }
    for (const f of TAB[tab].facetten) {
      const g = gruppen[f.k];
      const werte = werteZaehlen(tab, f.k);
      /* Taucht ein neuer Wert auf (nach dem Nachladen), wird nur diese
         Gruppe neu gebaut; sonst bleiben alle Kästchen stehen. */
      if (werte.some(e => g.werte.indexOf(e[0]) === -1)) {
        Rahmen.stillZeichnen(blatt.koerper, function () {
          const neu = facettenGruppe(tab, f);
          g.replaceWith(neu);
          gruppen[f.k] = neu;
        });
        continue;
      }
      const zahlen = {};
      for (const [w, n] of werte) zahlen[w] = n;
      g.zahlenSetzen(zahlen);
      g.setzen(z.facetten[f.k] || []);
    }
    if (programmWahl) {
      const neu = programmWerte();
      const alt = Array.from(programmWahl.options).filter(o => o.value).map(o => [o.value, o.textContent]);
      if (JSON.stringify(neu) !== JSON.stringify(alt) && document.activeElement !== programmWahl) {
        programmWahl.werteSetzen(neu, z.programm);
      }
      stufenWahl.disabled = !z.programm;
    }
    if (rollenWahl) {
      const neu = rollenWerte();
      const alt = Array.from(rollenWahl.options).filter(o => o.value).map(o => [o.value, o.textContent]);
      if (JSON.stringify(neu) !== JSON.stringify(alt) && document.activeElement !== rollenWahl) {
        rollenWahl.werteSetzen(neu, z.rolle);
      }
    }
    for (const a of auswahlen) if (document.activeElement !== a && a.value !== a.lesen()) a.value = a.lesen();
    UI.knopfSperren(zuruecksetzen, aktiveFilter(tab) ? "" : "Kein Filter aktiv.");
    blatt.unter(trefferText(tab, true));
  }
  nachfuehren();
  offenesBlatt = { tab: tab, art: "filter", blatt: blatt, nachfuehren: nachfuehren };
}

function spaltenText(tab) {
  const n = sichtbareSpalten(tab).length;
  const alle = spaltenListe(tab).length;
  return n + " von " + alle + " Spalten sichtbar";
}

function spaltenOeffnen(tab) {
  if (offenesBlatt) return;
  const k = knoten[tab];
  const z = zustand[tab];
  const alleSpalten = spaltenListe(tab);
  const name = TAB[tab].namensSpalte;

  const gruppenNamen = [];
  for (const s of alleSpalten) if (gruppenNamen.indexOf(s.g) === -1) gruppenNamen.push(s.g);

  function setzen(liste) {
    z.spalten = spaltenOrdnen(tab, [name].concat(liste));
    einstellungenMerken(tab);
    // Fiel die sortierte Spalte weg, sortiert die Liste wieder nach dem Namen.
    neuBerechnen(tab);
    zeichneTabelle(tab);
    zaehlerAnzeigen(tab);
    hashSchreiben();
    nachfuehren();
  }

  /* Die Namensspalte steht immer vorne und lässt sich nicht abwählen
     (sonst fehlte der Link zum Datensatz). */
  const gruppen = gruppenNamen.map(function (g) {
    const m = UI.mehrfach({
      legende: g, name: tab + "-sp-" + g, fokus: tab + "-sp",
      eintraege: alleSpalten.filter(s => s.g === g).map(s => ({
        wert: s.i, text: s.i === name ? s.d + " (immer sichtbar)" : s.d,
        an: s.i === name || z.spalten.indexOf(s.i) > -1, gesperrt: s.i === name
      })),
      beiAenderung: function (wert, an) {
        const liste = z.spalten.filter(x => x !== wert);
        if (an) liste.push(wert);
        setzen(liste);
      }
    });
    return m;
  });

  /* Vorlagen setzen nur die Häkchen: nichts wird neu gebaut. */
  const vorlagen = anhaengen(el("div", "ds-form-actions"), [
    UI.knopf({ text: "Standardspalten", variante: "leise", beiKlick: function () { setzen(TAB[tab].standard.slice()); } }),
    UI.knopf({ text: "Nur Name", variante: "leise", beiKlick: function () { setzen([name]); } }),
    UI.knopf({ text: "Alle Spalten", variante: "leise", beiKlick: function () { setzen(alleSpalten.map(s => s.i)); } })
  ]);
  vorlagen.classList.add("blatt-vorlagen");

  const dichte = UI.mehrfach({
    legende: "Zeilenhöhe", name: tab + "-dichte",
    eintraege: [{ wert: "kompakt", text: "Kompakte Zeilen (gilt für alle Listen)", an: z.dicht }],
    beiAenderung: function (w, an) { dichteSetzen(an); }
  });

  const blatt = UI.blatt({
    titel: "Spalten", unter: spaltenText(tab), inhalt: [vorlagen, dichte].concat(gruppen),
    fuss: [UI.knopf({ text: "Fertig", variante: "primaer", beiKlick: function () { blatt.schliessen("fertig"); } })],
    beiSchliessen: function () {
      knopfOffen(k.spaltenKnopf, false);
      offenesBlatt = null;
    }
  });
  knopfOffen(k.spaltenKnopf, true);

  function nachfuehren() {
    const gewaehlt = [name].concat(z.spalten);
    for (const g of gruppen) g.setzen(gewaehlt);
    dichte.setzen(z.dicht ? ["kompakt"] : []);
    blatt.unter(spaltenText(tab));
  }
  offenesBlatt = { tab: tab, art: "spalten", blatt: blatt, nachfuehren: nachfuehren };
}

/* «Kompakt» gilt für alle Listen gleich. */
function dichteSetzen(kompakt) {
  for (const t of TABELLEN) zustand[t].dicht = kompakt;
  dichteAnwenden();
  if (TABELLEN.indexOf(zustand.ansicht) > -1) einstellungenMerken(zustand.ansicht);
  else try { localStorage.setItem(SPEICHER_DICHTE, kompakt ? "kompakt" : "normal"); } catch (e) { /* privat */ }
  hashSchreiben();
}


/* ==================================================================
   8. CSV
   ================================================================== */

function csvWert(tab, zeile, schluessel) {
  const s = spalte(tab, schluessel);
  const wert = zeile[schluessel];
  if (s && s.q === "programm") return String(Modell.stufe(wert));
  // Der Verlauf als Klartext, ein Eintrag je Abschnitt.
  if (schluessel === "Verlauf") {
    return Modell.verlaufLesen(wert).map(e => Modell.datumSchweiz(e.datum) + " " + e.text).join(" / ");
  }
  if (!s) return wert === null || wert === undefined ? "" : String(wert);
  if (s.t === "Boolean") return wert ? "Ja" : "Nein";
  /* «14:05» statt «14.05» wie in der Liste (UI.zeitText): so liest Excel
     den Wert als Zeit. */
  if (s.t === "DateTime") return Hilfe.datumZeitText(wert);
  if (s.t === "Note") return Hilfe.zeilen(wert).join(" / ");
  return wert === null || wert === undefined ? "" : String(wert);
}

/* Ein Feld der CSV-Datei. Excel liest einen Wert, der mit = + - @ (oder
   Tabulator/Wagenrücklauf) beginnt, als Formel oder Zahl: «+41 41 926 22 01»
   wird zu #NAME?, «+491711234567» verliert das «+» und erscheint als
   4.91712E+11, und ein Freitext könnte eine Formel einschleusen. Solche
   Werte bekommen ein vorangestelltes ' – ausser einer reinen Zahl in einer
   Zahlenspalte («-5» bleibt dort eine Zahl). */
function csvFeld(text, zahlenSpalte) {
  let t = String(text === null || text === undefined ? "" : text);
  if (/^[=+\-@\t\r]/.test(t) && !(zahlenSpalte && /^[-+]?\d+([.,]\d+)?$/.test(t))) t = "'" + t;
  return '"' + t.replace(/"/g, '""') + '"';
}

function istZahlenSpalte(tab, schluessel) {
  const s = spalte(tab, schluessel);
  return !!s && s.t === "Number";
}

function csvExport(tab) {
  const spalten = sichtbareSpalten(tab);
  const zahl = spalten.map(k => istZahlenSpalte(tab, k));
  const zeilen = [spalten.map(k => csvFeld(beschriftung(tab, k))).join(";")];
  for (const zeile of sichtbar[tab]) zeilen.push(spalten.map((k, i) => csvFeld(csvWert(tab, zeile, k), zahl[i])).join(";"));

  // Byte Order Mark, damit Excel unter Windows die Umlaute richtig liest.
  const inhalt = "﻿" + zeilen.join("\r\n") + "\r\n";
  const url = URL.createObjectURL(new Blob([inhalt], { type: "text/csv;charset=utf-8" }));
  const heute = new Date();
  const name = "Inventar_" + TAB[tab].csvName + "_" + heute.getFullYear()
    + String(heute.getMonth() + 1).padStart(2, "0") + String(heute.getDate()).padStart(2, "0") + ".csv";

  const a = el("a");
  a.href = url;
  a.download = name;
  a.hidden = true;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  UI.meldung(name + " heruntergeladen (" + anzahlText(tab, sichtbar[tab].length) + ").");
}


/* ==================================================================
   9. Übersicht
   ================================================================== */

/* Eine Kennzahl: { t: Text, w: Zahl, ton: 'warnung'|'gefahr', unter, setzen }.
   «setzen» bestimmt den Filter ihres Sprungs in die Liste; er zählt
   dieselben Zeilen wie die Zahl. Der Ton steht nie als Farbe auf der
   Zahl, sondern als Sinnbild in der Beschriftung. */

/* Offen ist eine Kennzahl mit Warn- oder Gefahrenton und einem Wert über
   null; sie steht dann zusätzlich unter «Handlungsbedarf». */
function istOffen(kz) { return (kz.ton === "warnung" || kz.ton === "gefahr") && kz.w > 0; }

const TON_RANG = { gefahr: 0, warnung: 1 };

function nichts() { /* Sprung ohne Filter */ }

function clientKennzahlen(tab) {
  const alle = zeilenVon(tab);
  const imEinsatz = aktiveClients(tab);
  const archiviert = alle.length - imEinsatz.length;
  const liste = [
    { t: "Im Einsatz", w: imEinsatz.length, setzen: nichts },
    { t: "Gerade online", w: zaehle(imEinsatz, z => z.__online),
      setzen: z => facetteSetzen(z, "__onlineText", "Ja") },
    { t: "Nicht in SCCM", w: zaehle(imEinsatz, z => !z.__inSccm), ton: "warnung",
      setzen: z => facetteSetzen(z, "__inSccmText", "Nein") },
    { t: "Ersatz überfällig", w: zaehle(imEinsatz, z => z.__ersatzStatus === "ueberfaellig"), ton: "gefahr",
      unter: "geplant vor " + Modell.gjAktuell(),
      setzen: z => facetteSetzen(z, "__ersatzText", ERSATZ_TEXT.ueberfaellig) },
    { t: "Ohne Beschaffungsjahr", w: zaehle(imEinsatz, z => z.__hatJahrText === "Nein"), ton: "warnung",
      setzen: z => facetteSetzen(z, "__hatJahrText", "Nein") }
  ];
  if (TAB[tab].mitInhaber) {
    liste.push({ t: "Ohne Inhaber", w: zaehle(imEinsatz, z => !z.__inhaber), ton: "warnung",
      setzen: z => facetteSetzen(z, "__hatInhaber", "Nein") });
  }
  liste.push({ t: "Archiviert", w: archiviert, unter: "in der Liste ausgeblendet",
    setzen: z => facetteSetzen(z, "__statusText", ARCHIVIERT) });
  return liste;
}

function benutzerKennzahlen() {
  const aktiv = zaehle(benutzer, b => b.__adAktiv);
  return [
    { t: "Benutzer", w: benutzer.length, setzen: nichts, unter: UI.zahlText(aktiv) + " mit aktivem AD-Konto" },
    { t: "Ohne Gerät", w: zaehle(benutzer, b => !b.__hatGeraet),
      setzen: z => facetteSetzen(z, "__hatGeraetText", "Nein") },
    { t: "Ohne Telefonnummer", w: zaehle(benutzer, b => b.__adAktiv && !b.__hatTelefon), unter: "nur aktive AD-Konten",
      setzen: function (z) { facetteSetzen(z, "__hatTelefonText", "Nein"); facetteSetzen(z, "__adAktivText", "Ja"); } },
    { t: "AD-Konto deaktiviert", w: benutzer.length - aktiv, ton: "gefahr",
      setzen: z => facetteSetzen(z, "__adAktivText", "Nein") },
    { t: "Primärgerät weicht ab", w: zaehle(benutzer, b => b.__primaerAbweichung), ton: "warnung",
      unter: "SCCM meldet ein anderes Gerät", setzen: z => facetteSetzen(z, "__primaerText", "Ja") }
  ];
}

/* «Nicht zugewiesen» (Warnung, Handlungsbedarf) zählt nur Nummern, die in
   Betrieb sind und niemandem gehören: eine freie Nummer ist mit Absicht
   unbelegt und kein Problem. Der Sprung filtert genau diese Zeilen
   (Zugewiesen = Nein, Status Aktiv oder Inaktiv). */
function telefonKennzahlen() {
  const zugewiesen = zaehle(telefone, t => t.__zugewiesen);
  const frei = zaehle(telefone, t => t.__status === "Frei");
  const offen = zaehle(telefone, t => !t.__zugewiesen && t.__status !== "Frei");
  return [
    { t: "Telefonnummern", w: telefone.length, setzen: nichts },
    { t: "Zugewiesen", w: zugewiesen, setzen: z => facetteSetzen(z, "__zugewiesenText", "Ja") },
    { t: "Frei", w: frei, setzen: z => facetteSetzen(z, "__statusText", "Frei") },
    { t: "Inaktiv", w: zaehle(telefone, t => t.__status === "Inaktiv"), unter: "nicht in Teams",
      setzen: z => facetteSetzen(z, "__statusText", "Inaktiv") },
    { t: "Nicht zugewiesen", w: offen, ton: "warnung", unter: "ohne Status «Frei»",
      setzen: function (z) { facetteSetzen(z, "__zugewiesenText", "Nein"); z.facetten.__statusText = ["Aktiv", "Inaktiv"]; } },
    { t: "Name weicht vom AD ab", w: zaehle(telefone, t => t.__nameAbweichung), ton: "warnung",
      unter: "Liste und AD nennen verschiedene Personen",
      setzen: z => facetteSetzen(z, "__nameAbweichungText", "Ja") }
  ];
}

/* Kameras: was in Milestone auffällt (nicht mehr da, deaktiviert, ohne
   Aufzeichnung, Kanal ohne Namen). «Nicht in Milestone» zählt nur Kameras
   im Status «Aktiv»: eine Kamera im Lager steht mit Absicht nicht in
   Milestone. */
function kameraKennzahlen() {
  const imEinsatz = aktiveClients("kameras");
  const archiviert = kameras.length - imEinsatz.length;
  return [
    { t: "Im Einsatz", w: imEinsatz.length, setzen: nichts,
      unter: UI.zahlText(zaehle(imEinsatz, k => k.__status === "Lager")) + " davon im Lager" },
    { t: "Nicht in Milestone", w: zaehle(imEinsatz, k => !k.__inMilestone && k.__status === "Aktiv"), ton: "warnung",
      unter: "Status «Aktiv», aber keine Hardware in Milestone",
      setzen: function (z) { facetteSetzen(z, "__inMilestoneText", "Nein"); facetteSetzen(z, "__statusText", "Aktiv"); } },
    { t: "In Milestone deaktiviert", w: zaehle(imEinsatz, k => k.__inMilestone && !k.__aktiv), ton: "warnung",
      setzen: z => facetteSetzen(z, "__aktivText", "Nein") },
    { t: "Ohne Aufzeichnung", w: zaehle(imEinsatz, k => k.__inMilestone && !k.__aufzeichnung), ton: "warnung",
      unter: "kein aktiver Kanal zeichnet auf", setzen: z => facetteSetzen(z, "__aufzeichnungText", "Nein") },
    { t: "Kanal ohne Namen", w: zaehle(imEinsatz, k => k.__unbenannt > 0), ton: "warnung",
      unter: "Kanal heisst in Milestone noch wie das Modell", setzen: z => facetteSetzen(z, "__unbenanntText", "Ja") },
    { t: "Ersatz überfällig", w: zaehle(imEinsatz, k => k.__ersatzStatus === "ueberfaellig"), ton: "gefahr",
      unter: "geplant vor " + Modell.gjAktuell(), setzen: z => facetteSetzen(z, "__ersatzText", ERSATZ_TEXT.ueberfaellig) },
    { t: "Archiviert", w: archiviert, unter: "in der Liste ausgeblendet",
      setzen: z => facetteSetzen(z, "__statusText", ARCHIVIERT) }
  ];
}

/* Je Programm die Benutzer mit Stufe 1 (von Hand) und Stufe 2 (aus AD). */
function programmZaehler() {
  const zaehler = new Map();
  for (const p of programmSpalten) zaehler.set(p.i, { eins: 0, zwei: 0 });
  for (const b of benutzer) {
    for (const p of programmSpalten) {
      const s = Modell.stufe(b[p.i]);
      if (s === 1) zaehler.get(p.i).eins++;
      else if (s === 2) zaehler.get(p.i).zwei++;
    }
  }
  return zaehler;
}

/* Software: die Ansicht kennt nur die Suche, darum springen nur die
   Hauptzahl und die Berechtigungen (in die Benutzerliste) – die übrigen
   Kennzahlen sind reine Statistik. */
function softwareKennzahlen() {
  const zaehler = programmZaehler();
  let eins = 0, zwei = 0, ohne = 0;
  for (const p of programmSpalten) {
    const e = zaehler.get(p.i);
    eins += e.eins;
    zwei += e.zwei;
    if (!e.eins && !e.zwei) ohne++;
  }
  const kategorien = Modell.programmKategorien(programmSpalten).length;
  return [
    { t: "Programme", w: programmSpalten.length, setzen: nichts,
      unter: UI.zahlText(kategorien) + (kategorien === 1 ? " Kategorie" : " Kategorien") },
    { t: "Mit AD-Gruppe", w: zaehle(programmSpalten, p => p.adGruppen.length > 0),
      unter: "Berechtigung kommt aus dem AD" },
    { t: "Nur von Hand vergeben", w: zaehle(programmSpalten, p => !p.adGruppen.length) },
    { t: "Ohne Berechtigte", w: ohne, unter: "kein Benutzer hat das Programm" },
    { t: "Berechtigungen von Hand", w: eins, unter: "Benutzer × Programm, Stufe 1" },
    { t: "Berechtigungen aus AD", w: zwei, unter: "Benutzer × Programm, Stufe 2" }
  ];
}

/* Kamerarechte: Rollen aus Milestone und wer darüber Kameras sieht. Die
   Ansicht kennt nur die Suche; die Kennzahlen sind reine Statistik. */
function rollenKennzahlen() {
  const inMs = kameraRollen.filter(r => r.__inMilestone);
  const unbekannt = new Set();
  for (const r of inMs) for (const l of r.__unbekannt) unbekannt.add(String(l).toLowerCase());
  return [
    { t: "Rollen", w: kameraRollen.length, setzen: nichts,
      unter: UI.zahlText(inMs.length) + " davon in Milestone" },
    { t: "Personen mit Kamerazugriff", w: zaehle(benutzer, b => (b.__kameraRollen || []).length > 0),
      unter: "über mindestens eine Rolle in Milestone" },
    { t: "Logins ohne Benutzer", w: unbekannt.size,
      unter: "in einer Rolle, aber nicht in der Benutzerliste" },
    { t: "Rollen ohne Mitglieder", w: zaehle(inMs, r => !r.__mitglieder.length) },
    { t: "Rollen ohne Kameras", w: zaehle(inMs, r => !r.__admin && !r.__kameras.length),
      unter: "ohne die Rolle der Administratoren" },
    { t: "Nicht mehr in Milestone", w: kameraRollen.length - inMs.length, unter: "Zeile bleibt in der Liste stehen" }
  ];
}

/* Ein Abschnitt der Übersicht: Titel (h2) mit optionaler Meta-Zeile rechts. */
function abschnitt(id, titel, meta, inhalt) {
  const s = el("section", "uebersicht-abschnitt");
  s.setAttribute("data-ds-key", "abschnitt-" + id);
  const kopf = el("div", "abschnitt-kopf");
  const h = el("h2", "ds-card__title", titel);
  h.id = id;
  s.setAttribute("aria-labelledby", id);
  kopf.appendChild(h);
  if (meta) kopf.appendChild(el("p", "anzahl", meta));
  anhaengen(s, [kopf].concat(inhalt));
  return s;
}

/* Zustand des Abgleichs mit SCCM und AD (Sync-Inventar.ps1, läuft alle 30
   Minuten). Liegt der letzte Lauf länger als SYNC_VERALTET_MIN zurück, steht
   ein Gefahren-Banner über dem Handlungsbedarf – dann zeigen die Listen
   womöglich einen alten Stand. Hatte er Fehler, ein Warn-Banner mit dem
   Kurztext. Sonst eine leise Zeile mit der Zeit. Ohne Statusdatei (Sync noch
   nie gelaufen, kein Zugriff) erscheint nichts. */
const SYNC_VERALTET_MIN = 120;

function syncHinweis() {
  const s = syncZustand;
  if (!s || !s.zeit) return null;
  const zeit = new Date(s.zeit);
  if (isNaN(zeit.getTime())) return null;
  const minuten = (Date.now() - zeit.getTime()) / 60000;
  const wann = UI.zeitText(zeit);
  if (minuten > SYNC_VERALTET_MIN) {
    return UI.banner({ ton: "gefahr", titel: "Abgleich steht.",
      text: "Der letzte Abgleich mit SCCM und AD war am " + wann + " – die Listen zeigen womöglich nicht den aktuellen Stand. "
        + "Geplante Aufgabe «Computer Inventar Sync» auf adminsrv319 prüfen." });
  }
  if (/Fehler/.test(s.text)) {
    return UI.banner({ ton: "warnung", titel: "Letzter Abgleich mit Fehlern.",
      text: s.text + " (" + wann + "). Details im Log auf adminsrv319." });
  }
  return UI.hinweis("Letzter Abgleich mit SCCM, AD und Milestone: " + wann + ".");
}

/* Handlungsbedarf: eine Karte je offener Kennzahl aus den Listen des
   Moduls, Gefahr vor Warnung; ab 2 × 360 px Platz in zwei Spalten. Leer:
   Erfolgshinweis. Der Sync-Zustand (syncHinweis) steht zuoberst. */
function handlungsbedarf(modul, punkte) {
  punkte.sort((a, b) => (TON_RANG[a.ton] ?? 9) - (TON_RANG[b.ton] ?? 9));
  const sync = syncHinweis();
  if (!punkte.length) {
    return abschnitt(modul + "-handlungsbedarf", "Handlungsbedarf", null, [
      sync,
      UI.banner({ ton: "erfolg", text: "Keine offenen Punkte." })
    ]);
  }
  const karten = anhaengen(el("div", "karten aufgaben"), punkte.map(aufgabenKarte));
  const n = punkte.length;
  return abschnitt(modul + "-handlungsbedarf", "Handlungsbedarf",
    n === 1 ? "1 offener Punkt" : n + " offene Punkte", [sync, karten]);
}

/* Ein Punkt als ganze klickbare Karte (UI.karte mit href: Dashboard-Style
   .ds-card--interactive, der Titel ist der Link in die gefilterte Liste
   und spannt sich über die Karte). Vorne die Zahlmarke in der Farbe ihrer
   Dringlichkeit (marke), «Dringend» sagt sie zusätzlich als Wort. */
function aufgabenKarte(p) {
  const schluessel = "hb-" + p.tab + "-" + p.t;
  const karte = UI.karte({ titel: p.t, ebene: 3, unter: UI.teile([Rahmen.zielText(p.tab), p.unter]),
    aktionen: p.ton === "gefahr" ? [UI.status("Dringend", "gefahr")] : null, marke: UI.zahlmarke(p.w, p.ton),
    href: sprungAdresse(p.tab, p.setzen), beiKlick: sprungKlick(p.tab, p.setzen), fokus: schluessel });
  karte.setAttribute("data-ds-key", schluessel + "-karte");
  return karte;
}

/* Die weiteren Kennzahlen einer Bestandskarte als klickbare Kennwerte
   (UI.kennwerte mit Objekten): Sprung in die gefilterte Liste, Null leise,
   eine offene Kennzahl mit ihrem Ton als Sinnbild. */
function kennwertListe(tab, liste) {
  return UI.kennwerte(liste.map(function (kz) {
    // Eine Kennzahl kann in eine andere Ansicht springen (kz.tab).
    const ziel = kz.tab || tab;
    zahlMerken("kz-" + tab + "-" + kz.t, kz.w);
    return {
      name: kz.t, wert: kz.w, ton: istOffen(kz) ? kz.ton : undefined,
      href: kz.setzen ? sprungAdresse(ziel, kz.setzen) : undefined,
      beiKlick: kz.setzen ? sprungKlick(ziel, kz.setzen) : undefined,
      titel: kz.unter ? kz.t + " – " + kz.unter : undefined,
      fokus: "kz-" + tab + "-" + kz.t
    };
  }));
}

/* Bestandskarte: Kopf mit Sinnbild, Titel und «Liste öffnen →»; die
   Hauptzahl als Kachel (zählt beim ersten Zeigen hoch, danach vom
   gezeigten Wert), darunter die weiteren Kennzahlen als klickbare Zeilen. */
function bestandKarte(tab, kennzahlen, hinweis, offen) {
  const titel = Rahmen.zielText(tab);
  const oeffnen = UI.knopf({ text: "Liste öffnen", variante: "leise", weiter: true, label: "Liste «" + titel + "» öffnen",
    href: sprungAdresse(tab, nichts), beiKlick: sprungKlick(tab, nichts), fokus: "bestand-" + tab + "-liste" });
  const karte = UI.karte({ titel: titel, sinnbild: SINNBILD[tab], ebene: 3, aktionen: [oeffnen], klasse: "bestand-karte" });
  karte.setAttribute("data-ds-key", "bestand-" + tab);

  const [haupt, ...rest] = kennzahlen;
  zahlMerken("bestand-" + tab + "-haupt", haupt.w);
  const kachel = UI.kachel({ text: haupt.t, wert: UI.zahlText(haupt.w), zahl: haupt.w, unter: haupt.unter,
    href: sprungAdresse(tab, haupt.setzen), beiKlick: sprungKlick(tab, haupt.setzen), fokus: "bestand-" + tab + "-haupt" });
  anhaengen(karte.inhalt, [kachel, kennwertListe(tab, rest), hinweis ? UI.hinweis(hinweis) : null]);

  for (const kz of kennzahlen) if (istOffen(kz)) offen.push(Object.assign({ tab: tab }, kz));
  return karte;
}

/* ---------- Ersatzplanung: Zeitstrahl je Liste mit Ersatzjahr ---------- */

/* «2024/2025» → «2024/25»; die volle Bezeichnung steht im Tooltip. */
function gjKurz(jahr) { return String(jahr).replace(/\/(\d\d)(\d\d)$/, "/$2"); }

function geraeteText(n) { return UI.zahlText(n) + (n === 1 ? " Gerät" : " Geräte"); }

/* Eine Säule (.ds-columns__col von Dashboard-Style): als Knopf, wenn
   Geräte dahinterstehen (Sprung in die Liste mit dem Jahr als Filter),
   sonst nur Platzhalter. Ihr Anteil ist --ds-share: beim ersten Zeigen
   füllt sie sich (Bewegung.aufziehen), danach gleitet sie zum neuen Wert.
   Zustandsebene, Fokusring und Welle kommen von Dashboard-Style.
   Überfällig trägt zusätzlich ein Sinnbild, das auf der Säule reitet. */
const SAEULEN_ART = { beschafft: "", ersatz: " ds-columns__col--s2", faellig: " ds-columns__col--warning",
  ueberfaellig: " ds-columns__col--error" };

function zeitstrahlSaeule(tab, jahr, anzahl, hoechste, art, feld, beschreibung) {
  const li = el("li");
  const s = el(anzahl ? "button" : "span", "ds-columns__col" + SAEULEN_ART[art]);
  s.style.setProperty("--ds-share", String(anzahl / hoechste));
  const fuell = el("span", "ds-columns__fill");
  fuell.setAttribute("aria-hidden", "true");
  s.appendChild(fuell);
  li.appendChild(s);
  if (!anzahl) {
    li.setAttribute("aria-hidden", "true");
    return li;
  }
  s.type = "button";
  if (art === "ueberfaellig") s.appendChild(UI.sinnbild("achtung", 16, "zeitstrahl-marke"));
  s.setAttribute("aria-label", beschreibung + ". In der Liste zeigen.");
  s.setAttribute("data-fokus", "zs-" + tab + "-" + jahr + "-" + feld);
  UI.tipp(s, beschreibung);
  s.addEventListener("click", function () { springeMitFilter(tab, z => facetteSetzen(z, feld, jahr)); });
  return li;
}

/* Der Zeitstrahl ist .ds-columns--grouped von Dashboard-Style: je
   Geschäftsjahr eine Gruppe aus zwei Säulen (beschafft, Ersatz geplant),
   das laufende auf einer ruhigen Fläche (.ds-columns__group--current, ein
   Wort für den Screenreader). Er rollt in der Karte seitlich (.ds-scroll-x
   mit Blenden an den Enden, wo es weitergeht; DS.dom.scrollEdges meldet
   sie auch ohne rollgebundene Animationen), nie die Seite. */
function zeitstrahl(tab) {
  /* Geplant wird nur für Clients im Einsatz: ein archiviertes Gerät
     braucht keinen Ersatz mehr. */
  const planbar = aktiveClients(tab);
  const heute = Modell.gjAktuell();
  let von = heute, bis = heute;
  const beschafft = new Map();
  const ersatz = new Map();
  /* Nur gültige Geschäftsjahre («2024/2025») zählen: ein Tippfehler wie
     «2020» hätte sonst das Ende der Achse verschoben und sie geleert. */
  for (const g of planbar) {
    const b = String(g.Beschaffungsjahr || "").trim();
    const e = String(g.ErsatzGeplant || "").trim();
    for (const j of [b, e]) {
      if (!j || !Modell.gjGueltig(j)) continue;
      if (Modell.gjVergleich(j, von) < 0) von = j;
      if (Modell.gjVergleich(j, bis) > 0) bis = j;
    }
    if (b && Modell.gjGueltig(b)) beschafft.set(b, (beschafft.get(b) || 0) + 1);
    if (e && Modell.gjGueltig(e)) ersatz.set(e, (ersatz.get(e) || 0) + 1);
  }
  const jahre = Modell.gjListe(von, bis);
  if (!beschafft.size && !ersatz.size) return null;

  let hoechste = 1;
  for (const j of jahre) hoechste = Math.max(hoechste, beschafft.get(j) || 0, ersatz.get(j) || 0);

  const titel = Rahmen.zielText(tab);
  const figur = el("figure", "ds-columns ds-columns--grouped zeitstrahl");
  figur.appendChild(el("figcaption", "ds-sr", titel + ": beschaffte Geräte und geplanter Ersatz je Geschäftsjahr"));
  const roller = el("div", "ds-scroll-x");
  roller.setAttribute("data-rolle", "zeitstrahl-" + tab);
  roller.setAttribute("role", "group");
  roller.setAttribute("aria-label", titel + ": beschaffte Geräte und geplanter Ersatz je Geschäftsjahr");
  const gruppen = el("ol", "ds-columns__groups");

  for (const jahr of jahre) {
    const nB = beschafft.get(jahr) || 0;
    const nE = ersatz.get(jahr) || 0;
    const v = Modell.gjVergleich(jahr, heute);
    const gruppe = el("li", "ds-columns__group" + (v === 0 ? " ds-columns__group--current" : ""));
    gruppe.setAttribute("data-ds-key", "gj-" + jahr);
    const plot = el("ol", "ds-columns__plot");
    const ersatzArt = v < 0 ? "ueberfaellig" : (v === 0 ? "faellig" : "ersatz");
    anhaengen(plot, [
      zeitstrahlSaeule(tab, jahr, nB, hoechste, "beschafft", "Beschaffungsjahr",
        geraeteText(nB) + " im Geschäftsjahr " + jahr + " beschafft"),
      zeitstrahlSaeule(tab, jahr, nE, hoechste, ersatzArt, "ErsatzGeplant",
        "Ersatz für " + geraeteText(nE) + " im " + (v === 0 ? "laufenden " : "") + "Geschäftsjahr " + jahr + " geplant"
          + (v < 0 ? " – überfällig" : ""))
    ]);
    const label = el("span", "ds-columns__label", gjKurz(jahr));
    if (v === 0) label.appendChild(el("span", "ds-sr", " (laufendes Geschäftsjahr)"));
    anhaengen(gruppe, [plot, label]);
    gruppen.appendChild(gruppe);
  }
  roller.appendChild(gruppen);
  figur.appendChild(roller);
  return figur;
}

/* Legende (.ds-legend): dieselben Serien und Töne wie die Säulen, damit
   Farbe und Bedeutung nie auseinanderlaufen; «überfällig» zusätzlich mit
   dem Sinnbild der Säule. */
function zeitstrahlLegende() {
  const ul = el("ul", "ds-legend zeitstrahl-legende");
  for (const [schluessel, text] of [["", "Beschafft"], ["ds-legend__key--s2", "Ersatz geplant"],
    ["ds-legend__key--warning", "Ersatz in diesem Geschäftsjahr"], ["ds-legend__key--error", "Ersatz überfällig"]]) {
    const li = el("li");
    const marke = el("span", "ds-legend__key" + (schluessel ? " " + schluessel : ""));
    marke.setAttribute("aria-hidden", "true");
    li.appendChild(marke);
    if (schluessel === "ds-legend__key--error") li.appendChild(UI.sinnbild("achtung", 16, "t-gefahr"));
    li.appendChild(el("span", null, text));
    ul.appendChild(li);
  }
  return ul;
}

function planungKarte(tab) {
  const karte = UI.karte({ titel: Rahmen.zielText(tab), sinnbild: SINNBILD[tab], ebene: 3, klasse: "planung-karte" });
  karte.setAttribute("data-ds-key", "planung-" + tab);
  const strahl = zeitstrahl(tab);
  if (strahl) anhaengen(karte.inhalt, [strahl, zeitstrahlLegende()]);
  else karte.inhalt.appendChild(UI.hinweis("Noch keine Beschaffungs- oder Ersatzjahre erfasst."));
  return karte;
}

/* Liegt das laufende Geschäftsjahr nicht klar im sichtbaren Teil (viele
   Jahre, schmale Karte; rechts blendet der Strahl aus), rollt er einmal so,
   dass es in der Mitte steht – vergangene und kommende Jahre gleich weit.
   Nur, solange niemand selbst gerollt hat. */
function zeitstrahlAusrichten() {
  for (const r of document.querySelectorAll(UEBERSICHTEN.map(m => "#ansicht-" + m + " .zeitstrahl > .ds-scroll-x").join(", "))) {
    const aktuell = r.querySelector(".ds-columns__group--current");
    if (aktuell && r.scrollLeft === 0 && r.scrollWidth > r.clientWidth) {
      const rechts = aktuell.offsetLeft + aktuell.offsetWidth;
      if (rechts > r.clientWidth - 2 * aktuell.offsetWidth) {
        const mitte = aktuell.offsetLeft + aktuell.offsetWidth / 2 - r.clientWidth / 2;
        r.scrollLeft = Math.max(0, Math.min(r.scrollWidth - r.clientWidth, Math.round(mitte)));
      }
    }
  }
}

/* ---------- Verteilungen ---------- */

/* Mehr als acht Zeilen macht eine Verteilung nicht lesbarer; der Rest
   steht als Summe darunter. */
const VERTEILUNG_ZEILEN = 8;

function verteilungsKarte(tab, schluessel, titel) {
  const eintraege = werteZaehlen(tab, schluessel, true).map(([wert, n]) => ({ wert: wert, zahl: n }));
  return verteilungsKarteAus("vt-" + tab + "-" + schluessel, titel, eintraege, function (e) {
    const setzen = z => facetteSetzen(z, schluessel, e.wert);
    return { text: e.wert === "" ? LEER_WERT : e.wert, zahl: e.zahl, fokus: "vt-" + tab + "-" + schluessel + "-" + e.wert,
      href: sprungAdresse(tab, setzen), beiKlick: sprungKlick(tab, setzen) };
  }, n => anzahlText(tab, n));
}

/* Eine Verteilung aus fertig gezählten Einträgen ({zahl, …}, absteigend):
   «zeile» macht aus einem Eintrag die Zeile für UI.verteilung (nur für die
   gezeigten), «summeText» nennt die Summe der weggelassenen. Klickbare
   Zeilen zählen beim Nachladen vom gezeigten Wert, ihr Balken gleitet mit. */
function verteilungsKarteAus(schluessel, titel, eintraege, zeile, summeText) {
  const karte = UI.karte({ titel: titel, ebene: 3 });
  karte.setAttribute("data-ds-key", schluessel);
  if (!eintraege.length) {
    karte.inhalt.appendChild(UI.hinweis("Keine Werte vorhanden."));
    return karte;
  }
  const zeilen = eintraege.slice(0, VERTEILUNG_ZEILEN).map(zeile);
  for (const z of zeilen) if (z.fokus) zahlMerken(z.fokus, z.zahl);
  karte.inhalt.appendChild(UI.verteilung(zeilen, { max: eintraege[0].zahl }));
  if (eintraege.length > VERTEILUNG_ZEILEN) {
    const rest = eintraege.slice(VERTEILUNG_ZEILEN);
    const summe = rest.reduce((s, e) => s + e.zahl, 0);
    karte.inhalt.appendChild(UI.hinweis("und " + (rest.length === 1 ? "1 weiterer Wert" : rest.length + " weitere Werte")
      + " (zusammen " + summeText(summe) + ")"));
  }
  return karte;
}

function absteigend(a, b) { return b.zahl - a.zahl || Hilfe.vergleiche(a.text, b.text); }

/* Programme nach Zahl der Berechtigten: Sprung in die Benutzerliste,
   gefiltert auf das Programm (beide Stufen). */
function programmVerteilung() {
  const zaehler = programmZaehler();
  const eintraege = programmSpalten.map(function (p) {
    const e = zaehler.get(p.i);
    return { p: p, text: p.d, eins: e.eins, zwei: e.zwei, zahl: e.eins + e.zwei };
  }).filter(e => e.zahl > 0).sort(absteigend);
  return verteilungsKarteAus("vt-software-programme", "Programme nach Berechtigten", eintraege, function (e) {
    const setzen = function (z) { z.programm = e.p.i; };
    return { text: e.text, zahl: e.zahl, fokus: "vt-software-" + e.p.i,
      titel: e.text + ": " + UI.zahlText(e.eins) + " von Hand, " + UI.zahlText(e.zwei) + " aus AD",
      href: sprungAdresse("benutzer", setzen), beiKlick: sprungKlick("benutzer", setzen) };
  }, n => UI.zahlText(n) + " Berechtigungen");
}

function kategorieVerteilung() {
  const eintraege = Modell.programmKategorien(programmSpalten).map(k => ({
    text: k, zahl: zaehle(programmSpalten, p => p.g === k)
  })).sort(absteigend);
  return verteilungsKarteAus("vt-software-kategorien", "Programme nach Kategorie", eintraege, e => ({ text: e.text, zahl: e.zahl }),
    n => anzahlText("software", n));
}

/* Hinweis einer Bestandskarte, wenn ihre Liste fehlt (listenHinweis). */
function fehltHinweis(schluessel, zeilen) { return listenHinweis[schluessel] && !zeilen.length ? listenHinweis[schluessel] : null; }

/* Die Übersicht je Modul (Rahmen.HAUPTZIELE): welche Bestandskarten,
   welche Zeitstrahlen und welche Verteilungen dazugehören. «bauen» füllt
   «offen» mit den offenen Kennzahlen für den Handlungsbedarf. */
const MODUL = {
  geraete: {
    lead: "ADMIN- und EDU-Clients auf einen Blick.",
    ersteListe: "admin",
    bestand: offen => [
      bestandKarte("admin", clientKennzahlen("admin"), null, offen),
      bestandKarte("edu", clientKennzahlen("edu"), fehltHinweis("edu", eduClients), offen)
    ],
    planung: ["admin", "edu"],
    verteilungsMeta: "ohne archivierte Geräte",
    verteilungen: () => [
      verteilungsKarte("admin", "SCCM_Model", "ADMIN-Clients nach Modell"),
      verteilungsKarte("admin", "SCCM_OSVersion", "ADMIN-Clients nach OS-Version"),
      verteilungsKarte("edu", "SCCM_Model", "EDU-Clients nach Modell"),
      verteilungsKarte("edu", "SCCM_OSVersion", "EDU-Clients nach OS-Version"),
      verteilungsKarte("admin", "GebaeudeStock", "ADMIN-Clients nach Gebäude / Stock"),
      verteilungsKarte("edu", "GebaeudeStock", "EDU-Clients nach Gebäude / Stock")
    ]
  },
  verzeichnis: {
    lead: "Benutzer, Telefonnummern und Software auf einen Blick.",
    ersteListe: "benutzer",
    bestand: offen => [
      bestandKarte("benutzer", benutzerKennzahlen(), null, offen),
      bestandKarte("telefone", telefonKennzahlen(), fehltHinweis("telefon", telefone), offen),
      bestandKarte("software", softwareKennzahlen(), fehltHinweis("software", software), offen)
    ],
    planung: [],
    verteilungsMeta: null,
    verteilungen: () => [
      verteilungsKarte("benutzer", "Abteilung", "Benutzer nach Abteilung"),
      verteilungsKarte("telefone", "__abteilung", "Telefonnummern nach Abteilung"),
      verteilungsKarte("telefone", "__statusText", "Telefonnummern nach Status"),
      programmVerteilung(),
      kategorieVerteilung()
    ]
  },
  videoueberwachung: {
    lead: "Kameras und Kamerarechte aus Milestone auf einen Blick.",
    ersteListe: "kameras",
    bestand: offen => [
      bestandKarte("kameras", kameraKennzahlen(), fehltHinweis("kamera", kameras), offen),
      bestandKarte("kamerarechte", rollenKennzahlen(), fehltHinweis("kamerarolle", kameraRollen), offen)
    ],
    planung: ["kameras"],
    verteilungsMeta: "ohne archivierte Kameras",
    verteilungen: () => [
      verteilungsKarte("kameras", "MS_Modell", "Kameras nach Modell"),
      verteilungsKarte("kameras", "Gebaeude", "Kameras nach Gebäude")
    ]
  }
};

/* Kennzahlen, die beim Nachzeichnen vom gezeigten Wert zählen: je
   Schlüssel (data-fokus der Kachel bzw. Zeile) der Rohwert dieses Laufs
   und der zuletzt gezeigte. Nie aus dem Markup gelesen. */
let neueZahlen = new Map();
const gezeigteZahlen = new Map();

function zahlMerken(schluessel, wert) { neueZahlen.set(schluessel, wert); }

/* Nach dem Abgleich: jede behaltene Kachel und Verteilungszeile, deren
   Zahl sich geändert hat, zählt vom gezeigten zum neuen Wert (ihr Balken
   gleitet in derselben Zeit). Neue Knoten zählen hier nicht: sie zeigen
   ihren Wert, beim ersten Zeigen der Ansicht zählt Bewegung.auftritt. */
function zahlenNachfuehren(wurzel, vorher) {
  const da = new Map();
  for (const n of wurzel.querySelectorAll("[data-ds-key]")) da.set(n.getAttribute("data-ds-key"), n);
  for (const [schluessel, wert] of neueZahlen) {
    const alt = gezeigteZahlen.get(schluessel);
    gezeigteZahlen.set(schluessel, wert);
    const n = da.get(schluessel);
    if (alt === undefined || alt === wert || !n || !vorher.has(n)) continue;
    const zahl = n.querySelector(".ds-tile__value, .ds-kv-list__row > strong");
    if (zahl) Bewegung.hochzaehlen(zahl, wert, { von: alt });
  }
  neueZahlen = new Map();
}

/* Eine Modul-Übersicht: alles nach dem Seitenkopf wird neu gebaut und mit
   dem Bestand abgeglichen (art wie bei zeigen): Karten, Zeilen und
   Säulen bleiben, wo sie waren; nach dem Nachladen gleiten die Punkte des
   Handlungsbedarfs und die Zeilen der Verteilungen an ihren neuen Platz. */
function zeichneUebersicht(modul, art) {
  const m = MODUL[modul];
  const ansicht = knoten[modul].ansicht;
  neueZahlen = new Map();

  const offen = [];
  const bestand = anhaengen(el("div", "karten"), m.bestand(offen));
  const planung = m.planung.length
    ? abschnitt(modul + "-planung", "Ersatzplanung",
        "Laufendes Geschäftsjahr " + Modell.gjAktuell() + " · " + m.verteilungsMeta,
        [anhaengen(el("div", "karten planung"), m.planung.map(planungKarte))])
    : null;
  const neu = schluesselSetzen([
    knoten[modul].kopf,
    handlungsbedarf(modul, offen),
    abschnitt(modul + "-bestand", "Bestand", null, [bestand]),
    planung,
    abschnitt(modul + "-verteilungen", "Verteilungen", m.verteilungsMeta, [anhaengen(el("div", "karten"), m.verteilungen())])
  ].filter(Boolean));

  const vorher = new Set(ansicht.querySelectorAll("[data-ds-key]"));
  zeigen(ansicht, neu, art === "umordnen" ? undefined : art, ".aufgaben > .ds-card, .verteilung > li");
  zahlenNachfuehren(ansicht, vorher);
  // Die Rollkanten des Zeitstrahls (einmal je Roller; was DS.dom.scrollEdges
  // schreibt, behält auch der Abgleich).
  for (const r of ansicht.querySelectorAll(".zeitstrahl > .ds-scroll-x")) DS.dom.scrollEdges(r);
  if (!ansicht.hidden) zeitstrahlAusrichten();
}

function uebersichtGeruest(modul) {
  const ansicht = $("ansicht-" + modul);
  const kopf = UI.seitenkopf({ titel: Rahmen.zielText(modul), lead: MODUL[modul].lead, titelId: modul + "-titel" });
  ansicht.appendChild(kopf);
  knoten[modul] = { ansicht: ansicht, kopf: kopf };
}


/* ==================================================================
   10. Software
   ================================================================== */

function softwareGeruest() {
  const ansicht = $("ansicht-software");
  const kopf = UI.seitenkopf({ titel: "Software", titelId: "software-titel" });
  const suchfeld = UI.suchfeld({
    id: "software-suche", platzhalter: SUCH_PLATZHALTER.software, label: "Software durchsuchen", kuerzel: "/",
    beiEingabe: function (wert) {
      zustand.software.suche = wert;
      zeichneSoftware("umordnen");
      hashSchreiben();
    }
  });
  const anzahl = el("p", "anzahl");
  anzahl.id = "software-anzahl";
  anzahl.setAttribute("aria-live", "polite");
  const leiste = anhaengen(el("div", "ds-action-bar"), [suchfeld, leistenEnde(anzahl, neuKnopf("software"))]);
  const liste = el("div", "software-liste");
  liste.id = "software-liste";
  anhaengen(ansicht, [kopf, leiste, liste]);
  knoten.software = { ansicht: ansicht, kopf: kopf, suchfeld: suchfeld, anzahl: anzahl, liste: liste };
}

/* «3 von Hand», «5 aus AD»: ein Text-Link in die Benutzerliste, gefiltert
   auf genau diese Stufe – die Zahl stimmt so mit der Liste überein. */
function berechtigtLink(p, anzahl, stufe, wort) {
  const text = UI.zahlText(anzahl) + " " + wort;
  if (!anzahl) return el("span", null, text);
  const setzen = function (z) { z.programm = p.i; z.programmStufe = stufe; };
  const a = el("a", null, text);
  a.href = sprungAdresse("benutzer", setzen);
  a.addEventListener("click", sprungKlick("benutzer", setzen));
  a.setAttribute("data-fokus", "sw-" + p.i + "-" + stufe);
  UI.tipp(a, stufe === "1" ? "Von Hand berechtigte Benutzer zeigen"
    : "Über AD-Gruppen berechtigte Benutzer zeigen");
  return a;
}

/* Die AD-Gruppen einer Software oder Kamerarolle: eine Meta-Zeile mit
   Teilen («2 AD-Gruppen · A · B», wie die Vorschau im Softwarefenster).
   Eine Gruppe ist kein Zustand, darum kein Status-Chip. */
function adGruppenZeile(gruppen) {
  return UI.meta(UI.teile([gruppen.length === 1 ? "1 AD-Gruppe" : UI.zahlText(gruppen.length) + " AD-Gruppen"]
    .concat(gruppen)));
}

function softwareKarte(p, e) {
  const karte = UI.karte({ titel: p.d, ebene: 3, klasse: "software-karte" });
  karte.setAttribute("data-ds-key", "sw-karte-" + p.i);
  const h = karte.kopf.querySelector(".ds-card__title");
  leeren(h);
  const name = el("a", "name-link", p.d);
  name.href = UI.adresse.software(p.zeilenId);
  name.setAttribute("data-fokus", "sw-" + p.i + "-name");
  name.addEventListener("click", function (ev) {
    UI.adresse.listeMerken();
    if (!modifiziert(ev)) stelleMerken(null);
  });
  UI.tipp(name, "Programm-ID: " + p.i);
  h.appendChild(name);

  const zahlen = el("p", "ds-muted");
  zahlen.appendChild(UI.teile([berechtigtLink(p, e.eins, "1", "von Hand"), berechtigtLink(p, e.zwei, "2", "aus AD")]));
  /* Ohne AD-Gruppe nur eine leise Meta-Zeile (dieselben Worte wie im
     Softwarefenster): bei vielen Programmen sonst ein Wald gleicher Sätze. */
  const gruppen = p.adGruppen.length ? adGruppenZeile(p.adGruppen) : UI.meta("Nur von Hand vergeben");
  anhaengen(karte.inhalt, [zahlen, gruppen, p.bemerkung ? UI.meta(p.bemerkung) : null]);
  return karte;
}

/* Eine Karte je Programm, nach Kategorie in Abschnitten. Beim Suchen
   gleiten die Karten (eine Kategorie ohne Treffer geht samt Titel). */
function zeichneSoftware(art) {
  const k = knoten.software;
  const suche = zustand.software.suche.trim().toLowerCase();

  /* Fehlt die Liste «Software», sagt die Ansicht, was zu tun ist. */
  if (listenHinweis.software && !software.length) {
    UI.abgleichen(k.liste, [UI.leerzustand({ sinnbild: "software", titel: "Liste «Software» nicht verfügbar",
      text: listenHinweis.software })]);
    UI.textSetzen(k.anzahl, "");
    return;
  }

  const zaehler = programmZaehler();
  const neu = [];
  let gezeigt = 0;
  for (const kategorie of Modell.programmKategorien(programmSpalten)) {
    const spalten = programmSpalten.filter(function (p) {
      if (p.g !== kategorie) return false;
      if (!suche) return true;
      return p.d.toLowerCase().indexOf(suche) > -1 || p.i.toLowerCase().indexOf(suche) > -1
        || p.adGruppen.join(" ").toLowerCase().indexOf(suche) > -1;
    });
    if (!spalten.length) continue;
    gezeigt += spalten.length;
    const karten = anhaengen(el("div", "karten software-karten"),
      spalten.map(p => softwareKarte(p, zaehler.get(p.i) || { eins: 0, zwei: 0 })));
    neu.push(abschnitt("sw-kat-" + kategorie.replace(/\W+/g, "-"), kategorie,
      anzahlText("software", spalten.length), [karten]));
  }

  if (!gezeigt) {
    neu.push(programmSpalten.length
      ? UI.leerzustand({ sinnbild: "suche", titel: "Keine Treffer",
          aktion: { text: "Suche zurücksetzen", fokus: "software-leer-aktion", beiKlick: function () {
            zustand.software.suche = "";
            suchfeldAngleichen("software");
            k.suchfeld.eingabe.focus();
            zeichneSoftware("umordnen");
            hashSchreiben();
          } } })
      : UI.leerzustand({ sinnbild: "software", titel: "Noch keine Programme",
          text: "Das erste Programm lässt sich über «Neues Programm» erfassen." }));
  }
  zeigen(k.liste, schluesselSetzen(neu), art, ".software-karte, .abschnitt-kopf");

  UI.textSetzen(k.anzahl, gezeigt === programmSpalten.length
    ? anzahlText("software", programmSpalten.length)
    : UI.zahlText(gezeigt) + " von " + UI.zahlText(programmSpalten.length));
}

function zeichneSoftwareAnsicht(art) {
  knoten.software.suchfeld.setzen(zustand.software.suche);
  zeichneSoftware(art);
}


/* ==================================================================
   10b. Kamerarechte

   Eine Karte je Rolle aus Milestone: wer Mitglied ist (AD-Gruppen), welche
   Rechte sie hat, auf wie viele Kameras und wie viele Personen das sind.
   Führend ist Milestone; die Rollenseite (kamerarolle.html) zeigt die
   Einzelheiten.
   ================================================================== */

function rechteGeruest() {
  const ansicht = $("ansicht-kamerarechte");
  const kopf = UI.seitenkopf({ titel: "Kamerarechte", titelId: "kamerarechte-titel" });
  const suchfeld = UI.suchfeld({
    id: "kamerarechte-suche", platzhalter: SUCH_PLATZHALTER.kamerarechte, label: "Kamerarechte durchsuchen", kuerzel: "/",
    beiEingabe: function (wert) {
      zustand.kamerarechte.suche = wert;
      zeichneKamerarechte("umordnen");
      hashSchreiben();
    }
  });
  const anzahl = el("p", "anzahl");
  anzahl.id = "kamerarechte-anzahl";
  anzahl.setAttribute("aria-live", "polite");
  const leiste = anhaengen(el("div", "ds-action-bar"), [suchfeld, leistenEnde(anzahl, null)]);
  const stand = el("div", "kamerarechte-stand");
  const liste = el("div", "karten software-karten kamerarechte-liste");
  liste.id = "kamerarechte-liste";
  anhaengen(ansicht, [kopf, leiste, stand, liste]);
  knoten.kamerarechte = { ansicht: ansicht, kopf: kopf, suchfeld: suchfeld, anzahl: anzahl, stand: stand, liste: liste };
}

/* Die Kameras einer Rolle: Link in die Kameraliste, gefiltert auf genau
   diese Rolle – die Zahl stimmt so mit der Liste überein. */
function rollenKameraLink(r) {
  const n = r.__inMilestone ? r.__kameras.length : 0;
  const text = UI.zahlText(n) + (n === 1 ? " Kamera" : " Kameras");
  if (!n) return el("span", null, text);
  const setzen = function (z) { z.rolle = String(r.id); };
  const a = el("a", null, text);
  a.href = sprungAdresse("kameras", setzen);
  a.addEventListener("click", sprungKlick("kameras", setzen));
  a.setAttribute("data-fokus", "kr-" + r.id + "-kameras");
  UI.tipp(a, "Kameras dieser Rolle in der Liste zeigen");
  return a;
}

function rollenKarte(r) {
  const karte = UI.karte({ titel: String(r.Title || "").trim() || "(ohne Namen)", ebene: 3, klasse: "software-karte kamerarolle-karte" });
  karte.setAttribute("data-ds-key", "kr-karte-" + r.id);
  const h = karte.kopf.querySelector(".ds-card__title");
  leeren(h);
  const name = el("a", "name-link", String(r.Title || "").trim() || "(ohne Namen)");
  name.href = UI.adresse.kamerarolle(r.id);
  name.setAttribute("data-fokus", "kr-" + r.id + "-name");
  name.addEventListener("click", function (ev) {
    UI.adresse.listeMerken();
    if (!modifiziert(ev)) stelleMerken(null);
  });
  h.appendChild(name);

  // Ein Chip nur für die Abweichung; die Art der Rolle ist ein Teil der Zeile.
  const status = r.__inMilestone ? null : UI.chips([UI.status("Nicht mehr in Milestone", "neutral", { sinnbild: "archiv" })]);

  const n = r.__personen.length + r.__unbekannt.length;
  const zahlen = el("p", "ds-muted");
  // Die Rolle der Administratoren sieht alles; heisst sie schon so, sagt der Titel es.
  zahlen.appendChild(UI.teile([rollenKameraLink(r), UI.zahlText(n) + (n === 1 ? " Person" : " Personen"),
    r.__admin && !/admin/i.test(String(r.Title || "")) ? "Administratoren" : null]));

  const gruppen = r.__adGruppen.length
    ? adGruppenZeile(r.__adGruppen)
    : UI.meta(r.__mitglieder.length ? r.__mitglieder.map(m => m.name).join(", ") : "Keine Mitglieder");
  const rechte = r.__rechte.length ? UI.meta("Rechte: " + r.__rechte.join(", ")) : null;
  anhaengen(karte.inhalt, [status, zahlen, gruppen, rechte]);
  return karte;
}

/* Eine Karte je Rolle; beim Suchen gleiten die Karten. */
function zeichneKamerarechte(art) {
  const k = knoten.kamerarechte;
  const z = zustand.kamerarechte;

  if (!kameraRollen.length) {
    UI.abgleichen(k.stand, []);
    UI.abgleichen(k.liste, [listenHinweis.kamerarolle
      ? UI.leerzustand({ sinnbild: "schild", titel: "Liste «Kamera-Rollen» nicht verfügbar",
          text: listenHinweis.kamerarolle })
      : UI.leerzustand({ sinnbild: "schild", titel: "Noch keine Rollen",
          text: "Der Abgleich liest die Rollen aus Milestone, sobald das Konto des Syncs sie lesen darf (README Abschnitt 7.5)." })]);
    UI.textSetzen(k.anzahl, "");
    return;
  }

  // Stand des Abgleichs: der jüngste Zeitpunkt über alle Rollen.
  let juengster = null;
  for (const r of kameraRollen) {
    const d = Hilfe.datum(r.MS_LetzterSync);
    if (d && (!juengster || d > juengster)) juengster = d;
  }
  UI.abgleichen(k.stand, juengster ? [UI.hinweis("Rechte aus Milestone, zuletzt abgeglichen " + UI.zeitText(juengster)
    + ". Geändert werden sie im Management Client von Milestone, nicht hier.")] : []);

  const worte = z.suche.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const passend = kameraRollen.filter(function (r) {
    for (const w of worte) if (r.__such.indexOf(w) === -1) return false;
    return true;
  }).sort(function (a, b) {
    // Rollen in Milestone zuerst, dann nach Namen.
    if (a.__inMilestone !== b.__inMilestone) return a.__inMilestone ? -1 : 1;
    return Hilfe.vergleiche(a.Title, b.Title);
  });

  const neu = passend.length ? passend.map(rollenKarte)
    : [UI.leerzustand({ sinnbild: "suche", titel: "Keine Treffer",
        aktion: { text: "Suche zurücksetzen", fokus: "kamerarechte-leer-aktion", beiKlick: function () {
          zustand.kamerarechte = leererRechteZustand();
          suchfeldAngleichen("kamerarechte");
          k.suchfeld.eingabe.focus();
          zeichneKamerarechte("umordnen");
          hashSchreiben();
        } } })];
  zeigen(k.liste, schluesselSetzen(neu), art);
  UI.textSetzen(k.anzahl, passend.length === kameraRollen.length
    ? anzahlText("kamerarechte", kameraRollen.length)
    : UI.zahlText(passend.length) + " von " + UI.zahlText(kameraRollen.length));
}

function zeichneKamerarechteAnsicht(art) {
  knoten.kamerarechte.suchfeld.setzen(zustand.kamerarechte.suche);
  zeichneKamerarechte(art);
}


/* ==================================================================
   11. Ansichten wechseln, Nachladen, Rundfunkkanal
   ================================================================== */

/* Sichtbarkeit, feste Tafel und Titel der Ansicht – ohne zu zeichnen. */
function ansichtZeigen(name) {
  for (const a of ANSICHTEN) $("ansicht-" + a).hidden = a !== name;
  Rahmen.fest(TABELLEN.indexOf(name) > -1);
  /* Im Fehlerzustand nennt der Titel den Fehler, nicht die Ansicht,
     die erst nach «Erneut laden» erscheint. */
  if (Rahmen.zustandJetzt() !== "fehler") Rahmen.dokumentTitel(Rahmen.zielText(name));
}

/* Die aktuelle Ansicht zeichnen (art wie bei zeigen). */
function zeichneAnsicht(art) {
  const a = zustand.ansicht;
  if (istUebersicht(a)) zeichneUebersicht(a, art);
  else if (a === "software") zeichneSoftwareAnsicht(art);
  else if (a === "kamerarechte") zeichneKamerarechteAnsicht(art);
  else zeichneTabellenAnsicht(a, art);
}

/* Auf eine andere Ansicht umschalten. Die Pille gleitet, die Ansichten
   wechseln im «fade-through» von Dashboard-Style (Rahmen.wechseln über
   DS.motion.transition); ihre Raster staffeln nur beim ersten Zeigen. Vor
   dem ersten Inhalt wird nur gemerkt, was gezeigt werden soll. */
function ansichtWechseln(name, ausVerlauf) {
  if (ANSICHTEN.indexOf(name) === -1) return Promise.resolve(false);
  const gewechselt = zustand.ansicht !== name;
  zustand.ansicht = name;
  /* Kommt der Wechsel aus Vor/Zurück, steht die Adresse schon richtig:
     ein neuer Verlaufseintrag würde die Vorwärts-Taste abschneiden. */
  hashSchreiben(gewechselt && !ausVerlauf);
  Rahmen.aktiv(name);
  if (!appBereit) {
    ansichtZeigen(name);
    return Promise.resolve(false);
  }
  if (!gewechselt) return Promise.resolve(false);
  if (offenesBlatt) offenesBlatt.blatt.schliessen("wechsel");
  return Rahmen.wechseln(function () {
    ansichtZeigen(name);
    zeichneAnsicht();
    return $("ansicht-" + name);
  }).then(function (ok) {
    if (ok && istUebersicht(name)) zeitstrahlAusrichten();
    return ok;
  });
}

/* Still nachladen, ohne Filter, Sortierung, Rollposition, Fokus oder ein
   offenes Blatt zu verlieren und ohne einen Auftritt zu wiederholen: die
   Ansicht gleicht ab, geänderte Zeilen gleiten (live, siehe zeigen),
   Kennzahlen zählen vom gezeigten Wert.

   «leise» ist der automatische Takt: er meldet nichts. Ein Nachladen, das
   eine Änderung aus einem Detailfenster einsammelt, sagt kurz Bescheid.
   Kommt eine Meldung, während schon geladen wird, lädt die Seite danach
   noch einmal – sonst ginge die Änderung bis zum nächsten Takt verloren. */
let ladeLaeuft = false;
let nochmal = null;   // null | { leise }
let letzteAktualisierung = Date.now();

async function stillNeuLaden(leise) {
  if (!appBereit) return;
  if (ladeLaeuft) {
    nochmal = { leise: !!leise && (!nochmal || nochmal.leise) };
    return;
  }
  ladeLaeuft = true;
  const k = knoten[zustand.ansicht];
  try {
    const fehlgeschlagen = await datenLaden(true);
    alleNeuBerechnen();
    Rahmen.stillZeichnen(k ? k.ansicht : null, function () { zeichneAnsicht("live"); });
    if (offenesBlatt) offenesBlatt.nachfuehren();
    if (!leise) {
      if (fehlgeschlagen.length) {
        const eine = fehlgeschlagen.length === 1;
        UI.meldung((eine ? "Die Liste «" : "Die Listen «") + fehlgeschlagen.join("», «")
          + (eine ? "» konnte" : "» konnten") + " nicht aktualisiert werden. Es bleibt beim vorigen Stand.", { ton: "fehler" });
      } else {
        UI.meldung("Daten aktualisiert.", { ton: "info" });
      }
    }
  } catch (fehler) {
    /* Der bisherige Stand bleibt stehen; der nächste Takt versucht es wieder. */
    if (!leise) UI.meldung("Die Daten konnten nicht aktualisiert werden. "
      + (fehler && fehler.message ? fehler.message : ""), { ton: "fehler" });
  } finally {
    ladeLaeuft = false;
    letzteAktualisierung = Date.now();
    if (nochmal) {
      const n = nochmal;
      nochmal = null;
      stillNeuLaden(n.leise);
    }
  }
}

/* Wird gerade getippt oder ist eine Ebene offen, wartet das automatische
   Nachladen bis zum nächsten Takt. */
function nachladenStoert() {
  if (UI.ebeneOffen()) return true;
  const a = document.activeElement;
  return !!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable);
}

/* Geprüft wird oft, nachgeladen selten: nur wenn das Fenster sichtbar ist
   und der Takt abgelaufen ist. Ein Hintergrund-Tab holt sofort nach,
   sobald er wieder vorne ist und die Daten alt sind. */
function autoNachladenPruefen() {
  if (document.hidden || !appBereit || ladeLaeuft) return;
  if (Date.now() - letzteAktualisierung < KONFIG.autoTaktMs) return;
  if (nachladenStoert()) return;
  stillNeuLaden(true);
}

function autoNachladenStarten() {
  letzteAktualisierung = Date.now();
  setInterval(autoNachladenPruefen, KONFIG.autoPruefTaktMs);
  document.addEventListener("visibilitychange", autoNachladenPruefen);
}

/* Auf Meldungen aus den Detailfenstern hören. Ohne BroadcastChannel – oder
   wenn der Browser ihn verweigert (SecurityError in eingeschränkten
   Kontexten, wie in fenster.js abgefangen) – holt die Seite Änderungen mit
   dem nächsten automatischen Takt. */
const MELDUNGEN = ["zeile-geaendert", "zeile-neu", "zeile-geloescht", "benutzer-geaendert",
                   "telefon-geaendert", "telefon-neu", "telefon-geloescht",
                   "software-geaendert", "software-neu", "software-geloescht",
                   "kamera-geaendert", "kamera-geloescht",
                   "kamerarolle-geaendert", "kamerarolle-geloescht"];

function kanalVerbinden() {
  if (!window.BroadcastChannel) return;
  let zeitgeber = null;
  let kanal;
  try {
    kanal = new BroadcastChannel(KONFIG.kanalName);
  } catch (e) {
    return;
  }
  kanal.addEventListener("message", function (ereignis) {
    const typ = ereignis.data && ereignis.data.typ;
    if (MELDUNGEN.indexOf(typ) === -1) return;
    // Mehrere Meldungen kurz hintereinander ergeben ein einziges Nachladen.
    clearTimeout(zeitgeber);
    zeitgeber = setTimeout(function () { stillNeuLaden(false); }, 250);
  });
}


/* ==================================================================
   12. Start und Ereignisse
   ================================================================== */

let konto = null;

/* Die Stelle in der Liste, an die der Zurück-Link einer Detailseite
   zurückführt (siehe stelleMerken); gilt nur für den ersten Inhalt. */
let gemerkteStelle = null;

/* Laden bis zum ersten Inhalt; «Erneut laden» im Fehlerzustand ruft es
   noch einmal auf (ohne die Seite neu zu laden). */
async function laden() {
  appBereit = false;
  try {
    if (!mockModus && !konto) {
      Rahmen.zustand("laden", { text: "Anmeldung wird geprüft …" });
      konto = await Auth.anmeldungSicherstellen();
      Rahmen.konto(konto);
      Rahmen.abmelden(function () { Auth.abmelden(); });
    }
    await datenLaden(false);
    alleNeuBerechnen();
    ansichtZeigen(zustand.ansicht);
    zeichneAnsicht();
    /* Den Zustand einmal in die Adresse schreiben: so enthält der Link von
       Anfang an auch Spalten (c=) und Dichte (d=). */
    hashSchreiben();
    appBereit = true;
    letzteAktualisierung = Date.now();
    await Rahmen.zustand("inhalt");
    stelleWiederherstellen(gemerkteStelle);
    gemerkteStelle = null;
    if (istUebersicht(zustand.ansicht)) zeitstrahlAusrichten();
  } catch (fehler) {
    const meldung = fehler && fehler.message ? fehler.message : String(fehler);
    Rahmen.zustand("fehler", {
      titel: "Die Daten konnten nicht geladen werden", text: meldung,
      beiKlick: function () { laden(); }
    });
  }
}

function start() {
  // Vor allem anderen: laden() schreibt die Adresse gleich neu.
  gemerkteStelle = stelleHolen();
  einstellungenLaden();
  hashLesen();
  spaltenIndexAufbauen();

  for (const modul of UEBERSICHTEN) uebersichtGeruest(modul);
  for (const tab of TABELLEN) tabellenGeruest(tab);
  softwareGeruest();
  rechteGeruest();

  Rahmen.navigation({ gruppen: Rahmen.HAUPTZIELE, aktiv: zustand.ansicht, label: "Hauptnavigation",
    beiWahl: function (schluessel) { ansichtWechseln(schluessel); } });
  ansichtZeigen(zustand.ansicht);
  if (mockModus) {
    Rahmen.konto({ name: "Vorführmodus" });
    Rahmen.vorfuehrung({
      beiZuruecksetzen: function () { Mock.zuruecksetzen(); location.reload(); }
    });
  }
  ereignisseVerbinden();
  laden();
}

function tippt(ziel) {
  return !!ziel && (ziel.tagName === "INPUT" || ziel.tagName === "TEXTAREA"
    || ziel.tagName === "SELECT" || ziel.isContentEditable);
}

function suchfeldVon(name) {
  const k = knoten[name];
  return k && k.suchfeld ? k.suchfeld.eingabe : null;
}

/* Das Suchfeld zeigt den Suchtext des Zustands – auch dann, wenn es den
   Fokus hat. Für die Fälle, in denen nicht das Tippen die Quelle ist: eine
   neue Adresse derselben Ansicht von aussen (eingefügter Link, Vor/Zurück)
   und ein ausdrückliches Zurücksetzen. suchfeld.setzen() schreibt dann
   absichtlich nicht (nie gegen das Tippen), darum hier direkt
   ins Feld. Eine noch wartende Eingabe meldet danach diesen Wert statt des
   alten. */
function suchfeldAngleichen(name) {
  const feld = suchfeldVon(name);
  const z = zustand[name];
  if (!feld || !z) return;
  if (feld.value !== z.suche) feld.value = z.suche;
}

function ereignisseVerbinden() {
  /* Die Wortmarke führt zur ersten Übersicht. Ein schlichter Klick bleibt
     auf der Seite (kein Neuladen aller Listen); modifizierte Klicks gehören
     dem Browser. */
  const marke = Rahmen.elemente().kopf && Rahmen.elemente().kopf.querySelector(".ds-brand");
  if (marke) {
    marke.addEventListener("click", function (ev) {
      if (modifiziert(ev)) return;
      ev.preventDefault();
      ansichtWechseln(Rahmen.STARTZIEL);
    });
  }

  /* «/» springt in die Suche der aktuellen Liste; aus einer Übersicht erst
     in die erste Liste des Moduls. Nie beim Tippen und nie hinter einer
     offenen Ebene. */
  document.addEventListener("keydown", function (e) {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
    if (tippt(e.target) || UI.ebeneOffen()) return;
    e.preventDefault();
    const name = istUebersicht(zustand.ansicht) ? MODUL[zustand.ansicht].ersteListe : zustand.ansicht;
    const fokussieren = function () {
      const feld = suchfeldVon(name);
      if (feld) { feld.focus(); feld.select(); }
    };
    if (name !== zustand.ansicht) ansichtWechseln(name).then(fokussieren);
    else fokussieren();
  });

  /* Kommt die Seite über die Zurück-Taste aus dem Cache des Browsers, ist
     sie so alt wie beim Verlassen – die Änderung aus der Detailseite fehlt.
     Darum still nachladen. */
  window.addEventListener("pageshow", function (e) {
    if (!e.persisted) return;
    // Die Liste steht schon an ihrer Stelle; ein späteres F5 soll oben beginnen.
    stelleVergessen();
    if (appBereit) stillNeuLaden(true);
  });

  /* Vor/Zurück im Browser: Zustand aus dem Hash, die Ansicht wechselt mit
     Bewegung, innerhalb derselben Ansicht wird still neu gezeichnet. */
  window.addEventListener("hashchange", function () {
    if (location.hash === eigenerHash) { eigenerHash = null; return; }
    eigenerHash = null;
    const vorher = zustand.ansicht;
    hashLesen();
    const name = zustand.ansicht;
    if (!appBereit) { Rahmen.aktiv(name); ansichtZeigen(name); return; }
    alleNeuBerechnen();
    if (offenesBlatt) offenesBlatt.blatt.schliessen("navigation");
    if (name !== vorher) {
      zustand.ansicht = vorher;
      ansichtWechseln(name, true);
    } else {
      suchfeldAngleichen(name);
      Rahmen.stillZeichnen(knoten[name] ? knoten[name].ansicht : null, function () { zeichneAnsicht(); });
    }
  });

  // Erst der Takt, dann der Kanal: das Nachladen hängt nie am Kanal.
  autoNachladenStarten();
  kanalVerbinden();
}

start();

})();

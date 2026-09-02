/* app.js — Oberfläche des Computer Inventars.

   Aufbau:
     1. Spaltenwissen aus spalten.js aufbereiten
     2. Zustand (Ansicht, Suche, Filter, Sortierung, Spaltenauswahl)
     3. Daten laden und anreichern
     4. Filtern und sortieren
     5. Die drei Ansichten zeichnen: Übersicht, Geräte, Software
     6. Detailpanel
     7. Start

   Grundsätze: kein Framework, keine globalen Variablen ausser den drei
   Modulen aus den anderen Dateien, und niemals innerHTML mit Daten aus
   SharePoint. Texte gehen ausschliesslich über textContent in die Seite. */

"use strict";

(function () {

/* ==================================================================
   1. Spaltenwissen
   ================================================================== */

const SPALTE = {};
for (const s of SPALTEN) SPALTE[s.i] = s;

/* Reihenfolge der Gruppen, so wie sie im Schema stehen. */
const GRUPPEN = [];
for (const s of SPALTEN) if (GRUPPEN.indexOf(s.g) === -1) GRUPPEN.push(s.g);

/* Gruppen, deren Ja/Nein-Spalten echte Software oder Rechte sind. Die
   Jahres-Häkchen in «Stammdaten» und das Budget gehören nicht dazu. */
const SW_GRUPPEN = ["Standard-Software und Rechte", "ABACUS", "Zusatz-Software",
                    "Technik-Software", "Bpanda"];
const AD_GRUPPE = "Spezial-Software (AD-Gruppe)";

const SOFTWARE_SPALTEN = SPALTEN.filter(s =>
  (s.t === "Boolean" && SW_GRUPPEN.indexOf(s.g) > -1) || s.g === AD_GRUPPE);

/* Die Beschaffungsjahre stecken als einzelne Ja/Nein-Spalten in den
   Stammdaten («2019/2020» bis «2025/2026»). */
const JAHR_SPALTEN = SPALTEN.filter(s =>
  s.g === "Stammdaten" && s.t === "Boolean" && /^J\d{8}$/.test(s.i));

/* Standardauswahl der Tabellenspalten: bewusst klein gehalten. */
const STANDARD_SPALTEN = ["Title", "Arbeitsplatz", "Firma", "GebaeudeStock",
                          "SCCM_Model", "SCCM_OSVersion", "SCCM_LastActive",
                          "SCCM_LastLogonUser", "SCCM_DiskCFreeGB"];

/* Facetten der Filterleiste. Schlüssel mit «__» sind abgeleitet und stehen
   nicht so in SharePoint. */
const FACETTEN = [
  { k: "__art",             d: "Art der Zeile" },
  { k: "Firma",             d: "Firma" },
  { k: "Typ",               d: "Typ" },
  { k: "GebaeudeStock",     d: "Gebäude / Stock" },
  { k: "SCCM_Manufacturer", d: "Hersteller" },
  { k: "SCCM_Model",        d: "Modell" },
  { k: "SCCM_ChassisType",  d: "Gehäusetyp" },
  { k: "SCCM_OSVersion",    d: "OS-Version" },
  { k: "__jahr",            d: "Beschaffungsjahr" },
  { k: "SCCM_Found",        d: "In SCCM" },
  { k: "SCCM_Online",       d: "Online" },
  { k: "SCCM_ClientActive", d: "Client aktiv" },
  { k: "SCCM_EPEnabled",    d: "Defender aktiv" }
];

/* Zeitraumfilter auf Datumsspalten. */
const ZEITSPALTEN = [
  { k: "SCCM_LastActive",      d: "Zuletzt aktiv" },
  { k: "SCCM_LastConsoleUse",  d: "Letzte Benutzeranmeldung" },
  { k: "SCCM_LastBoot",        d: "Letzter Neustart" },
  { k: "SCCM_EPSignatureDate", d: "Defender-Signatur" }
];

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

/* Note-Spalten, die im Detail als Tabelle statt als Liste erscheinen. */
const NOTE_TABELLEN = {
  SCCM_DeployedApps: ["Applikation", "Sammlung", "Zuweisung", "Status"],
  SCCM_ConsoleUsers: ["Benutzer", "Anmeldungen", "Dauer", "Zuletzt"],
  SCCM_InstalledSoftware: ["Software", "Version"],
  SCCM_Monitors: ["Monitor", "Auflösung"],
  SCCM_PhysicalDisks: ["Datenträger", "Zustand"]
};


/* ==================================================================
   2. Zustand
   ================================================================== */

const ANSICHTEN = ["uebersicht", "geraete", "software"];
const SPEICHER_SCHLUESSEL = "computerinventar.spalten";

const zustand = {
  ansicht:   "uebersicht",
  suche:     "",
  facetten:  {},   // { schluessel: [werte] }
  zeit:      {},   // { schluessel: zeitraum }
  speicher:  "",
  software:  [],   // interne Spaltennamen
  app:       "",   // eine SCCM-Applikation aus den Deployments
  sortSpalte: "Title",
  sortAuf:   true,
  spalten:   STANDARD_SPALTEN.slice(),
  detail:    null
};

let alleZeilen = [];      // angereicherte Zeilen
let sichtbareZeilen = []; // nach Filter und Sortierung
/* Zuletzt selbst geschriebener Hash. Damit lässt sich das eigene
   hashchange-Ereignis von einem echten Klick auf Vor/Zurück unterscheiden,
   ohne mit Zeitgebern zu arbeiten. */
let eigenerHash = null;

const mockModus = new URLSearchParams(location.search).get("mock") === "1";


/* ==================================================================
   Kleine DOM-Helfer. Alles über textContent, nie über innerHTML.
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


/* ==================================================================
   3. Daten anreichern
   ================================================================== */

/* Aus jeder Rohzeile wird eine Zeile mit ein paar abgeleiteten Feldern.
   Alle abgeleiteten Felder beginnen mit «__», damit sie sich nie mit einer
   SharePoint-Spalte beissen können. */
function anreichern(roh) {
  return roh.map(function (z) {
    const titel = String(z.Title || "").trim();
    const istGeteilt = /^Shared\s+/i.test(titel);
    const istKeinPc = /^kein pc$/i.test(titel);

    z.__geraet = istGeteilt ? titel.replace(/^Shared\s+/i, "").trim() : (istKeinPc ? "" : titel);
    z.__istGeteilt = istGeteilt;
    z.__istKeinPc = istKeinPc;
    z.__art = istKeinPc ? "Kein PC" : (istGeteilt ? "Weiterer Benutzer" : "Gerät");

    // Jüngstes angekreuztes Beschaffungsjahr.
    z.__jahr = "";
    for (const j of JAHR_SPALTEN) if (Hilfe.istJa(z[j.i])) z.__jahr = j.d;

    // Volltextindex: alle nicht leeren Werte, einmal klein geschrieben.
    const teile = [];
    for (const s of SPALTEN) {
      const w = z[s.i];
      if (w === null || w === undefined || w === "" || w === false) continue;
      teile.push(s.t === "Boolean" ? s.d : String(w));
    }
    z.__such = teile.join("  ").toLowerCase();
    return z;
  });
}

/* Wert einer Facette, inklusive der abgeleiteten. */
function facettenWert(zeile, schluessel) {
  const w = zeile[schluessel];
  if (w === null || w === undefined) return "";
  if (w === true) return "Ja";
  if (w === false) return "";
  return String(w).trim();
}


/* ==================================================================
   4. Filtern und sortieren
   ================================================================== */

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

/* «hat diese Software»: Ja/Nein-Spalten liefern true, AD-Gruppen-Spalten
   einen nicht leeren Text. */
function hatSoftware(zeile, spalte) {
  const w = zeile[spalte];
  if (typeof w === "boolean") return w;
  const t = String(w || "").trim();
  if (!t) return false;
  return t.toLowerCase() !== "nein";
}

/* Ist dieser Applikation ein Deployment auf dieses Gerät zugewiesen?
   Bewusst kein Volltexttreffer: derselbe Name steht meist auch in der Liste
   der installierten Programme, und dann würde der Filter zu viel finden. */
function hatDeployedApp(zeile, app) {
  for (const z of Hilfe.zeilen(zeile.SCCM_DeployedApps)) {
    if (Hilfe.felder(z)[0] === app) return true;
  }
  return false;
}

function filtern() {
  const suche = zustand.suche.trim().toLowerCase();
  const worte = suche ? suche.split(/\s+/) : [];

  return alleZeilen.filter(function (z) {
    for (const wort of worte) if (z.__such.indexOf(wort) === -1) return false;

    for (const schluessel of Object.keys(zustand.facetten)) {
      const werte = zustand.facetten[schluessel];
      if (!werte || !werte.length) continue;
      if (werte.indexOf(facettenWert(z, schluessel)) === -1) return false;
    }

    for (const schluessel of Object.keys(zustand.zeit)) {
      const zeitraum = zustand.zeit[schluessel];
      if (!zeitraum) continue;
      if (!zeitPasst(z[schluessel], zeitraum)) return false;
    }

    if (zustand.speicher && !speicherPasst(z.SCCM_DiskCFreeGB, zustand.speicher)) return false;

    for (const spalte of zustand.software) if (!hatSoftware(z, spalte)) return false;

    if (zustand.app && !hatDeployedApp(z, zustand.app)) return false;

    return true;
  });
}

function sortieren(zeilen) {
  const schluessel = zustand.sortSpalte;
  const richtung = zustand.sortAuf ? 1 : -1;
  const typ = SPALTE[schluessel] ? SPALTE[schluessel].t : "Text";

  return zeilen.slice().sort(function (a, b) {
    let x = a[schluessel], y = b[schluessel];

    if (typ === "DateTime") {
      const dx = Hilfe.datum(x), dy = Hilfe.datum(y);
      if (!dx && !dy) return 0;
      if (!dx) return 1;          // leere Werte immer ans Ende
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
    if (typ === "Boolean") {
      return ((x ? 1 : 0) - (y ? 1 : 0)) * richtung;
    }
    return Hilfe.vergleiche(x, y) * richtung;
  });
}

function neuBerechnen() {
  sichtbareZeilen = sortieren(filtern());
}


/* ==================================================================
   Adresszeile: Ansicht, Suche, Filter und Sortierung stecken im Hash,
   damit sich eine Auswertung als Link weitergeben lässt. Die
   Spaltenauswahl bleibt lokal im Browser, sie würde den Link sprengen.
   ================================================================== */

function hashSchreiben() {
  const p = new URLSearchParams();
  if (zustand.suche) p.set("q", zustand.suche);

  const f = [];
  for (const k of Object.keys(zustand.facetten)) {
    const w = zustand.facetten[k];
    if (w && w.length) f.push(k + ":" + w.join("|"));
  }
  if (f.length) p.set("f", f.join(";"));

  const z = [];
  for (const k of Object.keys(zustand.zeit)) if (zustand.zeit[k]) z.push(k + ":" + zustand.zeit[k]);
  if (z.length) p.set("z", z.join(";"));

  if (zustand.speicher) p.set("sp", zustand.speicher);
  if (zustand.software.length) p.set("sw", zustand.software.join(","));
  if (zustand.app) p.set("app", zustand.app);
  if (zustand.sortSpalte !== "Title" || !zustand.sortAuf) {
    p.set("s", zustand.sortSpalte + ":" + (zustand.sortAuf ? "auf" : "ab"));
  }
  if (zustand.detail) p.set("d", zustand.detail);

  const text = p.toString();
  const neu = "#" + zustand.ansicht + (text ? "?" + text : "");
  if (location.hash === neu) return;
  eigenerHash = neu;

  /* Bewusst replaceState statt location.hash:
       - Zwei Zuweisungen an location.hash im selben Durchlauf verwirft der
         Browser stillschweigend, die zweite Änderung ginge verloren. Genau
         das passiert, wenn ein Klick zwei Filter gleichzeitig setzt.
       - Jede Filteränderung als eigenen Eintrag in den Verlauf zu legen,
         würde die Zurück-Taste unbrauchbar machen.
     Der Link in der Adresszeile bleibt trotzdem jederzeit teilbar. */
  if (window.history && history.replaceState) {
    history.replaceState(null, "", location.pathname + location.search + neu);
  } else {
    location.hash = neu;
  }
}

function hashLesen() {
  const roh = location.hash.replace(/^#/, "");
  const trenn = roh.indexOf("?");
  const ansicht = (trenn === -1 ? roh : roh.slice(0, trenn)) || "uebersicht";
  const p = new URLSearchParams(trenn === -1 ? "" : roh.slice(trenn + 1));

  zustand.ansicht = ANSICHTEN.indexOf(ansicht) > -1 ? ansicht : "uebersicht";
  zustand.suche = p.get("q") || "";

  zustand.facetten = {};
  for (const teil of (p.get("f") || "").split(";")) {
    if (!teil) continue;
    const i = teil.indexOf(":");
    if (i === -1) continue;
    zustand.facetten[teil.slice(0, i)] = teil.slice(i + 1).split("|").filter(Boolean);
  }

  zustand.zeit = {};
  for (const teil of (p.get("z") || "").split(";")) {
    if (!teil) continue;
    const i = teil.indexOf(":");
    if (i === -1) continue;
    zustand.zeit[teil.slice(0, i)] = teil.slice(i + 1);
  }

  zustand.speicher = p.get("sp") || "";
  zustand.software = (p.get("sw") || "").split(",").filter(Boolean);
  zustand.app = p.get("app") || "";

  const s = p.get("s");
  if (s) {
    const i = s.indexOf(":");
    zustand.sortSpalte = i === -1 ? s : s.slice(0, i);
    zustand.sortAuf = i === -1 ? true : s.slice(i + 1) !== "ab";
  } else {
    zustand.sortSpalte = "Title";
    zustand.sortAuf = true;
  }

  zustand.detail = p.get("d") || null;
}

function spaltenLaden() {
  try {
    const roh = localStorage.getItem(SPEICHER_SCHLUESSEL);
    if (!roh) return;
    const liste = JSON.parse(roh);
    if (Array.isArray(liste) && liste.length) {
      zustand.spalten = liste.filter(k => SPALTE[k]);
    }
  } catch (e) { /* Ohne gespeicherte Auswahl gilt das Standardset. */ }
}

function spaltenMerken() {
  try {
    localStorage.setItem(SPEICHER_SCHLUESSEL, JSON.stringify(zustand.spalten));
  } catch (e) { /* Privater Modus: dann eben nur für diese Sitzung. */ }
}


/* ==================================================================
   Filter setzen (von Kennzahlen, Balken und Software-Ansicht aus)
   ================================================================== */

function filterZuruecksetzen() {
  zustand.suche = "";
  zustand.facetten = {};
  zustand.zeit = {};
  zustand.speicher = "";
  zustand.software = [];
  zustand.app = "";
}

function facetteSetzen(schluessel, wert) {
  zustand.facetten[schluessel] = [wert];
}

/* Wechselt in die Geräteliste und setzt genau den mitgegebenen Filter. */
function springeMitFilter(setzen) {
  filterZuruecksetzen();
  setzen();
  zustand.ansicht = "geraete";
  zustand.detail = null;
  neuBerechnen();
  zeichnen();
  hashSchreiben();
  window.scrollTo(0, 0);
}


/* ==================================================================
   5a. Ansicht: Übersicht
   ================================================================== */

function kennzahlKnopf(wert, text, aktion) {
  const k = el("button", "kennzahl");
  k.type = "button";
  anhaengen(k, [el("div", "kennzahl-wert", wert), el("div", "kennzahl-text", text)]);
  if (aktion) {
    k.addEventListener("click", aktion);
  } else {
    k.dataset.klickbar = "nein";
  }
  return k;
}

function zaehle(pruefung) {
  let n = 0;
  for (const z of alleZeilen) if (pruefung(z)) n++;
  return n;
}

function zeichneUebersicht() {
  const ziel = $("kennzahlen");
  leeren(ziel);

  const geraet = z => z.__art === "Gerät";
  const imSccm = z => geraet(z) && Hilfe.istJa(z.SCCM_Found);

  const letzterSync = alleZeilen.reduce(function (max, z) {
    const d = Hilfe.datum(z.SCCM_LastSync);
    return d && (!max || d > max) ? d : max;
  }, null);

  const kennzahlen = [
    [zaehle(geraet), "Geräte gesamt", () => springeMitFilter(() => facetteSetzen("__art", "Gerät"))],
    [zaehle(imSccm), "davon in SCCM", () => springeMitFilter(function () {
      facetteSetzen("__art", "Gerät"); facetteSetzen("SCCM_Found", "Ja");
    })],
    [zaehle(z => geraet(z) && Hilfe.istJa(z.SCCM_Online)), "gerade online",
      () => springeMitFilter(() => facetteSetzen("SCCM_Online", "Ja"))],
    [zaehle(z => geraet(z) && zeitPasst(z.SCCM_LastActive, "7")), "aktiv, letzte 7 Tage",
      () => springeMitFilter(function () { zustand.zeit.SCCM_LastActive = "7"; })],
    [zaehle(z => geraet(z) && zeitPasst(z.SCCM_LastActive, "30")), "aktiv, letzte 30 Tage",
      () => springeMitFilter(function () { zustand.zeit.SCCM_LastActive = "30"; })],
    [zaehle(z => geraet(z) && zeitPasst(z.SCCM_LastActive, "ae30")), "über 30 Tage still",
      () => springeMitFilter(function () { zustand.zeit.SCCM_LastActive = "ae30"; })],
    [zaehle(z => geraet(z) && zeitPasst(z.SCCM_LastActive, "ae90")), "über 90 Tage still",
      () => springeMitFilter(function () { zustand.zeit.SCCM_LastActive = "ae90"; })],
    [zaehle(z => geraet(z) && !Hilfe.istJa(z.SCCM_Found)), "ohne SCCM-Gerät",
      () => springeMitFilter(function () {
        facetteSetzen("__art", "Gerät"); facetteSetzen("SCCM_Found", "Nein");
      })],
    [zaehle(z => geraet(z) && speicherPasst(z.SCCM_DiskCFreeGB, "u20")), "C: unter 20 GB frei",
      () => springeMitFilter(function () { zustand.speicher = "u20"; })],
    [zaehle(z => z.__art === "Weiterer Benutzer"), "weitere Benutzer (geteilt)",
      () => springeMitFilter(() => facetteSetzen("__art", "Weiterer Benutzer"))],
    [zaehle(z => z.__art === "Kein PC"), "Zeilen «Kein PC»",
      () => springeMitFilter(() => facetteSetzen("__art", "Kein PC"))],
    [letzterSync ? Hilfe.datumText(letzterSync) : "—", "letzter SCCM-Abgleich", null]
  ];

  for (const [wert, text, aktion] of kennzahlen) {
    ziel.appendChild(kennzahlKnopf(wert, text, aktion));
  }

  zeichneVerteilungen();
}

/* Zählt die Werte einer Spalte und liefert die häufigsten zuerst. */
function verteilung(schluessel, nurGeraete) {
  const zaehler = new Map();
  for (const z of alleZeilen) {
    if (nurGeraete && z.__art !== "Gerät") continue;
    const w = facettenWert(z, schluessel);
    if (!w) continue;
    zaehler.set(w, (zaehler.get(w) || 0) + 1);
  }
  return Array.from(zaehler.entries())
    .sort((a, b) => b[1] - a[1] || Hilfe.vergleiche(a[0], b[0]));
}

function balkenBlock(titel, eintraege, beiKlick) {
  const block = el("div", "verteilung");
  block.appendChild(el("h2", null, titel));

  if (!eintraege.length) {
    block.appendChild(el("p", "hinweis", "Keine Werte vorhanden."));
    return block;
  }

  const groesste = eintraege[0][1];
  for (const [name, anzahl] of eintraege.slice(0, 10)) {
    const zeile = el("button", "balken-zeile");
    zeile.type = "button";

    const links = el("span");
    links.appendChild(el("span", "balken-name", name));
    const spur = el("span", "balken-spur");
    const fuell = el("span", "balken-fuell");
    fuell.style.width = Math.max(2, Math.round(anzahl / groesste * 100)) + "%";
    spur.appendChild(fuell);
    links.appendChild(spur);

    anhaengen(zeile, [links, el("span", "balken-wert", anzahl)]);
    zeile.addEventListener("click", function () { beiKlick(name); });
    block.appendChild(zeile);
  }

  if (eintraege.length > 10) {
    const rest = eintraege.slice(10).reduce((s, e) => s + e[1], 0);
    block.appendChild(el("p", "hinweis",
      "und " + (eintraege.length - 10) + " weitere Werte mit zusammen " + rest + " Zeilen"));
  }
  return block;
}

/* Eintragsliste aus einer Einteilung in Stufen. */
function stufenVerteilung(stufen) {
  const ergebnis = [];
  for (const stufe of stufen) {
    const n = zaehle(z => z.__art === "Gerät" && stufe.pruefung(z));
    if (n > 0) ergebnis.push([stufe.d, n, stufe.w]);
  }
  return ergebnis;
}

function zeichneVerteilungen() {
  const ziel = $("verteilungen");
  leeren(ziel);

  ziel.appendChild(balkenBlock("Nach Firma", verteilung("Firma", false),
    w => springeMitFilter(() => facetteSetzen("Firma", w))));

  ziel.appendChild(balkenBlock("Nach Modell", verteilung("SCCM_Model", true),
    w => springeMitFilter(() => facetteSetzen("SCCM_Model", w))));

  ziel.appendChild(balkenBlock("Nach OS-Version", verteilung("SCCM_OSVersion", true),
    w => springeMitFilter(() => facetteSetzen("SCCM_OSVersion", w))));

  ziel.appendChild(balkenBlock("Nach Gebäude / Stock", verteilung("GebaeudeStock", false),
    w => springeMitFilter(() => facetteSetzen("GebaeudeStock", w))));

  ziel.appendChild(balkenBlock("Nach Beschaffungsjahr", verteilung("__jahr", true),
    w => springeMitFilter(() => facetteSetzen("__jahr", w))));

  const defender = stufenVerteilung([
    { d: "Signatur höchstens 3 Tage alt", w: "7",    pruefung: z => zeitPasst(z.SCCM_EPSignatureDate, "7") },
    { d: "Signatur 8 bis 30 Tage alt",    w: "30",   pruefung: z => zeitPasst(z.SCCM_EPSignatureDate, "30") && !zeitPasst(z.SCCM_EPSignatureDate, "7") },
    { d: "Signatur älter als 30 Tage",    w: "ae30", pruefung: z => zeitPasst(z.SCCM_EPSignatureDate, "ae30") },
    { d: "kein Signaturdatum",            w: "leer", pruefung: z => zeitPasst(z.SCCM_EPSignatureDate, "leer") }
  ]);
  ziel.appendChild(balkenBlock("Defender-Signaturalter",
    defender.map(e => [e[0], e[1]]),
    function (name) {
      const treffer = defender.find(e => e[0] === name);
      springeMitFilter(function () {
        facetteSetzen("__art", "Gerät");
        zustand.zeit.SCCM_EPSignatureDate = treffer.w;
      });
    }));

  const speicher = stufenVerteilung([
    { d: "unter 20 GB frei",   w: "u20",  pruefung: z => speicherPasst(z.SCCM_DiskCFreeGB, "u20") },
    { d: "20 bis 50 GB frei",  w: "u50",  pruefung: z => speicherPasst(z.SCCM_DiskCFreeGB, "u50") && !speicherPasst(z.SCCM_DiskCFreeGB, "u20") },
    { d: "50 GB und mehr frei", w: "ab50", pruefung: z => speicherPasst(z.SCCM_DiskCFreeGB, "ab50") },
    { d: "kein Wert",          w: "leer", pruefung: z => z.SCCM_Found === "Ja" && speicherPasst(z.SCCM_DiskCFreeGB, "leer") }
  ]);
  ziel.appendChild(balkenBlock("Freier Speicher Laufwerk C:",
    speicher.map(e => [e[0], e[1]]),
    function (name) {
      const treffer = speicher.find(e => e[0] === name);
      springeMitFilter(function () {
        facetteSetzen("__art", "Gerät");
        zustand.speicher = treffer.w;
      });
    }));
}


/* ==================================================================
   5b. Ansicht: Geräte
   ================================================================== */

function beschriftung(schluessel) {
  if (schluessel === "__art") return "Art der Zeile";
  if (schluessel === "__jahr") return "Beschaffungsjahr";
  return SPALTE[schluessel] ? SPALTE[schluessel].d : schluessel;
}

/* Zellinhalt für die Tabelle, abhängig vom Spaltentyp. */
function zelle(zeile, schluessel) {
  const spalte = SPALTE[schluessel];
  const wert = zeile[schluessel];
  const td = el("td");

  if (schluessel === "Title") {
    const punkt = el("span", "punkt" + (Hilfe.istJa(zeile.SCCM_Online) ? "" : " punkt-aus"));
    punkt.title = Hilfe.istJa(zeile.SCCM_Online) ? "online" : "nicht online";
    td.appendChild(punkt);
    td.appendChild(document.createTextNode(String(wert || "")));
    return td;
  }
  if (!spalte) {
    td.textContent = wert === null || wert === undefined ? "" : String(wert);
    return td;
  }
  if (spalte.t === "Boolean") {
    td.appendChild(wert ? el("span", "ja", "✓") : el("span", "nein", "–"));
    return td;
  }
  if (spalte.t === "DateTime") {
    td.textContent = Hilfe.datumZeitText(wert);
    td.title = Hilfe.relativText(wert);
    return td;
  }
  if (spalte.t === "Number") {
    td.className = "zahl-zelle";
    td.textContent = Hilfe.zahlText(wert);
    return td;
  }
  if (spalte.t === "Note") {
    const z = Hilfe.zeilen(wert);
    td.textContent = z.length ? z[0] + (z.length > 1 ? "  (+" + (z.length - 1) + ")" : "") : "";
    return td;
  }
  const text = wert === null || wert === undefined ? "" : String(wert);
  if (text === "Ja") td.appendChild(el("span", "ja", "Ja"));
  else if (text === "Nein") td.appendChild(el("span", "nein", "Nein"));
  else td.textContent = text;
  return td;
}

function zeichneTabelle() {
  const kopf = $("tabellenkopf");
  const koerper = $("tabellenkoerper");
  leeren(kopf);
  leeren(koerper);

  const kopfZeile = el("tr");
  for (const schluessel of zustand.spalten) {
    const th = el("th");
    th.textContent = beschriftung(schluessel);
    if (zustand.sortSpalte === schluessel) {
      th.className = "sortiert";
      th.appendChild(el("span", "pfeil", zustand.sortAuf ? "↑" : "↓"));
    }
    th.addEventListener("click", function () {
      if (zustand.sortSpalte === schluessel) zustand.sortAuf = !zustand.sortAuf;
      else { zustand.sortSpalte = schluessel; zustand.sortAuf = true; }
      neuBerechnen();
      zeichneTabelle();
      hashSchreiben();
    });
    kopfZeile.appendChild(th);
  }
  kopf.appendChild(kopfZeile);

  for (const zeile of sichtbareZeilen) {
    const tr = el("tr");
    for (const schluessel of zustand.spalten) tr.appendChild(zelle(zeile, schluessel));
    tr.addEventListener("click", function () { detailOeffnen(zeile.id); });
    koerper.appendChild(tr);
  }

  $("tabelle-leer").hidden = sichtbareZeilen.length > 0;
  $("tabelle").hidden = sichtbareZeilen.length === 0;
  $("anzahl").textContent = sichtbareZeilen.length + " von " + alleZeilen.length + " Zeilen";
}

/* Die aktiven Filter als entfernbare Marken über der Tabelle. */
function zeichneChips() {
  const ziel = $("chips");
  leeren(ziel);
  let anzahl = 0;

  function chip(text, entfernen) {
    const c = el("button", "chip");
    c.type = "button";
    c.appendChild(document.createTextNode(text));
    c.appendChild(el("span", "x", "×"));
    c.title = "Filter entfernen";
    c.addEventListener("click", function () {
      entfernen();
      neuBerechnen();
      zeichnen();
      hashSchreiben();
    });
    ziel.appendChild(c);
    anzahl++;
  }

  if (zustand.suche) {
    chip("Suche: " + zustand.suche, function () {
      zustand.suche = "";
      $("suche").value = "";
    });
  }
  for (const k of Object.keys(zustand.facetten)) {
    const werte = zustand.facetten[k];
    if (!werte || !werte.length) continue;
    for (const w of werte) {
      chip(beschriftung(k) + ": " + (w || "(leer)"), function () {
        zustand.facetten[k] = zustand.facetten[k].filter(x => x !== w);
        if (!zustand.facetten[k].length) delete zustand.facetten[k];
      });
    }
  }
  for (const k of Object.keys(zustand.zeit)) {
    const w = zustand.zeit[k];
    if (!w) continue;
    const stufe = ZEITRAEUME.find(s => s.w === w);
    chip(beschriftung(k) + ": " + (stufe ? stufe.d : w), function () { delete zustand.zeit[k]; });
  }
  if (zustand.speicher) {
    const stufe = SPEICHERSTUFEN.find(s => s.w === zustand.speicher);
    chip("Freier Speicher C: " + (stufe ? stufe.d : zustand.speicher),
      function () { zustand.speicher = ""; });
  }
  for (const s of zustand.software) {
    chip("hat " + beschriftung(s), function () {
      zustand.software = zustand.software.filter(x => x !== s);
    });
  }
  if (zustand.app) {
    chip("SCCM-Applikation: " + zustand.app, function () { zustand.app = ""; });
  }

  if (anzahl > 1) {
    const alle = el("button", "chip chip-alle", "Alle Filter entfernen");
    alle.type = "button";
    alle.addEventListener("click", function () {
      filterZuruecksetzen();
      $("suche").value = "";
      neuBerechnen();
      zeichnen();
      hashSchreiben();
    });
    ziel.appendChild(alle);
  }
}

/* Filterleiste. Wird nur beim Öffnen neu aufgebaut, damit die Rollbalken in
   den Mehrfachauswahlen beim Tippen nicht springen. */
function zeichneFilterleiste() {
  const ziel = $("filterleiste");
  leeren(ziel);

  const gitter = el("div", "filtergitter");

  for (const facette of FACETTEN) {
    const werte = verteilung(facette.k, false);
    if (!werte.length) continue;

    const feld = el("div", "filterfeld");
    feld.appendChild(el("label", null, facette.d));

    const kasten = el("div", "mehrfach");
    const gewaehlt = zustand.facetten[facette.k] || [];

    for (const [wert, anzahl] of werte) {
      const label = el("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = gewaehlt.indexOf(wert) > -1;
      box.addEventListener("change", function () {
        const liste = (zustand.facetten[facette.k] || []).slice();
        const i = liste.indexOf(wert);
        if (box.checked && i === -1) liste.push(wert);
        if (!box.checked && i > -1) liste.splice(i, 1);
        if (liste.length) zustand.facetten[facette.k] = liste;
        else delete zustand.facetten[facette.k];
        neuBerechnen();
        zeichneChips();
        zeichneTabelle();
        hashSchreiben();
      });
      label.appendChild(box);
      label.appendChild(document.createTextNode(wert + " "));
      label.appendChild(el("span", "zahl", "(" + anzahl + ")"));
      kasten.appendChild(label);
    }
    feld.appendChild(kasten);
    gitter.appendChild(feld);
  }

  for (const zeitspalte of ZEITSPALTEN) {
    const feld = el("div", "filterfeld");
    feld.appendChild(el("label", null, zeitspalte.d));
    const auswahl = document.createElement("select");
    auswahl.appendChild(new Option("alle", ""));
    for (const s of ZEITRAEUME) auswahl.appendChild(new Option(s.d, s.w));
    auswahl.value = zustand.zeit[zeitspalte.k] || "";
    auswahl.addEventListener("change", function () {
      if (auswahl.value) zustand.zeit[zeitspalte.k] = auswahl.value;
      else delete zustand.zeit[zeitspalte.k];
      neuBerechnen();
      zeichneChips();
      zeichneTabelle();
      hashSchreiben();
    });
    feld.appendChild(auswahl);
    gitter.appendChild(feld);
  }

  const speicherFeld = el("div", "filterfeld");
  speicherFeld.appendChild(el("label", null, "Freier Speicher Laufwerk C:"));
  const speicherWahl = document.createElement("select");
  speicherWahl.appendChild(new Option("alle", ""));
  for (const s of SPEICHERSTUFEN) speicherWahl.appendChild(new Option(s.d, s.w));
  speicherWahl.value = zustand.speicher;
  speicherWahl.addEventListener("change", function () {
    zustand.speicher = speicherWahl.value;
    neuBerechnen();
    zeichneChips();
    zeichneTabelle();
    hashSchreiben();
  });
  speicherFeld.appendChild(speicherWahl);
  gitter.appendChild(speicherFeld);

  // Software und AD-Gruppen: Mehrfachauswahl mit eigener Suche.
  const swFeld = el("div", "filterfeld");
  swFeld.appendChild(el("label", null, "hat Software / AD-Gruppe"));
  const swSuche = document.createElement("input");
  swSuche.type = "search";
  swSuche.className = "filter-suche";
  swSuche.placeholder = "Software suchen …";
  swFeld.appendChild(swSuche);

  const swKasten = el("div", "mehrfach");
  function swZeichnen() {
    leeren(swKasten);
    const suche = swSuche.value.trim().toLowerCase();
    for (const spalte of SOFTWARE_SPALTEN) {
      if (suche && spalte.d.toLowerCase().indexOf(suche) === -1) continue;
      const anzahl = zaehle(z => hatSoftware(z, spalte.i));
      if (!anzahl && zustand.software.indexOf(spalte.i) === -1) continue;
      const label = el("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = zustand.software.indexOf(spalte.i) > -1;
      box.addEventListener("change", function () {
        if (box.checked) zustand.software.push(spalte.i);
        else zustand.software = zustand.software.filter(x => x !== spalte.i);
        neuBerechnen();
        zeichneChips();
        zeichneTabelle();
        hashSchreiben();
      });
      label.appendChild(box);
      label.appendChild(document.createTextNode(spalte.d + " "));
      label.appendChild(el("span", "zahl", "(" + anzahl + ")"));
      swKasten.appendChild(label);
    }
  }
  swSuche.addEventListener("input", swZeichnen);
  swZeichnen();
  swFeld.appendChild(swKasten);
  gitter.appendChild(swFeld);

  ziel.appendChild(gitter);
}

function zeichneSpaltenwahl() {
  const ziel = $("spaltenwahl");
  leeren(ziel);

  for (const gruppe of GRUPPEN) {
    const spalten = SPALTEN.filter(s => s.g === gruppe);
    if (!spalten.length) continue;

    const block = el("div", "spaltengruppe");
    block.appendChild(el("h3", null, gruppe));
    const liste = el("div", "liste");

    for (const spalte of spalten) {
      const label = el("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = zustand.spalten.indexOf(spalte.i) > -1;
      box.addEventListener("change", function () {
        if (box.checked) {
          if (zustand.spalten.indexOf(spalte.i) === -1) zustand.spalten.push(spalte.i);
        } else {
          zustand.spalten = zustand.spalten.filter(x => x !== spalte.i);
        }
        // Reihenfolge immer wie im Schema, damit die Tabelle ruhig bleibt.
        zustand.spalten.sort((a, b) =>
          SPALTEN.findIndex(s => s.i === a) - SPALTEN.findIndex(s => s.i === b));
        if (!zustand.spalten.length) zustand.spalten = ["Title"];
        spaltenMerken();
        zeichneTabelle();
      });
      label.appendChild(box);
      label.appendChild(document.createTextNode(spalte.d));
      liste.appendChild(label);
    }
    block.appendChild(liste);
    ziel.appendChild(block);
  }

  const werkzeuge = el("div", "werkzeugzeile");

  const standard = el("button", "knopf", "Standardspalten");
  standard.type = "button";
  standard.addEventListener("click", function () {
    zustand.spalten = STANDARD_SPALTEN.slice();
    spaltenMerken();
    zeichneSpaltenwahl();
    zeichneTabelle();
  });

  const wenig = el("button", "knopf", "Nur PC-Name und Person");
  wenig.type = "button";
  wenig.addEventListener("click", function () {
    zustand.spalten = ["Title", "Arbeitsplatz"];
    spaltenMerken();
    zeichneSpaltenwahl();
    zeichneTabelle();
  });

  anhaengen(werkzeuge, [standard, wenig]);
  ziel.appendChild(werkzeuge);
}

/* ---------- CSV-Ausgabe ---------- */

function csvWert(zeile, schluessel) {
  const spalte = SPALTE[schluessel];
  const wert = zeile[schluessel];
  if (!spalte) return wert === null || wert === undefined ? "" : String(wert);
  if (spalte.t === "Boolean") return wert ? "Ja" : "Nein";
  if (spalte.t === "DateTime") return Hilfe.datumZeitText(wert);
  if (spalte.t === "Note") return Hilfe.zeilen(wert).join(" / ");
  return wert === null || wert === undefined ? "" : String(wert);
}

function csvExport() {
  const trenner = ";";
  const zeilen = [];

  function feld(text) {
    const t = String(text === null || text === undefined ? "" : text);
    return '"' + t.replace(/"/g, '""') + '"';
  }

  zeilen.push(zustand.spalten.map(k => feld(beschriftung(k))).join(trenner));
  for (const z of sichtbareZeilen) {
    zeilen.push(zustand.spalten.map(k => feld(csvWert(z, k))).join(trenner));
  }

  // Byte Order Mark, damit Excel unter Windows die Umlaute richtig liest.
  const inhalt = "﻿" + zeilen.join("\r\n") + "\r\n";
  const blob = new Blob([inhalt], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const heute = new Date();
  const name = "Computer_Inventar_" + heute.getFullYear()
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


/* ==================================================================
   5c. Ansicht: Software
   ================================================================== */

function swZeile(name, anzahl, zusatz, beiKlick) {
  const zeile = el("button", "sw-zeile");
  zeile.type = "button";
  anhaengen(zeile, [
    el("span", null, name),
    el("span", "zusatz", zusatz || ""),
    el("span", "zusatz", anzahl)
  ]);
  zeile.addEventListener("click", beiKlick);
  return zeile;
}

function zeichneSoftware() {
  /* Links: Ja/Nein-Spalten und AD-Gruppen aus dem Inventar. */
  const links = $("software-inventar");
  leeren(links);

  const kopf = el("div", "sw-kopf");
  anhaengen(kopf, [el("span", null, "Software / Recht"), el("span", null, "Quelle"),
                   el("span", null, "Zeilen")]);
  links.appendChild(kopf);

  for (const gruppe of GRUPPEN) {
    const spalten = SOFTWARE_SPALTEN.filter(s => s.g === gruppe);
    if (!spalten.length) continue;

    const gezaehlt = spalten
      .map(s => ({ s: s, n: zaehle(z => hatSoftware(z, s.i)) }))
      .filter(e => e.n > 0)
      .sort((a, b) => b.n - a.n || Hilfe.vergleiche(a.s.d, b.s.d));
    if (!gezaehlt.length) continue;

    links.appendChild(el("div", "sw-gruppe", gruppe));
    for (const e of gezaehlt) {
      links.appendChild(swZeile(e.s.d, e.n,
        e.s.g === AD_GRUPPE ? "AD-Gruppe" : "Ja/Nein",
        function () {
          springeMitFilter(function () { zustand.software = [e.s.i]; });
        }));
    }
  }
  if (!links.querySelector(".sw-zeile")) {
    links.appendChild(el("p", "leer", "Keine Software-Häkchen gesetzt."));
  }

  /* Rechts: aus SCCM_DeployedApps zusammengezählt. */
  const rechts = $("software-sccm");
  leeren(rechts);

  const zaehler = new Map();
  for (const z of alleZeilen) {
    const gesehen = new Set();
    for (const zeile of Hilfe.zeilen(z.SCCM_DeployedApps)) {
      const teile = Hilfe.felder(zeile);
      const app = teile[0];
      if (!app || gesehen.has(app)) continue;
      gesehen.add(app);
      const status = (teile[3] || "").toLowerCase();
      const e = zaehler.get(app) || { geraete: 0, ok: 0, fehler: 0 };
      e.geraete++;
      if (status.indexOf("erfolg") > -1 || status.indexOf("installiert") > -1) e.ok++;
      else if (status.indexOf("fehl") > -1 || status.indexOf("error") > -1) e.fehler++;
      zaehler.set(app, e);
    }
  }

  const sortiert = Array.from(zaehler.entries())
    .sort((a, b) => b[1].geraete - a[1].geraete || Hilfe.vergleiche(a[0], b[0]));

  if (!sortiert.length) {
    rechts.appendChild(el("p", "leer",
      "In der Spalte «Zugewiesene Applikationen» stehen keine Daten."));
    return;
  }

  const kopf2 = el("div", "sw-kopf");
  anhaengen(kopf2, [el("span", null, "SCCM-Applikation"),
                    el("span", null, "OK / Fehler"), el("span", null, "Geräte")]);
  rechts.appendChild(kopf2);

  for (const [app, e] of sortiert) {
    rechts.appendChild(swZeile(app, e.geraete, e.ok + " / " + e.fehler, function () {
      springeMitFilter(function () { zustand.app = app; });
    }));
  }
}


/* ==================================================================
   6. Detailpanel
   ================================================================== */

function feldZeile(name, wertKnoten) {
  const zeile = el("div", "feldzeile");
  anhaengen(zeile, [el("div", "feldname", name), wertKnoten]);
  return zeile;
}

function noteKnoten(schluessel, wert) {
  const zeilen = Hilfe.zeilen(wert);
  const kopf = NOTE_TABELLEN[schluessel];

  if (kopf && zeilen.some(z => z.indexOf("|") > -1)) {
    const tabelle = el("table", "mini-tabelle");
    const kopfZeile = el("tr");
    for (const t of kopf) kopfZeile.appendChild(el("th", null, t));
    const thead = el("thead");
    thead.appendChild(kopfZeile);
    tabelle.appendChild(thead);

    const tbody = el("tbody");
    for (const z of zeilen) {
      const tr = el("tr");
      const felder = Hilfe.felder(z);
      for (let i = 0; i < kopf.length; i++) tr.appendChild(el("td", null, felder[i] || ""));
      tbody.appendChild(tr);
    }
    tabelle.appendChild(tbody);
    const huelle = el("div", "feldwert");
    huelle.appendChild(tabelle);
    return huelle;
  }

  if (zeilen.length > 1) {
    const liste = el("ul", "detail-liste");
    for (const z of zeilen) liste.appendChild(el("li", null, z.replace(/\s*\|\s*/g, "  ·  ")));
    const huelle = el("div", "feldwert");
    huelle.appendChild(liste);
    return huelle;
  }
  return el("div", "feldwert", zeilen[0] || "");
}

function wertKnoten(zeile, spalte) {
  const wert = zeile[spalte.i];

  if (spalte.t === "Boolean") return el("div", "feldwert ja", "✓ Ja");
  if (spalte.t === "Note") return noteKnoten(spalte.i, wert);
  if (spalte.t === "DateTime") {
    const k = el("div", "feldwert", Hilfe.datumZeitText(wert));
    k.appendChild(el("span", "relativ", Hilfe.relativText(wert)));
    return k;
  }
  if (spalte.t === "Number") return el("div", "feldwert", Hilfe.zahlText(wert));

  const text = String(wert);
  if (text === "Ja") return el("div", "feldwert ja", "Ja");
  if (text === "Nein") return el("div", "feldwert nein", "Nein");
  return el("div", "feldwert", text);
}

function detailOeffnen(id) {
  const zeile = alleZeilen.find(z => String(z.id) === String(id));
  if (!zeile) return;

  zustand.detail = String(id);
  hashSchreiben();

  $("detail-titel").textContent = zeile.Title || "(ohne Namen)";
  const unterteile = [];
  if (zeile.Arbeitsplatz) unterteile.push(zeile.Arbeitsplatz);
  if (zeile.Firma) unterteile.push(zeile.Firma);
  if (zeile.__art !== "Gerät") unterteile.push(zeile.__art);
  $("detail-unter").textContent = unterteile.join("  ·  ");

  const inhalt = $("detail-inhalt");
  leeren(inhalt);

  // Geteilte Geräte: alle Benutzerzeilen desselben Geräts anzeigen.
  if (zeile.__geraet) {
    const verwandte = alleZeilen.filter(z => z.__geraet === zeile.__geraet);
    if (verwandte.length > 1) {
      const kasten = el("div", "geteilt-hinweis");
      kasten.appendChild(el("div", null,
        "Geteiltes Gerät: " + verwandte.length + " Benutzerzeilen zu " + zeile.__geraet));
      const liste = el("ul", "detail-liste");
      for (const v of verwandte) {
        const li = el("li");
        const knopf = el("button", "knopf knopf-still",
          (v.Arbeitsplatz || "(ohne Person)") + (v.id === zeile.id ? "  (angezeigt)" : ""));
        knopf.type = "button";
        knopf.addEventListener("click", function () { detailOeffnen(v.id); });
        li.appendChild(knopf);
        liste.appendChild(li);
      }
      kasten.appendChild(liste);
      inhalt.appendChild(kasten);
    }
  }

  for (const gruppe of GRUPPEN) {
    const spalten = SPALTEN.filter(function (s) {
      if (s.g !== gruppe) return false;
      const w = zeile[s.i];
      if (s.t === "Boolean") return w === true;
      return w !== null && w !== undefined && String(w).trim() !== "";
    });
    if (!spalten.length) continue;

    const block = el("div", "detail-gruppe");
    block.appendChild(el("h3", null, gruppe));
    for (const s of spalten) block.appendChild(feldZeile(s.d, wertKnoten(zeile, s)));
    inhalt.appendChild(block);
  }

  const verweise = el("div", "detail-verweise");
  const link = el("a", null, "In SharePoint öffnen");
  link.href = KONFIG.sharepointElementUrl(zeile.id);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  verweise.appendChild(link);
  inhalt.appendChild(verweise);

  $("detail").hidden = false;
  $("detail-hintergrund").hidden = false;
  inhalt.scrollTop = 0;
}

function detailSchliessen() {
  $("detail").hidden = true;
  $("detail-hintergrund").hidden = true;
  zustand.detail = null;
  hashSchreiben();
}


/* ==================================================================
   Zeichnen der gewählten Ansicht
   ================================================================== */

function zeichnen() {
  for (const a of ANSICHTEN) $("ansicht-" + a).hidden = a !== zustand.ansicht;
  for (const knopf of document.querySelectorAll(".reiter-knopf")) {
    knopf.classList.toggle("aktiv", knopf.dataset.ansicht === zustand.ansicht);
  }

  if (zustand.ansicht === "uebersicht") zeichneUebersicht();
  if (zustand.ansicht === "geraete") {
    $("suche").value = zustand.suche;
    zeichneChips();
    zeichneTabelle();
    if (!$("filterleiste").hidden) zeichneFilterleiste();
    if (!$("spaltenwahl").hidden) zeichneSpaltenwahl();
  }
  if (zustand.ansicht === "software") zeichneSoftware();

  if (zustand.detail) detailOeffnen(zustand.detail);
  else detailSchliessen();
}


/* ==================================================================
   7. Start
   ================================================================== */

function zeigeLaden(text) {
  $("meldung-laden").hidden = false;
  $("meldung-laden-text").textContent = text;
  $("meldung-fehler").hidden = true;
  $("reiter").hidden = true;
  for (const a of ANSICHTEN) $("ansicht-" + a).hidden = true;
}

function zeigeFehler(titel, text, hinweis) {
  $("meldung-laden").hidden = true;
  $("meldung-fehler").hidden = false;
  $("fehler-titel").textContent = titel;
  $("fehler-text").textContent = text;
  $("fehler-hinweis").textContent = hinweis || "";
  $("reiter").hidden = true;
  for (const a of ANSICHTEN) $("ansicht-" + a).hidden = true;
}

function zeigeInhalt() {
  $("meldung-laden").hidden = true;
  $("meldung-fehler").hidden = true;
  $("reiter").hidden = false;
}

function standAnzeigen() {
  const letzterSync = alleZeilen.reduce(function (max, z) {
    const d = Hilfe.datum(z.SCCM_LastSync);
    return d && (!max || d > max) ? d : max;
  }, null);
  $("stand").textContent = letzterSync
    ? "Daten Stand: " + Hilfe.datumZeitText(letzterSync) + " (" + Hilfe.relativText(letzterSync) + ")"
    : "Daten Stand: unbekannt";
}

function mockBandZeigen() {
  const band = el("div", "mock-band",
    "Vorführmodus (?mock=1): alle Personen, Geräte und Zahlen auf dieser Seite "
    + "sind erfunden. Es besteht keine Verbindung zu SharePoint.");
  document.querySelector("header").insertAdjacentElement("afterend", band);
}

async function datenLaden() {
  if (mockModus) {
    alleZeilen = anreichern(Mock.zeilen());
    return;
  }
  zeigeLaden("Daten werden aus SharePoint geladen …");
  const roh = await Daten.alleZeilen(function (n) {
    $("meldung-laden-text").textContent = "Daten werden aus SharePoint geladen … (" + n + " Zeilen)";
  });
  alleZeilen = anreichern(roh);
}

async function start() {
  spaltenLaden();
  hashLesen();

  try {
    if (mockModus) {
      mockBandZeigen();
      $("benutzer").textContent = "Vorführmodus";
    } else {
      zeigeLaden("Anmeldung wird geprüft …");
      const konto = await Auth.anmeldungSicherstellen();
      $("benutzer").textContent = konto ? (konto.name || konto.adresse) : "";
      $("knopf-abmelden").hidden = false;
    }

    await datenLaden();
    standAnzeigen();
    neuBerechnen();
    zeigeInhalt();
    zeichnen();

  } catch (fehler) {
    const meldung = fehler && fehler.message ? fehler.message : String(fehler);
    zeigeFehler("Die Daten konnten nicht geladen werden", meldung,
      mockModus ? "" : "Zum Anschauen ohne Anmeldung die Seite mit ?mock=1 aufrufen.");
  }
}

/* ---------- Ereignisse ---------- */

function ereignisseVerbinden() {
  for (const knopf of document.querySelectorAll(".reiter-knopf")) {
    knopf.addEventListener("click", function () {
      zustand.ansicht = knopf.dataset.ansicht;
      zustand.detail = null;
      zeichnen();
      hashSchreiben();
    });
  }

  let sucheZeitgeber = null;
  $("suche").addEventListener("input", function () {
    clearTimeout(sucheZeitgeber);
    sucheZeitgeber = setTimeout(function () {
      zustand.suche = $("suche").value;
      neuBerechnen();
      zeichneChips();
      zeichneTabelle();
      hashSchreiben();
    }, 150);
  });

  $("knopf-filter").addEventListener("click", function () {
    const leiste = $("filterleiste");
    leiste.hidden = !leiste.hidden;
    if (!leiste.hidden) zeichneFilterleiste();
  });

  $("knopf-spalten").addEventListener("click", function () {
    const wahl = $("spaltenwahl");
    wahl.hidden = !wahl.hidden;
    if (!wahl.hidden) zeichneSpaltenwahl();
  });

  $("knopf-csv").addEventListener("click", csvExport);

  $("knopf-neuladen").addEventListener("click", async function () {
    try {
      zeigeLaden("Daten werden neu geladen …");
      await datenLaden();
      standAnzeigen();
      neuBerechnen();
      zeigeInhalt();
      zeichnen();
    } catch (fehler) {
      zeigeFehler("Die Daten konnten nicht neu geladen werden",
        fehler && fehler.message ? fehler.message : String(fehler), "");
    }
  });

  $("knopf-abmelden").addEventListener("click", function () { Auth.abmelden(); });

  $("knopf-nochmal").addEventListener("click", function () { location.reload(); });

  $("knopf-detail-zu").addEventListener("click", detailSchliessen);
  $("detail-hintergrund").addEventListener("click", detailSchliessen);

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !$("detail").hidden) detailSchliessen();
  });

  window.addEventListener("hashchange", function () {
    // Eigene Änderung: der Zustand stimmt bereits, nichts neu zeichnen.
    if (location.hash === eigenerHash) { eigenerHash = null; return; }
    eigenerHash = null;
    hashLesen();
    if (!alleZeilen.length) return;
    neuBerechnen();
    zeichnen();
  });
}

ereignisseVerbinden();
start();

})();

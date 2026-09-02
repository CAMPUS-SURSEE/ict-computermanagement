/* geraet.js — Gerätefenster des Computer Inventars.

   Wird von der Hauptseite mit window.open("geraet.html?id=…") geöffnet und
   zeigt ein einzelnes Gerät als Dashboard: Kennzahlen, Auffälligkeiten,
   Stammdaten, Software und Rechte, Hardware, System, Sicherheit, Aktivität,
   Flottenvergleich und alle Rohdaten.

   Bearbeitbar sind genau die von Hand gepflegten Spalten (Quelle «excel» in
   spalten.js). Die SCCM-Spalten sind schreibgeschützt: der Abgleich
   überschreibt sie ohnehin bei jedem Lauf.

   Aufbau:
     1. Parameter und Spaltenwissen
     2. Kleine DOM-Helfer
     3. Zustand, Entwurf und Speicherleiste
     4. Bausteine (Karten, Kacheln, Feldzeilen, Tabellen, Balken)
     5. Auswertung (Auffälligkeiten, Gesundheits-Score, Flottenvergleich)
     6. Die neun Bereiche
     7. Kopfzeile und Aktionen
     8. Laden, Speichern, Anlegen, Löschen
     9. Start und Tastatur

   Grundsätze wie auf der Hauptseite: kein Framework, keine globalen
   Variablen ausser den Modulen der anderen Dateien, und niemals innerHTML
   mit Daten aus SharePoint — jeder Wert geht über textContent in die Seite. */

"use strict";

(function () {

/* ==================================================================
   1. Parameter und Spaltenwissen
   ================================================================== */

const ABFRAGE = new URLSearchParams(location.search);
const mockModus = ABFRAGE.get("mock") === "1";
const vorlageId = ABFRAGE.get("vorlage");

let elementId = ABFRAGE.get("id");
let neuModus = ABFRAGE.get("neu") === "1";

/* Eine Quelle mit gleicher Signatur, egal ob Graph oder Vorführdaten. */
const Quelle = Daten.quelle(mockModus);

const SPALTE = {};
for (const s of SPALTEN) SPALTE[s.i] = s;

const GRUPPEN = [];
for (const s of SPALTEN) if (GRUPPEN.indexOf(s.g) === -1) GRUPPEN.push(s.g);

/* Gruppen, deren Ja/Nein-Spalten echte Software oder Rechte sind. */
const SW_GRUPPEN = ["Standard-Software und Rechte", "ABACUS", "Zusatz-Software",
                    "Technik-Software", "Bpanda"];
const AD_GRUPPE = "Spezial-Software (AD-Gruppe)";

const SOFTWARE_SPALTEN = SPALTEN.filter(s =>
  (s.t === "Boolean" && SW_GRUPPEN.indexOf(s.g) > -1) || s.g === AD_GRUPPE);

const JAHR_SPALTEN = SPALTEN.filter(s =>
  s.g === "Stammdaten" && s.t === "Boolean" && /^J\d{8}$/.test(s.i));

/* Stammdaten ohne die Jahres-Häkchen: die bekommen eigene Chips. */
const STAMM_SPALTEN = SPALTEN.filter(s => s.g === "Stammdaten" && s.t !== "Boolean");
const BUDGET_SPALTEN = SPALTEN.filter(s => s.g === "Budget");

/* Spalten, die dieses Fenster schreiben darf. */
function istBearbeitbar(spalte) {
  return !!spalte && spalte.q === "excel";
}

/* Beim Duplizieren nicht übernehmen: alles, was ein Gerät eindeutig macht. */
const NICHT_DUPLIZIEREN = ["Title", "Seriennummer", "Login", "Arbeitsplatz", "TestuserSCCM"];


/* ==================================================================
   2. Kleine DOM-Helfer
   ================================================================== */

function $(id) { return document.getElementById(id); }

function el(tag, klasse, text) {
  const k = document.createElement(tag);
  if (klasse) k.className = klasse;
  if (text !== undefined && text !== null) k.textContent = String(text);
  return k;
}

function anhaengen(eltern, kinder) {
  for (const k of kinder) if (k) eltern.appendChild(k);
  return eltern;
}

function leeren(knoten) {
  while (knoten.firstChild) knoten.removeChild(knoten.firstChild);
  return knoten;
}

/* Symbole als inline-SVG, damit keine Schriftart und kein CDN nötig ist. */
function symbol(pfadDaten, groesse) {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  const g = groesse || 14;
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(g));
  svg.setAttribute("height", String(g));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const pfad = document.createElementNS(NS, "path");
  pfad.setAttribute("d", pfadDaten);
  svg.appendChild(pfad);
  return svg;
}

const SYMBOL_SCHLOSS = "M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z";

function knopf(beschriftung, klasse, beiKlick) {
  const k = el("button", "knopf" + (klasse ? " " + klasse : ""), beschriftung);
  k.type = "button";
  if (beiKlick) k.addEventListener("click", beiKlick);
  return k;
}


/* ==================================================================
   3. Zustand, Entwurf und Speicherleiste
   ================================================================== */

let alleZeilen = [];      // die ganze Liste, für Flottenvergleich und Geschwister
let zeile = null;         // die Zeile dieses Fensters (angereichert)
let entwurf = {};         // geänderte, noch nicht gespeicherte Felder
let bearbeiten = false;   // Bearbeitungsmodus
let speichertGerade = false;
let speicherFehler = "";
let geloescht = false;

/* Zustände der Suchfelder innerhalb der Bereiche. */
let swSuche = "";
let swNurGesetzte = false;
let swInstalliertSuche = "";
let rohSuche = "";
let rohLeereZeigen = false;

let aktiverBereich = "uebersicht";

const BEREICHE = [
  { k: "uebersicht",  d: "Übersicht",        f: bereichUebersicht,  immer: false },
  { k: "stammdaten",  d: "Stammdaten",       f: bereichStammdaten,  immer: true  },
  { k: "software",    d: "Software & Rechte", f: bereichSoftware,   immer: true  },
  { k: "hardware",    d: "Hardware",         f: bereichHardware,    immer: false },
  { k: "system",      d: "System & Netzwerk", f: bereichSystem,     immer: false },
  { k: "sicherheit",  d: "Sicherheit",       f: bereichSicherheit,  immer: false },
  { k: "aktivitaet",  d: "SCCM & Aktivität", f: bereichAktivitaet,  immer: false },
  { k: "analyse",     d: "Analyse",          f: bereichAnalyse,     immer: false },
  { k: "felder",      d: "Alle Felder",      f: bereichFelder,      immer: true  }
];

function sichtbareBereiche() {
  // Solange die Zeile neu ist, gibt es weder SCCM-Daten noch Vergleichbares.
  return neuModus ? BEREICHE.filter(b => b.immer) : BEREICHE;
}

/* ---------- Werte lesen und schreiben ---------- */

/* Der aktuell anzuzeigende Wert: Entwurf schlägt gespeicherten Wert. */
function wert(feld) {
  if (Object.prototype.hasOwnProperty.call(entwurf, feld)) return entwurf[feld];
  return zeile ? zeile[feld] : "";
}

function textWert(feld) {
  const w = wert(feld);
  return (w === null || w === undefined || w === false) ? "" : String(w);
}

function jaWert(feld) {
  return Hilfe.istJa(wert(feld));
}

/* Vergleich auf «gleich wie gespeichert», damit ein Hin und Her wieder als
   unverändert gilt. */
function gleichwertig(a, b) {
  const nA = (a === null || a === undefined) ? "" : a;
  const nB = (b === null || b === undefined) ? "" : b;
  if (typeof nA === "boolean" || typeof nB === "boolean") return !!nA === !!nB;
  return String(nA) === String(nB);
}

function setzeWert(feld, neuerWert) {
  const alt = zeile ? zeile[feld] : "";
  if (gleichwertig(alt, neuerWert)) delete entwurf[feld];
  else entwurf[feld] = neuerWert;
  speicherFehler = "";
  speicherleisteZeichnen();
}

function anzahlAenderungen() {
  return Object.keys(entwurf).length;
}

function istGeaendert(feld) {
  return Object.prototype.hasOwnProperty.call(entwurf, feld);
}

/* ---------- Speicherleiste ---------- */

function speicherleisteZeichnen() {
  const leiste = $("g-speicherleiste");
  const anzahl = anzahlAenderungen();
  const zeigen = neuModus || anzahl > 0 || speichertGerade;
  leiste.hidden = !zeigen;
  if (!zeigen) return;

  const text = neuModus
    ? (anzahl === 0 ? "Neues Gerät — noch nicht angelegt"
                    : anzahl + (anzahl === 1 ? " Angabe" : " Angaben") + " erfasst")
    : (anzahl === 1 ? "1 Änderung" : anzahl + " Änderungen");
  $("g-speicher-text").textContent = speichertGerade ? "Wird gespeichert …" : text;

  const fehlerFeld = $("g-speicher-fehler");
  fehlerFeld.textContent = speicherFehler;
  fehlerFeld.hidden = !speicherFehler;

  const speichern = $("g-knopf-speichern");
  speichern.textContent = speicherFehler ? "Nochmals speichern"
    : (neuModus ? "Anlegen" : "Speichern");
  speichern.disabled = speichertGerade || (!neuModus && anzahl === 0);

  const verwerfen = $("g-knopf-verwerfen");
  verwerfen.textContent = neuModus ? "Formular leeren" : "Verwerfen";
  verwerfen.disabled = speichertGerade || anzahl === 0;
}

/* ---------- Toast ---------- */

let toastZeit = null;

function toast(text, istFehler) {
  const t = $("g-toast");
  t.textContent = text;
  t.className = "g-toast" + (istFehler ? " g-toast-fehler" : "");
  t.hidden = false;
  if (toastZeit) clearTimeout(toastZeit);
  toastZeit = setTimeout(function () { t.hidden = true; }, istFehler ? 8000 : 3500);
}

/* ---------- Meldung an die Hauptseite ---------- */

function melden(typ, id) {
  try {
    const kanal = new BroadcastChannel("computerinventar");
    kanal.postMessage({ typ: typ, id: id === undefined ? null : String(id) });
    kanal.close();
  } catch (e) {
    // Ältere Browser kennen BroadcastChannel nicht. Dann bleibt die
    // Hauptseite bis zum nächsten «Neu laden» auf dem alten Stand.
  }
}


/* ==================================================================
   4. Bausteine
   ================================================================== */

function karte(titel, hinweis, breit) {
  const k = el("section", "g-karte" + (breit ? " g-breit" : ""));
  if (titel) {
    const kopf = el("div", "g-karte-kopf");
    kopf.appendChild(el("h2", null, titel));
    k.appendChild(kopf);
    k.kopf = kopf;
  }
  if (hinweis) k.appendChild(el("p", "g-karte-hinweis", hinweis));
  return k;
}

function kartenGitter() {
  return el("div", "g-karten");
}

function kachel(titel, wertText, neben, ampel) {
  const k = el("div", "g-kachel" + (ampel ? " g-ampel-" + ampel : ""));
  k.appendChild(el("div", "g-kachel-titel", titel));
  k.appendChild(el("div", "g-kachel-wert", wertText === "" || wertText === null
    || wertText === undefined ? "—" : wertText));
  if (neben) k.appendChild(el("div", "g-kachel-neben", neben));
  return k;
}

function balken(anteil, farbe) {
  const spur = el("div", "g-spur");
  const fuell = el("span", "g-fuell" + (farbe ? " g-fuell-" + farbe : ""));
  const wertProzent = Math.max(0, Math.min(100, Number(anteil) || 0));
  fuell.style.width = wertProzent + "%";
  spur.appendChild(fuell);
  return spur;
}

/* Eine Feldzeile im Lesemodus. «neben» steht klein und grau daneben. */
function feldZeile(name, wertText, neben, geschuetzt) {
  const z = el("div", "g-feld");
  const n = el("div", "g-feld-name", name);
  if (geschuetzt) {
    const s = symbol(SYMBOL_SCHLOSS, 11);
    s.classList.add("g-schloss");
    const huelle = el("span", "g-schloss");
    huelle.title = "Aus SCCM, wird beim Abgleich überschrieben";
    huelle.appendChild(s);
    n.appendChild(huelle);
  }
  const w = el("div", "g-feld-wert");
  if (wertText === "" || wertText === null || wertText === undefined) {
    w.appendChild(el("span", "g-leerwert", "—"));
  } else {
    w.appendChild(document.createTextNode(String(wertText)));
  }
  if (neben) w.appendChild(el("span", "g-neben", neben));
  z.appendChild(n);
  z.appendChild(w);
  return z;
}

/* Eine Feldzeile mit beliebigem Knoten als Wert. */
function feldZeileKnoten(name, wertKnoten, geschuetzt) {
  const z = feldZeile(name, "", null, geschuetzt);
  const w = z.lastChild;
  leeren(w);
  w.appendChild(wertKnoten);
  return z;
}

/* Datum: absolut, dazu relativ in Klammern. */
function datumZeile(name, rohwert) {
  const d = Hilfe.datum(rohwert);
  if (!d) return feldZeile(name, "", null, true);
  return feldZeile(name, Hilfe.datumZeitText(rohwert), Hilfe.relativText(rohwert), true);
}

/* Eine Spalte im Lesemodus, mit passender Formatierung nach Typ. */
function spaltenZeile(spalte) {
  const roh = wert(spalte.i);
  const geschuetzt = !istBearbeitbar(spalte);
  if (spalte.t === "DateTime") return datumZeile(spalte.d, roh);
  if (spalte.t === "Boolean") return feldZeile(spalte.d, Hilfe.istJa(roh) ? "Ja" : "Nein", null, geschuetzt);
  if (spalte.t === "Number") return feldZeile(spalte.d, roh === "" || roh === null
    || roh === undefined ? "" : Hilfe.zahlText(roh), null, geschuetzt);
  return feldZeile(spalte.d, roh, null, geschuetzt);
}

function tabelle(kopfzeilen, datenzeilen, rechtsAb) {
  const rahmen = el("div", "g-tabelle-rahmen");
  const t = el("table", "g-tabelle");
  const thead = el("thead");
  const kopf = el("tr");
  kopfzeilen.forEach(function (h, i) {
    const th = el("th", (rechtsAb !== undefined && i >= rechtsAb) ? "g-rechts" : null, h);
    kopf.appendChild(th);
  });
  thead.appendChild(kopf);
  t.appendChild(thead);

  const koerper = el("tbody");
  for (const z of datenzeilen) {
    const tr = el("tr");
    z.forEach(function (feldwert, i) {
      const td = el("td", (rechtsAb !== undefined && i >= rechtsAb) ? "g-rechts" : null);
      if (feldwert && feldwert.nodeType) td.appendChild(feldwert);
      else td.textContent = (feldwert === null || feldwert === undefined) ? "" : String(feldwert);
      tr.appendChild(td);
    });
    koerper.appendChild(tr);
  }
  t.appendChild(koerper);
  rahmen.appendChild(t);
  return rahmen;
}

function badge(text, farbe) {
  return el("span", "g-badge" + (farbe ? " g-badge-" + farbe : ""), text);
}

function leerHinweis(text) {
  return el("p", "g-leer", text);
}

/* ---------- Steuerelemente für den Bearbeitungsmodus ---------- */

const datenlistenGebaut = {};

/* Baut bei Bedarf eine <datalist> mit allen bereits vorkommenden Werten
   dieser Spalte und gibt deren id zurück. */
function datenliste(spalte, zusatz) {
  const id = "g-dl-" + spalte.i;
  if (datenlistenGebaut[id]) return id;

  const werte = [];
  for (const z of alleZeilen) {
    const w = z[spalte.i];
    if (w === null || w === undefined || w === "" || w === true || w === false) continue;
    const t = String(w).trim();
    if (t && werte.indexOf(t) === -1) werte.push(t);
  }
  for (const t of (zusatz || [])) if (t && werte.indexOf(t) === -1) werte.push(t);
  werte.sort(Hilfe.vergleiche);

  const liste = el("datalist");
  liste.id = id;
  for (const t of werte) {
    const o = el("option");
    o.value = t;
    liste.appendChild(o);
  }
  $("g-datenlisten").appendChild(liste);
  datenlistenGebaut[id] = true;
  return id;
}

/* Ein Eingabefeld oder eine Textarea für eine bearbeitbare Spalte. */
function eingabeFuer(spalte) {
  const istNote = spalte.t === "Note";
  const feld = el(istNote ? "textarea" : "input", istNote ? "g-textarea" : "g-eingabe");
  if (!istNote) feld.type = spalte.t === "Number" ? "number" : "text";
  feld.value = textWert(spalte.i);
  feld.id = "g-eingabe-" + spalte.i;
  feld.setAttribute("aria-label", spalte.d);

  // Vorschläge: bestehende Werte der Spalte, bei AD-Gruppen zusätzlich «Ja».
  if (!istNote && spalte.t !== "Number") {
    const zusatz = spalte.g === AD_GRUPPE ? ["Ja"] : [];
    const listeId = datenliste(spalte, zusatz);
    feld.setAttribute("list", listeId);
  }

  feld.addEventListener("input", function () {
    feld.classList.remove("g-ungueltig");
    const roh = feld.value;
    setzeWert(spalte.i, spalte.t === "Number"
      ? (roh === "" ? null : Number(roh))
      : roh);
    zeileMarkieren(feld, spalte.i);
    if (spalte.i === "Title") titelZeichnen();
  });
  return feld;
}

/* Markiert die umgebende Feldzeile als geändert. */
function zeileMarkieren(knoten, feldName) {
  const z = knoten.closest ? knoten.closest(".g-feld") : null;
  if (z) z.classList.toggle("g-geaendert", istGeaendert(feldName));
}

/* Ein Schalter für eine Ja/Nein-Spalte. */
function schalterFuer(spalte, beschriftung) {
  const label = el("label", "g-schalter");
  const eingabe = el("input");
  eingabe.type = "checkbox";
  eingabe.checked = jaWert(spalte.i);
  eingabe.disabled = !bearbeiten || !istBearbeitbar(spalte);
  const spur = el("span", "g-schalter-spur");
  const text = el("span", "g-schalter-text", beschriftung === undefined ? spalte.d : beschriftung);
  eingabe.addEventListener("change", function () {
    setzeWert(spalte.i, eingabe.checked);
    label.classList.toggle("g-geaendert", istGeaendert(spalte.i));
    zeileMarkieren(label, spalte.i);
  });
  label.appendChild(eingabe);
  label.appendChild(spur);
  label.appendChild(text);
  return label;
}

/* Eine Zeile im Formular: im Lesemodus Text, im Bearbeitungsmodus ein
   Steuerelement. Nicht bearbeitbare Spalten bleiben immer Text. */
function formularZeile(spalte) {
  if (!bearbeiten || !istBearbeitbar(spalte)) return spaltenZeile(spalte);

  if (spalte.t === "Boolean") {
    const z = feldZeileKnoten(spalte.d, schalterFuer(spalte, "Ja"), false);
    z.classList.toggle("g-geaendert", istGeaendert(spalte.i));
    return z;
  }
  const feld = eingabeFuer(spalte);
  const huelle = el("div");
  huelle.appendChild(feld);
  if (spalte.i === "Title") {
    huelle.appendChild(el("div", "g-karte-hinweis",
      "Schlüssel für den SCCM-Abgleich. Muss genau dem Gerätenamen in SCCM entsprechen."));
  }
  const z = feldZeileKnoten(spalte.d, huelle, false);
  z.classList.toggle("g-geaendert", istGeaendert(spalte.i));
  return z;
}


/* ==================================================================
   5. Auswertung
   ================================================================== */

/* Anreicherung wie auf der Hauptseite. app.js ist kein Modul, deshalb steht
   die kleine Logik hier ein zweites Mal. Wird sie dort geändert, gehört sie
   auch hier nachgeführt. */
function anreichern(roh) {
  return roh.map(function (z) {
    const titel = String(z.Title || "").trim();
    const istGeteilt = /^Shared\s+/i.test(titel);
    const istKeinPc = /^kein pc$/i.test(titel);

    z.__geraet = istGeteilt ? titel.replace(/^Shared\s+/i, "").trim() : (istKeinPc ? "" : titel);
    z.__istGeteilt = istGeteilt;
    z.__istKeinPc = istKeinPc;
    z.__art = istKeinPc ? "Kein PC" : (istGeteilt ? "Weiterer Benutzer" : "Gerät");

    z.__jahr = "";
    for (const j of JAHR_SPALTEN) if (Hilfe.istJa(z[j.i])) z.__jahr = j.d;
    return z;
  });
}

/* Alle Geräte der Flotte, die in SCCM stehen: Grundlage jedes Vergleichs. */
function flotte() {
  return alleZeilen.filter(z => z.__art === "Gerät" && Hilfe.istJa(z.SCCM_Found));
}

function zahlOderNull(w) {
  if (w === null || w === undefined || w === "") return null;
  const n = Number(w);
  return isNaN(n) ? null : n;
}

/* Prozent-Rang: wie viele Geräte der Flotte haben höchstens diesen Wert. */
function perzentil(werte, meinWert) {
  if (meinWert === null || !werte.length) return null;
  let kleiner = 0;
  for (const w of werte) if (w <= meinWert) kleiner++;
  return Math.round(kleiner / werte.length * 100);
}

function median(werte) {
  if (!werte.length) return null;
  const s = werte.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2 * 10) / 10;
}

/* Häufigster Wert einer Spalte in der Flotte. */
function haeufigster(feld) {
  const zaehler = {};
  for (const z of flotte()) {
    const w = String(z[feld] || "").trim();
    if (!w) continue;
    zaehler[w] = (zaehler[w] || 0) + 1;
  }
  let bester = "", anzahl = 0;
  for (const w in zaehler) if (zaehler[w] > anzahl) { bester = w; anzahl = zaehler[w]; }
  return { wert: bester, anzahl: anzahl };
}

/* Ein OS-Build «10.0.26100» in eine vergleichbare Zahl. */
function buildZahl(text) {
  const teile = String(text || "").split(".");
  if (teile.length < 3) return null;
  const n = Number(teile[2]);
  return isNaN(n) ? null : n;
}

function akkuProzent() {
  const treffer = /(\d{1,3})\s*%/.exec(String(zeile.SCCM_Battery || ""));
  return treffer ? Number(treffer[1]) : null;
}

/* Kontenname ohne Domäne, klein geschrieben. */
function kontoKurz(text) {
  const t = String(text || "").trim();
  if (!t) return "";
  const teile = t.split("\\");
  return teile[teile.length - 1].toLowerCase();
}

/* Die Auffälligkeiten. Jede mit Schweregrad und einer Erklärung, warum das
   hier auffällt — eine Liste ohne Begründung hilft niemandem. */
function auffaelligkeiten() {
  const b = [];
  if (!zeile) return b;
  const rot = (t, e) => b.push({ stufe: "rot", titel: t, text: e });
  const gelb = (t, e) => b.push({ stufe: "gelb", titel: t, text: e });
  const blau = (t, e) => b.push({ stufe: "blau", titel: t, text: e });

  const inSccm = Hilfe.istJa(zeile.SCCM_Found);
  const keinPc = zeile.__art === "Kein PC";

  if (!zeile.__jahr && !keinPc) {
    blau("Kein Beschaffungsjahr", "In den Stammdaten ist kein Jahr angekreuzt. "
      + "Ohne Jahr fehlt das Gerät in der Ersatzplanung.");
  }

  if (!inSccm) {
    if (!keinPc) {
      gelb("Nicht in SCCM", "Zu diesem PC-Namen findet der Abgleich kein Gerät in SCCM. "
        + "Entweder heisst das Gerät dort anders, oder es ist ausser Betrieb.");
    }
    return b;
  }

  const tageAktiv = Hilfe.tageHer(zeile.SCCM_LastActive);
  if (tageAktiv !== null && tageAktiv > 90) {
    rot("Seit " + tageAktiv + " Tagen still", "Letzte Aktivität in SCCM am "
      + Hilfe.datumText(zeile.SCCM_LastActive) + ". Nach drei Monaten ohne Lebenszeichen "
      + "ist das Gerät vermutlich ausser Betrieb.");
  } else if (tageAktiv !== null && tageAktiv > 30) {
    gelb("Seit " + tageAktiv + " Tagen still", "Letzte Aktivität in SCCM am "
      + Hilfe.datumText(zeile.SCCM_LastActive) + ". Bitte prüfen, ob das Gerät noch im Einsatz ist.");
  }

  const frei = zahlOderNull(zeile.SCCM_DiskCFreeGB);
  if (frei !== null && frei < 20) {
    rot("Wenig Speicherplatz", "Auf Laufwerk C: sind noch " + Hilfe.zahlText(frei, 1)
      + " GB frei. Unter 20 GB scheitern Windows-Updates regelmässig.");
  } else if (frei !== null && frei < 50) {
    gelb("Speicherplatz wird knapp", "Auf Laufwerk C: sind noch " + Hilfe.zahlText(frei, 1)
      + " GB frei. Unter 50 GB wird es für grössere Updates eng.");
  }

  const signaturAlter = Hilfe.tageHer(zeile.SCCM_EPSignatureDate);
  if (signaturAlter !== null && signaturAlter > 7) {
    rot("Defender-Signatur veraltet", "Die Virensignatur ist " + signaturAlter
      + " Tage alt. Normal ist höchstens ein Tag.");
  }
  if (zeile.SCCM_EPEnabled && !Hilfe.istJa(zeile.SCCM_EPEnabled)) {
    rot("Defender nicht aktiv", "Der Virenschutz meldet sich als deaktiviert.");
  }
  if (zeile.SCCM_EPInfectionStatus && !/sauber|clean|kein/i.test(String(zeile.SCCM_EPInfectionStatus))) {
    rot("Defender meldet einen Fund", "Infektionsstatus: " + zeile.SCCM_EPInfectionStatus + ".");
  }
  if (Hilfe.istJa(zeile.SCCM_EPPendingReboot)) {
    gelb("Neustart ausstehend", "Der Virenschutz verlangt einen Neustart, "
      + "bevor der Schutz wieder vollständig greift.");
  }

  if (zeile.SCCM_ClientCheckPass && !Hilfe.istJa(zeile.SCCM_ClientCheckPass)) {
    gelb("Client-Prüfung nicht bestanden", "Die letzte Selbstprüfung des SCCM-Clients "
      + "ist fehlgeschlagen. Ohne funktionierenden Client kommen weder Updates "
      + "noch Software auf das Gerät.");
  }
  if (zeile.SCCM_ClientActive && !Hilfe.istJa(zeile.SCCM_ClientActive)) {
    gelb("SCCM-Client inaktiv", "SCCM stuft den Client als inaktiv ein.");
  }

  const bitlocker = String(zeile.SCCM_BitLocker || "").trim();
  if (bitlocker && (/nicht|kein|off|nein/i.test(bitlocker) || !/verschl|encrypt/i.test(bitlocker))) {
    rot("Laufwerk nicht verschlüsselt", "BitLocker meldet «" + bitlocker
      + "». Bei Verlust des Geräts sind die Daten lesbar.");
  }
  if (zeile.SCCM_TPMEnabled && !Hilfe.istJa(zeile.SCCM_TPMEnabled)) {
    gelb("TPM nicht aktiviert", "Ohne TPM lässt sich BitLocker nicht ohne "
      + "Kennworteingabe betreiben.");
  }

  const meinBuild = buildZahl(zeile.SCCM_OSVersion);
  const flottenBuild = haeufigster("SCCM_OSVersion");
  const zielBuild = buildZahl(flottenBuild.wert);
  if (meinBuild !== null && zielBuild !== null && meinBuild < zielBuild) {
    gelb("OS-Build veraltet", "Dieses Gerät läuft auf " + zeile.SCCM_OSVersion
      + ", der häufigste Build der Flotte ist " + flottenBuild.wert
      + " (" + flottenBuild.anzahl + " Geräte).");
  }

  const snExcel = String(zeile.Seriennummer || "").trim();
  const snSccm = String(zeile.SCCM_SerialNumber || "").trim();
  if (snExcel && snSccm && snExcel.toLowerCase() !== snSccm.toLowerCase()) {
    gelb("Seriennummer stimmt nicht überein", "Inventar: «" + snExcel
      + "», SCCM: «" + snSccm + "». Vermutlich wurde das Gerät ersetzt, "
      + "ohne die Liste nachzuführen.");
  }

  const nameExcel = String(zeile.__geraet || "").trim();
  const nameSccm = String(zeile.SCCM_Name || "").trim();
  if (nameExcel && nameSccm && nameExcel.toLowerCase() !== nameSccm.toLowerCase()) {
    gelb("PC-Name weicht ab", "Inventar: «" + nameExcel + "», SCCM: «" + nameSccm + "».");
  }

  const login = String(zeile.Login || "").trim().toLowerCase();
  const letzter = kontoKurz(zeile.SCCM_LastLogonUser);
  if (login && letzter && login !== letzter && !zeile.__istGeteilt) {
    blau("Anderer Benutzer angemeldet", "Zuletzt angemeldet war «" + letzter
      + "», hinterlegt ist «" + login + "». Bei einem Handwechsel gehören "
      + "die Stammdaten nachgeführt.");
  }

  const akku = akkuProzent();
  if (akku !== null && akku < 50) {
    gelb("Akku schwach", "Der Akku meldet noch " + akku + " % Kapazität. "
      + "Unter 50 % lohnt sich ein Ersatz.");
  }

  return b;
}

/* Der Gesundheits-Score. Bewusst einfach und nachvollziehbar: von 100 Punkten
   kostet jede Auffälligkeit je nach Schweregrad einen festen Abzug. */
const ABZUG = { rot: 15, gelb: 7, blau: 3 };

function score(liste) {
  let punkte = 100;
  for (const b of liste) punkte -= ABZUG[b.stufe];
  return Math.max(0, Math.min(100, punkte));
}

function scoreFarbe(punkte) {
  if (punkte >= 85) return "gruen";
  if (punkte >= 60) return "gelb";
  return "rot";
}


/* ==================================================================
   6. Die Bereiche
   ================================================================== */

/* ---------- Übersicht ---------- */

function bereichUebersicht(ziel) {
  const kacheln = el("div", "g-kacheln");
  const frei = zahlOderNull(zeile.SCCM_DiskCFreeGB);
  const gesamt = zahlOderNull(zeile.SCCM_DiskCGB);
  const signaturAlter = Hilfe.tageHer(zeile.SCCM_EPSignatureDate);
  const tageAktiv = Hilfe.tageHer(zeile.SCCM_LastActive);
  const tageBoot = Hilfe.tageHer(zeile.SCCM_LastBoot);

  kacheln.appendChild(kachel("Zuletzt aktiv",
    zeile.SCCM_LastActive ? Hilfe.relativText(zeile.SCCM_LastActive) : "unbekannt",
    Hilfe.datumZeitText(zeile.SCCM_LastActive),
    tageAktiv === null ? null : (tageAktiv > 90 ? "rot" : (tageAktiv > 30 ? "gelb" : "gruen"))));

  kacheln.appendChild(kachel("Letzter Neustart",
    zeile.SCCM_LastBoot ? Hilfe.relativText(zeile.SCCM_LastBoot) : "unbekannt",
    tageBoot === null ? "" : "Laufzeit " + tageBoot + " Tage",
    tageBoot === null ? null : (tageBoot > 30 ? "gelb" : "gruen")));

  const speicherKachel = kachel("Laufwerk C: frei",
    frei === null ? "" : Hilfe.zahlText(frei, 1) + " GB",
    gesamt ? "von " + Hilfe.zahlText(gesamt, 0) + " GB" : "",
    frei === null ? null : (frei < 20 ? "rot" : (frei < 50 ? "gelb" : "gruen")));
  if (frei !== null && gesamt) {
    speicherKachel.appendChild(balken(frei / gesamt * 100,
      frei < 20 ? "rot" : (frei < 50 ? "gelb" : null)));
  }
  kacheln.appendChild(speicherKachel);

  kacheln.appendChild(kachel("Arbeitsspeicher",
    zeile.SCCM_RAMGB ? Hilfe.zahlText(zeile.SCCM_RAMGB, 0) + " GB" : "",
    zeile.SCCM_CPUCores ? zeile.SCCM_CPUCores + " Kerne / "
      + (zeile.SCCM_CPULogical || "?") + " Threads" : ""));

  kacheln.appendChild(kachel("OS-Version", zeile.SCCM_OSVersion, zeile.SCCM_OS));

  kacheln.appendChild(kachel("Defender-Signatur",
    signaturAlter === null ? "" : (signaturAlter === 0 ? "heute" : signaturAlter + " Tage alt"),
    zeile.SCCM_EPSignatureVersion,
    signaturAlter === null ? null : (signaturAlter > 7 ? "rot" : (signaturAlter > 2 ? "gelb" : "gruen"))));

  kacheln.appendChild(kachel("BitLocker", zeile.SCCM_BitLocker, "",
    zeile.SCCM_BitLocker ? (/nicht/i.test(zeile.SCCM_BitLocker) ? "rot" : "gruen") : null));

  kacheln.appendChild(kachel("TPM", zeile.SCCM_TPMVersion,
    zeile.SCCM_TPMEnabled ? "aktiviert: " + zeile.SCCM_TPMEnabled : "",
    zeile.SCCM_TPMEnabled ? (Hilfe.istJa(zeile.SCCM_TPMEnabled) ? "gruen" : "gelb") : null));

  kacheln.appendChild(kachel("Hardware-Inventar",
    zeile.SCCM_LastHardwareScan ? Hilfe.relativText(zeile.SCCM_LastHardwareScan) : "",
    Hilfe.datumText(zeile.SCCM_LastHardwareScan)));
  kacheln.appendChild(kachel("Software-Inventar",
    zeile.SCCM_LastSoftwareScan ? Hilfe.relativText(zeile.SCCM_LastSoftwareScan) : "",
    Hilfe.datumText(zeile.SCCM_LastSoftwareScan)));
  kacheln.appendChild(kachel("Letzter Heartbeat",
    zeile.SCCM_LastDDR ? Hilfe.relativText(zeile.SCCM_LastDDR) : "",
    Hilfe.datumText(zeile.SCCM_LastDDR)));

  ziel.appendChild(kacheln);

  const gitter = kartenGitter();

  const liste = auffaelligkeiten();
  const kBefunde = karte("Auffälligkeiten",
    liste.length ? "Aus den aktuellen Werten abgeleitet, in der Reihenfolge des Schweregrads."
                 : null);
  if (!liste.length) {
    kBefunde.appendChild(leerHinweis("Nichts zu beanstanden. Alle geprüften Regeln sind erfüllt."));
  } else {
    const reihenfolge = { rot: 0, gelb: 1, blau: 2 };
    liste.slice().sort((a, b) => reihenfolge[a.stufe] - reihenfolge[b.stufe]).forEach(function (bf) {
      const z = el("div", "g-befund g-stufe-" + bf.stufe);
      z.appendChild(el("div", "g-befund-punkt"));
      const rechts = el("div");
      rechts.appendChild(el("div", "g-befund-titel", bf.titel));
      rechts.appendChild(el("div", "g-befund-text", bf.text));
      z.appendChild(rechts);
      kBefunde.appendChild(z);
    });
  }
  gitter.appendChild(kBefunde);

  const punkte = score(liste);
  const kScore = karte("Gesundheits-Score");
  const zeileScore = el("div", "g-score");
  const zahl = el("span", "g-score-zahl", String(punkte));
  zeileScore.appendChild(zahl);
  zeileScore.appendChild(el("span", "g-score-max", "von 100"));
  kScore.appendChild(zeileScore);
  kScore.appendChild(balken(punkte, scoreFarbe(punkte) === "gruen" ? null : scoreFarbe(punkte)));

  const rot = liste.filter(b => b.stufe === "rot").length;
  const gelb = liste.filter(b => b.stufe === "gelb").length;
  const blau = liste.filter(b => b.stufe === "blau").length;
  kScore.appendChild(el("p", "g-karte-hinweis",
    "Rechnung: 100 Punkte minus 15 je schwerer Auffälligkeit (" + rot + "), "
    + "minus 7 je Warnung (" + gelb + "), minus 3 je Hinweis (" + blau + ")."));

  const zusammen = el("div", "g-badges");
  zusammen.appendChild(badge(rot + " schwer", rot ? "rot" : null));
  zusammen.appendChild(badge(gelb + " Warnungen", gelb ? "gelb" : null));
  zusammen.appendChild(badge(blau + " Hinweise", blau ? "blau" : null));
  kScore.appendChild(zusammen);
  gitter.appendChild(kScore);

  ziel.appendChild(gitter);
}

/* ---------- Stammdaten ---------- */

function bereichStammdaten(ziel) {
  const gitter = kartenGitter();

  const kStamm = karte("Stammdaten", bearbeiten
    ? "Diese Felder werden von Hand gepflegt; der SCCM-Abgleich fasst sie nie an."
    : "Von Hand gepflegte Felder. Zum Ändern oben auf «Bearbeiten».");
  const felder = el("div", "g-felder");
  for (const s of STAMM_SPALTEN) {
    if (s.t === "Note") continue;             // Bemerkung bekommt eine eigene Karte
    felder.appendChild(formularZeile(s));
  }
  kStamm.appendChild(felder);
  gitter.appendChild(kStamm);

  const kJahr = karte("Beschaffung und Budget",
    "Angekreuzt ist das Jahr, in dem das Gerät beschafft wurde beziehungsweise ersetzt wird.");
  const chips = el("div", "g-chips");
  for (const j of JAHR_SPALTEN) {
    const c = el("button", "g-chip", j.d);
    c.type = "button";
    c.setAttribute("aria-pressed", jaWert(j.i) ? "true" : "false");
    c.disabled = !bearbeiten;
    c.addEventListener("click", function () {
      const neu = !(c.getAttribute("aria-pressed") === "true");
      setzeWert(j.i, neu);
      c.setAttribute("aria-pressed", neu ? "true" : "false");
    });
    chips.appendChild(c);
  }
  kJahr.appendChild(chips);

  const budget = el("div", "g-felder");
  for (const s of BUDGET_SPALTEN) budget.appendChild(formularZeile(s));
  kJahr.appendChild(budget);
  gitter.appendChild(kJahr);

  const kBemerkung = karte("Bemerkung");
  for (const s of STAMM_SPALTEN) {
    if (s.t !== "Note") continue;
    if (bearbeiten) {
      const feld = eingabeFuer(s);
      kBemerkung.appendChild(feld);
    } else {
      const text = textWert(s.i);
      kBemerkung.appendChild(text
        ? el("p", "g-feld-wert", text)
        : leerHinweis("Keine Bemerkung erfasst."));
    }
  }
  gitter.appendChild(kBemerkung);

  ziel.appendChild(gitter);
}

/* ---------- Software und Rechte ---------- */

function bereichSoftware(ziel) {
  const gesetzt = SOFTWARE_SPALTEN.filter(s => s.t === "Boolean"
    ? jaWert(s.i) : textWert(s.i).trim() !== "");

  const kInventar = karte("Software und Rechte im Inventar",
    "Von Hand gepflegt. Ja/Nein-Häkchen und Textfelder mit AD-Gruppennamen.", true);

  const werkzeuge = el("div", "g-werkzeuge");
  const suche = el("input", "g-suche");
  suche.type = "search";
  suche.placeholder = "Software oder Recht suchen …";
  suche.value = swSuche;
  suche.autocomplete = "off";
  suche.addEventListener("input", function () {
    swSuche = suche.value;
    zeichneBereich(true);
  });
  werkzeuge.appendChild(suche);

  const nurGesetzt = el("label", "g-schalterchen");
  const hk = el("input");
  hk.type = "checkbox";
  hk.checked = swNurGesetzte;
  hk.addEventListener("change", function () {
    swNurGesetzte = hk.checked;
    zeichneBereich(false);
  });
  nurGesetzt.appendChild(hk);
  nurGesetzt.appendChild(document.createTextNode("nur gesetzte"));
  werkzeuge.appendChild(nurGesetzt);

  werkzeuge.appendChild(el("span", "g-zaehler",
    gesetzt.length + " von " + SOFTWARE_SPALTEN.length + " gesetzt"));
  kInventar.appendChild(werkzeuge);

  const suchtext = swSuche.trim().toLowerCase();
  let sichtbar = 0;
  for (const gruppe of GRUPPEN) {
    const spalten = SOFTWARE_SPALTEN.filter(function (s) {
      if (s.g !== gruppe) return false;
      if (suchtext && s.d.toLowerCase().indexOf(suchtext) === -1) return false;
      if (swNurGesetzte) {
        return s.t === "Boolean" ? jaWert(s.i) : textWert(s.i).trim() !== "";
      }
      return true;
    });
    if (!spalten.length) continue;
    sichtbar += spalten.length;

    kInventar.appendChild(el("h3", null, gruppe));
    if (gruppe === AD_GRUPPE) {
      const felder = el("div", "g-felder");
      for (const s of spalten) felder.appendChild(formularZeile(s));
      kInventar.appendChild(felder);
    } else {
      const raster = el("div", "g-raster");
      for (const s of spalten) {
        if (bearbeiten) {
          const schalter = schalterFuer(s);
          schalter.classList.toggle("g-geaendert", istGeaendert(s.i));
          raster.appendChild(schalter);
        } else {
          const zeileText = el("div", "g-schalter");
          const punkt = el("span", "g-schalter-spur");
          if (jaWert(s.i)) punkt.style.background = "var(--gruen, #84B819)";
          zeileText.appendChild(punkt);
          zeileText.appendChild(el("span", "g-schalter-text", s.d));
          raster.appendChild(zeileText);
        }
      }
      kInventar.appendChild(raster);
    }
  }
  if (!sichtbar) kInventar.appendChild(leerHinweis("Keine Spalte passt zur Suche."));
  ziel.appendChild(kInventar);

  if (neuModus) return;

  const gitter = kartenGitter();

  /* Deployments aus SCCM. */
  const deployments = Hilfe.zeilen(zeile.SCCM_DeployedApps).map(Hilfe.felder);
  const kDeploy = karte("Zugewiesene Applikationen (Deployments)",
    "Aus SCCM, schreibgeschützt. " + (zeile.SCCM_AppsInstalled || 0) + " installiert, "
    + (zeile.SCCM_AppsRequired || 0) + " erforderlich.");
  if (!deployments.length) {
    kDeploy.appendChild(leerHinweis("Keine Zuweisungen erfasst."));
  } else {
    kDeploy.appendChild(tabelle(["Applikation", "Sammlung", "Zweck", "Status"],
      deployments.map(function (f) {
        const status = f[3] || "";
        const farbe = /erfolg/i.test(status) ? "gruen"
          : (/fehl/i.test(status) ? "rot" : (/ausstehend|pending/i.test(status) ? "gelb" : null));
        return [f[0] || "", f[1] || "", f[2] || "", badge(status || "unbekannt", farbe)];
      })));
  }
  gitter.appendChild(kDeploy);

  /* Installierte Software. */
  const installiert = Hilfe.zeilen(zeile.SCCM_InstalledSoftware).map(Hilfe.felder);
  const kInstalliert = karte("Installierte Software (Add/Remove)",
    "Aus dem Software-Inventar von SCCM. Gezählt sind "
    + (zeile.SCCM_InstalledSoftwareCount || installiert.length) + " Einträge, "
    + "aufgeführt werden die vom Abgleich übernommenen.");
  const isWerkzeuge = el("div", "g-werkzeuge");
  const isSuche = el("input", "g-suche");
  isSuche.type = "search";
  isSuche.placeholder = "Installierte Software suchen …";
  isSuche.value = swInstalliertSuche;
  isSuche.autocomplete = "off";
  isSuche.addEventListener("input", function () {
    swInstalliertSuche = isSuche.value;
    zeichneBereich(true);
  });
  isWerkzeuge.appendChild(isSuche);
  kInstalliert.appendChild(isWerkzeuge);

  const isText = swInstalliertSuche.trim().toLowerCase();
  const gefiltert = installiert.filter(f => !isText
    || String(f[0] || "").toLowerCase().indexOf(isText) > -1);
  if (!gefiltert.length) {
    kInstalliert.appendChild(leerHinweis(installiert.length
      ? "Kein Eintrag passt zur Suche." : "Keine Software erfasst."));
  } else {
    kInstalliert.appendChild(tabelle(["Name", "Version"],
      gefiltert.map(f => [f[0] || "", f[1] || ""])));
  }
  gitter.appendChild(kInstalliert);

  /* Office und Sammlungen. */
  const kOffice = karte("Office-Produkte");
  const office = Hilfe.zeilen(zeile.SCCM_Office).map(Hilfe.felder);
  if (!office.length) kOffice.appendChild(leerHinweis("Kein Office-Produkt erfasst."));
  else kOffice.appendChild(tabelle(["Produkt", "Version"],
    office.map(f => [f[0] || "", f[1] || ""])));
  gitter.appendChild(kOffice);

  const kSammlungen = karte("Sammlungen (Collections)",
    "Mitgliedschaften in SCCM. Sie steuern, welche Software und welche "
    + "Einstellungen das Gerät erhält.");
  const sammlungen = Hilfe.zeilen(zeile.SCCM_Collections);
  if (!sammlungen.length) kSammlungen.appendChild(leerHinweis("Keine Sammlungen erfasst."));
  else {
    const raster = el("div", "g-raster");
    for (const s of sammlungen) raster.appendChild(el("div", "g-schalter-text", s));
    kSammlungen.appendChild(raster);
  }
  gitter.appendChild(kSammlungen);

  /* Abgleich Häkchen gegen tatsächlich Installiertes. */
  const kAbgleich = karte("Abgleich Häkchen ↔ SCCM",
    "Nur ein Hinweis: verglichen wird grob über Namensteile. Viele Programme "
    + "heissen im Inventar anders als in der Windows-Programmliste, "
    + "ein Treffer fehlt also nicht zwingend.", true);
  const vorhandenText = (Hilfe.zeilen(zeile.SCCM_InstalledSoftware).join(" ") + " "
    + Hilfe.zeilen(zeile.SCCM_DeployedApps).join(" ")).toLowerCase();
  const fehlend = [];
  if (vorhandenText.trim()) {
    for (const s of SOFTWARE_SPALTEN) {
      const gesetztHier = s.t === "Boolean" ? jaWert(s.i) : textWert(s.i).trim() !== "";
      if (!gesetztHier) continue;
      const teil = s.d.replace(/\(.*?\)/g, "").split(/[\/\-–]/)[0].trim().toLowerCase();
      if (teil.length < 4) continue;         // zu kurz für einen sinnvollen Vergleich
      if (vorhandenText.indexOf(teil) === -1) fehlend.push(s.d);
    }
  }
  if (!vorhandenText.trim()) {
    kAbgleich.appendChild(leerHinweis("Ohne Software-Inventar aus SCCM ist kein Abgleich möglich."));
  } else if (!fehlend.length) {
    kAbgleich.appendChild(leerHinweis("Zu jedem gesetzten Häkchen liess sich ein passender Eintrag finden."));
  } else {
    kAbgleich.appendChild(el("p", "g-karte-hinweis",
      fehlend.length + " gesetzte Häkchen ohne passenden Fund in SCCM:"));
    const raster = el("div", "g-raster");
    for (const name of fehlend) raster.appendChild(el("div", "g-schalter-text", "• " + name));
    kAbgleich.appendChild(raster);
  }
  gitter.appendChild(kAbgleich);

  ziel.appendChild(gitter);
}

/* ---------- Hardware ---------- */

function bereichHardware(ziel) {
  const gitter = kartenGitter();

  const kGeraet = karte("Gerät");
  const f1 = el("div", "g-felder");
  f1.appendChild(feldZeile("Hersteller", zeile.SCCM_Manufacturer, null, true));
  f1.appendChild(feldZeile("Modell", zeile.SCCM_Model, null, true));
  f1.appendChild(feldZeile("Typ (Inventar)", textWert("Typ"), null, false));
  f1.appendChild(feldZeile("Gehäusetyp", zeile.SCCM_ChassisType, null, true));
  f1.appendChild(feldZeile("Seriennummer (Inventar)", textWert("Seriennummer"), null, false));
  f1.appendChild(feldZeile("Seriennummer (SCCM)", zeile.SCCM_SerialNumber, null, true));
  f1.appendChild(feldZeile("SMBIOS GUID", zeile.SCCM_SMBIOSGUID, null, true));
  f1.appendChild(feldZeile("Virtuelle Maschine", zeile.SCCM_IsVirtual, null, true));
  kGeraet.appendChild(f1);
  gitter.appendChild(kGeraet);

  const kRechen = karte("Prozessor und Speicher");
  const f2 = el("div", "g-felder");
  f2.appendChild(feldZeile("Prozessor", zeile.SCCM_CPU, null, true));
  f2.appendChild(feldZeile("Kerne / logische Prozessoren",
    (zeile.SCCM_CPUCores || "—") + " / " + (zeile.SCCM_CPULogical || "—"), null, true));
  f2.appendChild(feldZeile("Arbeitsspeicher",
    zeile.SCCM_RAMGB ? Hilfe.zahlText(zeile.SCCM_RAMGB, 0) + " GB" : "", null, true));
  kRechen.appendChild(f2);

  const frei = zahlOderNull(zeile.SCCM_DiskCFreeGB);
  const gesamt = zahlOderNull(zeile.SCCM_DiskCGB);
  kRechen.appendChild(el("h3", null, "Laufwerk C:"));
  if (gesamt) {
    const belegt = frei === null ? null : gesamt - frei;
    kRechen.appendChild(el("div", "g-feld-wert",
      Hilfe.zahlText(frei, 1) + " GB frei von " + Hilfe.zahlText(gesamt, 0) + " GB"
      + (belegt === null ? "" : " (" + Hilfe.zahlText(belegt, 1) + " GB belegt)")));
    kRechen.appendChild(balken(frei === null ? 0 : frei / gesamt * 100,
      frei !== null && frei < 20 ? "rot" : (frei !== null && frei < 50 ? "gelb" : null)));
  } else {
    kRechen.appendChild(leerHinweis("Keine Angaben zum Laufwerk C:."));
  }
  gitter.appendChild(kRechen);

  const kDisks = karte("Physische Datenträger");
  const disks = Hilfe.zeilen(zeile.SCCM_PhysicalDisks).map(Hilfe.felder);
  if (!disks.length) kDisks.appendChild(leerHinweis("Keine Datenträger erfasst."));
  else kDisks.appendChild(tabelle(["Datenträger", "Zustand"],
    disks.map(f => [f[0] || "", f.slice(1).join(" · ")])));
  gitter.appendChild(kDisks);

  const kBios = karte("BIOS und TPM");
  const f3 = el("div", "g-felder");
  f3.appendChild(feldZeile("BIOS-Version", zeile.SCCM_BIOSVersion, null, true));
  const biosAlter = Hilfe.tageHer(zeile.SCCM_BIOSDate);
  f3.appendChild(feldZeile("BIOS-Datum", Hilfe.datumText(zeile.SCCM_BIOSDate),
    biosAlter === null ? null : "vor " + Math.round(biosAlter / 30) + " Monaten", true));
  f3.appendChild(feldZeile("TPM-Version", zeile.SCCM_TPMVersion, null, true));
  f3.appendChild(feldZeile("TPM aktiviert", zeile.SCCM_TPMEnabled, null, true));
  const akku = akkuProzent();
  f3.appendChild(feldZeile("Akku", zeile.SCCM_Battery,
    akku === null ? null : (akku < 50 ? "Ersatz prüfen" : "in Ordnung"), true));
  kBios.appendChild(f3);
  gitter.appendChild(kBios);

  const kMonitore = karte("Monitore");
  const monitore = Hilfe.zeilen(zeile.SCCM_Monitors).map(Hilfe.felder);
  if (!monitore.length) kMonitore.appendChild(leerHinweis("Keine Monitore erfasst."));
  else kMonitore.appendChild(tabelle(["Monitor", "Auflösung"],
    monitore.map(f => [f[0] || "", f[1] || ""])));
  gitter.appendChild(kMonitore);

  ziel.appendChild(gitter);
}

/* ---------- System und Netzwerk ---------- */

function bereichSystem(ziel) {
  const gitter = kartenGitter();

  const kOs = karte("Betriebssystem");
  const f1 = el("div", "g-felder");
  f1.appendChild(feldZeile("Betriebssystem", zeile.SCCM_OS, null, true));
  f1.appendChild(feldZeile("OS-Version (Build)", zeile.SCCM_OSVersion, null, true));
  f1.appendChild(datumZeile("Installiert am", zeile.SCCM_OSInstallDate));
  const tageBoot = Hilfe.tageHer(zeile.SCCM_LastBoot);
  f1.appendChild(feldZeile("Letzter Neustart", Hilfe.datumZeitText(zeile.SCCM_LastBoot),
    tageBoot === null ? null : "Laufzeit " + tageBoot + " Tage", true));
  f1.appendChild(feldZeile("Sprache", zeile.SCCM_OSLanguage, null, true));
  f1.appendChild(feldZeile("Systemtyp", zeile.SCCM_SystemType, null, true));
  kOs.appendChild(f1);
  gitter.appendChild(kOs);

  const kNetz = karte("Netzwerk");
  const f2 = el("div", "g-felder");
  f2.appendChild(feldZeile("IPv4-Adresse", zeile.SCCM_IPv4, null, true));
  f2.appendChild(feldZeile("Alle IP-Adressen", zeile.SCCM_IPAddresses, null, true));
  f2.appendChild(feldZeile("MAC-Adressen", zeile.SCCM_MACAddresses, null, true));
  f2.appendChild(feldZeile("DHCP", zeile.SCCM_DHCP, null, true));
  f2.appendChild(feldZeile("Management Point", zeile.SCCM_ManagementPoint, null, true));
  f2.appendChild(feldZeile("Boundary Groups", zeile.SCCM_BoundaryGroups, null, true));
  kNetz.appendChild(f2);
  gitter.appendChild(kNetz);

  const kAd = karte("Active Directory und Entra ID");
  const f3 = el("div", "g-felder");
  f3.appendChild(feldZeile("Domäne", zeile.SCCM_Domain, null, true));
  f3.appendChild(feldZeile("AD Distinguished Name", zeile.SCCM_OU, null, true));

  // Den DN in einen lesbaren OU-Pfad zerlegen: von hinten nach vorne.
  const teile = String(zeile.SCCM_OU || "").split(",").map(t => t.trim()).filter(t => t);
  const ous = teile.filter(t => /^OU=/i.test(t)).map(t => t.substring(3));
  const dcs = teile.filter(t => /^DC=/i.test(t)).map(t => t.substring(3));
  if (ous.length || dcs.length) {
    // Ein DN steht von innen nach aussen; für den Pfad drehen wir die
    // Organisationseinheiten um. Die Domäne bleibt in ihrer Reihenfolge.
    f3.appendChild(feldZeile("OU-Pfad",
      dcs.join(".") + (ous.length ? " / " + ous.reverse().join(" / ") : ""), null, true));
  }
  f3.appendChild(feldZeile("AD Standort", zeile.SCCM_ADSite, null, true));
  f3.appendChild(datumZeile("AD Computerkonto erstellt", zeile.SCCM_ADCreated));
  f3.appendChild(datumZeile("AD letzte Anmeldung", zeile.SCCM_ADLastLogon));
  f3.appendChild(feldZeile("Entra Device ID", zeile.SCCM_AADDeviceID, null, true));
  f3.appendChild(feldZeile("Co-Managed (Intune)", zeile.SCCM_CoManaged, null, true));
  kAd.appendChild(f3);
  gitter.appendChild(kAd);

  ziel.appendChild(gitter);
}

/* ---------- Sicherheit ---------- */

function bereichSicherheit(ziel) {
  const gitter = kartenGitter();

  const signaturAlter = Hilfe.tageHer(zeile.SCCM_EPSignatureDate);
  const kDefender = karte("Microsoft Defender");
  const f1 = el("div", "g-felder");
  f1.appendChild(feldZeile("Aktiv", zeile.SCCM_EPEnabled, null, true));
  f1.appendChild(feldZeile("Client-Version", zeile.SCCM_EPClientVersion, null, true));
  f1.appendChild(feldZeile("Signaturversion", zeile.SCCM_EPSignatureVersion, null, true));
  f1.appendChild(feldZeile("Signaturdatum", Hilfe.datumZeitText(zeile.SCCM_EPSignatureDate),
    signaturAlter === null ? null
      : (signaturAlter === 0 ? "heute aktualisiert" : signaturAlter + " Tage alt"), true));
  f1.appendChild(datumZeile("Letzter Schnellscan", zeile.SCCM_EPLastQuickScan));
  f1.appendChild(datumZeile("Letzter Vollscan", zeile.SCCM_EPLastFullScan));
  f1.appendChild(feldZeile("Infektionsstatus", zeile.SCCM_EPInfectionStatus, null, true));
  f1.appendChild(feldZeile("Letzte Bedrohung", zeile.SCCM_EPLastThreat, null, true));
  f1.appendChild(feldZeile("Neustart ausstehend", zeile.SCCM_EPPendingReboot, null, true));
  kDefender.appendChild(f1);
  gitter.appendChild(kDefender);

  const kVerschluesselung = karte("Verschlüsselung und Verwaltung");
  const f2 = el("div", "g-felder");
  f2.appendChild(feldZeile("BitLocker", zeile.SCCM_BitLocker, null, true));
  f2.appendChild(feldZeile("TPM-Version", zeile.SCCM_TPMVersion, null, true));
  f2.appendChild(feldZeile("TPM aktiviert", zeile.SCCM_TPMEnabled, null, true));
  f2.appendChild(feldZeile("Co-Managed (Intune)", zeile.SCCM_CoManaged, null, true));
  kVerschluesselung.appendChild(f2);

  const abzeichen = el("div", "g-badges");
  abzeichen.appendChild(badge(zeile.SCCM_BitLocker || "BitLocker unbekannt",
    zeile.SCCM_BitLocker ? (/nicht/i.test(zeile.SCCM_BitLocker) ? "rot" : "gruen") : null));
  abzeichen.appendChild(badge(Hilfe.istJa(zeile.SCCM_TPMEnabled) ? "TPM aktiv" : "TPM nicht aktiv",
    Hilfe.istJa(zeile.SCCM_TPMEnabled) ? "gruen" : "gelb"));
  abzeichen.appendChild(badge(Hilfe.istJa(zeile.SCCM_EPEnabled) ? "Defender aktiv" : "Defender inaktiv",
    Hilfe.istJa(zeile.SCCM_EPEnabled) ? "gruen" : "rot"));
  kVerschluesselung.appendChild(abzeichen);
  gitter.appendChild(kVerschluesselung);

  ziel.appendChild(gitter);
}

/* ---------- SCCM-Client und Aktivität ---------- */

function bereichAktivitaet(ziel) {
  const gitter = kartenGitter();

  const kClient = karte("SCCM-Client");
  const f1 = el("div", "g-felder");
  f1.appendChild(feldZeile("In SCCM vorhanden", zeile.SCCM_Found, null, true));
  f1.appendChild(feldZeile("Gerätename in SCCM", zeile.SCCM_Name, null, true));
  f1.appendChild(feldZeile("ResourceID", zeile.SCCM_ResourceID, null, true));
  f1.appendChild(feldZeile("SMSID", zeile.SCCM_SMSID, null, true));
  f1.appendChild(feldZeile("Client-Version", zeile.SCCM_ClientVersion, null, true));
  f1.appendChild(feldZeile("Client aktiv", zeile.SCCM_ClientActive, null, true));
  f1.appendChild(feldZeile("Client-Prüfung bestanden", zeile.SCCM_ClientCheckPass, null, true));
  f1.appendChild(feldZeile("Sync-Status", zeile.SCCM_SyncStatus, null, true));
  f1.appendChild(datumZeile("Letzte Synchronisation", zeile.SCCM_LastSync));
  kClient.appendChild(f1);
  gitter.appendChild(kClient);

  /* Zeitachse: alle Zeitstempel chronologisch, jüngster zuerst. */
  const ZEITSTEMPEL = [
    ["SCCM_LastActive", "Zuletzt aktiv"],
    ["SCCM_LastOnline", "Zuletzt online"],
    ["SCCM_LastOffline", "Zuletzt offline"],
    ["SCCM_LastBoot", "Letzter Neustart"],
    ["SCCM_LastDDR", "Letzter Heartbeat (DDR)"],
    ["SCCM_LastPolicyRequest", "Letzte Richtlinienanfrage"],
    ["SCCM_LastHardwareScan", "Letzter Hardware-Inventar"],
    ["SCCM_LastSoftwareScan", "Letzter Software-Inventar"],
    ["SCCM_LastClientCheck", "Letzte Client-Prüfung"],
    ["SCCM_LastConsoleUse", "Letzte Benutzeranmeldung"],
    ["SCCM_ADLastLogon", "AD letzte Anmeldung"],
    ["SCCM_EPSignatureDate", "Defender-Signatur"],
    ["SCCM_EPLastQuickScan", "Defender Schnellscan"],
    ["SCCM_EPLastFullScan", "Defender Vollscan"],
    ["SCCM_LastSync", "Abgleich mit SharePoint"],
    ["SCCM_OSInstallDate", "OS installiert"],
    ["SCCM_ADCreated", "AD Computerkonto erstellt"],
    ["SCCM_BIOSDate", "BIOS-Datum"]
  ];
  const punkte = [];
  for (const [feld, name] of ZEITSTEMPEL) {
    const d = Hilfe.datum(zeile[feld]);
    if (d) punkte.push({ name: name, datum: d, roh: zeile[feld] });
  }
  punkte.sort((a, b) => b.datum - a.datum);

  const kAchse = karte("Zeitachse", "Alle Zeitstempel dieses Geräts, jüngster zuerst.");
  if (!punkte.length) {
    kAchse.appendChild(leerHinweis("Keine Zeitstempel vorhanden."));
  } else {
    const achse = el("div", "g-achse");
    for (const p of punkte) {
      const tage = Hilfe.tageHer(p.roh);
      const k = el("div", "g-achse-punkt" + (tage !== null && tage > 30 ? " g-alt" : ""));
      k.appendChild(el("div", "g-achse-titel", p.name));
      k.appendChild(el("div", "g-achse-zeit",
        Hilfe.datumZeitText(p.roh) + " · " + Hilfe.relativText(p.roh)));
      achse.appendChild(k);
    }
    kAchse.appendChild(achse);
  }
  gitter.appendChild(kAchse);

  const kBenutzer = karte("Benutzer");
  const f2 = el("div", "g-felder");
  f2.appendChild(feldZeile("Person (Inventar)", textWert("Arbeitsplatz"), null, false));
  f2.appendChild(feldZeile("Login (Inventar)", textWert("Login"), null, false));
  f2.appendChild(feldZeile("Letzter angemeldeter Benutzer", zeile.SCCM_LastLogonUser, null, true));
  f2.appendChild(feldZeile("Aktuell angemeldet", zeile.SCCM_CurrentLogonUser, null, true));
  f2.appendChild(feldZeile("Primärer Benutzer", zeile.SCCM_PrimaryUser, null, true));
  f2.appendChild(feldZeile("Hauptbenutzer (Konsole)", zeile.SCCM_TopConsoleUser, null, true));
  kBenutzer.appendChild(f2);

  const konsole = Hilfe.zeilen(zeile.SCCM_ConsoleUsers).map(Hilfe.felder);
  kBenutzer.appendChild(el("h3", null, "Konsolenbenutzer"));
  if (!konsole.length) {
    kBenutzer.appendChild(leerHinweis("Keine Konsolennutzung erfasst."));
  } else {
    kBenutzer.appendChild(tabelle(["Konto", "Anmeldungen", "Nutzung", "Zuletzt"],
      konsole.map(function (f) {
        const anmeldungen = (/(\d+)/.exec(f[1] || "") || [])[1] || "";
        const minuten = Number((/(\d+)/.exec(f[2] || "") || [])[1] || 0);
        const stunden = minuten ? Hilfe.zahlText(minuten / 60, 1) + " h" : "";
        const zuletzt = String(f[3] || "").replace(/^zuletzt\s*/i, "");
        return [f[0] || "", anmeldungen, stunden, zuletzt];
      }), 1));
  }
  gitter.appendChild(kBenutzer);

  ziel.appendChild(gitter);
}

/* ---------- Analyse: Flottenvergleich ---------- */

function vergleichsZeile(name, meinWert, werte, einheit, hoeherIstBesser, nachkomma) {
  const z = el("div", "g-vergleich");
  z.appendChild(el("div", "g-vergleich-name", name));
  z.appendChild(el("div", "g-vergleich-wert", meinWert === null ? "—"
    : Hilfe.zahlText(meinWert, nachkomma === undefined ? 1 : nachkomma)
      + (einheit ? " " + einheit : "")));

  const p = perzentil(werte, meinWert);
  const mittel = median(werte);
  const neben = el("div", "g-vergleich-neben");
  if (p === null || mittel === null) {
    neben.textContent = "Kein Vergleich möglich.";
  } else {
    const besser = hoeherIstBesser === false ? 100 - p : p;
    neben.textContent = "Median der Flotte: "
      + Hilfe.zahlText(mittel, nachkomma === undefined ? 1 : nachkomma)
      + (einheit ? " " + einheit : "")
      + " · dieses Gerät liegt über " + p + " % der Geräte"
      + (hoeherIstBesser === false
          ? " (weniger ist besser, also besser als " + besser + " %)" : "");
  }
  z.appendChild(neben);

  // Kleine Verteilung: zwölf Klassen, die eigene Klasse hervorgehoben.
  if (werte.length > 3 && meinWert !== null) {
    const min = Math.min.apply(null, werte);
    const max = Math.max.apply(null, werte);
    const spanne = max - min || 1;
    const KLASSEN = 12;
    const eimer = new Array(KLASSEN).fill(0);
    for (const w of werte) {
      const i = Math.min(KLASSEN - 1, Math.floor((w - min) / spanne * KLASSEN));
      eimer[i]++;
    }
    const meineKlasse = Math.min(KLASSEN - 1,
      Math.max(0, Math.floor((meinWert - min) / spanne * KLASSEN)));
    const hoechste = Math.max.apply(null, eimer) || 1;
    const diagramm = el("div", "g-verteilung");
    eimer.forEach(function (anzahl, i) {
      const s = el("div", "g-verteilung-saeule" + (i === meineKlasse ? " g-hier" : ""));
      s.style.height = Math.max(4, Math.round(anzahl / hoechste * 100)) + "%";
      s.title = anzahl + " Geräte";
      diagramm.appendChild(s);
    });
    const huelle = el("div", "g-vergleich-neben");
    huelle.appendChild(diagramm);
    z.appendChild(huelle);
  }
  return z;
}

function bereichAnalyse(ziel) {
  const geraete = flotte();
  const gitter = kartenGitter();

  const kVergleich = karte("Dieses Gerät gegenüber der Flotte",
    "Verglichen wird mit " + geraete.length + " Geräten, die in SCCM stehen "
    + "(ohne geteilte Zeilen und ohne «Kein PC»).", true);

  function werteVon(fn) {
    const w = [];
    for (const z of geraete) {
      const v = fn(z);
      if (v !== null && v !== undefined && !isNaN(v)) w.push(v);
    }
    return w;
  }

  kVergleich.appendChild(vergleichsZeile("Freier Speicher auf C:",
    zahlOderNull(zeile.SCCM_DiskCFreeGB),
    werteVon(z => zahlOderNull(z.SCCM_DiskCFreeGB)), "GB", true, 1));
  kVergleich.appendChild(vergleichsZeile("Arbeitsspeicher",
    zahlOderNull(zeile.SCCM_RAMGB),
    werteVon(z => zahlOderNull(z.SCCM_RAMGB)), "GB", true, 0));
  kVergleich.appendChild(vergleichsZeile("CPU-Kerne",
    zahlOderNull(zeile.SCCM_CPUCores),
    werteVon(z => zahlOderNull(z.SCCM_CPUCores)), "", true, 0));
  kVergleich.appendChild(vergleichsZeile("Tage seit letzter Aktivität",
    Hilfe.tageHer(zeile.SCCM_LastActive),
    werteVon(z => Hilfe.tageHer(z.SCCM_LastActive)), "Tage", false, 0));
  kVergleich.appendChild(vergleichsZeile("Alter seit OS-Installation",
    Hilfe.tageHer(zeile.SCCM_OSInstallDate),
    werteVon(z => Hilfe.tageHer(z.SCCM_OSInstallDate)), "Tage", false, 0));
  kVergleich.appendChild(vergleichsZeile("Alter des AD-Computerkontos",
    Hilfe.tageHer(zeile.SCCM_ADCreated),
    werteVon(z => Hilfe.tageHer(z.SCCM_ADCreated)), "Tage", false, 0));
  kVergleich.appendChild(vergleichsZeile("Anzahl installierte Software",
    zahlOderNull(zeile.SCCM_InstalledSoftwareCount),
    werteVon(z => zahlOderNull(z.SCCM_InstalledSoftwareCount)), "", true, 0));
  gitter.appendChild(kVergleich);

  function gruppenKarte(titel, feld, wertText) {
    const gleiche = geraete.filter(z => String(z[feld] || "").trim() === String(wertText || "").trim());
    const k = karte(titel);
    if (!wertText) {
      k.appendChild(leerHinweis("Kein Wert hinterlegt, deshalb kein Vergleich."));
      return k;
    }
    const online = gleiche.filter(z => Hilfe.istJa(z.SCCM_Online)).length;
    const freie = [];
    for (const z of gleiche) {
      const v = zahlOderNull(z.SCCM_DiskCFreeGB);
      if (v !== null) freie.push(v);
    }
    const kacheln = el("div", "g-kacheln");
    kacheln.appendChild(kachel(wertText, String(gleiche.length), "Geräte"));
    kacheln.appendChild(kachel("davon online", String(online), "laut SCCM"));
    kacheln.appendChild(kachel("Median freier Speicher",
      freie.length ? Hilfe.zahlText(median(freie), 1) + " GB" : "", "auf Laufwerk C:"));
    k.appendChild(kacheln);
    return k;
  }

  gitter.appendChild(gruppenKarte("Geräte mit demselben Modell", "SCCM_Model", zeile.SCCM_Model));
  gitter.appendChild(gruppenKarte("Geräte derselben Firma", "Firma", textWert("Firma")));
  gitter.appendChild(gruppenKarte("Geräte im selben Gebäude / Stock", "GebaeudeStock",
    textWert("GebaeudeStock")));

  ziel.appendChild(gitter);
}

/* ---------- Alle Felder ---------- */

function bereichFelder(ziel) {
  const k = karte("Alle Felder", "Der vollständige Datensatz dieser Zeile, "
    + "gruppiert wie in der SharePoint-Liste.", true);

  const werkzeuge = el("div", "g-werkzeuge");
  const suche = el("input", "g-suche");
  suche.type = "search";
  suche.placeholder = "Feld oder Wert suchen …";
  suche.value = rohSuche;
  suche.autocomplete = "off";
  suche.addEventListener("input", function () {
    rohSuche = suche.value;
    zeichneBereich(true);
  });
  werkzeuge.appendChild(suche);

  const leereLabel = el("label", "g-schalterchen");
  const hk = el("input");
  hk.type = "checkbox";
  hk.checked = rohLeereZeigen;
  hk.addEventListener("change", function () {
    rohLeereZeigen = hk.checked;
    zeichneBereich(false);
  });
  leereLabel.appendChild(hk);
  leereLabel.appendChild(document.createTextNode("leere Felder zeigen"));
  werkzeuge.appendChild(leereLabel);

  werkzeuge.appendChild(knopf("Alles als JSON kopieren", null, function () {
    const roh = {};
    roh.id = zeile.id;
    for (const s of SPALTEN) roh[s.i] = wert(s.i);
    kopieren(JSON.stringify(roh, null, 2), "Datensatz als JSON kopiert.");
  }));
  k.appendChild(werkzeuge);

  const suchtext = rohSuche.trim().toLowerCase();
  let gezeigt = 0;

  for (const gruppe of GRUPPEN) {
    const spalten = SPALTEN.filter(function (s) {
      if (s.g !== gruppe) return false;
      const w = wert(s.i);
      const leer = w === null || w === undefined || w === "" || w === false;
      if (leer && !rohLeereZeigen) return false;
      if (!suchtext) return true;
      return s.d.toLowerCase().indexOf(suchtext) > -1
        || s.i.toLowerCase().indexOf(suchtext) > -1
        || String(w === false ? "nein" : w).toLowerCase().indexOf(suchtext) > -1;
    });
    if (!spalten.length) continue;
    gezeigt += spalten.length;
    k.appendChild(el("h3", null, gruppe));

    for (const s of spalten) {
      const z = el("div", "g-roh-zeile");
      const name = el("div", "g-roh-name", s.d);
      name.appendChild(el("span", "g-roh-intern", s.i + " · " + s.t
        + " · " + (s.q === "sccm" ? "aus SCCM" : "von Hand")));
      z.appendChild(name);

      const roh = wert(s.i);
      let text;
      if (s.t === "Boolean") text = Hilfe.istJa(roh) ? "Ja" : "Nein";
      else if (s.t === "DateTime" && roh) text = Hilfe.datumZeitText(roh) + " (" + Hilfe.relativText(roh) + ")";
      else text = (roh === null || roh === undefined) ? "" : String(roh);
      const wertKnoten = el("div", "g-roh-wert", text === "" ? "—" : text);
      z.appendChild(wertKnoten);

      const kopierKnopf = knopf("Wert kopieren", null, function () {
        kopieren(text, "«" + s.d + "» kopiert.");
      });
      // Der kleine Knopf soll nicht wie ein grosser Knopf aussehen.
      kopierKnopf.className = "g-kopierknopf";
      z.appendChild(kopierKnopf);
      k.appendChild(z);
    }
  }
  if (!gezeigt) k.appendChild(leerHinweis("Kein Feld passt zur Suche."));
  ziel.appendChild(k);
}

/* In die Zwischenablage, mit Rückfall für Browser ohne Clipboard-API. */
function kopieren(text, meldung) {
  const fertig = function () { toast(meldung || "In die Zwischenablage kopiert."); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(fertig, function () {
      toast("Kopieren nicht möglich. Bitte den Wert von Hand markieren.", true);
    });
    return;
  }
  toast("Dieser Browser erlaubt kein Kopieren aus dem Skript.", true);
}


/* ==================================================================
   7. Kopfzeile, Navigation und Aktionen
   ================================================================== */

function anzeigeName() {
  if (neuModus) return textWert("Title").trim() || "Neues Gerät";
  return textWert("Title").trim() || "(ohne Namen)";
}

function titelZeichnen() {
  const name = anzeigeName();
  $("g-titel").textContent = name;
  document.title = name + " – Computer Inventar";
}

function kopfZeichnen() {
  titelZeichnen();

  const unter = [];
  if (neuModus) {
    unter.push("Neue Zeile, noch nicht gespeichert");
  } else {
    if (textWert("Arbeitsplatz")) unter.push(textWert("Arbeitsplatz"));
    if (textWert("Firma")) unter.push(textWert("Firma"));
    if (textWert("GebaeudeStock")) unter.push(textWert("GebaeudeStock"));
    if (zeile && zeile.__art) unter.push(zeile.__art);
    if (zeile && zeile.id) unter.push("Listen-ID " + zeile.id);
  }
  $("g-unter").textContent = unter.join(" · ");

  const badges = leeren($("g-badges"));
  if (!neuModus && zeile) {
    const inSccm = Hilfe.istJa(zeile.SCCM_Found);
    badges.appendChild(badge(Hilfe.istJa(zeile.SCCM_Online) ? "Online" : "Offline",
      Hilfe.istJa(zeile.SCCM_Online) ? "gruen" : null));
    badges.appendChild(badge(inSccm ? "In SCCM" : "Nicht in SCCM", inSccm ? "gruen" : "gelb"));
    if (inSccm) {
      badges.appendChild(badge(Hilfe.istJa(zeile.SCCM_ClientActive) ? "Client aktiv" : "Client inaktiv",
        Hilfe.istJa(zeile.SCCM_ClientActive) ? "gruen" : "gelb"));
      if (Hilfe.istJa(zeile.SCCM_CoManaged)) badges.appendChild(badge("Co-Managed", "blau"));
      if (Hilfe.istJa(zeile.SCCM_IsVirtual)) badges.appendChild(badge("Virtuell", "blau"));
      const punkte = score(auffaelligkeiten());
      badges.appendChild(badge("Score " + punkte, scoreFarbe(punkte)));
    }
    if (zeile.__art !== "Gerät") badges.appendChild(badge(zeile.__art, "blau"));
  }

  aktionenZeichnen();
  geschwisterZeichnen();
}

function aktionenZeichnen() {
  const ziel = leeren($("g-aktionen"));
  if (geloescht) return;

  if (!neuModus) {
    ziel.appendChild(knopf(bearbeiten ? "Fertig" : "Bearbeiten",
      bearbeiten ? null : "knopf-primaer", function () {
        if (bearbeiten) bearbeitungBeenden();
        else { bearbeiten = true; zeichnenAlles(); }
      }));
  }

  ziel.appendChild(knopf("Neu laden", null, function () {
    if (anzahlAenderungen() && !window.confirm(
        "Es gibt ungespeicherte Änderungen. Beim Neuladen gehen sie verloren. Trotzdem neu laden?")) return;
    entwurf = {};
    neuLaden();
  }));

  if (!neuModus && !mockModus && zeile && zeile.id) {
    const verweis = el("a", "knopf", "In SharePoint öffnen");
    verweis.href = KONFIG.sharepointElementUrl(zeile.id);
    verweis.target = "_blank";
    verweis.rel = "noopener";
    ziel.appendChild(verweis);
  }

  if (!neuModus) {
    ziel.appendChild(knopf("Duplizieren", null, function () {
      const adresse = "geraet.html?neu=1&vorlage=" + encodeURIComponent(zeile.id)
        + (mockModus ? "&mock=1" : "");
      window.open(adresse, "geraet-neu");
    }));
  }

  ziel.appendChild(knopf("Link kopieren", null, function () {
    kopieren(location.href, "Adresse dieses Fensters kopiert.");
  }));

  ziel.appendChild(knopf("Drucken", null, function () { window.print(); }));

  if (!neuModus) {
    ziel.appendChild(knopf("Löschen", "knopf-still", loeschenDialog));
  }
}

/* Weitere Benutzerzeilen desselben Geräts. */
function geschwisterZeichnen() {
  const leiste = $("g-geschwister");
  leeren(leiste);
  if (neuModus || !zeile || !zeile.__geraet) { leiste.hidden = true; return; }

  const verwandte = alleZeilen.filter(z => z.__geraet && z.__geraet === zeile.__geraet);
  if (verwandte.length < 2) { leiste.hidden = true; return; }

  leiste.hidden = false;
  leiste.appendChild(document.createTextNode(
    verwandte.length + " Benutzerzeilen zum Gerät «" + zeile.__geraet + "»:"));
  for (const v of verwandte) {
    const beschriftung = (v.Arbeitsplatz || v.Title || "(ohne Namen)")
      + (v.__istGeteilt ? " (geteilt)" : "");
    const k = el("button", "g-geschwister-knopf", beschriftung);
    k.type = "button";
    if (String(v.id) === String(zeile.id)) k.setAttribute("aria-current", "true");
    k.addEventListener("click", function () {
      if (String(v.id) === String(zeile.id)) return;
      if (anzahlAenderungen() && !window.confirm(
          "Es gibt ungespeicherte Änderungen. Beim Wechsel gehen sie verloren. Trotzdem wechseln?")) return;
      entwurf = {};
      elementId = String(v.id);
      history.replaceState(null, "", adresseFuer(elementId));
      zeile = alleZeilen.filter(z => String(z.id) === elementId)[0] || zeile;
      bearbeiten = false;
      zeichnenAlles();
    });
    leiste.appendChild(k);
  }
}

function adresseFuer(id) {
  return "geraet.html?id=" + encodeURIComponent(id) + (mockModus ? "&mock=1" : "");
}

function navZeichnen() {
  const nav = leeren($("g-nav"));
  nav.hidden = false;
  const anzahlBefunde = (!neuModus && zeile) ? auffaelligkeiten().length : 0;

  for (const b of sichtbareBereiche()) {
    const k = el("button", "g-nav-knopf" + (b.k === aktiverBereich ? " aktiv" : ""));
    k.type = "button";
    k.appendChild(document.createTextNode(b.d));
    if (b.k === "uebersicht" && anzahlBefunde) {
      k.appendChild(el("span", "g-nav-zahl", String(anzahlBefunde)));
    }
    k.addEventListener("click", function () {
      aktiverBereich = b.k;
      location.hash = "#" + b.k;
      navZeichnen();
      zeichneBereich(false);
    });
    nav.appendChild(k);
  }
}

/* Zeichnet den aktiven Bereich neu. «fokusHalten» setzt den Fokus danach
   zurück auf das zuletzt benutzte Suchfeld, damit Tippen nicht abreisst. */
function zeichneBereich(fokusHalten) {
  const vorher = document.activeElement;
  const vorherId = vorher && vorher.id ? vorher.id : null;
  const vorherKlasse = vorher && vorher.className ? vorher.className : "";
  const vorherPlatzhalter = vorher && vorher.placeholder ? vorher.placeholder : "";

  const ziel = leeren($("g-bereich"));
  ziel.hidden = false;
  const bereich = sichtbareBereiche().filter(b => b.k === aktiverBereich)[0]
    || sichtbareBereiche()[0];
  aktiverBereich = bereich.k;
  bereich.f(ziel);

  if (fokusHalten && vorherKlasse.indexOf("g-suche") > -1) {
    const felder = ziel.querySelectorAll("input.g-suche");
    for (const f of felder) {
      if (f.placeholder === vorherPlatzhalter || f.id === vorherId) {
        f.focus();
        const laenge = f.value.length;
        try { f.setSelectionRange(laenge, laenge); } catch (e) { /* type=search mag das nicht überall */ }
        break;
      }
    }
  }
}

function zeichnenAlles() {
  kopfZeichnen();
  navZeichnen();
  zeichneBereich(false);
  speicherleisteZeichnen();
}


/* ==================================================================
   8. Laden, Speichern, Anlegen, Löschen
   ================================================================== */

function zeigeLaden(text) {
  $("g-laden-text").textContent = text;
  $("g-laden").hidden = false;
  $("g-fehler").hidden = true;
  $("g-bereich").hidden = true;
  $("g-nav").hidden = true;
}

function zeigeFehler(titel, text, hinweis, knopfText, beiKlick) {
  $("g-fehler-titel").textContent = titel;
  $("g-fehler-text").textContent = text;
  $("g-fehler-hinweis").textContent = hinweis || "";
  const k = $("g-knopf-nochmal");
  k.textContent = knopfText || "Nochmals versuchen";
  k.onclick = beiKlick || neuLaden;
  $("g-laden").hidden = true;
  $("g-fehler").hidden = false;
  $("g-bereich").hidden = true;
  $("g-nav").hidden = true;
  $("g-speicherleiste").hidden = true;
}

function zeigeInhalt() {
  $("g-laden").hidden = true;
  $("g-fehler").hidden = true;
}

/* Eine leere Zeile mit allen Spalten, für «Neues Gerät». */
function leereZeile() {
  const z = {};
  for (const s of SPALTEN) z[s.i] = s.t === "Boolean" ? false : "";
  z.id = null;
  return z;
}

/* «still» lädt im Hintergrund nach, ohne die Seite gegen den Spinner zu
   tauschen: nach dem Speichern soll der Inhalt stehen bleiben. */
async function datenLaden(still) {
  if (!still) {
    zeigeLaden(mockModus ? "Vorführdaten werden aufgebaut …"
                         : "Daten werden aus SharePoint geladen …");
  }
  const roh = await Quelle.alleZeilen(function (n) {
    if (still) return;
    $("g-laden-text").textContent = "Daten werden aus SharePoint geladen … (" + n + " Zeilen)";
  });
  alleZeilen = anreichern(roh);
}

function zeileWaehlen() {
  if (neuModus) {
    const grund = leereZeile();
    if (vorlageId) {
      const vorlage = alleZeilen.filter(z => String(z.id) === String(vorlageId))[0];
      if (vorlage) {
        for (const s of SPALTEN) {
          if (!istBearbeitbar(s)) continue;
          if (NICHT_DUPLIZIEREN.indexOf(s.i) > -1) continue;
          grund[s.i] = vorlage[s.i];
        }
      }
    }
    zeile = anreichern([grund])[0];
    bearbeiten = true;
    return;
  }

  const treffer = alleZeilen.filter(z => String(z.id) === String(elementId))[0];
  if (!treffer) {
    const fehler = new Error("Zur Listen-ID " + elementId + " gibt es keine Zeile. "
      + "Vermutlich wurde sie inzwischen gelöscht.");
    fehler.status = 404;
    throw fehler;
  }
  zeile = treffer;
}

async function neuLaden() {
  try {
    await datenLaden();
    zeileWaehlen();
    zeigeInhalt();
    zeichnenAlles();
  } catch (fehler) {
    const meldung = fehler && fehler.message ? fehler.message : String(fehler);
    zeigeFehler("Die Daten konnten nicht geladen werden", meldung,
      mockModus ? "" : "Zum Anschauen ohne Anmeldung dieses Fenster mit &mock=1 aufrufen.");
  }
}

/* ---------- Prüfen ---------- */

function pruefen() {
  const name = textWert("Title").trim();
  if (!name) {
    return "Der PC-Name darf nicht leer sein. Wer kein Gerät hat, bekommt die "
      + "Zeile «Kein PC».";
  }
  return "";
}

/* Werte so aufbereiten, wie Graph sie erwartet. */
function fuerGraph(feld, roh) {
  const spalte = SPALTE[feld];
  if (!spalte) return roh;
  if (spalte.t === "Boolean") return !!roh;
  if (spalte.t === "Number") {
    if (roh === "" || roh === null || roh === undefined) return null;
    const n = Number(roh);
    return isNaN(n) ? null : n;
  }
  return (roh === null || roh === undefined) ? "" : String(roh);
}

async function speichern() {
  if (speichertGerade) return;
  const fehler = pruefen();
  if (fehler) {
    speicherFehler = fehler;
    speicherleisteZeichnen();
    toast(fehler, true);
    const feld = $("g-eingabe-Title");
    if (feld) { feld.classList.add("g-ungueltig"); feld.focus(); }
    return;
  }

  const felder = {};
  if (neuModus) {
    // Beim Anlegen alle bearbeitbaren Spalten mitgeben, damit die Zeile
    // vollständig ist und nicht halb leer in der Liste steht.
    for (const s of SPALTEN) {
      if (!istBearbeitbar(s)) continue;
      felder[s.i] = fuerGraph(s.i, wert(s.i));
    }
  } else {
    for (const feld in entwurf) felder[feld] = fuerGraph(feld, entwurf[feld]);
  }

  speichertGerade = true;
  speicherFehler = "";
  speicherleisteZeichnen();

  try {
    if (neuModus) {
      const neueZeile = await Quelle.anlegen(felder);
      elementId = String(neueZeile.id);
      neuModus = false;
      entwurf = {};
      history.replaceState(null, "", adresseFuer(elementId));
      melden("zeile-neu", elementId);
      speichertGerade = false;
      await datenLaden(true);
      zeileWaehlen();
      bearbeiten = false;
      zeigeInhalt();
      zeichnenAlles();
      toast("Gerät angelegt.");
      return;
    }

    await Quelle.speichern(elementId, felder);
    const anzahl = anzahlAenderungen();
    entwurf = {};
    melden("zeile-geaendert", elementId);
    speichertGerade = false;
    await datenLaden(true);
    zeileWaehlen();
    zeigeInhalt();
    zeichnenAlles();
    toast(anzahl === 1 ? "Änderung gespeichert." : anzahl + " Änderungen gespeichert.");

  } catch (e) {
    speichertGerade = false;
    speicherFehler = e && e.message ? e.message : String(e);
    speicherleisteZeichnen();
    toast("Speichern fehlgeschlagen. " + speicherFehler, true);
  }
}

function verwerfen() {
  if (!anzahlAenderungen()) return;
  const text = neuModus
    ? "Alle Eingaben dieses Formulars verwerfen?"
    : anzahlAenderungen() + " Änderung(en) verwerfen?";
  if (!window.confirm(text)) return;
  entwurf = {};
  speicherFehler = "";
  zeichnenAlles();
  toast("Änderungen verworfen.");
}

function bearbeitungBeenden() {
  if (anzahlAenderungen()) {
    if (!window.confirm("Es gibt ungespeicherte Änderungen. Bearbeitung beenden "
        + "und Änderungen verwerfen?")) return;
    entwurf = {};
    speicherFehler = "";
  }
  bearbeiten = false;
  zeichnenAlles();
}

/* ---------- Löschen ---------- */

function dialogSchliessen() {
  $("g-dialog").hidden = true;
  $("g-dialog-hintergrund").hidden = true;
  leeren($("g-dialog-inhalt"));
  leeren($("g-dialog-knoepfe"));
}

function loeschenDialog() {
  const name = anzeigeName();
  $("g-dialog-titel").textContent = "Gerät löschen";

  const inhalt = leeren($("g-dialog-inhalt"));
  inhalt.appendChild(el("p", null,
    "Die Zeile wird aus der Liste entfernt und landet im Papierkorb der "
    + "SharePoint-Site. Von dort lässt sie sich 93 Tage lang zurückholen."));
  inhalt.appendChild(el("p", null,
    "Zur Bestätigung bitte den PC-Namen genau abtippen: " + name));

  const feld = el("input", "g-eingabe");
  feld.type = "text";
  feld.autocomplete = "off";
  feld.setAttribute("aria-label", "PC-Name zur Bestätigung");
  inhalt.appendChild(feld);

  const knoepfe = leeren($("g-dialog-knoepfe"));
  knoepfe.appendChild(knopf("Abbrechen", null, dialogSchliessen));
  const loeschen = knopf("Endgültig löschen", "knopf-gefahr", async function () {
    loeschen.disabled = true;
    loeschen.textContent = "Wird gelöscht …";
    try {
      await Quelle.loeschen(zeile.id);
      melden("zeile-geloescht", zeile.id);
      geloescht = true;
      entwurf = {};
      dialogSchliessen();
      zeigeFehler("Gerät gelöscht",
        "«" + name + "» wurde aus der Liste entfernt und liegt im Papierkorb "
        + "der SharePoint-Site.",
        "Dieses Fenster wird nicht mehr gebraucht.",
        "Fenster schliessen", function () { window.close(); });
      leeren($("g-aktionen"));
    } catch (e) {
      loeschen.disabled = false;
      loeschen.textContent = "Endgültig löschen";
      toast("Löschen fehlgeschlagen. " + (e && e.message ? e.message : e), true);
    }
  });
  loeschen.disabled = true;
  knoepfe.appendChild(loeschen);

  feld.addEventListener("input", function () {
    loeschen.disabled = feld.value.trim().toLowerCase() !== name.trim().toLowerCase();
  });

  $("g-dialog-hintergrund").hidden = false;
  $("g-dialog").hidden = false;
  feld.focus();
}


/* ==================================================================
   9. Start und Tastatur
   ================================================================== */

function hashLesen() {
  const h = (location.hash || "").replace(/^#/, "");
  if (h && BEREICHE.some(b => b.k === h)) aktiverBereich = h;
}

function bandZeichnen() {
  if (!mockModus) return;
  const band = $("g-band");
  band.hidden = false;
  band.appendChild(document.createTextNode(
    "Vorführmodus (?mock=1): alle Personen, Geräte und Zahlen sind erfunden. "
    + "Änderungen bleiben im Browser und gehen nie nach SharePoint."));
  band.appendChild(knopf("Vorführ-Änderungen zurücksetzen", null, function () {
    if (!window.confirm("Alle im Vorführmodus gemachten Änderungen verwerfen?")) return;
    Mock.zuruecksetzen();
    entwurf = {};
    melden("zeile-geaendert", elementId);
    neuLaden();
  }));
}

async function start() {
  hashLesen();
  bandZeichnen();

  try {
    if (!mockModus) {
      zeigeLaden("Anmeldung wird geprüft …");
      await Auth.anmeldungSicherstellen();
    }
    if (!neuModus && !elementId) {
      zeigeFehler("Kein Gerät angegeben",
        "Dieses Fenster braucht die Listen-ID in der Adresse, zum Beispiel "
        + "geraet.html?id=5.",
        "Normalerweise wird es aus der Geräteliste heraus geöffnet.");
      return;
    }
    await datenLaden();
    zeileWaehlen();
    zeigeInhalt();
    zeichnenAlles();

  } catch (fehler) {
    const meldung = fehler && fehler.message ? fehler.message : String(fehler);
    zeigeFehler("Die Daten konnten nicht geladen werden", meldung,
      mockModus ? "" : "Zum Anschauen ohne Anmeldung dieses Fenster mit &mock=1 aufrufen.");
  }
}

/* ---------- Ereignisse ---------- */

$("g-knopf-speichern").addEventListener("click", speichern);
$("g-knopf-verwerfen").addEventListener("click", verwerfen);
$("g-dialog-hintergrund").addEventListener("click", dialogSchliessen);

window.addEventListener("hashchange", function () {
  const h = (location.hash || "").replace(/^#/, "");
  if (h && h !== aktiverBereich && BEREICHE.some(b => b.k === h)) {
    aktiverBereich = h;
    navZeichnen();
    zeichneBereich(false);
  }
});

document.addEventListener("keydown", function (e) {
  // Ctrl+S beziehungsweise Cmd+S speichert.
  if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
    e.preventDefault();
    if (bearbeiten || neuModus) speichern();
    return;
  }
  if (e.key === "Escape") {
    if (!$("g-dialog").hidden) { dialogSchliessen(); return; }
    if (neuModus) return;                // ein leeres Formular gibt es nicht zu verlassen
    if (bearbeiten) { e.preventDefault(); bearbeitungBeenden(); }
  }
});

window.addEventListener("beforeunload", function (e) {
  if (!anzahlAenderungen() || geloescht) return;
  e.preventDefault();
  // Der Text stammt vom Browser; zurückgeben muss man trotzdem etwas.
  e.returnValue = "";
  return "";
});

start();

})();

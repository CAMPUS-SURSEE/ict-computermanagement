/* benutzer.js — Benutzerfenster des Computer Inventars (Spezifikation 3.4).

   Wird von der Hauptseite mit window.open("benutzer.html?id=…") geöffnet und
   zeigt eine einzelne Zeile der Benutzer-Liste in vier Abschnitten:

     Übersicht        AD-Felder (schreibgeschützt), Gerät, Kennzahlen
     Gerät            Zuordnung ändern, lösen, SCCM-Primärgerät übernehmen
     Berechtigungen   alle Programme aus programme.json, Tri-State-Schalter
     Bemerkung        freier Text

   Bearbeitbar sind genau «Computer», «Bemerkung» und die Programmspalten mit
   Stufe 0 oder 1. Alles, was aus dem Active Directory oder aus SCCM kommt,
   ist schreibgeschützt — der Abgleich überschreibt es ohnehin bei jedem Lauf.
   Programme der Stufe 2 stammen aus einer AD-Gruppe und lassen sich hier
   nicht ändern; geschrieben werden nur «0» und «1», nie «2».

   Benutzer werden weder angelegt noch gelöscht; das macht der AD-Sync.

   Grundsätze wie in den anderen Fenstern: kein Framework, keine globalen
   Variablen ausser den Modulen der anderen Dateien, kein Inline-Script und
   niemals innerHTML mit Daten — jeder Wert geht über textContent in die
   Seite. */

"use strict";

(function () {

/* ==================================================================
   1. Parameter und Spaltenwissen
   ================================================================== */

const ABFRAGE = new URLSearchParams(location.search);
const mockModus = ABFRAGE.get("mock") === "1";
const elementId = ABFRAGE.get("id");

/* Anhang für Links in andere Fenster, damit der Vorführmodus erhalten bleibt. */
const MOCK_ANHANG = mockModus ? "&mock=1" : "";

const SPALTE = {};
for (const s of SPALTEN_BENUTZER) SPALTE[s.i] = s;

/* Die Felder, die im Abschnitt «Übersicht» als AD-Angaben erscheinen. */
const AD_SPALTEN = SPALTEN_BENUTZER.filter(s => s.q === "ad");

/* Spalten, die dieses Fenster schreiben darf. Programmspalten kommen zur
   Laufzeit aus programme.json dazu und werden getrennt behandelt. */
function istBearbeitbar(spalte) {
  return !!spalte && spalte.q === "manuell";
}


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

function leeren(knoten) {
  while (knoten.firstChild) knoten.removeChild(knoten.firstChild);
  return knoten;
}

function knopf(beschriftung, klasse, beiKlick) {
  const k = el("button", "knopf" + (klasse ? " " + klasse : ""), beschriftung);
  k.type = "button";
  if (beiKlick) k.addEventListener("click", beiKlick);
  return k;
}

function text(wertRoh) {
  return (wertRoh === null || wertRoh === undefined || wertRoh === false)
    ? "" : String(wertRoh);
}


/* ==================================================================
   3. Zustand, Entwurf, Speicherleiste, Toast
   ================================================================== */

let alleBenutzer = [];
let alleComputer = [];
let programmDatei = null;
let pSpalten = [];          // Programmspalten aus programme.json
let pSpalte = {};           // id -> Spalte
let kategorien = [];        // Reihenfolge der Kategorien

let zeile = null;           // die Zeile dieses Fensters (angereichert)
let entwurf = {};           // geänderte, noch nicht gespeicherte Felder
let speichertGerade = false;
let speicherFehler = "";

/* Zustände innerhalb der Abschnitte. */
let geraeteSuche = "";
let rechteSuche = "";
let nurAktive = false;

let aktiverBereich = "uebersicht";

const BEREICHE = [
  { k: "uebersicht",     d: "Übersicht",      f: bereichUebersicht },
  { k: "geraet",         d: "Gerät",          f: bereichGeraet },
  { k: "berechtigungen", d: "Berechtigungen", f: bereichBerechtigungen },
  { k: "bemerkung",      d: "Bemerkung",      f: bereichBemerkung }
];


/* ---------- Werte lesen und schreiben ---------- */

/* Der anzuzeigende Wert: Entwurf schlägt gespeicherten Wert. */
function wert(feld) {
  if (Object.prototype.hasOwnProperty.call(entwurf, feld)) return entwurf[feld];
  return zeile ? zeile[feld] : "";
}

function textWert(feld) {
  return text(wert(feld));
}

/* Hin und Her soll wieder als unverändert gelten. */
function gleichwertig(a, b) {
  const nA = (a === null || a === undefined || a === false) ? "" : a;
  const nB = (b === null || b === undefined || b === false) ? "" : b;
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

/* Stufe eines Programms unter Berücksichtigung des Entwurfs. */
function programmStufe(id) {
  return Modell.stufe(wert(id));
}


/* ---------- Speicherleiste ---------- */

function speicherleisteZeichnen() {
  const leiste = $("b-speicherleiste");
  const anzahl = anzahlAenderungen();
  const zeigen = anzahl > 0 || speichertGerade;
  leiste.hidden = !zeigen;
  if (!zeigen) return;

  $("b-speicher-text").textContent = speichertGerade
    ? "Wird gespeichert …"
    : (anzahl === 1 ? "1 Änderung" : anzahl + " Änderungen");

  const fehlerFeld = $("b-speicher-fehler");
  fehlerFeld.textContent = speicherFehler;
  fehlerFeld.hidden = !speicherFehler;

  const speichern = $("b-knopf-speichern");
  speichern.textContent = speicherFehler ? "Nochmals speichern" : "Speichern";
  speichern.disabled = speichertGerade || anzahl === 0;

  const verwerfen = $("b-knopf-verwerfen");
  verwerfen.disabled = speichertGerade || anzahl === 0;
}


/* ---------- Toast ---------- */

let toastZeit = null;

function toast(meldung, istFehler) {
  const t = $("b-toast");
  t.textContent = meldung;
  t.className = "toast" + (istFehler ? " toast-fehler" : "");
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
    // Hauptseite bis zum nächsten automatischen Takt auf dem alten Stand.
  }
}


/* ==================================================================
   4. Bausteine
   ================================================================== */

function karte(titel, unter) {
  const k = el("section", "karte");
  if (titel || unter) {
    const kopf = el("div", "karte-kopf");
    const zeileKopf = el("div", "karte-kopf-zeile");
    const links = el("div");
    if (titel) links.appendChild(el("h2", "karte-titel", titel));
    if (unter) links.appendChild(el("p", "karte-unter", unter));
    zeileKopf.appendChild(links);
    kopf.appendChild(zeileKopf);
    k.appendChild(kopf);
    k.kopfZeile = zeileKopf;
  }
  const inhalt = el("div", "karte-inhalt");
  k.appendChild(inhalt);
  k.inhalt = inhalt;
  return k;
}

function kachel(wertText, beschriftung, unter, ton) {
  const k = el("div", "kachel" + (ton ? " ton-" + ton : ""));
  k.setAttribute("data-klickbar", "nein");
  k.appendChild(el("div", "kachel-wert", wertText));
  k.appendChild(el("div", "kachel-text", beschriftung));
  if (unter) k.appendChild(el("div", "kachel-unter", unter));
  return k;
}

/* Ein schreibgeschütztes Feldpaar mit Schloss-Symbol. */
function feldGesperrt(beschriftung, wertText) {
  const f = el("div", "datenzeile");
  const label = el("div", "datenzeile-name");
  label.appendChild(el("span", "schloss"));
  label.appendChild(document.createTextNode(beschriftung));
  label.title = "Kommt aus dem Abgleich und lässt sich hier nicht ändern.";
  f.appendChild(label);
  const w = text(wertText);
  f.appendChild(el("div", "datenzeile-wert" + (w ? "" : " leer"), w || "—"));
  return f;
}

/* Ein Feldpaar, dessen Wert frei aufgebaut wird (Link, Chips, Knöpfe). */
function feldFrei(beschriftung, knoten, mitSchloss) {
  const f = el("div", "datenzeile");
  const label = el("div", "datenzeile-name");
  if (mitSchloss) label.appendChild(el("span", "schloss"));
  label.appendChild(document.createTextNode(beschriftung));
  f.appendChild(label);
  const wrap = el("div", "datenzeile-wert");
  wrap.appendChild(knoten);
  f.appendChild(wrap);
  return f;
}

/* Ein kleiner Chip für den Gerätestatus, oder null bei «Aktiv» — der
   Normalfall braucht keine Auszeichnung. */
function statusMarke(computerZeile) {
  const status = Modell.status(computerZeile && computerZeile.Status);
  if (status === "Aktiv") return null;
  const c = el("span", "chip " + (status === "Archiviert" ? "chip-leise" : "chip-info"),
    status);
  c.title = status === "Archiviert"
    ? "Dieses Gerät ist archiviert und in der Geräteliste ausgeblendet."
    : "Dieses Gerät liegt im Lager.";
  return c;
}

/* Link in das Gerätefenster. Öffnet je Gerät ein eigenes Fenster.
   Geöffnet wird immer über die Listen-ID, nie über den Namen: Namen sind
   nicht eindeutig.

   Ist das Gerät nicht «Aktiv», steht der Status daneben — sonst wundert
   man sich, warum es in der Geräteliste nicht auftaucht. */
function geraetLink(computerZeile) {
  const huelle = el("span", "b-geraetlink");
  const a = el("a", "name-link", computerZeile.Title);
  a.href = "geraet.html?id=" + encodeURIComponent(computerZeile.id) + MOCK_ANHANG;
  a.target = "geraet-" + computerZeile.id;
  a.title = "Listen-ID " + computerZeile.id + " — Gerätefenster öffnen";
  huelle.appendChild(a);

  const marke = statusMarke(computerZeile);
  if (marke) {
    huelle.appendChild(document.createTextNode(" "));
    huelle.appendChild(marke);
  }
  return huelle;
}

function suchfeld(id, platzhalter, startwert, beiEingabe) {
  const wrap = el("div", "suchfeld");
  const eingabe = el("input", "suche");
  eingabe.type = "search";
  eingabe.id = id;
  eingabe.placeholder = platzhalter;
  eingabe.autocomplete = "off";
  eingabe.value = startwert;
  eingabe.setAttribute("aria-label", platzhalter);
  eingabe.addEventListener("input", function () { beiEingabe(eingabe.value); });
  wrap.appendChild(eingabe);
  return wrap;
}


/* ==================================================================
   5. Auswertung
   ================================================================== */

/* Zählt die Berechtigungen nach Stufe (Entwurf eingerechnet). */
function rechteZaehlen() {
  let manuell = 0, ausAd = 0;
  for (const s of pSpalten) {
    const st = programmStufe(s.i);
    if (st === 1) manuell++;
    else if (st === 2) ausAd++;
  }
  return { manuell: manuell, ausAd: ausAd, aktiv: manuell + ausAd, gesamt: pSpalten.length };
}

/* Alle Geräte mit dem zugeordneten Namen.

   Die Zuordnung ist ein Freitext-Name, keine Verknüpfung auf die Listen-ID:
   heissen zwei Geräte gleich (etwa weil das ersetzte archiviert liegen
   bleibt), passen beide. Deshalb liefert diese Funktion eine Liste. */
function zugeordneteGeraete() {
  const name = textWert("Computer").trim();
  if (!name) return [];
  const k = Modell.schluessel(name);
  return alleComputer.filter(c => Modell.schluessel(c.Title) === k);
}

/* Das gemeinte Gerät, oder null. Bei mehreren gleichnamigen gewinnt das
   nicht archivierte — dieselbe Wahl trifft Modell.anreichern. */
function zugeordnetesGeraet() {
  const treffer = zugeordneteGeraete();
  return treffer.filter(c => !c.__archiviert)[0] || treffer[0] || null;
}

/* Hinweiszeile bei mehrdeutiger Zuordnung, sonst null. */
function mehrdeutigHinweis() {
  const treffer = zugeordneteGeraete();
  if (treffer.length < 2) return null;
  const gewaehlt = zugeordnetesGeraet();

  const kasten = el("div", "b-hinweis");
  kasten.appendChild(el("span", "t-warnung",
    treffer.length + " Geräte heissen «" + textWert("Computer").trim()
    + "». Die Zuordnung speichert nur den Namen und ist damit nicht "
    + "eindeutig; angezeigt wird das nicht archivierte Gerät."));
  const liste = el("div", "chips");
  for (const c of treffer) {
    const a = el("a", "chip" + (c === gewaehlt ? " chip-marke" : ""),
      "Listen-ID " + c.id + " · " + Modell.status(c.Status));
    a.href = "geraet.html?id=" + encodeURIComponent(c.id) + MOCK_ANHANG;
    a.target = "geraet-" + c.id;
    a.title = (c === gewaehlt ? "Wird hier angezeigt. " : "")
      + "Gerätefenster in eigenem Fenster öffnen";
    liste.appendChild(a);
  }
  kasten.appendChild(liste);
  return kasten;
}

/* Weicht das SCCM-Primärgerät von der Zuordnung ab? Der Entwurf zählt mit,
   damit der Hinweis verschwindet, sobald die Zuordnung korrigiert ist. */
function primaerAbweichung() {
  return Modell.primaerWeichtAb(zeile ? zeile.SCCMPrimaerGeraet : "",
                                textWert("Computer"));
}

/* Anzeigenamen der Benutzer, die einem Gerät zugeordnet sind — ohne die
   Person dieses Fensters, denn die steht ohnehin oben. */
function andereBenutzerVon(computerZeile) {
  return (computerZeile.__benutzer || [])
    .filter(b => String(b.id) !== String(zeile.id))
    .map(b => b.__name);
}


/* ==================================================================
   6. Die vier Abschnitte
   ================================================================== */

/* ---------- Übersicht ---------- */

function bereichUebersicht(ziel) {
  const zahlen = rechteZaehlen();

  // Kennzahlen
  const kacheln = el("div", "kacheln");
  kacheln.appendChild(kachel(String(zahlen.aktiv), "Berechtigungen aktiv",
    "von " + zahlen.gesamt + " Programmen", zahlen.aktiv ? "erfolg" : null));
  kacheln.appendChild(kachel(String(zahlen.manuell), "manuell gesetzt",
    "Stufe 1 — hier umschaltbar"));
  kacheln.appendChild(kachel(String(zahlen.ausAd), "aus AD-Gruppe",
    "Stufe 2 — gesperrt", zahlen.ausAd ? "info" : null));
  ziel.appendChild(kacheln);

  // Zuordnung
  const geraet = zugeordnetesGeraet();
  const name = textWert("Computer").trim();
  const kZuordnung = karte("Zuordnung", "Von Hand gepflegt, im Abschnitt «Gerät» änderbar.");
  const felder = el("div", "datenzeilen");

  if (geraet) {
    felder.appendChild(feldFrei("Computer", geraetLink(geraet)));
  } else if (name) {
    const hinweis = el("span", "t-warnung",
      name + " — kein Gerät mit diesem Namen in der Liste");
    felder.appendChild(feldFrei("Computer", hinweis));
  } else {
    felder.appendChild(feldFrei("Computer",
      el("span", "t-still", "kein Gerät zugeordnet")));
  }

  felder.appendChild(feldGesperrt("Primärgerät (SCCM)", zeile.SCCMPrimaerGeraet));
  kZuordnung.inhalt.appendChild(felder);

  const mehrdeutig = mehrdeutigHinweis();
  if (mehrdeutig) kZuordnung.inhalt.appendChild(mehrdeutig);

  if (primaerAbweichung()) {
    const hinweis = el("div", "b-hinweis");
    const primaer = text(zeile.SCCMPrimaerGeraet).trim();
    hinweis.appendChild(el("span", "t-warnung",
      "SCCM meldet «" + primaer + "» als Primärgerät"
      + (name ? ", zugeordnet ist «" + name + "»." : ", zugeordnet ist kein Gerät.")));
    hinweis.appendChild(knopf("Im Abschnitt «Gerät» klären", "knopf-leise", function () {
      bereichWechseln("geraet");
    }));
    kZuordnung.inhalt.appendChild(hinweis);
  }

  const gitter = el("div", "karten b-abstand");
  gitter.appendChild(kZuordnung);

  // AD-Felder, alle schreibgeschützt
  const kAd = karte("Angaben aus dem Active Directory",
    "Der Abgleich überschreibt diese Felder bei jedem Lauf.");
  const adFelder = el("div", "datenzeilen");
  for (const s of AD_SPALTEN) {
    const roh = zeile[s.i];
    const angezeigt = s.t === "DateTime" ? Hilfe.datumZeitText(roh) : text(roh);
    adFelder.appendChild(feldGesperrt(s.d, angezeigt));
  }
  kAd.inhalt.appendChild(adFelder);
  gitter.appendChild(kAd);

  ziel.appendChild(gitter);
}


/* ---------- Gerät ---------- */

/* Nach jeder Änderung der Zuordnung auch die Kopfzeile neu zeichnen: der
   Knopf «Gerät öffnen» hängt daran. */
function zuordnungSetzen(pcName) {
  setzeWert("Computer", pcName);
  kopfZeichnen();
  zeichneBereich();
}

function geraetZuordnen(computerZeile) {
  geraeteSuche = "";
  zuordnungSetzen(computerZeile.Title);
}

function geraetLoesen() {
  zuordnungSetzen("");
}

function bereichGeraet(ziel) {
  const geraet = zugeordnetesGeraet();
  const name = textWert("Computer").trim();

  const kAktuell = karte("Aktuelle Zuordnung",
    "Das Feld «Computer» der Benutzer-Liste. Ein Gerät kann mehrere Benutzer haben.");

  if (name) {
    const felder = el("div", "datenzeilen");
    if (geraet) {
      felder.appendChild(feldFrei("Computer", geraetLink(geraet)));
      const status = Modell.status(geraet.Status);
      const statusText = el("span", Modell.statusKlasse(status) || null, status);
      felder.appendChild(feldFrei("Status des Geräts", statusText, true));
      felder.appendChild(feldGesperrt("Modell", geraet.SCCM_Model));
      felder.appendChild(feldGesperrt("Gebäude / Stock", geraet.GebaeudeStock));
      const andere = andereBenutzerVon(geraet);
      felder.appendChild(feldGesperrt("Weitere Benutzer",
        andere.length ? andere.join(", ") : ""));
    } else {
      felder.appendChild(feldFrei("Computer",
        el("span", "t-warnung", name + " — kein Gerät mit diesem Namen in der Liste")));
    }
    kAktuell.inhalt.appendChild(felder);

    const mehrdeutig = mehrdeutigHinweis();
    if (mehrdeutig) kAktuell.inhalt.appendChild(mehrdeutig);

    const knoepfe = el("div", "karte-aktionen");
    knoepfe.appendChild(knopf("Zuordnung lösen", null, geraetLoesen));
    if (geraet) {
      knoepfe.appendChild(knopf("Gerät öffnen", null, function () {
        geraetFensterOeffnen(geraet);
      }));
    }
    kAktuell.inhalt.appendChild(knoepfe);
  } else {
    const leer = el("div", "leerzustand");
    leer.appendChild(el("p", "leer-titel", "Kein Gerät zugeordnet"));
    leer.appendChild(el("p", "leer-text",
      "Unten ein Gerät suchen und «Zuordnen» wählen."));
    kAktuell.inhalt.appendChild(leer);
  }

  // Vorschlag aus SCCM
  if (primaerAbweichung()) {
    const primaer = text(zeile.SCCMPrimaerGeraet).trim();
    const hinweis = el("div", "b-hinweis");
    hinweis.appendChild(el("span", "t-warnung",
      "SCCM meldet «" + primaer + "» als Primärgerät dieser Person."));
    hinweis.appendChild(knopf("SCCM-Primärgerät übernehmen", "knopf-primaer", function () {
      zuordnungSetzen(primaer);
    }));
    kAktuell.inhalt.appendChild(hinweis);
  }

  ziel.appendChild(kAktuell);

  // Suche über die Computer-Liste
  const kSuche = karte("Gerät zuordnen",
    "Suche über PC-Name, Modell, Seriennummer und Gebäude.");
  kSuche.inhalt.appendChild(suchfeld("b-suche-geraet", "Gerät suchen …", geraeteSuche,
    function (v) { geraeteSuche = v; zeichneBereich(); }));

  const suchbegriff = geraeteSuche.trim().toLowerCase();
  const treffer = alleComputer.filter(function (c) {
    if (!suchbegriff) return false;
    return String(c.__such || "").indexOf(suchbegriff) > -1;
    /* Archivierte Geräte zuletzt: sie sind zwar auffindbar, aber selten
       gemeint. */
  }).sort((a, b) => (a.__archiviert ? 1 : 0) - (b.__archiviert ? 1 : 0)
    || Hilfe.vergleiche(a.Title, b.Title));

  const liste = el("div", "b-treffer");
  if (!suchbegriff) {
    liste.appendChild(el("p", "hinweis",
      "Mindestens ein Zeichen eingeben. Die Liste umfasst "
      + alleComputer.length + " Geräte."));
  } else if (!treffer.length) {
    liste.appendChild(el("p", "hinweis", "Kein Gerät passt zur Suche."));
  } else {
    for (const c of treffer.slice(0, 40)) {
      /* «zugeordnet» darf nur an dem Gerät stehen, das die Zuordnung
         wirklich meint — bei gleichnamigen Geräten sonst an allen. */
      const gewaehlt = zugeordnetesGeraet();
      const istAktuell = !!gewaehlt && String(gewaehlt.id) === String(c.id);
      const z = el("div", "b-treffer-zeile" + (istAktuell ? " aktuell" : ""));
      const links = el("div");
      const nameZeile = el("div", "b-treffer-name", c.Title);
      /* Der Name allein reicht nicht: es kann mehrere gleichnamige Geräte
         geben. Listen-ID und Status machen den Treffer eindeutig. */
      nameZeile.title = "Listen-ID " + c.id;
      const marke = statusMarke(c);
      if (marke) {
        nameZeile.appendChild(document.createTextNode(" "));
        nameZeile.appendChild(marke);
      }
      links.appendChild(nameZeile);
      const teile = [];
      if (c.SCCM_Model) teile.push(text(c.SCCM_Model));
      if (c.GebaeudeStock) teile.push(text(c.GebaeudeStock));
      const andere = andereBenutzerVon(c);
      if (andere.length) teile.push("bereits zugeordnet: " + andere.join(", "));
      links.appendChild(el("div", "b-treffer-unter", teile.join(" · ") || "—"));
      z.appendChild(links);
      if (istAktuell) {
        z.appendChild(el("span", "chip chip-marke", "zugeordnet"));
      } else {
        z.appendChild(knopf("Zuordnen", null, function () { geraetZuordnen(c); }));
      }
      liste.appendChild(z);
    }
    if (treffer.length > 40) {
      liste.appendChild(el("p", "hinweis",
        treffer.length - 40 + " weitere Treffer — Suche verfeinern."));
    }
  }
  kSuche.inhalt.appendChild(liste);
  const unten = el("div", "b-abstand");
  unten.appendChild(kSuche);
  ziel.appendChild(unten);
}


/* ---------- Berechtigungen ---------- */

function bereichBerechtigungen(ziel) {
  const zahlen = rechteZaehlen();
  const suchbegriff = rechteSuche.trim().toLowerCase();

  const werkzeuge = el("div", "b-werkzeuge");
  werkzeuge.appendChild(suchfeld("b-suche-rechte", "Programm suchen …", rechteSuche,
    function (v) { rechteSuche = v; zeichneBereich(); }));

  const filter = knopf("Nur aktive", nurAktive ? "aktiv" : null, function () {
    nurAktive = !nurAktive;
    zeichneBereich();
  });
  filter.setAttribute("aria-pressed", nurAktive ? "true" : "false");
  werkzeuge.appendChild(filter);
  werkzeuge.appendChild(el("span", "anzahl",
    zahlen.aktiv + " von " + zahlen.gesamt + " aktiv"));
  ziel.appendChild(werkzeuge);

  // Nach Kategorie gruppieren, Reihenfolge aus programme.json.
  const stapel = el("div", "stapel");
  ziel.appendChild(stapel);
  let gezeigt = 0;
  for (const kategorie of kategorien) {
    const inKategorie = pSpalten.filter(s => s.g === kategorie);
    const sichtbar = inKategorie.filter(function (s) {
      if (nurAktive && programmStufe(s.i) === 0) return false;
      if (!suchbegriff) return true;
      const heuhaufen = (s.d + " " + s.i + " " + (s.adGruppen || []).join(" ")).toLowerCase();
      return heuhaufen.indexOf(suchbegriff) > -1;
    });
    if (!sichtbar.length) continue;

    const aktivInKategorie = inKategorie.filter(s => programmStufe(s.i) > 0).length;
    const k = karte(kategorie,
      aktivInKategorie + " von " + inKategorie.length + " aktiv");
    const liste = el("div", "b-programme");
    for (const s of sichtbar) liste.appendChild(programmZeile(s));
    k.inhalt.appendChild(liste);
    stapel.appendChild(k);
    gezeigt += sichtbar.length;
  }

  if (!gezeigt) {
    const leer = el("div", "leerzustand");
    leer.appendChild(el("p", "leer-titel", "Kein Programm passt"));
    leer.appendChild(el("p", "leer-text",
      nurAktive ? "Filter «Nur aktive» oder die Suche zurücksetzen."
                : "Suchbegriff anpassen."));
    ziel.appendChild(leer);
  }
}

function programmZeile(spalte) {
  const stufe = programmStufe(spalte.i);
  const z = el("div", "schalter-zeile");

  const schalter = el("button", "schalter"
    + (stufe === 1 ? " an" : "")
    + (stufe === 2 ? " an gesperrt" : ""));
  schalter.type = "button";
  schalter.setAttribute("role", "switch");
  schalter.setAttribute("aria-checked", stufe > 0 ? "true" : "false");
  schalter.setAttribute("aria-label", spalte.d);

  if (stufe === 2) {
    // Stufe 2 kommt aus einer AD-Gruppe und ist hier nicht veränderbar.
    schalter.disabled = true;
    schalter.title = Modell.sperrHinweis(spalte);
  } else {
    schalter.title = stufe === 1 ? "Aktiviert — klicken zum Deaktivieren"
                                 : "Deaktiviert — klicken zum Aktivieren";
    schalter.addEventListener("click", function () {
      // Es werden ausschliesslich «0» und «1» geschrieben.
      setzeWert(spalte.i, programmStufe(spalte.i) === 1 ? "0" : "1");
      zeichneBereich();
    });
  }
  z.appendChild(schalter);

  const name = el("span", "name", spalte.d);
  if (Object.prototype.hasOwnProperty.call(entwurf, spalte.i)) {
    name.appendChild(document.createTextNode(" "));
    name.appendChild(el("span", "chip chip-warnung", "geändert"));
  }
  z.appendChild(name);

  const zusatz = el("div", "b-programm-zusatz");
  for (const g of (spalte.adGruppen || [])) {
    const chip = el("span", "chip chip-info", g);
    chip.title = "AD-Gruppe «" + g + "»";
    zusatz.appendChild(chip);
  }
  if (stufe === 2 && !(spalte.adGruppen || []).length) {
    zusatz.appendChild(el("span", "zusatz", "vom Abgleich gesetzt"));
  }
  z.appendChild(zusatz);

  return z;
}


/* ---------- Bemerkung ---------- */

function bereichBemerkung(ziel) {
  const stapel = el("div", "stapel");

  const k = karte("Bemerkung", "Freier Text zu dieser Person. Wird nicht überschrieben.");
  const f = el("div", "datenzeile-breit");
  const label = el("div", "datenzeile-name", "Bemerkung");
  f.appendChild(label);
  const eingabe = el("textarea");
  eingabe.id = "b-bemerkung";
  eingabe.value = textWert("Bemerkung");
  eingabe.setAttribute("aria-label", "Bemerkung");
  eingabe.addEventListener("input", function () {
    // Kein Neuzeichnen: sonst reisst das Tippen ab.
    setzeWert("Bemerkung", eingabe.value);
  });
  f.appendChild(eingabe);
  k.inhalt.appendChild(f);
  stapel.appendChild(k);

  /* Verlauf. Er hängt am selben Entwurf wie alle anderen Felder:
     verlauf.js meldet die fertige Zeichenkette, setzeWert legt sie in den
     Entwurf, der Speichern-Knopf schreibt sie nach SharePoint. */
  const kVerlauf = karte("Verlauf",
    "Was rund um diese Person passiert ist — Gerätewechsel, Eintritt, "
    + "Austritt. Der Abgleich hängt eigene Einträge an; sie lassen sich "
    + "hier ebenso ändern oder löschen.");
  Verlauf.zeichnen(kVerlauf.inhalt, {
    schluessel: "benutzer",
    wert: wert("Verlauf"),
    beiAenderung: function (json) { setzeWert("Verlauf", json); }
  });
  stapel.appendChild(kVerlauf);

  ziel.appendChild(stapel);
}


/* ==================================================================
   7. Kopfzeile, Navigation, Zeichnen
   ================================================================== */

function geraetFensterOeffnen(computerZeile) {
  window.open("geraet.html?id=" + encodeURIComponent(computerZeile.id) + MOCK_ANHANG,
    "geraet-" + computerZeile.id);
}

function kopfZeichnen() {
  $("b-titel").textContent = zeile.__name || zeile.Title || "Benutzer";

  const teile = [];
  if (zeile.Title) teile.push(text(zeile.Title));
  if (zeile.Abteilung) teile.push(text(zeile.Abteilung));
  if (zeile.Funktion) teile.push(text(zeile.Funktion));
  $("b-unter").textContent = teile.join(" · ");

  const status = $("b-status");
  status.textContent = zeile.__adAktiv ? "AD-Konto aktiv" : "AD-Konto deaktiviert";
  status.className = "b-status " + (zeile.__adAktiv ? "t-erfolg" : "t-gefahr");

  const aktionen = leeren($("b-aktionen"));

  const geraet = zugeordnetesGeraet();
  if (geraet) {
    aktionen.appendChild(knopf("Gerät öffnen", null, function () {
      geraetFensterOeffnen(geraet);
    }));
  }
}

/* Das Logo im Kopf führt zur Übersicht. Im Vorführmodus muss der Parameter
   mitgehen, sonst landet man dort auf der Anmeldung. */
function logoZeichnen() {
  const verweis = $("b-logo");
  if (!verweis) return;
  verweis.href = "index.html" + (mockModus ? "?mock=1" : "");
  // Der Pfad über dem Titel führt in die Benutzerliste.
  const pfad = $("b-pfad");
  if (pfad) pfad.href = "index.html" + (mockModus ? "?mock=1" : "") + "#benutzer";
}

/* Die Seitennavigation. Die Spalte selbst (.fenster-nav) reicht bis zum
   unteren Fensterrand; die Knöpfe stehen in einem eigenen Behälter
   (.fenster-nav-menue), der darin klebt beziehungsweise auf schmalen
   Fenstern zur waagrecht rollenden Reiterleiste wird. */
function navZeichnen() {
  const nav = leeren($("b-nav"));
  nav.hidden = false;
  const zahlen = rechteZaehlen();

  const menue = el("div", "fenster-nav-menue");
  for (const b of BEREICHE) {
    const k = el("button", "fenster-nav-knopf" + (b.k === aktiverBereich ? " aktiv" : ""));
    k.type = "button";
    if (b.k === aktiverBereich) k.setAttribute("aria-current", "true");
    k.appendChild(document.createTextNode(b.d));
    if (b.k === "berechtigungen") {
      k.appendChild(el("span", "fenster-nav-zahl", String(zahlen.aktiv)));
    }
    k.addEventListener("click", function () { bereichWechseln(b.k); });
    menue.appendChild(k);
  }
  nav.appendChild(menue);

  /* Auf schmalen Fenstern ist die Navigation eine waagrecht rollende
     Leiste. Nach dem Neuzeichnen soll der aktive Eintrag sichtbar bleiben;
     «nearest» rührt nichts an, wenn er ohnehin schon zu sehen ist. */
  const aktiv = menue.querySelector(".fenster-nav-knopf.aktiv");
  if (aktiv && aktiv.scrollIntoView) {
    aktiv.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}

function bereichWechseln(schluessel) {
  aktiverBereich = schluessel;
  location.hash = "#" + schluessel;
  navZeichnen();
  zeichneBereich();
}

/* Zeichnet den aktiven Bereich neu und stellt den Fokus samt Schreibmarke
   wieder her, damit Tippen in den Suchfeldern nicht abreisst. */
function zeichneBereich() {
  const vorher = document.activeElement;
  const vorherId = vorher && vorher.id ? vorher.id : null;
  let pos = null;
  if (vorher && typeof vorher.selectionStart === "number") {
    try { pos = vorher.selectionStart; } catch (e) { pos = null; }
  }

  const ziel = leeren($("b-bereich"));
  ziel.hidden = false;
  const bereich = BEREICHE.filter(b => b.k === aktiverBereich)[0] || BEREICHE[0];
  aktiverBereich = bereich.k;
  bereich.f(ziel);

  if (vorherId) {
    const neu = document.getElementById(vorherId);
    if (neu && typeof neu.focus === "function") {
      neu.focus();
      if (pos !== null && typeof neu.setSelectionRange === "function") {
        try { neu.setSelectionRange(pos, pos); } catch (e) { /* type=search mag das nicht überall */ }
      }
    }
  }
}

function zeichnenAlles() {
  kopfZeichnen();
  navZeichnen();
  zeichneBereich();
  speicherleisteZeichnen();
}


/* ==================================================================
   8. Laden und Speichern
   ================================================================== */

function zeigeLaden(meldung, fortschrittText) {
  $("b-laden-text").textContent = meldung;
  $("b-laden-fortschritt").textContent = fortschrittText || "";
  $("b-laden").hidden = false;
  $("b-fehler").hidden = true;
  $("b-bereich").hidden = true;
  $("b-nav").hidden = true;
}

function zeigeFehler(titel, meldung, hinweis, knopfText, beiKlick) {
  $("b-fehler-titel").textContent = titel;
  $("b-fehler-text").textContent = meldung;
  $("b-fehler-hinweis").textContent = hinweis || "";
  const k = $("b-knopf-nochmal");
  k.textContent = knopfText || "Erneut laden";
  k.onclick = beiKlick || neuLaden;
  $("b-laden").hidden = true;
  $("b-fehler").hidden = false;
  $("b-bereich").hidden = true;
  $("b-nav").hidden = true;
  $("b-speicherleiste").hidden = true;
}

function zeigeInhalt() {
  $("b-laden").hidden = true;
  $("b-fehler").hidden = true;
}

/* «still» lädt im Hintergrund nach, ohne die Seite gegen den Spinner zu
   tauschen: nach dem Speichern soll der Inhalt stehen bleiben. */
async function datenLaden(still) {
  let anzahlBenutzer = 0, anzahlComputer = 0;

  function fortschritt() {
    if (still) return;
    $("b-laden-fortschritt").textContent =
      "Benutzer " + anzahlBenutzer + " / Geräte " + anzahlComputer;
  }

  if (!still) {
    zeigeLaden(mockModus ? "Vorführdaten werden aufgebaut …"
                         : "Daten werden aus SharePoint geladen …", "");
  }

  const rohBenutzer = await Daten.benutzer(function (n) {
    anzahlBenutzer = n; fortschritt();
  });
  const rohComputer = await Daten.computer(function (n) {
    anzahlComputer = n; fortschritt();
  });
  if (!still) {
    $("b-laden-fortschritt").textContent =
      "Benutzer " + rohBenutzer.length + " / Geräte " + rohComputer.length
      + " / Programme werden geladen …";
  }
  programmDatei = await Daten.programme();

  const ergebnis = Modell.anreichern(rohComputer, rohBenutzer, programmDatei);
  alleComputer = ergebnis.computer;
  alleBenutzer = ergebnis.benutzer;
  pSpalten = ergebnis.programmSpalten;

  pSpalte = {};
  for (const s of pSpalten) pSpalte[s.i] = s;

  // Reihenfolge der Kategorien: erst die aus programme.json, dann alles,
  // was dort fehlt, in der Reihenfolge des Vorkommens.
  kategorien = Array.isArray(programmDatei && programmDatei.kategorien)
    ? programmDatei.kategorien.slice() : [];
  for (const s of pSpalten) if (kategorien.indexOf(s.g) === -1) kategorien.push(s.g);
  kategorien = kategorien.filter(k => pSpalten.some(s => s.g === k));
}

function zeileWaehlen() {
  const treffer = alleBenutzer.filter(z => String(z.id) === String(elementId))[0];
  if (!treffer) {
    const fehler = new Error("Zur Listen-ID " + elementId + " gibt es keine Zeile "
      + "in der Benutzer-Liste. Vermutlich wurde sie vom AD-Abgleich entfernt, "
      + "weil das Konto im Active Directory nicht mehr vorkommt.");
    fehler.nichtGefunden = true;
    throw fehler;
  }
  zeile = treffer;
  document.title = (zeile.__name || zeile.Title) + " — Computer Inventar";
}

async function neuLaden() {
  try {
    await datenLaden();
    zeileWaehlen();
    zeigeInhalt();
    zeichnenAlles();
  } catch (fehler) {
    ladefehlerZeigen(fehler);
  }
}

function ladefehlerZeigen(fehler) {
  const meldung = fehler && fehler.message ? fehler.message : String(fehler);
  if (fehler && fehler.nichtGefunden) {
    zeigeFehler("Benutzer nicht gefunden", meldung,
      "Die Benutzerliste wird vom AD-Abgleich gepflegt; dieses Fenster legt "
      + "keine Benutzer an.");
    return;
  }
  zeigeFehler("Die Daten konnten nicht geladen werden", meldung,
    mockModus ? "" : "Zum Anschauen ohne Anmeldung dieses Fenster mit &mock=1 aufrufen.");
}

/* ---------- Automatisch nachladen ---------- */

/* Wie in der Liste und im Gerätefenster: kein Knopf «Neu laden», sondern ein
   ruhiger Takt, der den Stand still nachholt. Wer sofort einen frischen
   Stand will, lädt die Seite neu.

   Übersprungen wird, sobald Nachladen mehr stören als nützen würde: bei
   ungespeicherten Änderungen (sie gingen verloren), während des Speicherns
   und in einem Hintergrund-Tab. Der nächste Takt versucht es dann wieder. */
let autoLetzte = Date.now();
let autoLaeuft = false;

function autoErlaubt() {
  if (autoLaeuft || document.hidden) return false;
  if (speichertGerade || anzahlAenderungen()) return false;
  return true;
}

async function autoNachladen() {
  autoLaeuft = true;
  try {
    await datenLaden(true);
    zeileWaehlen();
    zeigeInhalt();
    zeichnenAlles();
  } catch (fehler) {
    /* Still bleiben: Der bisher gezeigte Stand ist besser als ein Fehlerbild
       wegen einer kurzen Störung. */
  } finally {
    autoLaeuft = false;
    autoLetzte = Date.now();
  }
}

function autoPruefen() {
  if (!autoErlaubt()) return;
  if (Date.now() - autoLetzte < KONFIG.autoTaktMs) return;
  autoNachladen();
}

function autoStarten() {
  autoLetzte = Date.now();
  setInterval(autoPruefen, KONFIG.autoPruefTaktMs);
  document.addEventListener("visibilitychange", autoPruefen);
}

/* Werte so aufbereiten, wie Graph sie erwartet. Programmwerte sind immer
   Zeichenketten «0» oder «1»; «2» schreibt dieses Fenster nie.

   Sonderfall «Computer»: eine gelöste Zuordnung wird als null gesendet.
   Graph löscht das Feld damit wirklich; eine leere Zeichenkette lässt in
   SharePoint je nach Spaltentyp einen leeren, aber gesetzten Wert zurück.
   Das Gerätefenster (zuordnungSchreiben) macht es genauso. */
function fuerGraph(feld, roh) {
  if (pSpalte[feld]) {
    return Modell.stufe(roh) === 1 ? "1" : "0";
  }
  const spalte = SPALTE[feld];
  if (spalte && spalte.t === "Number") {
    if (roh === "" || roh === null || roh === undefined) return null;
    const n = Number(roh);
    return isNaN(n) ? null : n;
  }
  const t = (roh === null || roh === undefined) ? "" : String(roh);
  if (feld === "Computer") return t.trim() === "" ? null : t.trim();
  return t;
}

/* Sicherheitsnetz: nur bearbeitbare Felder dürfen in den Entwurf. */
function darfSchreiben(feld) {
  if (pSpalte[feld]) return Modell.stufe(zeile[feld]) !== 2;
  return istBearbeitbar(SPALTE[feld]);
}

async function speichern() {
  if (speichertGerade) return;
  if (!anzahlAenderungen()) return;

  const felder = {};
  for (const feld in entwurf) {
    if (!darfSchreiben(feld)) continue;
    felder[feld] = fuerGraph(feld, entwurf[feld]);
  }
  if (!Object.keys(felder).length) {
    entwurf = {};
    speicherleisteZeichnen();
    return;
  }

  speichertGerade = true;
  speicherFehler = "";
  speicherleisteZeichnen();

  try {
    await Daten.speichern("benutzer", elementId, felder);
    const anzahl = Object.keys(felder).length;
    entwurf = {};
    melden("benutzer-geaendert", elementId);
    speichertGerade = false;
    await datenLaden(true);
    zeileWaehlen();
    zeigeInhalt();
    zeichnenAlles();
    toast(anzahl === 1 ? "Änderung gespeichert."
                       : anzahl + " Änderungen gespeichert.");
  } catch (e) {
    speichertGerade = false;
    speicherFehler = e && e.message ? e.message : String(e);
    speicherleisteZeichnen();
    toast("Speichern fehlgeschlagen. " + speicherFehler, true);
  }
}

function verwerfen() {
  if (!anzahlAenderungen() || speichertGerade) return;
  const anzahl = anzahlAenderungen();
  if (!window.confirm(anzahl === 1 ? "Eine Änderung verwerfen?"
                                   : anzahl + " Änderungen verwerfen?")) return;
  entwurf = {};
  speicherFehler = "";
  zeichnenAlles();
  toast("Änderungen verworfen.");
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
  const band = $("b-band");
  band.hidden = false;
  band.appendChild(document.createTextNode(
    "Vorführmodus (?mock=1): alle Personen, Geräte und Berechtigungen sind "
    + "erfunden. Änderungen bleiben im Browser und gehen nie nach SharePoint."));
  band.appendChild(knopf("Vorführ-Änderungen zurücksetzen", "knopf-leise", function () {
    if (!window.confirm("Alle im Vorführmodus gemachten Änderungen verwerfen?")) return;
    Mock.zuruecksetzen();
    entwurf = {};
    melden("benutzer-geaendert", elementId);
    neuLaden();
  }));
}

async function start() {
  hashLesen();
  logoZeichnen();
  bandZeichnen();

  try {
    if (!mockModus) {
      zeigeLaden("Anmeldung wird geprüft …", "");
      await Auth.anmeldungSicherstellen();
    }
    if (!elementId) {
      zeigeFehler("Kein Benutzer angegeben",
        "Dieses Fenster braucht die Listen-ID in der Adresse, zum Beispiel "
        + "benutzer.html?id=5.",
        "Normalerweise wird es aus der Benutzerliste heraus geöffnet.");
      return;
    }
    await datenLaden();
    zeileWaehlen();
    zeigeInhalt();
    zeichnenAlles();
  } catch (fehler) {
    ladefehlerZeigen(fehler);
  }
}

/* ---------- Ereignisse ---------- */

$("b-knopf-speichern").addEventListener("click", speichern);
$("b-knopf-verwerfen").addEventListener("click", verwerfen);

autoStarten();

window.addEventListener("hashchange", function () {
  const h = (location.hash || "").replace(/^#/, "");
  if (h && h !== aktiverBereich && BEREICHE.some(b => b.k === h)) {
    aktiverBereich = h;
    navZeichnen();
    zeichneBereich();
  }
});

document.addEventListener("keydown", function (e) {
  // Ctrl+S beziehungsweise Cmd+S speichert.
  if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
    e.preventDefault();
    speichern();
    return;
  }
  if (e.key === "Escape") {
    if (anzahlAenderungen()) {
      e.preventDefault();
      verwerfen();
    }
  }
});

window.addEventListener("beforeunload", function (e) {
  if (!anzahlAenderungen()) return;
  e.preventDefault();
  // Der Text stammt vom Browser; zurückgeben muss man trotzdem etwas.
  e.returnValue = "";
  return "";
});

start();

})();

/* geraet.js — Gerätefenster des Computer Inventars (Spezifikation 3.3).

   Wird von der Hauptseite mit window.open("geraet.html?id=…", "geraet-<id>")
   geöffnet und zeigt ein einzelnes Gerät der Liste «Computer»: Übersicht mit
   Kennzahlen, kompaktem Lebenszyklus und Hinweisen, Beschaffung, zugeordnete
   Benutzer, Stammdaten, Software aus SCCM, Hardware, System, Sicherheit,
   Aktivität, Flottenvergleich und alle Rohdaten.

   Bearbeitbar sind genau die von Hand gepflegten Spalten (q = "manuell" in
   spalten.js): Title, Seriennummer, GebaeudeStock, Bemerkung,
   Beschaffungsjahr, ErsatzGeplant. Alle SCCM-Spalten sind schreibgeschützt
   und tragen ein Schloss — der Abgleich überschreibt sie ohnehin.

   Die Benutzerzuordnung steht in der Liste «Benutzer» (Spalte «Computer»).
   Dieses Fenster schreibt sie dort und meldet die Änderung über den
   BroadcastChannel als «benutzer-geaendert».

   Aufbau:
     1. Parameter und Spaltenwissen
     2. Kleine DOM-Helfer
     3. Zustand, Entwurf, Speicherleiste, Toast
     4. Bausteine (Karten, Kacheln, Feldzeilen, Tabellen)
     5. Auswertung (Hinweise, Flotte)
     6. Die Bereiche
     7. Kopf, Navigation, Aktionen
     8. Laden, Speichern, Anlegen, Löschen, Zuordnung
     9. Start und Tastatur

   Grundsätze: kein Framework, keine globalen Variablen ausser den Modulen
   der anderen Dateien, kein Inline-Script — und niemals innerHTML mit Daten
   aus SharePoint: jeder Wert geht über textContent in die Seite. */

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

const SPALTEN = SPALTEN_COMPUTER;

const SPALTE = {};
for (const s of SPALTEN) SPALTE[s.i] = s;

const GRUPPEN = [];
for (const s of SPALTEN) if (GRUPPEN.indexOf(s.g) === -1) GRUPPEN.push(s.g);

/* Die Stammdaten dieses Fensters, in der Reihenfolge der Anzeige. */
const STAMM_SPALTEN = ["Title", "Seriennummer", "GebaeudeStock"].map(i => SPALTE[i]);
const BEMERKUNG = SPALTE["Bemerkung"];

/* Spalten, die dieses Fenster schreiben darf. */
function istBearbeitbar(spalte) {
  return !!spalte && spalte.q === "manuell";
}

/* Beim Duplizieren nicht übernehmen: alles, was ein Gerät eindeutig macht. */
const NICHT_DUPLIZIEREN = ["Title", "Seriennummer"];


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

/* Symbole als inline-SVG: keine Schriftart, kein CDN, Farbe = currentColor. */
function symbol(pfadDaten, groesse) {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  const g = groesse || 16;
  svg.setAttribute("class", "icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(g));
  svg.setAttribute("height", String(g));
  svg.setAttribute("aria-hidden", "true");
  const pfad = document.createElementNS(NS, "path");
  pfad.setAttribute("d", pfadDaten);
  svg.appendChild(pfad);
  return svg;
}

const SYMBOL_ACHTUNG = "M12 3 2.5 20.5h19L12 3ZM12 10v4M12 17.5v.5";
const SYMBOL_INFO    = "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v6M12 7.5v.5";

function knopf(beschriftung, klasse, beiKlick) {
  const k = el("button", "knopf" + (klasse ? " " + klasse : ""), beschriftung);
  k.type = "button";
  if (beiKlick) k.addEventListener("click", beiKlick);
  return k;
}


/* ==================================================================
   3. Zustand, Entwurf, Speicherleiste, Toast
   ================================================================== */

let alleGeraete = [];     // Liste «Computer», angereichert
let alleBenutzer = [];    // Liste «Benutzer», angereichert
let zeile = null;         // das Gerät dieses Fensters
let entwurf = {};         // geänderte, noch nicht gespeicherte Felder
let speichertGerade = false;
let speicherFehler = "";
let geloescht = false;

/* Zustände der Suchfelder innerhalb der Bereiche. */
let swInstalliertSuche = "";
let rohSuche = "";
let rohLeereZeigen = false;

let aktiverBereich = "uebersicht";

const BEREICHE = [
  { k: "uebersicht",  d: "Übersicht",        f: bereichUebersicht,  immer: false },
  { k: "beschaffung", d: "Beschaffung",      f: bereichBeschaffung, immer: true  },
  { k: "benutzer",    d: "Benutzer",         f: bereichBenutzer,    immer: false },
  { k: "stammdaten",  d: "Stammdaten",       f: bereichStammdaten,  immer: true  },
  { k: "software",    d: "Software (SCCM)",  f: bereichSoftware,    immer: false },
  { k: "hardware",    d: "Hardware",         f: bereichHardware,    immer: false },
  { k: "system",      d: "System & Netzwerk", f: bereichSystem,     immer: false },
  { k: "sicherheit",  d: "Sicherheit",       f: bereichSicherheit,  immer: false },
  { k: "aktivitaet",  d: "SCCM & Aktivität", f: bereichAktivitaet,  immer: false },
  { k: "analyse",     d: "Flottenvergleich", f: bereichAnalyse,     immer: false },
  { k: "felder",      d: "Alle Felder",      f: bereichFelder,      immer: true  }
];

function sichtbareBereiche() {
  // Solange die Zeile neu ist, gibt es weder SCCM-Daten noch Benutzer.
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
  const zeigen = !geloescht && (neuModus || anzahl > 0 || speichertGerade);
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
  t.className = "toast" + (istFehler ? " toast-fehler" : "");
  t.hidden = false;
  if (toastZeit) clearTimeout(toastZeit);
  toastZeit = setTimeout(function () { t.hidden = true; }, istFehler ? 8000 : 3500);
}

/* ---------- Meldung an die Hauptseite und die anderen Fenster ---------- */

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

/* Eine Karte des Design-Systems. Inhalt kommt in karte.inhalt. */
function karte(titel, unter, breit) {
  const k = el("section", "karte" + (breit ? " karte-breit" : ""));
  if (titel) {
    const kopf = el("div", "karte-kopf");
    kopf.appendChild(el("h2", "karte-titel", titel));
    if (unter) kopf.appendChild(el("p", "karte-unter", unter));
    k.appendChild(kopf);
  }
  const inhalt = el("div", "karte-inhalt");
  k.appendChild(inhalt);
  k.inhalt = inhalt;
  return k;
}

function kartenGitter() {
  return el("div", "karten");
}

/* Kennzahl-Kachel: Farbe ausschliesslich auf der Zahl (design.css). */
function kachel(text, wertText, unter, ton) {
  const k = el("div", "kachel" + (ton ? " ton-" + ton : ""));
  k.setAttribute("data-klickbar", "nein");
  const leer = wertText === "" || wertText === null || wertText === undefined;
  k.appendChild(el("div", "kachel-wert klein", leer ? "—" : String(wertText)));
  k.appendChild(el("div", "kachel-text", text));
  if (unter) k.appendChild(el("div", "kachel-unter", unter));
  return k;
}

function schloss() {
  const s = el("span", "schloss");
  s.title = "Aus SCCM — wird beim nächsten Abgleich überschrieben";
  return s;
}

/* Eine Feldzeile im Lesemodus. «neben» steht klein und grau daneben. */
function feldZeile(name, wertText, neben, geschuetzt) {
  const z = el("div", "datenzeile");
  const n = el("div", "datenzeile-name");
  n.appendChild(document.createTextNode(String(name)));
  if (geschuetzt) n.appendChild(schloss());
  const w = el("div", "datenzeile-wert");
  if (wertText === "" || wertText === null || wertText === undefined) {
    w.appendChild(el("span", "t-still", "—"));
  } else {
    w.appendChild(document.createTextNode(String(wertText)));
  }
  if (neben) w.appendChild(el("span", "datenzeile-neben", neben));
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

/* Datum: absolut, dazu relativ daneben. */
function datumZeile(name, rohwert) {
  const d = Hilfe.datum(rohwert);
  if (!d) return feldZeile(name, "", null, true);
  return feldZeile(name, Hilfe.datumZeitText(rohwert), Hilfe.relativText(rohwert), true);
}

function tabelle(kopfzeilen, datenzeilen) {
  const rahmen = el("div", "tabelle-schlicht-rahmen");
  const t = el("table", "tabelle tabelle-schlicht");
  const thead = el("thead");
  const kopf = el("tr");
  for (const h of kopfzeilen) {
    const th = el("th", null, h);
    th.style.cursor = "default";
    kopf.appendChild(th);
  }
  thead.appendChild(kopf);
  t.appendChild(thead);

  const koerper = el("tbody");
  for (const z of datenzeilen) {
    const tr = el("tr");
    for (const feldwert of z) {
      const td = el("td");
      if (feldwert && feldwert.nodeType) td.appendChild(feldwert);
      else td.textContent = (feldwert === null || feldwert === undefined) ? "" : String(feldwert);
      tr.appendChild(td);
    }
    koerper.appendChild(tr);
  }
  t.appendChild(koerper);
  rahmen.appendChild(t);
  return rahmen;
}

function chip(text, ton) {
  return el("span", "chip" + (ton ? " chip-" + ton : ""), text);
}

function leerHinweis(text) {
  return el("p", "hinweis", text);
}

/* ---------- Eingaben ---------- */

const datenlistenGebaut = {};

/* Baut bei Bedarf eine <datalist> und gibt deren id zurück. «werte» wird,
   falls nicht angegeben, aus allen vorkommenden Werten der Spalte gebaut. */
function datenliste(name, werte) {
  const id = "g-dl-" + name;
  if (datenlistenGebaut[id]) return id;

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

function werteDerSpalte(feld) {
  const werte = [];
  for (const z of alleGeraete) {
    const w = z[feld];
    if (w === null || w === undefined || w === "") continue;
    const t = String(w).trim();
    if (t && werte.indexOf(t) === -1) werte.push(t);
  }
  werte.sort(Hilfe.vergleiche);
  return werte;
}

/* Ein Eingabefeld für eine bearbeitbare Spalte.
   optionen: { liste: [..], schmal: true, beiAenderung: fn } */
function eingabeFuer(spalte, optionen) {
  const o = optionen || {};
  const istNote = spalte.t === "Note";
  const feld = el(istNote ? "textarea" : "input",
    (istNote ? "g-textarea" : "g-eingabe") + (o.schmal ? " g-eingabe-schmal" : ""));
  if (!istNote) feld.type = "text";
  feld.value = textWert(spalte.i);
  feld.id = "g-eingabe-" + spalte.i;
  feld.autocomplete = "off";
  feld.setAttribute("aria-label", spalte.d);

  if (!istNote) {
    const werte = o.liste || werteDerSpalte(spalte.i);
    if (werte.length) feld.setAttribute("list", datenliste(spalte.i, werte));
  }

  feld.addEventListener("input", function () {
    feld.classList.remove("g-ungueltig");
    setzeWert(spalte.i, feld.value);
    const z = feld.closest ? feld.closest(".datenzeile") : null;
    if (z) z.classList.toggle("geaendert", istGeaendert(spalte.i));
    if (spalte.i === "Title") titelZeichnen();
  });
  if (o.beiAenderung) feld.addEventListener("change", o.beiAenderung);
  return feld;
}

/* Eine Formularzeile: bearbeitbare Spalten bekommen ein Eingabefeld,
   alle anderen bleiben Text mit Schloss. */
function formularZeile(spalte, optionen) {
  if (!istBearbeitbar(spalte)) {
    const roh = wert(spalte.i);
    if (spalte.t === "DateTime") return datumZeile(spalte.d, roh);
    return feldZeile(spalte.d, roh, null, true);
  }
  const o = optionen || {};
  const huelle = el("div");
  huelle.appendChild(eingabeFuer(spalte, o));
  if (o.hinweis) huelle.appendChild(el("div", "datenzeile-hinweis", o.hinweis));
  if (o.zusatz) huelle.appendChild(o.zusatz);
  const z = feldZeileKnoten(o.name || spalte.d, huelle, false);
  z.classList.toggle("geaendert", istGeaendert(spalte.i));
  return z;
}


/* ==================================================================
   5. Auswertung
   ================================================================== */

/* Alle Geräte, die in SCCM stehen: Grundlage jedes Vergleichs. */
function flotte() {
  return alleGeraete.filter(z => Hilfe.istJa(z.SCCM_Found));
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

/* Der aktuelle Ersatzstatus, immer aus den angezeigten Werten gerechnet. */
function ersatzStatus() {
  return Modell.ersatzStatus(textWert("ErsatzGeplant"), textWert("Beschaffungsjahr"));
}

/* Die zugeordneten Benutzer dieses Geräts (aus der Liste «Benutzer»). */
function zugeordneteBenutzer() {
  if (!zeile) return [];
  const name = String(zeile.Title || "").trim();
  if (!name) return [];
  return alleBenutzer.filter(b => Modell.schluessel(b.Computer) === Modell.schluessel(name));
}

/* Die Hinweise. Schlichte Liste, Wichtigkeit nur über die Farbe:
   «gefahr», «warnung», «info». Kein Score, keine Punkte. */
function hinweise() {
  const b = [];
  if (!zeile) return b;
  const gefahr  = (t, e) => b.push({ stufe: "gefahr", titel: t, text: e });
  const warnung = (t, e) => b.push({ stufe: "warnung", titel: t, text: e });
  const info    = (t, e) => b.push({ stufe: "info", titel: t, text: e });

  /* --- Beschaffung und Ersatz --- */
  const beschaffung = textWert("Beschaffungsjahr").trim();
  if (!beschaffung) {
    warnung("Kein Beschaffungsjahr", "Ohne Beschaffungsjahr fehlt das Gerät in der "
      + "Ersatzplanung und in der Auswertung der Hauptseite.");
  }
  const status = ersatzStatus();
  const geplant = textWert("ErsatzGeplant").trim();
  const jahr = geplant || Modell.ersatzVorschlag(beschaffung);
  if (status === "ueberfaellig") {
    gefahr("Ersatz überfällig", "Der Ersatz war für " + jahr + " vorgesehen, "
      + "laufendes Geschäftsjahr ist " + Modell.gjAktuell()
      + (geplant ? "." : " (Vorschlag aus Beschaffungsjahr + 5)."));
  } else if (status === "bald") {
    warnung("Ersatz in diesem Geschäftsjahr", "Der Ersatz ist für " + jahr
      + " geplant" + (geplant ? "." : " (Vorschlag aus Beschaffungsjahr + 5)."));
  }

  const inSccm = Hilfe.istJa(zeile.SCCM_Found);
  if (!inSccm) {
    warnung("Nicht in SCCM", "Zu diesem PC-Namen findet der Abgleich kein Gerät in "
      + "SCCM. Entweder heisst das Gerät dort anders, oder es ist ausser Betrieb.");
    return b;
  }

  /* --- Aktivität --- */
  const tageAktiv = Hilfe.tageHer(zeile.SCCM_LastActive);
  if (tageAktiv !== null && tageAktiv > 90) {
    gefahr("Seit " + tageAktiv + " Tagen still", "Letzte Aktivität in SCCM am "
      + Hilfe.datumText(zeile.SCCM_LastActive) + ". Nach drei Monaten ohne "
      + "Lebenszeichen ist das Gerät vermutlich ausser Betrieb.");
  } else if (tageAktiv !== null && tageAktiv > 30) {
    warnung("Seit " + tageAktiv + " Tagen still", "Letzte Aktivität in SCCM am "
      + Hilfe.datumText(zeile.SCCM_LastActive) + ". Bitte prüfen, ob das Gerät "
      + "noch im Einsatz ist.");
  }

  /* --- Speicherplatz --- */
  const frei = zahlOderNull(zeile.SCCM_DiskCFreeGB);
  if (frei !== null && frei < 20) {
    gefahr("Wenig Speicherplatz", "Auf Laufwerk C: sind noch " + Hilfe.zahlText(frei, 1)
      + " GB frei. Unter 20 GB scheitern Windows-Updates regelmässig.");
  } else if (frei !== null && frei < 50) {
    warnung("Speicherplatz wird knapp", "Auf Laufwerk C: sind noch "
      + Hilfe.zahlText(frei, 1) + " GB frei. Unter 50 GB wird es für grössere "
      + "Updates eng.");
  }

  /* --- Virenschutz --- */
  const signaturAlter = Hilfe.tageHer(zeile.SCCM_EPSignatureDate);
  if (signaturAlter !== null && signaturAlter > 7) {
    gefahr("Defender-Signatur veraltet", "Die Virensignatur ist " + signaturAlter
      + " Tage alt. Normal ist höchstens ein Tag.");
  }
  if (zeile.SCCM_EPEnabled && !Hilfe.istJa(zeile.SCCM_EPEnabled)) {
    gefahr("Defender nicht aktiv", "Der Virenschutz meldet sich als deaktiviert.");
  }
  if (zeile.SCCM_EPInfectionStatus
      && !/sauber|clean|kein/i.test(String(zeile.SCCM_EPInfectionStatus))) {
    gefahr("Defender meldet einen Fund", "Infektionsstatus: "
      + zeile.SCCM_EPInfectionStatus + ".");
  }
  if (Hilfe.istJa(zeile.SCCM_EPPendingReboot)) {
    warnung("Neustart ausstehend", "Der Virenschutz verlangt einen Neustart, "
      + "bevor der Schutz wieder vollständig greift.");
  }

  /* --- SCCM-Client --- */
  if (zeile.SCCM_ClientCheckPass && !Hilfe.istJa(zeile.SCCM_ClientCheckPass)) {
    warnung("Client-Prüfung nicht bestanden", "Die letzte Selbstprüfung des "
      + "SCCM-Clients ist fehlgeschlagen. Ohne funktionierenden Client kommen "
      + "weder Updates noch Software auf das Gerät.");
  }
  if (zeile.SCCM_ClientActive && !Hilfe.istJa(zeile.SCCM_ClientActive)) {
    warnung("SCCM-Client inaktiv", "SCCM stuft den Client als inaktiv ein.");
  }

  /* --- Verschlüsselung --- */
  const bitlocker = String(zeile.SCCM_BitLocker || "").trim();
  if (bitlocker && (/nicht|kein|off|nein/i.test(bitlocker) || !/verschl|encrypt/i.test(bitlocker))) {
    gefahr("Laufwerk nicht verschlüsselt", "BitLocker meldet «" + bitlocker
      + "». Bei Verlust des Geräts sind die Daten lesbar.");
  }
  if (zeile.SCCM_TPMEnabled && !Hilfe.istJa(zeile.SCCM_TPMEnabled)) {
    warnung("TPM nicht aktiviert", "Ohne TPM lässt sich BitLocker nicht ohne "
      + "Kennworteingabe betreiben.");
  }

  /* --- Abweichungen zwischen Inventar und SCCM --- */
  const meinBuild = buildZahl(zeile.SCCM_OSVersion);
  const flottenBuild = haeufigster("SCCM_OSVersion");
  const zielBuild = buildZahl(flottenBuild.wert);
  if (meinBuild !== null && zielBuild !== null && meinBuild < zielBuild) {
    warnung("OS-Build veraltet", "Dieses Gerät läuft auf " + zeile.SCCM_OSVersion
      + ", der häufigste Build der Flotte ist " + flottenBuild.wert
      + " (" + flottenBuild.anzahl + " Geräte).");
  }

  const snInventar = textWert("Seriennummer").trim();
  const snSccm = String(zeile.SCCM_SerialNumber || "").trim();
  if (snInventar && snSccm && snInventar.toLowerCase() !== snSccm.toLowerCase()) {
    warnung("Seriennummer stimmt nicht überein", "Inventar: «" + snInventar
      + "», SCCM: «" + snSccm + "». Vermutlich wurde das Gerät ersetzt, "
      + "ohne die Liste nachzuführen.");
  }

  const nameInventar = textWert("Title").trim();
  const nameSccm = String(zeile.SCCM_Name || "").trim();
  if (nameInventar && nameSccm && nameInventar.toLowerCase() !== nameSccm.toLowerCase()) {
    warnung("PC-Name weicht ab", "Inventar: «" + nameInventar + "», SCCM: «"
      + nameSccm + "».");
  }

  /* --- Benutzer --- */
  for (const a of benutzerAbweichungen()) info(a.titel, a.text);

  const akku = akkuProzent();
  if (akku !== null && akku < 50) {
    warnung("Akku schwach", "Der Akku meldet noch " + akku + " % Kapazität. "
      + "Unter 50 % lohnt sich ein Ersatz.");
  }

  return b;
}

/* Weicht der SCCM-Primärbenutzer oder der letzte angemeldete Benutzer von
   den zugeordneten Benutzern ab? */
function benutzerAbweichungen() {
  const treffer = [];
  if (neuModus || !zeile) return treffer;
  const logins = zugeordneteBenutzer().map(b => Modell.schluessel(b.Title));

  const pruefe = function (feld, bezeichnung) {
    const konto = kontoKurz(zeile[feld]);
    if (!konto) return;
    if (logins.indexOf(konto) > -1) return;
    treffer.push({
      titel: bezeichnung + " ist nicht zugeordnet",
      text: "SCCM meldet «" + konto + "»"
        + (logins.length
            ? ", zugeordnet " + (logins.length === 1 ? "ist" : "sind") + " «"
              + logins.join("», «") + "»."
            : ", diesem Gerät ist aber kein Benutzer zugeordnet.")
        + " Bei einem Handwechsel gehört die Zuordnung nachgeführt."
    });
  };
  pruefe("SCCM_PrimaryUser", "Primärer Benutzer (SCCM)");
  pruefe("SCCM_LastLogonUser", "Letzter angemeldeter Benutzer");
  return treffer;
}


/* ==================================================================
   6. Die Bereiche
   ================================================================== */

/* ---------- Übersicht ---------- */

function bereichUebersicht(ziel) {
  const kacheln = el("div", "kacheln");
  const frei = zahlOderNull(zeile.SCCM_DiskCFreeGB);
  const gesamt = zahlOderNull(zeile.SCCM_DiskCGB);
  const signaturAlter = Hilfe.tageHer(zeile.SCCM_EPSignatureDate);
  const tageAktiv = Hilfe.tageHer(zeile.SCCM_LastActive);
  const tageBoot = Hilfe.tageHer(zeile.SCCM_LastBoot);
  const status = ersatzStatus();

  kacheln.appendChild(kachel("Zuletzt aktiv",
    zeile.SCCM_LastActive ? Hilfe.relativText(zeile.SCCM_LastActive) : "unbekannt",
    Hilfe.datumZeitText(zeile.SCCM_LastActive),
    tageAktiv === null ? null : (tageAktiv > 90 ? "gefahr" : (tageAktiv > 30 ? "warnung" : "erfolg"))));

  kacheln.appendChild(kachel("Letzter Neustart",
    zeile.SCCM_LastBoot ? Hilfe.relativText(zeile.SCCM_LastBoot) : "unbekannt",
    tageBoot === null ? "" : "Laufzeit " + tageBoot + " Tage",
    tageBoot === null ? null : (tageBoot > 30 ? "warnung" : "erfolg")));

  kacheln.appendChild(kachel("Laufwerk C: frei",
    frei === null ? "" : Hilfe.zahlText(frei, 1) + " GB",
    gesamt ? "von " + Hilfe.zahlText(gesamt, 0) + " GB" : "",
    frei === null ? null : (frei < 20 ? "gefahr" : (frei < 50 ? "warnung" : "erfolg"))));

  kacheln.appendChild(kachel("Arbeitsspeicher",
    zeile.SCCM_RAMGB ? Hilfe.zahlText(zeile.SCCM_RAMGB, 0) + " GB" : "",
    zeile.SCCM_CPUCores ? zeile.SCCM_CPUCores + " Kerne / "
      + (zeile.SCCM_CPULogical || "?") + " Threads" : ""));

  kacheln.appendChild(kachel("OS-Version", zeile.SCCM_OSVersion, zeile.SCCM_OS));

  kacheln.appendChild(kachel("Defender-Signatur",
    signaturAlter === null ? "" : (signaturAlter === 0 ? "heute" : signaturAlter + " Tage alt"),
    zeile.SCCM_EPSignatureVersion,
    signaturAlter === null ? null : (signaturAlter > 7 ? "gefahr" : (signaturAlter > 2 ? "warnung" : "erfolg"))));

  kacheln.appendChild(kachel("BitLocker", zeile.SCCM_BitLocker, "",
    zeile.SCCM_BitLocker ? (/nicht/i.test(zeile.SCCM_BitLocker) ? "gefahr" : "erfolg") : null));

  kacheln.appendChild(kachel("Beschaffungsjahr", textWert("Beschaffungsjahr"),
    "Geschäftsjahr", textWert("Beschaffungsjahr") ? null : "warnung"));

  kacheln.appendChild(kachel("Ersatz geplant",
    textWert("ErsatzGeplant") || Modell.ersatzVorschlag(textWert("Beschaffungsjahr")),
    textWert("ErsatzGeplant") ? null : "Vorschlag (+5)",
    status === "ueberfaellig" ? "gefahr" : (status === "bald" ? "warnung" : null)));

  kacheln.appendChild(kachel("Zugeordnete Benutzer",
    String(zugeordneteBenutzer().length),
    zugeordneteBenutzer().map(b => b.__name || b.Title).join(", ")));

  ziel.appendChild(kacheln);

  /* Lebenszyklus: eine einzige kompakte Zeile. */
  lebenszyklusZeichnen(ziel);

  /* Hinweise. */
  const liste = hinweise();
  const kHinweise = karte("Hinweise", liste.length
    ? "Aus den aktuellen Werten abgeleitet. Die Farbe zeigt die Wichtigkeit."
    : null, true);
  if (!liste.length) {
    kHinweise.inhalt.appendChild(leerHinweis(
      "Nichts zu beanstanden. Alle geprüften Regeln sind erfüllt."));
  } else {
    const reihenfolge = { gefahr: 0, warnung: 1, info: 2 };
    liste.slice()
      .sort((a, b) => reihenfolge[a.stufe] - reihenfolge[b.stufe])
      .forEach(function (h) {
        const z = el("div", "g-hinweis t-" + h.stufe);
        z.appendChild(symbol(h.stufe === "info" ? SYMBOL_INFO : SYMBOL_ACHTUNG, 16));
        const rechts = el("div");
        rechts.appendChild(el("div", "g-hinweis-titel", h.titel));
        rechts.appendChild(el("div", "g-hinweis-text", h.text));
        z.appendChild(rechts);
        kHinweise.inhalt.appendChild(z);
      });
  }
  ziel.appendChild(kHinweise);
}

/* ---------- Lebenszyklus, kompakt ----------

   Früher stand hier ein grosser Zeitstrahl über alle Geschäftsjahre mit
   Ereignismarken und Legende. Er brauchte viel Platz und sagte wenig, was
   nicht schon in den Kacheln steht. Geblieben ist eine einzige schmale
   Zeile: «Beschaffung 2025/2026 · Ersatz geplant 2030/2031», ein dezenter
   Status-Chip und ein sehr schmaler Balken für den Anteil der bereits
   verstrichenen Zeit. Fehlt ein Jahr, steht dort «–».

   Das Geschäftsjahr läuft vom 1. August bis 31. Juli; gerechnet wird
   ausschliesslich mit den GJ-Helfern aus modell.js. */
function lebenszyklusZeichnen(ziel) {
  const heute = Modell.gjAktuell();
  const beschaffung = textWert("Beschaffungsjahr").trim();
  const geplant = textWert("ErsatzGeplant").trim();
  const vorschlag = Modell.ersatzVorschlag(beschaffung);
  const ersatz = geplant || vorschlag;
  const status = ersatzStatus();

  const block = el("div", "g-lebenszyklus");
  const kasten = el("div", "g-lz");

  const zeileOben = el("div", "g-lz-zeile");
  const daten = el("div", "g-lz-daten");

  const teil = function (name, jahr) {
    const t = el("span", "g-lz-teil");
    t.appendChild(el("span", "g-lz-name", name));
    t.appendChild(el("span", "g-lz-jahr" + (jahr ? "" : " t-still"), jahr || "–"));
    return t;
  };
  daten.appendChild(teil("Beschaffung", beschaffung));
  const punkt = el("span", "g-lz-punkt", "·");
  punkt.setAttribute("aria-hidden", "true");
  daten.appendChild(punkt);
  daten.appendChild(teil(geplant ? "Ersatz geplant" : "Ersatz vorgeschlagen", ersatz));
  zeileOben.appendChild(daten);

  /* Status als Chip. «ok» bleibt bewusst neutral — grün wäre hier eine
     Auszeichnung für etwas, das schlicht in Ordnung ist. */
  const CHIPS = {
    ueberfaellig: { text: "überfällig", ton: "gefahr" },
    bald:         { text: "im laufenden GJ", ton: "warnung" },
    ok:           { text: "im Plan", ton: "" },
    unbekannt:    { text: "nicht erfasst", ton: "leise" }
  };
  const c = CHIPS[status] || CHIPS.unbekannt;
  const statusChip = chip(c.text, c.ton || null);
  statusChip.title = "Laufendes Geschäftsjahr: " + heute;
  zeileOben.appendChild(statusChip);
  kasten.appendChild(zeileOben);

  /* Sehr schmaler Balken: Anteil der Zeit zwischen Beschaffung und Ersatz,
     der bereits verstrichen ist. Nur wenn beide Jahre bekannt sind. */
  const vonZahl = Modell.gjZahl(beschaffung);
  const bisZahl = Modell.gjZahl(ersatz);
  const heuteZahl = Modell.gjZahl(heute);
  if (vonZahl !== null && bisZahl !== null && heuteZahl !== null && bisZahl > vonZahl) {
    const spanne = bisZahl - vonZahl;
    const verstrichen = Math.min(Math.max(heuteZahl - vonZahl, 0), spanne);
    const spur = el("div", "g-lz-spur");
    const fuell = el("div", "g-lz-fuell"
      + (status === "ueberfaellig" ? " g-lz-gefahr"
        : (status === "bald" ? " g-lz-warnung" : "")));
    fuell.style.width = Math.round(verstrichen / spanne * 100) + "%";
    spur.title = verstrichen + " von " + spanne + " Geschäftsjahren verstrichen";
    spur.appendChild(fuell);
    kasten.appendChild(spur);
  }

  block.appendChild(kasten);

  /* Fehlt das Beschaffungsjahr, wird es gleich hier erfasst — sonst fehlt
     das Gerät in der ganzen Ersatzplanung. */
  if (!beschaffung) {
    const erfassen = el("div", "g-lz-erfassen");
    erfassen.appendChild(el("span", "hinweis t-warnung",
      "Ohne Beschaffungsjahr lässt sich der Ersatz nicht planen. Jetzt erfassen:"));
    erfassen.appendChild(eingabeFuer(SPALTE["Beschaffungsjahr"], {
      liste: Modell.gjAuswahl(),
      schmal: true,
      beiAenderung: function () { zeichneBereich(true); }
    }));
    block.appendChild(erfassen);
  }

  ziel.appendChild(block);
}

/* ---------- Beschaffung ---------- */

function bereichBeschaffung(ziel) {
  const gitter = kartenGitter();
  const status = ersatzStatus();
  const beschaffung = textWert("Beschaffungsjahr").trim();
  const vorschlag = Modell.ersatzVorschlag(beschaffung);

  const k = karte("Beschaffung und Ersatz",
    "Beide Angaben sind Geschäftsjahre in der Form «2023/2024». "
    + "Das Geschäftsjahr läuft vom 1. August bis 31. Juli.");

  const felder = el("div", "datenzeilen");
  felder.appendChild(formularZeile(SPALTE["Beschaffungsjahr"], {
    liste: Modell.gjAuswahl(),
    schmal: true,
    hinweis: "Auswahl 2015/2016 bis 2035/2036, freie Eingabe erlaubt.",
    beiAenderung: function () { zeichneBereich(true); }
  }));

  /* Ersatzjahr mit Knopf «Vorschlag übernehmen». */
  const ersatzHuelle = el("div");
  ersatzHuelle.appendChild(eingabeFuer(SPALTE["ErsatzGeplant"], {
    liste: Modell.gjAuswahl(),
    schmal: true,
    beiAenderung: function () { zeichneBereich(true); }
  }));
  const knoepfe = el("div", "datenzeile-zeile");
  const uebernehmen = knopf("Vorschlag übernehmen", "knopf-leise", function () {
    setzeWert("ErsatzGeplant", vorschlag);
    zeichneBereich(false);
    toast("Vorschlag " + vorschlag + " übernommen. Noch nicht gespeichert.");
  });
  uebernehmen.disabled = !vorschlag || textWert("ErsatzGeplant").trim() === vorschlag;
  uebernehmen.title = vorschlag
    ? "Beschaffungsjahr + 5 = " + vorschlag
    : "Ohne Beschaffungsjahr gibt es keinen Vorschlag.";
  knoepfe.appendChild(uebernehmen);
  knoepfe.appendChild(el("span", "hinweis", vorschlag
    ? "Vorschlag: " + vorschlag + " (Beschaffung + 5 Jahre)"
    : "Kein Vorschlag — es fehlt das Beschaffungsjahr."));
  ersatzHuelle.appendChild(knoepfe);

  const zErsatz = feldZeileKnoten("Ersatz geplant", ersatzHuelle, false);
  zErsatz.classList.toggle("geaendert", istGeaendert("ErsatzGeplant"));
  felder.appendChild(zErsatz);
  k.inhalt.appendChild(felder);

  const statusText = {
    ueberfaellig: "Der Ersatz ist überfällig.",
    bald: "Der Ersatz steht im laufenden Geschäftsjahr an.",
    ok: "Der Ersatz liegt in der Zukunft.",
    unbekannt: "Ohne Beschaffungs- und Ersatzjahr lässt sich nichts planen."
  };
  const ton = status === "ueberfaellig" ? "t-gefahr"
    : (status === "bald" ? "t-warnung" : (status === "ok" ? "t-erfolg" : "t-leise"));
  const statusZeile = el("p", "datenzeile-hinweis " + ton, statusText[status]);
  k.inhalt.appendChild(statusZeile);
  gitter.appendChild(k);

  /* Kleine Einordnung: wie viele Geräte teilen dieses Beschaffungsjahr? */
  if (!neuModus) {
    const kEinordnung = karte("Einordnung",
      "Zum Vergleich innerhalb der ganzen Geräteliste.");
    const kacheln = el("div", "kacheln");
    const gleichesJahr = alleGeraete.filter(z =>
      String(z.Beschaffungsjahr || "").trim() === beschaffung && beschaffung);
    const ueberfaellig = alleGeraete.filter(z => z.__ersatzStatus === "ueberfaellig");
    const ohneJahr = alleGeraete.filter(z => !String(z.Beschaffungsjahr || "").trim());
    kacheln.appendChild(kachel("Geräte mit demselben Beschaffungsjahr",
      beschaffung ? String(gleichesJahr.length) : "", beschaffung || "kein Jahr erfasst"));
    kacheln.appendChild(kachel("Ersatz überfällig (ganze Flotte)",
      String(ueberfaellig.length), "von " + alleGeraete.length + " Geräten",
      ueberfaellig.length ? "gefahr" : null));
    kacheln.appendChild(kachel("Ohne Beschaffungsjahr", String(ohneJahr.length),
      "von " + alleGeraete.length + " Geräten", ohneJahr.length ? "warnung" : null));
    kEinordnung.inhalt.appendChild(kacheln);
    gitter.appendChild(kEinordnung);
  }

  ziel.appendChild(gitter);
}

/* ---------- Benutzer ---------- */

function benutzerFensterOeffnen(id) {
  const adresse = "benutzer.html?id=" + encodeURIComponent(id)
    + (mockModus ? "&mock=1" : "");
  window.open(adresse, "benutzer-" + id);
}

function bereichBenutzer(ziel) {
  const gitter = kartenGitter();
  const personen = zugeordneteBenutzer();

  const k = karte("Zugeordnete Benutzer",
    "Alle Benutzer, deren Feld «Computer» auf «" + textWert("Title")
    + "» zeigt. Die Zuordnung wird in der Liste «Benutzer» gespeichert.");

  if (!personen.length) {
    k.inhalt.appendChild(leerHinweis("Diesem Gerät ist zurzeit kein Benutzer zugeordnet."));
  } else {
    for (const b of personen) {
      const z = el("div", "g-person");

      const links = el("div");
      const name = el("a", "g-person-name", b.__name || b.Title);
      name.href = "benutzer.html?id=" + encodeURIComponent(b.id)
        + (mockModus ? "&mock=1" : "");
      name.addEventListener("click", function (e) {
        e.preventDefault();
        benutzerFensterOeffnen(b.id);
      });
      links.appendChild(name);
      const unter = [];
      unter.push(String(b.Title || "").trim() || "ohne Login");
      if (String(b.Abteilung || "").trim()) unter.push(String(b.Abteilung).trim());
      if (String(b.Funktion || "").trim()) unter.push(String(b.Funktion).trim());
      if (!b.__adAktiv) unter.push("AD-Konto deaktiviert");
      links.appendChild(el("div", "g-person-unter", unter.join(" · ")));
      z.appendChild(links);

      const knoepfe = el("div", "g-person-knoepfe");
      knoepfe.appendChild(knopf("Benutzerfenster", null, function () {
        benutzerFensterOeffnen(b.id);
      }));
      knoepfe.appendChild(knopf("Zuordnung lösen", "knopf-leise", function () {
        zuordnungLoesenDialog(b);
      }));
      z.appendChild(knoepfe);
      k.inhalt.appendChild(z);
    }
  }

  const aktionen = el("div", "datenzeile-zeile");
  aktionen.appendChild(knopf("Benutzer zuordnen", "knopf-primaer", zuordnenDialog));
  k.inhalt.appendChild(aktionen);
  gitter.appendChild(k);

  /* Was SCCM über die Benutzer dieses Geräts weiss. */
  const kSccm = karte("Benutzer laut SCCM",
    "Schreibgeschützt. Weicht ein Konto von der Zuordnung ab, steht hier ein Hinweis.");

  const abweichungen = benutzerAbweichungen();
  for (const a of abweichungen) {
    const z = el("div", "g-hinweis t-info");
    z.appendChild(symbol(SYMBOL_INFO, 16));
    const rechts = el("div");
    rechts.appendChild(el("div", "g-hinweis-titel", a.titel));
    rechts.appendChild(el("div", "g-hinweis-text", a.text));
    z.appendChild(rechts);
    kSccm.inhalt.appendChild(z);
  }

  const f = el("div", "datenzeilen");
  f.appendChild(feldZeile("Primärer Benutzer (SCCM)", zeile.SCCM_PrimaryUser, null, true));
  f.appendChild(feldZeile("Letzter angemeldeter Benutzer", zeile.SCCM_LastLogonUser, null, true));
  f.appendChild(feldZeile("Aktuell angemeldet", zeile.SCCM_CurrentLogonUser, null, true));
  f.appendChild(feldZeile("Hauptbenutzer (Konsole)", zeile.SCCM_TopConsoleUser, null, true));
  f.appendChild(datumZeile("Letzte Benutzeranmeldung", zeile.SCCM_LastConsoleUse));
  kSccm.inhalt.appendChild(f);

  const konsole = Hilfe.zeilen(zeile.SCCM_ConsoleUsers).map(Hilfe.felder);
  kSccm.inhalt.appendChild(el("h3", "g-untertitel", "Konsolenbenutzer"));
  if (!konsole.length) {
    kSccm.inhalt.appendChild(leerHinweis("Keine Konsolennutzung erfasst."));
  } else {
    kSccm.inhalt.appendChild(tabelle(["Konto", "Anmeldungen", "Nutzung", "Zuletzt"],
      konsole.map(function (fe) {
        const anmeldungen = (/(\d+)/.exec(fe[1] || "") || [])[1] || "";
        const minuten = Number((/(\d+)/.exec(fe[2] || "") || [])[1] || 0);
        const stunden = minuten ? Hilfe.zahlText(minuten / 60, 1) + " h" : "";
        const zuletzt = String(fe[3] || "").replace(/^zuletzt\s*/i, "");
        return [fe[0] || "", anmeldungen, stunden, zuletzt];
      })));
  }
  gitter.appendChild(kSccm);

  ziel.appendChild(gitter);
}

/* ---------- Stammdaten ---------- */

function bereichStammdaten(ziel) {
  const gitter = kartenGitter();

  const k = karte("Stammdaten",
    "Von Hand gepflegte Felder. Der SCCM-Abgleich fasst sie nie an.");
  const felder = el("div", "datenzeilen");
  for (const s of STAMM_SPALTEN) {
    felder.appendChild(formularZeile(s, s.i === "Title" ? {
      hinweis: "Schlüssel für den SCCM-Abgleich und für die Zuordnung der "
        + "Benutzer. Muss genau dem Gerätenamen in SCCM entsprechen."
    } : null));
  }
  k.inhalt.appendChild(felder);
  gitter.appendChild(k);

  const kBemerkung = karte("Bemerkung", "Freitext, mehrzeilig.");
  const feld = eingabeFuer(BEMERKUNG);
  const huelle = el("div");
  huelle.appendChild(feld);
  kBemerkung.inhalt.appendChild(huelle);
  gitter.appendChild(kBemerkung);

  if (!neuModus) {
    const kHerkunft = karte("Herkunft der Daten",
      "Zum Vergleich die entsprechenden Werte aus SCCM.");
    const f = el("div", "datenzeilen");
    f.appendChild(feldZeile("SCCM Gerätename", zeile.SCCM_Name, null, true));
    f.appendChild(feldZeile("Seriennummer (SCCM)", zeile.SCCM_SerialNumber, null, true));
    f.appendChild(feldZeile("In SCCM vorhanden", zeile.SCCM_Found, null, true));
    f.appendChild(datumZeile("Letzte Synchronisation", zeile.SCCM_LastSync));
    f.appendChild(feldZeile("Listen-ID (SharePoint)", zeile.id, null, true));
    kHerkunft.inhalt.appendChild(f);
    gitter.appendChild(kHerkunft);
  }

  ziel.appendChild(gitter);
}

/* ---------- Software (nur SCCM) ---------- */

function bereichSoftware(ziel) {
  const gitter = kartenGitter();

  /* Deployments aus SCCM. */
  const deployments = Hilfe.zeilen(zeile.SCCM_DeployedApps).map(Hilfe.felder);
  const kDeploy = karte("Zugewiesene Applikationen (Deployments)",
    "Aus SCCM, schreibgeschützt. " + (zeile.SCCM_AppsInstalled || 0) + " installiert, "
    + (zeile.SCCM_AppsRequired || 0) + " erforderlich.", true);
  if (!deployments.length) {
    kDeploy.inhalt.appendChild(leerHinweis("Keine Zuweisungen erfasst."));
  } else {
    kDeploy.inhalt.appendChild(tabelle(["Applikation", "Sammlung", "Zweck", "Status"],
      deployments.map(function (f) {
        const status = f[3] || "";
        const ton = /erfolg/i.test(status) ? "erfolg"
          : (/fehl/i.test(status) ? "gefahr"
            : (/ausstehend|pending/i.test(status) ? "warnung" : null));
        return [f[0] || "", f[1] || "", f[2] || "", chip(status || "unbekannt", ton)];
      })));
  }
  gitter.appendChild(kDeploy);

  /* Installierte Software. */
  const installiert = Hilfe.zeilen(zeile.SCCM_InstalledSoftware).map(Hilfe.felder);
  const kInstalliert = karte("Installierte Software (Add/Remove)",
    "Aus dem Software-Inventar von SCCM. Gezählt sind "
    + (zeile.SCCM_InstalledSoftwareCount || installiert.length) + " Einträge, "
    + "aufgeführt werden die vom Abgleich übernommenen.");
  const werkzeuge = el("div", "g-werkzeuge");
  const isSuche = el("input", "g-eingabe");
  isSuche.type = "search";
  isSuche.id = "g-suche-installiert";
  isSuche.placeholder = "Installierte Software suchen …";
  isSuche.value = swInstalliertSuche;
  isSuche.autocomplete = "off";
  isSuche.setAttribute("aria-label", "Installierte Software suchen");
  isSuche.addEventListener("input", function () {
    swInstalliertSuche = isSuche.value;
    zeichneBereich(true);
  });
  werkzeuge.appendChild(isSuche);
  kInstalliert.inhalt.appendChild(werkzeuge);

  const isText = swInstalliertSuche.trim().toLowerCase();
  const gefiltert = installiert.filter(f => !isText
    || String(f[0] || "").toLowerCase().indexOf(isText) > -1);
  if (!gefiltert.length) {
    kInstalliert.inhalt.appendChild(leerHinweis(installiert.length
      ? "Kein Eintrag passt zur Suche." : "Keine Software erfasst."));
  } else {
    kInstalliert.inhalt.appendChild(tabelle(["Name", "Version"],
      gefiltert.map(f => [f[0] || "", f[1] || ""])));
  }
  gitter.appendChild(kInstalliert);

  /* Office und Sammlungen. */
  const kOffice = karte("Office-Produkte");
  const office = Hilfe.zeilen(zeile.SCCM_Office).map(Hilfe.felder);
  if (!office.length) kOffice.inhalt.appendChild(leerHinweis("Kein Office-Produkt erfasst."));
  else kOffice.inhalt.appendChild(tabelle(["Produkt", "Version"],
    office.map(f => [f[0] || "", f[1] || ""])));
  gitter.appendChild(kOffice);

  const kSammlungen = karte("Sammlungen (Collections)",
    "Mitgliedschaften in SCCM. Sie steuern, welche Software und welche "
    + "Einstellungen das Gerät erhält.");
  const sammlungen = Hilfe.zeilen(zeile.SCCM_Collections);
  if (!sammlungen.length) {
    kSammlungen.inhalt.appendChild(leerHinweis("Keine Sammlungen erfasst."));
  } else {
    const chips = el("div", "chips");
    for (const s of sammlungen) chips.appendChild(chip(s));
    kSammlungen.inhalt.appendChild(chips);
  }
  gitter.appendChild(kSammlungen);

  ziel.appendChild(gitter);
}

/* ---------- Hardware ---------- */

function bereichHardware(ziel) {
  const gitter = kartenGitter();

  const kGeraet = karte("Gerät");
  const f1 = el("div", "datenzeilen");
  f1.appendChild(feldZeile("Hersteller", zeile.SCCM_Manufacturer, null, true));
  f1.appendChild(feldZeile("Modell", zeile.SCCM_Model, null, true));
  f1.appendChild(feldZeile("Gehäusetyp", zeile.SCCM_ChassisType, null, true));
  f1.appendChild(feldZeile("Seriennummer (Inventar)", textWert("Seriennummer"), null, false));
  f1.appendChild(feldZeile("Seriennummer (SCCM)", zeile.SCCM_SerialNumber, null, true));
  f1.appendChild(feldZeile("SMBIOS GUID", zeile.SCCM_SMBIOSGUID, null, true));
  f1.appendChild(feldZeile("Virtuelle Maschine", zeile.SCCM_IsVirtual, null, true));
  kGeraet.inhalt.appendChild(f1);
  gitter.appendChild(kGeraet);

  const kRechen = karte("Prozessor und Speicher");
  const f2 = el("div", "datenzeilen");
  f2.appendChild(feldZeile("Prozessor", zeile.SCCM_CPU, null, true));
  f2.appendChild(feldZeile("Kerne / logische Prozessoren",
    (zeile.SCCM_CPUCores || "—") + " / " + (zeile.SCCM_CPULogical || "—"), null, true));
  f2.appendChild(feldZeile("Arbeitsspeicher",
    zeile.SCCM_RAMGB ? Hilfe.zahlText(zeile.SCCM_RAMGB, 0) + " GB" : "", null, true));
  const frei = zahlOderNull(zeile.SCCM_DiskCFreeGB);
  const gesamt = zahlOderNull(zeile.SCCM_DiskCGB);
  f2.appendChild(feldZeile("Laufwerk C:", gesamt
    ? Hilfe.zahlText(frei, 1) + " GB frei von " + Hilfe.zahlText(gesamt, 0) + " GB"
    : "", gesamt && frei !== null
      ? Hilfe.zahlText(gesamt - frei, 1) + " GB belegt" : null, true));
  kRechen.inhalt.appendChild(f2);
  gitter.appendChild(kRechen);

  const kDisks = karte("Physische Datenträger");
  const disks = Hilfe.zeilen(zeile.SCCM_PhysicalDisks).map(Hilfe.felder);
  if (!disks.length) kDisks.inhalt.appendChild(leerHinweis("Keine Datenträger erfasst."));
  else kDisks.inhalt.appendChild(tabelle(["Datenträger", "Zustand"],
    disks.map(f => [f[0] || "", f.slice(1).join(" · ")])));
  gitter.appendChild(kDisks);

  const kBios = karte("BIOS, TPM und Akku");
  const f3 = el("div", "datenzeilen");
  f3.appendChild(feldZeile("BIOS-Version", zeile.SCCM_BIOSVersion, null, true));
  const biosAlter = Hilfe.tageHer(zeile.SCCM_BIOSDate);
  f3.appendChild(feldZeile("BIOS-Datum", Hilfe.datumText(zeile.SCCM_BIOSDate),
    biosAlter === null ? null : "vor " + Math.round(biosAlter / 30) + " Monaten", true));
  f3.appendChild(feldZeile("TPM-Version", zeile.SCCM_TPMVersion, null, true));
  f3.appendChild(feldZeile("TPM aktiviert", zeile.SCCM_TPMEnabled, null, true));
  const akku = akkuProzent();
  f3.appendChild(feldZeile("Akku", zeile.SCCM_Battery,
    akku === null ? null : (akku < 50 ? "Ersatz prüfen" : "in Ordnung"), true));
  kBios.inhalt.appendChild(f3);
  gitter.appendChild(kBios);

  const kMonitore = karte("Monitore");
  const monitore = Hilfe.zeilen(zeile.SCCM_Monitors).map(Hilfe.felder);
  if (!monitore.length) kMonitore.inhalt.appendChild(leerHinweis("Keine Monitore erfasst."));
  else kMonitore.inhalt.appendChild(tabelle(["Monitor", "Auflösung"],
    monitore.map(f => [f[0] || "", f[1] || ""])));
  gitter.appendChild(kMonitore);

  ziel.appendChild(gitter);
}

/* ---------- System und Netzwerk ---------- */

function bereichSystem(ziel) {
  const gitter = kartenGitter();

  const kOs = karte("Betriebssystem");
  const f1 = el("div", "datenzeilen");
  f1.appendChild(feldZeile("Betriebssystem", zeile.SCCM_OS, null, true));
  f1.appendChild(feldZeile("OS-Version (Build)", zeile.SCCM_OSVersion, null, true));
  f1.appendChild(datumZeile("Installiert am", zeile.SCCM_OSInstallDate));
  const tageBoot = Hilfe.tageHer(zeile.SCCM_LastBoot);
  f1.appendChild(feldZeile("Letzter Neustart", Hilfe.datumZeitText(zeile.SCCM_LastBoot),
    tageBoot === null ? null : "Laufzeit " + tageBoot + " Tage", true));
  f1.appendChild(feldZeile("Sprache", zeile.SCCM_OSLanguage, null, true));
  f1.appendChild(feldZeile("Systemtyp", zeile.SCCM_SystemType, null, true));
  kOs.inhalt.appendChild(f1);
  gitter.appendChild(kOs);

  const kNetz = karte("Netzwerk");
  const f2 = el("div", "datenzeilen");
  f2.appendChild(feldZeile("IPv4-Adresse", zeile.SCCM_IPv4, null, true));
  f2.appendChild(feldZeile("Alle IP-Adressen", zeile.SCCM_IPAddresses, null, true));
  f2.appendChild(feldZeile("MAC-Adressen", zeile.SCCM_MACAddresses, null, true));
  f2.appendChild(feldZeile("DHCP", zeile.SCCM_DHCP, null, true));
  f2.appendChild(feldZeile("Management Point", zeile.SCCM_ManagementPoint, null, true));
  f2.appendChild(feldZeile("Boundary Groups", zeile.SCCM_BoundaryGroups, null, true));
  kNetz.inhalt.appendChild(f2);
  gitter.appendChild(kNetz);

  const kAd = karte("Active Directory und Entra ID");
  const f3 = el("div", "datenzeilen");
  f3.appendChild(feldZeile("Domäne", zeile.SCCM_Domain, null, true));
  f3.appendChild(feldZeile("AD Distinguished Name", zeile.SCCM_OU, null, true));

  // Den DN in einen lesbaren OU-Pfad zerlegen: von hinten nach vorne.
  const teile = String(zeile.SCCM_OU || "").split(",").map(t => t.trim()).filter(t => t);
  const ous = teile.filter(t => /^OU=/i.test(t)).map(t => t.substring(3));
  const dcs = teile.filter(t => /^DC=/i.test(t)).map(t => t.substring(3));
  if (ous.length || dcs.length) {
    f3.appendChild(feldZeile("OU-Pfad",
      dcs.join(".") + (ous.length ? " / " + ous.reverse().join(" / ") : ""), null, true));
  }
  f3.appendChild(feldZeile("AD Standort", zeile.SCCM_ADSite, null, true));
  f3.appendChild(datumZeile("AD Computerkonto erstellt", zeile.SCCM_ADCreated));
  f3.appendChild(datumZeile("AD letzte Anmeldung", zeile.SCCM_ADLastLogon));
  f3.appendChild(feldZeile("Entra Device ID", zeile.SCCM_AADDeviceID, null, true));
  f3.appendChild(feldZeile("Co-Managed (Intune)", zeile.SCCM_CoManaged, null, true));
  kAd.inhalt.appendChild(f3);
  gitter.appendChild(kAd);

  ziel.appendChild(gitter);
}

/* ---------- Sicherheit ---------- */

function bereichSicherheit(ziel) {
  const gitter = kartenGitter();

  const signaturAlter = Hilfe.tageHer(zeile.SCCM_EPSignatureDate);
  const kDefender = karte("Microsoft Defender");
  const f1 = el("div", "datenzeilen");
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
  kDefender.inhalt.appendChild(f1);
  gitter.appendChild(kDefender);

  const kVerschluesselung = karte("Verschlüsselung und Verwaltung");
  const f2 = el("div", "datenzeilen");
  f2.appendChild(feldZeile("BitLocker", zeile.SCCM_BitLocker, null, true));
  f2.appendChild(feldZeile("TPM-Version", zeile.SCCM_TPMVersion, null, true));
  f2.appendChild(feldZeile("TPM aktiviert", zeile.SCCM_TPMEnabled, null, true));
  f2.appendChild(feldZeile("Co-Managed (Intune)", zeile.SCCM_CoManaged, null, true));
  kVerschluesselung.inhalt.appendChild(f2);

  const chips = el("div", "chips");
  chips.appendChild(chip(zeile.SCCM_BitLocker || "BitLocker unbekannt",
    zeile.SCCM_BitLocker ? (/nicht/i.test(zeile.SCCM_BitLocker) ? "gefahr" : "erfolg") : null));
  chips.appendChild(chip(Hilfe.istJa(zeile.SCCM_TPMEnabled) ? "TPM aktiv" : "TPM nicht aktiv",
    Hilfe.istJa(zeile.SCCM_TPMEnabled) ? "erfolg" : "warnung"));
  chips.appendChild(chip(Hilfe.istJa(zeile.SCCM_EPEnabled) ? "Defender aktiv" : "Defender inaktiv",
    Hilfe.istJa(zeile.SCCM_EPEnabled) ? "erfolg" : "gefahr"));
  kVerschluesselung.inhalt.appendChild(chips);
  gitter.appendChild(kVerschluesselung);

  ziel.appendChild(gitter);
}

/* ---------- SCCM-Client und Aktivität ---------- */

function bereichAktivitaet(ziel) {
  const gitter = kartenGitter();

  const kClient = karte("SCCM-Client");
  const f1 = el("div", "datenzeilen");
  f1.appendChild(feldZeile("In SCCM vorhanden", zeile.SCCM_Found, null, true));
  f1.appendChild(feldZeile("Gerätename in SCCM", zeile.SCCM_Name, null, true));
  f1.appendChild(feldZeile("ResourceID", zeile.SCCM_ResourceID, null, true));
  f1.appendChild(feldZeile("SMSID", zeile.SCCM_SMSID, null, true));
  f1.appendChild(feldZeile("Client-Version", zeile.SCCM_ClientVersion, null, true));
  f1.appendChild(feldZeile("Client aktiv", zeile.SCCM_ClientActive, null, true));
  f1.appendChild(feldZeile("Client-Prüfung bestanden", zeile.SCCM_ClientCheckPass, null, true));
  f1.appendChild(feldZeile("Sync-Status", zeile.SCCM_SyncStatus, null, true));
  f1.appendChild(datumZeile("Letzte Synchronisation", zeile.SCCM_LastSync));
  kClient.inhalt.appendChild(f1);
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
    kAchse.inhalt.appendChild(leerHinweis("Keine Zeitstempel vorhanden."));
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
    kAchse.inhalt.appendChild(achse);
  }
  gitter.appendChild(kAchse);

  ziel.appendChild(gitter);
}

/* ---------- Flottenvergleich ---------- */

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
    "Verglichen wird mit " + geraete.length + " Geräten, die in SCCM stehen.", true);

  function werteVon(fn) {
    const w = [];
    for (const z of geraete) {
      const v = fn(z);
      if (v !== null && v !== undefined && !isNaN(v)) w.push(v);
    }
    return w;
  }

  kVergleich.inhalt.appendChild(vergleichsZeile("Freier Speicher auf C:",
    zahlOderNull(zeile.SCCM_DiskCFreeGB),
    werteVon(z => zahlOderNull(z.SCCM_DiskCFreeGB)), "GB", true, 1));
  kVergleich.inhalt.appendChild(vergleichsZeile("Arbeitsspeicher",
    zahlOderNull(zeile.SCCM_RAMGB),
    werteVon(z => zahlOderNull(z.SCCM_RAMGB)), "GB", true, 0));
  kVergleich.inhalt.appendChild(vergleichsZeile("CPU-Kerne",
    zahlOderNull(zeile.SCCM_CPUCores),
    werteVon(z => zahlOderNull(z.SCCM_CPUCores)), "", true, 0));
  kVergleich.inhalt.appendChild(vergleichsZeile("Tage seit letzter Aktivität",
    Hilfe.tageHer(zeile.SCCM_LastActive),
    werteVon(z => Hilfe.tageHer(z.SCCM_LastActive)), "Tage", false, 0));
  kVergleich.inhalt.appendChild(vergleichsZeile("Alter seit OS-Installation",
    Hilfe.tageHer(zeile.SCCM_OSInstallDate),
    werteVon(z => Hilfe.tageHer(z.SCCM_OSInstallDate)), "Tage", false, 0));
  kVergleich.inhalt.appendChild(vergleichsZeile("Alter des AD-Computerkontos",
    Hilfe.tageHer(zeile.SCCM_ADCreated),
    werteVon(z => Hilfe.tageHer(z.SCCM_ADCreated)), "Tage", false, 0));
  kVergleich.inhalt.appendChild(vergleichsZeile("Anzahl installierte Software",
    zahlOderNull(zeile.SCCM_InstalledSoftwareCount),
    werteVon(z => zahlOderNull(z.SCCM_InstalledSoftwareCount)), "", true, 0));
  gitter.appendChild(kVergleich);

  function gruppenKarte(titel, feld, wertText) {
    const gleiche = geraete.filter(z =>
      String(z[feld] || "").trim() === String(wertText || "").trim());
    const k = karte(titel);
    if (!wertText) {
      k.inhalt.appendChild(leerHinweis("Kein Wert hinterlegt, deshalb kein Vergleich."));
      return k;
    }
    const online = gleiche.filter(z => Hilfe.istJa(z.SCCM_Online)).length;
    const freie = [];
    for (const z of gleiche) {
      const v = zahlOderNull(z.SCCM_DiskCFreeGB);
      if (v !== null) freie.push(v);
    }
    const kacheln = el("div", "kacheln");
    kacheln.appendChild(kachel(wertText, String(gleiche.length), "Geräte"));
    kacheln.appendChild(kachel("davon online", String(online), "laut SCCM"));
    kacheln.appendChild(kachel("Median freier Speicher",
      freie.length ? Hilfe.zahlText(median(freie), 1) + " GB" : "", "auf Laufwerk C:"));
    k.inhalt.appendChild(kacheln);
    return k;
  }

  gitter.appendChild(gruppenKarte("Geräte mit demselben Modell", "SCCM_Model", zeile.SCCM_Model));
  gitter.appendChild(gruppenKarte("Geräte mit demselben Beschaffungsjahr",
    "Beschaffungsjahr", textWert("Beschaffungsjahr")));
  gitter.appendChild(gruppenKarte("Geräte im selben Gebäude / Stock", "GebaeudeStock",
    textWert("GebaeudeStock")));

  ziel.appendChild(gitter);
}

/* ---------- Alle Felder ---------- */

function bereichFelder(ziel) {
  const k = karte("Alle Felder", "Der vollständige Datensatz dieser Zeile, "
    + "gruppiert wie in der SharePoint-Liste.", true);

  const werkzeuge = el("div", "g-werkzeuge");
  const suche = el("input", "g-eingabe");
  suche.type = "search";
  suche.id = "g-suche-felder";
  suche.placeholder = "Feld oder Wert suchen …";
  suche.value = rohSuche;
  suche.autocomplete = "off";
  suche.setAttribute("aria-label", "Feld oder Wert suchen");
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

  werkzeuge.appendChild(knopf("Alles als JSON kopieren", "knopf-leise", function () {
    const roh = {};
    roh.id = zeile.id;
    for (const s of SPALTEN) roh[s.i] = wert(s.i);
    kopieren(JSON.stringify(roh, null, 2), "Datensatz als JSON kopiert.");
  }));
  k.inhalt.appendChild(werkzeuge);

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
    k.inhalt.appendChild(el("h3", "g-untertitel", gruppe));

    for (const s of spalten) {
      const z = el("div", "g-roh-zeile");
      const name = el("div", "g-roh-name", s.d);
      name.appendChild(el("span", "g-roh-intern", s.i + " · " + s.t
        + " · " + (s.q === "manuell" ? "von Hand" : "aus " + s.q.toUpperCase())));
      z.appendChild(name);

      const roh = wert(s.i);
      let text;
      if (s.t === "Boolean") text = Hilfe.istJa(roh) ? "Ja" : "Nein";
      else if (s.t === "DateTime" && roh) {
        text = Hilfe.datumZeitText(roh) + " (" + Hilfe.relativText(roh) + ")";
      } else text = (roh === null || roh === undefined) ? "" : String(roh);
      z.appendChild(el("div", "g-roh-wert", text === "" ? "—" : text));

      const kopierKnopf = el("button", "g-kopierknopf", "kopieren");
      kopierKnopf.type = "button";
      kopierKnopf.addEventListener("click", function () {
        kopieren(text, "«" + s.d + "» kopiert.");
      });
      z.appendChild(kopierKnopf);
      k.inhalt.appendChild(z);
    }
  }
  if (!gezeigt) k.inhalt.appendChild(leerHinweis("Kein Feld passt zur Suche."));
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
   7. Kopf, Navigation und Aktionen
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
    if (textWert("GebaeudeStock")) unter.push(textWert("GebaeudeStock"));
    if (zeile && zeile.SCCM_Model) unter.push(String(zeile.SCCM_Model));
    const personen = zugeordneteBenutzer();
    if (personen.length) unter.push(personen.map(b => b.__name || b.Title).join(", "));
    if (zeile && zeile.id) unter.push("Listen-ID " + zeile.id);
  }
  /* Der Untertitel wird in einer schmalen Kopfzeile mit «…» gekürzt
     (design.css). Damit nichts verloren geht, steht der volle Text als
     Tooltip daran. */
  const unterText = unter.join(" · ");
  $("g-unter").textContent = unterText;
  $("g-unter").title = unterText;

  const status = leeren($("g-status"));
  if (!neuModus && zeile) {
    const inSccm = Hilfe.istJa(zeile.SCCM_Found);
    status.appendChild(chip(Hilfe.istJa(zeile.SCCM_Online) ? "Online" : "Offline",
      Hilfe.istJa(zeile.SCCM_Online) ? "erfolg" : null));
    status.appendChild(chip(inSccm ? "In SCCM" : "Nicht in SCCM",
      inSccm ? "erfolg" : "warnung"));
    if (inSccm) {
      status.appendChild(chip(Hilfe.istJa(zeile.SCCM_ClientActive)
        ? "Client aktiv" : "Client inaktiv",
        Hilfe.istJa(zeile.SCCM_ClientActive) ? "erfolg" : "warnung"));
      if (Hilfe.istJa(zeile.SCCM_CoManaged)) status.appendChild(chip("Co-Managed", "info"));
      if (Hilfe.istJa(zeile.SCCM_IsVirtual)) status.appendChild(chip("Virtuell", "info"));
    }
    const es = ersatzStatus();
    if (es === "ueberfaellig") status.appendChild(chip("Ersatz überfällig", "gefahr"));
    else if (es === "bald") status.appendChild(chip("Ersatz in diesem GJ", "warnung"));
  }

  aktionenZeichnen();
}

function aktionenZeichnen() {
  const ziel = leeren($("g-aktionen"));
  if (geloescht) return;

  ziel.appendChild(knopf("Neu laden", null, function () {
    if (anzahlAenderungen() && !window.confirm(
        "Es gibt ungespeicherte Änderungen. Beim Neuladen gehen sie verloren. "
        + "Trotzdem neu laden?")) return;
    entwurf = {};
    neuLaden();
  }));

  if (!neuModus) {
    ziel.appendChild(knopf("Duplizieren", "knopf-leise", function () {
      const adresse = "geraet.html?neu=1&vorlage=" + encodeURIComponent(zeile.id)
        + (mockModus ? "&mock=1" : "");
      window.open(adresse, "geraet-neu");
    }));

    ziel.appendChild(knopf("Löschen", "knopf-leise", loeschenDialog));
  }
}

/* Das Logo im Kopf führt zur Übersicht. Im Vorführmodus muss der Parameter
   mitgehen, sonst landet man dort auf der Anmeldung. */
function logoZeichnen() {
  const verweis = $("g-logo");
  if (!verweis) return;
  verweis.href = "index.html" + (mockModus ? "?mock=1" : "");
}

function adresseFuer(id) {
  return "geraet.html?id=" + encodeURIComponent(id) + (mockModus ? "&mock=1" : "");
}

/* Die Seitennavigation. Die Spalte selbst (.fenster-nav) reicht bis zum
   unteren Fensterrand; die Knöpfe stehen in einem eigenen Behälter
   (.fenster-nav-menue), der darin klebt beziehungsweise auf schmalen
   Fenstern zur waagrecht rollenden Reiterleiste wird. */
function navZeichnen() {
  const nav = leeren($("g-nav"));
  nav.hidden = false;
  const menue = el("div", "fenster-nav-menue");
  for (const b of sichtbareBereiche()) {
    const k = el("button", "fenster-nav-knopf" + (b.k === aktiverBereich ? " aktiv" : ""), b.d);
    k.type = "button";
    if (b.k === aktiverBereich) k.setAttribute("aria-current", "true");
    k.addEventListener("click", function () {
      aktiverBereich = b.k;
      location.hash = "#" + b.k;
      navZeichnen();
      zeichneBereich(false);
    });
    menue.appendChild(k);
  }
  nav.appendChild(menue);

  /* Auf schmalen Fenstern ist die Navigation eine waagrecht rollende
     Leiste. Nach dem Neuzeichnen soll der aktive Eintrag sichtbar bleiben.
     «nearest» rührt nichts an, wenn er ohnehin schon zu sehen ist. */
  const aktiv = menue.querySelector(".fenster-nav-knopf.aktiv");
  if (aktiv && aktiv.scrollIntoView) {
    aktiv.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}

/* Zeichnet den aktiven Bereich neu. «fokusHalten» setzt den Fokus danach
   auf das gleichnamige Feld zurück, damit Tippen nicht abreisst. */
function zeichneBereich(fokusHalten) {
  const vorher = document.activeElement;
  const vorherId = vorher && vorher.id ? vorher.id : null;
  let anfang = null;
  try { anfang = vorher ? vorher.selectionStart : null; } catch (e) { anfang = null; }

  const ziel = leeren($("g-bereich"));
  ziel.hidden = false;
  const bereich = sichtbareBereiche().filter(b => b.k === aktiverBereich)[0]
    || sichtbareBereiche()[0];
  aktiverBereich = bereich.k;
  bereich.f(ziel);

  if (fokusHalten && vorherId) {
    const nachher = $(vorherId);
    if (nachher && nachher.focus) {
      nachher.focus();
      if (anfang !== null) {
        try { nachher.setSelectionRange(anfang, anfang); } catch (e) { /* type=search */ }
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
   8. Laden, Speichern, Anlegen, Löschen, Zuordnung
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
  k.textContent = knopfText || "Erneut laden";
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
  $("g-laden-fortschritt").textContent = "";
}

/* Eine leere Zeile mit allen Spalten, für «Neues Gerät». */
function leereZeile() {
  const z = {};
  for (const s of SPALTEN) z[s.i] = s.t === "Boolean" ? false : "";
  z.id = null;
  return z;
}

/* Die abgeleiteten Felder für eine Zeile, die (noch) nicht in der Liste
   steht. Modell.anreichern läuft immer über die ganzen Listen und darf
   deshalb hier nicht aufgerufen werden. */
function abgeleiteteFelder(z) {
  z.__benutzer = [];
  z.__benutzerNamen = "";
  z.__inSccm = false;
  z.__online = false;
  z.__ersatzJahr = String(z.ErsatzGeplant || "").trim()
    || Modell.ersatzVorschlag(z.Beschaffungsjahr);
  z.__ersatzStatus = Modell.ersatzStatus(z.ErsatzGeplant, z.Beschaffungsjahr);
  z.__such = "";
  return z;
}

/* «still» lädt im Hintergrund nach, ohne die Seite gegen den Spinner zu
   tauschen: nach dem Speichern soll der Inhalt stehen bleiben. */
async function datenLaden(still) {
  if (!still) {
    zeigeLaden(mockModus ? "Vorführdaten werden aufgebaut …"
                         : "Daten werden aus SharePoint geladen …");
  }
  let anzahlGeraete = 0, anzahlBenutzer = 0;
  const fortschritt = function () {
    if (still) return;
    $("g-laden-fortschritt").textContent =
      "Geräte " + anzahlGeraete + " / Benutzer " + anzahlBenutzer;
  };

  const [rohGeraete, rohBenutzer] = await Promise.all([
    Daten.computer(function (n) { anzahlGeraete = n; fortschritt(); }),
    Daten.benutzer(function (n) { anzahlBenutzer = n; fortschritt(); })
  ]);

  /* programme.json wird hier nur für die Vollständigkeit des Modells
     geladen. Die Berechtigungen selbst stehen im Benutzerfenster; scheitert
     der Zugriff, ist das für dieses Fenster kein Grund zum Abbruch. */
  let programme = null;
  try { programme = await Daten.programme(); } catch (e) { programme = null; }

  const ergebnis = Modell.anreichern(rohGeraete, rohBenutzer, programme);
  alleGeraete = ergebnis.computer;
  alleBenutzer = ergebnis.benutzer;
}

function zeileWaehlen() {
  if (neuModus) {
    const grund = leereZeile();
    if (vorlageId) {
      const vorlage = alleGeraete.filter(z => String(z.id) === String(vorlageId))[0];
      if (vorlage) {
        for (const s of SPALTEN) {
          if (!istBearbeitbar(s)) continue;
          if (NICHT_DUPLIZIEREN.indexOf(s.i) > -1) continue;
          grund[s.i] = vorlage[s.i];
        }
      }
    }
    zeile = abgeleiteteFelder(grund);
    return;
  }

  const treffer = alleGeraete.filter(z => String(z.id) === String(elementId))[0];
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
    ladeFehlerZeigen(fehler);
  }
}

function ladeFehlerZeigen(fehler) {
  const meldung = fehler && fehler.message ? fehler.message : String(fehler);
  zeigeFehler("Die Daten konnten nicht geladen werden", meldung,
    mockModus ? "" : "Zum Anschauen ohne Anmeldung dieses Fenster mit &mock=1 aufrufen.");
}

/* ---------- Prüfen ---------- */

function pruefen() {
  const name = textWert("Title").trim();
  if (!name) return { feld: "Title", text: "Der PC-Name darf nicht leer sein." };

  for (const feld of ["Beschaffungsjahr", "ErsatzGeplant"]) {
    const w = textWert(feld).trim();
    if (w && !Modell.gjGueltig(w)) {
      return { feld: feld, text: "«" + SPALTE[feld].d + "» muss ein Geschäftsjahr in "
        + "der Form «2023/2024» sein (zwei aufeinanderfolgende Jahre)." };
    }
  }
  return null;
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
  if (speichertGerade || geloescht) return;
  const fehler = pruefen();
  if (fehler) {
    speicherFehler = fehler.text;
    speicherleisteZeichnen();
    toast(fehler.text, true);
    const feld = $("g-eingabe-" + fehler.feld);
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
      const neueZeile = await Daten.anlegen("computer", felder);
      elementId = String(neueZeile.id);
      neuModus = false;
      entwurf = {};
      history.replaceState(null, "", adresseFuer(elementId));
      melden("zeile-neu", elementId);
      speichertGerade = false;
      await datenLaden(true);
      zeileWaehlen();
      zeigeInhalt();
      zeichnenAlles();
      toast("Gerät angelegt.");
      return;
    }

    await Daten.speichern("computer", elementId, felder);
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

/* ---------- Dialog ---------- */

function dialogSchliessen() {
  $("g-dialog").hidden = true;
  $("g-dialog-hintergrund").hidden = true;
  leeren($("g-dialog-inhalt"));
  leeren($("g-dialog-knoepfe"));
}

function dialogOeffnen(titel) {
  $("g-dialog-titel").textContent = titel;
  $("g-dialog-hintergrund").hidden = false;
  $("g-dialog").hidden = false;
  return {
    inhalt: leeren($("g-dialog-inhalt")),
    knoepfe: leeren($("g-dialog-knoepfe"))
  };
}

/* ---------- Benutzer zuordnen und lösen ---------- */

/* Schreibt das Feld «Computer» eines Benutzers und lädt danach nach.

   Beim Lösen wird bewusst null gesendet, nicht "": Graph löscht das Feld
   damit wirklich. Das Benutzerfenster (fuerGraph) macht es genauso. */
async function zuordnungSchreiben(benutzer, pcName, meldung) {
  const wertFuerGraph = String(pcName || "").trim() || null;
  try {
    await Daten.speichern("benutzer", benutzer.id, { Computer: wertFuerGraph });
    melden("benutzer-geaendert", benutzer.id);
    await datenLaden(true);
    zeileWaehlen();
    zeigeInhalt();
    zeichnenAlles();
    toast(meldung);
  } catch (e) {
    toast("Speichern fehlgeschlagen. " + (e && e.message ? e.message : e), true);
  }
}

function zuordnungLoesenDialog(benutzer) {
  const d = dialogOeffnen("Zuordnung lösen");
  d.inhalt.appendChild(el("p", null,
    "«" + (benutzer.__name || benutzer.Title) + "» ist diesem Gerät zugeordnet. "
    + "Beim Lösen wird das Feld «Computer» dieses Benutzers geleert; das Gerät "
    + "selbst bleibt unverändert."));
  d.knoepfe.appendChild(knopf("Abbrechen", null, dialogSchliessen));
  d.knoepfe.appendChild(knopf("Zuordnung lösen", "knopf-gefahr", function () {
    dialogSchliessen();
    zuordnungSchreiben(benutzer, "",
      "Zuordnung von «" + (benutzer.__name || benutzer.Title) + "» gelöst.");
  }));
}

function zuordnenDialog() {
  const pcName = textWert("Title").trim();
  if (!pcName) {
    toast("Ohne PC-Name lässt sich kein Benutzer zuordnen.", true);
    return;
  }
  const d = dialogOeffnen("Benutzer zuordnen");
  d.inhalt.appendChild(el("p", null,
    "Der gewählte Benutzer bekommt «" + pcName + "» als Gerät. Ein bisher "
    + "hinterlegtes Gerät wird dabei ersetzt."));

  const suche = el("input", "g-eingabe");
  suche.type = "search";
  suche.id = "g-zuordnen-suche";
  suche.placeholder = "Name, Login oder Abteilung suchen …";
  suche.autocomplete = "off";
  suche.setAttribute("aria-label", "Benutzer suchen");
  d.inhalt.appendChild(suche);

  const treffer = el("div", "g-trefferliste");
  d.inhalt.appendChild(treffer);

  const zeichneTreffer = function () {
    leeren(treffer);
    const text = suche.value.trim().toLowerCase();
    const passend = alleBenutzer.filter(function (b) {
      if (Modell.schluessel(b.Computer) === Modell.schluessel(pcName)) return false;
      if (!text) return true;
      return (b.__such || "").indexOf(text) > -1;
    }).sort((a, b) => Hilfe.vergleiche(a.__name, b.__name));

    if (!passend.length) {
      treffer.appendChild(leerHinweis("Kein Benutzer passt zur Suche."));
      return;
    }
    for (const b of passend.slice(0, 40)) {
      const k = el("button", "g-treffer");
      k.type = "button";
      k.appendChild(el("div", "g-person-name", b.__name || b.Title));
      const unter = [String(b.Title || "").trim() || "ohne Login"];
      if (String(b.Abteilung || "").trim()) unter.push(String(b.Abteilung).trim());
      unter.push(String(b.Computer || "").trim()
        ? "aktuell: " + String(b.Computer).trim() : "aktuell kein Gerät");
      k.appendChild(el("div", "g-person-unter", unter.join(" · ")));
      k.addEventListener("click", function () { bestaetigen(b); });
      treffer.appendChild(k);
    }
    if (passend.length > 40) {
      treffer.appendChild(leerHinweis("… und " + (passend.length - 40)
        + " weitere. Bitte die Suche verfeinern."));
    }
  };

  const bestaetigen = function (b) {
    const d2 = dialogOeffnen("Benutzer zuordnen");
    const bisher = String(b.Computer || "").trim();
    d2.inhalt.appendChild(el("p", null,
      "«" + (b.__name || b.Title) + "» (" + b.Title + ")"
      + (String(b.Abteilung || "").trim() ? ", " + String(b.Abteilung).trim() : "")
      + " wird dem Gerät «" + pcName + "» zugeordnet."));
    d2.inhalt.appendChild(el("p", bisher ? "t-warnung" : "t-leise", bisher
      ? "Aktuelles Gerät dieses Benutzers: «" + bisher
        + "». Diese Zuordnung wird ersetzt."
      : "Diesem Benutzer ist zurzeit kein Gerät zugeordnet."));
    d2.knoepfe.appendChild(knopf("Zurück", null, zuordnenDialog));
    d2.knoepfe.appendChild(knopf("Zuordnen", "knopf-primaer", function () {
      dialogSchliessen();
      zuordnungSchreiben(b, pcName,
        "«" + (b.__name || b.Title) + "» ist jetzt diesem Gerät zugeordnet.");
    }));
  };

  suche.addEventListener("input", zeichneTreffer);
  zeichneTreffer();

  d.knoepfe.appendChild(knopf("Abbrechen", null, dialogSchliessen));
  suche.focus();
}

/* ---------- Löschen ---------- */

function loeschenDialog() {
  const name = anzeigeName();
  const d = dialogOeffnen("Gerät löschen");

  d.inhalt.appendChild(el("p", null,
    "Die Zeile wird aus der Liste «Computer» entfernt und landet im Papierkorb "
    + "der SharePoint-Site. Von dort lässt sie sich 93 Tage lang zurückholen."));
  const personen = zugeordneteBenutzer();
  if (personen.length) {
    d.inhalt.appendChild(el("p", "t-warnung",
      personen.length === 1
        ? "Achtung: einem Benutzer ist dieses Gerät zugeordnet. Die Zuordnung "
          + "bleibt bestehen und zeigt danach ins Leere."
        : "Achtung: " + personen.length + " Benutzern ist dieses Gerät zugeordnet. "
          + "Die Zuordnungen bleiben bestehen und zeigen danach ins Leere."));
  }
  d.inhalt.appendChild(el("p", null,
    "Zur Bestätigung bitte den PC-Namen genau abtippen: " + name));

  const feld = el("input", "g-eingabe");
  feld.type = "text";
  feld.autocomplete = "off";
  feld.setAttribute("aria-label", "PC-Name zur Bestätigung");
  d.inhalt.appendChild(feld);

  d.knoepfe.appendChild(knopf("Abbrechen", null, dialogSchliessen));
  const loeschen = knopf("Endgültig löschen", "knopf-gefahr", async function () {
    loeschen.disabled = true;
    loeschen.textContent = "Wird gelöscht …";
    try {
      await Daten.loeschen("computer", zeile.id);
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
      leeren($("g-status"));
    } catch (e) {
      loeschen.disabled = false;
      loeschen.textContent = "Endgültig löschen";
      toast("Löschen fehlgeschlagen. " + (e && e.message ? e.message : e), true);
    }
  });
  loeschen.disabled = true;
  d.knoepfe.appendChild(loeschen);

  feld.addEventListener("input", function () {
    loeschen.disabled = feld.value.trim().toLowerCase() !== name.trim().toLowerCase();
  });

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
  band.appendChild(knopf("Vorführ-Änderungen zurücksetzen", "knopf-leise", function () {
    if (!window.confirm("Alle im Vorführmodus gemachten Änderungen verwerfen?")) return;
    Mock.zuruecksetzen();
    entwurf = {};
    melden("zeile-geaendert", elementId);
    neuLaden();
  }));
}

async function start() {
  hashLesen();
  logoZeichnen();
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
    ladeFehlerZeigen(fehler);
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
    speichern();
    return;
  }
  if (e.key === "Escape") {
    if (!$("g-dialog").hidden) { dialogSchliessen(); return; }
    if (anzahlAenderungen()) { e.preventDefault(); verwerfen(); }
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

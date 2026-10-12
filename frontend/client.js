/* client.js – Clientfenster des ICT-Inventars.

   Wird von der Hauptseite als client.html?liste=admin|edu&id=… im selben Tab
   geöffnet und zeigt einen einzelnen Client: Übersicht, Stammdaten,
   Beschaffung, Inhaber, alles aus SCCM (Software, Hardware, System,
   Sicherheit, Aktivität), den Flottenvergleich und alle Rohdaten.

   Es bedient beide Client-Listen. Sie haben dieselben Spalten und
   unterscheiden sich nur in einem Punkt: EDU-Clients sind Schulungsgeräte
   ohne Inhaber. Bei ihnen fehlen darum der Bereich «Inhaber» und die
   Schnellaktion «Ausgeben an …»; alles Übrige ist gleich.

   Bearbeitbar sind genau die von Hand gepflegten Spalten (q = "manuell" in
   spalten.js): Title, GebaeudeStock, Bemerkung, InDomaene, Status, Verlauf,
   Beschaffungsjahr, ErsatzGeplant. Alles aus SCCM ist schreibgeschützt –
   der Abgleich überschreibt es ohnehin.

   «In Domäne» entscheidet, ob der Abgleich die Zeile überhaupt anfasst.
   Nein heisst: keine SCCM-Felder, keine Archivierung – für Geräte ohne
   Domäne, die es in SCCM nie geben wird (Gäste- und Prüfungsnotebooks).

   Der Inhaber – die Person, der das Gerät formal gehört – steht in der
   Liste «Benutzer» (Spalte «Computer»). Nur ADMIN-Clients haben einen, und
   höchstens einen; gepflegt wird er ausschliesslich hier. SCCM meldet
   Primär- und Anmeldebenutzer, schreibt die Inhaberschaft aber nie.

   Gebaut wird nur über das Fundament: UI (bausteine.js, rahmen.js), Rahmen,
   Bewegung und F (fenster.js). Diese Datei enthält das Fachliche und das
   Seitenlayout der Bereiche, keine eigenen Bausteine.

   Zwei Regeln prägen den Aufbau:
     - Ein Bereich wird gebaut, wenn er erscheint (F.bereichWechseln: mit
       Auftritt) oder still neu gezeichnet, wenn sich die Daten ändern
       (Nachladen, Speichern: F.zeichneBereich, ohne Bewegung, Fokus und
       Rollen bleiben). Tippen zeichnet NIE neu: was von einem Feld abhängt
       (Hinweise, Vorschlag, Lebenszyklus, Kopf), führen kleine Nachführer
       an Ort und Stelle nach (Fehler C2, Inventar §8 Nr. 13).
     - Jedes Bedienelement trägt eine id oder ein data-fokus, damit
       F.zeichneBereich und die Dialoge den Fokus wiederfinden.

   Aufbau:
     1. Parameter und Spaltenwissen
     2. Gerüst, Zustand, Entwurf
     3. Kleine Helfer (Text, Zeit, Sperren)
     4. Auswertung (Hinweise, Inhaber, Flotte)
     5. Bausteine der Bereiche
     6. Die Bereiche
     7. Kopf, Navigation, Neuzeichnen
     8. Laden, Speichern, Verwerfen
     9. Inhaberschaft und Schnellaktionen
    10. Löschen, Start

   Grundsätze: kein Framework, keine globalen Variablen, kein Inline-Script
   und niemals innerHTML mit Daten aus SharePoint. */

"use strict";

(function () {

/* ==================================================================
   1. Parameter und Spaltenwissen
   ================================================================== */

const ABFRAGE = new URLSearchParams(location.search);
const vorlageId = ABFRAGE.get("vorlage");

let elementId = ABFRAGE.get("id");
let neuModus = ABFRAGE.get("neu") === "1";

/* Welche der beiden Client-Listen ist gemeint? Ohne den Parameter gilt
   «admin» – die Liste, aus der die allermeisten Aufrufe kommen. */
const listenName = ABFRAGE.get("liste") === "edu" ? "edu" : "admin";
const LISTEN_TITEL = listenName === "edu" ? "EDU-Clients" : "ADMIN-Clients";
const CLIENT_WORT = listenName === "edu" ? "EDU-Client" : "ADMIN-Client";

/* Inhaberschaft gibt es nur bei den ADMIN-Clients. */
const mitInhaber = listenName === "admin";

const SPALTEN = SPALTEN_CLIENT;
const SPALTE = {};
for (const s of SPALTEN) SPALTE[s.i] = s;

const GRUPPEN = [];
for (const s of SPALTEN) if (GRUPPEN.indexOf(s.g) === -1) GRUPPEN.push(s.g);

/* Beim Duplizieren nicht übernehmen: was ein Gerät eindeutig macht, dazu
   Status und Verlauf – die Geschichte des einen Geräts ist nicht die des
   anderen, und ein neues Gerät startet immer als «Aktiv». */
const NICHT_DUPLIZIEREN = ["Title", "Status", "Verlauf"];

const SPERR_GRUND = "Zuerst speichern oder verwerfen.";


/* ==================================================================
   2. Gerüst, Zustand, Entwurf
   ================================================================== */

const F = Fenster.erstellen("g", {
  liste: listenName,
  neuLaden: function () { neuLaden(); },
  // Nach F.beschaeftigt (Schnellaktionen, Inhaber) still nachladen.
  nachladen: function () { return nachladenStill(); }
});
const el = UI.el;
const $ = UI.$;

let alleClients = [];     // Zeilen der eigenen Client-Liste, angereichert
let alleBenutzer = [];    // Liste «Benutzer», angereichert
let zeile = null;         // das Gerät dieses Fensters
let vorlageName = "";     // PC-Name der Vorlage beim Duplizieren

/* Der Entwurf vergleicht mit dem, was die Seite zeigt: ein leeres «In
   Domäne» steht für Ja, ein leerer Status für «Aktiv». Ohne diese Angabe
   bliebe ein Hin und Her (Aktiv → Lager → Aktiv) als «1 Änderung» stehen.
   «neu»: beim Anlegen zeigt F.feld keinen Punkt «geändert». */
const entwurf = F.entwurf(function () { return zeile; }, {
  leer: { InDomaene: true, Status: "Aktiv" },
  neu: function () { return neuModus; },
  beiAenderung: aenderungGemeldet
});

function wert(feld) { return entwurf.wert(feld); }
function textWert(feld) { return entwurf.textWert(feld); }

/* Zustand der Bedienelemente in den Bereichen: er überlebt das Neuzeichnen. */
let aktiverBereich = "uebersicht";
let swSuche = "";
let rohSuche = "";
let rohLeereZeigen = false;

/* Nachführer des gerade gezeigten Bereichs: kleine Funktionen, die nach
   jeder Änderung im Entwurf Texte, Markierungen und Sperren an Ort und
   Stelle anpassen. Jeder Bau eines Bereichs beginnt mit einer leeren Liste. */
let nachfuehrer = [];

function nachfuehren(fn) {
  nachfuehrer.push(fn);
  return fn;
}

function aenderungGemeldet(feld) {
  speicherleisteZeichnen();
  kopfZeichnen();
  for (const fn of nachfuehrer.slice()) fn(feld);
}


/* ==================================================================
   3. Kleine Helfer
   ================================================================== */

function zahlOderNull(w) {
  if (w === null || w === undefined || w === "") return null;
  const n = Number(w);
  return isNaN(n) ? null : n;
}

function tageText(n) { return UI.zahlText(n) + (n === 1 ? " Tag" : " Tage"); }

/* Aktionen, die schreiben oder die Seite verlassen, warten, bis der
   Entwurf gespeichert oder verworfen ist: gesperrt mit Grund (fokussierbar,
   der Tooltip nennt ihn, api.md §9.9), an Ort und Stelle nachgeführt.
   Knöpfe ohne id tragen ein «fokus» (data-fokus) für F.zeichneBereich und
   den Rückfokus der Dialoge; Handler mit Parametern nie direkt übergeben
   (Fehler A3). */
function sperrGrund() {
  return entwurf.anzahl() > 0 ? SPERR_GRUND : "";
}

function sperrenNachfuehren(knoepfe) {
  const setzen = function () {
    const grund = sperrGrund();
    for (const k of knoepfe) UI.knopfSperren(k, grund);
  };
  setzen();
  nachfuehren(setzen);
}

function raster(kinder) { return UI.anhaengen(el("div", "raster-2"), kinder); }

/* Jeder Bereich steht in EINEM Stapel: so staffelt der Auftritt beim
   Bereichswechsel seine Karten (Bewegung.auftritt staffelt nur Raster). */
function stapel(ziel) { return ziel.appendChild(el("div", "stapel")); }

/* Zeile für einen Wert aus SCCM; leere Werte zeigen «–». */
function datenZeile(name, w, neben) {
  return UI.feldZeile(name, w === null || w === undefined ? "" : w, { neben: neben });
}

function datumZeile(name, roh) {
  return datenZeile(name, UI.zeitText(roh), Hilfe.relativText(roh));
}

function leer(roh) { return roh === null || roh === undefined || String(roh).trim() === ""; }

/* Ja/Nein aus SCCM als Status-Chip; leer bleibt «–». */
function jaNeinStatus(roh, ja, nein, tonNein) {
  if (leer(roh)) return "";
  return Hilfe.istJa(roh) ? UI.status(ja, "erfolg") : UI.status(nein, tonNein || "warnung");
}

/* Online/Offline überall gleich: im Seitenkopf und im Bereich «Client und
   Aktivität» dasselbe Sinnbild (WLAN bzw. durchgestrichenes WLAN). */
function onlineStatus(roh) {
  return Hilfe.istJa(roh)
    ? UI.status("Online", "erfolg", { sinnbild: "online" })
    : UI.status("Offline", "neutral", { sinnbild: "offline" });
}

/* Der Abgleich schreibt Zeitpunkte in Textspalten als «17.09.2026 07:15»
   (Ortszeit). Angezeigt wird wie überall «17.09.2026, 07.15»; was sich
   nicht lesen lässt, bleibt, wie es kommt. */
function zeitAusText(text) {
  const t = String(text || "").trim();
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ ,T]+(\d{1,2})[:.](\d{2}))?$/.exec(t);
  if (!m) return t;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0));
  if (isNaN(d.getTime())) return t;
  return m[4] === undefined ? Hilfe.datumText(d) : UI.zeitText(d);
}

function kopieren(text, meldung) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () {
      UI.meldung(meldung || "In die Zwischenablage kopiert.");
    }, function () {
      UI.meldung("Kopieren nicht möglich. Bitte den Wert von Hand markieren.", { ton: "fehler" });
    });
    return;
  }
  UI.meldung("Dieser Browser erlaubt kein Kopieren aus der Seite.", { ton: "fehler" });
}


/* ==================================================================
   4. Auswertung
   ================================================================== */

function inSccm() { return !!zeile && Hilfe.istJa(zeile.SCCM_Found); }

/* «In Domäne»: leer gilt als Ja. */
function inDomaene() { return wert("InDomaene") !== false; }

/* Alle Geräte, die in SCCM stehen: Grundlage jedes Vergleichs. */
function flotte() {
  return alleClients.filter(z => Hilfe.istJa(z.SCCM_Found));
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

function bitlockerAus() {
  const b = String(zeile.SCCM_BitLocker || "").trim();
  return !!b && (/nicht|kein|off|nein/i.test(b) || !/verschl|encrypt/i.test(b));
}

/* Kontenname ohne Domäne, klein geschrieben. */
function kontoKurz(text) {
  const t = String(text || "").trim();
  if (!t) return "";
  const teile = t.split("\\");
  return teile[teile.length - 1].toLowerCase();
}

/* Ersatz- und Betriebsstatus, immer aus den angezeigten Werten gerechnet. */
function ersatzStatus() {
  return Modell.ersatzStatus(textWert("ErsatzGeplant"), textWert("Beschaffungsjahr"));
}

function geraeteStatus() {
  return Modell.status(wert("Status"));
}

/* Andere Geräte mit demselben PC-Namen. PC-Namen sind kein Schlüssel: ein
   ersetztes Gerät bleibt archiviert liegen und heisst weiterhin gleich. */
function namensZwillinge() {
  const name = textWert("Title").trim();
  if (!name || !zeile) return [];
  const k = Modell.schluessel(name);
  return alleClients.filter(z =>
    Modell.schluessel(z.Title) === k && String(z.id) !== String(zeile.id));
}

/* Alle Personen, deren Feld «Computer» auf dieses Gerät zeigt. Heissen
   mehrere Geräte gleich, zählt – wie in Modell.anreichern – nur, wen die
   Anreicherung diesem Gerät zugewiesen hat. Bei EDU-Clients immer leer.
   Beides mit dem GESPEICHERTEN Namen (zeile.Title), nicht mit dem
   getippten: sonst nähme ein archivierter Zwilling beim Umbenennen den
   Inhaber des Geräts im Einsatz mit. */
function inhaberAlle() {
  if (!zeile || !mitInhaber) return [];
  const name = String(zeile.Title || "").trim();
  if (!name) return [];
  const k = Modell.schluessel(name);
  const passend = alleBenutzer.filter(b => Modell.schluessel(b.Computer) === k);
  const mehrdeutig = alleClients.some(z => Modell.schluessel(z.Title) === k && String(z.id) !== String(zeile.id));
  const gefunden = mehrdeutig
    ? passend.filter(b => b.__client && String(b.__client.id) === String(zeile.id))
    : passend;
  return gefunden.slice()
    .sort((a, b) => Hilfe.vergleiche(a.__name || a.Title, b.__name || b.Title));
}

function inhaber() { return inhaberAlle()[0] || null; }
function weitereInhaber() { return inhaberAlle().slice(1); }
function personName(b) { return b ? (b.__name || b.Title || "") : ""; }

/* «A», «A» und «B», «A», «B» und «C». */
function namenText(personen) {
  const namen = personen.map(b => "«" + personName(b) + "»");
  return namen.length < 2 ? (namen[0] || "") : namen.slice(0, -1).join(", ") + " und " + namen[namen.length - 1];
}

/* Wen ein Umbenennen mitnimmt: die Inhaberschaft hängt am Namen (Feld
   «Computer» der Person). Ändert sich der Name wirklich – nicht nur in
   Gross/Klein oder Leerzeichen, die Modell.schluessel ohnehin gleich
   behandelt –, führt schreiben() das Feld dieser Personen nach; sonst
   verlöre das Gerät still seinen Inhaber. inhaberAlle() rechnet mit dem
   GESPEICHERTEN Namen, darum vor dem Speichern abfragen. */
function mitziehende() {
  if (neuModus || !zeile) return [];
  const neu = textWert("Title").trim();
  if (!neu || Modell.schluessel(neu) === Modell.schluessel(zeile.Title)) return [];
  return inhaberAlle();
}

/* Die Hinweise: gefahr, warnung, info. Kein Score, keine Punkte. */
function hinweise() {
  const b = [];
  if (!zeile || neuModus) return b;
  const gefahr  = (t, e) => b.push({ ton: "gefahr", titel: t, text: e });
  const warnung = (t, e) => b.push({ ton: "warnung", titel: t, text: e });
  const info    = (t, e) => b.push({ ton: "info", titel: t, text: e });

  const betrieb = geraeteStatus();
  if ((betrieb === "Lager" || betrieb === "Archiviert") && inhaber()) {
    warnung("Status «" + betrieb + "», aber ein Inhaber ist eingetragen",
      "«" + personName(inhaber()) + "» trägt das Gerät noch im Feld «Computer». Ein Gerät im "
      + "Lager oder Archiv hat keinen Inhaber: im Bereich «Inhaber» entfernen oder das Gerät "
      + "über «Ausgeben an …» wieder in Betrieb nehmen.");
  }
  if (betrieb === "Archiviert") {
    // Der Name des Filters genau wie im Filterblatt der Liste (app.js).
    info("Gerät ist archiviert", "Es steht nicht mehr im Einsatz und ist in der Liste «"
      + LISTEN_TITEL + "» standardmässig ausgeblendet; der Filter «Archivierte Geräte anzeigen» zeigt es.");
  } else if (betrieb === "Lager") {
    info("Gerät liegt im Lager", "Es ist einsatzbereit, aber niemandem zugeteilt.");
  }

  const zwillinge = namensZwillinge();
  if (zwillinge.length) {
    const aktive = zwillinge.filter(z => !z.__archiviert).length;
    warnung(zwillinge.length === 1 ? "Noch ein Gerät heisst gleich"
      : zwillinge.length + " weitere Geräte heissen gleich",
      "Der PC-Name «" + textWert("Title").trim() + "» steht " + (zwillinge.length + 1)
      + " Mal in der Liste" + (aktive ? "" : ", die übrigen sind archiviert")
      + ". Die Inhaberschaft läuft über den Namen und ist damit mehrdeutig; das nicht "
      + "archivierte Gerät bekommt den Vorzug. Sauberer ist es, das alte Gerät umzubenennen.");
  }

  const beschaffung = textWert("Beschaffungsjahr").trim();
  if (!beschaffung) {
    warnung("Kein Beschaffungsjahr", "Ohne Beschaffungsjahr fehlt das Gerät in der "
      + "Ersatzplanung und in der Auswertung der Übersicht.");
  }
  const status = ersatzStatus();
  const geplant = textWert("ErsatzGeplant").trim();
  const jahr = geplant || Modell.ersatzVorschlag(beschaffung);
  if (status === "ueberfaellig") {
    gefahr("Ersatz überfällig", "Der Ersatz war für " + jahr + " vorgesehen, laufendes "
      + "Geschäftsjahr ist " + Modell.gjAktuell() + (geplant ? "." : " (Vorschlag aus Beschaffungsjahr + 5)."));
  } else if (status === "bald") {
    warnung("Ersatz in diesem Geschäftsjahr", "Der Ersatz ist für " + jahr + " geplant"
      + (geplant ? "." : " (Vorschlag aus Beschaffungsjahr + 5)."));
  }

  if (!inSccm()) {
    /* Ausserhalb der Domäne ist «nicht in SCCM» der Normalfall, kein Hinweis. */
    if (inDomaene()) {
      warnung("Nicht in SCCM", "Zu diesem PC-Namen findet der Abgleich kein Gerät in SCCM. "
        + "Entweder heisst das Gerät dort anders, oder es ist ausser Betrieb.");
    }
    return b;
  }

  const tageAktiv = Hilfe.tageHer(zeile.SCCM_LastActive);
  if (tageAktiv !== null && tageAktiv > 90) {
    gefahr("Seit " + tageAktiv + " Tagen still", "Letzte Aktivität in SCCM am "
      + Hilfe.datumText(zeile.SCCM_LastActive) + ". Nach drei Monaten ohne Lebenszeichen ist "
      + "das Gerät vermutlich ausser Betrieb.");
  } else if (tageAktiv !== null && tageAktiv > 30) {
    warnung("Seit " + tageAktiv + " Tagen still", "Letzte Aktivität in SCCM am "
      + Hilfe.datumText(zeile.SCCM_LastActive) + ". Bitte prüfen, ob das Gerät noch im Einsatz ist.");
  }

  const frei = zahlOderNull(zeile.SCCM_DiskCFreeGB);
  if (frei !== null && frei < 20) {
    gefahr("Wenig Speicherplatz", "Auf Laufwerk C: sind noch " + Hilfe.zahlText(frei, 1)
      + " GB frei. Unter 20 GB scheitern Windows-Updates regelmässig.");
  } else if (frei !== null && frei < 50) {
    warnung("Speicherplatz wird knapp", "Auf Laufwerk C: sind noch " + Hilfe.zahlText(frei, 1)
      + " GB frei. Unter 50 GB wird es für grössere Updates eng.");
  }

  const signaturAlter = Hilfe.tageHer(zeile.SCCM_EPSignatureDate);
  if (signaturAlter !== null && signaturAlter > 7) {
    gefahr("Defender-Signatur veraltet", "Die Virensignatur ist " + signaturAlter
      + " Tage alt. Normal ist höchstens ein Tag.");
  }
  if (zeile.SCCM_EPEnabled && !Hilfe.istJa(zeile.SCCM_EPEnabled)) {
    gefahr("Defender nicht aktiv", "Der Virenschutz meldet sich als deaktiviert.");
  }
  if (zeile.SCCM_EPInfectionStatus && !/sauber|clean|kein/i.test(String(zeile.SCCM_EPInfectionStatus))) {
    gefahr("Defender meldet einen Fund", "Infektionsstatus: " + zeile.SCCM_EPInfectionStatus + ".");
  }
  if (Hilfe.istJa(zeile.SCCM_EPPendingReboot)) {
    warnung("Neustart ausstehend", "Der Virenschutz verlangt einen Neustart, bevor der Schutz "
      + "wieder vollständig greift.");
  }

  if (zeile.SCCM_ClientCheckPass && !Hilfe.istJa(zeile.SCCM_ClientCheckPass)) {
    warnung("Client-Prüfung nicht bestanden", "Die letzte Selbstprüfung des SCCM-Clients ist "
      + "fehlgeschlagen. Ohne funktionierenden Client kommen weder Updates noch Software auf das Gerät.");
  }
  if (zeile.SCCM_ClientActive && !Hilfe.istJa(zeile.SCCM_ClientActive)) {
    warnung("SCCM-Client inaktiv", "SCCM stuft den Client als inaktiv ein.");
  }

  if (bitlockerAus()) {
    gefahr("Laufwerk nicht verschlüsselt", "BitLocker meldet «" + String(zeile.SCCM_BitLocker).trim()
      + "». Bei Verlust des Geräts sind die Daten lesbar.");
  }
  if (zeile.SCCM_TPMEnabled && !Hilfe.istJa(zeile.SCCM_TPMEnabled)) {
    warnung("TPM nicht aktiviert", "Ohne TPM lässt sich BitLocker nicht ohne Kennworteingabe betreiben.");
  }

  const meinBuild = buildZahl(zeile.SCCM_OSVersion);
  const flottenBuild = haeufigster("SCCM_OSVersion");
  const zielBuild = buildZahl(flottenBuild.wert);
  if (meinBuild !== null && zielBuild !== null && meinBuild < zielBuild) {
    warnung("OS-Build veraltet", "Dieses Gerät läuft auf " + zeile.SCCM_OSVersion + ", der häufigste "
      + "Build der Flotte ist " + flottenBuild.wert + " (" + flottenBuild.anzahl + " Geräte).");
  }

  const nameInventar = textWert("Title").trim();
  const nameSccm = String(zeile.SCCM_Name || "").trim();
  if (nameInventar && nameSccm && nameInventar.toLowerCase() !== nameSccm.toLowerCase()) {
    warnung("PC-Name weicht ab", "Inventar: «" + nameInventar + "», SCCM: «" + nameSccm + "».");
  }

  const ueberzaehlig = weitereInhaber();
  if (ueberzaehlig.length) {
    gefahr("Mehr als ein Inhaber", "Ein Gerät hat genau einen Inhaber, hier zeigen aber "
      + (ueberzaehlig.length + 1) + " Personen mit ihrem Feld «Computer» darauf: "
      + inhaberAlle().map(personName).join(", ") + ". Im Bereich «Inhaber» die überzähligen "
      + "Einträge entfernen.");
  }
  for (const a of inhaberAbweichungen()) info(a.titel, a.text);

  const akku = akkuProzent();
  if (akku !== null && akku < 50) {
    warnung("Akku schwach", "Der Akku meldet noch " + akku + " % Kapazität. Unter 50 % lohnt sich ein Ersatz.");
  }

  const reihenfolge = { gefahr: 0, warnung: 1, info: 2 };
  return b.sort((x, y) => reihenfolge[x.ton] - reihenfolge[y.ton]);
}

/* Weicht der SCCM-Primärbenutzer oder der letzte angemeldete Benutzer vom
   Inhaber ab? Bewusst nur ein Hinweis: SCCM sieht, wer an einem Gerät
   arbeitet, nicht, wem es gehört. */
function inhaberAbweichungen() {
  const treffer = [];
  if (neuModus || !zeile || !mitInhaber) return treffer;
  const logins = inhaberAlle().map(b => Modell.schluessel(b.Title));
  const pruefe = function (feld, bezeichnung) {
    const konto = kontoKurz(zeile[feld]);
    if (!konto || logins.indexOf(konto) > -1) return;
    treffer.push({
      titel: bezeichnung + " ist nicht der Inhaber",
      text: "SCCM meldet «" + konto + "»"
        + (logins.length ? ", Inhaber ist «" + logins[0] + "»." : ", dieses Gerät hat aber keinen Inhaber.")
        + " Bei einem Handwechsel gehört der Inhaber nachgeführt."
    });
  };
  pruefe("SCCM_PrimaryUser", "Primärer Benutzer (SCCM)");
  pruefe("SCCM_LastLogonUser", "Letzter angemeldeter Benutzer");
  return treffer;
}

function werteDerSpalte(feld) {
  const werte = [];
  for (const z of alleClients) {
    const t = String(z[feld] === null || z[feld] === undefined ? "" : z[feld]).trim();
    if (t && werte.indexOf(t) === -1) werte.push(t);
  }
  return werte.sort(Hilfe.vergleiche);
}


/* ==================================================================
   5. Bausteine der Bereiche
   ================================================================== */

/* --- Formularzeilen: Feld, Beschriftung, «geändert» an Ort und Stelle --- */

/* Die Felder baut F.feld (fenster.js): Steuerelement mit der id
   «g-eingabe-<Feld>», Wert aus dem Entwurf, jede Eingabe hinein, der Punkt
   «geändert» folgt dem Entwurf an Ort und Stelle – beim Anlegen keiner
   (Option «neu» des Entwurfs). Hier steht nur, was je Feld dazukommt. */

/* PC-Name mit Hinweis: erscheint beim Tippen als Banner (aufgedeckt,
   weil der Benutzer ihn auslöst), beim Neuzeichnen ohne Bewegung. Er sagt
   zweierlei: ob der Name schon vergeben ist (Warnung) und, bei einem
   Gerät mit Inhaber, dass der Inhaber beim Speichern mitzieht (sonst nur
   Info) – beides steht in EINEM Banner. */
function titelZeile(hinweisText) {
  const ort = UI.hinweisPlatz({ id: "g-namenswarnung" });
  const setzen = function (mitBewegung) {
    const zwillinge = namensZwillinge();
    const personen = mitziehende();
    const vergeben = zwillinge.length
      ? (zwillinge.length === 1 ? "Ein weiteres Gerät heisst bereits so (" : zwillinge.length
        + " weitere Geräte heissen bereits so (")
        + zwillinge.map(z => (z.__archiviert ? "archiviert" : Modell.status(z.Status)) + ", Listen-ID " + z.id).join("; ")
        + "). Erlaubt, aber die Inhaberschaft läuft über den Namen und wird damit mehrdeutig."
      : "";
    const mit = !personen.length ? ""
      : (personen.length === 1
        ? namenText(personen) + " ist Inhaber. Beim Speichern bekommt das Feld «Computer» dieser Person den neuen "
          + "Namen; die Inhaberschaft bleibt bestehen."
        : namenText(personen) + " tragen dieses Gerät. Beim Speichern bekommt ihr Feld «Computer» den neuen Namen.");
    const text = [vergeben, mit].filter(Boolean).join(" ");
    ort.setzen(text ? (vergeben ? "w|" : "i|") + text : "", function () {
      return vergeben
        ? UI.banner({ ton: "warnung", titel: "Name schon vergeben.", text: text })
        : UI.banner({ ton: "info", sinnbild: "benutzer", titel: personen.length === 1 ? "Der Inhaber zieht mit."
          : "Die Einträge ziehen mit.", text: text });
    }, { aufdecken: mitBewegung });
  };
  setzen(false);
  nachfuehren(function (feld) { if (feld === "Title") setzen(true); });
  return F.feld("Title", { beschriftung: "PC-Name", hinweis: hinweisText, zusatz: ort,
    eingabe: { platzhalter: listenName === "edu" ? "z. B. EDU-AULA-03" : "z. B. CAMPUS-907" } });
}

function ortZeile() {
  return F.feld("GebaeudeStock", { beschriftung: "Gebäude / Stock",
    eingabe: { vorschlaege: werteDerSpalte("GebaeudeStock") } });
}

function bemerkungZeile() {
  return F.feld("Bemerkung", { beschriftung: "Bemerkung", art: "textbereich", eingabe: { zeilen: 4 } });
}

/* Status als Auswahl. Der Hinweis erklärt den gewählten Wert; wer
   «Archiviert» wählt, solange das Gerät in SCCM steht, sieht die Warnung,
   dass der nächste Abgleich es zurücksetzt. */
function statusZeile() {
  const hinweis = el("span");
  const warnOrt = UI.hinweisPlatz({ id: "g-statuswarnung" });
  const setzen = function (mitBewegung) {
    const s = geraeteStatus();
    UI.textSetzen(hinweis, s === "Archiviert"
      ? "Ausser Betrieb; in der Liste und den Kennzahlen standardmässig ausgeblendet."
      : (s === "Lager" ? "Einsatzbereit, aber niemandem zugeteilt. Bleibt in der Liste."
        : "Im Einsatz. Ein leeres Feld gilt ebenfalls als «Aktiv»."));
    warnOrt.setzen(s === "Archiviert" && inSccm() ? "archiviert-in-sccm" : "", function () {
      return UI.banner({ ton: "warnung", text: "Solange das Gerät in SCCM steht, setzt der nächste "
        + "Abgleich es wieder auf «Aktiv». Für ein eingelagertes Gerät «Lager» wählen." });
    }, { aufdecken: mitBewegung });
  };
  setzen(false);
  nachfuehren(function (feld) { if (feld === "Status") setzen(true); });
  // Die Auswahl zeigt den Status so, wie er gilt (leer → «Aktiv»); der
  // Entwurf vergleicht ebenso (leer: { Status: "Aktiv" }).
  return F.feld("Status", { beschriftung: "Status", art: "auswahl", hinweis: hinweis, zusatz: warnOrt,
    eingabe: { werte: Modell.STATUS_WERTE, wert: geraeteStatus(), schmal: true } });
}

/* «In Domäne» als Kästchen am Entwurf (F.feld, art 'ankreuzen': id
   «g-eingabe-InDomaene», Punkt «geändert» wie bei allen Feldern). Ein
   leerer gespeicherter Wert gilt als Ja (leer: { InDomaene: true } am
   Entwurf); ein Hin und Her ist darum keine Änderung. Der Hinweis sagt,
   was daran hängt, und folgt dem Kästchen an Ort und Stelle. */
function domaeneZeile() {
  const hinweis = el("span");
  const z = F.feld("InDomaene", { beschriftung: "In Domäne", art: "ankreuzen", hinweis: hinweis,
    eingabe: { text: "Gerät ist in der Domäne" } });
  const setzen = function () {
    UI.textSetzen(hinweis, inDomaene()
      ? "Der SCCM-Abgleich pflegt diese Zeile: er füllt die SCCM-Felder und archiviert das Gerät, "
        + "sobald es nicht mehr in SCCM steht."
      : "Der SCCM-Abgleich lässt diese Zeile in Ruhe: keine SCCM-Felder, keine Archivierung. Für "
        + "Geräte ohne Domäne (Gäste- und Prüfungsnotebooks).");
  };
  setzen();
  nachfuehren(function (feld) { if (feld === "InDomaene") setzen(); });
  return z;
}

/* Beschaffungsjahr und Ersatz: Vorschlag (Beschaffung + 5) und Hinweise
   folgen dem Tippen an Ort und Stelle; Tab führt ungestört zum nächsten
   Feld (Fehler C2: früher baute «change» den Bereich unter dem Fokus neu). */
function beschaffungsjahrZeile(hinweisText) {
  return F.feld("Beschaffungsjahr", { beschriftung: "Beschaffungsjahr", hinweis: hinweisText,
    eingabe: { vorschlaege: Modell.gjAuswahl(), schmal: true, platzhalter: "z. B. 2023/2024" } });
}

function ersatzZeile() {
  const hinweis = el("span");
  const zusatz = el("div", "datenzeile-zeile");
  const zeileErsatz = F.feld("ErsatzGeplant", { beschriftung: "Ersatz geplant", hinweis: hinweis, zusatz: zusatz,
    eingabe: { vorschlaege: Modell.gjAuswahl(), schmal: true, platzhalter: "z. B. 2028/2029" } });
  const feld = zeileErsatz.feld;
  const vorschlagKnopf = UI.knopf({ text: "Vorschlag übernehmen", variante: "leise", klein: true, sinnbild: "check",
    beiKlick: function () {
      const vorschlag = Modell.ersatzVorschlag(textWert("Beschaffungsjahr").trim());
      if (!vorschlag) return;
      // Der Knopf verschwindet gleich: der Fokus geht vorher ins Feld.
      feld.value = vorschlag;
      feld.focus();
      entwurf.setzeWert("ErsatzGeplant", vorschlag);
      UI.meldung("Vorschlag " + vorschlag + " übernommen. Noch nicht gespeichert.", { ton: "info" });
    }, fokus: "vorschlag-uebernehmen" });
  zusatz.appendChild(vorschlagKnopf);
  const setzen = function () {
    const vorschlag = Modell.ersatzVorschlag(textWert("Beschaffungsjahr").trim());
    const geplant = textWert("ErsatzGeplant").trim();
    UI.textSetzen(hinweis, !vorschlag ? "Ohne Beschaffungsjahr gibt es keinen Vorschlag."
      : (geplant === vorschlag ? "Entspricht dem Vorschlag (Beschaffung + 5 Jahre)."
        : (!geplant ? "Leer heisst: Ersatz " + vorschlag + " (Beschaffung + 5 Jahre)."
          : "Vorschlag: " + vorschlag + " (Beschaffung + 5 Jahre).")));
    zusatz.hidden = !vorschlag || geplant === vorschlag;
    if (vorschlag) UI.knopfText(vorschlagKnopf, "Vorschlag " + vorschlag + " übernehmen");
  };
  setzen();
  nachfuehren(function (f) { if (f === "Beschaffungsjahr" || f === "ErsatzGeplant") setzen(); });
  return zeileErsatz;
}

/* --- Lebenszyklus: Beschaffung, Ersatz, verstrichener Anteil --- */

const ERSATZ_STATUS = {
  ueberfaellig: { text: "Ersatz überfällig", ton: "gefahr" },
  bald:         { text: "Ersatz in diesem GJ", ton: "warnung" },
  ok:           { text: "Im Plan", ton: "neutral", sinnbild: "kalender" },
  unbekannt:    { text: "Nicht erfasst", ton: "neutral" }
};

/* Karte mit dem Lebenszyklus. Ändert sich ein Jahr im Entwurf, wird nur
   ihr Inhalt (ohne Bedienelemente) neu gefüllt; der Balken springt dann,
   er wächst nur beim ersten Zeigen. «mitFuss»: Link in den Bereich. */
function lebenszyklusKarte(mitFuss) {
  const chip = UI.status("", "neutral");
  const ohneJahr = !textWert("Beschaffungsjahr").trim();
  const k = UI.karte({ titel: "Lebenszyklus", aktionen: [chip], fuss: mitFuss ? [UI.knopf({
    text: ohneJahr ? "Beschaffungsjahr erfassen" : "Beschaffung bearbeiten", variante: "leise", weiter: true,
    beiKlick: function () { bereichWechseln("beschaffung", "g-eingabe-Beschaffungsjahr"); }, fokus: "beschaffung-oeffnen"
  })] : null });
  let sig = null;
  const fuellen = function () {
    const beschaffung = textWert("Beschaffungsjahr").trim();
    const geplant = textWert("ErsatzGeplant").trim();
    const neueSig = beschaffung + "|" + geplant;
    if (neueSig === sig) return;
    sig = neueSig;
    const vorschlag = Modell.ersatzVorschlag(beschaffung);
    const ersatz = geplant || vorschlag;
    const status = ersatzStatus();
    const c = ERSATZ_STATUS[status] || ERSATZ_STATUS.unbekannt;
    chip.setzen(c.text, c.ton, { sinnbild: c.sinnbild, titel: "Laufendes Geschäftsjahr: " + Modell.gjAktuell() });

    const inhalt = UI.leeren(k.inhalt);
    inhalt.appendChild(UI.kennwerte([
      ["Beschaffung", beschaffung],
      [geplant ? "Ersatz geplant" : "Ersatz (Vorschlag)", ersatz]
    ]));
    const von = Modell.gjZahl(beschaffung);
    const bis = Modell.gjZahl(ersatz);
    const heute = Modell.gjZahl(Modell.gjAktuell());
    if (von !== null && bis !== null && heute !== null && bis > von) {
      const spanne = bis - von;
      const verstrichen = Math.min(Math.max(heute - von, 0), spanne);
      inhalt.appendChild(UI.balken(verstrichen / spanne,
        status === "ueberfaellig" ? "gefahr" : (status === "bald" ? "warnung" : undefined)));
      inhalt.appendChild(UI.meta(verstrichen + " von " + spanne + " Geschäftsjahren verstrichen · laufendes GJ "
        + Modell.gjAktuell()));
    } else if (!beschaffung) {
      inhalt.appendChild(UI.hinweis("Ohne Beschaffungsjahr lässt sich der Ersatz nicht planen."));
    }
  };
  fuellen();
  nachfuehren(function (f) { if (f === "Beschaffungsjahr" || f === "ErsatzGeplant") fuellen(); });
  return k;
}

/* --- Personen --- */

function personUnter(b) {
  const unter = [String(b.Title || "").trim() || "ohne Login"];
  if (String(b.Abteilung || "").trim()) unter.push(String(b.Abteilung).trim());
  if (String(b.Funktion || "").trim()) unter.push(String(b.Funktion).trim());
  return unter;
}

/* Eine Person als Listenzeile; der Name führt ins Benutzerfenster (ein
   echter Link: Ctrl- und Mittelklick öffnen einen neuen Tab). */
function personZeile(b, aktionen) {
  /* Dieselbe Regel, derselbe Text und derselbe Ton wie auf allen Seiten
     (Modell.adStatus: nur «Ja» zählt als aktiv). Ein aktives Konto ist der
     Normalfall und bleibt ohne Chip. */
  const ad = Modell.adStatus(b);
  return UI.listenZeile({
    titel: personName(b), href: UI.adresse.benutzer(b.id), unter: personUnter(b), sinnbild: "benutzer",
    status: ad.aktiv ? null : UI.status(ad.text, ad.ton),
    aktionen: aktionen
  });
}

/* --- SCCM fehlt --- */

/* Steht das Gerät nicht in SCCM, zeigen die SCCM-Bereiche statt leerer
   Karten einen Leerzustand, der sagt, warum und was zu tun ist. */
function sccmLeer() {
  const k = UI.karte({});
  const name = textWert("Title").trim() || "dieses Gerät";
  k.inhalt.appendChild(UI.leerzustand(inDomaene() ? {
    sinnbild: "sync", titel: "Keine Daten aus SCCM",
    text: "Der Abgleich findet zu «" + name + "» kein Gerät in SCCM. Der PC-Name muss genau dem "
      + "Gerätenamen in SCCM entsprechen.",
    aktion: UI.knopf({ text: "PC-Name prüfen", variante: "tonal",
      beiKlick: function () { bereichWechseln("stammdaten", "g-eingabe-Title"); }, fokus: "pc-name-pruefen" })
  } : {
    sinnbild: "sync", titel: "Ausserhalb der Domäne",
    text: "«" + name + "» ist nicht in der Domäne. Der Abgleich lässt das Gerät in Ruhe; aus SCCM "
      + "kommt darum nichts."
  }));
  return k;
}


/* ==================================================================
   6. Die Bereiche
   ================================================================== */

/* ---------- Übersicht ---------- */

function bereichUebersicht(ziel) {
  const s = stapel(ziel);
  const liste = hinweise();
  if (!liste.length) {
    s.appendChild(UI.banner({ ton: "erfolg", titel: "Nichts zu beanstanden.", text: "Alle geprüften Regeln sind erfüllt." }));
  } else {
    const k = UI.karte({ titel: "Hinweise", unter: liste.length === 1
      ? "Ein Punkt, aus den aktuellen Werten abgeleitet."
      : liste.length + " Punkte, aus den aktuellen Werten abgeleitet; die wichtigsten zuerst." });
    k.inhalt.appendChild(UI.hinweise(liste.map(h => UI.hinweisZeile(h))));
    s.appendChild(k);
  }
  s.appendChild(zustandKarte());
  s.appendChild(raster([lebenszyklusKarte(true), mitInhaber ? inhaberKurzKarte() : geraetKurzKarte()]));
}

/* Kennzahlen laut SCCM. Der Ton steht als Icon in der Beschriftung, die
   Zahl wird nie gefärbt; der Normalfall bleibt ohne Icon. */
function zustandKarte() {
  const k = UI.karte({ titel: "Zustand laut SCCM",
    unter: inSccm() && zeile.SCCM_LastSync ? "Stand des letzten Abgleichs: " + UI.zeitText(zeile.SCCM_LastSync) + "." : null });
  if (!inSccm()) {
    k.inhalt.appendChild(UI.hinweis(inDomaene()
      ? "Das Gerät steht nicht in SCCM; es gibt keine Kennzahlen."
      : "Das Gerät ist ausserhalb der Domäne; aus SCCM kommen keine Kennzahlen."));
    return k;
  }
  const tageAktiv = Hilfe.tageHer(zeile.SCCM_LastActive);
  const tageBoot = Hilfe.tageHer(zeile.SCCM_LastBoot);
  const frei = zahlOderNull(zeile.SCCM_DiskCFreeGB);
  const gesamt = zahlOderNull(zeile.SCCM_DiskCGB);
  const ram = zahlOderNull(zeile.SCCM_RAMGB);
  const signatur = Hilfe.tageHer(zeile.SCCM_EPSignatureDate);
  const akku = akkuProzent();
  const bitlocker = String(zeile.SCCM_BitLocker || "").trim();
  const build = buildZahl(zeile.SCCM_OSVersion);
  const flottenBuild = haeufigster("SCCM_OSVersion");
  const zielBuild = buildZahl(flottenBuild.wert);

  /* Die Einheit steht in der Beschriftung, die Kachel zeigt nur die Zahl
     (wie ChatBob «Hilfreich 184»): auch «1’240» passt so aufs Handy. */
  const tage = function (text, n, unter, ton) {
    return UI.kachel({ text: text, wert: n === null || n < 0 ? "" : UI.zahlText(n), zahl: n === null || n < 0 ? undefined : n,
      unter: unter, ton: ton });
  };
  k.inhalt.appendChild(UI.kacheln([
    tage("Tage seit letzter Aktivität", tageAktiv, UI.zeitText(zeile.SCCM_LastActive),
      tageAktiv === null ? null : (tageAktiv > 90 ? "gefahr" : (tageAktiv > 30 ? "warnung" : null))),
    tage("Tage seit dem Neustart", tageBoot, UI.zeitText(zeile.SCCM_LastBoot),
      tageBoot !== null && tageBoot > 30 ? "warnung" : null),
    UI.kachel({ text: "Freier Speicher C:", wert: frei === null ? "" : UI.zahlText(Math.round(frei)) + " GB",
      zahl: frei === null ? undefined : Math.round(frei), unter: gesamt ? "von " + UI.zahlText(gesamt) + " GB" : "",
      ton: frei === null ? null : (frei < 20 ? "gefahr" : (frei < 50 ? "warnung" : null)) }),
    UI.kachel({ text: "Arbeitsspeicher", wert: ram === null ? "" : UI.zahlText(ram) + " GB", zahl: ram === null ? undefined : ram,
      unter: zeile.SCCM_CPUCores ? zeile.SCCM_CPUCores + " Kerne · " + (zeile.SCCM_CPULogical || "–") + " Threads" : "" }),
    // Die Build-Nummer statt «10.0.26100»: kurz genug für die Kachel auch
    // auf dem Handy, und sie ist es, die mit der Flotte verglichen wird.
    UI.kachel({ text: "Windows-Build", wert: build === null ? zeile.SCCM_OSVersion : String(build),
      unter: String(zeile.SCCM_OS || "").replace(/^Microsoft\s+/i, ""),
      ton: build !== null && zielBuild !== null && build < zielBuild ? "warnung" : null,
      titel: zeile.SCCM_OSVersion ? "Version " + zeile.SCCM_OSVersion
        + (zielBuild !== null ? "; häufigster Build der Flotte: " + flottenBuild.wert : "") : undefined }),
    tage("Tage seit der Virensignatur", signatur, zeile.SCCM_EPSignatureVersion ? "Version " + zeile.SCCM_EPSignatureVersion : "",
      signatur === null ? null : (signatur > 7 ? "gefahr" : (signatur > 2 ? "warnung" : null))),
    UI.kachel({ text: "Laufwerk verschlüsselt", wert: bitlocker ? (bitlockerAus() ? "Nein" : "Ja") : "",
      unter: bitlocker ? "BitLocker: " + bitlocker : "", ton: bitlocker && bitlockerAus() ? "gefahr" : null }),
    UI.kachel({ text: "Akku-Kapazität", wert: akku === null ? "" : akku + " %", zahl: akku === null ? undefined : akku,
      unter: akku === null ? "kein Akku gemeldet" : (akku < 50 ? "Ersatz prüfen" : "in Ordnung"),
      ton: akku !== null && akku < 50 ? "warnung" : null })
  ]));
  return k;
}

function inhaberKurzKarte() {
  const wem = inhaber();
  const k = UI.karte({ titel: "Inhaber", fuss: [UI.knopf({ text: wem ? "Inhaber verwalten" : "Inhaber festlegen",
    variante: "leise", weiter: true, beiKlick: function () { bereichWechseln("inhaber"); }, fokus: "inhaber-oeffnen" })] });
  if (wem) k.inhalt.appendChild(UI.zeilenliste([personZeile(wem)]));
  else k.inhalt.appendChild(UI.hinweis("Dieses Gerät hat zurzeit keinen Inhaber."));
  const zuviele = weitereInhaber().length;
  if (zuviele) k.inhalt.appendChild(UI.hinweis("Dazu " + (zuviele === 1 ? "ein überzähliger Eintrag" : zuviele + " überzählige Einträge") + "."));
  return k;
}

/* EDU-Clients haben keinen Inhaber; an seiner Stelle das Gerät selbst. */
function geraetKurzKarte() {
  // Ohne SCCM gäbe es nur Striche: lieber sagen, wo es weitergeht.
  const sccm = inSccm();
  const ziel = sccm ? "hardware" : "stammdaten";
  const k = UI.karte({ titel: "Gerät", fuss: [UI.knopf({ text: sccm ? "Hardware ansehen" : "Stammdaten ansehen",
    variante: "leise", weiter: true, beiKlick: function () { bereichWechseln(ziel); }, fokus: ziel + "-oeffnen" })] });
  if (!sccm) {
    k.inhalt.appendChild(UI.hinweis("Hersteller, Modell und Seriennummer liefert der SCCM-Abgleich. "
      + "Ohne Treffer in SCCM bleiben sie leer."));
    return k;
  }
  k.inhalt.appendChild(UI.kennwerte([
    ["Hersteller", zeile.SCCM_Manufacturer], ["Modell", zeile.SCCM_Model],
    ["Seriennummer", zeile.SCCM_SerialNumber], ["Gehäusetyp", zeile.SCCM_ChassisType]
  ]));
  return k;
}

/* ---------- Stammdaten ---------- */

function bereichStammdaten(ziel) {
  const s = stapel(ziel);
  // Fehler A1: die Adresse kommt aus UI.adresse (client.html, mit liste=).
  // Ein echter Link: Ctrl- und Mittelklick öffnen das Formular im neuen Tab.
  // «Duplizieren» legt ein neues Gerät aus den von Hand gepflegten Angaben
  // an (ohne Name, Status, Verlauf) und steht darum bei ihnen; es ist keine
  // Schnellaktion an DIESEM Gerät. «Löschen …» betrifft das ganze Gerät und
  // steht darum wie im Telefon- und Softwarefenster im Seitenkopf.
  const duplizieren = UI.knopf({ text: "Duplizieren", variante: "leise", sinnbild: "kopieren",
    href: UI.adresse.client(listenName, null, { neu: true, vorlage: zeile.id }), fokus: "duplizieren" });
  const k = UI.karte({ titel: "Stammdaten", unter: "Von Hand gepflegt; der SCCM-Abgleich fasst diese Felder nie an.",
    fuss: [duplizieren] });
  k.inhalt.appendChild(UI.datenzeilen([
    titelZeile("Schlüssel für den SCCM-Abgleich und den Inhaber: muss genau dem Gerätenamen in SCCM entsprechen."),
    ortZeile(), statusZeile(), domaeneZeile(), bemerkungZeile()
  ]));
  sperrenNachfuehren([duplizieren]);
  s.appendChild(raster([k, verlaufEinbauen()]));
}

/* Der Verlauf wird über denselben Entwurf gespeichert wie alle anderen
   Felder: verlauf.js meldet die fertige Zeichenkette, die Speicherleiste
   schreibt sie. Die Karte (Titel, Zahl, «Neuer Eintrag») baut verlauf.js
   selbst, wie im Benutzer- und Telefonfenster: es gibt nur noch diese eine
   Einbauart, keine fremde Karte mehr, in die verlauf.js einhängen müsste. */
function verlaufEinbauen() {
  const huelle = el("div", "g-verlauf");
  huelle.setAttribute("data-rolle", "verlauf");
  Verlauf.zeichnen(huelle, {
    schluessel: "geraet",
    wert: wert("Verlauf"),
    beiAenderung: function (json) { entwurf.setzeWert("Verlauf", json); },
    titel: "Verlauf",
    beschreibung: "Was mit diesem Gerät passiert ist: Handwechsel, Reparatur, Umzug. "
      + "Der Abgleich hängt eigene Einträge an."
  });
  return huelle;
}

/* ---------- Neues Gerät: ein einziges Formular ---------- */

function bereichNeu(ziel) {
  const s = stapel(ziel);
  if (vorlageName) {
    s.appendChild(UI.banner({ ton: "info", sinnbild: "kopieren", titel: "Vorlage übernommen.",
      text: "Die Angaben stammen von «" + vorlageName + "». PC-Name, Status und Verlauf bleiben leer." }));
  }
  const k = UI.karte({ titel: "Angaben zum Gerät",
    unter: "Status, Inhaber und Verlauf folgen nach dem Anlegen; die SCCM-Felder füllt der Abgleich." });
  k.inhalt.appendChild(UI.datenzeilen([
    titelZeile("Muss genau dem Gerätenamen in SCCM entsprechen; darüber laufen Abgleich und Inhaberschaft."),
    ortZeile(), domaeneZeile(),
    beschaffungsjahrZeile("Geschäftsjahr in der Form «2023/2024» (1. August bis 31. Juli)."),
    ersatzZeile(), bemerkungZeile()
  ]));
  s.appendChild(k);
}

/* ---------- Beschaffung ---------- */

function bereichBeschaffung(ziel) {
  const s = stapel(ziel);
  const k = UI.karte({ titel: "Beschaffung und Ersatz", unter: "Beide Angaben sind Geschäftsjahre in der Form "
    + "«2023/2024»; ein Geschäftsjahr läuft vom 1. August bis 31. Juli." });
  k.inhalt.appendChild(UI.datenzeilen([
    beschaffungsjahrZeile("Auswahl 2015/2016 bis 2035/2036, freie Eingabe erlaubt."),
    ersatzZeile()
  ]));
  s.appendChild(raster([k, lebenszyklusKarte(false)]));
}

/* ---------- Inhaber ---------- */

function bereichInhaber(ziel) {
  const s = stapel(ziel);
  const wem = inhaber();
  const zuviele = weitereInhaber();
  const pcName = textWert("Title").trim();
  const sperrbar = [];

  // Fehler A3: nie den Handler direkt übergeben – sonst käme das
  // Klickereignis als «ausgabe» an und der Wechsel nähme das Gerät aus
  // Lager oder Archiv. Die Aktion steht einmal: im Kartenkopf, ohne
  // Inhaber im Leerzustand. Tonal wie jede Aktion in einer Karte (Spec
  // §3.2 «softer main action in cards»): gefüllt ist auf der Seite nur
  // «Speichern» in der Leiste.
  const waehlen = UI.knopf({ text: wem ? "Inhaber wechseln" : "Inhaber festlegen", variante: "tonal",
    sinnbild: wem ? "sync" : "ausgeben", beiKlick: function () { inhaberWaehlenDialog(false); }, fokus: "inhaber-waehlen" });
  sperrbar.push(waehlen);

  const k = UI.karte({ titel: "Inhaber", aktionen: wem ? [waehlen] : [],
    unter: "Die Person, der «" + pcName + "» gehört, genau eine je Gerät. "
      + "Gepflegt nur hier; kein Abgleich überschreibt sie." });
  if (namensZwillinge().length) {
    k.inhalt.appendChild(UI.banner({ ton: "warnung", titel: "PC-Name ist nicht eindeutig.",
      text: "Er kommt in der Liste «" + LISTEN_TITEL + "» " + (namensZwillinge().length + 1) + " Mal vor. Weil die "
        + "Benutzerliste nur den Namen speichert, zählt der Eintrag zum nicht archivierten Gerät." }));
  }
  if (zuviele.length) {
    k.inhalt.appendChild(UI.banner({ ton: "gefahr", titel: "Mehr als ein Inhaber.",
      text: (zuviele.length + 1) + " Personen tragen dieses Gerät im Feld «Computer». Als Inhaber gilt der "
        + "erste Name; die übrigen stehen unten und gehören entfernt." }));
  }

  if (wem) {
    const entfernen = UI.knopf({ text: "Entfernen", variante: "leise", klein: true,
      beiKlick: function () { inhaberEntfernenDialog(wem); }, fokus: "entfernen-" + wem.id });
    sperrbar.push(entfernen);
    k.inhalt.appendChild(UI.zeilenliste([personZeile(wem, [entfernen])]));
  } else {
    k.inhalt.appendChild(UI.leerzustand({ sinnbild: "benutzer", titel: "Noch kein Inhaber",
      text: "Festlegen, wem «" + pcName + "» gehört. Die Person bekommt das Gerät in ihr Feld «Computer».",
      aktion: waehlen }));
  }
  s.appendChild(k);

  if (zuviele.length) {
    const kZuviel = UI.karte({ titel: "Überzählige Einträge", unter: "Diese Personen tragen dasselbe Gerät, "
      + "sind aber nicht sein Inhaber. Entfernen leert ihr Feld «Computer»." });
    kZuviel.inhalt.appendChild(UI.zeilenliste(zuviele.map(function (b) {
      const weg = UI.knopf({ text: "Eintrag entfernen", variante: "leise", klein: true,
        beiKlick: function () { inhaberEntfernenDialog(b); }, fokus: "entfernen-" + b.id });
      sperrbar.push(weg);
      return personZeile(b, [weg]);
    })));
    s.appendChild(kZuviel);
  }
  sperrenNachfuehren(sperrbar);
  s.appendChild(sccmBenutzerKarte());
}

/* Was SCCM über die Benutzer weiss. Reine Beobachtung. */
function sccmBenutzerKarte() {
  const k = UI.karte({ titel: "Benutzer laut SCCM", unter: "Nur ein Hinweis: SCCM sieht, wer an diesem Gerät "
    + "arbeitet, nicht, wem es gehört." });
  if (!inSccm()) {
    k.inhalt.appendChild(UI.hinweis("Das Gerät steht nicht in SCCM; es gibt keine Anmeldedaten."));
    return k;
  }
  const abweichungen = inhaberAbweichungen();
  if (abweichungen.length) {
    k.inhalt.appendChild(UI.hinweise(abweichungen.map(a => UI.hinweisZeile({ ton: "info", titel: a.titel, text: a.text }))));
  }
  k.inhalt.appendChild(UI.datenzeilen([
    datenZeile("Primärer Benutzer", zeile.SCCM_PrimaryUser),
    datenZeile("Letzter angemeldeter Benutzer", zeile.SCCM_LastLogonUser),
    datenZeile("Aktuell angemeldet", zeile.SCCM_CurrentLogonUser),
    datenZeile("Hauptbenutzer (Konsole)", zeile.SCCM_TopConsoleUser),
    datumZeile("Letzte Anmeldung", zeile.SCCM_LastConsoleUse)
  ]));
  k.inhalt.appendChild(el("h3", "karte-untertitel", "Konsolenbenutzer"));
  const konsole = Hilfe.zeilen(zeile.SCCM_ConsoleUsers).map(Hilfe.felder);
  if (!konsole.length) {
    k.inhalt.appendChild(UI.hinweis("Keine Konsolennutzung erfasst."));
  } else {
    k.inhalt.appendChild(UI.tabelle(["Konto", { text: "Anmeldungen", zahl: true }, { text: "Nutzung", zahl: true }, "Zuletzt"],
      konsole.map(function (fe) {
        const anmeldungen = (/(\d+)/.exec(fe[1] || "") || [])[1] || "";
        const minuten = Number((/(\d+)/.exec(fe[2] || "") || [])[1] || 0);
        return [fe[0] || "", anmeldungen, minuten ? Hilfe.zahlText(minuten / 60, 1) + " h" : "",
          zeitAusText(String(fe[3] || "").replace(/^zuletzt\s*/i, ""))];
      }), { beschriftung: "Konsolenbenutzer" }));
  }
  return k;
}

/* ---------- Software (nur SCCM) ---------- */

function bereichSoftware(ziel) {
  const s = stapel(ziel);
  if (!inSccm()) { s.appendChild(sccmLeer()); return; }

  const deployments = Hilfe.zeilen(zeile.SCCM_DeployedApps).map(Hilfe.felder);
  const kDeploy = UI.karte({ titel: "Zugewiesene Applikationen", unter: "Deployments aus SCCM: "
    + UI.zahlText(Number(zeile.SCCM_AppsInstalled) || 0) + " installiert, "
    + UI.zahlText(Number(zeile.SCCM_AppsRequired) || 0) + " erforderlich." });
  if (!deployments.length) {
    kDeploy.inhalt.appendChild(UI.hinweis("Keine Zuweisungen erfasst."));
  } else {
    kDeploy.inhalt.appendChild(UI.tabelle(["Applikation", "Sammlung", "Zweck", "Status"],
      deployments.map(function (f) {
        const st = String(f[3] || "").trim();
        const ton = /erfolg/i.test(st) ? "erfolg" : (/fehl/i.test(st) ? "gefahr"
          : (/ausstehend|pending/i.test(st) ? "wartet" : "neutral"));
        return [f[0] || "", f[1] || "", f[2] || "", st ? UI.status(st, ton) : ""];
      }), { beschriftung: "Zugewiesene Applikationen" }));
  }
  s.appendChild(kDeploy);

  const kInst = UI.karte({ titel: "Installierte Software", unter: "Aus dem Software-Inventar von SCCM. Gezählt sind "
    + UI.zahlText(Number(zeile.SCCM_InstalledSoftwareCount) || Hilfe.zeilen(zeile.SCCM_InstalledSoftware).length)
    + " Einträge, aufgeführt die vom Abgleich übernommenen." });
  const anzahl = el("p", "anzahl");
  anzahl.id = "g-installiert-anzahl";
  anzahl.setAttribute("aria-live", "polite");
  kInst.inhalt.appendChild(UI.anhaengen(el("div", "werkzeugleiste"), [
    UI.suchfeld({ id: "g-suche-installiert", platzhalter: "Name suchen", label: "Installierte Software suchen",
      wert: swSuche, beiEingabe: function (w) { swSuche = w; installiertFuellen(); } }),
    anzahl
  ]));
  const ort = el("div");
  ort.id = "g-installiert";
  kInst.inhalt.appendChild(ort);
  s.appendChild(kInst);
  installiertFuellen();

  const office = Hilfe.zeilen(zeile.SCCM_Office).map(Hilfe.felder);
  const kOffice = UI.karte({ titel: "Office-Produkte" });
  kOffice.inhalt.appendChild(office.length
    ? UI.tabelle(["Produkt", "Version"], office.map(f => [f[0] || "", f[1] || ""]), { beschriftung: "Office-Produkte" })
    : UI.hinweis("Kein Office-Produkt erfasst."));

  const sammlungen = Hilfe.zeilen(zeile.SCCM_Collections);
  const kSamml = UI.karte({ titel: "Sammlungen", unter: "Mitgliedschaften in SCCM; sie steuern, welche Software "
    + "und welche Einstellungen das Gerät erhält." });
  kSamml.inhalt.appendChild(sammlungen.length
    ? UI.anhaengen(el("div", "chips"), sammlungen.map(n => UI.status(n, "neutral", { sinnbild: "ordner" })))
    : UI.hinweis("Keine Sammlungen erfasst."));
  s.appendChild(raster([kOffice, kSamml]));
}

/* Füllt nur die Trefferliste: das Suchfeld bleibt stehen (Fokus und
   Schreibmarke). Die Knoten werden über ihre id gesucht, weil eine noch
   wartende Eingabe eines inzwischen neu gezeichneten Suchfelds hier landen
   kann. */
function installiertFuellen() {
  const ort = $("g-installiert");
  if (!ort || !zeile) return;
  const alle = Hilfe.zeilen(zeile.SCCM_InstalledSoftware).map(Hilfe.felder);
  const such = swSuche.trim().toLowerCase();
  const treffer = alle.filter(f => !such || String(f[0] || "").toLowerCase().indexOf(such) > -1);
  UI.textSetzen($("g-installiert-anzahl"), such ? treffer.length + " von " + alle.length : alle.length + " Einträge");
  UI.leeren(ort);
  if (!alle.length) {
    ort.appendChild(UI.hinweis("Keine Software erfasst."));
  } else if (!treffer.length) {
    ort.appendChild(UI.leerzustand({ sinnbild: "suche", titel: "Keine Treffer",
      text: "Kein Eintrag passt zu «" + swSuche.trim() + "».",
      aktion: UI.knopf({ text: "Suche zurücksetzen", variante: "tonal", beiKlick: function () {
        swSuche = "";
        const f = $("g-suche-installiert");
        if (f) { f.value = ""; f.focus(); }
        installiertFuellen();
      }, fokus: "suche-leeren-installiert" }) }));
  } else {
    ort.appendChild(UI.tabelle(["Name", "Version"], treffer.map(f => [f[0] || "", f[1] || ""]),
      { beschriftung: "Installierte Software" }));
  }
}

/* ---------- Hardware ---------- */

function bereichHardware(ziel) {
  const s = stapel(ziel);
  if (!inSccm()) { s.appendChild(sccmLeer()); return; }
  const frei = zahlOderNull(zeile.SCCM_DiskCFreeGB);
  const gesamt = zahlOderNull(zeile.SCCM_DiskCGB);
  const biosAlter = Hilfe.tageHer(zeile.SCCM_BIOSDate);
  const akku = akkuProzent();

  const kGeraet = UI.karte({ titel: "Gerät" });
  kGeraet.inhalt.appendChild(UI.datenzeilen([
    datenZeile("Hersteller", zeile.SCCM_Manufacturer),
    datenZeile("Modell", zeile.SCCM_Model),
    datenZeile("Gehäusetyp", zeile.SCCM_ChassisType),
    datenZeile("Seriennummer", zeile.SCCM_SerialNumber),
    datenZeile("SMBIOS GUID", zeile.SCCM_SMBIOSGUID),
    datenZeile("Virtuelle Maschine", zeile.SCCM_IsVirtual)
  ]));

  const kRechen = UI.karte({ titel: "Prozessor und Speicher" });
  kRechen.inhalt.appendChild(UI.datenzeilen([
    datenZeile("Prozessor", zeile.SCCM_CPU),
    datenZeile("Kerne / logische Prozessoren", (zeile.SCCM_CPUCores || "–") + " / " + (zeile.SCCM_CPULogical || "–")),
    datenZeile("Arbeitsspeicher", zeile.SCCM_RAMGB ? Hilfe.zahlText(zeile.SCCM_RAMGB, 0) + " GB" : ""),
    datenZeile("Laufwerk C:", gesamt ? Hilfe.zahlText(frei, 1) + " GB frei von " + Hilfe.zahlText(gesamt, 0) + " GB" : "",
      gesamt && frei !== null ? Hilfe.zahlText(gesamt - frei, 1) + " GB belegt" : null)
  ]));

  const disks = Hilfe.zeilen(zeile.SCCM_PhysicalDisks).map(Hilfe.felder);
  const kDisks = UI.karte({ titel: "Physische Datenträger" });
  kDisks.inhalt.appendChild(disks.length
    ? UI.tabelle(["Datenträger", "Zustand"], disks.map(f => [f[0] || "", f.slice(1).join(" · ")]), { beschriftung: "Physische Datenträger" })
    : UI.hinweis("Keine Datenträger erfasst."));

  const kBios = UI.karte({ titel: "BIOS und Akku" });
  kBios.inhalt.appendChild(UI.datenzeilen([
    datenZeile("BIOS-Version", zeile.SCCM_BIOSVersion),
    datenZeile("BIOS-Datum", Hilfe.datumText(zeile.SCCM_BIOSDate),
      biosAlter === null ? null : "vor " + Math.round(biosAlter / 30) + " Monaten"),
    datenZeile("Akku", akku !== null && akku < 50
      ? [document.createTextNode(String(zeile.SCCM_Battery) + " "), UI.status("Ersatz prüfen", "warnung")]
      : zeile.SCCM_Battery)
  ]));

  const monitore = Hilfe.zeilen(zeile.SCCM_Monitors).map(Hilfe.felder);
  const kMonitore = UI.karte({ titel: "Monitore" });
  kMonitore.inhalt.appendChild(monitore.length
    ? UI.tabelle(["Monitor", "Auflösung"], monitore.map(f => [f[0] || "", f[1] || ""]), { beschriftung: "Monitore" })
    : UI.hinweis("Keine Monitore erfasst."));

  s.appendChild(UI.anhaengen(el("div", "karten"), [kGeraet, kRechen, kBios, kDisks, kMonitore]));
}

/* ---------- System und Netzwerk ---------- */

function bereichSystem(ziel) {
  const s = stapel(ziel);
  if (!inSccm()) { s.appendChild(sccmLeer()); return; }
  const tageBoot = Hilfe.tageHer(zeile.SCCM_LastBoot);

  const kOs = UI.karte({ titel: "Betriebssystem" });
  kOs.inhalt.appendChild(UI.datenzeilen([
    datenZeile("Betriebssystem", zeile.SCCM_OS),
    datenZeile("OS-Version (Build)", zeile.SCCM_OSVersion),
    datumZeile("Installiert am", zeile.SCCM_OSInstallDate),
    datenZeile("Letzter Neustart", UI.zeitText(zeile.SCCM_LastBoot), tageBoot === null ? null : "Laufzeit " + tageText(tageBoot)),
    datenZeile("Sprache", zeile.SCCM_OSLanguage),
    datenZeile("Systemtyp", zeile.SCCM_SystemType)
  ]));

  const kNetz = UI.karte({ titel: "Netzwerk" });
  kNetz.inhalt.appendChild(UI.datenzeilen([
    datenZeile("IPv4-Adresse", zeile.SCCM_IPv4),
    datenZeile("Alle IP-Adressen", zeile.SCCM_IPAddresses),
    datenZeile("MAC-Adressen", zeile.SCCM_MACAddresses),
    datenZeile("DHCP", zeile.SCCM_DHCP),
    datenZeile("Management Point", zeile.SCCM_ManagementPoint),
    datenZeile("Boundary Groups", zeile.SCCM_BoundaryGroups)
  ]));

  // Den DN in einen lesbaren OU-Pfad zerlegen: von hinten nach vorne.
  const teile = String(zeile.SCCM_OU || "").split(",").map(t => t.trim()).filter(t => t);
  const ous = teile.filter(t => /^OU=/i.test(t)).map(t => t.substring(3));
  const dcs = teile.filter(t => /^DC=/i.test(t)).map(t => t.substring(3));
  const kAd = UI.karte({ titel: "Active Directory und Entra ID" });
  kAd.inhalt.appendChild(UI.datenzeilen([
    datenZeile("Domäne", zeile.SCCM_Domain),
    datenZeile("Distinguished Name", zeile.SCCM_OU),
    (ous.length || dcs.length) ? datenZeile("OU-Pfad", dcs.join(".") + (ous.length ? " / " + ous.reverse().join(" / ") : "")) : null,
    datenZeile("AD-Standort", zeile.SCCM_ADSite),
    datumZeile("Computerkonto erstellt", zeile.SCCM_ADCreated),
    datumZeile("Letzte AD-Anmeldung", zeile.SCCM_ADLastLogon),
    datenZeile("Entra Device ID", zeile.SCCM_AADDeviceID),
    datenZeile("Co-Managed (Intune)", jaNeinStatus(zeile.SCCM_CoManaged, "Ja", "Nein", "neutral"))
  ]));

  s.appendChild(UI.anhaengen(el("div", "karten"), [kOs, kNetz, kAd]));
}

/* ---------- Sicherheit ---------- */

function bereichSicherheit(ziel) {
  const s = stapel(ziel);
  if (!inSccm()) { s.appendChild(sccmLeer()); return; }
  const signaturAlter = Hilfe.tageHer(zeile.SCCM_EPSignatureDate);
  const infektion = String(zeile.SCCM_EPInfectionStatus || "").trim();

  const kDefender = UI.karte({ titel: "Microsoft Defender" });
  kDefender.inhalt.appendChild(UI.datenzeilen([
    datenZeile("Virenschutz", jaNeinStatus(zeile.SCCM_EPEnabled, "Aktiv", "Nicht aktiv", "gefahr")),
    datenZeile("Client-Version", zeile.SCCM_EPClientVersion),
    datenZeile("Signaturversion", zeile.SCCM_EPSignatureVersion),
    datenZeile("Signaturdatum", UI.zeitText(zeile.SCCM_EPSignatureDate), signaturAlter === null ? null
      : (signaturAlter === 0 ? "heute aktualisiert" : tageText(signaturAlter) + " alt")),
    datumZeile("Letzter Schnellscan", zeile.SCCM_EPLastQuickScan),
    datumZeile("Letzter Vollscan", zeile.SCCM_EPLastFullScan),
    datenZeile("Infektionsstatus", infektion
      ? UI.status(infektion, /sauber|clean|kein/i.test(infektion) ? "erfolg" : "gefahr") : ""),
    datenZeile("Letzte Bedrohung", zeile.SCCM_EPLastThreat),
    datenZeile("Neustart ausstehend", Hilfe.istJa(zeile.SCCM_EPPendingReboot)
      ? UI.status("Ja, Neustart nötig", "warnung") : (zeile.SCCM_EPPendingReboot || ""))
  ]));

  const bitlocker = String(zeile.SCCM_BitLocker || "").trim();
  const kVersch = UI.karte({ titel: "Verschlüsselung und TPM" });
  kVersch.inhalt.appendChild(UI.datenzeilen([
    datenZeile("BitLocker", bitlocker ? UI.status(bitlocker, bitlockerAus() ? "gefahr" : "erfolg", { sinnbild: bitlockerAus() ? undefined : "schloss" }) : ""),
    datenZeile("TPM-Version", zeile.SCCM_TPMVersion),
    datenZeile("TPM", jaNeinStatus(zeile.SCCM_TPMEnabled, "Aktiviert", "Nicht aktiviert"))
  ]));

  s.appendChild(UI.anhaengen(el("div", "karten"), [kDefender, kVersch]));
}

/* ---------- SCCM-Client und Aktivität ---------- */

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
  ["SCCM_ADLastLogon", "Letzte AD-Anmeldung"],
  ["SCCM_EPSignatureDate", "Defender-Signatur"],
  ["SCCM_EPLastQuickScan", "Defender-Schnellscan"],
  ["SCCM_EPLastFullScan", "Defender-Vollscan"],
  ["SCCM_LastSync", "Abgleich mit SharePoint"],
  ["SCCM_OSInstallDate", "Betriebssystem installiert"],
  ["SCCM_ADCreated", "Computerkonto erstellt"],
  ["SCCM_BIOSDate", "BIOS-Datum"]
];

function bereichAktivitaet(ziel) {
  const s = stapel(ziel);
  if (!inSccm()) { s.appendChild(sccmLeer()); return; }

  const kClient = UI.karte({ titel: "SCCM-Client" });
  kClient.inhalt.appendChild(UI.datenzeilen([
    datenZeile("Gerätename in SCCM", zeile.SCCM_Name),
    datenZeile("Online", leer(zeile.SCCM_Online) ? "" : onlineStatus(zeile.SCCM_Online)),
    datenZeile("Client", jaNeinStatus(zeile.SCCM_ClientActive, "Aktiv", "Inaktiv")),
    datenZeile("Client-Prüfung", jaNeinStatus(zeile.SCCM_ClientCheckPass, "Bestanden", "Nicht bestanden")),
    datenZeile("Client-Version", zeile.SCCM_ClientVersion),
    datenZeile("ResourceID", zeile.SCCM_ResourceID),
    datenZeile("SMSID", zeile.SCCM_SMSID),
    datenZeile("Sync-Status", zeile.SCCM_SyncStatus),
    datumZeile("Letzte Synchronisation", zeile.SCCM_LastSync)
  ]));

  /* Alle Zeitstempel, jüngster zuerst; was älter als 30 Tage ist, steht
     still (grauer Punkt) – so fällt auf, was lange nicht mehr kam. */
  const punkte = [];
  for (const [feld, name] of ZEITSTEMPEL) {
    const d = Hilfe.datum(zeile[feld]);
    if (d) punkte.push({ name: name, datum: d, roh: zeile[feld] });
  }
  punkte.sort((a, b) => b.datum - a.datum);
  const kAchse = UI.karte({ titel: "Zeitachse", unter: "Alle Zeitstempel dieses Geräts, jüngster zuerst; ältere als "
    + "30 Tage sind grau." });
  kAchse.inhalt.appendChild(punkte.length ? UI.zeitachse(punkte.map(function (p) {
    const tage = Hilfe.tageHer(p.roh);
    return { titel: p.name, zeit: UI.zeitText(p.roh) + " · " + Hilfe.relativText(p.roh), still: tage !== null && tage > 30 };
  })) : UI.hinweis("Keine Zeitstempel vorhanden."));

  s.appendChild(raster([kClient, kAchse]));
}

/* ---------- Flottenvergleich ---------- */

const KLASSEN = 12;

/* Ein Kennwert mit Median, Rang und einer kleinen Verteilung in zwölf
   Klassen; die Säule dieses Geräts ist hervorgehoben. */
function vergleichsZeile(name, meinWert, werte, einheit, hoeherIstBesser, nachkomma) {
  const zahl = function (n) { return Hilfe.zahlText(n, nachkomma) + (einheit ? " " + einheit : ""); };
  const p = perzentil(werte, meinWert);
  const mittel = median(werte);
  const teile = [el("span", "t-stark", meinWert === null ? "–" : zahl(meinWert))];
  teile.push(UI.meta(p === null || mittel === null ? "Kein Vergleich möglich."
    : "Median der Flotte " + zahl(mittel) + " · " + p + " % der Geräte liegen gleich hoch oder tiefer"
      + (hoeherIstBesser === false ? "; weniger ist besser" : "")));
  if (werte.length > 3 && meinWert !== null) {
    const min = Math.min.apply(null, werte);
    const max = Math.max.apply(null, werte);
    const spanne = max - min || 1;
    const eimer = new Array(KLASSEN).fill(0);
    for (const w of werte) eimer[Math.min(KLASSEN - 1, Math.floor((w - min) / spanne * KLASSEN))]++;
    const meine = Math.min(KLASSEN - 1, Math.max(0, Math.floor((meinWert - min) / spanne * KLASSEN)));
    const saeulen = UI.saeulen(eimer.map(function (n, i) {
      const von = min + spanne * i / KLASSEN;
      const bis = min + spanne * (i + 1) / KLASSEN;
      return { wert: n, titel: (n === 1 ? "1 Gerät" : n + " Geräte") + ": " + zahl(von) + " bis " + zahl(bis) };
    }), { hervorheben: meine, klasse: "g-vergleich-saeulen",
      label: "Verteilung «" + name + "» in der Flotte; dieses Gerät liegt in Klasse " + (meine + 1) + " von " + KLASSEN + "." });
    teile.push(saeulen);
  }
  return UI.feldZeile(name, teile);
}

function bereichAnalyse(ziel) {
  const s = stapel(ziel);
  const geraete = flotte();
  const werteVon = function (fn) {
    const w = [];
    for (const z of geraete) {
      const v = fn(z);
      if (v !== null && v !== undefined && !isNaN(v)) w.push(v);
    }
    return w;
  };

  const kVergleich = UI.karte({ titel: "Dieses Gerät gegenüber der Flotte", unter: "Verglichen wird mit "
    + UI.zahlText(geraete.length) + " Geräten, die in SCCM stehen. Die dunkle Säule ist die Klasse dieses Geräts." });
  if (!inSccm()) {
    kVergleich.inhalt.appendChild(UI.hinweis("Ohne Daten aus SCCM gibt es nichts zu vergleichen."));
  } else {
    kVergleich.inhalt.appendChild(UI.datenzeilen([
      vergleichsZeile("Freier Speicher auf C:", zahlOderNull(zeile.SCCM_DiskCFreeGB),
        werteVon(z => zahlOderNull(z.SCCM_DiskCFreeGB)), "GB", true, 1),
      vergleichsZeile("Arbeitsspeicher", zahlOderNull(zeile.SCCM_RAMGB), werteVon(z => zahlOderNull(z.SCCM_RAMGB)), "GB", true, 0),
      vergleichsZeile("CPU-Kerne", zahlOderNull(zeile.SCCM_CPUCores), werteVon(z => zahlOderNull(z.SCCM_CPUCores)), "", true, 0),
      vergleichsZeile("Tage seit letzter Aktivität", Hilfe.tageHer(zeile.SCCM_LastActive),
        werteVon(z => Hilfe.tageHer(z.SCCM_LastActive)), "Tage", false, 0),
      vergleichsZeile("Alter seit OS-Installation", Hilfe.tageHer(zeile.SCCM_OSInstallDate),
        werteVon(z => Hilfe.tageHer(z.SCCM_OSInstallDate)), "Tage", false, 0),
      vergleichsZeile("Alter des AD-Computerkontos", Hilfe.tageHer(zeile.SCCM_ADCreated),
        werteVon(z => Hilfe.tageHer(z.SCCM_ADCreated)), "Tage", false, 0),
      vergleichsZeile("Installierte Software", zahlOderNull(zeile.SCCM_InstalledSoftwareCount),
        werteVon(z => zahlOderNull(z.SCCM_InstalledSoftwareCount)), "", true, 0)
    ]));
  }
  s.appendChild(kVergleich);

  /* Ähnliche Geräte: dasselbe Modell, dasselbe Beschaffungsjahr, derselbe
     Standort – eine Zeile je Gemeinsamkeit. */
  const gruppe = function (titel, feld, wertText) {
    const w = String(wertText || "").trim();
    if (!w) return [titel, "", "", "", ""];
    const gleiche = geraete.filter(z => String(z[feld] || "").trim() === w);
    const online = gleiche.filter(z => Hilfe.istJa(z.SCCM_Online)).length;
    const freie = gleiche.map(z => zahlOderNull(z.SCCM_DiskCFreeGB)).filter(v => v !== null);
    return [titel, w, UI.zahlText(gleiche.length), UI.zahlText(online),
      freie.length ? Hilfe.zahlText(median(freie), 1) + " GB" : ""];
  };
  const kAehnlich = UI.karte({ titel: "Ähnliche Geräte", unter: "Wie viele Geräte in SCCM dieselbe Eigenschaft "
    + "teilen und wie es ihnen geht." });
  kAehnlich.inhalt.appendChild(UI.tabelle(["Gemeinsam", "Wert", { text: "Geräte", zahl: true },
    { text: "Davon online", zahl: true }, { text: "Median frei C:", zahl: true }], [
    gruppe("Modell", "SCCM_Model", zeile.SCCM_Model),
    gruppe("Beschaffungsjahr", "Beschaffungsjahr", textWert("Beschaffungsjahr")),
    gruppe("Gebäude / Stock", "GebaeudeStock", textWert("GebaeudeStock"))
  ], { beschriftung: "Ähnliche Geräte" }));
  s.appendChild(kAehnlich);
}

/* ---------- Alle Felder ---------- */

function bereichFelder(ziel) {
  const s = stapel(ziel);
  const k = UI.karte({ titel: "Alle Felder", unter: "Der vollständige Datensatz, gruppiert wie in der "
    + "SharePoint-Liste. Jeder Wert lässt sich einzeln kopieren.", id: "g-felder-karte" });
  const anzahl = el("p", "anzahl");
  anzahl.id = "g-felder-anzahl";
  anzahl.setAttribute("aria-live", "polite");
  const leiste = UI.anhaengen(el("div", "werkzeugleiste"), [
    UI.suchfeld({ id: "g-suche-felder", platzhalter: "Feld oder Wert suchen", label: "Feld oder Wert suchen",
      wert: rohSuche, beiEingabe: function (w) { rohSuche = w; felderFuellen(); } }),
    UI.ankreuzen({ text: "Leere Felder zeigen", an: rohLeereZeigen, id: "g-leere-zeigen",
      beiAenderung: function (an) { rohLeereZeigen = an; felderFuellen(); } }),
    UI.knopf({ text: "Als JSON kopieren", variante: "leise", sinnbild: "kopieren", beiKlick: function () {
      const roh = { id: zeile.id };
      for (const sp of SPALTEN) roh[sp.i] = wert(sp.i);
      kopieren(JSON.stringify(roh, null, 2), "Datensatz als JSON kopiert.");
    }, fokus: "json-kopieren" }),
    anzahl
  ]);
  leiste.id = "g-felder-leiste";
  k.inhalt.appendChild(leiste);
  s.appendChild(k);
  felderFuellen();
}

function rohText(spalte, roh) {
  if (spalte.t === "Boolean") {
    if (roh === null || roh === undefined || roh === "") return spalte.i === "InDomaene" ? "Ja (leer gilt als Ja)" : "";
    return Hilfe.istJa(roh) ? "Ja" : "Nein";
  }
  if (spalte.t === "DateTime" && roh) return UI.zeitText(roh) + " (" + Hilfe.relativText(roh) + ")";
  return roh === null || roh === undefined ? "" : String(roh);
}

const QUELLEN = { manuell: "von Hand", sccm: "aus SCCM", ad: "aus dem AD", sharepoint: "von SharePoint" };

/* Füllt die Felder unter der Werkzeugleiste neu; Suchfeld und Kästchen
   bleiben stehen. Die Abschnitte stehen direkt im Karteninhalt, damit der
   Rhythmus der Karte (Zwischentitel, Datenzeilen) gilt. */
function felderFuellen() {
  const leiste = $("g-felder-leiste");
  if (!leiste || !zeile) return;
  while (leiste.nextSibling) leiste.nextSibling.remove();
  const inhalt = leiste.parentNode;
  const such = rohSuche.trim().toLowerCase();
  const gruppen = [{ titel: "Kennung", spalten: [{ i: "id", d: "Listen-ID", t: "Number", q: "sharepoint" }] }]
    .concat(GRUPPEN.map(g => ({ titel: g, spalten: SPALTEN.filter(sp => sp.g === g) })));
  let gezeigt = 0, gesamt = 0;
  for (const g of gruppen) {
    const zeilen = [];
    for (const sp of g.spalten) {
      gesamt++;
      const text = rohText(sp, sp.i === "id" ? zeile.id : wert(sp.i));
      if (!text && !rohLeereZeigen) continue;
      if (such && sp.d.toLowerCase().indexOf(such) === -1 && sp.i.toLowerCase().indexOf(such) === -1
        && text.toLowerCase().indexOf(such) === -1) continue;
      const teile = [el("span", "g-feld-text" + (text ? "" : " t-still"), text || "–")];
      if (text) {
        teile.push(UI.knopf({ variante: "sinnbild", sinnbild: "kopieren", klein: true, titel: "«" + sp.d + "» kopieren",
          beiKlick: function () { kopieren(text, "«" + sp.d + "» kopiert."); }, fokus: "kopieren-" + sp.i }));
      }
      const z = UI.feldZeile(sp.d, teile);
      z.firstChild.appendChild(el("span", "meta g-feld-intern", sp.i + " · " + sp.t + " · " + (QUELLEN[sp.q] || sp.q)));
      z.lastChild.classList.add("g-feld-wert");
      zeilen.push(z);
    }
    if (!zeilen.length) continue;
    gezeigt += zeilen.length;
    inhalt.appendChild(el("h3", "karte-untertitel", g.titel));
    inhalt.appendChild(UI.datenzeilen(zeilen));
  }
  UI.textSetzen($("g-felder-anzahl"), gezeigt + " von " + gesamt + " Feldern");
  if (!gezeigt) {
    inhalt.appendChild(UI.leerzustand({ sinnbild: "suche", titel: "Keine Treffer",
      text: such ? "Kein Feld passt zu «" + rohSuche.trim() + "»." : "Alle Felder sind leer.",
      aktion: such ? UI.knopf({ text: "Suche zurücksetzen", variante: "tonal", beiKlick: function () {
        rohSuche = "";
        const f = $("g-suche-felder");
        if (f) { f.value = ""; f.focus(); }
        felderFuellen();
      }, fokus: "suche-leeren-felder" }) : null }));
  }
}


/* ==================================================================
   7. Kopf, Navigation, Neuzeichnen
   ================================================================== */

/* Je Bereich ein Lead, der sagt, was man hier tut (höchstens 76 Zeichen). */
function bereich(k, d, gruppe, sinnbild, lead, bauen) {
  return {
    k: k, d: d, gruppe: gruppe, sinnbild: sinnbild,
    f: function (ziel) {
      nachfuehrer = [];
      F.seitenkopf({ lead: lead });
      bauen(ziel);
    }
  };
}

/* Drei Gruppen: was man pflegt («Gerät»), was SCCM liefert und was
   ausgewertet wird. */
const BEREICHE = [
  bereich("uebersicht", "Übersicht", "Gerät", "uebersicht",
    "Zustand, Hinweise und Lebenszyklus dieses Geräts auf einen Blick.", bereichUebersicht),
  bereich("stammdaten", "Stammdaten", "Gerät", "bearbeiten",
    "Name, Standort, Status, Bemerkung und Verlauf, von Hand gepflegt.", bereichStammdaten),
  bereich("beschaffung", "Beschaffung", "Gerät", "kalender",
    "Beschaffungsjahr und geplanter Ersatz steuern die Ersatzplanung.", bereichBeschaffung),
  bereich("inhaber", "Inhaber", "Gerät", "benutzer",
    "Wem das Gerät gehört: festlegen, wechseln oder entfernen.", bereichInhaber),
  bereich("software", "Software", "Aus SCCM", "software",
    "Was SCCM diesem Gerät zuweist und was darauf installiert ist.", bereichSoftware),
  bereich("hardware", "Hardware", "Aus SCCM", "prozessor",
    "Gerät, Prozessor, Speicher, Datenträger und Monitore laut SCCM.", bereichHardware),
  bereich("system", "System und Netzwerk", "Aus SCCM", "server",
    "Betriebssystem, Netzwerk und Verzeichnisdienste laut SCCM.", bereichSystem),
  bereich("sicherheit", "Sicherheit", "Aus SCCM", "schild",
    "Virenschutz, Verschlüsselung und TPM laut SCCM.", bereichSicherheit),
  bereich("aktivitaet", "Client und Aktivität", "Aus SCCM", "aktivitaet",
    "Der SCCM-Client und alle Zeitstempel dieses Geräts.", bereichAktivitaet),
  bereich("analyse", "Flottenvergleich", "Auswertung", "diagramm",
    "Wie dieses Gerät im Vergleich zur übrigen Flotte dasteht.", bereichAnalyse),
  bereich("felder", "Alle Felder", "Auswertung", "liste",
    "Der vollständige Datensatz, so wie er in SharePoint steht.", bereichFelder)
];

const BEREICH_NEU = bereich("neu", "Neuer " + CLIENT_WORT, "", "plus",
  "Nur, was beim Anlegen bekannt ist; alles Weitere folgt danach.", bereichNeu);

const BEREICHE_LISTE = mitInhaber ? BEREICHE : BEREICHE.filter(b => b.k !== "inhaber");

function sichtbareBereiche() {
  return neuModus ? [BEREICH_NEU] : BEREICHE_LISTE;
}

function anzeigeName() {
  const name = textWert("Title").trim();
  if (neuModus) return name || ("Neuer " + CLIENT_WORT);
  return name || "(ohne Namen)";
}

function unterTeile() {
  const teile = [];
  if (textWert("GebaeudeStock").trim()) teile.push(textWert("GebaeudeStock").trim());
  if (zeile.SCCM_Model) teile.push(String(zeile.SCCM_Model));
  if (zeile.SCCM_SerialNumber) teile.push("SN " + zeile.SCCM_SerialNumber);
  const wem = inhaber();
  if (wem) teile.push(personName(wem));
  return teile;
}

/* Status-Chips, immer Icon + Text. Online/Offline nur, wenn das Gerät in
   SCCM steht (Fehler D5: sonst ist der Zustand unbekannt, nicht offline). */
function statusChips() {
  const chips = [];
  const betrieb = geraeteStatus();
  if (betrieb === "Archiviert") chips.push(UI.status("Archiviert", "neutral", { sinnbild: "archiv" }));
  else if (betrieb === "Lager") chips.push(UI.status("Im Lager", "neutral", { sinnbild: "lager" }));

  if (inSccm()) {
    chips.push(onlineStatus(zeile.SCCM_Online));
    chips.push(UI.status("In SCCM", "erfolg"));
    chips.push(Hilfe.istJa(zeile.SCCM_ClientActive) ? UI.status("Client aktiv", "erfolg") : UI.status("Client inaktiv", "warnung"));
    if (Hilfe.istJa(zeile.SCCM_CoManaged)) chips.push(UI.status("Co-Managed", "neutral", { sinnbild: "verknuepfung" }));
    if (Hilfe.istJa(zeile.SCCM_IsVirtual)) chips.push(UI.status("Virtuell", "neutral", { sinnbild: "server" }));
  } else if (inDomaene()) {
    chips.push(UI.status("Nicht in SCCM", "warnung", { titel: "Der Abgleich findet zu diesem PC-Namen kein Gerät in SCCM." }));
  } else {
    chips.push(UI.status("Nicht in SCCM", "neutral", { sinnbild: "aus",
      titel: "Ausserhalb der Domäne: der Abgleich lässt dieses Gerät in Ruhe." }));
  }

  const es = ersatzStatus();
  const geplant = textWert("ErsatzGeplant").trim() || Modell.ersatzVorschlag(textWert("Beschaffungsjahr").trim());
  if (es === "ueberfaellig") {
    chips.push(UI.status("Ersatz überfällig", "gefahr", { titel: "Geplant war " + geplant + "; laufendes GJ " + Modell.gjAktuell() + "." }));
  } else if (es === "bald") {
    chips.push(UI.status("Ersatz in diesem GJ", "warnung", { titel: "Geplant für " + geplant + "." }));
  }
  return chips;
}

/* Schnellaktionen: der ganze Lagerablauf mit je einem Dialog, zuletzt
   «Löschen …» – wie im Telefon- und Softwarefenster rechts im Seitenkopf,
   in jedem Bereich erreichbar (Vertrag §1, Inventar §8 Nr. 8). Welche
   Lageraktionen erscheinen, hängt vom Status ab. Gesperrt mit Grund,
   solange etwas ungespeichert ist; während geschrieben wird, sperrt
   F.beschaeftigt (Fehler A8). Nur mit beiKlick bauen: F.seitenkopf lässt
   gleiche Knöpfe stehen und gibt ihnen den neuen Handler (kein Neuaufbau
   pro Taste). */
function kopfAktionen() {
  if (neuModus || !zeile) return [];
  const grund = sperrGrund();
  const aktion = function (text, sinnbild, fokus, beiKlick) {
    return UI.knopf({ text: text, variante: "leise", sinnbild: sinnbild, gesperrt: grund, beiKlick: beiKlick,
      fokus: "aktion-" + fokus });
  };
  const s = geraeteStatus();
  const liste = [];
  if (s === "Archiviert") {
    liste.push(aktion("Reaktivieren", "reaktivieren", "reaktivieren", function () { reaktivierenDialog(); }));
  } else {
    if (s === "Lager") {
      liste.push(mitInhaber
        ? aktion("Ausgeben an …", "ausgeben", "ausgeben", function () { inhaberWaehlenDialog(true); })
        : aktion("In Betrieb nehmen", "check", "betrieb", function () { inBetriebDialog(); }));
    } else {
      liste.push(aktion("Ins Lager legen", "lager", "lager", function () { insLagerDialog(); }));
    }
    liste.push(aktion("Archivieren", "archiv", "archivieren", function () { archivierenDialog(); }));
  }
  liste.push(aktion("Löschen …", "papierkorb", "loeschen", function () { loeschenDialog(); }));
  return liste;
}

/* Darf bei jedem Tastendruck laufen: F.seitenkopf gleicht an Ort und
   Stelle ab (Titel, Teile, Status nur bei Änderung; Knöpfe bleiben). */
function kopfZeichnen() {
  if (!zeile || F.geloescht()) return;
  F.seitenkopf({
    titel: anzeigeName(),
    unter: neuModus ? [] : unterTeile(),
    status: neuModus ? [] : statusChips(),
    aktionen: kopfAktionen()
  });
}

function navZeichnen() {
  F.navZeichnen(sichtbareBereiche(), aktiverBereich, bereichWechseln, { verstecken: neuModus, label: "Bereiche des Geräts" });
}

function speicherleisteZeichnen() {
  F.speicherleisteZeichnen({ neuModus: neuModus, anzahl: entwurf.anzahl(), neuText: "Neuer " + CLIENT_WORT });
}

/* Still neu zeichnen (Nachladen, Speichern, Verwerfen): kein Auftritt;
   derselbe Bereich behält Fokus, Schreibmarke und Rollen. */
function zeichnenAlles() {
  kopfZeichnen();
  navZeichnen();
  aktiverBereich = F.zeichneBereich(sichtbareBereiche(), aktiverBereich);
  speicherleisteZeichnen();
}

/* In einen anderen Bereich (Navigation oder ein Knopf im Inhalt): Adresse
   per replaceState (Fehler A4), Pille gleitet, Fade-through. «fokusId»:
   ein Feld, das danach den Fokus bekommt («Beschaffungsjahr erfassen»). */
function bereichWechseln(schluessel, fokusId) {
  aktiverBereich = schluessel;
  return F.bereichWechseln(sichtbareBereiche(), schluessel).then(function (k) {
    aktiverBereich = k || aktiverBereich;
    const f = fokusId ? $(fokusId) : null;
    if (f && aktiverBereich === schluessel) f.focus();
    return k;
  });
}


/* ==================================================================
   8. Laden, Speichern, Verwerfen
   ================================================================== */

/* Eine leere Zeile mit allen Spalten, für «Neues Gerät». «In Domäne» steht
   auf Ja: der Normalfall ist ein Gerät, das der SCCM-Abgleich pflegt. */
function leereZeile() {
  const z = {};
  for (const s of SPALTEN) z[s.i] = s.t === "Boolean" ? false : "";
  z.InDomaene = true;
  z.id = null;
  return z;
}

/* Die abgeleiteten Felder einer Zeile, die (noch) nicht aus der Liste
   kommt. Modell.anreichern läuft immer über die ganzen Listen. */
function abgeleiteteFelder(z) {
  z.__inhaberAlle = [];
  z.__inhaber = null;
  z.__inhaberName = "";
  z.__mehrfachInhaber = false;
  z.__status = Modell.status(z.Status);
  z.__archiviert = z.__status === "Archiviert";
  z.__namensDublette = false;
  z.__inSccm = Hilfe.istJa(z.SCCM_Found);
  z.__online = false;
  z.__ersatzJahr = String(z.ErsatzGeplant || "").trim() || Modell.ersatzVorschlag(z.Beschaffungsjahr);
  z.__ersatzStatus = Modell.ersatzStatus(z.ErsatzGeplant, z.Beschaffungsjahr);
  z.__such = "";
  return z;
}

function ladeText() {
  return UI.adresse.mock() ? "Vorführdaten werden aufgebaut …" : "Daten werden aus SharePoint geladen …";
}

/* «still»: im Hintergrund, ohne Ladezustand und ohne Fortschritt. */
async function datenLaden(still) {
  let anzahlClients = 0, anzahlBenutzer = 0;
  const fortschritt = function () {
    if (still) return;
    F.fortschritt(LISTEN_TITEL + " " + UI.zahlText(anzahlClients) + " · Benutzer " + UI.zahlText(anzahlBenutzer));
  };
  const geladen = await Promise.all([
    Daten.clients(listenName, function (n) { anzahlClients = n; fortschritt(); }),
    Daten.benutzer(function (n) { anzahlBenutzer = n; fortschritt(); })
  ]);
  /* Die Benutzer werden auch ohne Inhaberschaft gebraucht: die SCCM-Konten
     werden über sie aufgelöst. Bei EDU-Clients bleibt «Inhaber» leer. */
  if (mitInhaber) {
    const ergebnis = Modell.anreichern(geladen[0], geladen[1], null);
    alleClients = ergebnis.clients;
    alleBenutzer = ergebnis.benutzer;
  } else {
    alleBenutzer = Modell.anreichern([], geladen[1], null).benutzer;
    alleClients = Modell.clientsAnreichern(geladen[0]).clients;
  }
  F.stand();
}

function zeileWaehlen() {
  if (neuModus) {
    const grund = leereZeile();
    vorlageName = "";
    if (vorlageId) {
      const vorlage = alleClients.filter(z => String(z.id) === String(vorlageId))[0];
      if (vorlage) {
        vorlageName = String(vorlage.Title || "").trim();
        for (const s of SPALTEN) {
          if (!Modell.istBearbeitbar(s) || NICHT_DUPLIZIEREN.indexOf(s.i) > -1) continue;
          grund[s.i] = vorlage[s.i];
        }
      }
    }
    zeile = abgeleiteteFelder(grund);
    return;
  }
  const treffer = alleClients.filter(z => String(z.id) === String(elementId))[0];
  if (!treffer) {
    const fehler = new Error("Zur Listen-ID " + elementId + " gibt es in der Liste «" + LISTEN_TITEL
      + "» keine Zeile. Vermutlich wurde sie inzwischen gelöscht, oder der Client steht in der anderen Client-Liste.");
    fehler.status = 404;
    throw fehler;
  }
  zeile = treffer;
}

/* Still nachladen und neu zeichnen: Auto-Nachladen, nach Schnellaktionen
   und nach dem Speichern. Nie mit Auftritt. */
async function nachladenStill() {
  await datenLaden(true);
  zeileWaehlen();
  zeichnenAlles();
}

async function neuLaden() {
  try {
    F.zeigeLaden(ladeText());
    await datenLaden(false);
    zeileWaehlen();
    zeichnenAlles();
    await F.zeigeInhalt();
  } catch (fehler) {
    ladeFehlerZeigen(fehler);
  }
}

function ladeFehlerZeigen(fehler) {
  F.ladefehler(fehler, { titel: "Client nicht gefunden",
    hinweis: "Gelöschte Zeilen liegen 93 Tage im Papierkorb der SharePoint-Site und lassen sich dort zurückholen." });
}

/* ---------- Prüfen ---------- */

function pruefen() {
  const name = textWert("Title").trim();
  if (!name) return { feld: "Title", text: "Der PC-Name darf nicht leer sein." };

  /* Der Name entscheidet die Liste: alles ab «EDU» gehört zu den
     EDU-Clients. Ein Name der anderen Liste wäre kein Tippfehler mit kleinen
     Folgen: der nächste Abgleich legte das Gerät drüben neu an und
     archivierte diese Zeile. */
  if (Modell.clientListe(name) !== listenName) {
    return { feld: "Title", text: listenName === "edu"
      ? "Ein EDU-Client muss mit «" + Modell.EDU_PRAEFIX + "» beginnen. «" + name + "» gehört in die Liste «ADMIN-Clients»."
      : "«" + name + "» beginnt mit «" + Modell.EDU_PRAEFIX + "» und gehört damit in die Liste «EDU-Clients»." };
  }
  for (const feld of ["Beschaffungsjahr", "ErsatzGeplant"]) {
    const w = textWert(feld).trim();
    if (w && !Modell.gjGueltig(w)) {
      return { feld: feld, text: "«" + SPALTE[feld].d + "» muss ein Geschäftsjahr in der Form «2023/2024» sein "
        + "(zwei aufeinanderfolgende Jahre)." };
    }
  }
  /* Nur einen geänderten Status prüfen: ein gespeicherter Altwert («aktiv»,
     klein geschrieben) zeigt die Auswahl als «Aktiv» an und darf das
     Speichern anderer Felder nicht blockieren. */
  const status = textWert("Status").trim();
  if (entwurf.istGeaendert("Status") && status && Modell.STATUS_WERTE.indexOf(status) === -1) {
    return { feld: "Status", text: "«Status» muss «" + Modell.STATUS_WERTE.join("», «") + "» oder leer sein." };
  }
  return null;
}

/* Werte so aufbereiten, wie Graph sie erwartet. */
function fuerGraph(feld, roh) {
  const spalte = SPALTE[feld];
  if (!spalte) return roh;
  if (spalte.t === "Boolean") return roh !== false && roh !== null && roh !== undefined && roh !== "" ? !!roh : (feld === "InDomaene" ? roh !== false : false);
  if (spalte.t === "Number") {
    if (roh === "" || roh === null || roh === undefined) return null;
    const n = Number(roh);
    return isNaN(n) ? null : n;
  }
  return roh === null || roh === undefined ? "" : String(roh);
}

/* Speichern und Anlegen über F.speicherAblauf: nichts ohne Änderungen
   (A5), Schreiben und Nachladen getrennt (A7), Aktionen gesperrt (A8). */
let zuletztAngelegt = false;

function speichern() {
  return F.speicherAblauf({
    anzahl: function () { return entwurf.anzahl(); },
    immer: neuModus,
    pruefen: pruefen,
    schreiben: schreiben,
    nachladen: async function (erg) {
      // Das Gerät ist gespeichert, eine Person aber nicht nachgeführt: das
      // steht als Fehler neben der Erfolgsmeldung, bis man es wegklickt.
      if (erg && erg.inhaberFehler) UI.meldung(erg.inhaberFehler, { ton: "fehler" });
      await datenLaden(true);
      zeileWaehlen();
      nachSpeichernZeigen();
    },
    zeichnen: nachSpeichernZeigen,
    erfolgText: function (erg) {
      const dubletten = erg && erg.dubletten
        ? " Achtung: «" + erg.name + "» steht jetzt " + (erg.dubletten + 1) + " Mal in der Liste." : "";
      if (erg && erg.neu) return "Gerät angelegt." + dubletten;
      const mit = erg && erg.nachgefuehrt && erg.nachgefuehrt.length
        ? " " + namenText(erg.nachgefuehrt) + (erg.nachgefuehrt.length === 1 ? " bleibt Inhaber." : " tragen den neuen Namen.")
        : "";
      return (erg && erg.anzahl === 1 ? "Änderung gespeichert." : (erg ? erg.anzahl : 0) + " Änderungen gespeichert.")
        + mit + dubletten;
    }
  });
}

async function schreiben() {
  const name = textWert("Title").trim();
  const dubletten = namensZwillinge().length;
  const felder = {};
  if (neuModus) {
    // Beim Anlegen alle bearbeitbaren Spalten mitgeben, damit die Zeile
    // vollständig ist und nicht halb leer in der Liste steht.
    for (const s of SPALTEN) if (Modell.istBearbeitbar(s)) felder[s.i] = fuerGraph(s.i, wert(s.i));
    const neu = await Daten.anlegen(listenName, felder);
    elementId = String(neu.id);
    neuModus = false;
    zuletztAngelegt = true;
    // Die lokale Zeile trägt das Angelegte: scheitert das Nachladen,
    // erscheint trotzdem das gespeicherte Gerät statt eines leeren Formulars.
    zeile = abgeleiteteFelder(Object.assign({}, zeile, felder, neu));
    entwurf.leeren();
    aktiverBereich = "stammdaten";
    // Fehler A2: die Adresse zeigt jetzt auf das Gerät, in seiner Liste.
    try { history.replaceState(null, "", UI.adresse.client(listenName, elementId, { bereich: "stammdaten" })); } catch (e) { /* file:// */ }
    F.melden("zeile-neu", elementId);
    return { neu: true, name: name, dubletten: dubletten };
  }

  const aenderungen = entwurf.aenderungen();
  for (const feld in aenderungen) felder[feld] = fuerGraph(feld, aenderungen[feld]);
  /* Ein Statuswechsel steht automatisch im Verlauf, angehängt an den
     Verlauf, wie er gespeichert würde (inklusive eigener Einträge). */
  if (entwurf.istGeaendert("Status")) {
    const alt = Modell.status(zeile.Status);
    const neu = geraeteStatus();
    if (alt !== neu) felder.Verlauf = F.verlaufAnhaengen(wert("Verlauf"), "Status geändert: " + alt + " → " + neu);
  }
  const anzahl = entwurf.anzahl();
  // Vor dem Speichern: danach trägt die Zeile schon den neuen Namen.
  const altName = String(zeile.Title || "").trim();
  const mitziehen = mitziehende();
  zuletztAngelegt = false;
  const antwort = await Daten.speichern(listenName, elementId, felder, zeile.__etag);
  F.uebernehmen(zeile, felder, antwort);
  abgeleiteteFelder(zeile);
  entwurf.leeren();
  F.melden("zeile-geaendert", elementId);

  /* Umbenannt: der Inhaber zieht mit (Feld «Computer» + Verlaufseintrag).
     Das Gerät ist dann schon gespeichert; scheitert eine Person, bleibt
     der Speichervorgang ein Erfolg und die Meldung sagt, wer fehlt. */
  let inhaberFehler = "";
  if (mitziehen.length) {
    try {
      await inhaberSchreiben(mitziehen.map(b => ({ benutzer: b, pcName: name,
        eintrag: "Gerät umbenannt: " + altName + " → " + name })), null);
    } catch (fehler) {
      inhaberFehler = "Der neue Name ist gespeichert, aber " + F.fehlerText(fehler).replace(/[.\s]+$/, "")
        + ". Den Inhaber bitte im Bereich «Inhaber» neu festlegen.";
    }
  }
  return { anzahl: anzahl, name: name, dubletten: dubletten,
    nachgefuehrt: inhaberFehler ? [] : mitziehen, inhaberFehler: inhaberFehler };
}

/* Nach dem Anlegen wechselt das Formular in das normale Fenster (mit
   Bereichen, Stammdaten zuerst); sonst wird still neu gezeichnet. */
function nachSpeichernZeigen() {
  if (!zuletztAngelegt) { zeichnenAlles(); return; }
  zuletztAngelegt = false;
  kopfZeichnen();
  navZeichnen();
  speicherleisteZeichnen();
  bereichWechseln("stammdaten");
}

function verwerfen() {
  return F.verwerfen({ anzahl: entwurf.anzahl(), neuModus: neuModus, danach: function () {
    entwurf.leeren();
    zeichnenAlles();
  } });
}


/* ==================================================================
   9. Inhaberschaft und Schnellaktionen
   ================================================================== */

/* Schreibt zuerst das Gerät (Status, Verlauf), dann das Feld «Computer»
   jeder Person. Ein leerer pcName entfernt die Inhaberschaft (null, damit
   Graph das Feld wirklich leert); «eintrag» ersetzt den üblichen Satz im
   Verlauf der Person (Umbenennen). Scheitert ein Schritt, sagt die Meldung,
   welcher; nachgeladen wird danach immer (F.beschaeftigt, Fehler A8). */
async function inhaberSchreiben(schritte, geraetFelder) {
  let geraetGespeichert = false;
  if (geraetFelder) {
    await Daten.speichern(listenName, elementId, geraetFelder, zeile.__etag);
    geraetGespeichert = true;
    F.melden("zeile-geaendert", elementId);
  }
  for (const schritt of schritte) {
    const neuerWert = String(schritt.pcName || "").trim() || null;
    const bisher = String(schritt.benutzer.Computer || "").trim();
    const eintrag = schritt.eintrag || (neuerWert
      ? "Gerät erhalten: " + neuerWert + (bisher && bisher !== neuerWert ? " (vorher: " + bisher + ")" : "")
      : (bisher ? "Gerät abgegeben: " + bisher : ""));
    const felder = { Computer: neuerWert };
    if (eintrag) felder.Verlauf = F.verlaufAnhaengen(schritt.benutzer.Verlauf, eintrag);
    try {
      await Daten.speichern("benutzer", schritt.benutzer.id, felder, schritt.benutzer.__etag);
    } catch (fehler) {
      throw new Error((geraetGespeichert ? "Das Gerät ist gespeichert, aber " : "")
        + "«" + personName(schritt.benutzer) + "» konnte nicht nachgeführt werden: " + F.fehlerText(fehler));
    }
    F.melden("benutzer-geaendert", schritt.benutzer.id);
  }
}

/* Eine Aktion aus einem offenen Dialog: der Hauptknopf zeigt «beschäftigt»,
   Esc und Schleier schliessen nicht, Kopfaktionen und Speicherleiste sind
   gesperrt. Erst wenn alles geschrieben und nachgeladen ist, schliesst der
   Dialog; bei einem Fehler bleibt er offen, die Meldung steht darüber. */
async function imDialogAusfuehren(d, ja, abbrechen, arbeit) {
  if (F.istBeschaeftigt()) {
    UI.meldung("Es wird gerade gespeichert. Bitte gleich noch einmal versuchen.", { ton: "info" });
    return false;
  }
  d.sperren(true);
  abbrechen.disabled = true;
  UI.beschaeftigt(ja, true, "Wird gespeichert …");
  let fehler = null;
  await F.beschaeftigt(async function () {
    try { await arbeit(); } catch (e) { fehler = e; }
  });
  if (fehler) {
    d.sperren(false);
    abbrechen.disabled = false;
    await UI.beschaeftigt(ja, false);
    UI.meldung("Speichern fehlgeschlagen. " + F.fehlerText(fehler), { ton: "fehler" });
    return false;
  }
  await UI.beschaeftigtAbwarten(ja);
  d.sperren(false);
  d.schliessen("ja");
  fokusNachAktion();
  return true;
}

/* Nach einer Schnellaktion gibt es den auslösenden Knopf oft nicht mehr
   («Ins Lager legen» wird zu «Ausgeben an …»): der Rückfokus der Ebene
   fiele dann auf die Tafel. Stattdessen auf die erste Aktion im Kopf,
   sonst auf den Titel – dort, wo die Person weiterarbeitet. */
function fokusNachAktion() {
  const a = document.activeElement;
  if (a && a !== document.body && a !== Rahmen.elemente().tafel) return;
  const kopf = $("g-kopf");
  const ziel = (kopf && kopf.querySelector(".seitenkopf-aktionen > .knopf")) || $("g-titel");
  if (ziel) ziel.focus({ preventScroll: true });
}

function abgabeSchritte() {
  return inhaberAlle().map(a => ({ benutzer: a, pcName: "" }));
}

function verlaufTextMit(basis, notiz) {
  const n = String(notiz || "").trim();
  return n ? basis + " – " + n : basis;
}

/* Dialog einer Schnellaktion: Frage als Titel, Text nennt die Folge, eine
   freiwillige Notiz für den Verlauf, «Abbrechen» und die Hauptaktion. */
function aktionsDialog(o) {
  if (F.istBeschaeftigt()) return;
  const inhalt = [el("p", "dialog-text", o.text)];
  if (o.warnung) inhalt.push(UI.banner({ ton: "warnung", text: o.warnung }));
  const notiz = UI.eingabe({ art: "textbereich", id: "g-aktion-notiz", zeilen: 2, platzhalter: "z. B. den Grund" });
  inhalt.push(UI.feld("Notiz für den Verlauf (freiwillig)", notiz));
  const abbrechen = UI.knopf({ text: "Abbrechen", variante: "leise", beiKlick: function () { d.schliessen("abbrechen"); } });
  const ja = UI.knopf({ text: o.ja, variante: "primaer", beiKlick: async function () {
    if (await imDialogAusfuehren(d, ja, abbrechen, function () { return o.ausfuehren(notiz.value); })) {
      UI.meldung(o.erfolg);
    }
  } });
  const d = UI.dialog({ titel: o.titel, inhalt: inhalt, knoepfe: [abbrechen, ja], breit: true });
  return d;
}

/* Wer bei einer Schnellaktion das Gerät abgibt: alle Einträge, auch
   überzählige – abgabeSchritte() leert sie alle. */
function inhaberSatz() {
  const personen = inhaberAlle();
  if (!personen.length) return "";
  return " " + namenText(personen) + (personen.length === 1 ? " gibt" : " geben") + " das Gerät dabei ab.";
}

function insLagerDialog() {
  const wem = inhaber();
  aktionsDialog({
    titel: "Ins Lager legen?", ja: "Ins Lager legen", erfolg: "Gerät liegt im Lager.",
    text: "«" + anzeigeName() + "» bekommt den Status «Lager» und bleibt in der Liste." + inhaberSatz(),
    ausfuehren: function (notiz) {
      return inhaberSchreiben(abgabeSchritte(), { Status: "Lager", Verlauf: F.verlaufAnhaengen(wert("Verlauf"),
        verlaufTextMit("Ins Lager gelegt" + (wem ? " (vorher: " + personName(wem) + ")" : ""), notiz)) });
    }
  });
}

function archivierenDialog() {
  const wem = inhaber();
  aktionsDialog({
    titel: "Archivieren?", ja: "Archivieren", erfolg: "Gerät archiviert.",
    text: "«" + anzeigeName() + "» bekommt den Status «Archiviert» und ist in der Liste und den Kennzahlen "
      + "ausgeblendet." + inhaberSatz(),
    warnung: inSccm() ? "Das Gerät steht noch in SCCM. Solange das so ist, setzt der nächste Abgleich es wieder "
      + "auf «Aktiv». Für ein eingelagertes Gerät ist «Ins Lager legen» die richtige Wahl." : "",
    ausfuehren: function (notiz) {
      return inhaberSchreiben(abgabeSchritte(), { Status: "Archiviert", Verlauf: F.verlaufAnhaengen(wert("Verlauf"),
        verlaufTextMit("Archiviert" + (wem ? " (vorher: " + personName(wem) + ")" : ""), notiz)) });
    }
  });
}

function reaktivierenDialog() {
  aktionsDialog({
    titel: "Reaktivieren?", ja: "Reaktivieren", erfolg: "Gerät reaktiviert; es liegt im Lager.",
    text: "«" + anzeigeName() + "» kommt zurück ins Lager (Status «Lager») und erscheint wieder in der Liste. "
      + (mitInhaber ? "Von dort lässt es sich ausgeben." : "Von dort lässt es sich wieder in Betrieb nehmen."),
    ausfuehren: function (notiz) {
      return inhaberSchreiben([], { Status: "Lager", Verlauf: F.verlaufAnhaengen(wert("Verlauf"),
        verlaufTextMit("Reaktiviert, ins Lager gelegt", notiz)) });
    }
  });
}

/* EDU-Clients haben keinen Inhaber: aus dem Lager geht es direkt zurück
   in den Betrieb. */
function inBetriebDialog() {
  aktionsDialog({
    titel: "In Betrieb nehmen?", ja: "In Betrieb nehmen", erfolg: "Gerät ist wieder in Betrieb.",
    text: "«" + anzeigeName() + "» bekommt wieder den Status «Aktiv».",
    ausfuehren: function (notiz) {
      return inhaberSchreiben([], { Status: "Aktiv", Verlauf: F.verlaufAnhaengen(wert("Verlauf"),
        verlaufTextMit("In Betrieb genommen", notiz)) });
    }
  });
}

function inhaberEntfernenDialog(b) {
  if (F.istBeschaeftigt()) return;
  const istInhaber = !!inhaber() && String(inhaber().id) === String(b.id);
  const titel = istInhaber ? "Inhaber entfernen?" : "Eintrag entfernen?";
  const abbrechen = UI.knopf({ text: "Abbrechen", variante: "leise", beiKlick: function () { d.schliessen("abbrechen"); } });
  const ja = UI.knopf({ text: istInhaber ? "Inhaber entfernen" : "Eintrag entfernen", variante: "primaer",
    beiKlick: async function () {
      const ok = await imDialogAusfuehren(d, ja, abbrechen, function () {
        return inhaberSchreiben([{ benutzer: b, pcName: "" }], istInhaber
          ? { Verlauf: F.verlaufAnhaengen(wert("Verlauf"), "Inhaber entfernt: " + personName(b)) } : null);
      });
      if (ok) UI.meldung("«" + personName(b) + "» ist nicht mehr eingetragen.");
    } });
  const d = UI.dialog({ titel: titel, knoepfe: [abbrechen, ja], inhalt: [el("p", "dialog-text",
    "«" + personName(b) + "» " + (istInhaber ? "ist Inhaber dieses Geräts. " : "trägt dieses Gerät. ")
    + "Das Feld «Computer» dieser Person wird geleert; das Gerät selbst bleibt, wie es ist.")] });
}

/* Inhaber wählen in zwei Schritten: suchen und wählen, dann bestätigen.
   Beide Schritte stehen im selben Dialog (an Ort und Stelle neu gefüllt).
   «ausgabe» (nur aus der Schnellaktion «Ausgeben an …»): das Gerät
   verlässt dabei das Lager und wird «Aktiv». Sonst ein gewöhnlicher
   Inhaberwechsel – auch bei archivierten Geräten (Fehler A3). */
function inhaberWaehlenDialog(ausgabe) {
  if (F.istBeschaeftigt()) return;
  const pcName = textWert("Title").trim();
  if (!pcName) {
    UI.meldung("Ohne PC-Name lässt sich kein Inhaber festlegen.", { ton: "fehler" });
    return;
  }
  const bisheriger = inhaber();
  const ausLager = ausgabe === true && geraeteStatus() !== "Aktiv";
  const titel = ausLager ? "Ausgeben an …" : (bisheriger ? "Inhaber wechseln" : "Inhaber festlegen");
  const d = UI.dialog({ titel: titel, breit: true });
  let suchText = "";

  function schritt1() {
    d.titel(titel);
    UI.leeren(d.inhalt);
    UI.leeren(d.knoepfe);
    d.inhalt.appendChild(el("p", "dialog-text", "Die gewählte Person wird Inhaberin von «" + pcName + "»."
      + (ausLager ? " Das Gerät verlässt das Lager und wird «Aktiv»." : "")
      + (bisheriger ? " «" + personName(bisheriger) + "» gibt es dabei ab: ein Gerät hat genau einen Inhaber." : "")));
    // .dialog-liste (rahmen.css): rollt selbst und nimmt die Resthöhe des
    // Dialogs; Suchfeld, Titel und Knöpfe bleiben stehen.
    const liste = el("div", "dialog-liste");
    liste.setAttribute("data-rolle", "treffer");
    const zahl = el("p", "meta");
    zahl.setAttribute("aria-live", "polite");
    const suche = UI.suchfeld({ id: "g-inhaber-suche", platzhalter: "Name, Login oder Abteilung", label: "Person suchen",
      wert: suchText, verzoegerung: 100, beiEingabe: function (w) { suchText = w; treffer(liste, zahl); } });
    UI.anhaengen(d.inhalt, [suche, liste, zahl]);
    d.knoepfe.appendChild(UI.knopf({ text: "Abbrechen", variante: "leise", beiKlick: function () { d.schliessen("abbrechen"); } }));
    treffer(liste, zahl);
    suche.eingabe.focus();
  }

  /* Gesucht wird nur, was der Platzhalter verspricht: Name, Login und
     Abteilung (nicht der Volltextindex __such – sonst träfe «meier» auch,
     wen ein Herr Meierhans führt, und stünde alphabetisch zuoberst). Jedes
     Wort muss passen, die Reihenfolge ist egal («ammann urs»). Wer schon
     über Name oder Login passt, steht vor den Treffern über die Abteilung. */
  function treffer(liste, zahl) {
    const t = suchText.trim().toLowerCase();
    const woerter = t.split(/\s+/).filter(Boolean);
    const k = Modell.schluessel(pcName);
    const rang = new Map();
    const passend = alleBenutzer.filter(function (b) {
      if (Modell.schluessel(b.Computer) === k) return false;
      if (!woerter.length) return true;
      const person = (personName(b) + " " + UI.text(b.Title)).toLowerCase();
      const alle = person + " " + UI.text(b.Abteilung).toLowerCase();
      if (!woerter.every(w => alle.indexOf(w) > -1)) return false;
      rang.set(b, woerter.every(w => person.indexOf(w) > -1) ? 0 : 1);
      return true;
    }).sort((a, b) => ((rang.get(a) || 0) - (rang.get(b) || 0)) || Hilfe.vergleiche(a.__name, b.__name));
    UI.leeren(liste);
    if (!passend.length) {
      liste.appendChild(UI.leerzustand({ sinnbild: "suche", titel: "Keine Treffer",
        text: t ? "Niemand passt zu «" + suchText.trim() + "»." : "Es gibt keine Personen ohne dieses Gerät." }));
      UI.textSetzen(zahl, "");
      return;
    }
    liste.appendChild(UI.zeilenliste(passend.slice(0, 40).map(function (b) {
      const unter = personUnter(b).slice(0, 2);
      unter.push(String(b.Computer || "").trim() ? "hat «" + String(b.Computer).trim() + "»" : "kein Gerät");
      return UI.listenZeile({ titel: personName(b), unter: unter, sinnbild: "benutzer",
        beiKlick: function () { schritt2(b); } });
    })));
    UI.textSetzen(zahl, passend.length > 40
      ? "40 von " + UI.zahlText(passend.length) + " Personen; die Suche grenzt weiter ein."
      : (passend.length === 1 ? "1 Person" : UI.zahlText(passend.length) + " Personen"));
  }

  function schritt2(b) {
    const bisher = String(b.Computer || "").trim();
    const abgebende = inhaberAlle().filter(a => String(a.id) !== String(b.id));
    d.titel(ausLager ? "Ausgeben an «" + personName(b) + "»?" : "«" + personName(b) + "» als Inhaber?");
    UI.leeren(d.inhalt);
    UI.leeren(d.knoepfe);
    d.inhalt.appendChild(el("p", "dialog-text", "«" + personName(b) + "» (" + (String(b.Title || "").trim() || "ohne Login") + ")"
      + (String(b.Abteilung || "").trim() ? ", " + String(b.Abteilung).trim() : "")
      + " wird Inhaberin von «" + pcName + "»." + (ausLager ? " Das Gerät wird «Aktiv»." : "")));
    if (abgebende.length) {
      d.inhalt.appendChild(UI.banner({ ton: "warnung", text: abgebende.length === 1
        ? "«" + personName(abgebende[0]) + "» gibt das Gerät ab; das Feld «Computer» dieser Person wird geleert."
        : "Diese " + abgebende.length + " Personen geben das Gerät ab; ihr Feld «Computer» wird geleert: "
          + abgebende.map(personName).join(", ") + "." }));
    }
    if (bisher) {
      d.inhalt.appendChild(UI.banner({ ton: "warnung", text: "«" + personName(b) + "» hat zurzeit «" + bisher
        + "». Dieser Eintrag wird ersetzt." }));
    } else {
      d.inhalt.appendChild(UI.hinweis("Dieser Person ist zurzeit kein Gerät zugeordnet."));
    }
    const zurueck = UI.knopf({ text: "Zurück", variante: "leise", beiKlick: function () { schritt1(); } });
    const ja = UI.knopf({ text: ausLager ? "Ausgeben" : (bisheriger ? "Wechseln" : "Festlegen"), variante: "primaer",
      beiKlick: async function () {
        const verlaufText = ausLager ? "Aus dem Lager ausgegeben an " + personName(b)
          : (bisheriger ? "Inhaber gewechselt: " + personName(bisheriger) + " → " + personName(b)
            : "Inhaber festgelegt: " + personName(b));
        const geraetFelder = { Verlauf: F.verlaufAnhaengen(wert("Verlauf"), verlaufText) };
        if (ausLager) geraetFelder.Status = "Aktiv";
        /* Erst lösen, dann setzen: dazwischen hat das Gerät keinen Inhaber,
           aber nie zwei. */
        const schritte = abgebende.map(a => ({ benutzer: a, pcName: "" }));
        schritte.push({ benutzer: b, pcName: pcName });
        const ok = await imDialogAusfuehren(d, ja, zurueck, function () { return inhaberSchreiben(schritte, geraetFelder); });
        if (ok) UI.meldung(ausLager ? "Ausgegeben an «" + personName(b) + "»." : "«" + personName(b) + "» ist jetzt Inhaber.");
      } });
    UI.anhaengen(d.knoepfe, [zurueck, ja]);
    ja.focus();
  }

  schritt1();
}


/* ==================================================================
   10. Löschen, Start
   ================================================================== */

/* Löschen mit Eintippen des PC-Namens; danach der Endzustand mit «Zur
   Liste» (gemerkte Liste samt Filtern, Fehler A6). */
function loeschenDialog() {
  const name = anzeigeName();
  const personen = inhaberAlle();
  F.loeschenDialog({
    titel: "Gerät löschen?",
    text: "Die Zeile wird aus der Liste «" + LISTEN_TITEL + "» entfernt und landet im Papierkorb der SharePoint-Site. "
      + "Von dort lässt sie sich 93 Tage lang zurückholen.",
    warnung: personen.length === 1
      ? "«" + personName(personen[0]) + "» ist Inhaber dieses Geräts. Der Eintrag bleibt bestehen und zeigt danach ins Leere."
      : (personen.length > 1 ? personen.length + " Personen tragen dieses Gerät. Die Einträge bleiben bestehen und "
        + "zeigen danach ins Leere." : ""),
    wort: textWert("Title").trim() || String(zeile.id),
    knopfText: "Endgültig löschen",
    beiLoeschen: async function () {
      await Daten.loeschen(listenName, zeile.id);
      F.melden("zeile-geloescht", zeile.id);
      entwurf.leeren();
    },
    ende: {
      titel: "Gerät gelöscht",
      text: "«" + name + "» wurde aus der Liste «" + LISTEN_TITEL + "» entfernt und liegt im Papierkorb der SharePoint-Site.",
      knopfText: "Zur Liste"
    }
  });
}

/* Ctrl/Cmd+S, Esc (Verwerfen-Frage), Speicherleiste, Schutz vor dem
   Verlassen und Hash-Änderungen: alles über F.ereignisse. */
F.ereignisse({
  speichern: speichern,
  verwerfen: verwerfen,
  anzahlAenderungen: function () { return entwurf.anzahl(); },
  verlassenFrei: function () { return F.geloescht(); },
  beiHash: function (h) {
    if (neuModus) return;
    if (BEREICHE_LISTE.some(b => b.k === h)) {
      if (h !== aktiverBereich) bereichWechseln(h);
      return;
    }
    // Ein unbekannter Bereich («#inhaber» bei einem EDU-Client): die
    // Adresse zeigt wieder, was zu sehen ist.
    adresseBereichSetzen(aktiverBereich);
  }
});

/* Statt eines Knopfes «Neu laden» holt sich das Fenster den Stand in
   ruhigen Abständen selbst: still, ohne Auftritt. Übersprungen wird bei
   Ungespeichertem, beim Anlegen und (in F.autoStarten) bei offener Ebene,
   laufender Arbeit, Fokus in einem Eingabefeld und im Hintergrund-Tab. */
F.autoStarten(function () { return !neuModus && !F.geloescht() && entwurf.anzahl() === 0; }, nachladenStill);

function adresseBereichSetzen(k) {
  try { history.replaceState(history.state, "", location.pathname + location.search + "#" + k); } catch (e) { /* file:// */ }
}

async function start() {
  aktiverBereich = neuModus ? "neu" : (F.hashBereich(BEREICHE_LISTE) || "uebersicht");
  if (!neuModus && location.hash && location.hash !== "#" + aktiverBereich) adresseBereichSetzen(aktiverBereich);
  F.logoZeichnen(listenName);
  navZeichnen();
  F.bandZeichnen(undefined, function () {
    entwurf.leeren();
    F.melden("zeile-geaendert", elementId);
    neuLaden();
  });
  try {
    if (!UI.adresse.mock()) {
      F.zeigeLaden("Anmeldung wird geprüft …");
      await Auth.anmeldungSicherstellen();
    }
    F.kontoZeigen();
    if (!neuModus && !elementId) {
      F.zeigeFehler("Kein Client angegeben", "Dieses Fenster braucht Liste und Listen-ID in der Adresse, zum Beispiel "
        + "client.html?liste=admin&id=5.", "Normalerweise wird es aus einer der Client-Listen heraus geöffnet.",
        "Zur Liste", function () { F.zurListe(); });
      return;
    }
    F.zeigeLaden(ladeText());
    await datenLaden(false);
    zeileWaehlen();
    zeichnenAlles();
    await F.zeigeInhalt();
  } catch (fehler) {
    ladeFehlerZeigen(fehler);
  }
}

start();

})();

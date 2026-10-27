/* client.js – Geräteseite des ICT-Inventars.

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
   Liste «Benutzer» (Spalte «AdminClientId» mit der Listen-ID dieser Zeile).
   Die Inhaberschaft hängt damit an der Hardware, nicht am PC-Namen:
   Umbenennen ändert sie nicht, und ein gleichnamiges neues Gerät erbt sie
   nicht. Nur ADMIN-Clients haben einen Inhaber, und höchstens einen;
   gepflegt wird er hier und auf der Benutzerseite. SCCM meldet Primär- und
   Anmeldebenutzer, schreibt die Inhaberschaft aber nie.

   Gebaut wird nur über das Fundament: UI (bausteine.js, rahmen.js), Rahmen,
   Bewegung und F (fenster.js). Diese Datei enthält das Fachliche und das
   Seitenlayout der Bereiche, keine eigenen Bausteine.

   Drei Regeln prägen den Aufbau:
     - Ein Bereich wird gebaut, wenn er erscheint (F.bereichWechseln: mit
       Auftritt) oder still neu gezeichnet, wenn sich die Daten ändern
       (Nachladen, Speichern: F.zeichneBereich, ohne Bewegung, Fokus und
       Rollen bleiben; geänderte Kennzahlen zählen vom gezeigten Wert).
       Tippen zeichnet NIE neu – ein Neuaufbau unter dem Fokus verlöre
       Schreibmarke und Tab-Reihenfolge: was von einem Feld abhängt
       (Hinweise, Vorschlag, Lebenszyklus, Kopf), führen kleine Nachführer
       an Ort und Stelle nach.
     - Nachführer und Klick-Handler halten keine Knoten und keine Zeilen
       eines Zeichnens fest: sie suchen den Knoten bei jedem Aufruf über
       seine id bzw. sein data-fokus und die Person oder das Gerät über
       die Listen-ID. Gleicht ein stilles Neuzeichnen ab (UI.abgleichen),
       bleiben die schon stehenden Knoten im Dokument samt ihren Zuhörern,
       nicht die eben gebauten.
     - Jedes Bedienelement trägt eine id oder ein data-fokus, damit
       F.zeichneBereich und die Dialoge den Fokus wiederfinden. Trefferlisten
       (Software, Alle Felder, Inhaber-Dialog) gleichen beim Tippen ab
       (UI.abgleichen, Zeilen mit data-ds-key) statt neu zu bauen.

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
   der Tooltip nennt ihn), an Ort und Stelle nachgeführt. Knöpfe ohne id
   tragen ein «fokus» (data-fokus) für F.zeichneBereich und den Rückfokus
   der Dialoge. Handler mit Parametern nie direkt als beiKlick übergeben:
   sie bekämen sonst das Klickereignis als ersten Parameter. */
function sperrGrund() {
  return entwurf.anzahl() > 0 ? SPERR_GRUND : "";
}

/* Für Nachführer: der Knoten, der im Dokument steht – der gebaute selbst
   oder, hat ein stilles Abgleichen den schon stehenden behalten, dieser
   (gefunden über die id bzw. das data-fokus des gebauten). */
function stehend(knoten) {
  if (!knoten || knoten.isConnected) return knoten || null;
  const bereich = $("g-bereich");
  if (knoten.id) return document.getElementById(knoten.id);
  const f = knoten.getAttribute("data-fokus");
  return bereich && f ? bereich.querySelector("[data-fokus=\"" + CSS.escape(f) + "\"]") : null;
}

/* Schlüssel fürs Abgleichen (data-ds-key): zwei Knoten mit verschiedenem
   Schlüssel werden nie ineinander gepatcht – eine Zeile von Person A wird
   nie die von Person B, ein Leerzustand nie eine Tabelle. */
function schluesselSetzen(knoten, schluessel) {
  if (knoten) knoten.setAttribute("data-ds-key", String(schluessel));
  return knoten;
}

/* Beim Bauen gilt die Sperre dem gebauten Knopf, danach dem stehenden. */
function sperrenNachfuehren(knoepfe) {
  const setzen = function (beimBauen) {
    const grund = sperrGrund();
    for (const k of knoepfe) UI.knopfSperren(beimBauen === true ? k : stehend(k), grund);
  };
  setzen(true);
  nachfuehren(setzen);
}

function raster(kinder) { return UI.anhaengen(el("div", "ds-grid-2"), kinder); }

/* Jeder Bereich steht in EINEM Stapel: so staffelt der Auftritt beim
   Bereichswechsel seine Karten (Bewegung.auftritt staffelt Raster wie
   .ds-stack, .ds-grid-2 und .karten, nicht lose Karten). */
function stapel(ziel) { return ziel.appendChild(el("div", "ds-stack")); }

/* Zeile für einen Wert aus SCCM; leere Werte zeigen «–». */
function datenZeile(name, w, neben) {
  return UI.feldZeile(name, w === null || w === undefined ? "" : w, { neben: neben });
}

function datumZeile(name, roh) {
  return datenZeile(name, UI.zeitText(roh), Hilfe.relativText(roh));
}

function leer(roh) { return roh === null || roh === undefined || String(roh).trim() === ""; }

/* Ja/Nein aus SCCM: der Normalfall (ja) als Text, die Abweichung als
   Status-Chip; leer bleibt «–». */
function jaNeinStatus(roh, ja, nein, tonNein) {
  if (leer(roh)) return "";
  return Hilfe.istJa(roh) ? ja : UI.status(nein, tonNein || "warnung");
}

/* Ja/Nein aus SCCM ohne Normalfall (Co-Managed): nur Text. */
function jaNeinText(roh) {
  if (leer(roh)) return "";
  return Hilfe.istJa(roh) ? "Ja" : "Nein";
}

/* Offline überall gleich: im Seitenkopf und im Bereich «Client und
   Aktivität» derselbe Chip (durchgestrichenes WLAN). Online ist der
   Normalfall und bleibt ohne Chip. */
function offlineStatus() {
  return UI.status("Offline", "neutral", { sinnbild: "offline" });
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

/* Andere Geräte mit demselben PC-Namen. PC-Namen sind kein Schlüssel: jede
   Zeile ist eine Hardware. Ein ersetztes Gerät bleibt archiviert liegen und
   heisst weiterhin gleich wie sein Nachfolger. */
function namensZwillinge() {
  const name = textWert("Title").trim();
  if (!name || !zeile) return [];
  const k = Modell.schluessel(name);
  return alleClients.filter(z =>
    Modell.schluessel(z.Title) === k && String(z.id) !== String(zeile.id));
}

/* Gleichnamige Geräte, die nicht archiviert sind. Nur sie sind auffällig:
   ein archivierter Vorgänger gleichen Namens ist der Normalfall. */
function zwillingeImEinsatz() {
  return namensZwillinge().filter(z => !z.__archiviert);
}

/* Die gleichnamigen Geräte als Verweise («Listen-ID 12 (Archiviert)»),
   dahinter die Regel. Für Hinweise der Übersicht. */
function zwillingText(liste) {
  const t = el("span");
  liste.forEach(function (z, i) {
    if (i) t.appendChild(document.createTextNode(", "));
    const a = el("a", "name-link", "Listen-ID " + z.id);
    a.href = UI.adresse.client(listenName, z.id);
    t.appendChild(a);
    t.appendChild(document.createTextNode(" (" + Modell.status(z.Status) + ")"));
  });
  t.appendChild(document.createTextNode(". Jede Zeile ist ein eigenes Gerät."));
  return t;
}

/* Alle Personen, deren «AdminClientId» die Listen-ID dieses Geräts trägt.
   Der PC-Name spielt keine Rolle. Bei EDU-Clients immer leer. */
function inhaberAlle() {
  if (!zeile || !mitInhaber || neuModus) return [];
  const id = String(zeile.id);
  return alleBenutzer.filter(b => Modell.geraetId(b.AdminClientId) === id)
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
      "Ein Gerät im Lager oder Archiv hat keinen Inhaber. «" + personName(inhaber()) + "» im Bereich «Inhaber» entfernen"
      + (betrieb === "Lager" ? " oder das Gerät über «Ausgeben an …» wieder in Betrieb nehmen." : "."));
  }
  if (betrieb === "Archiviert") {
    // Der Name des Filters genau wie im Filterblatt der Liste (app.js).
    info("Gerät ist archiviert", "In der Liste «" + LISTEN_TITEL
      + "» nur mit dem Filter «Archivierte Geräte anzeigen» sichtbar.");
  } else if (betrieb === "Lager") {
    info("Gerät liegt im Lager", "Es ist einsatzbereit, aber niemandem zugeteilt.");
  }

  /* Gleichnamige Geräte. Jede Zeile ist eine eigene Hardware: ein
     archivierter Vorgänger gleichen Namens ist nach einer Neuaufsetzung der
     Normalfall (ruhiger Hinweis, der Verweis führt zu seinem Verlauf).
     Auffällig ist erst ein zweites Gerät im Einsatz. */
  const zwillinge = namensZwillinge();
  if (zwillinge.length) {
    const imEinsatz = zwillingeImEinsatz().length;
    if (imEinsatz && betrieb !== "Archiviert") {
      b.push({ ton: "warnung", text: zwillingText(zwillinge),
        titel: imEinsatz === 1 ? "Noch ein Gerät im Einsatz heisst gleich" : imEinsatz + " weitere Geräte im Einsatz heissen gleich" });
    } else if (betrieb === "Archiviert") {
      b.push({ ton: "info", text: zwillingText(zwillinge),
        titel: zwillinge.length === 1 ? "Ein weiteres Gerät heisst gleich" : zwillinge.length + " weitere Geräte heissen gleich" });
    } else {
      b.push({ ton: "info", text: zwillingText(zwillinge),
        titel: zwillinge.length === 1 ? "Ein archiviertes Gerät heisst gleich" : zwillinge.length + " archivierte Geräte heissen gleich" });
    }
  }

  const beschaffung = textWert("Beschaffungsjahr").trim();
  if (!beschaffung) {
    warnung("Kein Beschaffungsjahr", "Ohne Beschaffungsjahr fehlt das Gerät in der Ersatzplanung.");
  }
  const status = ersatzStatus();
  const geplant = textWert("ErsatzGeplant").trim();
  const jahr = geplant || Modell.ersatzVorschlag(beschaffung);
  if (status === "ueberfaellig") {
    gefahr("Ersatz überfällig", "Der Ersatz war für " + jahr
      + (geplant ? " geplant." : " vorgeschlagen (Beschaffung + 5 Jahre)."));
  } else if (status === "bald") {
    warnung("Ersatz in diesem Geschäftsjahr", "Der Ersatz ist für " + jahr
      + (geplant ? " geplant." : " vorgeschlagen (Beschaffung + 5 Jahre)."));
  }

  if (!inSccm()) {
    /* Ausserhalb der Domäne ist «nicht in SCCM» der Normalfall, kein Hinweis. */
    /* Der Abgleich sucht das Gerät über seine Seriennummer, den Namen nimmt
       er nur für Zeilen ohne Seriennummer. Ein gleichnamiges neues Gerät in
       SCCM ist darum nicht dieses. */
    if (inDomaene()) {
      const serie = String(zeile.SCCM_SerialNumber || "").trim();
      warnung("Nicht in SCCM", serie
        ? "In SCCM steht kein Gerät mit der Seriennummer «" + serie + "». Meist ist es ausser Betrieb."
        : "Zu diesem PC-Namen findet der Abgleich kein Gerät in SCCM. "
          + "Entweder heisst das Gerät dort anders, oder es ist ausser Betrieb.");
    }
    return b;
  }

  const tageAktiv = Hilfe.tageHer(zeile.SCCM_LastActive);
  if (tageAktiv !== null && tageAktiv > 90) {
    gefahr("Seit " + tageAktiv + " Tagen keine Aktivität", "Letzte Aktivität in SCCM am "
      + Hilfe.datumText(zeile.SCCM_LastActive) + ". Nach drei Monaten ohne Lebenszeichen ist "
      + "das Gerät vermutlich ausser Betrieb.");
  } else if (tageAktiv !== null && tageAktiv > 30) {
    warnung("Seit " + tageAktiv + " Tagen keine Aktivität", "Letzte Aktivität in SCCM am "
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
    gefahr("Defender nicht aktiv", "");
  }
  if (zeile.SCCM_EPInfectionStatus && !/sauber|clean|kein/i.test(String(zeile.SCCM_EPInfectionStatus))) {
    gefahr("Defender meldet einen Fund", "Infektionsstatus: " + zeile.SCCM_EPInfectionStatus + ".");
  }
  if (Hilfe.istJa(zeile.SCCM_EPPendingReboot)) {
    warnung("Neustart ausstehend", "Der Virenschutz greift erst nach einem Neustart wieder vollständig.");
  }

  if (zeile.SCCM_ClientCheckPass && !Hilfe.istJa(zeile.SCCM_ClientCheckPass)) {
    warnung("Client-Prüfung nicht bestanden", "Die letzte Selbstprüfung des SCCM-Clients ist "
      + "fehlgeschlagen. Ohne funktionierenden Client kommen weder Updates noch Software auf das Gerät.");
  }
  if (zeile.SCCM_ClientActive && !Hilfe.istJa(zeile.SCCM_ClientActive)) {
    warnung("SCCM-Client inaktiv", "");
  }

  if (bitlockerAus()) {
    gefahr("Laufwerk nicht verschlüsselt", "BitLocker meldet «" + String(zeile.SCCM_BitLocker).trim()
      + "». Bei Verlust des Geräts sind die Daten lesbar.");
  }
  if (zeile.SCCM_TPMEnabled && !Hilfe.istJa(zeile.SCCM_TPMEnabled)) {
    warnung("TPM nicht aktiviert", "Ohne TPM verlangt BitLocker beim Start ein Kennwort.");
  }

  const meinBuild = buildZahl(zeile.SCCM_OSVersion);
  const flottenBuild = haeufigster("SCCM_OSVersion");
  const zielBuild = buildZahl(flottenBuild.wert);
  if (meinBuild !== null && zielBuild !== null && meinBuild < zielBuild) {
    warnung("Windows-Build veraltet", "Dieses Gerät läuft auf " + zeile.SCCM_OSVersion + ", der häufigste "
      + "Build der Flotte ist " + flottenBuild.wert + " (" + flottenBuild.anzahl + " Geräte).");
  }

  const nameInventar = textWert("Title").trim();
  const nameSccm = String(zeile.SCCM_Name || "").trim();
  if (nameInventar && nameSccm && nameInventar.toLowerCase() !== nameSccm.toLowerCase()) {
    warnung("PC-Name weicht ab", "Inventar: «" + nameInventar + "», SCCM: «" + nameSccm + "».");
  }

  const ueberzaehlig = weitereInhaber();
  if (ueberzaehlig.length) {
    gefahr("Mehr als ein Inhaber", namenText(inhaberAlle()) + " sind als Inhaber eingetragen. "
      + "Im Bereich «Inhaber» die überzähligen Einträge entfernen.");
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
        + (logins.length ? ", Inhaber ist «" + logins[0] + "». Wurde das Gerät weitergegeben, den Inhaber wechseln."
          : ", das Gerät hat aber keinen Inhaber.")
    });
  };
  pruefe("SCCM_PrimaryUser", "Primärer Benutzer (SCCM)");
  pruefe("SCCM_LastLogonUser", "Zuletzt angemeldeter Benutzer");
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

/* PC-Name mit Hinweis: erscheint beim Tippen als Banner (über FLIP auf
   seinem Stapel, weil der Benutzer ihn auslöst), beim Neuzeichnen ohne Bewegung. Er sagt,
   ob der Name schon vergeben ist. Gleiche Namen sind erlaubt – jede Zeile
   ist eine eigene Hardware, die Inhaberschaft hängt an der Listen-ID und
   bleibt beim Umbenennen, wo sie ist. Warnung nur, wenn ein Gerät im
   Einsatz so heisst; ein archiviertes gleichen Namens ist nur Info. */
function namenswarnungSetzen(ort, mitBewegung) {
  if (!ort) return;
  const zwillinge = namensZwillinge();
  const aktive = zwillinge.filter(z => !z.__archiviert);
  let text = "";
  if (aktive.length) {
    text = (aktive.length === 1 ? "Ein weiteres Gerät im Einsatz heisst bereits so (" : aktive.length
      + " weitere Geräte im Einsatz heissen bereits so (")
      + aktive.map(z => Modell.status(z.Status) + ", Listen-ID " + z.id).join("; ") + ").";
  } else if (zwillinge.length) {
    text = (zwillinge.length === 1 ? "Ein archiviertes Gerät heisst gleich (Listen-ID " : zwillinge.length
      + " archivierte Geräte heissen gleich (Listen-ID ")
      + zwillinge.map(z => z.id).join(", ") + "). Jede Zeile ist ein eigenes Gerät.";
  }
  ort.setzen(text ? (aktive.length ? "w|" : "i|") + text : "", function () {
    return aktive.length
      ? UI.banner({ ton: "warnung", titel: "Name schon vergeben.", text: text })
      : UI.banner({ ton: "info", text: text });
  }, { ausEingabe: mitBewegung });
}

function titelZeile(hinweisText) {
  const ort = UI.hinweisPlatz({ id: "g-namenswarnung" });
  namenswarnungSetzen(ort, false);
  nachfuehren(function (feld) { if (feld === "Title") namenswarnungSetzen(stehend(ort), true); });
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

/* Von Hand zu archivieren ist bei einem Gerät in SCCM meist der falsche
   Weg: der Abgleich setzte es wieder auf «Aktiv». Richtig ist, das Gerät
   aus SCCM zu löschen – dann archiviert es der nächste Abgleich selbst.
   Derselbe Hinweis steht beim Feld «Status» und im Dialog «Archivieren?»;
   «lagerWahl» nennt dort die passende Alternative. */
function archivHinweis(lagerWahl) {
  return UI.banner({ ton: "warnung", titel: "Von Hand archivieren ist meist nicht nötig.",
    text: "Wird das Gerät aus SCCM gelöscht, setzt der nächste Abgleich es automatisch auf «Archiviert». "
      + "Solange es in SCCM steht, setzt er es wieder auf «Aktiv». " + lagerWahl });
}

/* Status als Auswahl. Der Hinweis erklärt «Lager» und «Archiviert» (der
   Normalfall «Aktiv» bleibt ohne); wer «Archiviert» wählt, solange das
   Gerät in SCCM steht, sieht archivHinweis. */
function statusHinweisSetzen(hinweis, warnOrt, mitBewegung) {
  const s = geraeteStatus();
  if (hinweis) {
    UI.textSetzen(hinweis, s === "Archiviert"
      ? "Ausser Betrieb. In der Liste und den Kennzahlen standardmässig ausgeblendet."
      : (s === "Lager" ? "Einsatzbereit, aber niemandem zugeteilt. Bleibt in der Liste." : ""));
    // Ohne Text (Normalfall «Aktiv») fällt auch die Hülle .datenzeile-hinweis
    // weg: ihr :empty greift nicht, solange der leere span darin steht.
    if (hinweis.parentNode) hinweis.parentNode.hidden = !hinweis.textContent;
  }
  if (warnOrt) {
    warnOrt.setzen(s === "Archiviert" && inSccm() ? "archiviert-in-sccm" : "", function () {
      return archivHinweis("Für ein eingelagertes Gerät «Lager» wählen.");
    }, { ausEingabe: mitBewegung });
  }
}

function statusZeile() {
  const hinweis = el("span");
  hinweis.id = "g-status-hinweis";
  const warnOrt = UI.hinweisPlatz({ id: "g-statuswarnung" });
  // Die Auswahl zeigt den Status so, wie er gilt (leer → «Aktiv»); der
  // Entwurf vergleicht ebenso (leer: { Status: "Aktiv" }).
  const z = F.feld("Status", { beschriftung: "Status", art: "auswahl", hinweis: hinweis, zusatz: warnOrt,
    eingabe: { werte: Modell.STATUS_WERTE, wert: geraeteStatus(), schmal: true } });
  statusHinweisSetzen(hinweis, warnOrt, false);
  nachfuehren(function (feld) { if (feld === "Status") statusHinweisSetzen(stehend(hinweis), stehend(warnOrt), true); });
  return z;
}

/* «In Domäne» als Kästchen am Entwurf (F.feld, art 'ankreuzen': id
   «g-eingabe-InDomaene», Punkt «geändert» wie bei allen Feldern). Ein
   leerer gespeicherter Wert gilt als Ja (leer: { InDomaene: true } am
   Entwurf); ein Hin und Her ist darum keine Änderung. Der Hinweis sagt,
   was daran hängt, und folgt dem Kästchen an Ort und Stelle. */
function domaeneHinweisSetzen(hinweis) {
  UI.textSetzen(hinweis, inDomaene()
    ? "Der Abgleich füllt die SCCM-Felder und archiviert das Gerät, sobald es nicht mehr in SCCM steht."
    : "Der Abgleich füllt keine SCCM-Felder und archiviert das Gerät nie.");
}

function domaeneZeile() {
  const hinweis = el("span");
  hinweis.id = "g-domaene-hinweis";
  const z = F.feld("InDomaene", { beschriftung: "In Domäne", art: "ankreuzen", hinweis: hinweis,
    eingabe: { text: "Gerät ist in der Domäne" } });
  domaeneHinweisSetzen(hinweis);
  nachfuehren(function (feld) { if (feld === "InDomaene") domaeneHinweisSetzen(stehend(hinweis)); });
  return z;
}

/* Beschaffungsjahr und Ersatz: Vorschlag (Beschaffung + 5) und Hinweise
   folgen dem Tippen an Ort und Stelle; Tab führt ungestört zum nächsten
   Feld. */
function beschaffungsjahrZeile() {
  return F.feld("Beschaffungsjahr", { beschriftung: "Beschaffungsjahr", hinweis: "Geschäftsjahr (1. August bis 31. Juli).",
    eingabe: { vorschlaege: Modell.gjAuswahl(), schmal: true, platzhalter: "z. B. 2023/2024" } });
}

function vorschlagUebernehmen() {
  const vorschlag = Modell.ersatzVorschlag(textWert("Beschaffungsjahr").trim());
  const feld = $("g-eingabe-ErsatzGeplant");
  if (!vorschlag || !feld) return;
  // Der Knopf verschwindet gleich: der Fokus geht vorher ins Feld.
  feld.value = vorschlag;
  feld.focus();
  entwurf.setzeWert("ErsatzGeplant", vorschlag);
  UI.meldung("Vorschlag " + vorschlag + " übernommen. Noch nicht gespeichert.", { ton: "info" });
}

function ersatzHinweisSetzen(hinweis, zusatz) {
  const vorschlag = Modell.ersatzVorschlag(textWert("Beschaffungsjahr").trim());
  const geplant = textWert("ErsatzGeplant").trim();
  if (hinweis) {
    UI.textSetzen(hinweis, !vorschlag ? "Ohne Beschaffungsjahr gibt es keinen Vorschlag."
      : (geplant === vorschlag ? "Entspricht dem Vorschlag (Beschaffung + 5 Jahre)."
        : (!geplant ? "Bleibt das Feld leer, gilt " + vorschlag + " (Beschaffung + 5 Jahre)."
          : "Vorschlag: " + vorschlag + " (Beschaffung + 5 Jahre).")));
  }
  if (zusatz) {
    zusatz.hidden = !vorschlag || geplant === vorschlag;
    const knopf = zusatz.querySelector(".ds-btn");
    if (vorschlag && knopf) UI.knopfText(knopf, "Vorschlag " + vorschlag + " übernehmen");
  }
}

function ersatzZeile() {
  const hinweis = el("span");
  hinweis.id = "g-ersatz-hinweis";
  const zusatz = el("div", "datenzeile-zeile");
  zusatz.id = "g-ersatz-vorschlag";
  zusatz.appendChild(UI.knopf({ text: "Vorschlag übernehmen", variante: "leise", klein: true, sinnbild: "check",
    beiKlick: function () { vorschlagUebernehmen(); }, fokus: "vorschlag-uebernehmen" }));
  const zeileErsatz = F.feld("ErsatzGeplant", { beschriftung: "Ersatz geplant", hinweis: hinweis, zusatz: zusatz,
    eingabe: { vorschlaege: Modell.gjAuswahl(), schmal: true, platzhalter: "z. B. 2028/2029" } });
  ersatzHinweisSetzen(hinweis, zusatz);
  nachfuehren(function (f) {
    if (f === "Beschaffungsjahr" || f === "ErsatzGeplant") ersatzHinweisSetzen(stehend(hinweis), stehend(zusatz));
  });
  return zeileErsatz;
}

/* --- Lebenszyklus: Beschaffung, Ersatz, verstrichener Anteil --- */

/* «Im Plan» ist der Normalfall und bekommt keinen Chip. */
const ERSATZ_STATUS = {
  ueberfaellig: { text: "Ersatz überfällig", ton: "gefahr" },
  bald:         { text: "Ersatz in diesem GJ", ton: "warnung" },
  unbekannt:    { text: "Nicht erfasst", ton: "neutral" }
};

/* Karte mit dem Lebenszyklus. Ändert sich ein Jahr im Entwurf, gleicht
   sie Chip und Inhalt ab (UI.abgleichen): der Chip wechselt Farbe und
   Sinnbild auf der Feder, der Balken gleitet zum neuen Anteil (er wächst
   nur beim ersten Zeigen). «mitFuss»: Link in den Bereich. */
function lebenszyklusKarte(mitFuss) {
  const ohneJahr = !textWert("Beschaffungsjahr").trim();
  const statusOrt = el("span");
  statusOrt.id = "g-lebenszyklus-status";
  const k = UI.karte({ titel: "Lebenszyklus", id: "g-lebenszyklus", aktionen: [statusOrt], fuss: mitFuss ? [UI.knopf({
    text: ohneJahr ? "Beschaffungsjahr erfassen" : "Beschaffung bearbeiten", variante: "leise", weiter: true,
    beiKlick: function () { bereichWechseln("beschaffung", "g-eingabe-Beschaffungsjahr"); }, fokus: "beschaffung-oeffnen"
  })] : null });
  lebenszyklusFuellen(k);
  nachfuehren(function (f) { if (f === "Beschaffungsjahr" || f === "ErsatzGeplant") lebenszyklusFuellen(stehend(k)); });
  return k;
}

function lebenszyklusFuellen(k) {
  if (!k || !k.inhalt) return;
  const beschaffung = textWert("Beschaffungsjahr").trim();
  const geplant = textWert("ErsatzGeplant").trim();
  const vorschlag = Modell.ersatzVorschlag(beschaffung);
  const ersatz = geplant || vorschlag;
  const status = ersatzStatus();
  const c = status === "ok" ? null : (ERSATZ_STATUS[status] || ERSATZ_STATUS.unbekannt);
  const statusOrt = k.querySelector("#g-lebenszyklus-status");
  if (statusOrt) {
    UI.abgleichen(statusOrt, c ? [UI.status(c.text, c.ton, { titel: "Laufendes Geschäftsjahr: " + Modell.gjAktuell() })] : []);
  }

  const teile = [schluesselSetzen(UI.kennwerte([
    ["Beschaffung", beschaffung],
    [geplant ? "Ersatz geplant" : "Ersatz (Vorschlag)", ersatz]
  ]), "kennwerte")];
  const von = Modell.gjZahl(beschaffung);
  const bis = Modell.gjZahl(ersatz);
  const heute = Modell.gjZahl(Modell.gjAktuell());
  if (von !== null && bis !== null && heute !== null && bis > von) {
    const spanne = bis - von;
    const verstrichen = Math.min(Math.max(heute - von, 0), spanne);
    teile.push(schluesselSetzen(UI.balken(verstrichen / spanne,
      status === "ueberfaellig" ? "gefahr" : (status === "bald" ? "warnung" : undefined)), "balken"));
    teile.push(schluesselSetzen(UI.meta(verstrichen + " von " + spanne + " Geschäftsjahren verstrichen · laufendes "
      + "Geschäftsjahr " + Modell.gjAktuell()), "anteil"));
  } else if (!beschaffung) {
    teile.push(schluesselSetzen(UI.hinweis("Ohne Beschaffungsjahr lässt sich der Ersatz nicht planen."), "ohne-jahr"));
  }
  UI.abgleichen(k.inhalt, teile);
}

/* --- Personen --- */

function personUnter(b) {
  const unter = [String(b.Title || "").trim() || "ohne Login"];
  if (String(b.Abteilung || "").trim()) unter.push(String(b.Abteilung).trim());
  if (String(b.Funktion || "").trim()) unter.push(String(b.Funktion).trim());
  return unter;
}

/* Eine Person als Listenzeile; der Name führt auf die Benutzerseite (ein
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

/* Die Person mit dieser Listen-ID, wie sie jetzt geladen ist (mit dem
   aktuellen eTag). Klick-Handler merken sich nur die ID. */
function personNachId(id) {
  return alleBenutzer.filter(b => String(b.id) === String(id))[0] || null;
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
    text: "Für Geräte ausserhalb der Domäne holt der Abgleich keine Daten aus SCCM."
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
    s.appendChild(UI.banner({ ton: "erfolg", titel: "Nichts zu beanstanden." }));
  } else {
    const k = UI.karte({ titel: "Hinweise" });
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
      ? "Das Gerät steht nicht in SCCM."
      : "Für Geräte ausserhalb der Domäne holt der Abgleich keine Daten aus SCCM."));
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

  /* Die Einheit steht in der Beschriftung, die Kachel zeigt nur die Zahl:
     auch «1’240» passt so aufs Handy. Jede Kachel hat einen Schlüssel
     (Abgleichen, Nachzählen nach dem stillen Neuzeichnen). */
  const tage = function (schluessel, text, n, unter, ton) {
    return kachel(schluessel, { text: text, wert: n === null || n < 0 ? "" : UI.zahlText(n),
      zahl: n === null || n < 0 ? undefined : n, unter: unter, ton: ton });
  };
  k.inhalt.appendChild(UI.kacheln([
    tage("aktiv", "Tage seit letzter Aktivität", tageAktiv, UI.zeitText(zeile.SCCM_LastActive),
      tageAktiv === null ? null : (tageAktiv > 90 ? "gefahr" : (tageAktiv > 30 ? "warnung" : null))),
    tage("neustart", "Tage seit letztem Neustart", tageBoot, UI.zeitText(zeile.SCCM_LastBoot),
      tageBoot !== null && tageBoot > 30 ? "warnung" : null),
    kachel("frei", { text: "Freier Speicher C:", wert: frei === null ? "" : UI.zahlText(Math.round(frei)) + " GB",
      zahl: frei === null ? undefined : Math.round(frei), unter: gesamt ? "von " + UI.zahlText(gesamt) + " GB" : "",
      ton: frei === null ? null : (frei < 20 ? "gefahr" : (frei < 50 ? "warnung" : null)) }),
    kachel("ram", { text: "Arbeitsspeicher", wert: ram === null ? "" : UI.zahlText(ram) + " GB", zahl: ram === null ? undefined : ram,
      unter: zeile.SCCM_CPUCores ? zeile.SCCM_CPUCores + " Kerne · " + (zeile.SCCM_CPULogical || "–") + " Threads" : "" }),
    // Die Build-Nummer statt «10.0.26100»: kurz genug für die Kachel auch
    // auf dem Handy, und sie ist es, die mit der Flotte verglichen wird.
    // Eine Kennung, keine Menge: sie zählt nie.
    kachel("build", { text: "Windows-Build", wert: build === null ? zeile.SCCM_OSVersion : String(build),
      unter: String(zeile.SCCM_OS || "").replace(/^Microsoft\s+/i, ""),
      ton: build !== null && zielBuild !== null && build < zielBuild ? "warnung" : null,
      titel: zeile.SCCM_OSVersion ? "Version " + zeile.SCCM_OSVersion
        + (zielBuild !== null ? " · häufigster Build der Flotte: " + flottenBuild.wert : "") : undefined }),
    tage("signatur", "Alter der Virensignatur in Tagen", signatur, zeile.SCCM_EPSignatureVersion ? "Version " + zeile.SCCM_EPSignatureVersion : "",
      signatur === null ? null : (signatur > 7 ? "gefahr" : (signatur > 2 ? "warnung" : null))),
    kachel("bitlocker", { text: "Laufwerk verschlüsselt", wert: bitlocker ? (bitlockerAus() ? "Nein" : "Ja") : "",
      unter: bitlocker ? "BitLocker: " + bitlocker : "", ton: bitlocker && bitlockerAus() ? "gefahr" : null }),
    kachel("akku", { text: "Akku-Kapazität", wert: akku === null ? "" : UI.zahlText(akku) + " %", zahl: akku === null ? undefined : akku,
      unter: akku === null ? "kein Akku gemeldet" : (akku < 50 ? "Ersatz prüfen" : "in Ordnung"),
      ton: akku !== null && akku < 50 ? "warnung" : null })
  ]));
  return k;
}

/* Kacheln mit Schlüssel: geändert nach einem stillen Neuzeichnen zählen
   sie vom gezeigten Wert zum neuen (Bewegung.kennzahlenStill in
   zeichnenAlles), beim ersten Zeigen eines Bereichs zählt der Auftritt
   von 0. */
function kachel(schluessel, o) {
  return UI.kachel(Object.assign({ schluessel: "kachel-" + schluessel }, o));
}

function inhaberKurzKarte() {
  const wem = inhaber();
  const k = UI.karte({ titel: "Inhaber", fuss: [UI.knopf({ text: wem ? "Inhaber verwalten" : "Inhaber festlegen",
    variante: "leise", weiter: true, beiKlick: function () { bereichWechseln("inhaber"); }, fokus: "inhaber-oeffnen" })] });
  if (wem) k.inhalt.appendChild(UI.zeilenliste([schluesselSetzen(personZeile(wem), "person-" + wem.id)]));
  else k.inhalt.appendChild(UI.hinweis("Kein Inhaber eingetragen."));
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
    k.inhalt.appendChild(UI.hinweis("Hersteller, Modell und Seriennummer kommen aus SCCM."));
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
  // Die Adresse kommt aus UI.adresse (client.html, mit liste=), damit die
  // Vorlage in derselben Client-Liste angelegt wird. Ein echter Link: Ctrl- und Mittelklick öffnen das Formular im neuen Tab.
  // «Duplizieren» legt ein neues Gerät aus den von Hand gepflegten Angaben
  // an (ohne Name, Status, Verlauf) und steht darum bei ihnen; es ist keine
  // Schnellaktion an DIESEM Gerät. «Löschen …» betrifft das ganze Gerät und
  // steht darum im Seitenkopf, wie auf den Seiten für Telefonnummern und
  // Programme.
  const duplizieren = UI.knopf({ text: "Duplizieren", variante: "leise", sinnbild: "kopieren",
    href: UI.adresse.client(listenName, null, { neu: true, vorlage: zeile.id }), fokus: "duplizieren" });
  const k = UI.karte({ titel: "Stammdaten", fuss: [duplizieren] });
  k.inhalt.appendChild(UI.datenzeilen([
    titelZeile("Muss genau dem Gerätenamen in SCCM entsprechen."),
    ortZeile(), statusZeile(), domaeneZeile(), bemerkungZeile()
  ]));
  sperrenNachfuehren([duplizieren]);
  s.appendChild(raster([k, verlaufEinbauen()]));
}

/* Der Verlauf wird über denselben Entwurf gespeichert wie alle anderen
   Felder: verlauf.js meldet die fertige Zeichenkette, die Speicherleiste
   schreibt sie. Die Karte (Titel, Zahl, «Neuer Eintrag») baut verlauf.js
   selbst, wie auf der Benutzerseite und bei Telefonnummern: es gibt nur
   noch diese eine Einbauart, keine fremde Karte mehr, in die verlauf.js
   einhängen müsste. */
function verlaufEinbauen() {
  const huelle = el("div", "g-verlauf");
  huelle.setAttribute("data-rolle", "verlauf");
  Verlauf.zeichnen(huelle, {
    schluessel: "geraet",
    wert: wert("Verlauf"),
    beiAenderung: function (json) { entwurf.setzeWert("Verlauf", json); },
    titel: "Verlauf"
  });
  return huelle;
}

/* ---------- Neues Gerät: ein einziges Formular ---------- */

function bereichNeu(ziel) {
  const s = stapel(ziel);
  // ADMIN-Clients in SCCM legt der Abgleich selbst an; von Hand nur, was
  // nicht in SCCM steht. Der Hinweis steht bewusst nur bei den ADMIN-Clients.
  if (listenName === "admin") {
    s.appendChild(UI.banner({ ton: "warnung", titel: "ADMIN-Clients müssen in der Regel nicht von Hand angelegt werden.",
      text: "Sobald ein Gerät in SCCM erfasst ist, übernimmt es der SCCM-Abgleich automatisch. "
        + "Von Hand nur Geräte anlegen, die nicht in SCCM stehen." }));
  }
  if (vorlageName) {
    s.appendChild(UI.banner({ ton: "info", sinnbild: "kopieren", titel: "Vorlage übernommen.",
      text: "Die Angaben stammen von «" + vorlageName + "». Nur der PC-Name fehlt noch." }));
  }
  const k = UI.karte({ titel: "Angaben zum Gerät" });
  k.inhalt.appendChild(UI.datenzeilen([
    titelZeile("Muss genau dem Gerätenamen in SCCM entsprechen."),
    ortZeile(), domaeneZeile(),
    beschaffungsjahrZeile(),
    ersatzZeile(), bemerkungZeile()
  ]));
  s.appendChild(k);
}

/* ---------- Beschaffung ---------- */

function bereichBeschaffung(ziel) {
  const s = stapel(ziel);
  const k = UI.karte({ titel: "Beschaffung und Ersatz" });
  k.inhalt.appendChild(UI.datenzeilen([
    beschaffungsjahrZeile(),
    ersatzZeile()
  ]));
  s.appendChild(raster([k, lebenszyklusKarte(false)]));
}

/* ---------- Inhaber ---------- */

function bereichInhaber(ziel) {
  const s = stapel(ziel);
  const wem = inhaber();
  const zuviele = weitereInhaber();
  const sperrbar = [];

  // Nie den Handler direkt übergeben – sonst käme das Klickereignis als
  // «ausgabe» an und der Wechsel nähme das Gerät aus Lager oder Archiv.
  // Die Aktion steht einmal: im Kartenkopf, ohne Inhaber im Leerzustand.
  // Tonal wie jede Aktion in einer Karte (Dashboard-Style: die gefüllte
  // Hauptaktion gibt es einmal je Ansicht – hier «Speichern» in der Leiste).
  const waehlen = UI.knopf({ text: wem ? "Inhaber wechseln" : "Inhaber festlegen", variante: "tonal",
    sinnbild: wem ? "sync" : "ausgeben", beiKlick: function () { inhaberWaehlenDialog(false); }, fokus: "inhaber-waehlen" });
  sperrbar.push(waehlen);

  const k = UI.karte({ titel: "Inhaber", aktionen: wem ? [waehlen] : [] });
  if (zuviele.length) {
    k.inhalt.appendChild(UI.banner({ ton: "gefahr", titel: "Mehr als ein Inhaber.",
      text: (zuviele.length + 1) + " Personen sind als Inhaber dieses Geräts eingetragen. Als Inhaber gilt "
        + "die erste Person. Die übrigen unten entfernen." }));
  }

  if (wem) {
    const wemId = wem.id;
    const entfernen = UI.knopf({ text: "Entfernen", variante: "leise", klein: true,
      beiKlick: function () { inhaberEntfernenDialog(personNachId(wemId)); }, fokus: "entfernen-" + wemId });
    sperrbar.push(entfernen);
    k.inhalt.appendChild(UI.zeilenliste([schluesselSetzen(personZeile(wem, [entfernen]), "person-" + wemId)]));
  } else {
    /* Neu aufgesetzt unter dem Namen eines archivierten Geräts: dessen
       Inhaber geht nicht von selbst mit (die Inhaberschaft hängt an der
       Hardware), lässt sich aber mit einem Klick übernehmen. */
    const vorgaenger = namensZwillinge().filter(z => z.__archiviert && z.__inhaber)[0];
    if (vorgaenger) {
      const vorId = vorgaenger.__inhaber.id;
      const uebernehmen = UI.knopf({ text: "Übernehmen", variante: "leise",
        beiKlick: function () { inhaberWaehlenDialog(false, personNachId(vorId)); }, fokus: "vorgaenger-uebernehmen" });
      sperrbar.push(uebernehmen);
      k.inhalt.appendChild(schluesselSetzen(UI.banner({ ton: "info", knopf: uebernehmen,
        text: "«" + personName(vorgaenger.__inhaber) + "» ist Inhaber des archivierten Geräts gleichen Namens (Listen-ID "
          + vorgaenger.id + ")." }), "vorgaenger-" + vorId));
    }
    k.inhalt.appendChild(UI.leerzustand({ sinnbild: "benutzer", titel: "Noch kein Inhaber", aktion: waehlen }));
  }
  s.appendChild(k);

  if (zuviele.length) {
    const kZuviel = UI.karte({ titel: "Überzählige Einträge" });
    kZuviel.inhalt.appendChild(UI.zeilenliste(zuviele.map(function (b) {
      const bId = b.id;
      const weg = UI.knopf({ text: "Eintrag entfernen", variante: "leise", klein: true,
        beiKlick: function () { inhaberEntfernenDialog(personNachId(bId)); }, fokus: "entfernen-" + bId });
      sperrbar.push(weg);
      return schluesselSetzen(personZeile(b, [weg]), "person-" + bId);
    })));
    s.appendChild(kZuviel);
  }
  sperrenNachfuehren(sperrbar);
  s.appendChild(sccmBenutzerKarte());
}

/* Was SCCM über die Benutzer weiss. Reine Beobachtung. */
function sccmBenutzerKarte() {
  const k = UI.karte({ titel: "Benutzer laut SCCM", unter: "SCCM sieht, wer am Gerät arbeitet, nicht, wem es gehört." });
  if (!inSccm()) {
    k.inhalt.appendChild(UI.hinweis("Das Gerät steht nicht in SCCM."));
    return k;
  }
  const abweichungen = inhaberAbweichungen();
  if (abweichungen.length) {
    k.inhalt.appendChild(UI.hinweise(abweichungen.map(a => UI.hinweisZeile({ ton: "info", titel: a.titel, text: a.text }))));
  }
  k.inhalt.appendChild(UI.datenzeilen([
    datenZeile("Primärer Benutzer", zeile.SCCM_PrimaryUser),
    datenZeile("Zuletzt angemeldeter Benutzer", zeile.SCCM_LastLogonUser),
    datenZeile("Aktuell angemeldet", zeile.SCCM_CurrentLogonUser),
    datenZeile("Hauptbenutzer (Konsole)", zeile.SCCM_TopConsoleUser),
    datumZeile("Letzte Anmeldung", zeile.SCCM_LastConsoleUse)
  ]));
  k.inhalt.appendChild(el("h3", "ds-card__subtitle", "Konsolenbenutzer"));
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
  const kDeploy = UI.karte({ titel: "Zugewiesene Applikationen", unter:
    UI.zahlText(Number(zeile.SCCM_AppsInstalled) || 0) + " installiert, "
    + UI.zahlText(Number(zeile.SCCM_AppsRequired) || 0) + " erforderlich." });
  if (!deployments.length) {
    kDeploy.inhalt.appendChild(UI.hinweis("Keine Zuweisungen erfasst."));
  } else {
    kDeploy.inhalt.appendChild(UI.tabelle(["Applikation", "Sammlung", "Zweck", "Status"],
      deployments.map(function (f) {
        // Erfolgreich ist der Normalfall (Text); nur Fehler und Ausstehendes
        // bekommen einen Chip.
        const st = String(f[3] || "").trim();
        const ton = /fehl/i.test(st) ? "gefahr" : (/ausstehend|pending/i.test(st) ? "wartet" : null);
        return [f[0] || "", f[1] || "", f[2] || "", st && ton ? UI.status(st, ton) : st];
      }), { beschriftung: "Zugewiesene Applikationen" }));
  }
  s.appendChild(kDeploy);

  const kInst = UI.karte({ titel: "Installierte Software", unter: "SCCM meldet "
    + UI.zahlText(Number(zeile.SCCM_InstalledSoftwareCount) || Hilfe.zeilen(zeile.SCCM_InstalledSoftware).length)
    + " Einträge. Aufgeführt sind die vom Abgleich übernommenen." });
  const anzahl = el("p", "anzahl");
  anzahl.id = "g-installiert-anzahl";
  anzahl.setAttribute("aria-live", "polite");
  kInst.inhalt.appendChild(UI.anhaengen(el("div", "ds-action-bar"), [
    UI.suchfeld({ id: "g-suche-installiert", platzhalter: "Name suchen", label: "Installierte Software suchen",
      wert: swSuche, beiEingabe: function (w) { swSuche = w; installiertFuellen(true); } }),
    anzahl
  ]));
  const ort = el("div");
  ort.id = "g-installiert";
  kInst.inhalt.appendChild(ort);
  s.appendChild(kInst);
  installiertFuellen(false, ort);

  const office = Hilfe.zeilen(zeile.SCCM_Office).map(Hilfe.felder);
  const kOffice = UI.karte({ titel: "Office-Produkte" });
  kOffice.inhalt.appendChild(office.length
    ? UI.tabelle(["Produkt", "Version"], office.map(f => [f[0] || "", f[1] || ""]), { beschriftung: "Office-Produkte" })
    : UI.hinweis("Kein Office-Produkt erfasst."));

  const sammlungen = Hilfe.zeilen(zeile.SCCM_Collections);
  const kSamml = UI.karte({ titel: "Sammlungen" });
  // Eine Aufzählung, keine Zustände: Teile statt Status-Chips.
  kSamml.inhalt.appendChild(sammlungen.length ? UI.teile(sammlungen) : UI.hinweis("Keine Sammlungen erfasst."));
  s.appendChild(raster([kOffice, kSamml]));
}

/* Füllt nur die Trefferliste: das Suchfeld bleibt stehen (Fokus und
   Schreibmarke). Die Liste wird abgeglichen, nicht neu gebaut: die Zeilen
   der Tabelle werden an Ort und Stelle gepatcht (bei Hunderten von Zeilen
   ohne Bewegung). Kommt beim Tippen der Leerzustand oder geht er, gleitet
   der Wechsel (Bewegung.umordnen: die Tabelle blendet aus, der
   Leerzustand ein, und umgekehrt). Die Knoten werden über ihre id
   gesucht, weil eine noch wartende Eingabe eines inzwischen neu
   gezeichneten Suchfelds hier landen kann. */
function installiertFuellen(ausEingabe, gebaut) {
  const ort = gebaut || $("g-installiert");
  if (!ort || !zeile) return;
  const alle = Hilfe.zeilen(zeile.SCCM_InstalledSoftware).map(Hilfe.felder);
  const such = swSuche.trim().toLowerCase();
  const treffer = alle.filter(f => !such || String(f[0] || "").toLowerCase().indexOf(such) > -1);
  UI.textSetzen(ort.parentNode.querySelector(".anzahl"), such ? treffer.length + " von " + alle.length
    : alle.length + (alle.length === 1 ? " Eintrag" : " Einträge"));
  let neu;
  if (!alle.length) {
    neu = schluesselSetzen(UI.hinweis("Keine Software erfasst."), "keine");
  } else if (!treffer.length) {
    neu = schluesselSetzen(UI.leerzustand({ sinnbild: "suche", titel: "Keine Treffer",
      text: "Kein Eintrag passt zu «" + swSuche.trim() + "».",
      aktion: UI.knopf({ text: "Suche zurücksetzen", variante: "tonal", beiKlick: function () {
        sucheZuruecksetzen("g-suche-installiert", function () { swSuche = ""; installiertFuellen(true); });
      }, fokus: "suche-leeren-installiert" }) }), "leer");
  } else {
    neu = schluesselSetzen(UI.tabelle(["Name", "Version"], treffer.map(f => [f[0] || "", f[1] || ""]),
      { beschriftung: "Installierte Software" }), "treffer");
  }
  trefferAbgleichen(ort, [neu], ausEingabe);
}

/* Ein Trefferbereich unter einer Suche: still abgleichen; wechselt beim
   Tippen die Art (Treffer ↔ Leerzustand), gleitet der Wechsel. */
function trefferAbgleichen(ort, neu, ausEingabe) {
  const schluessel = function (liste) { return liste.map(k => k && k.getAttribute ? k.getAttribute("data-ds-key") : "").join("|"); };
  // Laufzeitknoten von Dashboard-Style (der Wächter von watchScrolled) zählen nicht.
  const vorher = schluessel(Array.from(ort.children).filter(k => !k.hasAttribute("data-ds-keep")));
  if (ausEingabe && vorher && vorher !== schluessel(neu)) {
    Bewegung.umordnen(ort, function (o) { UI.abgleichen(ort, neu, o); });
  } else {
    UI.abgleichen(ort, neu);
  }
}

/* «Suche zurücksetzen» im Leerzustand: das Suchfeld leeren und
   fokussieren, dann die Liste (über leeren()) neu abgleichen. Der Knopf
   verschwindet dabei; der Fokus steht vorher schon im Feld. */
function sucheZuruecksetzen(feldId, leeren) {
  const f = $(feldId);
  if (f) { f.value = ""; f.focus(); }
  leeren();
}

/* ---------- Hardware ---------- */

function bereichHardware(ziel) {
  const s = stapel(ziel);
  if (!inSccm()) { s.appendChild(sccmLeer()); return; }
  const frei = zahlOderNull(zeile.SCCM_DiskCFreeGB);
  const gesamt = zahlOderNull(zeile.SCCM_DiskCGB);
  const akku = akkuProzent();

  const kGeraet = UI.karte({ titel: "Gerät" });
  kGeraet.inhalt.appendChild(UI.datenzeilen([
    datenZeile("Hersteller", zeile.SCCM_Manufacturer),
    datenZeile("Modell", zeile.SCCM_Model),
    datenZeile("Gehäusetyp", zeile.SCCM_ChassisType),
    datenZeile("Seriennummer", zeile.SCCM_SerialNumber),
    datenZeile("SMBIOS-GUID", zeile.SCCM_SMBIOSGUID),
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
      Hilfe.relativText(zeile.SCCM_BIOSDate) || null),
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
    datenZeile("Entra-Geräte-ID", zeile.SCCM_AADDeviceID),
    datenZeile("Co-Managed (Intune)", jaNeinText(zeile.SCCM_CoManaged))
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
    datenZeile("Infektionsstatus", infektion && !/sauber|clean|kein/i.test(infektion)
      ? UI.status(infektion, "gefahr") : infektion),
    datenZeile("Letzte Bedrohung", zeile.SCCM_EPLastThreat),
    datenZeile("Neustart ausstehend", Hilfe.istJa(zeile.SCCM_EPPendingReboot)
      ? UI.status("Ja", "warnung") : (zeile.SCCM_EPPendingReboot || ""))
  ]));

  const bitlocker = String(zeile.SCCM_BitLocker || "").trim();
  const kVersch = UI.karte({ titel: "Verschlüsselung und TPM" });
  kVersch.inhalt.appendChild(UI.datenzeilen([
    datenZeile("BitLocker", bitlocker && bitlockerAus() ? UI.status(bitlocker, "gefahr") : bitlocker),
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
  ["SCCM_LastHardwareScan", "Letztes Hardware-Inventar"],
  ["SCCM_LastSoftwareScan", "Letztes Software-Inventar"],
  ["SCCM_LastClientCheck", "Letzte Client-Prüfung"],
  ["SCCM_LastConsoleUse", "Letzte Benutzeranmeldung"],
  ["SCCM_ADLastLogon", "Letzte AD-Anmeldung"],
  ["SCCM_EPSignatureDate", "Defender-Signatur"],
  ["SCCM_EPLastQuickScan", "Defender-Schnellscan"],
  ["SCCM_EPLastFullScan", "Defender-Vollscan"],
  ["SCCM_LastSync", "Letzter SCCM-Abgleich"],
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
    datenZeile("Online", leer(zeile.SCCM_Online) ? "" : (Hilfe.istJa(zeile.SCCM_Online) ? "Ja" : offlineStatus())),
    datenZeile("Client", jaNeinStatus(zeile.SCCM_ClientActive, "Aktiv", "Inaktiv")),
    datenZeile("Client-Prüfung", jaNeinStatus(zeile.SCCM_ClientCheckPass, "Bestanden", "Nicht bestanden")),
    datenZeile("Client-Version", zeile.SCCM_ClientVersion),
    datenZeile("ResourceID", zeile.SCCM_ResourceID),
    datenZeile("SMSID", zeile.SCCM_SMSID),
    datenZeile("Abgleichstatus", zeile.SCCM_SyncStatus),
    datumZeile("Letzter SCCM-Abgleich", zeile.SCCM_LastSync)
  ]));

  /* Alle Zeitstempel, jüngster zuerst; was älter als 30 Tage ist, steht
     still (grauer Punkt) – so fällt auf, was lange nicht mehr kam. */
  const punkte = [];
  for (const [feld, name] of ZEITSTEMPEL) {
    const d = Hilfe.datum(zeile[feld]);
    if (d) punkte.push({ name: name, datum: d, roh: zeile[feld] });
  }
  punkte.sort((a, b) => b.datum - a.datum);
  const kAchse = UI.karte({ titel: "Zeitachse", unter: "Was älter als 30 Tage ist, erscheint grau." });
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
    : "Median " + zahl(mittel) + " · " + p + " % der Geräte liegen bei diesem Wert oder darunter"
      + (hoeherIstBesser === false ? " · weniger ist besser" : "")));
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
      label: "Verteilung «" + name + "» in der Flotte. Dieses Gerät liegt in Klasse " + (meine + 1) + " von " + KLASSEN + "." });
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

  const kVergleich = UI.karte({ titel: "Dieses Gerät gegenüber der Flotte", unter: "Verglichen mit "
    + UI.zahlText(geraete.length) + " Geräten in SCCM. Die dunkle Säule zeigt dieses Gerät." });
  if (!inSccm()) {
    kVergleich.inhalt.appendChild(UI.hinweis("Ohne Daten aus SCCM gibt es nichts zu vergleichen."));
  } else {
    kVergleich.inhalt.appendChild(UI.datenzeilen([
      vergleichsZeile("Freier Speicher auf Laufwerk C", zahlOderNull(zeile.SCCM_DiskCFreeGB),
        werteVon(z => zahlOderNull(z.SCCM_DiskCFreeGB)), "GB", true, 1),
      vergleichsZeile("Arbeitsspeicher", zahlOderNull(zeile.SCCM_RAMGB), werteVon(z => zahlOderNull(z.SCCM_RAMGB)), "GB", true, 0),
      vergleichsZeile("CPU-Kerne", zahlOderNull(zeile.SCCM_CPUCores), werteVon(z => zahlOderNull(z.SCCM_CPUCores)), "", true, 0),
      vergleichsZeile("Tage seit letzter Aktivität", Hilfe.tageHer(zeile.SCCM_LastActive),
        werteVon(z => Hilfe.tageHer(z.SCCM_LastActive)), "Tage", false, 0),
      vergleichsZeile("Alter der OS-Installation", Hilfe.tageHer(zeile.SCCM_OSInstallDate),
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
  const kAehnlich = UI.karte({ titel: "Ähnliche Geräte" });
  kAehnlich.inhalt.appendChild(UI.tabelle(["Merkmal", "Wert", { text: "Geräte", zahl: true },
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
  const k = UI.karte({ titel: "Alle Felder", id: "g-felder-karte" });
  const anzahl = el("p", "anzahl");
  anzahl.id = "g-felder-anzahl";
  anzahl.setAttribute("aria-live", "polite");
  const leiste = UI.anhaengen(el("div", "ds-action-bar"), [
    UI.suchfeld({ id: "g-suche-felder", platzhalter: "Feld oder Wert suchen", label: "Feld oder Wert suchen",
      wert: rohSuche, beiEingabe: function (w) { rohSuche = w; felderFuellen(true); } }),
    UI.ankreuzen({ text: "Leere Felder zeigen", an: rohLeereZeigen, id: "g-leere-zeigen",
      beiAenderung: function (an) { rohLeereZeigen = an; felderFuellen(true); } }),
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
  felderFuellen(false, leiste);
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

/* Die Listen-ID als erste «Spalte» unter «Kennung». */
const ID_SPALTE = { i: "id", d: "Listen-ID", t: "Number", q: "sharepoint" };

/* Der Text einer Spalte, wie er jetzt gilt (Entwurf eingeschlossen). */
function feldText(sp) {
  return rohText(sp, sp.i === "id" ? zeile.id : wert(sp.i));
}

/* Gleicht die Felder unter der Werkzeugleiste ab; Suchfeld und Kästchen
   bleiben stehen (die Leiste geht als derselbe Knoten mit). Die
   Abschnitte stehen direkt im Karteninhalt, damit der Rhythmus der Karte
   (Zwischentitel, Datenzeilen) gilt. Jede Zeile trägt den Spaltennamen als
   Schlüssel; der Kopierknopf liest den Wert erst beim Klick. */
function felderFuellen(ausEingabe, gebaut) {
  const leiste = gebaut || $("g-felder-leiste");
  if (!leiste || !zeile) return;
  const inhalt = leiste.parentNode;
  const such = rohSuche.trim().toLowerCase();
  const gruppen = [{ titel: "Kennung", spalten: [ID_SPALTE] }]
    .concat(GRUPPEN.map(g => ({ titel: g, spalten: SPALTEN.filter(sp => sp.g === g) })));
  const kinder = [leiste];
  let gezeigt = 0, gesamt = 0;
  for (const g of gruppen) {
    const zeilen = [];
    for (const sp of g.spalten) {
      gesamt++;
      const text = feldText(sp);
      if (!text && !rohLeereZeigen) continue;
      if (such && sp.d.toLowerCase().indexOf(such) === -1 && sp.i.toLowerCase().indexOf(such) === -1
        && text.toLowerCase().indexOf(such) === -1) continue;
      const teile = [el("span", "g-feld-text" + (text ? "" : " t-still"), text || "–")];
      if (text) {
        teile.push(UI.knopf({ variante: "sinnbild", sinnbild: "kopieren", klein: true, titel: "«" + sp.d + "» kopieren",
          beiKlick: function () { kopieren(feldText(sp), "«" + sp.d + "» kopiert."); }, fokus: "kopieren-" + sp.i }));
      }
      const z = UI.feldZeile(sp.d, teile);
      z.firstChild.appendChild(el("span", "ds-meta g-feld-intern", sp.i + " · " + sp.t + " · " + (QUELLEN[sp.q] || sp.q)));
      z.lastChild.classList.add("g-feld-wert");
      zeilen.push(schluesselSetzen(z, "feld-" + sp.i));
    }
    if (!zeilen.length) continue;
    gezeigt += zeilen.length;
    kinder.push(schluesselSetzen(el("h3", "ds-card__subtitle", g.titel), "titel-" + g.titel));
    kinder.push(schluesselSetzen(UI.datenzeilen(zeilen), "gruppe-" + g.titel));
  }
  UI.textSetzen(leiste.querySelector(".anzahl"), gezeigt + " von " + gesamt + " Feldern");
  if (!gezeigt) {
    kinder.push(schluesselSetzen(UI.leerzustand({ sinnbild: "suche", titel: "Keine Treffer",
      text: such ? "Kein Feld passt zu «" + rohSuche.trim() + "»." : "Alle Felder sind leer.",
      aktion: such ? UI.knopf({ text: "Suche zurücksetzen", variante: "tonal", beiKlick: function () {
        sucheZuruecksetzen("g-suche-felder", function () { rohSuche = ""; felderFuellen(true); });
      }, fokus: "suche-leeren-felder" }) : null }), "leer"));
  }
  /* Kommt oder geht der Leerzustand beim Tippen, gleitet der Wechsel; die
     Leiste gleitet nicht mit. Sonst still abgleichen. */
  const warLeer = !!inhalt.querySelector(":scope > .ds-empty");
  if (ausEingabe && warLeer !== !gezeigt) {
    Bewegung.umordnen(inhalt, function (o) { UI.abgleichen(inhalt, kinder, o); },
      { eintraege: ":scope > :not(#g-felder-leiste)" });
  } else {
    UI.abgleichen(inhalt, kinder);
  }
}

/* ==================================================================
   7. Kopf, Navigation, Neuzeichnen
   ================================================================== */

/* Ein Bereich: Schlüssel, Name in der Schublade, Gruppe, Sinnbild und
   Bauer. Kein Lead: Name und Inhalt sagen genug. */
function bereich(k, d, gruppe, sinnbild, bauen) {
  return {
    k: k, d: d, gruppe: gruppe, sinnbild: sinnbild,
    f: function (ziel) {
      nachfuehrer = [];
      bauen(ziel);
    }
  };
}

/* Drei Gruppen: was man pflegt («Gerät»), was SCCM liefert und was
   ausgewertet wird. */
const BEREICHE = [
  bereich("uebersicht", "Übersicht", "Gerät", "uebersicht", bereichUebersicht),
  bereich("stammdaten", "Stammdaten", "Gerät", "bearbeiten", bereichStammdaten),
  bereich("beschaffung", "Beschaffung", "Gerät", "kalender", bereichBeschaffung),
  bereich("inhaber", "Inhaber", "Gerät", "benutzer", bereichInhaber),
  bereich("software", "Software", "Aus SCCM", "software", bereichSoftware),
  bereich("hardware", "Hardware", "Aus SCCM", "prozessor", bereichHardware),
  bereich("system", "System und Netzwerk", "Aus SCCM", "server", bereichSystem),
  bereich("sicherheit", "Sicherheit", "Aus SCCM", "schild", bereichSicherheit),
  bereich("aktivitaet", "Client und Aktivität", "Aus SCCM", "aktivitaet", bereichAktivitaet),
  bereich("analyse", "Flottenvergleich", "Auswertung", "diagramm", bereichAnalyse),
  bereich("felder", "Alle Felder", "Auswertung", "liste", bereichFelder)
];

const BEREICH_NEU = bereich("neu", "Neuer " + CLIENT_WORT, "", "plus", bereichNeu);

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
  // Merkmale aus SCCM, keine Abweichungen: darum Teile statt Chips.
  if (inSccm() && Hilfe.istJa(zeile.SCCM_IsVirtual)) teile.push("Virtuelle Maschine");
  if (inSccm() && Hilfe.istJa(zeile.SCCM_CoManaged)) teile.push("Co-Managed (Intune)");
  return teile;
}

/* Status-Chips nur für Abweichungen, immer Icon + Text: der Normalfall
   (aktiv, in SCCM, online, Client aktiv) bleibt ohne Chip. Offline nur,
   wenn das Gerät in SCCM steht: sonst ist der Zustand unbekannt, nicht
   offline. */
function statusChips() {
  const chips = [];
  const betrieb = geraeteStatus();
  if (betrieb === "Archiviert") chips.push(UI.status("Archiviert", "neutral", { sinnbild: "archiv" }));
  else if (betrieb === "Lager") chips.push(UI.status("Im Lager", "neutral", { sinnbild: "lager" }));

  if (inSccm()) {
    if (!leer(zeile.SCCM_Online) && !Hilfe.istJa(zeile.SCCM_Online)) chips.push(offlineStatus());
    if (!leer(zeile.SCCM_ClientActive) && !Hilfe.istJa(zeile.SCCM_ClientActive)) chips.push(UI.status("SCCM-Client inaktiv", "warnung"));
  } else if (inDomaene()) {
    chips.push(UI.status("Nicht in SCCM", "warnung", { titel: "Der Abgleich findet zu diesem PC-Namen kein Gerät in SCCM." }));
  } else {
    chips.push(UI.status("Nicht in SCCM", "neutral", { sinnbild: "aus",
      titel: "Ausserhalb der Domäne – der Abgleich holt keine Daten aus SCCM." }));
  }

  const es = ersatzStatus();
  const geplant = textWert("ErsatzGeplant").trim() || Modell.ersatzVorschlag(textWert("Beschaffungsjahr").trim());
  if (es === "ueberfaellig") {
    chips.push(UI.status("Ersatz überfällig", "gefahr", { titel: "Geplant war " + geplant + "." }));
  } else if (es === "bald") {
    chips.push(UI.status("Ersatz in diesem GJ", "warnung", { titel: "Geplant für " + geplant + "." }));
  }
  return chips;
}

/* Schnellaktionen: der ganze Lagerablauf mit je einem Dialog, zuletzt
   «Löschen …» – wie auf den Seiten für Telefonnummern und Programme
   rechts im Seitenkopf, in jedem Bereich erreichbar. Welche Lageraktionen
   erscheinen, hängt vom Status ab. Gesperrt mit Grund, solange etwas
   ungespeichert ist; während geschrieben wird, sperrt F.beschaeftigt
   (sonst schriebe eine zweite Aktion auf das veraltete eTag). Die
   Handler lesen den Zustand erst beim Klick: F.seitenkopf lässt gleiche
   Knöpfe stehen (kein Neuaufbau pro Taste). data-fokus «aktion-…» findet
   fokusNachAktion wieder. */
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
   derselbe Bereich behält Fokus, Schreibmarke und Rollen, geänderte
   Kennzahlen zählen vom gezeigten Wert (Bewegung.kennzahlenStill; beim
   ersten Zeigen steht noch keine Kachel da, dann zählt der Auftritt). */
function zeichnenAlles() {
  kopfZeichnen();
  navZeichnen();
  aktiverBereich = Bewegung.kennzahlenStill($("g-bereich"), function () {
    return F.zeichneBereich(sichtbareBereiche(), aktiverBereich);
  });
  speicherleisteZeichnen();
}

/* In einen anderen Bereich (Navigation oder ein Knopf im Inhalt): Adresse
   per replaceState (der Zurück-Knopf des Browsers führt zur Liste, nicht
   durch die Bereiche), Pille gleitet, Fade-through. «fokusId»:
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
    const fehler = new Error("In der Liste «" + LISTEN_TITEL + "» gibt es keine Zeile mit der Listen-ID " + elementId
      + ". Vielleicht steht das Gerät in der anderen Client-Liste.");
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
  F.ladefehler(fehler, { titel: "Gerät nicht gefunden",
    hinweis: "Gelöschte Zeilen liegen 93 Tage im Papierkorb der SharePoint-Site und lassen sich dort zurückholen." });
}

/* ---------- Prüfen ---------- */

function pruefen() {
  const name = textWert("Title").trim();
  if (!name) return { feld: "Title", text: "Bitte einen PC-Namen eingeben." };

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
      return { feld: feld, text: "«" + SPALTE[feld].d + "» muss ein Geschäftsjahr wie «2023/2024» sein." };
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

/* Speichern und Anlegen über F.speicherAblauf: nichts ohne Änderungen,
   Schreiben und Nachladen getrennt (scheitert nur das Nachladen, ist
   trotzdem gespeichert), Aktionen gesperrt, solange geschrieben wird. */
let zuletztAngelegt = false;

function speichern() {
  return F.speicherAblauf({
    anzahl: function () { return entwurf.anzahl(); },
    immer: neuModus,
    pruefen: pruefen,
    schreiben: schreiben,
    nachladen: async function () {
      await datenLaden(true);
      zeileWaehlen();
      nachSpeichernZeigen();
    },
    zeichnen: nachSpeichernZeigen,
    fehlerText: neuModus ? "Anlegen fehlgeschlagen." : "Speichern fehlgeschlagen.",
    erfolgText: function (erg) {
      // Auffällig ist nur ein zweites Gerät im Einsatz gleichen Namens.
      const dubletten = erg && erg.dubletten
        ? " Achtung: «" + erg.name + "» ist jetzt " + (erg.dubletten + 1) + " Mal im Einsatz." : "";
      if (erg && erg.neu) return "Gerät angelegt." + dubletten;
      return (erg && erg.anzahl === 1 ? "Änderung gespeichert." : (erg ? erg.anzahl : 0) + " Änderungen gespeichert.")
        + dubletten;
    }
  });
}

async function schreiben() {
  const name = textWert("Title").trim();
  const dubletten = geraeteStatus() === "Archiviert" ? 0 : zwillingeImEinsatz().length;
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
    // Die Adresse zeigt jetzt auf das Gerät, in seiner Liste: Neu laden
    // oder ein Lesezeichen öffnet das Gerät statt eines leeren Formulars.
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
  zuletztAngelegt = false;
  /* Ein neuer Name ändert an der Inhaberschaft nichts: sie hängt an der
     Listen-ID dieser Zeile, nicht am Namen. */
  const antwort = await Daten.speichern(listenName, elementId, felder, zeile.__etag);
  F.uebernehmen(zeile, felder, antwort);
  abgeleiteteFelder(zeile);
  entwurf.leeren();
  F.melden("zeile-geaendert", elementId);
  return { anzahl: anzahl, name: name, dubletten: dubletten };
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

/* Das bisherige Gerät einer Person für ihren Verlauf, wenn es nicht dieses
   ist: der PC-Name, bei gleichem Namen wie dieses Gerät mit Listen-ID. */
function bisherigesGeraet(b) {
  const id = Modell.geraetId(b.AdminClientId);
  if (!id || id === String(zeile.id)) return "";
  const name = b.__client ? String(b.__client.Title || "").trim() : "";
  if (!name) return "Listen-ID " + id;
  return Modell.schluessel(name) === Modell.schluessel(zeile.Title) ? name + ", Listen-ID " + id : name;
}

/* Schreibt zuerst das Gerät (Status, Verlauf), dann das Feld
   «AdminClientId» jeder Person: «zuweisen» trägt die Listen-ID dieses
   Geräts ein, sonst wird die Inhaberschaft entfernt (null, damit Graph das
   Feld wirklich leert). Scheitert ein Schritt, sagt die Meldung, welcher;
   nachgeladen wird danach immer (F.beschaeftigt), damit kein veraltetes
   eTag stehen bleibt. */
async function inhaberSchreiben(schritte, geraetFelder) {
  let geraetGespeichert = false;
  if (geraetFelder) {
    await Daten.speichern(listenName, elementId, geraetFelder, zeile.__etag);
    geraetGespeichert = true;
    F.melden("zeile-geaendert", elementId);
  }
  const name = String(zeile.Title || "").trim();
  for (const schritt of schritte) {
    const bisher = bisherigesGeraet(schritt.benutzer);
    const eintrag = schritt.zuweisen
      ? "Gerät erhalten: " + name + (bisher ? " (vorher: " + bisher + ")" : "")
      : "Gerät abgegeben: " + name;
    const felder = { AdminClientId: schritt.zuweisen ? Number(zeile.id) : null };
    felder.Verlauf = F.verlaufAnhaengen(schritt.benutzer.Verlauf, eintrag);
    try {
      await Daten.speichern("benutzer", schritt.benutzer.id, felder, schritt.benutzer.__etag);
    } catch (fehler) {
      throw new Error((geraetGespeichert ? "Das Gerät ist gespeichert, aber " : "")
        + "«" + personName(schritt.benutzer) + "» konnte nicht nachgeführt werden: " + F.fehlerText(fehler));
    }
    F.melden("benutzer-geaendert", schritt.benutzer.id);
  }
}

/* Eine Aktion aus einem offenen Dialog über F.imDialog: der Hauptknopf
   («ja», gebaut mit UI.knopf({ beschaeftigt }), damit er beim Start nicht
   breiter wird) zeigt «Wird gespeichert …», solange geschrieben UND
   nachgeladen wird; der Dialog und seine übrigen Knöpfe sind so lange
   gesperrt (mit Grund, nicht disabled), Kopfaktionen und Speicherleiste
   sperrt F.beschaeftigt. Gelungen schliesst der Dialog und der Fokus
   geht dorthin, wo die Person weiterarbeitet (fokusNachAktion); bei einem
   Fehler bleibt er offen, frei und mit der Meldung darüber. → true, wenn
   es geklappt hat. */
function imDialogAusfuehren(d, ja, arbeit) {
  return F.imDialog(d, ja, arbeit);
}

/* Nach einer Schnellaktion gibt es den auslösenden Knopf oft nicht mehr
   («Ins Lager legen» wird zu «Ausgeben an …»). Dann fragt DS.overlay beim
   Schliessen hier nach (UI.dialog({ fokusZurueck }), returnTo): die erste
   Aktion im Kopf (data-fokus «aktion-…», siehe kopfAktionen), sonst der
   Titel – dort, wo die Person weiterarbeitet, statt der Tafel. */
function fokusNachAktion() {
  const kopf = $("g-kopf");
  return (kopf && kopf.querySelector("[data-fokus^=\"aktion-\"]")) || $("g-titel");
}

function abgabeSchritte() {
  return inhaberAlle().map(a => ({ benutzer: a, zuweisen: false }));
}

function verlaufTextMit(basis, notiz) {
  const n = String(notiz || "").trim();
  return n ? basis + " – " + n : basis;
}

/* Dialog einer Schnellaktion: Frage als Titel, Text nennt die Folge, eine
   optionale Notiz für den Verlauf, «Abbrechen» und die Hauptaktion.
   warnung: Text oder fertiger Banner. */
function aktionsDialog(o) {
  if (F.istBeschaeftigt()) return;
  const inhalt = [el("p", "ds-dialog__text", o.text)];
  if (o.warnung) inhalt.push(o.warnung.nodeType ? o.warnung : UI.banner({ ton: "warnung", text: o.warnung }));
  const notiz = UI.eingabe({ art: "textbereich", id: "g-aktion-notiz", zeilen: 2, platzhalter: "z. B. den Grund" });
  inhalt.push(UI.feld("Notiz für den Verlauf (optional)", notiz));
  const abbrechen = UI.knopf({ text: "Abbrechen", variante: "leise", beiKlick: function () { d.schliessen("abbrechen"); } });
  const ja = UI.knopf({ text: o.ja, variante: "primaer", beschaeftigt: "Wird gespeichert …", beiKlick: async function () {
    if (await imDialogAusfuehren(d, ja, function () { return o.ausfuehren(notiz.value); })) {
      UI.meldung(o.erfolg);
    }
  } });
  const d = UI.dialog({ titel: o.titel, inhalt: inhalt, knoepfe: [abbrechen, ja], breit: true, fokusZurueck: fokusNachAktion });
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
    titel: "Ins Lager legen?", ja: "Ins Lager legen", erfolg: "Gerät ins Lager gelegt.",
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
    text: "«" + anzeigeName() + "» bekommt den Status «Archiviert» und wird in der Liste und den Kennzahlen "
      + "ausgeblendet." + inhaberSatz(),
    warnung: inSccm() ? archivHinweis("Für ein eingelagertes Gerät ist «Ins Lager legen» die richtige Wahl.") : null,
    ausfuehren: function (notiz) {
      return inhaberSchreiben(abgabeSchritte(), { Status: "Archiviert", Verlauf: F.verlaufAnhaengen(wert("Verlauf"),
        verlaufTextMit("Archiviert" + (wem ? " (vorher: " + personName(wem) + ")" : ""), notiz)) });
    }
  });
}

function reaktivierenDialog() {
  aktionsDialog({
    titel: "Reaktivieren?", ja: "Reaktivieren", erfolg: "Gerät reaktiviert und ins Lager gelegt.",
    text: "«" + anzeigeName() + "» bekommt den Status «Lager» und erscheint wieder in der Liste.",
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
    titel: "In Betrieb nehmen?", ja: "In Betrieb nehmen", erfolg: "Gerät in Betrieb genommen.",
    text: "«" + anzeigeName() + "» bekommt wieder den Status «Aktiv».",
    ausfuehren: function (notiz) {
      return inhaberSchreiben([], { Status: "Aktiv", Verlauf: F.verlaufAnhaengen(wert("Verlauf"),
        verlaufTextMit("In Betrieb genommen", notiz)) });
    }
  });
}

function inhaberEntfernenDialog(b) {
  if (!b || F.istBeschaeftigt()) return;
  const istInhaber = !!inhaber() && String(inhaber().id) === String(b.id);
  const titel = istInhaber ? "Inhaber entfernen?" : "Eintrag entfernen?";
  const abbrechen = UI.knopf({ text: "Abbrechen", variante: "leise", beiKlick: function () { d.schliessen("abbrechen"); } });
  const ja = UI.knopf({ text: istInhaber ? "Inhaber entfernen" : "Eintrag entfernen", variante: "primaer",
    beschaeftigt: "Wird gespeichert …", beiKlick: async function () {
      const ok = await imDialogAusfuehren(d, ja, function () {
        return inhaberSchreiben([{ benutzer: b, zuweisen: false }], istInhaber
          ? { Verlauf: F.verlaufAnhaengen(wert("Verlauf"), "Inhaber entfernt: " + personName(b)) } : null);
      });
      if (ok) UI.meldung("«" + personName(b) + "» ist nicht mehr eingetragen.");
    } });
  const d = UI.dialog({ titel: titel, knoepfe: [abbrechen, ja], fokusZurueck: fokusNachAktion, inhalt: [el("p", "ds-dialog__text",
    "«" + personName(b) + "» ist danach nicht mehr Inhaber. Das Gerät selbst bleibt unverändert.")] });
}

/* Inhaber wählen in zwei Schritten: suchen und wählen, dann bestätigen.
   Beide Schritte stehen im selben Dialog: Inhalt und Knöpfe werden
   abgeglichen (UI.abgleichen, jeder Teil mit Schlüssel), die Trefferliste
   beim Tippen ebenso – sie behält ihren Rollstand, die Zeilen gleiten an
   ihren Platz (Bewegung.umordnen), kommt der Leerzustand, blendet die
   Liste aus und er ein. «ausgabe» (nur aus der Schnellaktion «Ausgeben
   an …»): das Gerät verlässt dabei das Lager und wird «Aktiv». Sonst ein
   gewöhnlicher Inhaberwechsel – auch bei archivierten Geräten, deren
   Status dabei bleibt. «person» springt gleich zur Bestätigung (Inhaber
   des Vorgängers übernehmen). */
function inhaberWaehlenDialog(ausgabe, person) {
  if (F.istBeschaeftigt()) return;
  const pcName = textWert("Title").trim();
  if (!pcName) {
    UI.meldung("Ohne PC-Namen lässt sich kein Inhaber festlegen.", { ton: "fehler" });
    return;
  }
  const id = String(zeile.id);
  const bisheriger = inhaber();
  const ausLager = ausgabe === true && geraeteStatus() !== "Aktiv";
  const titel = ausLager ? "Ausgeben an …" : (bisheriger ? "Inhaber wechseln" : "Inhaber festlegen");
  const d = UI.dialog({ titel: titel, breit: true, fokusZurueck: fokusNachAktion });
  let suchText = "";
  // Suche und Trefferzahl stehen zwischen Titel und Körper und bleiben
  // stehen; nur die Liste im Körper rollt (Dashboard-Style, «A search over
  // a list»). Die feste Höhe hält den Dialog beim Filtern ruhig.
  let zahl = null;

  function schritt1() {
    d.titel(titel);
    zahl = el("p", "ds-meta");
    zahl.setAttribute("aria-live", "polite");
    const suche = UI.suchfeld({ id: "g-inhaber-suche", platzhalter: "Name, Login oder Abteilung",
      label: "Person suchen", wert: suchText, verzoegerung: 100,
      beiEingabe: function (w) { suchText = w; treffer(true); } });
    d.oben([suche, zahl]);
    d.hoehe("560px");
    trefferFuellen(d.inhalt, zahl, false);
    UI.abgleichen(d.knoepfe, [schluesselSetzen(UI.knopf({ text: "Abbrechen", variante: "leise",
      beiKlick: function () { d.schliessen("abbrechen"); } }), "abbrechen")]);
    const feld = $("g-inhaber-suche");
    if (feld) feld.focus();
  }

  function treffer(ausEingabe) {
    if (zahl && zahl.isConnected) trefferFuellen(d.inhalt, zahl, ausEingabe);
  }

  /* Gesucht wird nur, was der Platzhalter verspricht: Name, Login und
     Abteilung (nicht der Volltextindex __such – sonst träfe «meier» auch,
     wen ein Herr Meierhans führt, und stünde alphabetisch zuoberst). Jedes
     Wort muss passen, die Reihenfolge ist egal («ammann urs»). Wer schon
     über Name oder Login passt, steht vor den Treffern über die Abteilung. */
  function trefferFuellen(liste, zahl, ausEingabe) {
    const t = suchText.trim().toLowerCase();
    const woerter = t.split(/\s+/).filter(Boolean);
    const rang = new Map();
    const passend = alleBenutzer.filter(function (b) {
      if (Modell.geraetId(b.AdminClientId) === id) return false;
      if (!woerter.length) return true;
      const person = (personName(b) + " " + UI.text(b.Title)).toLowerCase();
      const alle = person + " " + UI.text(b.Abteilung).toLowerCase();
      if (!woerter.every(w => alle.indexOf(w) > -1)) return false;
      rang.set(b, woerter.every(w => person.indexOf(w) > -1) ? 0 : 1);
      return true;
    }).sort((a, b) => ((rang.get(a) || 0) - (rang.get(b) || 0)) || Hilfe.vergleiche(a.__name, b.__name));

    UI.textSetzen(zahl, !passend.length ? "" : (passend.length > 40
      ? "40 von " + UI.zahlText(passend.length) + " Personen"
      : (passend.length === 1 ? "1 Person" : UI.zahlText(passend.length) + " Personen")));
    if (!passend.length) {
      const leer = schluesselSetzen(UI.leerzustand({ sinnbild: "suche", titel: "Keine Treffer",
        text: t ? "Niemand passt zu «" + suchText.trim() + "»." : "Keine Personen zur Auswahl." }), "leer");
      trefferAbgleichen(liste, [leer], ausEingabe);
      return;
    }
    const zeilen = passend.slice(0, 40).map(function (b) {
      const unter = personUnter(b).slice(0, 2);
      const bisher = bisherigesGeraet(b);
      unter.push(bisher ? "hat «" + bisher + "»" : "kein Gerät");
      const bId = b.id;
      return schluesselSetzen(UI.listenZeile({ titel: personName(b), unter: unter, sinnbild: "benutzer",
        beiKlick: function () { schritt2(personNachId(bId)); } }), "person-" + bId);
    });
    // Stehen schon Treffer, gleiten nur die Zeilen; sonst wechselt die Art.
    const bestand = liste.querySelector(":scope > .zeilenliste");
    if (bestand && ausEingabe) {
      Bewegung.umordnen(bestand, function (o) { UI.abgleichen(bestand, zeilen, o); }, { eintraege: ":scope > .listen-zeile" });
    } else if (bestand) {
      UI.abgleichen(bestand, zeilen);
    } else {
      trefferAbgleichen(liste, [schluesselSetzen(UI.zeilenliste(zeilen), "zeilen")], ausEingabe);
    }
  }

  function schritt2(b) {
    if (!b) return;
    const bisher = bisherigesGeraet(b);
    const abgebende = inhaberAlle().filter(a => String(a.id) !== String(b.id));
    d.titel(ausLager ? "Ausgeben an «" + personName(b) + "»?" : "«" + personName(b) + "» als Inhaber?");
    const teile = [schluesselSetzen(el("p", "ds-dialog__text", "«" + pcName + "» geht an «" + personName(b) + "» ("
      + (String(b.Title || "").trim() || "ohne Login")
      + (String(b.Abteilung || "").trim() ? ", " + String(b.Abteilung).trim() : "")
      + ")." + (ausLager ? " Das Gerät bekommt den Status «Aktiv»." : "")), "frage")];
    if (abgebende.length) {
      teile.push(schluesselSetzen(UI.banner({ ton: "warnung", text: namenText(abgebende)
        + (abgebende.length === 1 ? " gibt" : " geben") + " das Gerät ab." }), "abgebende"));
    }
    if (bisher) {
      teile.push(schluesselSetzen(UI.banner({ ton: "warnung", text: "«" + personName(b) + "» hat zurzeit «" + bisher
        + "». Dieser Eintrag wird ersetzt." }), "bisher"));
    }
    const zurueck = schluesselSetzen(UI.knopf({ text: "Zurück", variante: "leise",
      beiKlick: function () { schritt1(); } }), "zurueck");
    const ja = schluesselSetzen(UI.knopf({ text: ausLager ? "Ausgeben" : (bisheriger ? "Wechseln" : "Festlegen"),
      variante: "primaer", beschaeftigt: "Wird gespeichert …", beiKlick: async function () {
        const verlaufText = ausLager ? "Aus dem Lager ausgegeben an " + personName(b)
          : (bisheriger ? "Inhaber gewechselt: " + personName(bisheriger) + " → " + personName(b)
            : "Inhaber festgelegt: " + personName(b));
        const geraetFelder = { Verlauf: F.verlaufAnhaengen(wert("Verlauf"), verlaufText) };
        if (ausLager) geraetFelder.Status = "Aktiv";
        /* Erst lösen, dann setzen: dazwischen hat das Gerät keinen Inhaber,
           aber nie zwei. */
        const schritte = abgebende.map(a => ({ benutzer: a, zuweisen: false }));
        schritte.push({ benutzer: b, zuweisen: true });
        const ok = await imDialogAusfuehren(d, ja, function () { return inhaberSchreiben(schritte, geraetFelder); });
        if (ok) UI.meldung(ausLager ? "Ausgegeben an «" + personName(b) + "»." : "«" + personName(b) + "» ist jetzt Inhaber.");
      } }), "ja");
    d.oben([]);
    d.hoehe(null);
    UI.abgleichen(d.inhalt, teile);
    UI.abgleichen(d.knoepfe, [zurueck, ja]);
    ja.focus();
  }

  if (person) schritt2(person);
  else schritt1();
}


/* ==================================================================
   10. Löschen, Start
   ================================================================== */

/* Löschen mit Eintippen des PC-Namens; danach der Endzustand mit «Zur
   Liste» (gemerkte Liste samt Filtern). */
function loeschenDialog() {
  const name = anzeigeName();
  const personen = inhaberAlle();
  F.loeschenDialog({
    titel: "Gerät löschen?",
    text: "Die Zeile wird in den Papierkorb der SharePoint-Site verschoben und lässt sich dort 93 Tage lang zurückholen.",
    warnung: personen.length === 1
      ? "Bei «" + personName(personen[0]) + "» bleibt die Inhaberschaft stehen und zeigt danach ins Leere."
      : (personen.length > 1 ? "Bei " + personen.length + " Personen bleibt die Inhaberschaft stehen und "
        + "zeigt danach ins Leere." : ""),
    wort: textWert("Title").trim() || String(zeile.id),
    knopfText: "Löschen",
    beiLoeschen: async function () {
      await Daten.loeschen(listenName, zeile.id);
      F.melden("zeile-geloescht", zeile.id);
      entwurf.leeren();
    },
    ende: {
      titel: "Gerät gelöscht",
      text: "«" + name + "» liegt jetzt im Papierkorb der SharePoint-Site.",
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
      F.zeigeFehler("Kein Gerät angegeben", "In der Adresse fehlt die Listen-ID, zum Beispiel "
        + "client.html?liste=admin&id=5.", "",
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

/* kamera.js – Kamerafenster des ICT-Inventars.

   Wird von der Hauptseite als kamera.html?id=… im selben Tab geöffnet und
   zeigt eine Zeile der Liste «Kameras» (eine Hardware in Milestone) in vier
   Bereichen:

     Stammdaten       Name, Gebäude, Raum, Status, Beschaffung, Bemerkung –
                      daneben, was Milestone über die Hardware weiss
                      (IP, MAC, Seriennummer, Modell, Firmware, Kanäle).
     Bewertung        Zuständig, Bildqualität, Positionierung,
                      Verbesserungen, Bewertet am.
     Berechtigungen   Die Rollen aus Milestone, die diese Kamera sehen,
                      mit ihren Rechten (live aus der Liste «Kamera-Rollen»).
     Verlauf          Verlauf.

   Neue Kameras legt nur der Abgleich aus Milestone an; ein Formular zum
   Erfassen gibt es nicht.

   Bearbeitbar sind die von Hand gepflegten Spalten (q = «manuell» in
   spalten.js). Den Namen führt der Abgleich aus Milestone nach; solange die
   Kamera in Milestone steht, ist er hier gesperrt. Alles mit «MS_» schreibt
   nur der Abgleich.

   Gebaut wird nur über UI.*, Rahmen.*, F.* und Bewegung.*; kein innerHTML
   mit Daten. */

"use strict";

(function () {

/* ==================================================================
   1. Parameter und Spaltenwissen
   ================================================================== */

const ABFRAGE = new URLSearchParams(location.search);
const mockModus = UI.adresse.mock();

const elementId = ABFRAGE.get("id");

const SPALTEN = SPALTEN_KAMERA;
const SPALTE = {};
for (const s of SPALTEN) SPALTE[s.i] = s;

const GRUND_ENTWURF = "Zuerst speichern oder verwerfen.";


/* ==================================================================
   2. Gerüst und Zustand
   ================================================================== */

const F = Fenster.erstellen("km", {
  liste: "kameras",
  neuLaden: function () { neuLaden(); },
  nachladen: function () { return nachladenStill(); }
});

let alleKameras = [];
let alleRollen = [];
let zeile = null;

/* Leer gespeicherter Status gilt als «Aktiv» (wie bei den Clients); ein
   Hin und Her ist darum keine Änderung. */
const entwurf = F.entwurf(function () { return zeile; }, {
  leer: { Status: "Aktiv" },
  beiAenderung: nachAenderung
});

let aktiverBereich = "stammdaten";

const BEREICHE = [
  { k: "stammdaten",     d: "Stammdaten",     sinnbild: "kamera",   f: bereichStammdaten },
  { k: "bewertung",      d: "Bewertung",      sinnbild: "aktivitaet", f: bereichBewertung },
  { k: "berechtigungen", d: "Berechtigungen", sinnbild: "schild",   f: bereichBerechtigungen },
  { k: "verlauf",        d: "Verlauf",        sinnbild: "verlauf",  f: bereichVerlauf }
];

function nachAenderung() {
  kopfZeichnen();
  speicherleisteZeichnen();
}

function speicherleisteZeichnen() {
  F.speicherleisteZeichnen({ anzahl: entwurf.anzahl() });
}

function navZeichnen() {
  F.navZeichnen(BEREICHE, aktiverBereich, bereichWechseln, {
    zusatz: function (b) { return b.k === "berechtigungen" && zeile ? (zeile.__rollen || []).length || null : null; }
  });
}

function zeichneBereich() {
  aktiverBereich = F.zeichneBereich(BEREICHE, aktiverBereich);
}

function bereichWechseln(schluessel) {
  if (!zeile) return;
  aktiverBereich = schluessel;
  F.bereichWechseln(BEREICHE, schluessel);
}


/* ==================================================================
   3. Auswertung
   ================================================================== */

function textWert(feld) { return entwurf.textWert(feld); }

function inMilestone() { return !!zeile && Hilfe.istJa(zeile.MS_Gefunden); }

/* War die Kamera schon einmal mit Milestone verknüpft? Dann führt der
   Abgleich sie weiter (archiviert sie etwa, wenn sie verschwindet). */
function verknuepft() { return !!zeile && !!String(zeile.MS_HardwareId || "").trim(); }

function statusWert() { return Modell.status(textWert("Status")); }

function anzeigeName() {
  return textWert("Title").trim() || "(ohne Namen)";
}

function vorschlaege(feld) {
  const werte = [];
  for (const z of alleKameras) {
    const w = String(z[feld] || "").trim();
    if (w && werte.indexOf(w) === -1) werte.push(w);
  }
  return werte.sort(Hilfe.vergleiche);
}

/* Gleichnamige Kameras (Warnung beim Umbenennen). */
function namensZwillinge() {
  const n = Modell.schluessel(textWert("Title"));
  if (!n) return [];
  return alleKameras.filter(z => String(z.id) !== String(elementId) && Modell.schluessel(z.Title) === n);
}


/* ==================================================================
   4. Felder
   ================================================================== */

function feldZeile(feld, o) {
  const s = SPALTE[feld];
  return F.feld(feld, Object.assign({
    beschriftung: s.d,
    art: s.t === "Note" ? "textbereich" : "text",
    entwurf: entwurf
  }, o || {}));
}

function hinweisSetzen(id, schluessel, bauen, ausEingabe) {
  const platz = UI.$(id);
  if (platz) platz.setzen(schluessel, bauen, { ausEingabe: ausEingabe });
}

/* Name: aus Milestone gesperrt, sonst frei (mit Warnung bei Zwillingen). */
function nameZeile() {
  if (inMilestone()) {
    return UI.feldZeile("Name", textWert("Title"), { gesperrt: true,
      hinweis: "Kommt aus Milestone. Umbenennen im Management Client; der Abgleich übernimmt den Namen." });
  }
  return feldZeile("Title", {
    hinweis: "Wie in Milestone üblich: Raum und Bezeichnung, z. B. «10.300 Treppe Trakt 1».",
    zusatz: UI.hinweisPlatz({ id: "km-zwillinge" }),
    beiEingabe: function () { zwillingeNachfuehren(true); }
  });
}

function zwillingeNachfuehren(ausEingabe) {
  const zw = namensZwillinge();
  hinweisSetzen("km-zwillinge", zw.map(z => z.id).join(","), function () {
    return UI.banner({ ton: "warnung", titel: "Diesen Namen gibt es schon.",
      text: zw.length === 1 ? "Listen-ID " + zw[0].id + "." : zw.length + " Kameras heissen so.",
      knopf: zw.length === 1 ? UI.knopf({ text: "Öffnen", variante: "leise", href: UI.adresse.kamera(zw[0].id), fokus: "zwilling-oeffnen" }) : null });
  }, ausEingabe);
}

const STATUS_HINWEISE = {
  Lager: "Ausgebaut oder in Reserve. Der Abgleich archiviert eine Kamera im Lager nie.",
  Archiviert: "Ausser Betrieb. In der Liste und den Kennzahlen standardmässig ausgeblendet."
};

function statusZeile() {
  const hinweis = UI.el("span");
  hinweis.id = "km-status-hinweis";
  const z = feldZeile("Status", {
    art: "auswahl",
    eingabe: { werte: Modell.STATUS_WERTE, wert: statusWert(), schmal: true },
    hinweis: hinweis,
    zusatz: UI.hinweisPlatz({ id: "km-statuswarnung" }),
    beiEingabe: function () { statusNachfuehren(true); }
  });
  return z;
}

function statusNachfuehren(ausEingabe) {
  const h = UI.$("km-status-hinweis");
  if (h) {
    UI.textSetzen(h, STATUS_HINWEISE[statusWert()] || "");
    if (h.parentNode) h.parentNode.hidden = !h.textContent;
  }
  hinweisSetzen("km-statuswarnung", statusWert() === "Archiviert" && inMilestone() ? "archiv-in-milestone" : "", function () {
    return UI.banner({ ton: "warnung", titel: "Von Hand archivieren ist meist nicht nötig.",
      text: "Wird die Kamera in Milestone entfernt, archiviert sie der nächste Abgleich. Solange sie in Milestone steht, setzt er sie wieder auf «Aktiv». Für eine ausgebaute Kamera «Lager» wählen." });
  }, ausEingabe);
}

function gjZeile(feld, platzhalter) {
  return feldZeile(feld, {
    hinweis: "Geschäftsjahr (1. August bis 31. Juli).",
    eingabe: { vorschlaege: Modell.gjAuswahl(), schmal: true, platzhalter: platzhalter }
  });
}


/* ==================================================================
   5. Stammdaten
   ================================================================== */

function stammdatenKarte() {
  const k = UI.karte({ titel: "Stammdaten",
    unter: verknuepft() ? "Leere Felder «Gebäude» und «Raum» füllt der Abgleich aus dem Namen." : "" });
  k.inhalt.appendChild(UI.datenzeilen([
    nameZeile(),
    feldZeile("Gebaeude", { eingabe: { vorschlaege: vorschlaege("Gebaeude"), schmal: true } }),
    feldZeile("Raum", { eingabe: { vorschlaege: vorschlaege("Raum"), schmal: true } }),
    statusZeile(),
    gjZeile("Beschaffungsjahr", "z. B. 2023/2024"),
    gjZeile("ErsatzGeplant", "z. B. 2031/2032"),
    feldZeile("Bemerkung", { eingabe: { zeilen: 3 } })
  ]));
  return k;
}

function jaNein(wert) { return Hilfe.istJa(wert) ? "Ja" : (String(wert || "").trim() ? "Nein" : ""); }

/* Ja/Nein aus Milestone, bei dem «Nein» eine Abweichung ist: dann als
   Status-Chip, aber nur, solange die Kamera in Milestone steht (sonst
   sagt das der Chip im Kartenkopf). */
function jaNeinAbweichung(wert, sinnbild) {
  const text = jaNein(wert);
  return text === "Nein" && inMilestone() ? UI.status("Nein", "warnung", { sinnbild: sinnbild }) : text;
}

/* Was Milestone über die Hardware weiss – alles gesperrt; das sagt die
   Karte einmal in ihrem Untertitel. Status-Chips nur für Abweichungen:
   «Nicht mehr in Milestone» im Kartenkopf, «deaktiviert» und «keine
   Aufzeichnung» an ihrem Wert. */
function milestoneKarte() {
  const k = UI.karte({ titel: "Aus Milestone",
    unter: inMilestone() ? "Vom Abgleich gesetzt und hier nicht änderbar." : "",
    aktionen: verknuepft() && !inMilestone() ? [UI.status("Nicht mehr in Milestone", "neutral", { sinnbild: "archiv" })] : [] });
  if (!verknuepft()) {
    k.inhalt.appendChild(UI.leerzustand({ sinnbild: "kamera", titel: "Nicht in Milestone",
      text: "Diese Kamera ist nur hier erfasst. Taucht sie in Milestone auf (gleiche IP-Adresse), verknüpft der Abgleich sie von selbst." }));
    return k;
  }
  k.inhalt.appendChild(UI.datenzeilen([
    UI.feldZeile("IP-Adresse", UI.text(zeile.MS_Adresse)),
    UI.feldZeile("MAC-Adresse", UI.text(zeile.MS_Mac)),
    UI.feldZeile("Seriennummer", UI.text(zeile.MS_Seriennummer)),
    UI.feldZeile("Hersteller", UI.text(zeile.MS_Hersteller)),
    UI.feldZeile("Modell", UI.text(zeile.MS_Modell)),
    UI.feldZeile("Firmware", UI.text(zeile.MS_Firmware)),
    UI.feldZeile("In Milestone aktiv", jaNeinAbweichung(zeile.MS_Aktiv, "aus")),
    UI.feldZeile("Aufzeichnung", jaNeinAbweichung(zeile.MS_Aufzeichnung)),
    UI.feldZeile("Recording Server", UI.text(zeile.MS_RecordingServer)),
    UI.feldZeile("Hardware-Name", UI.text(zeile.MS_HardwareName)),
    UI.feldZeile("In Milestone geändert", UI.zeitText(zeile.MS_Geaendert)),
    UI.feldZeile("Letzter Abgleich", UI.zeitText(zeile.MS_LetzterSync), { neben: UI.text(zeile.MS_SyncStatus) })
  ]));
  return k;
}

/* Kanäle: nur, wenn es mehr als einen gibt oder einer keinen Namen hat –
   sonst stünde der Name der Kamera ein zweites Mal da. */
function kanaeleKarte() {
  const kanaele = zeile.__kanaele || [];
  const unbenannt = kanaele.filter(c => c.unbenannt && c.aktiv).length;
  if (kanaele.length <= 1 && !unbenannt) return null;
  const k = UI.karte({ titel: "Kanäle in Milestone", breit: true,
    unter: kanaele.length + (kanaele.length === 1 ? " Kanal" : " Kanäle") + " dieser Hardware" });
  if (unbenannt) {
    k.inhalt.appendChild(UI.banner({ ton: "warnung",
      text: (unbenannt === 1 ? "Ein aktiver Kanal heisst" : unbenannt + " aktive Kanäle heissen") + " in Milestone noch wie das Modell. "
        + "Braucht es ihn nicht, im Management Client deaktivieren; sonst einen Namen geben." }));
  }
  k.inhalt.appendChild(UI.tabelle(["Kanal", "Name", "Status", "Aufzeichnung"], kanaele.map(function (c) {
    return [String(c.nr), c.name || "–",
      c.aktiv ? "Aktiv" : UI.status("Deaktiviert", "neutral", { sinnbild: "aus" }),
      c.aufzeichnung ? "Ein" : "Aus"];
  }), { beschriftung: "Kanäle in Milestone" }));
  return k;
}

function bereichStammdaten(ziel) {
  const stapel = UI.el("div", "ds-stack");
  const raster = UI.el("div", "karten");
  raster.appendChild(stammdatenKarte());
  raster.appendChild(milestoneKarte());
  stapel.appendChild(raster);
  const kanaele = kanaeleKarte();
  if (kanaele) stapel.appendChild(kanaele);
  ziel.appendChild(stapel);
  statusNachfuehren(false);
}


/* ==================================================================
   6. Bewertung
   ================================================================== */

function bereichBewertung(ziel) {
  const k = UI.karte({ titel: "Bewertung",
    unter: "Wer die Kamera nutzt und wie gut Bild und Ausrichtung sind. Wird von Hand gepflegt." });
  k.inhalt.appendChild(UI.datenzeilen([
    feldZeile("Zustaendig", { eingabe: { vorschlaege: vorschlaege("Zustaendig") },
      hinweis: "Wer die Bilder im Alltag nutzt und Mängel meldet." }),
    feldZeile("Qualitaet", { art: "auswahl", eingabe: { werte: Modell.KAMERA_BEWERTUNG, leer: "–", schmal: true } }),
    feldZeile("Positionierung", { art: "auswahl", eingabe: { werte: Modell.KAMERA_BEWERTUNG, leer: "–", schmal: true } }),
    feldZeile("Verbesserungen", { eingabe: { zeilen: 4 } }),
    feldZeile("BewertetAm", { art: "datum", eingabe: { schmal: true } })
  ]));
  ziel.appendChild(k);
}


/* ==================================================================
   7. Berechtigungen
   ================================================================== */

function bereichBerechtigungen(ziel) {
  const stapel = UI.el("div", "ds-stack");
  const rollen = zeile.__rollen || [];
  const k = UI.karte({ titel: "Sichtbar für",
    unter: "Rollen aus Milestone mit Rechten auf diese Kamera. Geändert wird im Management Client von Milestone." });
  if (!alleRollen.length) {
    k.inhalt.appendChild(UI.leerzustand({ sinnbild: "schild", titel: "Noch keine Rollen abgeglichen",
      text: "Der Abgleich liest die Rollen, sobald das Konto des Syncs sie in Milestone lesen darf (README Abschnitt 7.5)." }));
  } else if (!rollen.length) {
    k.inhalt.appendChild(UI.leerzustand({ sinnbild: "schild", titel: "Keine Rolle sieht diese Kamera",
      text: inMilestone() ? "In Milestone hat keine Rolle Rechte auf diese Kamera." : "Die Kamera steht nicht in Milestone." }));
  } else {
    k.inhalt.appendChild(UI.zeilenliste(rollen.map(function (e) {
      const r = e.rolle;
      const personen = (r.__personen || []).length + (r.__unbekannt || []).length;
      return UI.listenZeile({
        titel: String(r.Title || "").trim() || "(ohne Namen)",
        unter: [e.rechte.join(", "), (r.__adGruppen || []).join(", "), UI.zahlText(personen) + (personen === 1 ? " Person" : " Personen")],
        href: UI.adresse.kamerarolle(r.id),
        sinnbild: "schild",
        fokus: "rolle-" + r.id
      });
    })));
  }
  stapel.appendChild(k);
  ziel.appendChild(stapel);
}


/* ==================================================================
   8. Verlauf
   ================================================================== */

function bereichVerlauf(ziel) {
  const huelle = UI.el("div", "km-verlauf");
  huelle.setAttribute("data-rolle", "verlauf");
  Verlauf.zeichnen(huelle, {
    schluessel: "kamera",
    wert: entwurf.wert("Verlauf"),
    beiAenderung: function (json) { entwurf.setzeWert("Verlauf", json); },
    titel: "Verlauf"
  });
  ziel.appendChild(huelle);
}


/* ==================================================================
   9. Kopf und Schnellaktionen
   ================================================================== */

function kopfZeichnen() {
  if (!zeile) return;
  const unter = [];
  const status = [];
  const aktionen = [];
  unter.push(textWert("Raum").trim());
  unter.push(UI.text(zeile.MS_Modell).trim());
  unter.push(UI.text(zeile.MS_Adresse).trim());
  const s = statusWert();
  if (s === "Lager") status.push(UI.status("Lager", "neutral", { sinnbild: "lager" }));
  if (s === "Archiviert") status.push(UI.status("Archiviert", "neutral", { sinnbild: "archiv" }));
  if (!verknuepft()) status.push(UI.status("Nicht in Milestone", "neutral"));
  else if (!inMilestone()) status.push(UI.status("Nicht mehr in Milestone", "neutral"));
  else {
    if (!Hilfe.istJa(zeile.MS_Aktiv)) status.push(UI.status("Deaktiviert", "warnung", { sinnbild: "aus" }));
    else if (!Hilfe.istJa(zeile.MS_Aufzeichnung)) status.push(UI.status("Keine Aufzeichnung", "warnung"));
  }
  if (!F.geloescht()) aktionen.push(loeschenKnopf());
  F.seitenkopf({ titel: anzeigeName(), unter: unter, status: status, aktionen: aktionen });
}

/* Löschen nur ausserhalb von Milestone: steht die Kamera dort, legte der
   nächste Abgleich sie neu an. Der Grund steht im Tooltip. */
function loeschenKnopf() {
  const offen = entwurf.anzahl() > 0;
  return UI.knopf({ text: "Löschen …", variante: "leise", sinnbild: "papierkorb", beiKlick: loeschen,
    gesperrt: offen ? GRUND_ENTWURF : (inMilestone()
      ? "Die Kamera steht in Milestone – der Abgleich legte sie wieder an. Für eine ausgebaute Kamera «Lager» wählen." : "") });
}

function loeschen() {
  if (entwurf.anzahl() || F.istBeschaeftigt() || inMilestone()) return;
  const name = String(zeile.Title || "").trim();
  const id = zeile.id;
  F.loeschenDialog({
    titel: "Kamera löschen?",
    text: "Die Zeile wird in den Papierkorb der SharePoint-Site verschoben und lässt sich dort 93 Tage lang zurückholen.",
    warnung: "Meist ist «Archiviert» die bessere Wahl: dann bleibt der Verlauf sichtbar.",
    wort: name || "löschen",
    knopfText: "Löschen",
    fehlerText: "Löschen fehlgeschlagen.",
    beiLoeschen: async function () {
      await Daten.loeschen("kamera", id);
      F.melden("kamera-geloescht", id);
      entwurf.leeren();
    },
    ende: {
      titel: "Kamera gelöscht",
      text: (name ? "«" + name + "»" : "Die Kamera") + " liegt jetzt im Papierkorb der SharePoint-Site.",
      knopfText: "Zur Liste"
    }
  });
}


/* ==================================================================
   10. Zeichnen und Laden
   ================================================================== */

function zeichnenAlles() {
  kopfZeichnen();
  navZeichnen();
  zeichneBereich();
  speicherleisteZeichnen();
}

async function datenLaden(still) {
  let anzahl = 0;
  if (!still) F.zeigeLaden(mockModus ? "Vorführdaten werden aufgebaut …" : "Daten werden aus SharePoint geladen …");
  const [rohKameras, rohRollen, rohBenutzer] = await Promise.all([
    Daten.kameras(function (n) { anzahl = n; if (!still) F.fortschritt("Kameras " + UI.zahlText(anzahl)); }),
    Daten.kameraRollen().catch(function () { return []; }),
    Daten.benutzer().catch(function () { return []; })
  ]);
  const benutzer = Modell.anreichern([], rohBenutzer, null).benutzer;
  const video = Modell.kamerasAnreichern(rohKameras, rohRollen, benutzer);
  alleKameras = video.kameras;
  alleRollen = video.rollen;
}

function zeileWaehlen() {
  const treffer = alleKameras.filter(z => String(z.id) === String(elementId))[0];
  if (!treffer) {
    const fehler = new Error("In der Liste «Kameras» gibt es keine Zeile mit der Listen-ID " + elementId + ".");
    fehler.nichtGefunden = true;
    throw fehler;
  }
  zeile = treffer;
}

async function nachladenStill() {
  await datenLaden(true);
  zeileWaehlen();
  zeichnenAlles();
}

async function neuLaden() {
  try {
    await datenLaden(false);
    zeileWaehlen();
    zeichnenAlles();
    await F.zeigeInhalt();
    return true;
  } catch (fehler) {
    ladefehlerZeigen(fehler);
    return false;
  }
}

function ladefehlerZeigen(fehler) {
  F.ladefehler(fehler, { titel: "Kamera nicht gefunden",
    hinweis: "Gelöschte Zeilen liegen 93 Tage im Papierkorb der SharePoint-Site und lassen sich dort zurückholen." });
}


/* ==================================================================
   11. Prüfen, Speichern, Anlegen, Verwerfen
   ================================================================== */

function pruefen() {
  const name = textWert("Title").trim();
  if (entwurf.istGeaendert("Title") && !name) return { feld: "Title", text: "Bitte einen Namen eingeben." };
  if (entwurf.istGeaendert("Status")) {
    const st = textWert("Status").trim();
    if (st && Modell.STATUS_WERTE.indexOf(st) === -1) {
      return { feld: "Status", text: "«Status» muss «" + Modell.STATUS_WERTE.join("», «") + "» oder leer sein." };
    }
  }
  for (const feld of ["Beschaffungsjahr", "ErsatzGeplant"]) {
    const w = textWert(feld).trim();
    if (entwurf.istGeaendert(feld) && w && !Modell.gjGueltig(w)) {
      return { feld: feld, text: "Bitte als Geschäftsjahr schreiben, z. B. 2025/2026." };
    }
  }
  const am = textWert("BewertetAm").trim();
  if (entwurf.istGeaendert("BewertetAm") && am && !Modell.datumIsoGueltig(am)) {
    return { feld: "BewertetAm", text: "Bitte ein Datum wählen." };
  }
  return null;
}

function fuerGraph(feld, roh) {
  const t = (roh === null || roh === undefined) ? "" : String(roh);
  if (feld === "Verlauf") return t;
  return t.trim() === "" ? null : t;
}

async function aendern() {
  const aenderungen = entwurf.aenderungen();
  const felder = {};
  for (const feld of Object.keys(aenderungen)) {
    if (feld === "Title" && inMilestone()) continue;
    if (Modell.istBearbeitbar(SPALTE[feld])) felder[feld] = fuerGraph(feld, aenderungen[feld]);
  }
  /* Statuswechsel stehen automatisch im Verlauf. */
  if (entwurf.istGeaendert("Status")) {
    const alt = Modell.status(zeile.Status);
    const neu = statusWert();
    if (alt !== neu) felder.Verlauf = F.verlaufAnhaengen(entwurf.wert("Verlauf"), "Status geändert: " + alt + " → " + neu);
  }
  const anzahl = entwurf.anzahl();
  if (!Object.keys(felder).length) { entwurf.leeren(); return { anzahl: 0 }; }
  const antwort = await Daten.speichern("kamera", elementId, felder, zeile.__etag);
  F.uebernehmen(zeile, felder, antwort);
  entwurf.leeren();
  F.melden("kamera-geaendert", elementId);
  return { anzahl: anzahl };
}

function speichern() {
  return F.speicherAblauf({
    anzahl: function () { return entwurf.anzahl(); },
    pruefen: pruefen,
    schreiben: aendern,
    nachladen: function () { return nachladenStill(); },
    zeichnen: zeichnenAlles,
    fehlerText: "Speichern fehlgeschlagen.",
    erfolgText: function (e) {
      if (!e || !e.anzahl) return false;
      return e.anzahl === 1 ? "Änderung gespeichert." : e.anzahl + " Änderungen gespeichert.";
    }
  });
}

function verwerfen() {
  return F.verwerfen({ anzahl: entwurf.anzahl(), danach: function () {
    entwurf.leeren();
    zeichnenAlles();
  } });
}


/* ==================================================================
   12. Start
   ================================================================== */

async function start() {
  aktiverBereich = F.hashBereich(BEREICHE) || aktiverBereich;
  navZeichnen();
  F.logoZeichnen("kameras");
  F.bandZeichnen(undefined, function () {
    entwurf.leeren();
    F.melden("kamera-geaendert", elementId);
    neuLaden();
  });

  try {
    if (!mockModus) {
      F.zeigeLaden("Anmeldung wird geprüft …");
      await Auth.anmeldungSicherstellen();
    }
    F.kontoZeigen();
    if (!elementId) {
      F.zeigeFehler("Keine Kamera angegeben",
        "In der Adresse fehlt die Listen-ID, zum Beispiel kamera.html?id=5.",
        "", "Zur Liste", function () { F.zurListe(); });
      return;
    }
    await neuLaden();
  } catch (fehler) {
    ladefehlerZeigen(fehler);
  }
}

F.ereignisse({
  speichern: speichern,
  verwerfen: verwerfen,
  anzahlAenderungen: function () { return entwurf.anzahl(); },
  verlassenFrei: function () { return F.geloescht(); },
  beiHash: function (h) {
    if (h !== aktiverBereich && BEREICHE.some(b => b.k === h)) bereichWechseln(h);
  }
});

F.autoStarten(function () { return !!zeile && !F.geloescht() && !entwurf.anzahl(); }, nachladenStill);

start();

})();

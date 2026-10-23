/* benutzer.js – Benutzerseite des ICT-Inventars.

   Wird von der Hauptseite als benutzer.html?id=… im selben Tab geöffnet und
   zeigt eine Zeile der Benutzer-Liste in vier Bereichen:

     Übersicht        Kennzahlen der Berechtigungen, Gerät, Telefon und die
                      Angaben aus dem Active Directory (schreibgeschützt)
     Gerät            Inhaberschaft festlegen, aufheben, SCCM-Primärgerät
                      übernehmen
     Berechtigungen   alle Programme aus der Liste «Software» als Schalter
                      (aus · an · an und gesperrt)
     Bemerkung        freier Text und Verlauf

   Das Feld «AdminClientId» hält die Listen-ID des Clients, dessen Inhaber
   diese Person ist – die Zeile, also die Hardware, nie den PC-Namen: ein
   umbenanntes Gerät behält seinen Inhaber, ein neues Gerät mit dem Namen
   eines alten erbt ihn nicht. Höchstens einer je Person, höchstens eine
   Person je Client, und ausschliesslich von Hand gepflegt: SCCM meldet zwar
   ein Primärgerät, der Abgleich schreibt das Feld aber nie. Es zeigt immer
   auf die Liste «ADMIN-Clients»; EDU-Clients haben bewusst keinen Inhaber.

   Bearbeitbar sind genau «AdminClientId», «Bemerkung», «Verlauf» und die
   Programmspalten mit Stufe 0 oder 1. Alles aus dem Active Directory oder
   aus SCCM ist schreibgeschützt. Programme der Stufe 2 stammen aus einer
   AD-Gruppe; geschrieben werden nur «0» und «1», nie «2». Benutzer werden
   weder angelegt noch gelöscht; das macht der AD-Abgleich.

   Gebaut wird nur über UI.* (bausteine.js), Rahmen.* (rahmen.js), F.*
   (fenster.js) und Bewegung.*. Wichtig für Fokus und Bewegung: Schalter,
   «Nur aktive» und die Suche ändern die Berechtigungen AN ORT UND STELLE
   (schalter.setzen, textSetzen; Zeilen gleiten über Bewegung.umordnen) –
   der Bereich wird dafür nie neu gebaut, damit der Übergang des Schalters
   spielt und der Fokus bleibt. Neu gezeichnet (F.zeichneBereich) wird
   nur nach Speichern, Verwerfen und Nachladen, und zwar still: der
   Bestand wird abgeglichen (Zeilen, Karten und Kacheln tragen data-ds-key),
   Fokus und Rollpositionen bleiben, kein Auftritt spielt, Kennzahlen
   zählen vom gezeigten Wert.

   Die Bauer der Bereiche suchen in ihrem Behälter, nicht im Dokument (er
   hängt beim Bauen nicht unbedingt schon in der Seite). Was die Seite
   über das Zeichnen hinaus festhält (die Programmzeilen in «rechte»),
   verbindet nachZeichnen danach mit den gezeigten Knoten. Knöpfe lesen
   den Stand beim Klick, nicht beim Bauen: ein abgeglichener Knopf behält
   seinen ersten Zuhörer.

   Kein innerHTML mit Daten: jeder Wert geht über textContent. */

"use strict";

(function () {

/* ==================================================================
   1. Parameter und Spaltenwissen
   ================================================================== */

const ABFRAGE = new URLSearchParams(location.search);
const elementId = ABFRAGE.get("id");
const mockModus = UI.adresse.mock();

const SPALTE = {};
for (const s of SPALTEN_BENUTZER) SPALTE[s.i] = s;

/* Die Felder, die in der Übersicht als AD-Angaben erscheinen. */
const AD_SPALTEN = SPALTEN_BENUTZER.filter(s => s.q === "ad");

/* Höchstens so viele Treffer der Gerätesuche; mehr hilft niemandem. */
const TREFFER_HOECHSTENS = 40;


/* ==================================================================
   2. Gerüst und Zustand
   ================================================================== */

const F = Fenster.erstellen("b", {
  liste: "benutzer",
  neuLaden: function () { neuLaden(); },
  nachladen: function () { return nachladenStill(); }
});

let alleBenutzer = [];
let alleClients = [];       // Liste «ADMIN-Clients», angereichert
let pSpalten = [];          // Programmspalten aus der Liste «Software»
let pSpalte = {};           // id -> Spalte
let kategorien = [];        // Reihenfolge der Kategorien

let zeile = null;           // die Zeile dieser Seite (angereichert)

/* Der Entwurf: geänderte, noch nicht gespeicherte Felder (fenster.js). */
const entwurf = F.entwurf(function () { return zeile; }, { beiAenderung: nachAenderung });

/* Zustände innerhalb der Bereiche; sie überleben jedes Neuzeichnen. */
let geraeteSuche = "";
let rechteSuche = "";
let nurAktive = false;

/* Die Programmzeilen des gezeigten Bereichs «Berechtigungen», damit
   Schalter, Zähler und Filter an Ort und Stelle nachgeführt werden. */
let rechte = null;

let aktiverBereich = "uebersicht";

const BEREICHE = [
  { k: "uebersicht",     d: "Übersicht",      sinnbild: "uebersicht", f: bereichUebersicht },
  { k: "geraet",         d: "Gerät",          sinnbild: "laptop",     f: bereichGeraet },
  { k: "berechtigungen", d: "Berechtigungen", sinnbild: "schluessel", f: bereichBerechtigungen },
  { k: "bemerkung",      d: "Bemerkung",      sinnbild: "dateiText",  f: bereichBemerkung }
];

/* Jede Änderung am Entwurf: Speicherleiste und Zähler nachführen – nie den
   Bereich neu bauen (sonst spränge der Fokus und kein Schalter glitte). */
function nachAenderung() {
  speicherleisteZeichnen();
  Rahmen.zahl("berechtigungen", zeile ? rechteZaehlen().aktiv : null);
}

function speicherleisteZeichnen() {
  F.speicherleisteZeichnen({ anzahl: entwurf.anzahl() });
}

function navZeichnen() {
  F.navZeichnen(BEREICHE, aktiverBereich, bereichWechseln, {
    zusatz: function (b) {
      return b.k === "berechtigungen" && zeile ? rechteZaehlen().aktiv : null;
    }
  });
}

/* Still neu zeichnen: Fokus, Schreibmarke und Rollen bleiben, die
   Kennzahlen zählen vom gezeigten Wert; danach nachZeichnen. */
function zeichneBereich() {
  rechte = null;
  Bewegung.kennzahlenStill(UI.$("b-bereich"), function () {
    aktiverBereich = F.zeichneBereich(BEREICHE, aktiverBereich);
  });
  nachZeichnen();
}

/* Bereichswechsel mit Fade-through und Staffelung (replaceState: kein
   Verlaufseintrag je Bereich). */
function bereichWechseln(schluessel) {
  if (!zeile) return;
  // Derselbe Bereich bleibt stehen (F.bereichWechseln baut ihn nicht neu).
  if (schluessel !== aktiverBereich) rechte = null;
  aktiverBereich = schluessel;
  F.bereichWechseln(BEREICHE, schluessel).then(nachZeichnen);
}

/* Nach jedem Zeichnen: «rechte» hält Knoten aus dem Bau. Ein still
   abgeglichener Bereich zeigt aber die alten, gepatchten Knoten weiter;
   rechteVerbinden tauscht darum jede Zeile und Karte gegen die gezeigte
   (über data-ds-key) und bringt Schalter, Zähler und Filter auf den Stand
   des Entwurfs. Wurde frisch gebaut, ist beides dasselbe. */
function nachZeichnen() {
  if (rechte) rechteVerbinden();
}

/* Den Fokus gezielt auf ein Element legen, das nach dem Neuzeichnen an
   die Stelle des verschwundenen getreten ist. */
function fokusAuf(selektor) {
  const k = document.querySelector(selektor);
  if (k && k.focus) k.focus({ preventScroll: false });
  return k;
}

/* Ein Knoten mit Schlüssel aus dem Bau → der gezeigte mit demselben
   Schlüssel (sonst er selbst). */
function gezeigt(knotenBau, wurzel) {
  if (!knotenBau || knotenBau.isConnected || !wurzel) return knotenBau;
  const s = knotenBau.getAttribute("data-ds-key");
  return (s && wurzel.querySelector('[data-ds-key="' + CSS.escape(s) + '"]')) || knotenBau;
}

function geschluesselt(knotenBau, schluessel) {
  knotenBau.setAttribute("data-ds-key", schluessel);
  return knotenBau;
}

/* Eine Kennzahl als Kachel mit Schlüssel: beim ersten Zeigen zählt sie
   von 0 hoch (Bewegung.auftritt), nach einem stillen Neuzeichnen vom
   gezeigten Wert zum neuen (Bewegung.kennzahlenStill in zeichneBereich). */
function kennzahl(schluessel, zahl, optionen) {
  return UI.kachel(Object.assign({}, optionen, { wert: UI.zahlText(zahl), zahl: zahl, schluessel: schluessel }));
}


/* ==================================================================
   3. Auswertung
   ================================================================== */

/* Stufe eines Programms unter Berücksichtigung des Entwurfs. */
function programmStufe(id) {
  return Modell.stufe(entwurf.wert(id));
}

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

/* Die eingetragene Listen-ID (Entwurf eingerechnet) als Text, sonst "". */
function geraetIdWert() { return Modell.geraetId(entwurf.wert("AdminClientId")); }

/* Das Gerät, dessen Inhaber diese Person ist, oder null – gefunden über
   die Listen-ID, nie über den Namen. */
function inhaberGeraet() {
  const id = geraetIdWert();
  if (!id) return null;
  return alleClients.filter(c => String(c.id) === id)[0] || null;
}

/* Eine Listen-ID ist eingetragen, die Zeile gibt es aber nicht mehr
   (Gerät gelöscht). */
function geraetFehlt() { return !!geraetIdWert() && !inhaberGeraet(); }

function primaerName() {
  return UI.text(zeile ? zeile.SCCMPrimaerGeraet : "").trim();
}

/* Das SCCM-Primärgerät als Zeile der Liste «ADMIN-Clients», oder null.
   Nur ein ADMIN-Client kann einen Inhaber haben:
   meldet SCCM einen EDU-Client oder einen Namen, den die Liste nicht
   kennt, gibt es nichts zu übernehmen. SCCM meldet nur einen Namen: bei
   gleichnamigen Geräten gilt das bevorzugte, wie in Modell.anreichern. */
function primaerGeraet() {
  const name = primaerName();
  if (!name) return null;
  const k = Modell.schluessel(name);
  return Modell.bevorzugtesGeraet(alleClients.filter(c => Modell.schluessel(c.Title) === k));
}

/* Weicht das SCCM-Primärgerät vom Gerät dieser Person ab – und ist es ein
   ADMIN-Client, also überhaupt als Inhaber-Gerät denkbar? Der Entwurf
   zählt mit, damit der Hinweis verschwindet, sobald es korrigiert ist.
   SCCM bleibt Hinweisgeber: übernommen wird nur auf Klick. Verglichen
   werden Zeilen: ist die Person noch Inhaber des archivierten Vorgängers
   gleichen Namens, weicht das neue Gerät ab und lässt sich übernehmen. */
function primaerAbweichung() {
  const p = primaerGeraet();
  return !!p && String(p.id) !== geraetIdWert();
}

/* Meldet SCCM ein Primärgerät, das kein ADMIN-Client ist (meist ein
   EDU-Client), sagt die Seite das nur neutral: keine Warnung, kein
   «Übernehmen». */
function primaerAusserhalb() {
  return !!primaerName() && !primaerGeraet();
}

function primaerIstEdu() { return Modell.clientListe(primaerName()) === "edu"; }

/* Die übrigen Personen, die dasselbe Gerät tragen – ein Gerät hat genau
   einen Inhaber; kommt hier etwas zurück, ist das ein Datenfehler. */
function andereBenutzerVon(clientZeile) {
  return (clientZeile.__inhaberAlle || [])
    .filter(b => String(b.id) !== String(zeile.id))
    .map(b => b.__name);
}

/* Was am Gerät dieser Person zu klären ist – für den Hinweis der Übersicht. */
function geraetGruende() {
  const gruende = [];
  if (primaerAbweichung()) gruende.push("SCCM meldet ein anderes Primärgerät als hier eingetragen.");
  if (geraetFehlt()) gruende.push("Das eingetragene Gerät gibt es in der Liste «ADMIN-Clients» nicht mehr.");
  const geraet = inhaberGeraet();
  if (geraet && geraet.__archiviert) gruende.push("«" + geraet.Title + "» ist archiviert.");
  const andere = geraet ? andereBenutzerVon(geraet) : [];
  if (andere.length) {
    gruende.push("«" + geraet.Title + "» ist auch bei «" + andere.join("», «") + "» eingetragen.");
  }
  return gruende;
}


/* ==================================================================
   4. Kleine Bausteine dieser Seite (nur aus UI.* zusammengesetzt)
   ================================================================== */

/* Status eines Geräts als Chip – nur, wenn es auffällt: «Aktiv» ist der
   Normalfall und braucht keine Auszeichnung. */
function geraetStatus(c) {
  const s = Modell.status(c && c.Status);
  if (s === "Archiviert") {
    return UI.status("Archiviert", "neutral", { sinnbild: "archiv" });
  }
  if (s === "Lager") {
    return UI.status("Im Lager", "neutral", { sinnbild: "lager" });
  }
  return null;
}

/* Link auf das Gerät (geöffnet über die Listen-ID, nie über den Namen:
   Namen sind nicht eindeutig), daneben sein Status, falls er auffällt. */
function geraetVerweis(c, fokus) {
  const a = UI.el("a", "name-link", c.Title);
  a.href = UI.adresse.client("admin", c.id);
  a.setAttribute("data-fokus", fokus);
  UI.tipp(a, "Listen-ID " + c.id + " – ADMIN-Client öffnen");
  const status = geraetStatus(c);
  return status ? UI.chips([a, status]) : a;
}

/* ==================================================================
   5. Übersicht
   ================================================================== */

function bereichUebersicht(ziel) {
  const zahlen = rechteZaehlen();
  const stapel = UI.el("div", "ds-stack");

  /* Kennzahlen: die Zahl wird nie gefärbt. Ein Klick führt zu den
     Berechtigungen, wo sich die Zahlen ändern lassen. */
  const zuRechten = function () { bereichWechseln("berechtigungen"); };
  const kachel = function (fokus, zahl, o) {
    return kennzahl(fokus, zahl, Object.assign({ beiKlick: zuRechten, fokus: fokus }, o));
  };
  const kacheln = UI.kacheln([
    kachel("kachel-aktiv", zahlen.aktiv, { text: "Berechtigungen aktiv",
      unter: "von " + UI.zahlText(zahlen.gesamt) + " Programmen" }),
    kachel("kachel-manuell", zahlen.manuell, { text: "Von Hand gesetzt", unter: "umschaltbar" }),
    kachel("kachel-ad", zahlen.ausAd, { text: "Aus AD-Gruppen", unter: "gesperrt" })
  ]);
  kacheln.classList.add("b-kennzahlen");
  stapel.appendChild(kacheln);

  /* Was zu klären ist, steht hier nur als Hinweis (alle Gründe in einem
     Banner); geklärt wird im Bereich «Gerät». */
  const gruende = geraetGruende();
  if (gruende.length) {
    const knopf = UI.knopf({ text: "Im Bereich «Gerät» klären", variante: "leise",
      beiKlick: function () { bereichWechseln("geraet"); }, fokus: "banner-geraet" });
    stapel.appendChild(geschluesselt(UI.banner({ ton: "warnung", text: gruende.join(" "), knopf: knopf }), "banner-geraet"));
  }

  const raster = UI.el("div", "karten");
  raster.appendChild(geschluesselt(geraetKarteKurz(), "karte-geraet"));
  raster.appendChild(geschluesselt(telefonKarte(), "karte-telefon"));
  const kamera = kameraKarte();
  if (kamera) raster.appendChild(geschluesselt(kamera, "karte-kamera"));
  stapel.appendChild(raster);

  /* AD-Felder, alle schreibgeschützt. Das sagt die Karte einmal in ihrem
     Text; ein Schloss an jeder Zeile wäre nur Rauschen. Schlösser stehen
     nur dort, wo gesperrte und änderbare Angaben gemischt sind (Karte
     «Gerät»), wie auf der Geräteseite. */
  const kAd = geschluesselt(UI.karte({ titel: "Angaben aus dem Active Directory",
    unter: "Vom Abgleich gesetzt und hier nicht änderbar." }), "karte-ad");
  kAd.inhalt.appendChild(UI.datenzeilen(AD_SPALTEN.map(function (s) {
    const roh = zeile[s.i];
    const angezeigt = s.t === "DateTime" ? UI.zeitText(roh) : UI.text(roh);
    return UI.feldZeile(s.d, angezeigt);
  })));
  stapel.appendChild(kAd);

  ziel.appendChild(stapel);
}

/* Gerät in der Übersicht: nur lesen, geändert wird im Bereich «Gerät». */
function geraetKarteKurz() {
  const zumGeraet = UI.knopf({ text: "Ändern", variante: "leise", sinnbild: "bearbeiten",
    beiKlick: function () { bereichWechseln("geraet"); }, fokus: "uebersicht-geraet-aendern" });
  const k = UI.karte({ titel: "Gerät", aktionen: [zumGeraet] });

  const geraet = inhaberGeraet();
  let wert;
  if (geraet) wert = geraetVerweis(geraet, "uebersicht-geraet");
  else if (geraetFehlt()) wert = UI.status("Gerät fehlt in der Liste", "warnung", { titel: "Listen-ID " + geraetIdWert() });
  else wert = UI.el("span", "t-leise", "Kein Gerät");
  k.inhalt.appendChild(UI.datenzeilen([
    UI.feldZeile("Inhaber von", wert),
    primaerZeile()
  ]));
  return k;
}

/* «Primärgerät (SCCM)»: gesperrt (SCCM meldet es), neben dem Namen ein
   neutraler Zusatz, wenn es kein ADMIN-Client ist – dann ist die
   Abweichung kein Fehler, sondern erklärt sich. */
function primaerZeile() {
  const zusatz = primaerAusserhalb()
    ? (primaerIstEdu() ? "EDU-Client" : "nicht in der Liste «ADMIN-Clients»")
    : "";
  return UI.feldZeile("Primärgerät (SCCM)", primaerName(), { gesperrt: true, neben: zusatz });
}

/* Die Telefonnummern dieser Person aus der Liste «Telefonnummern» – live
   über das AD-Feld «Telefon» oder die Spalte «Benutzer» (Login) der
   Telefonliste zugeordnet (Modell.telefoneAnreichern). */
function telefonKarte() {
  const k = UI.karte({ titel: "Telefon" });
  const nummern = zeile.__telefone || [];
  if (!nummern.length) {
    const imAd = UI.text(zeile.Telefon).trim();
    /* Eine Zeile der Telefonliste braucht immer eine Kurzwahl (ihr
       Schlüssel). «Nummer erfassen» gibt es darum nur für eine Nummer aus
       dem Hausblock; die Telefonseite (?neu=1&benutzer=<Listen-ID>)
       füllt Kurzwahl, Nummer und Name aus dieser Person vor – in der
       Adresse steht nur die ID. Eine Mobil- oder Fremdnummer hat keine
       Kurzwahl – dort wäre der Knopf eine Sackgasse. */
    const imHausblock = !!imAd && !!Modell.telefonKurzwahl(imAd);
    let text = "Im AD ist keine Nummer hinterlegt.";
    if (imHausblock) text = "Im AD steht «" + imAd + "», in der Telefonliste fehlt dazu eine Zeile.";
    else if (imAd) {
      text = "Im AD steht «" + imAd + "». Die Telefonliste führt nur Nummern mit Kurzwahl.";
    }
    k.inhalt.appendChild(UI.leerzustand({
      sinnbild: "telefon",
      titel: imAd ? "Nicht in der Telefonliste" : "Keine Telefonnummer",
      text: text,
      aktion: imHausblock ? UI.knopf({ text: "Nummer erfassen", variante: "tonal", sinnbild: "plus",
        href: UI.adresse.telefon(null, { neu: true, benutzer: zeile.id }), fokus: "telefon-erfassen" }) : null
    }));
    return k;
  }
  k.inhalt.appendChild(UI.zeilenliste(nummern.map(function (t) {
    const status = Modell.telefonStatus(t.Status);
    const z = UI.listenZeile({
      titel: t.__nummer || ("Kurzwahl " + (t.__kurzwahl || t.Title || "")),
      unter: [t.__kurzwahl ? "Kurzwahl " + t.__kurzwahl : "", UI.text(t.Typ).trim(), UI.text(t.Apparat).trim()],
      href: UI.adresse.telefon(t.id),
      sinnbild: "telefon",
      status: status === "Frei" ? UI.status("Frei", "neutral", { sinnbild: "checkKreis" })
        : (status === "Inaktiv" ? UI.status("Inaktiv", "neutral", { sinnbild: "aus" }) : null),
      fokus: "telefon-" + t.id
    });
    return geschluesselt(z, "telefon-" + t.id);
  })));
  return k;
}


/* Videoüberwachung: die Rollen aus Milestone, die diese Person über ihre
   AD-Gruppen hat (der Abgleich löst sie rekursiv auf, Modell.kamerasAnreichern).
   Ohne Liste «Kamera-Rollen» keine Karte; ohne Rolle ein leiser Leerzustand. */
let kameraRollenDa = false;

function kameraKarte() {
  if (!kameraRollenDa) return null;
  const rollen = zeile.__kameraRollen || [];
  const k = UI.karte({ titel: "Videoüberwachung",
    unter: rollen.length ? "Sieht " + UI.zahlText(zeile.__kameraAnzahl) + (zeile.__kameraAnzahl === 1 ? " Kamera" : " Kameras") + " in Milestone." : "" });
  if (!rollen.length) {
    k.inhalt.appendChild(UI.leerzustand({ sinnbild: "kamera", titel: "Kein Zugriff auf Kameras",
      text: "Die Person hat in Milestone keine Rolle." }));
    return k;
  }
  k.inhalt.appendChild(UI.zeilenliste(rollen.map(function (r) {
    return geschluesselt(UI.listenZeile({
      titel: String(r.Title || "").trim() || "(ohne Namen)",
      unter: [r.__rechte.join(", "), UI.zahlText(r.__kameras.length) + (r.__kameras.length === 1 ? " Kamera" : " Kameras")],
      href: UI.adresse.kamerarolle(r.id),
      sinnbild: "schild",
      fokus: "kamerarolle-" + r.id
    }), "kamerarolle-" + r.id);
  })));
  return k;
}


/* ==================================================================
   6. Gerät
   ================================================================== */

/* Nach einer Wahl: Bereich still neu, dann zeigt die Karte oben das
   Ergebnis (aufdecken: eine Handlung der Person) und der Fokus steht dort,
   wo es weitergeht. «geraet» ist die Clientzeile oder null (Inhaberschaft
   aufheben). Eingetragen wird ihre Listen-ID. */
function inhaberschaftSetzen(geraet, fokusSelektor) {
  entwurf.setzeWert("AdminClientId", geraet ? Number(geraet.id) : null);
  zeichneBereich();
  Bewegung.aufdecken(UI.$("b-geraet-ergebnis"));
  if (fokusSelektor) fokusAuf(fokusSelektor);
}

function inhaberWerden(c) {
  inhaberschaftSetzen(c, "[data-fokus=\"treffer-" + CSS.escape(String(c.id)) + "\"]");
}

function bereichGeraet(ziel) {
  const stapel = UI.el("div", "ds-stack");
  stapel.appendChild(geschluesselt(geraetKarte(), "karte-inhaber"));
  stapel.appendChild(geschluesselt(sucheKarte(), "karte-suche"));
  ziel.appendChild(stapel);
}

function geraetKarte() {
  const geraet = inhaberGeraet();
  const id = geraetIdWert();

  const aktionen = [];
  if (id) {
    const aufheben = UI.knopf({ text: "Inhaberschaft aufheben", variante: "leise", sinnbild: "schliessen",
      beiKlick: function () { inhaberschaftSetzen(null, "[data-fokus=\"geraet-suchen\"]"); }, fokus: "inhaberschaft-aufheben" });
    aktionen.push(aufheben);
  }
  const k = UI.karte({
    titel: "Gerät dieser Person",
    aktionen: aktionen
  });

  /* Der Teil, der sich mit einer Wahl ändert (wird aufgedeckt). */
  const ergebnis = UI.el("div", "ds-stack");
  ergebnis.id = "b-geraet-ergebnis";

  if (!id) {
    ergebnis.appendChild(UI.leerzustand({
      sinnbild: "laptop",
      titel: "Kein Gerät",
      aktion: { text: "Gerät suchen", sinnbild: "suche", fokus: "geraet-suchen",
        beiKlick: function () { fokusAuf("#b-suche-geraet"); } }
    }));
  } else if (geraet) {
    const zeilen = [
      UI.feldZeile("Inhaber von", geraetVerweis(geraet, "geraet-aktuell")),
      UI.feldGesperrt("Modell", geraet.SCCM_Model),
      UI.feldGesperrt("Gebäude / Stock", geraet.GebaeudeStock, "Auf der Geräteseite änderbar.")
    ];
    const andere = andereBenutzerVon(geraet);
    if (andere.length) {
      zeilen.push(UI.feldZeile("Ebenfalls eingetragen bei",
        UI.status(andere.join(", "), "gefahr", { titel: "Ein Gerät hat genau einen Inhaber. Auf der Geräteseite bereinigen." })));
    }
    ergebnis.appendChild(UI.datenzeilen(zeilen));
    if (geraet.__archiviert) {
      ergebnis.appendChild(UI.banner({
        ton: "warnung",
        titel: "«" + geraet.Title + "» ist archiviert.",
        text: "Das Nachfolgegerät unten zuweisen oder die Inhaberschaft aufheben."
      }));
    }
  } else {
    ergebnis.appendChild(UI.banner({
      ton: "warnung",
      titel: "Das eingetragene Gerät gibt es nicht mehr.",
      text: "Listen-ID " + id + " fehlt in der Liste «ADMIN-Clients»."
    }));
  }

  /* Vorschlag aus SCCM. Nur ein Vorschlag: übernommen wird auf Klick, der
     Abgleich selbst schreibt die Inhaberschaft nie. Übernommen wird die
     Zeile, die der gemeldete Name meint (Modell.bevorzugtesGeraet). Ist das
     Primärgerät kein ADMIN-Client (EDU-Clients haben keinen Inhaber), steht
     nur ein ruhiger Hinweis. */
  if (primaerAbweichung()) {
    const primaer = primaerGeraet();
    // Das Primärgerät beim Klick, nicht beim Bauen (der Knopf bleibt beim Abgleichen stehen).
    const uebernehmen = UI.knopf({ text: "Übernehmen", variante: "leise", beiKlick: function () {
      const jetzt = primaerGeraet();
      if (jetzt) inhaberschaftSetzen(jetzt, "[data-fokus=\"geraet-aktuell\"]");
    }, fokus: "sccm-uebernehmen" });
    ergebnis.appendChild(UI.banner({
      ton: "info",
      text: "SCCM meldet «" + primaer.Title + "» als Primärgerät.",
      knopf: uebernehmen
    }));
  } else if (primaerAusserhalb()) {
    ergebnis.appendChild(UI.hinweis(primaerIstEdu()
      ? "SCCM meldet den EDU-Client «" + primaerName() + "» als Primärgerät. EDU-Clients haben keinen Inhaber."
      : "SCCM meldet «" + primaerName() + "» als Primärgerät. Dieses Gerät fehlt in der Liste «ADMIN-Clients»."));
  }

  k.inhalt.appendChild(ergebnis);
  return k;
}

function sucheKarte() {
  const k = UI.karte({
    titel: "Gerät suchen",
    unter: "Ist ein Gerät schon vergeben, den Inhaber auf der Geräteseite wechseln."
  });
  const suche = UI.suchfeld({
    id: "b-suche-geraet",
    platzhalter: "PC-Name, Modell, Seriennummer …",
    label: "Gerät suchen",
    wert: geraeteSuche,
    beiEingabe: function (w) { geraeteSuche = w; trefferZeichnen(); }
  });
  const liste = UI.el("div");
  liste.id = "b-treffer";
  k.inhalt.appendChild(suche);
  k.inhalt.appendChild(liste);
  trefferZeichnen(liste);
  return k;
}

/* Nur die Trefferliste neu: das Suchfeld (mit Fokus und Schreibmarke)
   bleibt unberührt. Beim Tippen gleichen die Zeilen ab und gleiten an
   ihren Platz (Bewegung.umordnen; Schlüssel: die Listen-ID), neue blenden
   ein; beim Bauen des Bereichs (behaelter) steht die Liste ruhig. */
function trefferZeichnen(behaelter) {
  const ziel = behaelter || UI.$("b-treffer");
  if (!ziel) return;
  const kinder = trefferKinder();
  if (behaelter || !ziel.isConnected) {
    UI.abgleichen(ziel, kinder);
    return;
  }
  Bewegung.umordnen(ziel, function (o) { UI.abgleichen(ziel, kinder, o); },
    { eintraege: ".listen-zeile, .ds-empty" });
}

function trefferKinder() {
  const begriff = geraeteSuche.trim().toLowerCase();
  if (!begriff) return [];

  /* Archivierte zuletzt: auffindbar, aber selten gemeint. */
  const treffer = alleClients.filter(c => String(c.__such || "").indexOf(begriff) > -1)
    .sort((a, b) => (a.__archiviert ? 1 : 0) - (b.__archiviert ? 1 : 0) || Hilfe.vergleiche(a.Title, b.Title));

  if (!treffer.length) {
    return [geschluesselt(UI.leerzustand({
      sinnbild: "suche",
      titel: "Keine Treffer",
      text: "Kein ADMIN-Client passt zu «" + geraeteSuche.trim() + "».",
      aktion: { text: "Suche zurücksetzen", fokus: "suche-zuruecksetzen", beiKlick: function () {
        geraeteSuche = "";
        const feld = UI.$("b-suche-geraet");
        if (feld) { feld.value = ""; feld.focus(); }
        trefferZeichnen();
      } }
    }), "treffer-leer")];
  }

  const gewaehlt = inhaberGeraet();
  const kinder = [geschluesselt(UI.zeilenliste(treffer.slice(0, TREFFER_HOECHSTENS).map(trefferZeile.bind(null, gewaehlt))),
    "treffer-liste")];
  if (treffer.length > TREFFER_HOECHSTENS) {
    kinder.push(geschluesselt(UI.hinweis("und " + UI.zahlText(treffer.length - TREFFER_HOECHSTENS)
      + " weitere Treffer – Suche verfeinern."), "treffer-mehr"));
  }
  return kinder;
}

function trefferZeile(gewaehlt, c) {
  /* «Gerät dieser Person» steht nur an der Zeile mit der eingetragenen
     Listen-ID – ein gleichnamiges Gerät ist ein anderes Gerät. Es ist der
     gewollte Zustand, darum ein Teil der Unterzeile und kein Chip. */
  const istAktuell = !!gewaehlt && String(gewaehlt.id) === String(c.id);
  const andere = andereBenutzerVon(c);
  const teile = [istAktuell ? "Gerät dieser Person" : "", UI.text(c.SCCM_Model), UI.text(c.GebaeudeStock)];
  // Gleichnamige Geräte unterscheidet erst die Hardware.
  if (c.__namensDublette && UI.text(c.SCCM_SerialNumber).trim()) teile.push("Seriennummer " + UI.text(c.SCCM_SerialNumber).trim());
  if (andere.length) teile.push("Inhaber: " + andere.join(", "));
  const aktionen = istAktuell ? [] : [UI.knopf({ text: "Zuweisen", variante: "leise", klein: true,
    titel: andere.length
      ? "Gehört schon «" + andere.join("», «") + "». Danach hat das Gerät mehr als einen Inhaber."
      : undefined,
    beiKlick: function () { inhaberWerden(c); }, fokus: "inhaber-" + c.id })];
  // Der Name allein ist nicht eindeutig: die Listen-ID steht im Tooltip.
  const tipp = "Listen-ID " + c.id + " – ADMIN-Client öffnen";
  const z = UI.listenZeile({
    titel: c.Title,
    unter: teile,
    href: UI.adresse.client("admin", c.id),
    sinnbild: "laptop",
    aktuell: istAktuell,
    status: geraetStatus(c),
    aktionen: aktionen,
    titelTipp: istAktuell ? tipp : undefined,
    // Ganze Zeile als Link (ohne Aktion) bzw. der Titel-Link.
    fokus: istAktuell ? "treffer-" + c.id : "treffer-link-" + c.id
  });
  if (!istAktuell) {
    const link = z.querySelector(".listen-zeile-titel a");
    if (link) UI.tipp(link, tipp);
  }
  return geschluesselt(z, "treffer-" + c.id);
}


/* ==================================================================
   7. Berechtigungen
   ================================================================== */

function passtZurSuche(spalte, begriff) {
  if (!begriff) return true;
  const heuhaufen = (spalte.d + " " + spalte.i + " " + (spalte.adGruppen || []).join(" ")).toLowerCase();
  return heuhaufen.indexOf(begriff) > -1;
}

function bereichBerechtigungen(ziel) {
  rechte = null;

  if (!pSpalten.length) {
    ziel.appendChild(UI.leerzustand({
      sinnbild: "software",
      titel: "Noch keine Programme",
      text: "Programme kommen aus der Liste «Software».",
      aktion: UI.knopf({ text: "Zur Software-Liste", variante: "tonal", href: UI.adresse.liste("software") })
    }));
    return;
  }

  /* Werkzeugleiste: Suche · «Nur aktive» · Zahl. Beides filtert an Ort und
     Stelle (filtern) – das Suchfeld behält Fokus und Schreibmarke. */
  const suche = UI.suchfeld({
    id: "b-suche-rechte",
    platzhalter: "Programm oder AD-Gruppe",
    label: "Programme durchsuchen",
    wert: rechteSuche,
    beiEingabe: function (w) { rechteSuche = w; filtern(true); }
  });
  const nurAktiveChip = UI.chip({
    text: "Nur aktive",
    id: "b-nur-aktive",
    gewaehlt: nurAktive,
    beiKlick: function (an) { nurAktive = an; filtern(true); }
  });
  const anzahl = UI.el("p", "anzahl");
  anzahl.id = "b-rechte-anzahl";
  // b-rechte-leiste: auf schmaler Bahn nimmt die Suche eine eigene Zeile (benutzer.css).
  ziel.appendChild(UI.anhaengen(UI.el("div", "ds-action-bar b-rechte-leiste"), [suche, nurAktiveChip, anzahl]));

  // Nach Kategorie gruppiert, Reihenfolge aus der Spalte «Reihenfolge».
  const stapel = UI.el("div", "ds-stack");
  stapel.id = "b-rechte-stapel";
  const karten = [];
  for (const kategorie of kategorien) {
    const inKategorie = pSpalten.filter(s => s.g === kategorie);
    const aktiv = inKategorie.filter(s => programmStufe(s.i) > 0).length;
    const k = geschluesselt(UI.karte({ titel: kategorie, unter: aktiv + " von " + inKategorie.length + " aktiv" }),
      "kategorie-" + kategorie);
    const liste = UI.el("div", "b-programme");
    k.inhalt.appendChild(liste);
    karten.push({ karte: k, liste: liste, spalten: inKategorie, zeilen: inKategorie.map(programmZeile) });
    stapel.appendChild(k);
  }
  ziel.appendChild(stapel);

  const leer = UI.leerzustand({
    sinnbild: "suche",
    titel: "Keine Treffer",
    text: "Kein Programm passt zu Suche und Filter.",
    aktion: { text: "Filter zurücksetzen", beiKlick: filterZuruecksetzen, fokus: "rechte-filter-zuruecksetzen" }
  });
  leer.id = "b-rechte-leer";
  ziel.appendChild(leer);

  rechte = { chip: nurAktiveChip, anzahl: anzahl, stapel: stapel, leer: leer, karten: karten, leerGezeigt: false };
  filtern(false);
  zaehlerNachfuehren();
}

/* Nach einem stillen Abgleich (nachZeichnen): jede Karte und Zeile in
   «rechte» durch die gezeigte ersetzen (data-ds-key bzw. id), dann
   Schalter, «Geändert» und Zähler auf den Entwurf bringen und ruhig
   filtern. Ausgefilterte Zeilen hängen nicht in der Seite – sie bleiben,
   wie sie gebaut wurden, bis der Filter sie zurückholt. */
function rechteVerbinden() {
  const wurzel = UI.$("b-bereich");
  if (!rechte || !wurzel || !wurzel.contains(UI.$("b-rechte-stapel"))) return;
  rechte.stapel = UI.$("b-rechte-stapel");
  rechte.anzahl = UI.$("b-rechte-anzahl") || rechte.anzahl;
  rechte.leer = UI.$("b-rechte-leer") || rechte.leer;
  const kaestchen = UI.$("b-nur-aktive");
  const chip = kaestchen ? kaestchen.closest(".ds-chip") : null;
  if (chip && chip.setzen) rechte.chip = chip;
  rechte.leerGezeigt = !rechte.leer.hidden;
  for (const k of rechte.karten) {
    k.karte = gezeigt(k.karte, wurzel);
    k.liste = k.karte.querySelector(".b-programme") || k.liste;
    k.zeilen = k.zeilen.map(function (z) { return gezeigt(z, wurzel); });
    for (const z of k.zeilen) {
      const stufe = programmStufe(z.spalte.i);
      z.schalter.setzen(stufe === 1, stufe === 2, stufe === 2 ? Modell.sperrHinweis(z.spalte) : undefined);
      zeileNachfuehren(z);
    }
  }
  filtern(false);
  zaehlerNachfuehren();
}

function alleZeilen() {
  return rechte ? [].concat.apply([], rechte.karten.map(function (k) { return k.zeilen; })) : [];
}

/* Eine Programmzeile. Der Schalter schaltet beim Klick (und mit der
   Leertaste) selbst um – sein Übergang spielt –, dann kommt der Wert in den
   Entwurf und nur die Zähler werden nachgeführt. Der Zuhörer hält sich an
   seine eigene Zeile (ev.currentTarget), nicht an einen Knoten aus dem Bau. */
function programmZeile(spalte) {
  const stufe = programmStufe(spalte.i);
  const gruppen = spalte.adGruppen || [];
  const s = UI.schalter({
    id: "b-recht-" + spalte.i,
    an: stufe === 1,
    gesperrt: stufe === 2,
    // Stufe 2 kommt aus einer AD-Gruppe: der Tooltip nennt die Gruppe.
    titel: stufe === 2 ? Modell.sperrHinweis(spalte) : undefined,
    beiWechsel: function (an, schalter) {
      // Geschrieben werden ausschliesslich «0» und «1».
      entwurf.setzeWert(spalte.i, an ? "1" : "0");
      const zeileJetzt = schalter && schalter.closest ? schalter.closest(".schalter-zeile") : null;
      if (zeileJetzt && zeileJetzt.geaendert) zeileNachfuehren(zeileJetzt);
      zaehlerNachfuehren();
    }, fokus: "recht-" + spalte.i
  });

  /* «Geändert» an Ort und Stelle (nie Farbe allein); verborgen, solange
     der Wert dem gespeicherten entspricht. Kein Normalfall: eine
     ungespeicherte Abweichung. */
  const geaendert = UI.status("Geändert", "neutral", { sinnbild: "bearbeiten" });
  geaendert.hidden = !entwurf.istGeaendert(spalte.i);

  const unter = gruppen.length
    ? (gruppen.length === 1 ? "AD-Gruppe «" + gruppen[0] + "»" : "AD-Gruppen «" + gruppen.join("», «") + "»")
    : (stufe === 2 ? "Vom Abgleich gesetzt" : "");
  const z = geschluesselt(UI.schalterZeile({ schalter: s, name: spalte.d, unter: unter, wort: true, zusatz: [geaendert] }),
    "recht-" + spalte.i);
  z.spalte = spalte;
  z.geaendert = geaendert;
  return z;
}

function zeileNachfuehren(z) {
  z.geaendert.hidden = !entwurf.istGeaendert(z.spalte.i);
}

/* Zähler an der Werkzeugleiste und an jeder Karte, an Ort und Stelle. */
function zaehlerNachfuehren() {
  if (!rechte) return;
  const zahlen = rechteZaehlen();
  UI.textSetzen(rechte.anzahl, UI.zahlText(zahlen.aktiv) + " von " + UI.zahlText(zahlen.gesamt) + " aktiv");
  for (const k of rechte.karten) {
    const aktiv = k.spalten.filter(s => programmStufe(s.i) > 0).length;
    if (k.karte.unter) UI.textSetzen(k.karte.unter, aktiv + " von " + k.spalten.length + " aktiv");
  }
}

/* Suche und «Nur aktive» wirken an Ort und Stelle: sichtbare Zeilen
   bleiben dieselben Knoten (Fokus und Schalterzustand bleiben), nur die
   nicht passenden fallen heraus (kinderAbgleichen statt hidden, damit
   :first-child und die Haarlinien stimmen). Auf eine Eingabe (bewegt)
   gleiten die übrigen Zeilen und Karten an ihren Platz
   (Bewegung.umordnen), der Leerzustand blendet ein bzw. aus. Ein
   Schalter, der gerade auf «aus» gesetzt wurde, verschwindet erst beim
   nächsten Filtern – er soll nicht unter dem Zeiger wegspringen. */
function filtern(bewegt) {
  if (!rechte) return;
  const begriff = rechteSuche.trim().toLowerCase();
  let gezeigtAnzahl = 0;
  const anwenden = function () {
    gezeigtAnzahl = 0;
    for (const k of rechte.karten) {
      const sichtbar = k.zeilen.filter(function (z) {
        if (nurAktive && programmStufe(z.spalte.i) === 0) return false;
        return passtZurSuche(z.spalte, begriff);
      });
      UI.kinderAbgleichen(k.liste, sichtbar);
      k.karte.hidden = !sichtbar.length;
      gezeigtAnzahl += sichtbar.length;
    }
  };
  if (bewegt && rechte.stapel.isConnected) {
    Bewegung.umordnen(rechte.stapel, anwenden, { eintraege: ".ds-card, .schalter-zeile" });
  } else {
    anwenden();
  }
  leerZeigen(gezeigtAnzahl === 0, bewegt);
}

function leerZeigen(zeigen, bewegt) {
  const leer = rechte.leer;
  if (!bewegt || !leer.isConnected) {
    rechte.leerGezeigt = zeigen;
    leer.hidden = !zeigen;
    return;
  }
  if (zeigen === rechte.leerGezeigt) return;
  rechte.leerGezeigt = zeigen;
  if (zeigen) Bewegung.eintreten(leer, "blenden");
  else Bewegung.austreten(leer, "", { dann: "verbergen" });
}

function filterZuruecksetzen() {
  rechteSuche = "";
  nurAktive = false;
  const feld = UI.$("b-suche-rechte");
  if (feld) feld.value = "";
  if (rechte && rechte.chip) rechte.chip.setzen(false);
  // Der Fokus geht vor dem Ausblenden des Leerzustands in die Suche.
  if (feld) feld.focus();
  filtern(true);
}

/* Verwerfen auf diesem Bereich: die Schalter gleiten zurück, statt neu
   gebaut zu werden. Danach wird neu gefiltert: unter «Nur aktive» kehrt
   ein wieder aktives Programm in die Liste zurück, ein nicht mehr aktives
   fällt heraus – sonst passten Liste und Zähler nicht zusammen. Sichtbare
   Zeilen bleiben dieselben Knoten, der Fokus bleibt. */
function rechteZuruecksetzen() {
  for (const z of alleZeilen()) {
    const stufe = programmStufe(z.spalte.i);
    z.schalter.setzen(stufe === 1, stufe === 2);
    zeileNachfuehren(z);
  }
  filtern(true);
  zaehlerNachfuehren();
}


/* ==================================================================
   8. Bemerkung
   ================================================================== */

function bereichBemerkung(ziel) {
  const stapel = UI.el("div", "ds-stack");

  const k = UI.karte({ titel: "Bemerkung" });
  /* Feld am Entwurf (F.feld): id «b-eingabe-Bemerkung», jede Eingabe in den
     Entwurf, Punkt «geändert» an Ort und Stelle – kein Neuzeichnen, sonst
     risse das Tippen ab. */
  k.inhalt.appendChild(UI.datenzeilen([
    F.feld("Bemerkung", { beschriftung: "Bemerkung", art: "textbereich", entwurf: entwurf,
      eingabe: { zeilen: 6 } })
  ]));
  stapel.appendChild(k);

  stapel.appendChild(verlaufEinbauen());
  ziel.appendChild(stapel);
}

/* Der Verlauf hängt am selben Entwurf wie alle Felder: verlauf.js meldet
   die fertige Zeichenkette, der Entwurf nimmt sie auf, «Speichern» schreibt
   sie. Die Karte (Titel, Zahl, «Neuer Eintrag») baut verlauf.js selbst. */
function verlaufEinbauen() {
  const huelle = UI.el("div", "b-verlauf");
  huelle.setAttribute("data-rolle", "verlauf");
  Verlauf.zeichnen(huelle, {
    schluessel: "benutzer",
    wert: entwurf.wert("Verlauf"),
    beiAenderung: function (json) { entwurf.setzeWert("Verlauf", json); },
    titel: "Verlauf"
  });
  return huelle;
}


/* ==================================================================
   9. Kopf, Zeichnen
   ================================================================== */

function kopfZeichnen() {
  if (!zeile) return;
  F.seitenkopf({
    titel: zeile.__name || zeile.Title || "Benutzer",
    unter: [UI.text(zeile.Title), UI.text(zeile.Abteilung), UI.text(zeile.Funktion)],
    /* Chips nur für das, was auffällt: ein aktives AD-Konto ist der Normalfall. */
    status: zeile.__adAktiv ? [] : [UI.status("AD-Konto deaktiviert", "gefahr")],
    aktionen: []
  });
}

function zeichnenAlles() {
  kopfZeichnen();
  navZeichnen();
  zeichneBereich();
  speicherleisteZeichnen();
}


/* ==================================================================
   10. Laden
   ================================================================== */

/* «still» lädt im Hintergrund nach, ohne Ladezustand: nach dem Speichern
   und beim automatischen Nachladen bleibt der Inhalt stehen. */
async function datenLaden(still) {
  let anzahlBenutzer = 0, anzahlClients = 0;
  function fortschritt() {
    if (!still) F.fortschritt("Benutzer " + UI.zahlText(anzahlBenutzer) + " · ADMIN-Clients " + UI.zahlText(anzahlClients));
  }
  if (!still) F.zeigeLaden(mockModus ? "Vorführdaten werden aufgebaut …" : "Daten werden aus SharePoint geladen …");

  /* Alles gleichzeitig. Telefon- und Software-Liste sind Beigabe: fehlt
     eine, bleibt die jeweilige Karte leer, statt die Seite scheitern zu
     lassen. Nur ADMIN-Clients: die Inhaberschaft zeigt nie auf EDU. */
  const [rohBenutzer, rohClients, rohSoftware, rohTelefone, rohKameras, rohRollen] = await Promise.all([
    Daten.benutzer(function (n) { anzahlBenutzer = n; fortschritt(); }),
    Daten.clients("admin", function (n) { anzahlClients = n; fortschritt(); }),
    Daten.software().catch(function () { return []; }),
    Daten.telefone().catch(function () { return []; }),
    Daten.kameras().catch(function () { return []; }),
    Daten.kameraRollen().catch(function () { return null; })
  ]);

  const ergebnis = Modell.anreichern(rohClients, rohBenutzer, rohSoftware || []);
  alleClients = ergebnis.clients;
  alleBenutzer = ergebnis.benutzer;
  /* Gebraucht wird nur die Nebenwirkung (__telefone an jeder Person); die
     Rückgabe { telefone, benutzer } ist keine Liste. */
  Modell.telefoneAnreichern(rohTelefone || [], alleBenutzer);
  /* Kamera-Rollen: nur die Nebenwirkung __kameraRollen an jeder Person.
     Fehlt die Liste oder hat der Abgleich noch keine Rolle geschrieben,
     gibt es keine Karte – «Kein Zugriff» wäre dann eine falsche Aussage. */
  kameraRollenDa = !!rohRollen && rohRollen.length > 0;
  Modell.kamerasAnreichern(rohKameras || [], rohRollen || [], alleBenutzer);
  pSpalten = ergebnis.programmSpalten;

  pSpalte = {};
  for (const s of pSpalten) pSpalte[s.i] = s;
  kategorien = Modell.programmKategorien(pSpalten);
}

function zeileWaehlen() {
  const treffer = alleBenutzer.filter(z => String(z.id) === String(elementId))[0];
  if (!treffer) {
    const fehler = new Error("In der Liste «Benutzer» gibt es keine Zeile mit der Listen-ID " + elementId + ".");
    fehler.nichtGefunden = true;
    throw fehler;
  }
  zeile = treffer;
}

/* Still nachladen und neu zeichnen (Speichern, F.beschaeftigt, Takt). */
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
  } catch (fehler) {
    ladefehlerZeigen(fehler);
  }
}

function ladefehlerZeigen(fehler) {
  F.ladefehler(fehler, { titel: "Benutzer nicht gefunden",
    hinweis: "Der AD-Abgleich entfernt Benutzer, die nicht mehr im Active Directory sind." });
}


/* ==================================================================
   11. Speichern und Verwerfen
   ================================================================== */

/* Werte so, wie Graph sie erwartet. Programmwerte sind immer «0» oder
   «1»; «2» schreibt diese Seite nie. Die Inhaberschaft geht als Zahl
   (Listen-ID), eine aufgehobene als null: Graph leert das Feld damit
   wirklich (wie auf der Geräteseite). */
function fuerGraph(feld, roh) {
  if (pSpalte[feld]) return Modell.stufe(roh) === 1 ? "1" : "0";
  if (feld === "AdminClientId") {
    const id = Modell.geraetId(roh);
    return id ? Number(id) : null;
  }
  return (roh === null || roh === undefined) ? "" : String(roh);
}

/* PC-Name zu einer Listen-ID, für den Verlauf der Person. */
function geraetName(id) {
  const c = id ? alleClients.filter(z => String(z.id) === id)[0] : null;
  return c ? String(c.Title || "").trim() : (id ? "Listen-ID " + id : "");
}

/* Sicherheitsnetz: nur bearbeitbare Felder dürfen hinaus. */
function darfSchreiben(feld) {
  if (pSpalte[feld]) return Modell.stufe(zeile[feld]) !== 2;
  return Modell.istBearbeitbar(SPALTE[feld]);
}

function speichern() {
  return F.speicherAblauf({
    anzahl: function () { return entwurf.anzahl(); },
    schreiben: async function () {
      const aenderungen = entwurf.aenderungen();
      const felder = {};
      for (const feld of Object.keys(aenderungen)) {
        if (darfSchreiben(feld)) felder[feld] = fuerGraph(feld, aenderungen[feld]);
      }
      /* Ein Gerätewechsel steht automatisch im Verlauf, mit den PC-Namen. */
      if (Object.prototype.hasOwnProperty.call(felder, "AdminClientId")) {
        const altId = Modell.geraetId(zeile.AdminClientId);
        const neuId = Modell.geraetId(felder.AdminClientId);
        const alt = geraetName(altId);
        const neu = geraetName(neuId);
        if (altId !== neuId) {
          // Gleicher Name, andere Zeile: das Nachfolgegerät eines ersetzten.
          const wechsel = alt === neu ? "Gerät gewechselt: " + neu + " (neues Gerät, gleicher Name)"
            : "Gerät gewechselt: " + alt + " → " + neu;
          const eintrag = neu ? (alt ? wechsel : "Gerät erhalten: " + neu) : "Gerät abgegeben: " + alt;
          felder.Verlauf = F.verlaufAnhaengen(entwurf.wert("Verlauf"), eintrag);
        }
      }
      const anzahl = entwurf.anzahl();
      if (Object.keys(felder).length) {
        const antwort = await Daten.speichern("benutzer", elementId, felder, zeile.__etag);
        // Den geschriebenen Stand samt neuem eTag übernehmen: scheitert das
        // Nachladen, zeichnet die Seite aus ihm, und der nächste
        // Speicherversuch meldet keinen falschen Konflikt (412).
        F.uebernehmen(zeile, felder, antwort);
        F.melden("benutzer-geaendert", elementId);
      }
      entwurf.leeren();
      return { anzahl: Object.keys(felder).length ? anzahl : 0 };
    },
    nachladen: function () { return nachladenStill(); },
    zeichnen: zeichnenAlles,
    erfolgText: function (e) {
      if (!e || !e.anzahl) return false;
      return e.anzahl === 1 ? "Änderung gespeichert." : e.anzahl + " Änderungen gespeichert.";
    }
  });
}

function verwerfen() {
  return F.verwerfen({ anzahl: entwurf.anzahl(), danach: function () {
    entwurf.leeren();
    // Auf den Berechtigungen gleiten die Schalter zurück, statt neu gebaut zu werden.
    if (aktiverBereich === "berechtigungen" && rechte) {
      rechteZuruecksetzen();
      kopfZeichnen();
      navZeichnen();
      speicherleisteZeichnen();
    } else {
      zeichnenAlles();
    }
  } });
}


/* ==================================================================
   12. Start
   ================================================================== */

async function start() {
  aktiverBereich = F.hashBereich(BEREICHE) || aktiverBereich;
  // Die Schublade steht sofort, der aktive Bereich ist schon markiert.
  navZeichnen();
  F.logoZeichnen("benutzer");
  F.bandZeichnen(undefined, function () {
    entwurf.leeren();
    F.melden("benutzer-geaendert", elementId);
    neuLaden();
  });

  try {
    if (!mockModus) {
      F.zeigeLaden("Anmeldung wird geprüft …");
      await Auth.anmeldungSicherstellen();
    }
    F.kontoZeigen();
    if (!elementId) {
      F.zeigeFehler("Kein Benutzer angegeben",
        "In der Adresse fehlt die Listen-ID, zum Beispiel benutzer.html?id=5.",
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
  beiHash: function (h) {
    if (h !== aktiverBereich && BEREICHE.some(b => b.k === h)) bereichWechseln(h);
  }
});

/* Kein Knopf «Neu laden»: ein ruhiger Takt holt den Stand still nach –
   nie mit ungespeicherten Änderungen (sie gingen verloren). Den Rest
   (Ebene offen, Fokus in einem Feld, verborgener Tab) prüft F.autoStarten. */
F.autoStarten(function () { return !!zeile && !entwurf.anzahl(); }, nachladenStill);

start();

})();

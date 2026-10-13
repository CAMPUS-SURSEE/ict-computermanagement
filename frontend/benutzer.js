/* benutzer.js — Benutzerseite des ICT-Inventars.

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
   (fenster.js) und Bewegung.*. Wichtig für Fokus und Bewegung (Fehler C2):
   Schalter, «Nur aktive» und die Suche ändern die Berechtigungen AN ORT UND
   STELLE (schalter.setzen, hidden, textSetzen) – der Bereich wird dafür
   nie neu gebaut, damit der Übergang des Schalters spielt und der Fokus
   bleibt. Neu gezeichnet (F.zeichneBereich) wird nur nach Speichern,
   Verwerfen und Nachladen; dann kommen Fokus und Rollpositionen über
   stabile ids bzw. data-fokus zurück, und nichts animiert.

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
   Bereich neu bauen (sonst springt der Fokus, Fehler C2). */
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

/* Neu zeichnen ohne Auftritt; Fokus, Schreibmarke und Rollen bleiben. */
function zeichneBereich() {
  rechte = null;
  aktiverBereich = F.zeichneBereich(BEREICHE, aktiverBereich);
}

/* Bereichswechsel mit Fade-through und Staffelung (replaceState, A4). */
function bereichWechseln(schluessel) {
  if (!zeile) return;
  aktiverBereich = schluessel;
  rechte = null;
  F.bereichWechseln(BEREICHE, schluessel);
}

/* Den Fokus gezielt auf ein Element legen, das nach dem Neuzeichnen an
   die Stelle des verschwundenen getreten ist. */
function fokusAuf(selektor) {
  const k = document.querySelector(selektor);
  if (k && k.focus) k.focus({ preventScroll: false });
  return k;
}


/* ==================================================================
   3. Auswertung
   ================================================================== */

function textWert(feld) { return entwurf.textWert(feld); }

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
  return UI.anhaengen(UI.el("span", "chips"), [a, geraetStatus(c)]);
}

/* ==================================================================
   5. Übersicht
   ================================================================== */

function bereichUebersicht(ziel) {
  const zahlen = rechteZaehlen();
  const stapel = UI.el("div", "stapel");

  /* Kennzahlen: die Zahl wird nie gefärbt. Ein Klick führt zu den
     Berechtigungen, wo sich die Zahlen ändern lassen. */
  const zuRechten = function () { bereichWechseln("berechtigungen"); };
  const kachel = function (o, fokus) {
    return UI.kachel(Object.assign({ beiKlick: zuRechten, fokus: fokus }, o));
  };
  const kennzahlen = UI.kacheln([
    kachel({ text: "Berechtigungen aktiv", wert: UI.zahlText(zahlen.aktiv), zahl: zahlen.aktiv,
      unter: "von " + UI.zahlText(zahlen.gesamt) + " Programmen" }, "kachel-aktiv"),
    kachel({ text: "Von Hand gesetzt", wert: UI.zahlText(zahlen.manuell), zahl: zahlen.manuell,
      unter: "umschaltbar" }, "kachel-manuell"),
    kachel({ text: "Aus AD-Gruppen", wert: UI.zahlText(zahlen.ausAd), zahl: zahlen.ausAd,
      unter: "gesperrt" }, "kachel-ad")
  ]);
  kennzahlen.classList.add("b-kennzahlen");
  stapel.appendChild(kennzahlen);

  /* Was zu klären ist, steht hier nur als Hinweis (alle Gründe in einem
     Banner); geklärt wird im Bereich «Gerät». */
  const gruende = geraetGruende();
  if (gruende.length) {
    const knopf = UI.knopf({ text: "Im Bereich «Gerät» klären", variante: "leise",
      beiKlick: function () { bereichWechseln("geraet"); }, fokus: "banner-geraet" });
    stapel.appendChild(UI.banner({ ton: "warnung", text: gruende.join(" "), knopf: knopf }));
  }

  const raster = UI.el("div", "karten");
  raster.appendChild(geraetKarteKurz());
  raster.appendChild(telefonKarte());
  stapel.appendChild(raster);

  /* AD-Felder, alle schreibgeschützt. Das sagt die Karte einmal in ihrem
     Text; ein Schloss an jeder Zeile wäre nur Rauschen. Schlösser stehen
     nur dort, wo gesperrte und änderbare Angaben gemischt sind (Karte
     «Gerät»), wie auf der Geräteseite. */
  const kAd = UI.karte({ titel: "Angaben aus dem Active Directory",
    unter: "Vom Abgleich gesetzt und hier nicht änderbar." });
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
    return z;
  })));
  return k;
}


/* ==================================================================
   6. Gerät
   ================================================================== */

/* Nach einer Wahl: Bereich neu (ohne Auftritt), dann zeigt die Karte oben
   das Ergebnis (aufdecken) und der Fokus steht dort, wo es weitergeht. */
/* «geraet» ist die Clientzeile oder null (Inhaberschaft aufheben).
   Eingetragen wird ihre Listen-ID. */
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
  const stapel = UI.el("div", "stapel");
  stapel.appendChild(geraetKarte());
  stapel.appendChild(sucheKarte());
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
  const ergebnis = UI.el("div", "stapel");
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
    const uebernehmen = UI.knopf({ text: "Übernehmen", variante: "leise",
      beiKlick: function () { inhaberschaftSetzen(primaer, "[data-fokus=\"geraet-aktuell\"]"); }, fokus: "sccm-uebernehmen" });
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
   bleibt unberührt. Kein Auftritt – die Liste folgt dem Tippen. */
function trefferZeichnen(behaelter) {
  const ziel = behaelter || UI.$("b-treffer");
  if (!ziel) return;
  UI.leeren(ziel);
  const begriff = geraeteSuche.trim().toLowerCase();

  if (!begriff) return;

  /* Archivierte zuletzt: auffindbar, aber selten gemeint. */
  const treffer = alleClients.filter(c => String(c.__such || "").indexOf(begriff) > -1)
    .sort((a, b) => (a.__archiviert ? 1 : 0) - (b.__archiviert ? 1 : 0) || Hilfe.vergleiche(a.Title, b.Title));

  if (!treffer.length) {
    const leer = UI.leerzustand({
      sinnbild: "suche",
      titel: "Keine Treffer",
      text: "Kein ADMIN-Client passt zu «" + geraeteSuche.trim() + "».",
      aktion: { text: "Suche zurücksetzen", beiKlick: function () {
        geraeteSuche = "";
        const feld = UI.$("b-suche-geraet");
        if (feld) { feld.value = ""; feld.focus(); }
        trefferZeichnen();
      } }
    });
    ziel.appendChild(leer);
    return;
  }

  const gewaehlt = inhaberGeraet();
  ziel.appendChild(UI.zeilenliste(treffer.slice(0, TREFFER_HOECHSTENS).map(function (c) {
    /* «Inhaber» steht nur an der Zeile mit der eingetragenen Listen-ID –
       ein gleichnamiges Gerät ist ein anderes Gerät. */
    const istAktuell = !!gewaehlt && String(gewaehlt.id) === String(c.id);
    const ohneAktion = istAktuell;
    const andere = andereBenutzerVon(c);
    const teile = [UI.text(c.SCCM_Model), UI.text(c.GebaeudeStock)];
    // Gleichnamige Geräte unterscheidet erst die Hardware.
    if (c.__namensDublette && UI.text(c.SCCM_SerialNumber).trim()) teile.push("Seriennummer " + UI.text(c.SCCM_SerialNumber).trim());
    if (andere.length) teile.push("Inhaber: " + andere.join(", "));
    const aktionen = ohneAktion ? [] : [UI.knopf({ text: "Zuweisen", variante: "leise", klein: true,
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
      status: [
        istAktuell ? UI.status("Inhaber", "erfolg") : null,
        geraetStatus(c)
      ],
      aktionen: aktionen,
      titelTipp: ohneAktion ? tipp : undefined,
      // Ganze Zeile als Link (ohne Aktion) bzw. der Titel-Link.
      fokus: ohneAktion ? "treffer-" + c.id : "treffer-link-" + c.id
    });
    if (!ohneAktion) {
      const link = z.querySelector(".listen-zeile-titel a");
      if (link) UI.tipp(link, tipp);
    }
    return z;
  })));
  if (treffer.length > TREFFER_HOECHSTENS) {
    ziel.appendChild(UI.hinweis("und " + UI.zahlText(treffer.length - TREFFER_HOECHSTENS)
      + " weitere Treffer – Suche verfeinern."));
  }
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
  rechte = { zeilen: [], karten: [], anzahl: null, leer: null, liste: null };

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
    beiEingabe: function (w) { rechteSuche = w; filtern(); }
  });
  const nurAktiveChip = UI.chip({
    text: "Nur aktive",
    id: "b-nur-aktive",
    gewaehlt: nurAktive,
    beiKlick: function (an) { nurAktive = an; filtern(); }
  });
  rechte.chip = nurAktiveChip;
  rechte.anzahl = UI.el("p", "anzahl");
  rechte.anzahl.id = "b-rechte-anzahl";
  // b-rechte-leiste: auf schmaler Bahn nimmt die Suche eine eigene Zeile (benutzer.css).
  ziel.appendChild(UI.anhaengen(UI.el("div", "werkzeugleiste b-rechte-leiste"), [suche, nurAktiveChip, rechte.anzahl]));

  // Nach Kategorie gruppiert, Reihenfolge aus der Spalte «Reihenfolge».
  const stapel = UI.el("div", "stapel");
  for (const kategorie of kategorien) {
    const inKategorie = pSpalten.filter(s => s.g === kategorie);
    const aktiv = inKategorie.filter(s => programmStufe(s.i) > 0).length;
    const k = UI.karte({ titel: kategorie, unter: aktiv + " von " + inKategorie.length + " aktiv" });
    const unter = k.querySelector(".karte-unter");
    const liste = UI.el("div", "b-programme");
    k.inhalt.appendChild(liste);
    const eintrag = { karte: k, unter: unter, liste: liste, spalten: inKategorie, zeilen: [] };
    for (const s of inKategorie) {
      const z = programmZeile(s);
      eintrag.zeilen.push(z);
      rechte.zeilen.push(z);
    }
    rechte.karten.push(eintrag);
    stapel.appendChild(k);
  }
  ziel.appendChild(stapel);

  rechte.leer = UI.leerzustand({
    sinnbild: "suche",
    titel: "Keine Treffer",
    text: "Kein Programm passt zu Suche und Filter.",
    aktion: { text: "Filter zurücksetzen", beiKlick: filterZuruecksetzen, fokus: "rechte-filter-zuruecksetzen" }
  });
  ziel.appendChild(rechte.leer);

  filtern();
  zaehlerNachfuehren();
}

/* Eine Programmzeile. Der Schalter schaltet beim Klick (und mit der
   Leertaste) selbst um – sein Übergang spielt –, dann kommt der Wert in den
   Entwurf und nur die Zähler werden nachgeführt (Fehler C2). */
function programmZeile(spalte) {
  const stufe = programmStufe(spalte.i);
  const gruppen = spalte.adGruppen || [];
  const s = UI.schalter({
    id: "b-recht-" + spalte.i,
    an: stufe === 1,
    gesperrt: stufe === 2,
    // Stufe 2 kommt aus einer AD-Gruppe: der Tooltip nennt die Gruppe.
    titel: stufe === 2 ? Modell.sperrHinweis(spalte) : undefined,
    beiWechsel: function (an) {
      // Geschrieben werden ausschliesslich «0» und «1».
      entwurf.setzeWert(spalte.i, an ? "1" : "0");
      zeileNachfuehren(z);
      zaehlerNachfuehren();
    }, fokus: "recht-" + spalte.i
  });

  /* «Geändert» an Ort und Stelle (nie Farbe allein); verborgen, solange
     der Wert dem gespeicherten entspricht. */
  const geaendert = UI.status("Geändert", "neutral", { sinnbild: "bearbeiten" });
  geaendert.hidden = !entwurf.istGeaendert(spalte.i);

  const unter = gruppen.length
    ? (gruppen.length === 1 ? "AD-Gruppe «" + gruppen[0] + "»" : "AD-Gruppen «" + gruppen.join("», «") + "»")
    : (stufe === 2 ? "Vom Abgleich gesetzt" : "");
  const z = UI.schalterZeile({ schalter: s, name: spalte.d, unter: unter, wort: true, zusatz: [geaendert] });
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
  if (rechte.anzahl) UI.textSetzen(rechte.anzahl, UI.zahlText(zahlen.aktiv) + " von " + UI.zahlText(zahlen.gesamt) + " aktiv");
  for (const k of rechte.karten) {
    const aktiv = k.spalten.filter(s => programmStufe(s.i) > 0).length;
    UI.textSetzen(k.unter, aktiv + " von " + k.spalten.length + " aktiv");
  }
}

/* Suche und «Nur aktive» wirken an Ort und Stelle: sichtbare Zeilen
   bleiben dieselben Knoten (Fokus und Schalterzustand bleiben), nur die
   nicht passenden fallen heraus. Ein Schalter, der gerade auf «aus»
   gesetzt wurde, verschwindet erst beim nächsten Filtern – er soll nicht
   unter dem Zeiger wegspringen. */
function filtern() {
  if (!rechte) return;
  const begriff = rechteSuche.trim().toLowerCase();
  let gezeigt = 0;
  for (const k of rechte.karten) {
    const sichtbar = k.zeilen.filter(function (z) {
      if (nurAktive && programmStufe(z.spalte.i) === 0) return false;
      return passtZurSuche(z.spalte, begriff);
    });
    UI.kinderAbgleichen(k.liste, sichtbar);
    k.karte.hidden = !sichtbar.length;
    gezeigt += sichtbar.length;
  }
  rechte.leer.hidden = gezeigt > 0;
}

function filterZuruecksetzen() {
  rechteSuche = "";
  nurAktive = false;
  const feld = UI.$("b-suche-rechte");
  if (feld) feld.value = "";
  if (rechte && rechte.chip) rechte.chip.setzen(false);
  filtern();
  if (feld) feld.focus();
}

/* Verwerfen auf diesem Bereich: die Schalter gleiten zurück, statt neu
   gebaut zu werden. Danach wird neu gefiltert: unter «Nur aktive» kehrt
   ein wieder aktives Programm in die Liste zurück, ein nicht mehr aktives
   fällt heraus – sonst passten Liste und Zähler nicht zusammen. Sichtbare
   Zeilen bleiben dieselben Knoten, der Fokus bleibt. */
function rechteZuruecksetzen() {
  for (const z of rechte.zeilen) {
    const stufe = programmStufe(z.spalte.i);
    z.schalter.setzen(stufe === 1, stufe === 2);
    zeileNachfuehren(z);
  }
  filtern();
  zaehlerNachfuehren();
}


/* ==================================================================
   8. Bemerkung
   ================================================================== */

function bereichBemerkung(ziel) {
  const stapel = UI.el("div", "stapel");

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
  const [rohBenutzer, rohClients, rohSoftware, rohTelefone] = await Promise.all([
    Daten.benutzer(function (n) { anzahlBenutzer = n; fortschritt(); }),
    Daten.clients("admin", function (n) { anzahlClients = n; fortschritt(); }),
    Daten.software().catch(function () { return []; }),
    Daten.telefone().catch(function () { return []; })
  ]);

  const ergebnis = Modell.anreichern(rohClients, rohBenutzer, rohSoftware || []);
  alleClients = ergebnis.clients;
  alleBenutzer = ergebnis.benutzer;
  /* Inventar §8 Nr. 7: gebraucht wird nur die Nebenwirkung (__telefone an
     jeder Person); die Rückgabe { telefone, benutzer } wird nicht mehr
     fälschlich als Liste abgelegt. */
  Modell.telefoneAnreichern(rohTelefone || [], alleBenutzer);
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
        // Nachladen, zeichnet die Seite aus ihm (A7), und der nächste
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

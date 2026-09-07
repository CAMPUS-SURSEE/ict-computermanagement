/* benutzer.js — Benutzerfenster des Computer Inventars (Spezifikation 3.4).

   Wird von der Hauptseite als benutzer.html?id=… im selben Tab geöffnet und
   zeigt eine einzelne Zeile der Benutzer-Liste in vier Abschnitten:

     Übersicht        AD-Felder (schreibgeschützt), Gerät, Kennzahlen
     Gerät            Inhaberschaft ändern, aufheben, SCCM-Primärgerät
                      übernehmen
     Berechtigungen   alle Programme aus programme.json, Tri-State-Schalter
     Bemerkung        freier Text

   Das Feld «Computer» hält das Gerät, dessen Inhaber diese Person ist —
   die Person, der es formal gehört. Höchstens eines je Person, höchstens
   eine Person je Gerät, und ausschliesslich von Hand gepflegt: SCCM meldet
   zwar ein Primärgerät, der Abgleich schreibt «Computer» aber nie.

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
   2. Gerüst (fenster.js) und DOM-Helfer
   ================================================================== */

const F = Fenster.erstellen("b", { neuLaden: function () { neuLaden(); } });
const $ = F.$, el = F.el, leeren = F.leeren, knopf = F.knopf, text = F.text, chip = F.chip;
const karte = F.karte, feldGesperrt = F.feldGesperrt, feldFrei = F.feldFrei;
const toast = F.toast, melden = F.melden;
const dialogOeffnen = F.dialogOeffnen, dialogSchliessen = F.dialogSchliessen;
const zeigeLaden = F.zeigeLaden, zeigeFehler = F.zeigeFehler, zeigeInhalt = F.zeigeInhalt;
const gleichwertig = F.gleichwertig;


/* ==================================================================
   3. Zustand, Entwurf, Speicherleiste, Toast
   ================================================================== */

let alleBenutzer = [];
let alleComputer = [];
let alleTelefone = [];      // Liste «Telefonnummern», für die Karte «Telefon»
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

/* ---------- Gerüst-Anbindung ---------- */

function speicherleisteZeichnen() {
  F.speicherleisteZeichnen({
    neuModus: false, geloescht: false, speichertGerade: speichertGerade,
    speicherFehler: speicherFehler, anzahl: anzahlAenderungen()
  });
}

/* Die Zahl der aktiven Berechtigungen steht am Navigationseintrag. */
function navZeichnen() {
  const zahlen = rechteZaehlen();
  F.navZeichnen(BEREICHE, aktiverBereich, bereichWechseln, {
    zusatz: function (b) {
      return b.k === "berechtigungen" ? el("span", "fenster-nav-zahl", String(zahlen.aktiv)) : null;
    }
  });
}

/* Zeichnet den aktiven Bereich neu und stellt den Fokus samt Schreibmarke
   wieder her, damit Tippen in den Suchfeldern nicht abreisst. */
function zeichneBereich() {
  aktiverBereich = F.zeichneBereich(BEREICHE, aktiverBereich, true);
}

function bereichWechseln(schluessel) {
  aktiverBereich = schluessel;
  location.hash = "#" + schluessel;
  navZeichnen();
  zeichneBereich();
}

function hashLesen() { aktiverBereich = F.hashBereich(BEREICHE) || aktiverBereich; }

function logoZeichnen() { F.logoZeichnen("benutzer"); }

function bandZeichnen() {
  F.bandZeichnen("Vorführmodus (?mock=1): alle Personen, Geräte und Berechtigungen sind "
    + "erfunden. Änderungen bleiben im Browser und gehen nie nach SharePoint.", function () {
      entwurf = {};
      melden("benutzer-geaendert", elementId);
      neuLaden();
    });
}

function autoStarten() {
  F.autoStarten(
    function () { return !speichertGerade && !anzahlAenderungen(); },
    async function () {
      await datenLaden(true);
      zeileWaehlen();
      zeigeInhalt();
      zeichnenAlles();
    });
}


/* ---------- Werte lesen und schreiben ---------- */

/* Der anzuzeigende Wert: Entwurf schlägt gespeicherten Wert. */
function wert(feld) {
  if (Object.prototype.hasOwnProperty.call(entwurf, feld)) return entwurf[feld];
  return zeile ? zeile[feld] : "";
}

function textWert(feld) {
  return text(wert(feld));
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


/* ==================================================================
   4. Bausteine
   ================================================================== */


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

/* Link auf die Geräteseite. Geöffnet wird immer über die Listen-ID, nie
   über den Namen: Namen sind nicht eindeutig.

   Ist das Gerät nicht «Aktiv», steht der Status daneben — sonst wundert
   man sich, warum es in der Geräteliste nicht auftaucht. */
function geraetLink(computerZeile) {
  const huelle = el("span", "b-geraetlink");
  const a = el("a", "name-link", computerZeile.Title);
  a.href = "geraet.html?id=" + encodeURIComponent(computerZeile.id) + MOCK_ANHANG;
  a.title = "Listen-ID " + computerZeile.id + " — Gerät öffnen";
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

/* Alle Geräte, die den eingetragenen Namen tragen.

   Die Inhaberschaft ist ein Freitext-Name, keine Verknüpfung auf die
   Listen-ID: heissen zwei Geräte gleich (etwa weil das ersetzte archiviert
   liegen bleibt), passen beide. Deshalb liefert diese Funktion eine Liste. */
function geraeteMitDiesemNamen() {
  const name = textWert("Computer").trim();
  if (!name) return [];
  const k = Modell.schluessel(name);
  return alleComputer.filter(c => Modell.schluessel(c.Title) === k);
}

/* Das Gerät, dessen Inhaber diese Person ist, oder null. Bei mehreren
   gleichnamigen gewinnt das nicht archivierte — dieselbe Wahl trifft
   Modell.anreichern. */
function inhaberGeraet() {
  const treffer = geraeteMitDiesemNamen();
  return treffer.filter(c => !c.__archiviert)[0] || treffer[0] || null;
}

/* Hinweiszeile bei mehrdeutigem Gerätenamen, sonst null. */
function mehrdeutigHinweis() {
  const treffer = geraeteMitDiesemNamen();
  if (treffer.length < 2) return null;
  const gewaehlt = inhaberGeraet();

  const kasten = el("div", "banner");
  kasten.appendChild(el("span", "t-warnung",
    treffer.length + " Geräte heissen «" + textWert("Computer").trim()
    + "». Die Inhaberschaft speichert nur den Namen und ist damit nicht "
    + "eindeutig; angezeigt wird das nicht archivierte Gerät."));
  const liste = el("div", "chips");
  for (const c of treffer) {
    const a = el("a", "chip" + (c === gewaehlt ? " chip-marke" : ""),
      "Listen-ID " + c.id + " · " + Modell.status(c.Status));
    a.href = "geraet.html?id=" + encodeURIComponent(c.id) + MOCK_ANHANG;
    a.title = (c === gewaehlt ? "Wird hier angezeigt. " : "") + "Gerät öffnen";
    liste.appendChild(a);
  }
  kasten.appendChild(liste);
  return kasten;
}

/* Weicht das SCCM-Primärgerät vom Gerät dieser Person ab? Der Entwurf
   zählt mit, damit der Hinweis verschwindet, sobald es korrigiert ist.
   SCCM bleibt dabei Hinweisgeber: übernommen wird nur auf Klick. */
function primaerAbweichung() {
  return Modell.primaerWeichtAb(zeile ? zeile.SCCMPrimaerGeraet : "",
                                textWert("Computer"));
}

/* Anzeigenamen der übrigen Personen, die dasselbe Gerät tragen — ohne die
   Person dieses Fensters, denn die steht ohnehin oben.

   Ein Gerät hat genau einen Inhaber; kommt hier etwas zurück, ist das ein
   zu bereinigender Datenfehler und wird als Warnung gezeigt. */
function andereBenutzerVon(computerZeile) {
  return (computerZeile.__inhaberAlle || [])
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
  kacheln.appendChild(F.kachel("Berechtigungen aktiv", String(zahlen.aktiv),
    "von " + zahlen.gesamt + " Programmen", zahlen.aktiv ? "erfolg" : null));
  kacheln.appendChild(F.kachel("manuell gesetzt", String(zahlen.manuell),
    "hier umschaltbar"));
  kacheln.appendChild(F.kachel("aus AD-Gruppe", String(zahlen.ausAd),
    "vom AD vorgegeben", zahlen.ausAd ? "info" : null));
  ziel.appendChild(kacheln);

  // Inhaberschaft
  const geraet = inhaberGeraet();
  const name = textWert("Computer").trim();
  const kInhaber = karte("Inhaberschaft",
    "Das Gerät, dessen Inhaber diese Person ist — höchstens eines. Von Hand "
    + "gepflegt, im Abschnitt «Gerät» änderbar; kein Abgleich schreibt es.");
  const felder = el("div", "datenzeilen");

  if (geraet) {
    felder.appendChild(feldFrei("Inhaber von", geraetLink(geraet)));
  } else if (name) {
    const hinweis = el("span", "t-warnung",
      name + " — kein Gerät mit diesem Namen in der Liste");
    felder.appendChild(feldFrei("Inhaber von", hinweis));
  } else {
    felder.appendChild(feldFrei("Inhaber von",
      el("span", "t-still", "kein Gerät")));
  }

  felder.appendChild(feldGesperrt("Primärgerät (SCCM)", zeile.SCCMPrimaerGeraet));
  kInhaber.inhalt.appendChild(felder);

  /* Die Einzelheiten (mehrdeutiger Name, SCCM-Vorschlag) stehen im
     Abschnitt «Gerät»; die Übersicht verweist nur dorthin. */
  if (primaerAbweichung() || mehrdeutigHinweis()) {
    const hinweis = el("div", "banner");
    hinweis.appendChild(el("span", "t-warnung", primaerAbweichung()
      ? "SCCM meldet ein anderes Primärgerät als hier eingetragen."
      : "Der eingetragene Gerätename ist nicht eindeutig."));
    hinweis.appendChild(knopf("Im Abschnitt «Gerät» klären", "knopf-leise", function () {
      bereichWechseln("geraet");
    }));
    kInhaber.inhalt.appendChild(hinweis);
  }

  const gitter = el("div", "karten b-abstand");
  gitter.appendChild(kInhaber);
  gitter.appendChild(telefonKarte());

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


/* Die Telefonnummern dieser Person aus der Liste «Telefonnummern» —
   live über das AD-Feld «Telefon» zugeordnet (Modell.telefoneAnreichern). */
function telefonKarte() {
  const k = karte("Telefon",
    "Nummern aus der Liste «Telefonnummern», die im AD bei dieser Person stehen.");
  const nummern = zeile.__telefone || [];
  if (!nummern.length) {
    k.inhalt.appendChild(F.leerzustand("Keine Telefonnummer",
      text(zeile.Telefon).trim()
        ? "Im AD steht «" + text(zeile.Telefon).trim() + "», in der Telefonliste gibt es dazu keine Zeile."
        : "Im AD ist kein Telefon hinterlegt."));
    return k;
  }
  const felder = el("div", "datenzeilen");
  for (const t of nummern) {
    const a = el("a", "name-link", "Kurzwahl " + (t.__kurzwahl || t.Title || ""));
    a.href = "telefon.html?id=" + encodeURIComponent(t.id) + MOCK_ANHANG;
    a.title = "Telefonnummer öffnen";
    const huelle = el("span");
    huelle.appendChild(a);
    const nummer = text(t.Telefonnummer).trim();
    if (nummer) huelle.appendChild(el("span", "datenzeile-neben", nummer));
    felder.appendChild(feldFrei(text(t.Typ).trim() || "Nummer", huelle));
  }
  k.inhalt.appendChild(felder);
  return k;
}

/* ---------- Gerät ---------- */

function inhaberschaftSetzen(pcName) {
  setzeWert("Computer", pcName);
  zeichneBereich();
}

function inhaberWerden(computerZeile) {
  geraeteSuche = "";
  inhaberschaftSetzen(computerZeile.Title);
}

function inhaberschaftAufheben() {
  inhaberschaftSetzen("");
}

function bereichGeraet(ziel) {
  const geraet = inhaberGeraet();
  const name = textWert("Computer").trim();

  const kAktuell = karte("Gerät dieser Person",
    "Das Feld «Computer» der Benutzer-Liste: das Gerät, dessen Inhaber diese "
    + "Person ist. Höchstens eines je Person, höchstens eine Person je Gerät.");

  if (name) {
    const felder = el("div", "datenzeilen");
    if (geraet) {
      felder.appendChild(feldFrei("Inhaber von", geraetLink(geraet)));
      const status = Modell.status(geraet.Status);
      const statusText = el("span", Modell.statusKlasse(status) || null, status);
      felder.appendChild(feldFrei("Status des Geräts", statusText, true));
      felder.appendChild(feldGesperrt("Modell", geraet.SCCM_Model));
      felder.appendChild(feldGesperrt("Gebäude / Stock", geraet.GebaeudeStock));
      const andere = andereBenutzerVon(geraet);
      if (andere.length) {
        const doppelt = el("span", "t-gefahr", andere.join(", "));
        felder.appendChild(feldFrei("Trägt dieses Gerät ebenfalls", doppelt));
      }
    } else {
      felder.appendChild(feldFrei("Inhaber von",
        el("span", "t-warnung", name + " — kein Gerät mit diesem Namen in der Liste")));
    }
    kAktuell.inhalt.appendChild(felder);

    const mehrdeutig = mehrdeutigHinweis();
    if (mehrdeutig) kAktuell.inhalt.appendChild(mehrdeutig);
  } else {
    const leer = el("div", "leerzustand");
    leer.appendChild(el("p", "leer-titel", "Inhaber keines Geräts"));
    leer.appendChild(el("p", "leer-text",
      "Unten ein Gerät suchen und «Inhaber werden» wählen."));
    kAktuell.inhalt.appendChild(leer);
  }

  /* Vorschlag aus SCCM. Nur ein Vorschlag: übernommen wird auf Klick, der
     Abgleich selbst schreibt die Inhaberschaft nie. */
  if (primaerAbweichung()) {
    const primaer = text(zeile.SCCMPrimaerGeraet).trim();
    const hinweis = el("div", "banner");
    hinweis.appendChild(el("span", "t-warnung",
      "SCCM meldet «" + primaer + "» als Primärgerät dieser Person."));
    hinweis.appendChild(knopf("SCCM-Primärgerät übernehmen", "knopf-primaer", function () {
      inhaberschaftSetzen(primaer);
    }));
    kAktuell.inhalt.appendChild(hinweis);
  }

  /* Die Fusszeile steht zuunterst — sonst trennt ihre Linie mitten in der
     Karte, statt die Aktionen abzuschliessen. */
  if (name) {
    const knoepfe = el("div", "karte-aktionen");
    knoepfe.appendChild(knopf("Inhaberschaft aufheben", null, inhaberschaftAufheben));
    kAktuell.inhalt.appendChild(knoepfe);
  }

  ziel.appendChild(kAktuell);

  // Suche über die Computer-Liste
  const kSuche = karte("Gerät wählen",
    "Suche über PC-Name, Modell, Seriennummer und Gebäude. Wer schon einen "
    + "Inhaber hat, ist unten vermerkt — die Wahl ersetzt ihn nicht von "
    + "selbst, das geschieht im Gerätefenster.");
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
      /* «Inhaber» darf nur an dem Gerät stehen, das der Eintrag wirklich
         meint — bei gleichnamigen Geräten sonst an allen. */
      const gewaehlt = inhaberGeraet();
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
      if (andere.length) teile.push("Inhaber: " + andere.join(", "));
      links.appendChild(el("div", "b-treffer-unter", teile.join(" · ") || "—"));
      z.appendChild(links);
      if (istAktuell) {
        z.appendChild(el("span", "chip chip-marke", "Inhaber"));
      } else {
        z.appendChild(knopf("Inhaber werden", null, function () { inhaberWerden(c); }));
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
  const eingabe = el("textarea", "feld-eingabe");
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

function kopfZeichnen() {
  $("b-titel").textContent = zeile.__name || zeile.Title || "Benutzer";

  const teile = [];
  if (zeile.Title) teile.push(text(zeile.Title));
  if (zeile.Abteilung) teile.push(text(zeile.Abteilung));
  if (zeile.Funktion) teile.push(text(zeile.Funktion));
  $("b-unter").textContent = teile.join(" · ");

  /* Wie bei Gerät und Telefon: Chips in der Titelzeile, und nur für das,
     was auffällt. Ein aktives AD-Konto ist der Normalfall. */
  const status = leeren($("b-status"));
  if (!zeile.__adAktiv) status.appendChild(chip("AD-Konto deaktiviert", "gefahr"));

  leeren($("b-aktionen"));
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

  /* Alles gleichzeitig holen — nacheinander dauerte es dreimal so lang.
     Die Telefonliste ist Beigabe: fehlt sie, bleibt die Karte leer. */
  const [rohBenutzer, rohComputer, programme, rohTelefone] = await Promise.all([
    Daten.benutzer(function (n) { anzahlBenutzer = n; fortschritt(); }),
    Daten.computer(function (n) { anzahlComputer = n; fortschritt(); }),
    Daten.programme(),
    Daten.telefone().catch(function () { return []; })
  ]);
  programmDatei = programme;

  const ergebnis = Modell.anreichern(rohComputer, rohBenutzer, programmDatei);
  alleComputer = ergebnis.computer;
  alleBenutzer = ergebnis.benutzer;
  alleTelefone = Modell.telefoneAnreichern(rohTelefone || [], alleBenutzer);
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


/* Werte so aufbereiten, wie Graph sie erwartet. Programmwerte sind immer
   Zeichenketten «0» oder «1»; «2» schreibt dieses Fenster nie.

   Sonderfall «Computer»: eine aufgehobene Inhaberschaft wird als null
   gesendet. Graph löscht das Feld damit wirklich; eine leere Zeichenkette
   lässt in SharePoint je nach Spaltentyp einen leeren, aber gesetzten Wert
   zurück. Das Gerätefenster (inhaberSchreiben) macht es genauso. */
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
  /* Ein Gerätewechsel steht automatisch im Verlauf. */
  if (Object.prototype.hasOwnProperty.call(felder, "Computer")) {
    const alt = String(zeile.Computer || "").trim();
    const neu = String(felder.Computer || "").trim();
    if (alt !== neu) {
      const eintrag = neu
        ? (alt ? "Gerät gewechselt: " + alt + " → " + neu : "Gerät erhalten: " + neu)
        : "Gerät abgegeben: " + alt;
      felder.Verlauf = F.verlaufAnhaengen(wert("Verlauf"), eintrag);
    }
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
    await Daten.speichern("benutzer", elementId, felder, zeile.__etag);
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

async function verwerfen() {
  if (!anzahlAenderungen() || speichertGerade) return;
  const anzahl = anzahlAenderungen();
  const frage = anzahl === 1 ? "Eine Änderung verwerfen?" : anzahl + " Änderungen verwerfen?";
  if (!await F.bestaetigen("Verwerfen", frage, "Verwerfen", true)) return;
  entwurf = {};
  speicherFehler = "";
  zeichnenAlles();
  toast("Änderungen verworfen.");
}


/* ==================================================================
   9. Start und Tastatur
   ================================================================== */


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

F.ereignisse({
  speichern: speichern,
  verwerfen: verwerfen,
  anzahlAenderungen: anzahlAenderungen,
  beiHash: function (h) {
    if (h !== aktiverBereich && BEREICHE.some(b => b.k === h)) {
      aktiverBereich = h;
      navZeichnen();
      zeichneBereich();
    }
  }
});
autoStarten();

start();

})();

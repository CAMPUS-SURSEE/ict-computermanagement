/* software.js — Softwarefenster des ICT-Inventars.

   Wird von der Hauptseite als software.html?id=… im selben Tab geöffnet und
   zeigt eine einzelne Zeile der Liste «Software» in zwei Bereichen:

     Stammdaten     Programm-Id, Name, Kategorie, AD-Gruppen, Reihenfolge,
                    Bemerkung.
     Berechtigte    Wer das Programm hat — gezählt nach Stufe 1 (von Hand)
                    und Stufe 2 (über eine AD-Gruppe), mit Namensliste.

   Mit ?neu=1 wird ein neues Programm erfasst: dasselbe Formular, «Anlegen»
   statt «Speichern».

   Ein Programm ist zwei Dinge zugleich: eine Zeile in der Liste «Software»
   UND eine Textspalte in der Benutzer-Liste, deren interner Name die
   Programm-Id ist. Dort steht je Person die Berechtigungsstufe (0/1/2).
   Ohne diese Spalte wäre ein Programm wirkungslos, darum legt dieses Fenster
   sie beim Anlegen gleich mit an (Daten.programmSpalteAnlegen). Der Sync
   legt weiterhin nie eine Spalte an — das hier tut ein Mensch mit seinen
   eigenen Rechten.

   Daraus folgt auch die wichtigste Regel dieses Fensters: die Programm-Id
   ist nach dem Anlegen unveränderlich. Ein interner Spaltenname lässt sich
   in SharePoint nicht mehr ändern; eine neue Id ergäbe eine zweite Spalte,
   und alle bisherigen Berechtigungen blieben in der ersten liegen.

   Löschen entfernt nur die Zeile aus der Liste «Software». Die Spalte in der
   Benutzer-Liste bleibt mitsamt ihren Werten stehen — sie zu löschen würde
   Berechtigungen vernichten, und das gehört in die Listeneinstellungen von
   SharePoint (oder zu Entferne-Spalte.ps1), nicht in einen Klick hier.

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

let elementId = ABFRAGE.get("id");
let neuModus = ABFRAGE.get("neu") === "1";

/* Anhang für Links in andere Fenster, damit der Vorführmodus erhalten bleibt. */
const MOCK_ANHANG = mockModus ? "&mock=1" : "";

const SPALTEN = SPALTEN_SOFTWARE;
const SPALTE = {};
for (const s of SPALTEN) SPALTE[s.i] = s;


/* ==================================================================
   2. Gerüst (fenster.js) und DOM-Helfer
   ================================================================== */

const F = Fenster.erstellen("sw", { neuLaden: function () { neuLaden(); } });
const $ = F.$, el = F.el, leeren = F.leeren, knopf = F.knopf, text = F.text, chip = F.chip;
const karte = F.karte, feldGesperrt = F.feldGesperrt, feldFrei = F.feldFrei;
const toast = F.toast, melden = F.melden;
const dialogOeffnen = F.dialogOeffnen, dialogSchliessen = F.dialogSchliessen;
const zeigeLaden = F.zeigeLaden, zeigeFehler = F.zeigeFehler, zeigeInhalt = F.zeigeInhalt;
const gleichwertig = F.gleichwertig, anhaengen = F.anhaengen;
const leerzustand = F.leerzustand;


/* ==================================================================
   3. Zustand, Entwurf, Speicherleiste
   ================================================================== */

let alleSoftware = [];      // Liste «Software»
let alleBenutzer = [];      // Liste «Benutzer», angereichert
let zeile = null;           // die Zeile dieses Fensters
let entwurf = {};           // geänderte, noch nicht gespeicherte Felder
let speichertGerade = false;
let speicherFehler = "";
let geloescht = false;

/* Solange niemand den Namen von Hand angefasst hat, folgt die Programm-Id
   dem Namen — «Adobe Acrobat Pro» wird zu «AdobeAcrobatPro». */
let idVonHand = false;

let aktiverBereich = "stammdaten";

const BEREICHE = [
  { k: "stammdaten",  d: "Stammdaten",  f: bereichStammdaten },
  { k: "berechtigte", d: "Berechtigte", f: bereichBerechtigte }
];

function sichtbareBereiche() {
  /* Ein noch nicht angelegtes Programm hat keine Berechtigten. */
  return neuModus ? [BEREICHE[0]] : BEREICHE;
}

/* ---------- Gerüst-Anbindung ---------- */

function speicherleisteZeichnen() {
  F.speicherleisteZeichnen({
    neuModus: neuModus, geloescht: geloescht, speichertGerade: speichertGerade,
    speicherFehler: speicherFehler, anzahl: anzahlAenderungen(), neuText: "Neue Software"
  });
}

function navZeichnen() {
  F.navZeichnen(sichtbareBereiche(), aktiverBereich, bereichWechseln,
    { verstecken: neuModus });
}

function zeichneBereich(fokusHalten) {
  aktiverBereich = F.zeichneBereich(sichtbareBereiche(), aktiverBereich, fokusHalten);
}

function bereichWechseln(schluessel) {
  aktiverBereich = schluessel;
  location.hash = "#" + schluessel;
  navZeichnen();
  zeichneBereich(false);
}

function hashLesen() { aktiverBereich = F.hashBereich(BEREICHE) || aktiverBereich; }

function logoZeichnen() { F.logoZeichnen("software"); }

function bandZeichnen() {
  F.bandZeichnen("Vorführmodus (?mock=1): alle Programme, Gruppen und Zahlen sind "
    + "erfunden. Änderungen bleiben im Browser und gehen nie nach SharePoint.",
    function () {
      entwurf = {};
      melden("software-geaendert", elementId);
      neuLaden();
    });
}

function autoStarten() {
  F.autoStarten(
    function () { return !neuModus && !geloescht && !speichertGerade && !anzahlAenderungen(); },
    async function () {
      await datenLaden(true);
      zeileWaehlen();
      zeigeInhalt();
      zeichnenAlles();
    });
}

function zeichnenAlles() {
  kopfZeichnen();
  navZeichnen();
  zeichneBereich(false);
  speicherleisteZeichnen();
}

/* Formularzeile mit Punkt, wenn das Feld im Entwurf steht. */
function formZeile(beschriftung, feldKnoten, feldName, hinweis) {
  return F.formZeile(beschriftung, feldKnoten, feldName && istGeaendert(feldName), hinweis);
}


/* ---------- Werte lesen und schreiben ---------- */

function wert(feld) {
  if (Object.prototype.hasOwnProperty.call(entwurf, feld)) return entwurf[feld];
  return zeile ? zeile[feld] : "";
}

function textWert(feld) { return text(wert(feld)); }

function setzeWert(feld, neuerWert) {
  const alt = zeile ? zeile[feld] : "";
  if (gleichwertig(alt, neuerWert)) delete entwurf[feld];
  else entwurf[feld] = neuerWert;
  speicherFehler = "";
  speicherleisteZeichnen();
}

function anzahlAenderungen() { return Object.keys(entwurf).length; }

function istGeaendert(feld) {
  return Object.prototype.hasOwnProperty.call(entwurf, feld);
}


/* ==================================================================
   4. Bausteine
   ================================================================== */

/* Vorschlagslisten aus den vorhandenen Werten einer Spalte — für die
   Kategorie: eine neue entsteht, indem man sie hinschreibt, aber die
   bestehenden sollen mit einem Klick erreichbar sein. */
const datenlistenGebaut = {};

function datenliste(feld) {
  const id = "sw-liste-" + feld;
  if (datenlistenGebaut[id]) return id;
  const werte = [];
  for (const z of alleSoftware) {
    const w = String(z[feld] || "").trim();
    if (w && werte.indexOf(w) === -1) werte.push(w);
  }
  if (!werte.length) return null;
  werte.sort(Hilfe.vergleiche);
  const liste = el("datalist");
  liste.id = id;
  for (const w of werte) {
    const o = el("option");
    o.value = w;
    liste.appendChild(o);
  }
  $("sw-datenlisten").appendChild(liste);
  datenlistenGebaut[id] = true;
  return id;
}

function eingabeFuer(spalte, optionen) {
  const o = optionen || {};
  const istNote = spalte.t === "Note";
  const feld = el(istNote ? "textarea" : "input",
    "feld-eingabe" + (o.klasse ? " " + o.klasse : ""));
  if (!istNote) feld.type = spalte.t === "Number" ? "number" : "text";
  feld.value = textWert(spalte.i);
  feld.id = "sw-eingabe-" + spalte.i;
  feld.autocomplete = "off";
  feld.setAttribute("aria-label", spalte.d);
  if (o.platzhalter) feld.placeholder = o.platzhalter;
  if (o.zeilen && istNote) feld.rows = o.zeilen;
  if (!istNote && o.vorschlaege) {
    const id = datenliste(spalte.i);
    if (id) feld.setAttribute("list", id);
  }
  if (o.gesperrt) {
    feld.disabled = true;
    feld.title = o.gesperrtHinweis || "";
  }
  feld.addEventListener("input", function () {
    feld.classList.remove("ungueltig");
    setzeWert(spalte.i, feld.value);
    const z = feld.closest ? feld.closest(".datenzeile") : null;
    if (z) z.classList.toggle("geaendert", istGeaendert(spalte.i));
    if (o.beiEingabe) o.beiEingabe(feld.value);
  });
  return feld;
}


/* ==================================================================
   5. Auswertung
   ================================================================== */

function programmId() { return textWert("Title").trim(); }

function anzeigeName() {
  const name = textWert("Name").trim();
  if (name) return name;
  const id = programmId();
  if (id) return id;
  return neuModus ? "Neue Software" : "(ohne Namen)";
}

/* Die AD-Gruppen des Entwurfs — eine je Zeile. */
function adGruppen() {
  return Modell.adGruppen(wert("AdGruppen"));
}

/* Andere Zeilen mit derselben Programm-Id: die Id ist der Spaltenname und
   darf darum nur einmal vorkommen. */
function idZwillinge() {
  const id = programmId();
  if (!id) return [];
  return alleSoftware.filter(z => String(z.id) !== String(elementId)
    && Modell.schluessel(z.Title) === Modell.schluessel(id));
}

/* Vorschlag für die Programm-Id aus dem Namen: Buchstaben und Ziffern,
   Umlaute aufgelöst, höchstens 30 Zeichen, Beginn mit einem Buchstaben. */
function idAusName(name) {
  const roh = String(name || "")
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .replace(/^[0-9]+/, "");
  return roh.slice(0, 30);
}

/* Benutzer mit einer Berechtigung für dieses Programm, nach Stufe. */
function berechtigte(stufe) {
  const id = programmId();
  if (!id) return [];
  return alleBenutzer
    .filter(b => Modell.stufe(b[id]) === stufe)
    .sort((a, b) => Hilfe.vergleiche(a.__name, b.__name));
}

/* Gibt es die Spalte in der Benutzer-Liste schon? Sie steht nicht in
   spalten.js, darum wird sie an den geladenen Benutzerzeilen abgelesen:
   Graph liefert ein Feld erst, wenn die Spalte existiert und einen Wert
   trägt. Eine ganz leere Spalte lässt sich so nicht von einer fehlenden
   unterscheiden — deshalb ist die Antwort «nein» hier nur ein Hinweis,
   keine Fehlermeldung. */
function spalteGefunden() {
  const id = programmId();
  if (!id) return false;
  for (const b of alleBenutzer) {
    if (Object.prototype.hasOwnProperty.call(b, id)) return true;
  }
  return false;
}


/* ==================================================================
   6. Die Bereiche
   ================================================================== */

/* ---------- Stammdaten ---------- */

function bereichStammdaten(ziel) {
  const k = karte("Stammdaten", neuModus
    ? "Name und Kategorie sind frei wählbar. Die Programm-Id wird der interne "
      + "Spaltenname in der Benutzer-Liste und lässt sich später nicht mehr ändern."
    : "Der Name ist zugleich der Anzeigename der Spalte in der Benutzer-Liste.");

  const felder = el("div", "datenzeilen");

  /* Name zuerst: er ist das, was ein Mensch kennt. Die Id folgt ihm,
     solange sie niemand von Hand angefasst hat. */
  const nameFeld = eingabeFuer(SPALTE["Name"], {
    platzhalter: "Adobe Acrobat Pro",
    beiEingabe: function (v) {
      if (neuModus && !idVonHand) {
        const vorschlag = idAusName(v);
        setzeWert("Title", vorschlag);
        const f = $("sw-eingabe-Title");
        if (f) f.value = vorschlag;
        idPruefungZeichnen();
      }
      kopfZeichnen();
    }
  });
  felder.appendChild(formZeile(SPALTE["Name"].d, nameFeld, "Name",
    "Wird in der Software-Ansicht und als Spaltenname in der Benutzer-Liste angezeigt."));

  felder.appendChild(idZeile());

  const kategorieFeld = eingabeFuer(SPALTE["Kategorie"], {
    klasse: "sw-eingabe-kategorie",
    platzhalter: "Zusatz-Software",
    vorschlaege: true,
    beiEingabe: function () { kopfZeichnen(); }
  });
  felder.appendChild(formZeile(SPALTE["Kategorie"].d, kategorieFeld, "Kategorie",
    "Gruppe in der Software-Ansicht. Eine neue Kategorie entsteht, indem man sie hinschreibt."));

  const gruppenFeld = eingabeFuer(SPALTE["AdGruppen"], {
    zeilen: 4,
    platzhalter: "MgmtS_MarKom\nBLD_D&G",
    beiEingabe: function () { gruppenVorschauZeichnen(); }
  });
  const gruppenZeile = formZeile(SPALTE["AdGruppen"].d, gruppenFeld, "AdGruppen",
    "Eine AD-Gruppe je Zeile (sAMAccountName). Der Sync setzt bei Mitgliedschaft "
    + "die Stufe 2; im Frontend ist sie dann gesperrt. Leer lassen heisst: das "
    + "Programm wird nur von Hand vergeben.");
  const vorschau = el("div", "chips");
  vorschau.id = "sw-gruppen-vorschau";
  gruppenZeile.querySelector(".datenzeile-wert").appendChild(vorschau);
  felder.appendChild(gruppenZeile);

  const reiheFeld = eingabeFuer(SPALTE["Reihenfolge"], { klasse: "eingabe-schmal" });
  felder.appendChild(formZeile(SPALTE["Reihenfolge"].d, reiheFeld, "Reihenfolge",
    "Sortiernummer. Kategorien erscheinen in der Reihenfolge ihres kleinsten "
    + "Werts; leer sortiert ans Ende."));

  const bemerkungFeld = eingabeFuer(SPALTE["Bemerkung"], { zeilen: 3 });
  felder.appendChild(formZeile(SPALTE["Bemerkung"].d, bemerkungFeld, "Bemerkung",
    "Wozu das Programm dient, wer es lizenziert, was beim Vergeben zu beachten ist."));

  k.inhalt.appendChild(felder);
  gruppenVorschauZeichnen(vorschau);

  if (!neuModus) {
    const werkzeuge = el("div", "werkzeugzeile");
    werkzeuge.appendChild(knopf("Berechtigte Benutzer anzeigen", null, function () {
      location.href = "index.html?" + (mockModus ? "mock=1" : "")
        + "#benutzer?pg=" + encodeURIComponent(programmId());
    }));
    werkzeuge.appendChild(knopf("Programm löschen", "knopf-gefahr", loeschenDialog));
    k.inhalt.appendChild(werkzeuge);
  }

  ziel.appendChild(k);

  if (!neuModus) ziel.appendChild(spaltenKarte());
}

/* Die Programm-Id: beim Anlegen frei, danach unveränderlich. */
function idZeile() {
  const s = SPALTE["Title"];
  if (!neuModus) {
    const zeileFest = feldGesperrt(s.d, textWert("Title"),
      "Der interne Spaltenname in der Benutzer-Liste. SharePoint kann ihn nicht "
      + "mehr ändern — eine neue Id ergäbe eine zweite Spalte, und die bisherigen "
      + "Berechtigungen blieben in der ersten liegen.");
    return zeileFest;
  }
  const feld = eingabeFuer(s, {
    klasse: "eingabe-schmal sw-eingabe-id",
    platzhalter: "AdobeAcrobatPro",
    beiEingabe: function () {
      idVonHand = true;
      idPruefungZeichnen();
      kopfZeichnen();
    }
  });
  const w = el("div");
  w.appendChild(feld);
  const meldung = el("div", "datenzeile-hinweis");
  meldung.id = "sw-id-pruefung";
  w.appendChild(meldung);
  const z = formZeile(s.d, w, "Title",
    "Buchstaben und Ziffern, Beginn mit einem Buchstaben, höchstens 30 Zeichen. "
    + "Wird der interne Spaltenname in der Benutzer-Liste und ist danach fest.");
  idPruefungZeichnen(meldung);
  return z;
}

function idPruefungZeichnen(knoten) {
  const ziel = knoten || $("sw-id-pruefung");
  if (!ziel) return;
  leeren(ziel);
  ziel.className = "datenzeile-hinweis";
  const id = programmId();
  if (!id) return;
  if (!Modell.programmIdGueltig(id)) {
    ziel.className = "datenzeile-hinweis t-gefahr";
    ziel.textContent = "«" + id + "» taugt nicht als Spaltenname: erlaubt sind "
      + "Buchstaben und Ziffern, beginnend mit einem Buchstaben, höchstens 30 Zeichen.";
    return;
  }
  if (idZwillinge().length) {
    ziel.className = "datenzeile-hinweis t-gefahr";
    ziel.textContent = "Die Programm-Id «" + id + "» gibt es schon.";
    return;
  }
  ziel.className = "datenzeile-hinweis t-erfolg";
  ziel.textContent = "Wird als Spalte «" + id + "» in der Benutzer-Liste angelegt.";
}

function gruppenVorschauZeichnen(knoten) {
  const ziel = knoten || $("sw-gruppen-vorschau");
  if (!ziel) return;
  leeren(ziel);
  for (const g of adGruppen()) ziel.appendChild(el("span", "chip chip-info", g));
}

/* Was in der Benutzer-Liste passiert — der zweite Teil eines Programms. */
function spaltenKarte() {
  const k = karte("Spalte in der Benutzer-Liste",
    "Je Person steht dort die Berechtigungsstufe: 0 = aus, 1 = von Hand "
    + "aktiviert, 2 = über eine AD-Gruppe.");
  const felder = el("div", "datenzeilen");
  felder.appendChild(feldGesperrt("Interner Name", programmId(),
    "Entspricht der Programm-Id."));
  felder.appendChild(feldGesperrt("Anzeigename", textWert("Name").trim() || programmId(),
    "Wird beim Anlegen der Spalte gesetzt; späteres Umbenennen ändert nur die Anzeige."));
  k.inhalt.appendChild(felder);

  if (!spalteGefunden()) {
    const band = el("div", "banner");
    band.appendChild(el("span", "t-warnung",
      "In den geladenen Benutzerzeilen kommt die Spalte «" + programmId() + "» nicht vor. "
      + "Entweder ist sie überall leer — dann ist alles in Ordnung — oder sie fehlt."));
    band.appendChild(knopf("Spalte anlegen", "knopf-primaer", spalteAnlegen));
    k.inhalt.appendChild(band);
  }
  return k;
}

async function spalteAnlegen() {
  const id = programmId();
  if (!id) return;
  try {
    const neu = await Daten.programmSpalteAnlegen(id, textWert("Name").trim() || id);
    toast(neu ? "Spalte «" + id + "» in der Benutzer-Liste angelegt."
              : "Die Spalte «" + id + "» gibt es bereits.");
    await datenLaden(true);
    zeileWaehlen();
    zeichnenAlles();
  } catch (e) {
    toast("Spalte konnte nicht angelegt werden. " + (e && e.message ? e.message : e), true);
  }
}

/* ---------- Berechtigte ---------- */

function bereichBerechtigte(ziel) {
  const id = programmId();
  const manuell = berechtigte(1);
  const ausAd = berechtigte(2);

  const kZahlen = karte("Berechtigte", "Gezählt über die Spalte «" + id
    + "» der Benutzer-Liste.");
  const kacheln = el("div", "kacheln");
  kacheln.appendChild(F.kachel("mit Berechtigung", String(manuell.length + ausAd.length), null));
  kacheln.appendChild(F.kachel("von Hand (Stufe 1)", String(manuell.length), null));
  kacheln.appendChild(F.kachel("aus AD-Gruppe (Stufe 2)", String(ausAd.length), null,
    ausAd.length ? "erfolg" : null));
  kZahlen.inhalt.appendChild(kacheln);
  if (!adGruppen().length) {
    kZahlen.inhalt.appendChild(el("p", "hinweis",
      "Keine AD-Gruppe hinterlegt — Stufe 2 kann hier gar nicht entstehen."));
  }
  ziel.appendChild(kZahlen);

  ziel.appendChild(personenKarte("Aus einer AD-Gruppe (Stufe 2)", ausAd,
    "Diese Berechtigungen setzt der Sync. Im Benutzerfenster sind sie gesperrt; "
    + "wegnehmen lassen sie sich nur über die AD-Gruppe."));
  ziel.appendChild(personenKarte("Von Hand vergeben (Stufe 1)", manuell,
    "Diese Berechtigungen hat jemand im Benutzerfenster gesetzt. Der Sync fasst "
    + "eine Stufe 1 nie an."));
}

function personenKarte(titel, liste, unter) {
  const k = karte(titel + " — " + liste.length, unter);
  if (!liste.length) {
    k.inhalt.appendChild(leerzustand("Niemand", "Keine Person auf dieser Stufe."));
    return k;
  }
  const bahn = el("div", "sw-personen");
  for (const b of liste) {
    const a = el("a", "name-link", b.__name || b.Title);
    a.href = "benutzer.html?id=" + encodeURIComponent(b.id) + MOCK_ANHANG;
    a.title = (b.Title || "") + (b.Abteilung ? " · " + b.Abteilung : "") + " — Benutzer öffnen";
    const p = el("div", "sw-person");
    p.appendChild(a);
    const unterZeile = [];
    if (b.Abteilung) unterZeile.push(text(b.Abteilung));
    if (!b.__adAktiv) unterZeile.push("AD-Konto deaktiviert");
    if (unterZeile.length) p.appendChild(el("div", "sw-person-unter", unterZeile.join(" · ")));
    bahn.appendChild(p);
  }
  k.inhalt.appendChild(bahn);
  return k;
}


/* ==================================================================
   7. Kopf
   ================================================================== */

function kopfZeichnen() {
  const name = anzeigeName();
  $("sw-titel").textContent = name;
  document.title = name + " — Software — ICT-Inventar";

  const unter = [];
  if (neuModus) {
    unter.push("Neues Programm, noch nicht angelegt");
  } else {
    if (programmId()) unter.push(programmId());
    if (textWert("Kategorie").trim()) unter.push(textWert("Kategorie").trim());
  }
  const unterText = unter.join(" · ");
  $("sw-unter").textContent = unterText;
  $("sw-unter").title = unterText;

  const status = leeren($("sw-status"));
  if (neuModus) return;
  const gruppen = adGruppen();
  status.appendChild(gruppen.length
    ? chip(gruppen.length === 1 ? "1 AD-Gruppe" : gruppen.length + " AD-Gruppen", "info")
    : chip("Ohne AD-Gruppe", null));
  const anzahl = berechtigte(1).length + berechtigte(2).length;
  status.appendChild(chip(anzahl === 1 ? "1 Berechtigter" : anzahl + " Berechtigte",
    anzahl ? "erfolg" : null));
}


/* ==================================================================
   8. Laden, Speichern, Anlegen, Löschen
   ================================================================== */

function leereZeile() {
  const z = {};
  for (const s of SPALTEN) z[s.i] = "";
  z.id = null;
  return z;
}

async function datenLaden(still) {
  let anzahlSoftware = 0, anzahlBenutzer = 0;
  function fortschritt() {
    if (still) return;
    $("sw-laden-fortschritt").textContent =
      "Software " + anzahlSoftware + " / Benutzer " + anzahlBenutzer;
  }
  if (!still) {
    zeigeLaden(mockModus ? "Vorführdaten werden aufgebaut …"
                         : "Daten werden aus SharePoint geladen …", "");
  }

  const [rohSoftware, rohBenutzer] = await Promise.all([
    Daten.software(function (n) { anzahlSoftware = n; fortschritt(); }),
    Daten.benutzer(function (n) { anzahlBenutzer = n; fortschritt(); })
  ]);

  alleSoftware = rohSoftware;
  /* Die Benutzer brauchen ihre abgeleiteten Felder (__name, __adAktiv);
     Modell.anreichern liefert sie auch ohne Clients und Programme. */
  alleBenutzer = Modell.anreichern([], rohBenutzer, null).benutzer;
}

function zeileWaehlen() {
  if (neuModus) {
    zeile = leereZeile();
    return;
  }
  const treffer = alleSoftware.filter(z => String(z.id) === String(elementId))[0];
  if (!treffer) {
    const fehler = new Error("Zur Listen-ID " + elementId + " gibt es keine Zeile in "
      + "der Liste «Software». Vermutlich wurde sie inzwischen gelöscht.");
    fehler.nichtGefunden = true;
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
    ladefehlerZeigen(fehler);
  }
}

function ladefehlerZeigen(fehler) {
  const meldung = fehler && fehler.message ? fehler.message : String(fehler);
  if (fehler && fehler.nichtGefunden) {
    zeigeFehler("Programm nicht gefunden", meldung, "");
    return;
  }
  zeigeFehler("Die Daten konnten nicht geladen werden", meldung,
    mockModus ? "" : "Zum Anschauen ohne Anmeldung dieses Fenster mit &mock=1 aufrufen.");
}


/* ---------- Prüfen ---------- */

function pruefen() {
  const id = programmId();
  if (!id) return { feld: "Title", text: "Die Programm-Id darf nicht leer sein." };
  if (!Modell.programmIdGueltig(id)) {
    return { feld: "Title", text: "Die Programm-Id besteht aus Buchstaben und Ziffern, "
      + "beginnt mit einem Buchstaben und ist höchstens 30 Zeichen lang. "
      + "Sie wird der interne Spaltenname in der Benutzer-Liste." };
  }
  if (idZwillinge().length) {
    return { feld: "Title", text: "Die Programm-Id «" + id + "» gibt es schon. "
      + "Jede Id darf nur einmal vorkommen — sie ist der Spaltenname." };
  }
  if (!textWert("Name").trim()) {
    return { feld: "Name", text: "Der Name darf nicht leer sein." };
  }
  const r = textWert("Reihenfolge").trim();
  if (r && isNaN(Number(r))) {
    return { feld: "Reihenfolge", text: "«Reihenfolge» muss eine Zahl sein." };
  }
  return null;
}

/* Werte so aufbereiten, wie Graph sie erwartet. Leere Texte gehen als null,
   damit SharePoint das Feld wirklich leert. */
function fuerGraph(feld, roh) {
  const t = (roh === null || roh === undefined) ? "" : String(roh);
  if (feld === "Reihenfolge") {
    const n = Number(t.trim());
    return t.trim() === "" || isNaN(n) ? null : n;
  }
  if (feld === "AdGruppen") {
    /* Aufgeräumt speichern: eine Gruppe je Zeile, ohne Leerzeilen und
       Doppelte — genau so liest der Sync sie wieder. */
    const g = Modell.adGruppen(t);
    return g.length ? g.join("\n") : null;
  }
  return t.trim() === "" ? null : t.trim();
}

async function speichern() {
  if (speichertGerade || geloescht) return;
  const fehler = pruefen();
  if (fehler) {
    speicherFehler = fehler.text;
    speicherleisteZeichnen();
    toast(fehler.text, true);
    const feld = $("sw-eingabe-" + fehler.feld);
    if (feld) { feld.classList.add("ungueltig"); feld.focus(); }
    return;
  }

  const felder = {};
  if (neuModus) {
    for (const s of SPALTEN) {
      const w = fuerGraph(s.i, wert(s.i));
      if (w !== null && w !== "") felder[s.i] = w;
    }
  } else {
    for (const feld in entwurf) {
      /* Die Programm-Id ist der Spaltenname und darf sich nie ändern —
         das Formular bietet sie gar nicht erst zum Ändern an. */
      if (feld === "Title") continue;
      felder[feld] = fuerGraph(feld, entwurf[feld]);
    }
    if (!Object.keys(felder).length) {
      entwurf = {};
      speicherleisteZeichnen();
      return;
    }
  }

  speichertGerade = true;
  speicherFehler = "";
  speicherleisteZeichnen();

  try {
    if (neuModus) {
      /* Zuerst die Spalte, dann die Zeile: Scheitert das Anlegen der Spalte
         (fehlende Berechtigung), entsteht kein Programm, das nirgends wirkt.
         Umgekehrt bliebe eine Software-Zeile ohne Spalte zurück. */
      await Daten.programmSpalteAnlegen(felder.Title, felder.Name || felder.Title);
      const neueZeile = await Daten.anlegen("software", felder);
      elementId = String(neueZeile.id);
      neuModus = false;
      entwurf = {};
      history.replaceState(null, "", adresseFuer(elementId));
      melden("software-neu", elementId);
      speichertGerade = false;
      await datenLaden(true);
      zeileWaehlen();
      zeigeInhalt();
      zeichnenAlles();
      toast("Programm angelegt und Spalte in der Benutzer-Liste erstellt.");
      return;
    }
    await Daten.speichern("software", elementId, felder, zeile ? zeile.__etag : "");
    const anzahl = Object.keys(felder).length;
    entwurf = {};
    melden("software-geaendert", elementId);
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

function adresseFuer(id) {
  return location.pathname + "?id=" + encodeURIComponent(id)
    + (mockModus ? "&mock=1" : "") + location.hash;
}

async function verwerfen() {
  if (!anzahlAenderungen() || speichertGerade) return;
  const t = neuModus ? "Alle Eingaben dieses Formulars verwerfen?"
    : anzahlAenderungen() + " Änderung(en) verwerfen?";
  if (!await F.bestaetigen("Verwerfen", t, "Verwerfen", true)) return;
  entwurf = {};
  speicherFehler = "";
  idVonHand = false;
  zeichnenAlles();
  toast("Änderungen verworfen.");
}


/* ---------- Löschen ---------- */

function loeschenDialog() {
  const id = programmId();
  const anzahl = berechtigte(1).length + berechtigte(2).length;
  const d = dialogOeffnen("Programm löschen");
  d.inhalt.appendChild(el("p", null,
    "Die Zeile wird aus der Liste «Software» entfernt und landet im Papierkorb "
    + "der SharePoint-Site. Von dort lässt sie sich 93 Tage lang zurückholen."));
  d.inhalt.appendChild(el("p", "t-warnung",
    "Die Spalte «" + id + "» der Benutzer-Liste bleibt mit allen Werten stehen — "
    + "sonst wären die Berechtigungen von " + anzahl + " Person(en) unwiederbringlich weg. "
    + "Der Sync ignoriert sie ab jetzt. Wer sie wirklich loswerden will, löscht sie "
    + "in den Listeneinstellungen von SharePoint oder mit Entferne-Spalte.ps1."));
  d.inhalt.appendChild(el("p", null, "Zur Bestätigung bitte die Programm-Id abtippen: " + id));

  const feld = el("input", "feld-eingabe eingabe-schmal");
  feld.type = "text";
  feld.autocomplete = "off";
  feld.setAttribute("aria-label", "Programm-Id zur Bestätigung");
  d.inhalt.appendChild(feld);

  d.knoepfe.appendChild(knopf("Abbrechen", null, dialogSchliessen));
  const loeschen = knopf("Endgültig löschen", "knopf-gefahr", async function () {
    loeschen.disabled = true;
    loeschen.textContent = "Wird gelöscht …";
    try {
      await Daten.loeschen("software", zeile.id);
      melden("software-geloescht", zeile.id);
      geloescht = true;
      entwurf = {};
      dialogSchliessen();
      zeigeFehler("Programm gelöscht",
        "«" + id + "» wurde aus der Liste «Software» entfernt und liegt im "
        + "Papierkorb der SharePoint-Site. Die Spalte in der Benutzer-Liste "
        + "steht unverändert weiter.",
        "Dieses Fenster wird nicht mehr gebraucht.",
        "Fenster schliessen", function () { window.close(); });
      leeren($("sw-aktionen"));
      leeren($("sw-status"));
    } catch (e) {
      loeschen.disabled = false;
      loeschen.textContent = "Endgültig löschen";
      toast("Löschen fehlgeschlagen. " + (e && e.message ? e.message : e), true);
    }
  });
  loeschen.disabled = true;
  d.knoepfe.appendChild(loeschen);
  feld.addEventListener("input", function () {
    loeschen.disabled = feld.value.trim() !== id;
  });
  feld.focus();
}


/* ==================================================================
   9. Start und Ereignisse
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
    if (!neuModus && !elementId) {
      zeigeFehler("Kein Programm angegeben",
        "Dieses Fenster braucht die Listen-ID in der Adresse, zum Beispiel "
        + "software.html?id=5, oder ?neu=1 für ein neues Programm.",
        "Normalerweise wird es aus der Software-Ansicht heraus geöffnet.");
      return;
    }
    await datenLaden();
    zeileWaehlen();
    zeigeInhalt();
    zeichnenAlles();
    if (neuModus) {
      const feld = $("sw-eingabe-Name");
      if (feld) feld.focus();
    }
  } catch (fehler) {
    ladefehlerZeigen(fehler);
  }
}

F.ereignisse({
  speichern: speichern,
  verwerfen: verwerfen,
  anzahlAenderungen: anzahlAenderungen,
  verlassenFrei: function () { return geloescht; },
  beiHash: function (h) {
    if (h !== aktiverBereich && BEREICHE.some(b => b.k === h)) {
      aktiverBereich = h;
      navZeichnen();
      zeichneBereich(false);
    }
  }
});
autoStarten();

start();

})();

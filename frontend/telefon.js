/* telefon.js — Telefonfenster des Computer Inventars.

   Wird von der Hauptseite als telefon.html?id=… im selben Tab
   geöffnet und zeigt eine einzelne Zeile der Liste «Telefonnummern» in zwei
   Bereichen:

     Stammdaten   Kurzwahl, Nummer, Name, Typ, Status, Apparat, Standort —
                  dazu die Person, die im Active Directory diese Nummer
                  hinterlegt hat (live aus der Benutzer-Liste).
     Hinweis      Hinweis und der Verlauf (auch: wer die Nummer früher hatte).

   Mit ?neu=1 wird eine neue Nummer erfasst: dasselbe Formular, «Anlegen»
   statt «Speichern». Die Telefonnummer wird aus der Kurzwahl vorgeschlagen
   (konfig.js: telefonPraefix), solange niemand sie von Hand geändert hat.

   Bearbeitbar sind die von Hand gepflegten Spalten (q = "manuell" in
   spalten.js). «Benutzer (AD)» und «Letzter AD-Sync» schreibt der Sync;
   hier sind sie schreibgeschützt. Die Person wird ohnehin live über die
   AD-Telefonnummer der Benutzer-Liste ermittelt.

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

const SPALTEN = SPALTEN_TELEFON;
const SPALTE = {};
for (const s of SPALTEN) SPALTE[s.i] = s;

function istBearbeitbar(spalte) {
  return !!spalte && spalte.q === "manuell";
}


/* ==================================================================
   2. Gerüst (fenster.js) und DOM-Helfer
   ================================================================== */

const F = Fenster.erstellen("tf", { neuLaden: function () { neuLaden(); } });
const $ = F.$, el = F.el, leeren = F.leeren, knopf = F.knopf, text = F.text, chip = F.chip;
const karte = F.karte, feldGesperrt = F.feldGesperrt, feldFrei = F.feldFrei;
const toast = F.toast, melden = F.melden;
const dialogOeffnen = F.dialogOeffnen, dialogSchliessen = F.dialogSchliessen;
const zeigeLaden = F.zeigeLaden, zeigeFehler = F.zeigeFehler, zeigeInhalt = F.zeigeInhalt;
const gleichwertig = F.gleichwertig;


/* ==================================================================
   3. Zustand, Entwurf, Speicherleiste, Toast
   ================================================================== */

let alleTelefone = [];      // Liste «Telefonnummern», angereichert
let alleBenutzer = [];      // Liste «Benutzer», angereichert
let zeile = null;           // die Zeile dieses Fensters
let entwurf = {};           // geänderte, noch nicht gespeicherte Felder
let speichertGerade = false;
let speicherFehler = "";
let geloescht = false;

/* Wurde die Telefonnummer von Hand geändert? Solange nicht, folgt sie der
   Kurzwahl. */
let nummerVonHand = false;

let aktiverBereich = "stammdaten";

const BEREICHE = [
  { k: "stammdaten", d: "Stammdaten",        f: bereichStammdaten },
  { k: "hinweis",    d: "Hinweis & Verlauf", f: bereichHinweis }
];

/* ---------- Gerüst-Anbindung ---------- */

function speicherleisteZeichnen() {
  F.speicherleisteZeichnen({
    neuModus: neuModus, geloescht: geloescht, speichertGerade: speichertGerade,
    speicherFehler: speicherFehler, anzahl: anzahlAenderungen(), neuText: "Neue Telefonnummer"
  });
}

function navZeichnen() { F.navZeichnen(BEREICHE, aktiverBereich, bereichWechseln); }

function zeichneBereich(fokusHalten) {
  aktiverBereich = F.zeichneBereich(BEREICHE, aktiverBereich, fokusHalten);
}

function bereichWechseln(schluessel) {
  aktiverBereich = schluessel;
  location.hash = "#" + schluessel;
  navZeichnen();
  zeichneBereich(false);
}

function hashLesen() { aktiverBereich = F.hashBereich(BEREICHE) || aktiverBereich; }

function logoZeichnen() { F.logoZeichnen("telefone"); }

function bandZeichnen() {
  F.bandZeichnen("Vorführmodus (?mock=1): alle Nummern und Personen sind erfunden. "
    + "Änderungen bleiben im Browser und gehen nie nach SharePoint.", function () {
      entwurf = {};
      melden("telefon-geaendert", elementId);
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


/* Vorschlagslisten aus den vorhandenen Werten einer Spalte. */
const datenlistenGebaut = {};

function datenliste(feld) {
  const id = "tf-liste-" + feld;
  if (datenlistenGebaut[id]) return id;
  const werte = [];
  for (const z of alleTelefone) {
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
  $("tf-datenlisten").appendChild(liste);
  datenlistenGebaut[id] = true;
  return id;
}

function eingabeFuer(spalte, optionen) {
  const o = optionen || {};
  const istNote = spalte.t === "Note";
  const feld = el(istNote ? "textarea" : "input",
    "feld-eingabe" + (o.klasse ? " " + o.klasse : ""));
  if (!istNote) feld.type = "text";
  feld.value = textWert(spalte.i);
  feld.id = "tf-eingabe-" + spalte.i;
  feld.autocomplete = "off";
  feld.setAttribute("aria-label", spalte.d);
  if (!istNote && o.vorschlaege) {
    const id = datenliste(spalte.i);
    if (id) feld.setAttribute("list", id);
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

function auswahlFuer(spalte, werte, mitLeer) {
  const wahl = el("select", "feld-eingabe eingabe-schmal");
  wahl.id = "tf-eingabe-" + spalte.i;
  wahl.setAttribute("aria-label", spalte.d);
  if (mitLeer) {
    const o = el("option", null, "—");
    o.value = "";
    wahl.appendChild(o);
  }
  for (const w of werte) {
    const o = el("option", null, w);
    o.value = w;
    wahl.appendChild(o);
  }
  const aktuell = textWert(spalte.i).trim();
  /* Ein Wert ausserhalb der Liste (alte Daten) bleibt wählbar, damit er
     nicht stillschweigend verschwindet. */
  if (aktuell && werte.indexOf(aktuell) === -1) {
    const o = el("option", null, aktuell);
    o.value = aktuell;
    wahl.appendChild(o);
  }
  wahl.value = aktuell;
  wahl.addEventListener("change", function () {
    setzeWert(spalte.i, wahl.value);
    const z = wahl.closest ? wahl.closest(".datenzeile") : null;
    if (z) z.classList.toggle("geaendert", istGeaendert(spalte.i));
    kopfZeichnen();
  });
  return wahl;
}


/* ==================================================================
   5. Auswertung
   ================================================================== */

/* Die Person, die im AD diese Nummer hat — unter Berücksichtigung des
   Entwurfs: wer die Kurzwahl ändert, sieht sofort die passende Person. */
function personAusAd() {
  const ziffern = Modell.telefonZiffern(textWert("Telefonnummer").trim())
    || Modell.telefonZiffern(textWert("Title").trim());
  if (!ziffern) return null;
  for (const b of alleBenutzer) {
    if (Modell.telefonZiffern(b.Telefon) === ziffern) return b;
  }
  return null;
}

/* Ersatzweise die Person aus der Spalte «Benutzer» (vom Sync geschrieben). */
function personAusSpalte() {
  const login = Modell.schluessel(zeile ? zeile.Benutzer : "");
  if (!login) return null;
  for (const b of alleBenutzer) if (Modell.schluessel(b.Title) === login) return b;
  return null;
}

function person() { return personAusAd() || personAusSpalte(); }

function statusWert() { return Modell.telefonStatus(textWert("Status")); }

function istZugewiesen() {
  return statusWert() !== "Frei"
    && !!(person() || textWert("Name").trim() || textWert("Benutzer").trim());
}

/* Andere Zeilen mit derselben Kurzwahl (Dublettenwarnung, Sperre beim Anlegen). */
function kurzwahlZwillinge() {
  const k = textWert("Title").trim();
  if (!k) return [];
  return alleTelefone.filter(z => String(z.id) !== String(elementId)
    && Modell.schluessel(z.Title) === Modell.schluessel(k));
}

function anzeigeName() {
  const kurz = textWert("Title").trim();
  if (neuModus && !kurz) return "Neue Telefonnummer";
  return kurz ? "Kurzwahl " + kurz : "(ohne Kurzwahl)";
}


/* ==================================================================
   6. Die Bereiche
   ================================================================== */

/* ---------- Stammdaten ---------- */

function personKarte() {
  const b = person();
  const k = karte("Person aus dem Active Directory",
    "Wer diese Nummer im AD-Feld «Telefon» hinterlegt hat. Das pflegt der "
    + "AD-Abgleich; hier ist es nur zu sehen.");

  if (b) {
    const kopf = el("div", "tf-person");
    const links = el("div");
    const a = el("a", "name-link tf-person-name", b.__name || b.Title);
    a.href = "benutzer.html?id=" + encodeURIComponent(b.id) + MOCK_ANHANG;
    a.title = "Benutzer öffnen";
    links.appendChild(a);
    const unter = [];
    if (b.Title) unter.push(text(b.Title));
    if (b.Abteilung) unter.push(text(b.Abteilung));
    if (b.Funktion) unter.push(text(b.Funktion));
    links.appendChild(el("div", "tf-person-unter", unter.join(" · ")));
    kopf.appendChild(links);

    const chips = el("div", "chips");
    chips.appendChild(b.__adAktiv ? chip("AD-Konto aktiv", "erfolg") : chip("AD-Konto deaktiviert", "gefahr"));
    chips.appendChild(chip(personAusAd() ? "über AD-Telefonnummer" : "über Spalte Benutzer", "info"));
    kopf.appendChild(chips);
    k.inhalt.appendChild(kopf);

    const felder = el("div", "datenzeilen");
    felder.appendChild(feldGesperrt("Telefon im AD", b.Telefon));
    felder.appendChild(feldGesperrt("Letzter AD-Sync",
      Hilfe.datumZeitText(zeile ? zeile.ADLetzterSync : "")));
    k.inhalt.appendChild(felder);

    /* Name und AD-Person verschieden? Dann ist die Liste veraltet. */
    const name = textWert("Name").trim();
    const adName = String(b.__name || "").trim();
    if (adName && Modell.schluessel(name) !== Modell.schluessel(adName)) {
      const hinweis = el("div", "banner");
      hinweis.appendChild(el("span", "t-warnung", name
        ? "In der Liste steht «" + name + "», im AD hat «" + adName + "» diese Nummer."
        : "Die Nummer hat noch keinen Namen; im AD gehört sie «" + adName + "»."));
      hinweis.appendChild(knopf("Name aus AD übernehmen", "knopf-primaer", function () {
        setzeWert("Name", adName);
        if (!textWert("Typ").trim()) setzeWert("Typ", "Person");
        if (statusWert() === "Frei") setzeWert("Status", "Aktiv");
        zeichneBereich(false);
        kopfZeichnen();
      }));
      k.inhalt.appendChild(hinweis);
    } else if (statusWert() === "Frei") {
      const hinweis = el("div", "banner");
      hinweis.appendChild(el("span", "t-warnung",
        "Die Nummer steht auf «Frei», ist im AD aber bei «" + adName + "» hinterlegt."));
      hinweis.appendChild(knopf("Auf Aktiv setzen", "knopf-primaer", function () {
        setzeWert("Status", "Aktiv");
        zeichneBereich(false);
        kopfZeichnen();
      }));
      k.inhalt.appendChild(hinweis);
    }
  } else {
    const leer = el("div", "leerzustand");
    leer.appendChild(el("p", "leer-titel", "Im AD hat niemand diese Nummer"));
    leer.appendChild(el("p", "leer-text",
      "Für Dienste, Räume und HelpFons ist das normal. Bei einer Person fehlt "
      + "im AD das Feld «Telefon» — sobald es gesetzt ist, erscheint sie hier "
      + "und der Sync trägt den Login in «Benutzer (AD)» ein."));
    k.inhalt.appendChild(leer);
    const benutzerSpalte = textWert("Benutzer").trim();
    if (benutzerSpalte) {
      const felder = el("div", "datenzeilen");
      felder.appendChild(feldGesperrt("Benutzer (AD)", benutzerSpalte,
        "Vom Sync geschrieben; die Person steht nicht (mehr) in der Benutzer-Liste."));
      k.inhalt.appendChild(felder);
    }
  }
  return k;
}

/* Die Kurzwahl ist der Schlüssel. Beim Tippen folgt die Telefonnummer,
   solange sie niemand von Hand angefasst hat. */
function kurzwahlZeile() {
  const s = SPALTE["Title"];
  const feld = eingabeFuer(s, {
    klasse: "eingabe-schmal tf-eingabe-kurzwahl",
    beiEingabe: function (v) {
      if (!nummerVonHand) {
        const voll = Modell.telefonVoll(v.trim());
        setzeWert("Telefonnummer", voll);
        const nf = $("tf-eingabe-Telefonnummer");
        if (nf) nf.value = voll;
      }
      zwillingeFuellen();
      kopfZeichnen();
      personNachfuehren();
    }
  });
  feld.inputMode = "numeric";
  feld.placeholder = "373";
  const w = el("div");
  w.appendChild(feld);
  const warnung = el("div", "datenzeile-hinweis t-warnung");
  warnung.id = "tf-zwillinge";
  w.appendChild(warnung);
  const z = formZeile(s.d, w, "Title",
    "Drei Ziffern aus dem Hausblock " + Modell.telefonPraefix() + "… — der Schlüssel der Liste. "
    + "Die vollständige Nummer wird daraus vorgeschlagen.");
  zwillingeFuellen(warnung);
  return z;
}

function zwillingeFuellen(knoten) {
  const w = knoten || $("tf-zwillinge");
  if (!w) return;
  const zw = kurzwahlZwillinge();
  w.hidden = !zw.length;
  w.textContent = zw.length
    ? "Diese Kurzwahl steht bereits in der Liste (" + zw.map(z =>
        (String(z.Name || "").trim() || "ohne Namen") + ", Listen-ID " + z.id).join("; ")
      + "). Jede Kurzwahl darf nur einmal vorkommen."
    : "";
}

/* Die Personenkarte hängt an der Nummer: nach jeder Änderung neu zeichnen,
   ohne das Formular (und damit die Schreibmarke) anzufassen. */
function personNachfuehren() {
  const alt = $("tf-personkarte");
  if (!alt) return;
  const neu = personKarte();
  neu.id = "tf-personkarte";
  alt.parentNode.replaceChild(neu, alt);
}

function bereichStammdaten(ziel) {
  const gitter = el("div", "karten");

  const kForm = karte("Stammdaten",
    neuModus ? "Kurzwahl und Name genügen; alles Übrige ist freiwillig."
             : "Von Hand gepflegt. Der Abgleich fasst diese Felder nicht an — "
               + "ausser er füllt einen leeren Namen aus dem AD.");
  const felder = el("div", "datenzeilen");
  felder.appendChild(kurzwahlZeile());

  const nummerFeld = eingabeFuer(SPALTE["Telefonnummer"], {
    beiEingabe: function () { nummerVonHand = true; personNachfuehren(); }
  });
  nummerFeld.placeholder = Modell.telefonVoll("373");
  felder.appendChild(formZeile(SPALTE["Telefonnummer"].d, nummerFeld, "Telefonnummer",
    "Vollständige Nummer. Wird aus der Kurzwahl vorgeschlagen; eine Mobil- oder "
    + "Fremdnummer lässt sich hier eintragen."));

  const nameFeld = eingabeFuer(SPALTE["Name"], {
    beiEingabe: function () { kopfZeichnen(); }
  });
  felder.appendChild(formZeile(SPALTE["Name"].d, nameFeld, "Name",
    "Person, Dienst, Raum oder HelpFon. Leer lassen, wenn die Nummer frei ist."));

  felder.appendChild(formZeile(SPALTE["Typ"].d,
    auswahlFuer(SPALTE["Typ"], Modell.TELEFON_TYPEN, true), "Typ"));

  const statusWahl = auswahlFuer(SPALTE["Status"], Modell.TELEFON_STATUS_WERTE, false);
  const statusHuelle = el("div");
  statusHuelle.appendChild(statusWahl);
  const statusHinweis = el("div", "datenzeile-hinweis");
  statusHuelle.appendChild(statusHinweis);
  const statusHinweisSetzen = function () {
    const s = Modell.telefonStatus(statusWahl.value);
    statusHinweis.className = "datenzeile-hinweis " + (Modell.telefonStatusKlasse(s) || "t-leise");
    statusHinweis.textContent = s === "Frei"
      ? "Sofort vergebbar. Erscheint in der Liste hervorgehoben; der Sync setzt "
        + "die Nummer auf «Aktiv», sobald sie im AD bei jemandem steht."
      : (s === "Inaktiv"
          ? "Vorhanden, aber nicht in Teams — etwa ein SIP-Apparat oder ein deaktiviertes Konto."
          : "In Betrieb. Ein leeres Feld gilt ebenfalls als «Aktiv».");
  };
  statusHinweisSetzen();
  statusWahl.addEventListener("change", function () {
    statusHinweisSetzen();
    personNachfuehren();
  });
  felder.appendChild(formZeile(SPALTE["Status"].d, statusHuelle, "Status"));

  felder.appendChild(formZeile(SPALTE["Apparat"].d,
    eingabeFuer(SPALTE["Apparat"], { vorschlaege: true }), "Apparat",
    "Teams, Tischtelefon, Headset, SIP-Apparat, HelpFon …"));
  felder.appendChild(formZeile(SPALTE["Standort"].d,
    eingabeFuer(SPALTE["Standort"], { vorschlaege: true }), "Standort",
    "Gebäude / Raum des Apparats."));
  kForm.inhalt.appendChild(felder);
  gitter.appendChild(kForm);

  const kPerson = personKarte();
  kPerson.id = "tf-personkarte";
  gitter.appendChild(kPerson);

  ziel.appendChild(gitter);
}


/* ---------- Hinweis und Verlauf ---------- */

function bereichHinweis(ziel) {
  const stapel = el("div", "stapel");

  const kHinweis = karte("Hinweis", "Grund oder Bemerkung zu dieser Nummer, Freitext.");
  const felder = el("div", "datenzeilen");
  const hinweisFeld = eingabeFuer(SPALTE["Hinweis"]);
  felder.appendChild(formZeile(SPALTE["Hinweis"].d, hinweisFeld, "Hinweis"));
  kHinweis.inhalt.appendChild(felder);
  stapel.appendChild(kHinweis);

  /* Verlauf. Er hängt am selben Entwurf wie alle anderen Felder:
     verlauf.js meldet die fertige Zeichenkette, setzeWert legt sie in den
     Entwurf, der Speichern-Knopf schreibt sie nach SharePoint. */
  const kVerlauf = karte("Verlauf",
    "Was mit dieser Nummer passiert ist — Handwechsel, Freigabe, Apparat. Der "
    + "Abgleich hängt eigene Einträge an; sie lassen sich hier ebenso ändern "
    + "oder löschen.");
  Verlauf.zeichnen(kVerlauf.inhalt, {
    schluessel: "telefon",
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
  const name = anzeigeName();
  $("tf-titel").textContent = name;
  document.title = name + " — Computer Inventar";

  const unter = [];
  if (neuModus) {
    unter.push("Neue Zeile, noch nicht gespeichert");
  } else {
    const nummer = textWert("Telefonnummer").trim() || Modell.telefonVoll(textWert("Title").trim());
    if (nummer) unter.push(nummer);
    if (textWert("Name").trim()) unter.push(textWert("Name").trim());
    if (textWert("Typ").trim()) unter.push(textWert("Typ").trim());
  }
  $("tf-unter").textContent = unter.join(" · ");
  $("tf-unter").title = unter.join(" · ");

  const status = leeren($("tf-status"));
  if (!neuModus && zeile) {
    const s = statusWert();
    /* Der Normalfall (Aktiv, zugewiesen) bekommt keinen Chip — nur was
       auffällt: Frei, Inaktiv, nicht zugewiesen, dazu die Person aus dem AD. */
    if (s === "Frei") status.appendChild(chip("Frei", "warnung"));
    else if (s === "Inaktiv") status.appendChild(chip("Inaktiv", "leise"));
    /* «Frei» heisst immer auch «nicht zugewiesen» — ein Chip genügt. */
    else if (!istZugewiesen()) status.appendChild(chip("Nicht zugewiesen", "warnung"));
    const b = person();
    if (b) status.appendChild(chip(b.__name || b.Title, "info"));
  }
  aktionenZeichnen();
}

function aktionenZeichnen() {
  const ziel = leeren($("tf-aktionen"));
  if (geloescht) return;

  if (!neuModus) {
    ziel.appendChild(knopf("Löschen", "knopf-leise", loeschenDialog));
  }
}


function adresseFuer(id) {
  return "telefon.html?id=" + encodeURIComponent(id) + MOCK_ANHANG;
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


/* Eine leere Zeile mit allen Spalten, für «Neue Telefonnummer». */
function leereZeile() {
  const z = {};
  for (const s of SPALTEN) z[s.i] = "";
  z.id = null;
  z.Status = "Aktiv";
  return z;
}

async function datenLaden(still) {
  let anzahlTelefone = 0, anzahlBenutzer = 0;
  function fortschritt() {
    if (still) return;
    $("tf-laden-fortschritt").textContent =
      "Telefonnummern " + anzahlTelefone + " / Benutzer " + anzahlBenutzer;
  }
  if (!still) {
    zeigeLaden(mockModus ? "Vorführdaten werden aufgebaut …"
                         : "Daten werden aus SharePoint geladen …", "");
  }

  const [rohTelefone, rohBenutzer] = await Promise.all([
    Daten.telefone(function (n) { anzahlTelefone = n; fortschritt(); }),
    Daten.benutzer(function (n) { anzahlBenutzer = n; fortschritt(); })
  ]);

  /* Die Benutzer brauchen ihre abgeleiteten Felder (__name, __adAktiv);
     Modell.anreichern liefert sie auch ohne Geräte und Programme. */
  alleBenutzer = Modell.anreichern([], rohBenutzer, null).benutzer;
  alleTelefone = Modell.telefoneAnreichern(rohTelefone, alleBenutzer).telefone;
}

function zeileWaehlen() {
  if (neuModus) {
    zeile = leereZeile();
    return;
  }
  const treffer = alleTelefone.filter(z => String(z.id) === String(elementId))[0];
  if (!treffer) {
    const fehler = new Error("Zur Listen-ID " + elementId + " gibt es keine Zeile in der "
      + "Liste «Telefonnummern». Vermutlich wurde sie inzwischen gelöscht.");
    fehler.nichtGefunden = true;
    throw fehler;
  }
  zeile = treffer;
  /* Weicht die gespeicherte Nummer vom Vorschlag ab, hat sie jemand
     bewusst gesetzt — dann darf die Kurzwahl sie nicht mehr überschreiben. */
  const vorschlag = Modell.telefonVoll(String(zeile.Title || "").trim());
  nummerVonHand = !!String(zeile.Telefonnummer || "").trim()
    && String(zeile.Telefonnummer).trim() !== vorschlag;
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
    zeigeFehler("Telefonnummer nicht gefunden", meldung, "");
    return;
  }
  zeigeFehler("Die Daten konnten nicht geladen werden", meldung,
    mockModus ? "" : "Zum Anschauen ohne Anmeldung dieses Fenster mit &mock=1 aufrufen.");
}

/* ---------- Automatisch nachladen ---------- */

/* Statt eines Knopfes «Neu laden» holt sich dieses Fenster den Stand in
   ruhigen Abständen selbst — still, ohne den Inhalt gegen den Spinner zu
   tauschen. Wer sofort einen frischen Stand will, lädt die Seite neu.

   Übersprungen wird, sobald Nachladen mehr stören als nützen würde: bei
   ungespeicherten Änderungen (sie gingen verloren), beim Anlegen, während
   des Speicherns, bei offenem Dialog, nach dem Löschen und in einem
   Hintergrund-Tab. Der nächste Takt versucht es dann wieder. */


/* ---------- Prüfen ---------- */

function pruefen() {
  const kurz = textWert("Title").trim();
  if (!kurz) return { feld: "Title", text: "Die Kurzwahl darf nicht leer sein." };
  if (!/^\d{1,4}$/.test(kurz)) {
    return { feld: "Title", text: "Die Kurzwahl besteht aus ein bis vier Ziffern, zum Beispiel 373." };
  }
  if (kurzwahlZwillinge().length) {
    return { feld: "Title", text: "Die Kurzwahl " + kurz + " gibt es schon. Jede Kurzwahl darf nur einmal vorkommen." };
  }
  const status = textWert("Status").trim();
  if (status && Modell.TELEFON_STATUS_WERTE.indexOf(status) === -1) {
    return { feld: "Status", text: "«Status» muss «" + Modell.TELEFON_STATUS_WERTE.join("», «") + "» sein." };
  }
  return null;
}

/* Werte so aufbereiten, wie Graph sie erwartet. Leere Texte gehen als null,
   damit SharePoint das Feld wirklich leert. */
function fuerGraph(feld, roh) {
  const t = (roh === null || roh === undefined) ? "" : String(roh);
  if (feld === "Telefonnummer") {
    const f = t.trim();
    return f ? Modell.telefonFormat(f) : null;
  }
  if (feld === "Verlauf") return t;
  return t.trim() === "" ? null : t;
}

async function speichern() {
  if (speichertGerade || geloescht) return;
  const fehler = pruefen();
  if (fehler) {
    speicherFehler = fehler.text;
    speicherleisteZeichnen();
    toast(fehler.text, true);
    const feld = $("tf-eingabe-" + fehler.feld);
    if (feld) { feld.classList.add("ungueltig"); feld.focus(); }
    return;
  }

  /* Leere Nummer: aus der Kurzwahl ergänzen, damit die Zeile vollständig ist. */
  if (!textWert("Telefonnummer").trim()) {
    setzeWert("Telefonnummer", Modell.telefonVoll(textWert("Title").trim()));
  }

  const felder = {};
  if (neuModus) {
    for (const s of SPALTEN) {
      if (!istBearbeitbar(s)) continue;
      const w = fuerGraph(s.i, wert(s.i));
      if (w !== null && w !== "") felder[s.i] = w;
    }
    if (!felder.Verlauf) {
      felder.Verlauf = Modell.verlaufSchreiben([Modell.verlaufEintrag("", "Im Frontend neu erfasst")]);
    }
  } else {
    for (const feld in entwurf) {
      if (!istBearbeitbar(SPALTE[feld])) continue;
      felder[feld] = fuerGraph(feld, entwurf[feld]);
    }
  }
  if (!neuModus && !Object.keys(felder).length) {
    entwurf = {};
    speicherleisteZeichnen();
    return;
  }

  speichertGerade = true;
  speicherFehler = "";
  speicherleisteZeichnen();

  try {
    if (neuModus) {
      const neueZeile = await Daten.anlegen("telefon", felder);
      elementId = String(neueZeile.id);
      neuModus = false;
      entwurf = {};
      history.replaceState(null, "", adresseFuer(elementId));
      melden("telefon-neu", elementId);
      speichertGerade = false;
      await datenLaden(true);
      zeileWaehlen();
      zeigeInhalt();
      zeichnenAlles();
      toast("Telefonnummer angelegt.");
      return;
    }
    await Daten.speichern("telefon", elementId, felder);
    const anzahl = Object.keys(felder).length;
    entwurf = {};
    melden("telefon-geaendert", elementId);
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

async function verwerfen() {
  if (!anzahlAenderungen() || speichertGerade) return;
  const t = neuModus ? "Alle Eingaben dieses Formulars verwerfen?"
    : anzahlAenderungen() + " Änderung(en) verwerfen?";
  if (!await F.bestaetigen("Verwerfen", t, "Verwerfen", true)) return;
  entwurf = {};
  speicherFehler = "";
  nummerVonHand = false;
  zeichnenAlles();
  toast("Änderungen verworfen.");
}

/* ---------- Dialog und Löschen ---------- */


function loeschenDialog() {
  const kurz = String(zeile.Title || "").trim();
  const d = dialogOeffnen("Telefonnummer löschen");
  d.inhalt.appendChild(el("p", null,
    "Die Zeile wird aus der Liste «Telefonnummern» entfernt und landet im "
    + "Papierkorb der SharePoint-Site. Von dort lässt sie sich 93 Tage lang zurückholen."));
  d.inhalt.appendChild(el("p", "t-warnung",
    "Meist ist «Frei» die bessere Wahl: die Nummer bleibt bekannt, und wer sie "
    + "früher hatte, steht im Verlauf. Löschen nur, wenn die Nummer nicht mehr existiert."));
  d.inhalt.appendChild(el("p", null, "Zur Bestätigung bitte die Kurzwahl abtippen: " + kurz));

  const feld = el("input", "feld-eingabe eingabe-schmal");
  feld.type = "text";
  feld.autocomplete = "off";
  feld.setAttribute("aria-label", "Kurzwahl zur Bestätigung");
  d.inhalt.appendChild(feld);

  d.knoepfe.appendChild(knopf("Abbrechen", null, dialogSchliessen));
  const loeschen = knopf("Endgültig löschen", "knopf-gefahr", async function () {
    loeschen.disabled = true;
    loeschen.textContent = "Wird gelöscht …";
    try {
      await Daten.loeschen("telefon", zeile.id);
      melden("telefon-geloescht", zeile.id);
      geloescht = true;
      entwurf = {};
      dialogSchliessen();
      zeigeFehler("Telefonnummer gelöscht",
        "Die Kurzwahl " + kurz + " wurde aus der Liste entfernt und liegt im "
        + "Papierkorb der SharePoint-Site.",
        "Dieses Fenster wird nicht mehr gebraucht.",
        "Fenster schliessen", function () { window.close(); });
      leeren($("tf-aktionen"));
      leeren($("tf-status"));
    } catch (e) {
      loeschen.disabled = false;
      loeschen.textContent = "Endgültig löschen";
      toast("Löschen fehlgeschlagen. " + (e && e.message ? e.message : e), true);
    }
  });
  loeschen.disabled = true;
  d.knoepfe.appendChild(loeschen);
  feld.addEventListener("input", function () {
    loeschen.disabled = feld.value.trim() !== kurz;
  });
  feld.focus();
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
    if (!neuModus && !elementId) {
      zeigeFehler("Keine Telefonnummer angegeben",
        "Dieses Fenster braucht die Listen-ID in der Adresse, zum Beispiel "
        + "telefon.html?id=5, oder ?neu=1 für eine neue Nummer.",
        "Normalerweise wird es aus der Telefonliste heraus geöffnet.");
      return;
    }
    await datenLaden();
    zeileWaehlen();
    zeigeInhalt();
    zeichnenAlles();
    if (neuModus) {
      const feld = $("tf-eingabe-Title");
      if (feld) feld.focus();
    }
  } catch (fehler) {
    ladefehlerZeigen(fehler);
  }
}

/* ---------- Ereignisse ---------- */

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

/* telefon.js — Telefonfenster des ICT-Inventars.

   Wird von der Hauptseite als telefon.html?id=… im selben Tab geöffnet und
   zeigt eine Zeile der Liste «Telefonnummern» in zwei Bereichen:

     Stammdaten          Kurzwahl, Nummer, Name, Typ, Status, Apparat,
                         Standort – dazu die Person, die im Active Directory
                         diese Nummer hinterlegt hat (live aus der
                         Benutzer-Liste).
     Hinweis & Verlauf   Hinweis und Verlauf (auch: wer die Nummer hatte).

   Mit ?neu=1 wird eine neue Nummer erfasst: ein Formular ohne Bereiche,
   «Anlegen» statt «Speichern». Die Telefonnummer folgt der Kurzwahl
   (konfig.js: telefonPraefix), solange niemand sie von Hand ändert – aber
   nur bei passender Länge (Fehler D3): mit dem Präfix «+41 41 926 2» genau
   drei Ziffern; sonst bleibt sie leer und die Kurzwahl bekommt einen
   Feldhinweis. Eine kaputte Nummer wird nie gebildet und nie gespeichert.
   Mit ?neu=1&benutzer=<Listen-ID> («Nummer erfassen» im Benutzerfenster)
   sind Kurzwahl, Nummer und Name aus dieser Person vorgefüllt.

   Bearbeitbar sind die von Hand gepflegten Spalten (q = «manuell» in
   spalten.js). «Benutzer (AD)» und «Letzter AD-Sync» schreibt der Abgleich.

   Gebaut wird nur über UI.*, Rahmen.*, F.* und Bewegung.*. Beim Tippen
   ändert sich nichts ausser dem, was am getippten Wert hängt (Zwillinge,
   Person, Hinweise, Kopf) – an Ort und Stelle, ohne Neuaufbau des
   Formulars, damit Fokus und Schreibmarke bleiben. Kein innerHTML mit
   Daten: jeder Wert geht über textContent. */

"use strict";

(function () {

/* ==================================================================
   1. Parameter und Spaltenwissen
   ================================================================== */

const ABFRAGE = new URLSearchParams(location.search);
const mockModus = UI.adresse.mock();

let elementId = ABFRAGE.get("id");
let neuModus = ABFRAGE.get("neu") === "1";

/* «Nummer erfassen» im Benutzerfenster öffnet ?neu=1&benutzer=<Listen-ID>:
   Kurzwahl, Nummer und Name kommen dann aus der Zeile dieser Person
   (vorbelegen). Nur die Listen-ID steht in der Adresse, nichts Persönliches. */
const VORBELEGEN_AUS = neuModus ? ABFRAGE.get("benutzer") : null;

const SPALTEN = SPALTEN_TELEFON;
const SPALTE = {};
for (const s of SPALTEN) SPALTE[s.i] = s;

const LEAD = "Hier pflegst du Kurzwahl, Name und Status dieser Nummer.";
const LEAD_NEU = "Kurzwahl und Name genügen; alles Übrige ist freiwillig.";

/* Grund für gesperrte Schnellaktionen bei ungespeicherten Änderungen (D4):
   «Freigeben» speicherte sonst alles andere mit, «Löschen» verwürfe es. */
const GRUND_ENTWURF = "Zuerst speichern oder verwerfen.";


/* ==================================================================
   2. Gerüst und Zustand
   ================================================================== */

const F = Fenster.erstellen("tf", {
  liste: "telefone",
  neuLaden: function () { neuLaden(); },
  nachladen: function () { return nachladenStill(); }
});

let alleTelefone = [];      // Liste «Telefonnummern», angereichert
let alleBenutzer = [];      // Liste «Benutzer», angereichert
let zeile = null;           // die Zeile dieses Fensters

/* Leer gespeicherter Status gilt als «Aktiv» und wird so gezeigt (D1):
   ein Hin und Her auf «Aktiv» ist darum keine Änderung. Beim Anlegen
   (neu) zeigen die Felder keinen Punkt «geändert» – dort ist alles neu. */
const entwurf = F.entwurf(function () { return zeile; }, {
  leer: { Status: "Aktiv" },
  neu: function () { return neuModus; },
  beiAenderung: nachAenderung
});

/* Wurde die Telefonnummer von Hand gesetzt? Solange nicht, folgt sie der
   Kurzwahl. Immer aus dem gespeicherten Stand bestimmt (Fehler D2). */
let nummerVonHand = false;

/* Während «Nummer freigeben» speichert: keine automatischen
   Verlaufszeilen, der eine Eintrag «Freigegeben …» genügt. */
let ohneAutoVerlauf = false;

let aktiverBereich = "stammdaten";

const BEREICHE = [
  { k: "stammdaten", d: "Stammdaten",        sinnbild: "telefon", f: bereichStammdaten },
  { k: "hinweis",    d: "Hinweis & Verlauf", sinnbild: "verlauf", f: bereichHinweis }
];

/* Neu: EIN Formular ohne Bereiche (Schublade verborgen, volle Breite). Der
   Schlüssel ist derselbe wie «Stammdaten»: nach dem Anlegen bleiben Fokus
   und Rollposition beim Neuzeichnen erhalten. */
const BEREICHE_NEU = [
  { k: "stammdaten", d: "Stammdaten", f: bereichNeu }
];

function bereiche() { return neuModus ? BEREICHE_NEU : BEREICHE; }

/* Jede Änderung am Entwurf: Kopf (Titel, Status, Sperre der
   Schnellaktionen, D4) und Speicherleiste – nie das Formular. */
function nachAenderung() {
  kopfZeichnen();
  speicherleisteZeichnen();
}

function speicherleisteZeichnen() {
  F.speicherleisteZeichnen({ neuModus: neuModus, anzahl: entwurf.anzahl(), neuText: "Neue Telefonnummer" });
}

function navZeichnen() {
  if (neuModus) F.navZeichnen([], null, null, { verstecken: true });
  else F.navZeichnen(BEREICHE, aktiverBereich, bereichWechseln);
}

function zeichneBereich() {
  aktiverBereich = F.zeichneBereich(bereiche(), aktiverBereich);
}

function bereichWechseln(schluessel) {
  if (!zeile || neuModus) return;
  aktiverBereich = schluessel;
  F.bereichWechseln(BEREICHE, schluessel);
}


/* ==================================================================
   3. Kurzwahl und Nummer (Fehler D3)
   ================================================================== */

const ZAHLWOERTER = ["", "eine", "zwei", "drei", "vier"];

/* Die Kurzwahl ergänzt den Hausblock zu einer Schweizer Nummer (41 und
   neun Ziffern). Es passt also genau eine Länge: beim Präfix
   «+41 41 926 2» (acht Ziffern) drei. Ein Präfix ausserhalb dieses
   Musters liefert 0 – dann wird nie ergänzt. */
function kurzwahlLaenge() {
  const p = Modell.telefonPraefix().replace(/\D/g, "");
  const n = 11 - p.length;
  return p.indexOf("41") === 0 && n >= 1 && n <= 4 ? n : 0;
}

function kurzwahlGueltig(k) {
  const n = kurzwahlLaenge();
  return n ? new RegExp("^\\d{" + n + "}$").test(k) : /^\d{1,4}$/.test(k);
}

/* Die volle Nummer zu einer Kurzwahl, oder "" wenn die Länge nicht passt. */
function vollAusKurzwahl(k) {
  return kurzwahlLaenge() && kurzwahlGueltig(k) ? Modell.telefonVoll(k) : "";
}

function kurzwahlRegelText() {
  const n = kurzwahlLaenge();
  return n ? "Die Kurzwahl hat genau " + ZAHLWOERTER[n] + " Ziffern, zum Beispiel " + "3735".slice(0, n) + "."
    : "Die Kurzwahl besteht aus ein bis vier Ziffern.";
}

function kurzwahlHinweis() {
  const n = kurzwahlLaenge();
  return n
    ? "Genau " + ZAHLWOERTER[n] + " Ziffern aus dem Hausblock " + Modell.telefonPraefix()
      + " …, der Schlüssel der Liste. Daraus wird die Telefonnummer ergänzt."
    : "Der Schlüssel der Liste, ein bis vier Ziffern.";
}

/* Weicht die gespeicherte Nummer vom Vorschlag der gespeicherten Kurzwahl
   ab, hat sie jemand bewusst gesetzt – dann überschreibt die Kurzwahl sie
   nicht mehr. Aus dem gespeicherten Stand, nie aus dem Entwurf: so stimmt
   es auch nach «Verwerfen» (Fehler D2). */
function nummerVonHandBestimmen() {
  const gespeichert = String((zeile && zeile.Telefonnummer) || "").trim();
  const vorschlag = vollAusKurzwahl(String((zeile && zeile.Title) || "").trim());
  nummerVonHand = !!gespeichert && Modell.telefonFormat(gespeichert) !== vorschlag;
}


/* ==================================================================
   4. Auswertung
   ================================================================== */

function textWert(feld) { return entwurf.textWert(feld); }

/* Die Person, die im AD die angegebene Nummer hat. */
function personZurNummer(nummer, kurz) {
  const ziffern = Modell.telefonZiffern(String(nummer || "").trim())
    || Modell.telefonZiffern(vollAusKurzwahl(String(kurz || "").trim()));
  if (!ziffern) return null;
  for (const b of alleBenutzer) {
    if (Modell.telefonZiffern(b.Telefon) === ziffern) return b;
  }
  return null;
}

/* … mit dem Entwurf: wer die Kurzwahl ändert, sieht sofort die passende Person. */
function personAusAd() { return personZurNummer(textWert("Telefonnummer"), textWert("Title")); }

/* Ersatzweise die Person aus der Spalte «Benutzer» (vom Abgleich geschrieben). */
function personAusSpalte() {
  const login = Modell.schluessel(zeile ? zeile.Benutzer : "");
  if (!login) return null;
  for (const b of alleBenutzer) if (Modell.schluessel(b.Title) === login) return b;
  return null;
}

function person() { return personAusAd() || personAusSpalte(); }

function statusWert() { return Modell.telefonStatus(textWert("Status")); }

/* Was die Auswahl zeigt (D1): leer gilt als «Aktiv» und steht auch so da;
   ein unbekannter alter Wert bleibt sichtbar, statt still verloren zu gehen. */
function statusAnzeige() {
  const roh = textWert("Status").trim();
  if (!roh) return "Aktiv";
  const n = Modell.telefonStatus(roh);
  return n.toLowerCase() === roh.toLowerCase() ? n : roh;
}

function istZugewiesen() {
  return statusWert() !== "Frei"
    && !!(person() || textWert("Name").trim() || textWert("Benutzer").trim());
}

/* Andere Zeilen mit derselben Kurzwahl (Warnung, Sperre beim Speichern). */
function kurzwahlZwillinge() {
  const k = textWert("Title").trim();
  if (!k) return [];
  return alleTelefone.filter(z => String(z.id) !== String(elementId)
    && Modell.schluessel(z.Title) === Modell.schluessel(k));
}

function anzeigeName() {
  const kurz = textWert("Title").trim();
  if (neuModus && !kurz) return "Neue Telefonnummer";
  return kurz ? "Kurzwahl " + kurz : "Ohne Kurzwahl";
}

function vorschlaege(feld) {
  const werte = [];
  for (const z of alleTelefone) {
    const w = String(z[feld] || "").trim();
    if (w && werte.indexOf(w) === -1) werte.push(w);
  }
  return werte.sort(Hilfe.vergleiche);
}


/* ==================================================================
   5. Felder und Hinweise an Ort und Stelle
   ================================================================== */

function feldVon(feld) { return UI.$("tf-eingabe-" + feld); }

/* Ein Feld zeigt einen neuen Wert, der nicht getippt wurde (Kurzwahl →
   Nummer, «Name aus AD übernehmen»): schreibt nur, wenn anders – die
   Schreibmarke bleibt. Den Punkt «geändert» führt F.feld selbst nach. */
function feldZeigen(feld, wert) {
  const f = feldVon(feld);
  if (f && f.value !== UI.text(wert)) f.value = UI.text(wert);
}

/* Eine Formularzeile am Entwurf (F.feld, fenster.js): id «tf-eingabe-<Feld>»,
   Wert aus dem Entwurf, jede Eingabe hinein, Punkt «geändert» an Ort und
   Stelle – beim Anlegen keiner (Option «neu» des Entwurfs; wie im Client-
   und im Softwarefenster). Beschriftung aus spalten.js, Notizspalten als
   Textbereich. o: Optionen von F.feld (art, eingabe, hinweis, zusatz,
   beiEingabe – bei einer Auswahl beim Ändern). */
function feldZeile(feld, o) {
  const s = SPALTE[feld];
  return F.feld(feld, Object.assign({
    beschriftung: s.d,
    art: s.t === "Note" ? "textbereich" : "text",
    entwurf: entwurf
  }, o || {}));
}

/* Hinweise, die am Getippten hängen (Banner unter einem Feld), stehen in
   einem UI.hinweisPlatz: gebaut wird nur, wenn sich der Inhalt ändert
   (schluessel); erscheint er durch eine Eingabe, deckt er sich auf, beim
   Zeichnen steht er ruhig da. Ein anderer Bereich zeigt den Platz nicht. */
function hinweisSetzen(id, schluessel, bauen, ausEingabe) {
  const platz = UI.$(id);
  if (platz) platz.setzen(schluessel, bauen, { aufdecken: ausEingabe });
}

/* Zwillinge: dieselbe Kurzwahl steht schon in der Liste. */
function zwillingeNachfuehren(ausEingabe) {
  const zw = kurzwahlZwillinge();
  hinweisSetzen("tf-zwillinge", zw.map(z => z.id).join(","), function () {
    const namen = zw.map(z => "«" + (String(z.Name || "").trim() || "ohne Namen") + "» (Listen-ID " + z.id + ")");
    const oeffnen = zw.length === 1
      ? UI.knopf({ text: "Öffnen", variante: "leise", href: UI.adresse.telefon(zw[0].id), fokus: "zwilling-oeffnen" })
      : null;
    return UI.banner({
      ton: "warnung",
      titel: "Diese Kurzwahl gibt es schon:",
      text: namen.join(", ") + ". Jede Kurzwahl darf nur einmal vorkommen.",
      knopf: oeffnen
    });
  }, ausEingabe);
}

/* Name und AD-Person verschieden? Dann ist die Liste veraltet. */
function nameAdNachfuehren(ausEingabe) {
  const b = person();
  const name = textWert("Name").trim();
  const adName = b ? String(b.__name || "").trim() : "";
  const zeigen = !!adName && Modell.schluessel(name) !== Modell.schluessel(adName);
  hinweisSetzen("tf-name-ad", zeigen ? "name|" + adName + "|" + name : "", function () {
    const knopf = UI.knopf({ text: "Name aus AD übernehmen", variante: "leise", beiKlick: function () {
      entwurf.setzeWert("Name", adName);
      feldZeigen("Name", adName);
      if (!textWert("Typ").trim()) { entwurf.setzeWert("Typ", "Person"); feldZeigen("Typ", "Person"); }
      if (statusWert() === "Frei") { entwurf.setzeWert("Status", "Aktiv"); feldZeigen("Status", "Aktiv"); }
      statusHinweisNachfuehren();
      abhaengigeNachfuehren(false);
      const f = feldVon("Name");
      if (f) f.focus();
    }, fokus: "name-aus-ad" });
    return UI.banner({
      ton: "warnung",
      text: name
        ? "In der Liste steht «" + name + "», im AD hat «" + adName + "» diese Nummer."
        : "Die Nummer hat noch keinen Namen; im AD gehört sie «" + adName + "».",
      knopf: knopf
    });
  }, ausEingabe);
}

/* «Frei», aber im AD bei jemandem hinterlegt (nur, wenn der Name schon
   stimmt – sonst setzt «Name aus AD übernehmen» den Status gleich mit). */
function statusAdNachfuehren(ausEingabe) {
  const b = person();
  const adName = b ? String(b.__name || "").trim() : "";
  const nameStimmt = !adName || Modell.schluessel(textWert("Name").trim()) === Modell.schluessel(adName);
  const zeigen = !!adName && nameStimmt && statusWert() === "Frei";
  hinweisSetzen("tf-status-ad", zeigen ? "frei|" + adName : "", function () {
    const knopf = UI.knopf({ text: "Auf «Aktiv» setzen", variante: "leise", beiKlick: function () {
      entwurf.setzeWert("Status", "Aktiv");
      feldZeigen("Status", "Aktiv");
      statusHinweisNachfuehren();
      abhaengigeNachfuehren(false);
      const f = feldVon("Status");
      if (f) f.focus();
    }, fokus: "status-aktiv" });
    return UI.banner({
      ton: "warnung",
      text: "Die Nummer steht auf «Frei», ist im AD aber bei «" + adName + "» hinterlegt.",
      knopf: knopf
    });
  }, ausEingabe);
}

const STATUS_HINWEISE = {
  Frei: "Sofort vergebbar; die Liste zeigt sie mit dem Status «Frei». Der Abgleich setzt die Nummer auf "
    + "«Aktiv», sobald sie im AD bei jemandem steht.",
  Inaktiv: "Vorhanden, aber nicht in Teams – etwa ein SIP-Apparat oder ein deaktiviertes Konto.",
  Aktiv: "In Betrieb. Ein leeres Feld gilt ebenfalls als «Aktiv»."
};

function statusHinweisNachfuehren() {
  const h = UI.$("tf-status-hinweis");
  if (h) UI.textSetzen(h, STATUS_HINWEISE[statusWert()] || "");
}

/* Alles, was an Nummer, Name und Status hängt. */
function abhaengigeNachfuehren(ausEingabe) {
  zwillingeNachfuehren(ausEingabe);
  nameAdNachfuehren(ausEingabe);
  statusAdNachfuehren(ausEingabe);
  personNachfuehren(ausEingabe);
}


/* ==================================================================
   6. Stammdaten
   ================================================================== */

function kurzwahlZeile() {
  const z = feldZeile("Title", {
    eingabe: { schmal: true, platzhalter: "3735".slice(0, kurzwahlLaenge() || 3) },
    hinweis: kurzwahlHinweis(),
    zusatz: UI.hinweisPlatz({ id: "tf-zwillinge" }),
    beiEingabe: function (v) {
      if (!nummerVonHand) {
        const voll = vollAusKurzwahl(v.trim());
        entwurf.setzeWert("Telefonnummer", voll);
        feldZeigen("Telefonnummer", voll);
      }
      abhaengigeNachfuehren(true);
    }
  });
  const feld = z.feld;
  feld.inputMode = "numeric";
  feld.maxLength = 4;
  /* Erst beim Verlassen des Felds auf die Länge hinweisen: beim Tippen
     von «3» und «37» wäre der Hinweis nur Lärm. */
  feld.addEventListener("change", function () {
    const v = feld.value.trim();
    if (v && !kurzwahlGueltig(v)) UI.feldFehler(feld, kurzwahlRegelText());
  });
  return z;
}

function stammdatenKarte() {
  const k = UI.karte({
    titel: "Stammdaten",
    /* Die Kurzwahl ist Pflicht (Schlüssel der Liste) – auch für eine Zeile
       mit Mobil- oder Fremdnummer; so sagt es die Karte gleich zu Beginn. */
    unter: neuModus ? "Die Kurzwahl braucht es immer: sie ist der Schlüssel der Liste. Die Telefonnummer "
        + "folgt ihr; eine Mobil- oder Fremdnummer trägst du von Hand ein."
      : "Von Hand gepflegt. Der Abgleich fasst diese Felder nicht an – ausser er füllt einen leeren Namen aus dem AD."
  });

  const statusHinweis = UI.el("span");
  statusHinweis.id = "tf-status-hinweis";

  k.inhalt.appendChild(UI.datenzeilen([
    kurzwahlZeile(),
    feldZeile("Telefonnummer", {
      art: "telefon",
      eingabe: { platzhalter: vollAusKurzwahl("3735".slice(0, kurzwahlLaenge() || 3)) || "+41 …" },
      hinweis: "Vollständige Nummer. Folgt der Kurzwahl; eine Mobil- oder Fremdnummer lässt sich hier eintragen.",
      beiEingabe: function (v) {
        // Wer die Nummer leert, lässt sie wieder der Kurzwahl folgen.
        nummerVonHand = !!v.trim() && Modell.telefonFormat(v) !== vollAusKurzwahl(textWert("Title").trim());
        abhaengigeNachfuehren(true);
      }
    }),
    feldZeile("Name", {
      hinweis: "Person, Dienst, Raum oder HelpFon. Leer lassen, wenn die Nummer frei ist.",
      zusatz: UI.hinweisPlatz({ id: "tf-name-ad" }),
      beiEingabe: function () { abhaengigeNachfuehren(true); }
    }),
    feldZeile("Typ", {
      art: "auswahl",
      eingabe: { werte: Modell.TELEFON_TYPEN, leer: "–", schmal: true }
    }),
    feldZeile("Status", {
      art: "auswahl",
      // Leer gespeichert zeigt die Auswahl «Aktiv» (D1).
      eingabe: { werte: Modell.TELEFON_STATUS_WERTE, wert: statusAnzeige(), schmal: true },
      hinweis: statusHinweis,
      zusatz: UI.hinweisPlatz({ id: "tf-status-ad" }),
      beiEingabe: function () { statusHinweisNachfuehren(); abhaengigeNachfuehren(true); }
    }),
    feldZeile("Apparat", {
      eingabe: { vorschlaege: vorschlaege("Apparat") },
      hinweis: "Teams, Tischtelefon, Headset, SIP-Apparat, HelpFon …"
    }),
    feldZeile("Standort", {
      eingabe: { vorschlaege: vorschlaege("Standort") },
      hinweis: "Gebäude und Raum des Apparats."
    })
  ]));
  return k;
}

/* Die Person aus dem AD. Ihr Inhalt hängt an der Nummer: er wird beim
   Tippen an Ort und Stelle getauscht, das Formular bleibt unberührt. */
function personKarte() {
  const k = UI.karte({
    titel: "Person aus dem Active Directory",
    unter: "Wer diese Nummer im AD-Feld «Telefon» hinterlegt hat. Das pflegt der AD-Abgleich."
  });
  k.id = "tf-personkarte";
  const inhalt = UI.el("div", "stapel");
  inhalt.id = "tf-person";
  k.inhalt.appendChild(inhalt);
  return k;
}

/* Noch keine Nummer (neues Formular, leere Kurzwahl): dann gibt es auch
   niemanden zu suchen – der Leerzustand sagt, was zu tun ist. */
function ohneNummer() {
  return !textWert("Title").trim() && !textWert("Telefonnummer").trim();
}

function personSchluessel() {
  const b = person();
  if (b) return "p|" + b.id + "|" + (personAusAd() ? "ad" : "spalte") + "|" + (b.__adAktiv ? 1 : 0);
  if (ohneNummer()) return "ohne";
  return "leer|" + textWert("Benutzer").trim();
}

function personInhalt() {
  const b = person();
  const teile = [];
  if (!b && ohneNummer()) {
    teile.push(UI.leerzustand({
      sinnbild: "telefon",
      titel: "Noch keine Nummer",
      text: "Sobald du eine Kurzwahl eingibst, steht hier, wer sie im AD-Feld «Telefon» hinterlegt hat."
    }));
  } else if (b) {
    const ausAd = !!personAusAd();
    const z = UI.listenZeile({
      titel: b.__name || b.Title,
      unter: [UI.text(b.Title), UI.text(b.Abteilung), UI.text(b.Funktion)],
      href: UI.adresse.benutzer(b.id),
      sinnbild: "benutzer",
      fokus: "person-" + b.id
    });
    teile.push(UI.zeilenliste([z]));
    /* Die Chips stehen unter der Zeile: in der halben Kartenbreite
       drückten sie sonst den Namen zusammen. */
    teile.push(UI.chips([
      b.__adAktiv ? UI.status("AD-Konto aktiv", "erfolg") : UI.status("AD-Konto deaktiviert", "gefahr"),
      UI.status(ausAd ? "Über AD-Telefonnummer" : "Über Spalte «Benutzer»", "neutral", {
        sinnbild: "verknuepfung",
        titel: ausAd ? "Die Nummer steht im AD-Feld «Telefon» dieser Person."
          : "Die Spalte «Benutzer (AD)» nennt diese Person; im AD-Feld «Telefon» steht die Nummer nicht."
      })
    ]));
    /* Ohne Schloss: die ganze Karte kommt aus dem AD, das sagt ihr Text
       einmal (Schlösser nur, wo gesperrte und änderbare Felder gemischt
       stehen – wie im Benutzer- und im Clientfenster). */
    teile.push(UI.datenzeilen([
      UI.feldZeile("Telefon im AD", b.Telefon),
      UI.feldZeile("Letzter AD-Sync", UI.zeitText(zeile ? zeile.ADLetzterSync : ""))
    ]));
  } else {
    teile.push(UI.leerzustand({
      sinnbild: "benutzer",
      titel: "Im AD hat niemand diese Nummer",
      text: "Für Dienste, Räume und HelpFons ist das normal. Bei einer Person fehlt im AD das Feld "
        + "«Telefon» – sobald es gesetzt ist, erscheint sie hier."
    }));
    const benutzerSpalte = textWert("Benutzer").trim();
    if (benutzerSpalte) {
      teile.push(UI.datenzeilen([UI.feldZeile("Benutzer (AD)", benutzerSpalte,
        { neben: "nicht (mehr) in der Benutzer-Liste" })]));
    }
  }
  return teile;
}

function personNachfuehren(ausEingabe) {
  const ziel = UI.$("tf-person");
  if (!ziel) return;
  const sig = personSchluessel();
  if (ziel.getAttribute("data-schluessel") === sig) return;
  const neu = ziel.hasAttribute("data-schluessel");
  const altePerson = personAusSchluessel(ziel.getAttribute("data-schluessel"));
  ziel.setAttribute("data-schluessel", sig);
  UI.leeren(ziel);
  UI.anhaengen(ziel, personInhalt());
  /* Aufgedeckt wird nur, wenn durch die Eingabe eine ANDERE Person
     erscheint – nicht bei jedem Zwischenstand des Tippens und nicht, wenn
     dieselbe Person nur über einen anderen Weg gefunden wird. */
  const neuePerson = personAusSchluessel(sig);
  if (ausEingabe && neu && neuePerson && neuePerson !== altePerson) Bewegung.aufdecken(ziel);
}

function personAusSchluessel(sig) {
  return sig && sig.indexOf("p|") === 0 ? sig.split("|")[1] : "";
}

/* Nach dem Bauen: Hinweise und Person ruhig füllen (ohne Auftritt). */
function stammdatenFuellen() {
  statusHinweisNachfuehren();
  abhaengigeNachfuehren(false);
}

function bereichStammdaten(ziel) {
  const raster = UI.el("div", "karten");
  raster.appendChild(stammdatenKarte());
  raster.appendChild(personKarte());
  ziel.appendChild(raster);
  stammdatenFuellen();
}

function bereichNeu(ziel) {
  const raster = UI.el("div", "karten");
  raster.appendChild(stammdatenKarte());
  raster.appendChild(personKarte());
  raster.appendChild(hinweisKarte(true));
  ziel.appendChild(raster);
  stammdatenFuellen();
}


/* ==================================================================
   7. Hinweis und Verlauf
   ================================================================== */

function hinweisKarte(breit) {
  const k = UI.karte({ titel: "Hinweis", unter: "Grund oder Bemerkung zu dieser Nummer, Freitext.", breit: !!breit });
  k.inhalt.appendChild(UI.datenzeilen([
    feldZeile("Hinweis", { eingabe: { zeilen: 4 } })
  ]));
  return k;
}

function bereichHinweis(ziel) {
  const stapel = UI.el("div", "stapel");
  stapel.appendChild(hinweisKarte(false));
  stapel.appendChild(verlaufEinbauen());
  ziel.appendChild(stapel);
}

/* Der Verlauf hängt am selben Entwurf wie alle Felder: verlauf.js meldet
   die fertige Zeichenkette, der Entwurf nimmt sie auf, «Speichern» schreibt
   sie. Die Karte (Titel, Zahl, «Neuer Eintrag») baut verlauf.js selbst. */
function verlaufEinbauen() {
  const huelle = UI.el("div", "tf-verlauf");
  huelle.setAttribute("data-rolle", "verlauf");
  Verlauf.zeichnen(huelle, {
    schluessel: "telefon",
    wert: entwurf.wert("Verlauf"),
    beiAenderung: function (json) { entwurf.setzeWert("Verlauf", json); },
    titel: "Verlauf",
    beschreibung: "Handwechsel, Freigabe, Apparat – auch, wer die Nummer früher hatte. Der Abgleich hängt eigene Einträge an."
  });
  return huelle;
}


/* ==================================================================
   8. Kopf und Schnellaktionen
   ================================================================== */

/* Läuft bei jedem Tastendruck: F.seitenkopf gleicht an Ort und Stelle ab,
   Knöpfe bleiben stehen, solange sich ihre Gestalt nicht ändert. */
function kopfZeichnen() {
  if (!zeile) return;
  const unter = [];
  const status = [];
  const aktionen = [];
  if (neuModus) {
    unter.push("Noch nicht angelegt");
  } else {
    unter.push(textWert("Telefonnummer").trim() || vollAusKurzwahl(textWert("Title").trim()));
    unter.push(textWert("Name").trim());
    unter.push(textWert("Typ").trim());

    /* Der Normalfall (Aktiv, zugewiesen) bekommt keinen Chip – nur was
       auffällt. «Frei» heisst immer auch «nicht zugewiesen»: ein Chip genügt,
       und er ist neutral (Haken im Kreis wie in der Liste): eine freie Nummer
       ist sofort vergebbar, kein Problem. Warnung bleibt «Nicht zugewiesen»
       für eine aktive oder inaktive Nummer ohne Person – so zählen sie auch
       Liste, Übersicht und Handlungsbedarf. */
    const s = statusWert();
    if (s === "Frei") status.push(UI.status("Frei", "neutral", { sinnbild: "checkKreis" }));
    else {
      if (s === "Inaktiv") status.push(UI.status("Inaktiv", "neutral", { sinnbild: "aus" }));
      if (!istZugewiesen()) status.push(UI.status("Nicht zugewiesen", "warnung"));
    }
    const b = person();
    if (b) status.push(UI.status(b.__name || b.Title, "neutral", { sinnbild: "benutzer" }));

    if (!F.geloescht()) aktionen.push.apply(aktionen, schnellaktionen());
  }
  F.seitenkopf({ titel: anzeigeName(), lead: neuModus ? LEAD_NEU : LEAD, unter: unter, status: status,
    aktionen: aktionen });
}

/* «Nummer freigeben» und «Löschen …». Beide sind bei ungespeicherten
   Änderungen gesperrt und nennen den Grund (Fehler D4). Ob es «Freigeben»
   gibt, entscheidet der GESPEICHERTE Stand – sonst sprängen die Knöpfe beim
   Tippen. */
function schnellaktionen() {
  const offen = entwurf.anzahl() > 0;
  const liste = [];

  if (Modell.telefonStatus(zeile.Status) !== "Frei") {
    /* Steht die Nummer im AD bei jemandem, setzte der nächste Abgleich sie
       sofort wieder auf «Aktiv» und trüge den Namen nach. */
    const imAd = personZurNummer(zeile.Telefonnummer, zeile.Title);
    liste.push(UI.knopf({ text: "Nummer freigeben", variante: "leise", sinnbild: "zuruecksetzen",
      titel: "Status «Frei»; der Name wandert in den Verlauf.", beiKlick: freigeben,
      gesperrt: offen ? GRUND_ENTWURF : (imAd ? "Im AD steht die Nummer bei «" + (imAd.__name || imAd.Title)
        + "»: der Abgleich setzte sie gleich wieder auf «Aktiv»." : "") }));
  }

  liste.push(UI.knopf({ text: "Löschen …", variante: "leise", sinnbild: "papierkorb", beiKlick: loeschen,
    gesperrt: offen ? GRUND_ENTWURF : "" }));
  return liste;
}

/* Freigeben: Status «Frei», Name in den Verlauf, Namensfeld leeren – und
   gleich speichern. Das ersetzt die frühere Spalte «Früherer Eintrag». */
async function freigeben() {
  if (entwurf.anzahl() || F.istBeschaeftigt()) return;
  const name = textWert("Name").trim();
  const kurz = textWert("Title").trim();
  const ja = await UI.bestaetigen({
    titel: "Kurzwahl " + kurz + " freigeben?",
    text: name ? "Der Status wird «Frei», «" + name + "» wandert in den Verlauf und das Namensfeld wird geleert."
      : "Der Status wird «Frei».",
    ja: "Freigeben"
  });
  if (!ja || entwurf.anzahl()) return;
  entwurf.setzeWert("Status", "Frei");
  if (name) entwurf.setzeWert("Name", "");
  entwurf.setzeWert("Verlauf", F.verlaufAnhaengen(entwurf.wert("Verlauf"),
    "Freigegeben" + (name ? " (vorher: " + name + ")" : "")));
  ohneAutoVerlauf = true;
  let ok = false;
  try {
    ok = await speichernMit({ erfolgText: "Kurzwahl " + kurz + " ist jetzt frei.", fehlerText: "Freigeben fehlgeschlagen." });
  } finally {
    ohneAutoVerlauf = false;
  }
  /* Gescheitert: die Freigabe war nie eine Eingabe – nicht im Entwurf
     liegen lassen. */
  if (!ok && entwurf.anzahl()) {
    entwurf.leeren();
    zeichnenAlles();
  }
}

function loeschen() {
  if (entwurf.anzahl() || F.istBeschaeftigt()) return;
  const kurz = String(zeile.Title || "").trim();
  const id = zeile.id;
  /* «Nummer freigeben» empfehlen nur, wo es den Knopf gibt: eine schon
     freie Nummer (gespeicherter Stand, wie in schnellaktionen) hat ihn nicht. */
  const frei = Modell.telefonStatus(zeile.Status) === "Frei";
  F.loeschenDialog({
    titel: "Telefonnummer löschen?",
    text: "Die Zeile verschwindet aus der Liste «Telefonnummern» und landet im Papierkorb der "
      + "SharePoint-Site. Von dort lässt sie sich 93 Tage lang zurückholen.",
    warnung: frei
      ? "Die Nummer ist frei und bleibt so vergebbar. Lösche sie nur, wenn es sie nicht mehr gibt."
      : "Meist ist «Nummer freigeben» die bessere Wahl: die Nummer bleibt bekannt, und wer sie hatte, "
        + "steht im Verlauf. Lösche nur, wenn es die Nummer nicht mehr gibt.",
    wort: kurz || "löschen",
    knopfText: "Endgültig löschen",
    fehlerText: "Löschen fehlgeschlagen.",
    beiLoeschen: async function () {
      await Daten.loeschen("telefon", id);
      F.melden("telefon-geloescht", id);
      entwurf.leeren();
    },
    ende: {
      titel: "Telefonnummer gelöscht",
      text: (kurz ? "Die Kurzwahl " + kurz : "Die Nummer") + " ist aus der Liste entfernt und liegt im "
        + "Papierkorb der SharePoint-Site.",
      knopfText: "Zur Liste"
    }
  });
}


/* ==================================================================
   9. Zeichnen
   ================================================================== */

function zeichnenAlles() {
  kopfZeichnen();
  navZeichnen();
  zeichneBereich();
  speicherleisteZeichnen();
}


/* ==================================================================
   10. Laden
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
    if (!still) F.fortschritt("Telefonnummern " + UI.zahlText(anzahlTelefone) + " · Benutzer " + UI.zahlText(anzahlBenutzer));
  }
  if (!still) F.zeigeLaden(mockModus ? "Vorführdaten werden aufgebaut …" : "Daten werden aus SharePoint geladen …");

  const [rohTelefone, rohBenutzer] = await Promise.all([
    Daten.telefone(function (n) { anzahlTelefone = n; fortschritt(); }),
    Daten.benutzer(function (n) { anzahlBenutzer = n; fortschritt(); })
  ]);

  /* Die Benutzer brauchen ihre abgeleiteten Felder (__name, __adAktiv);
     Modell.anreichern liefert sie auch ohne Geräte und Programme. */
  alleBenutzer = Modell.anreichern([], rohBenutzer, null).benutzer;
  alleTelefone = Modell.telefoneAnreichern(rohTelefone, alleBenutzer).telefone;
  F.stand();
}

function zeileWaehlen() {
  if (neuModus) {
    zeile = leereZeile();
    nummerVonHand = false;
    return;
  }
  const treffer = alleTelefone.filter(z => String(z.id) === String(elementId))[0];
  if (!treffer) {
    const fehler = new Error("Zur Listen-ID " + elementId + " gibt es keine Zeile in der Liste "
      + "«Telefonnummern». Vermutlich wurde sie inzwischen gelöscht.");
    fehler.nichtGefunden = true;
    throw fehler;
  }
  zeile = treffer;
  nummerVonHandBestimmen();
}

let vorbelegt = false;

/* Füllt ein neues Formular aus der übergebenen Person vor: ihre AD-Nummer,
   daraus die Kurzwahl (nur aus dem Hausblock und in passender Länge), ihr
   Name und «Person» als Typ – dasselbe, was «Name aus AD übernehmen»
   setzt. Nur einmal, beim ersten Laden. Die Werte stehen im Entwurf wie
   getippte («n Angaben erfasst»; «Formular leeren» leert sie). Eine
   Nummer ausserhalb des Hausblocks bleibt von Hand gesetzt, die Kurzwahl
   leer – die Prüfung fragt dann nach ihr. */
function vorbelegen() {
  if (vorbelegt || !neuModus || !VORBELEGEN_AUS) return;
  vorbelegt = true;
  const b = alleBenutzer.filter(z => String(z.id) === String(VORBELEGEN_AUS))[0];
  const nummer = b ? Modell.telefonFormat(b.Telefon) : "";
  if (!nummer) return;
  const kurz = Modell.telefonKurzwahl(nummer);
  if (kurz && kurzwahlGueltig(kurz)) entwurf.setzeWert("Title", kurz);
  entwurf.setzeWert("Telefonnummer", nummer);
  // Gleicht die Nummer dem Vorschlag der Kurzwahl, folgt sie ihr weiter.
  nummerVonHand = nummer !== vollAusKurzwahl(textWert("Title").trim());
  const name = String(b.__name || "").trim();
  if (name) {
    entwurf.setzeWert("Name", name);
    entwurf.setzeWert("Typ", "Person");
  }
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
    vorbelegen();
    zeichnenAlles();
    await F.zeigeInhalt();
    return true;
  } catch (fehler) {
    ladefehlerZeigen(fehler);
    return false;
  }
}

function ladefehlerZeigen(fehler) {
  F.ladefehler(fehler, { titel: "Telefonnummer nicht gefunden",
    hinweis: "Gelöschte Zeilen liegen 93 Tage im Papierkorb der SharePoint-Site und lassen sich dort zurückholen." });
}


/* ==================================================================
   11. Prüfen, Speichern, Anlegen, Verwerfen
   ================================================================== */

/* Geprüft wird, was sich geändert hat: eine alte Zeile mit unüblicher
   Kurzwahl bleibt bearbeitbar, solange niemand die Kurzwahl anfasst. */
function pruefen() {
  const kurz = textWert("Title").trim();
  const kurzNeu = neuModus || entwurf.istGeaendert("Title");
  if (kurzNeu && !kurz) return { feld: "Title", text: "Die Kurzwahl fehlt. Sie ist der Schlüssel der Liste, zum Beispiel 373." };
  if (kurzNeu && !kurzwahlGueltig(kurz)) return { feld: "Title", text: kurzwahlRegelText() };
  if (kurzNeu && kurzwahlZwillinge().length) {
    return { feld: "Title", text: "Die Kurzwahl " + kurz + " gibt es schon. Jede Kurzwahl darf nur einmal vorkommen." };
  }
  if (neuModus || entwurf.istGeaendert("Status")) {
    const st = textWert("Status").trim();
    if (st && Modell.TELEFON_STATUS_WERTE.indexOf(st) === -1) {
      return { feld: "Status", text: "Der Status ist «" + Modell.TELEFON_STATUS_WERTE.join("», «") + "»." };
    }
  }
  return null;
}

/* Werte so, wie Graph sie erwartet. Leere Texte gehen als null, damit
   SharePoint das Feld wirklich leert. */
function fuerGraph(feld, roh) {
  const t = (roh === null || roh === undefined) ? "" : String(roh);
  if (feld === "Telefonnummer") {
    const f = t.trim();
    return f ? Modell.telefonFormat(f) : null;
  }
  if (feld === "Verlauf") return t;
  return t.trim() === "" ? null : t;
}

async function anlegen() {
  const felder = {};
  for (const s of SPALTEN) {
    if (!Modell.istBearbeitbar(s)) continue;
    const w = fuerGraph(s.i, entwurf.wert(s.i));
    if (w !== null && w !== "") felder[s.i] = w;
  }
  /* Leere Nummer: aus der Kurzwahl ergänzen (pruefen hat ihre Länge geprüft). */
  if (!felder.Telefonnummer) {
    const voll = vollAusKurzwahl(textWert("Title").trim());
    if (voll) felder.Telefonnummer = voll;
  }
  if (!felder.Verlauf) {
    felder.Verlauf = Modell.verlaufSchreiben([Modell.verlaufEintrag("", "Im Frontend neu erfasst")]);
  }
  const neue = await Daten.anlegen("telefon", felder);
  elementId = String(neue.id);
  neuModus = false;
  // Felder und das eTag der neuen Zeile gleich mitnehmen (scheitert das
  // Nachladen, speichert die nächste Änderung trotzdem mit Konfliktschutz).
  zeile = F.uebernehmen(Object.assign(leereZeile(), { id: elementId }), felder, neue);
  entwurf.leeren();
  nummerVonHandBestimmen();
  aktiverBereich = "stammdaten";
  // Fehler A2: die Adresse zeigt gleich auf die neue Zeile (Neuladen geht).
  history.replaceState(null, "", UI.adresse.telefon(elementId, { bereich: "stammdaten" }));
  F.melden("telefon-neu", elementId);
  return { neu: true };
}

async function aendern() {
  const aenderungen = entwurf.aenderungen();
  const felder = {};
  for (const feld of Object.keys(aenderungen)) {
    if (Modell.istBearbeitbar(SPALTE[feld])) felder[feld] = fuerGraph(feld, aenderungen[feld]);
  }
  /* Leere Nummer: aus der Kurzwahl ergänzen, damit die Zeile vollständig ist. */
  if (!textWert("Telefonnummer").trim()) {
    const voll = vollAusKurzwahl(textWert("Title").trim());
    if (voll) felder.Telefonnummer = voll;
  }
  /* Status- und Namenswechsel stehen automatisch im Verlauf. */
  const eintraege = [];
  if (entwurf.istGeaendert("Status")) {
    const alt = Modell.telefonStatus(zeile.Status);
    const neu = statusWert();
    if (alt !== neu) eintraege.push("Status geändert: " + alt + " → " + neu);
  }
  if (entwurf.istGeaendert("Name")) {
    const alt = String(zeile.Name || "").trim();
    const neu = textWert("Name").trim();
    if (alt !== neu) {
      eintraege.push(neu ? (alt ? "Name geändert: " + alt + " → " + neu : "Name eingetragen: " + neu)
        : "Name entfernt: " + alt);
    }
  }
  if (eintraege.length && !ohneAutoVerlauf) {
    let v = entwurf.wert("Verlauf");
    for (const e of eintraege) v = F.verlaufAnhaengen(v, e);
    felder.Verlauf = v;
  }

  const anzahl = entwurf.anzahl();
  if (!Object.keys(felder).length) {
    entwurf.leeren();
    return { anzahl: 0 };
  }
  const antwort = await Daten.speichern("telefon", elementId, felder, zeile.__etag);
  // Den geschriebenen Stand samt neuem eTag übernehmen: scheitert das
  // Nachladen, zeichnet die Seite aus ihm (A7), und der nächste
  // Speicherversuch meldet keinen falschen Konflikt (412).
  F.uebernehmen(zeile, felder, antwort);
  entwurf.leeren();
  nummerVonHandBestimmen();
  F.melden("telefon-geaendert", elementId);
  return { anzahl: anzahl };
}

function speichernMit(o) {
  const optionen = o || {};
  const neu = neuModus;
  return F.speicherAblauf({
    immer: neu,
    anzahl: function () { return entwurf.anzahl(); },
    pruefen: pruefen,
    schreiben: neu ? anlegen : aendern,
    nachladen: function () { return nachladenStill(); },
    zeichnen: zeichnenAlles,
    fehlerText: optionen.fehlerText || (neu ? "Anlegen fehlgeschlagen." : "Speichern fehlgeschlagen."),
    erfolgText: function (e) {
      if (e && e.neu) return "Telefonnummer angelegt.";
      if (!e || !e.anzahl) return false;
      if (optionen.erfolgText) return optionen.erfolgText;
      return e.anzahl === 1 ? "Änderung gespeichert." : e.anzahl + " Änderungen gespeichert.";
    }
  });
}

/* Die Speicherleiste reicht ein Klickereignis herein: nicht als Optionen lesen. */
function speichern() { return speichernMit({}); }

function verwerfen() {
  return F.verwerfen({ anzahl: entwurf.anzahl(), neuModus: neuModus, danach: function () {
    entwurf.leeren();
    nummerVonHandBestimmen();   // Fehler D2: wie beim Laden, nicht pauschal «false»
    if (neuModus) nummerVonHand = false;
    zeichnenAlles();
  } });
}


/* ==================================================================
   12. Start
   ================================================================== */

async function start() {
  if (!neuModus) aktiverBereich = F.hashBereich(BEREICHE) || aktiverBereich;
  // Die Schublade steht sofort, der aktive Bereich ist schon markiert.
  navZeichnen();
  F.logoZeichnen("telefone");
  F.bandZeichnen("Vorführmodus: alle Nummern und Personen sind erfunden. "
    + "Änderungen bleiben im Browser und gehen nie nach SharePoint.", function () {
      entwurf.leeren();
      F.melden("telefon-geaendert", elementId);
      neuLaden();
    });

  try {
    if (!mockModus) {
      F.zeigeLaden("Anmeldung wird geprüft …");
      await Auth.anmeldungSicherstellen();
    }
    F.kontoZeigen();
    if (!neuModus && !elementId) {
      F.zeigeFehler("Keine Telefonnummer angegeben",
        "Dieses Fenster braucht die Listen-ID in der Adresse, zum Beispiel telefon.html?id=5, "
        + "oder «?neu=1» für eine neue Nummer.",
        "Normalerweise öffnest du es aus der Liste der Telefonnummern.", "Zur Liste", function () { F.zurListe(); });
      return;
    }
    const ok = await neuLaden();
    // Neu: gleich in die Kurzwahl, sie ist das Einzige, was es braucht.
    if (ok && neuModus) {
      const f = feldVon("Title");
      if (f) f.focus();
    }
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

/* Ruhiger Takt statt «Neu laden»: nie mit Entwurf, beim Anlegen oder nach
   dem Löschen; den Rest prüft F.autoStarten (Ebene, Fokus im Feld, Tab). */
F.autoStarten(function () { return !!zeile && !neuModus && !F.geloescht() && !entwurf.anzahl(); }, nachladenStill);

start();

})();

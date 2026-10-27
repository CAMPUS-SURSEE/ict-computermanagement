/* software.js – Softwarefenster des ICT-Inventars (software.html).

   Wird aus der Software-Liste der Hauptseite als software.html?id=… im
   selben Tab geöffnet und zeigt eine Zeile der Liste «Software» in zwei
   Bereichen (Schublade):

     Stammdaten     Name, Programm-ID, Kategorie, Reihenfolge (Karte
                    «Programm»), AD-Gruppen und Bemerkung (Karte «Vergabe»).
     Berechtigte    Wer das Programm hat – Kennzahlen und die Personen nach
                    Stufe 2 (über eine AD-Gruppe) und Stufe 1 (von Hand).

   Mit ?neu=1 wird ein neues Programm erfasst: dasselbe Formular ohne
   Schublade, «Anlegen» statt «Speichern».

   Ein Programm ist zwei Dinge zugleich: eine Zeile in der Liste «Software»
   UND eine Textspalte in der Benutzer-Liste, deren interner Name die
   Programm-ID ist. Dort steht je Person die Berechtigungsstufe (0/1/2).
   Ohne diese Spalte wäre ein Programm wirkungslos, darum legt dieses
   Fenster sie beim Anlegen gleich mit an (Daten.programmSpalteAnlegen).
   Der Sync legt weiterhin nie eine Spalte an – das tut hier ein Mensch mit
   seinen eigenen Rechten.

   Daraus folgt die wichtigste Regel dieses Fensters: die Programm-ID ist
   nach dem Anlegen unveränderlich. Ein interner Spaltenname lässt sich in
   SharePoint nicht mehr ändern; eine neue ID ergäbe eine zweite Spalte,
   und alle bisherigen Berechtigungen blieben in der ersten liegen.

   Löschen entfernt nur die Zeile aus der Liste «Software». Die Spalte in
   der Benutzer-Liste bleibt mitsamt ihren Werten stehen – sie zu löschen
   würde Berechtigungen vernichten, und das gehört in die Listeneinstellungen
   von SharePoint (oder zu Entferne-Spalte.ps1), nicht in einen Klick hier.

   Gebaut wird nur über UI.* (bausteine.js, rahmen.js), Rahmen.*,
   Bewegung.* und das Gerüst der Detailseiten F (fenster.js, Präfix «sw»):
   Seitenkopf, Bereiche, Entwurf, Speicherablauf, Löschdialog, Nachladen.
   Neu gezeichnet wird still (F.zeichneBereich gleicht den Bestand ab und
   hält Fokus, Schreibmarke und Rollen); Zeilen und Kacheln tragen dafür
   einen Schlüssel (data-ds-key). Ein Auftritt spielt nur beim ersten
   Zeigen und beim Bereichswechsel; beim Nachladen zählen die Kennzahlen
   vom gezeigten Wert (Bewegung.hochzaehlen), und Zeilen gleiten nur bei
   Handlungen der Person (Bewegung.umordnen).

   Die Bauer der Bereiche bekommen ihren Behälter (ziel) und suchen darin,
   nicht im Dokument: er hängt beim Bauen nicht unbedingt schon in der
   Seite. Was am Getippten hängt (Prüfung der ID, Vorschau der Gruppen),
   führt nachZeichnen danach im gezeigten Bereich nach.

   Grundsätze wie überall: kein Framework, kein Inline-Script und niemals
   innerHTML mit Daten – jeder Wert geht über textContent in die Seite. */

"use strict";

(function () {

/* ==================================================================
   1. Parameter, Gerüst, Zustand
   ================================================================== */

const ABFRAGE = new URLSearchParams(location.search);
const mockModus = UI.adresse.mock();

let elementId = ABFRAGE.get("id");
let neuModus = ABFRAGE.get("neu") === "1";

const SPALTE = {};
for (const s of SPALTEN_SOFTWARE) SPALTE[s.i] = s;

const el = UI.el, $ = UI.$;

/* So viele Personen zeigt eine Liste zuerst; der Rest auf Klick. */
const PERSONEN_ANFANG = 20;

let alleSoftware = [];      // Liste «Software»
let alleBenutzer = [];      // Liste «Benutzer», angereichert (__name, __adAktiv)
let zeile = null;           // die Zeile dieses Fensters

/* Solange niemand die ID von Hand angefasst hat, folgt sie dem Namen –
   «Adobe Acrobat Pro» wird zu «AdobeAcrobatPro». */
let idVonHand = false;

let aktiverBereich = "stammdaten";
const aufgeklappt = { 1: false, 2: false };

const F = Fenster.erstellen("sw", { liste: "software", neuLaden: neuLaden, nachladen: nachladenStill });

/* Der Entwurf: was getippt, aber noch nicht gespeichert ist. Jede Änderung
   führt Speicherleiste und Kopf nach (an Ort und Stelle, ohne Neuaufbau).
   Beim Anlegen ist alles neu: F.feld zeigt dann keinen Punkt «geändert». */
const entwurf = F.entwurf(function () { return zeile; }, {
  beiAenderung: function () { speicherleisteZeichnen(); kopfZeichnen(); },
  neu: function () { return neuModus; }
});

const BEREICHE = [
  { k: "stammdaten", d: "Stammdaten", sinnbild: "dateiText", f: bereichStammdaten },
  { k: "berechtigte", d: "Berechtigte", sinnbild: "benutzerGruppe", f: bereichBerechtigte }
];

/* Eine Kennzahl als Kachel mit Schlüssel: beim ersten Zeigen zählt sie
   von 0 hoch (Bewegung.auftritt), nach einem stillen Neuzeichnen vom
   gezeigten Wert zum neuen (Bewegung.kennzahlenStill in zeichneBereich). */
function kennzahl(schluessel, zahl, optionen) {
  return UI.kachel(Object.assign({}, optionen, { wert: UI.zahlText(zahl), zahl: zahl, schluessel: schluessel }));
}

function sichtbareBereiche() {
  // Ein noch nicht angelegtes Programm hat keine Berechtigten.
  return neuModus ? [BEREICHE[0]] : BEREICHE;
}


/* ==================================================================
   2. Auswertung
   ================================================================== */

function programmId() { return entwurf.textWert("Title").trim(); }

function anzeigeName() {
  const name = entwurf.textWert("Name").trim();
  if (name) return name;
  const id = programmId();
  if (id) return id;
  return neuModus ? "Neues Programm" : "(ohne Namen)";
}

/* Die AD-Gruppen des Entwurfs (eine je Zeile) bzw. der gespeicherten Zeile. */
function adGruppen() { return Modell.adGruppen(entwurf.wert("AdGruppen")); }
function gespeicherteGruppen() { return Modell.adGruppen(zeile ? zeile.AdGruppen : ""); }

/* Andere Zeilen mit derselben Programm-ID: die ID ist der Spaltenname und
   darf darum nur einmal vorkommen. */
function idZwillinge() {
  const id = programmId();
  if (!id) return [];
  return alleSoftware.filter(function (z) {
    return String(z.id) !== String(elementId) && Modell.schluessel(z.Title) === Modell.schluessel(id);
  });
}

/* Vorschlag für die Programm-ID aus dem Namen: Buchstaben und Ziffern,
   Umlaute aufgelöst, höchstens 30 Zeichen, Beginn mit einem Buchstaben. */
function idAusName(name) {
  return String(name || "")
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .replace(/^[0-9]+/, "")
    .slice(0, 30);
}

/* Benutzer mit einer Berechtigung für dieses Programm, nach Stufe. */
function berechtigte(stufe) {
  const id = programmId();
  if (!id) return [];
  return alleBenutzer
    .filter(function (b) { return Modell.stufe(b[id]) === stufe; })
    .sort(function (a, b) { return Hilfe.vergleiche(a.__name, b.__name); });
}

function anzahlBerechtigte() { return berechtigte(1).length + berechtigte(2).length; }

function kategorien() {
  const werte = [];
  for (const z of alleSoftware) {
    const w = String(z.Kategorie || "").trim();
    if (w && werte.indexOf(w) === -1) werte.push(w);
  }
  return werte.sort(Hilfe.vergleiche);
}

function personenText(n) { return n === 1 ? "1 Person" : UI.zahlText(n) + " Personen"; }

/* ---------- Gibt es die Spalte in der Benutzer-Liste? ----------

   Sie steht nicht in spalten.js, darum wird sie an den geladenen
   Benutzerzeilen abgelesen: Graph liefert ein Feld erst, wenn die Spalte
   existiert UND einen Wert trägt. Eine ganz leere Spalte lässt sich so nicht
   von einer fehlenden unterscheiden – deshalb ist «nicht gefunden» nur ein
   Hinweis. Hat jemand die Spalte hier angelegt oder bestätigt, merkt sich
   der Tab das (sessionStorage), sonst stünde der Hinweis bei jedem Laden
   wieder da, bis die erste Person das Programm bekommt. */
const SPALTEN_SPEICHER = "ictinventar.software.spalten" + (mockModus ? ".mock" : "");

function bestaetigteSpalten() {
  try {
    const liste = JSON.parse(sessionStorage.getItem(SPALTEN_SPEICHER) || "[]");
    return Array.isArray(liste) ? liste : [];
  } catch (e) {
    return [];
  }
}

function spalteBestaetigen(id) {
  const liste = bestaetigteSpalten();
  if (liste.indexOf(id) === -1) liste.push(id);
  try { sessionStorage.setItem(SPALTEN_SPEICHER, JSON.stringify(liste)); } catch (e) { /* privat */ }
}

function spalteGefunden() {
  const id = programmId();
  if (!id) return false;
  if (bestaetigteSpalten().indexOf(id) !== -1) return true;
  return alleBenutzer.some(function (b) { return Object.prototype.hasOwnProperty.call(b, id); });
}

function spalteFehlt() { return !neuModus && !!programmId() && !spalteGefunden(); }


/* ==================================================================
   3. Felder
   ================================================================== */

/* Ein Feld der Liste am Entwurf über F.feld: id «sw-eingabe-<Feld>»
   (Fokus beim Neuzeichnen, Feldfehler aus F.speicherAblauf), Beschriftung
   aus spalten.js, die Art aus dem Spaltentyp; der Punkt «geändert» folgt
   dem Entwurf (beim Anlegen keiner, Option «neu» des Entwurfs).
   Die Reihenfolge ist ein Textfeld, kein Zahlenfeld (reihenfolgeZeile). */
function feldZeile(feld, optionen) {
  const s = SPALTE[feld];
  return F.feld(feld, Object.assign({
    beschriftung: s.d,
    art: s.t === "Note" ? "textbereich" : (s.t === "Number" ? "zahl" : "text")
  }, optionen));
}

const ID_REGEL = "Nur A–Z, a–z und 0–9, beginnend mit einem Buchstaben, höchstens 30 Zeichen.";

/* Live-Prüfung der Programm-ID (nur beim Anlegen): ein Fehler steht am Feld
   (UI.feldFehler, wie beim Speichern), «in Ordnung» als Hinweis mit Haken
   (UI.feldHinweis).
   UI.feldFehler löscht sich bei der nächsten Eingabe selbst; weil dieser
   Zuhörer vorher registriert ist, setzt er den Fehler davor neu. */
function idPruefen(feldKnoten, hinweisKnoten) {
  const feld = feldKnoten || $("sw-eingabe-Title");
  const hinweis = hinweisKnoten || $("sw-id-pruefung");
  if (!feld || !hinweis || !neuModus) return;
  const id = programmId();
  let fehler = "";
  if (id && !Modell.programmIdGueltig(id)) {
    fehler = ID_REGEL;
  } else if (id && idZwillinge().length) {
    fehler = "Die Programm-ID «" + id + "» gibt es schon.";
  }
  UI.feldFehler(feld, fehler);
  if (fehler) UI.feldHinweis(hinweis, "");
  else if (id) {
    UI.feldHinweis(hinweis, "Wird als Spalte «" + id + "» in der Benutzer-Liste angelegt und lässt sich danach nicht mehr ändern.",
      { sinnbild: "checkKreis", ton: "erfolg" });
  } else UI.feldHinweis(hinweis, ID_REGEL);
}

/* Der Name zieht die ID mit, solange sie niemand von Hand gesetzt hat. */
function nameGeaendert(w) {
  if (!neuModus || idVonHand) return;
  const vorschlag = idAusName(w);
  entwurf.setzeWert("Title", vorschlag);
  const f = $("sw-eingabe-Title");
  if (f && f.value !== vorschlag) f.value = vorschlag;
  idPruefen();
}

/* Live-Vorschau der AD-Gruppen, so wie der Abgleich die Zeilen liest
   (ohne Leerzeilen und Doppelte): eine Meta-Zeile mit Teilen («2 Gruppen ·
   MgmtS_MarKom · BLD_D&G»). Status-Chips
   wären hier falsch – eine Gruppe ist kein Zustand. Bei jedem Tastendruck
   gleicht UI.abgleichen nur den Text ab. */
function gruppenVorschauZeichnen(zielKnoten) {
  const ziel = zielKnoten || $("sw-gruppen-vorschau");
  if (!ziel) return;
  const gruppen = adGruppen();
  UI.abgleichen(ziel, gruppen.length
    ? [UI.teile([gruppen.length === 1 ? "1 Gruppe" : gruppen.length + " Gruppen"].concat(gruppen))]
    : []);
  ziel.hidden = !gruppen.length;
}


/* ==================================================================
   4. Bereich «Stammdaten»
   ================================================================== */

function bereichStammdaten(ziel) {
  if (spalteFehlt()) ziel.appendChild(spaltenBanner());
  ziel.appendChild(UI.anhaengen(el("div", "karten"), [programmKarte(), vergabeKarte()]));
}

function programmKarte() {
  const k = UI.karte({ titel: "Programm" });

  k.inhalt.appendChild(UI.datenzeilen([
    // Name zuerst: er ist das, was ein Mensch kennt. Die ID folgt ihm.
    feldZeile("Name", { eingabe: { platzhalter: "Adobe Acrobat Pro" }, beiEingabe: nameGeaendert }),
    idZeile(),
    feldZeile("Kategorie", {
      eingabe: { platzhalter: "Zusatz-Software", vorschlaege: kategorien(), klasse: "sw-eingabe-kategorie" },
      hinweis: "Bestehende Kategorie wählen oder eine neue eingeben."
    }),
    reihenfolgeZeile()
  ]));
  return k;
}

/* Die Reihenfolge ist eine ganze Zahl ab 0. Als Textfeld (mit Ziffern-
   tastatur), nicht als type=number: dort deutet der Browser still um –
   «1,5» wurde zu «15» (Komma als Tausendertrenner), «1e» meldete er als
   leer. So kommt in den Entwurf, was dasteht, und pruefen() hält jede
   andere Eingabe (Komma, Punkt, Buchstaben, Minus) mit einem Feldfehler
   auf, statt sie umzudeuten. */
function reihenfolgeZeile() {
  const z = feldZeile("Reihenfolge", {
    art: "text",
    eingabe: { schmal: true, platzhalter: "z. B. 10" },
    hinweis: "Kleinere Zahlen stehen weiter vorne, leere am Ende. Kategorien richten sich nach ihrem kleinsten Wert."
  });
  z.feld.inputMode = "numeric";
  return z;
}

/** Leer oder eine ganze Zahl ab 0 (nur Ziffern). */
function reihenfolgeGueltig(roh) {
  const t = String(roh === null || roh === undefined ? "" : roh).trim();
  return t === "" || (/^\d+$/.test(t) && Number.isSafeInteger(Number(t)));
}

/* Die Programm-ID: beim Anlegen frei (mit Live-Prüfung), danach nur lesbar. */
function idZeile() {
  if (!neuModus) {
    const fest = UI.eingabe({ id: "sw-eingabe-Title", wert: entwurf.textWert("Title"), nurLesen: true,
      klasse: "sw-eingabe-id" });
    return UI.formZeile(SPALTE.Title.d, fest, {
      hinweis: "Interner Spaltenname in der Benutzer-Liste, nach dem Anlegen nicht mehr änderbar."
    });
  }
  const hinweis = el("p", "ds-field__hint");
  hinweis.id = "sw-id-pruefung";
  hinweis.setAttribute("aria-live", "polite");
  const z = feldZeile("Title", {
    eingabe: { platzhalter: "AdobeAcrobatPro", klasse: "sw-eingabe-id", maxLaenge: 30 },
    zusatz: hinweis,
    beiEingabe: function (w) {
      // Leer geräumt, folgt die ID beim nächsten Tippen im Namen wieder ihm.
      idVonHand = w.trim() !== "";
      idPruefen();
    }
  });
  idPruefen(z.feld, hinweis);
  return z;
}

function vergabeKarte() {
  const k = UI.karte({ titel: "Vergabe" });
  const vorschau = el("p", "ds-field__hint");
  vorschau.id = "sw-gruppen-vorschau";
  k.inhalt.appendChild(UI.datenzeilen([
    feldZeile("AdGruppen", {
      eingabe: { zeilen: 4, platzhalter: "MgmtS_MarKom\nBLD_D&G" },
      beiEingabe: function () { gruppenVorschauZeichnen(); },
      hinweis: "Eine Gruppe je Zeile (sAMAccountName). Der Abgleich berechtigt ihre Mitglieder automatisch.",
      zusatz: vorschau
    }),
    feldZeile("Bemerkung", {
      eingabe: { zeilen: 3, platzhalter: "Wozu das Programm dient, wer die Lizenzen verwaltet …" }
    })
  ]));
  gruppenVorschauZeichnen(vorschau);
  return k;
}

function spaltenBanner() {
  const id = programmId();
  const knopf = UI.knopf({ text: "Spalte anlegen", variante: "leise", beschaeftigt: "Spalte wird angelegt …",
    beiKlick: spalteAnlegen, fokus: "sw-spalte-anlegen" });
  const b = UI.banner({
    ton: "warnung",
    titel: "Spalte nicht gefunden.",
    text: "Die Spalte «" + id + "» fehlt in der Benutzer-Liste oder ist noch überall leer. "
      + "Fehlt sie, wirkt das Programm nicht.",
    knopf: knopf
  });
  b.id = "sw-spalten-banner";
  return b;
}

/* Legt die Spalte an (oder stellt fest, dass es sie schon gibt). Läuft in
   F.beschaeftigt: Speicherleiste und Kopfaktionen sind so lange gesperrt.
   Der Knopf zeigt die Arbeit (UI.beschaeftigt); scheitert sie, ist er
   sofort wieder frei und die Meldung nennt den Grund. Gelingt sie, geht
   das Banner über Bewegung.umordnen (die Karten darunter rücken nach) und
   es wird still nachgeladen. Der Fokus geht vorher an den Seitentitel,
   nicht ins erste Feld. */
async function spalteAnlegen(ev) {
  const id = programmId();
  if (!id || F.istBeschaeftigt()) return;
  const knopf = ev && ev.currentTarget;
  const schreiben = async function () {
    const neu = await Daten.programmSpalteAnlegen(id, entwurf.textWert("Name").trim() || id);
    spalteBestaetigen(id);
    return neu;
  };
  let erledigt = false;
  try {
    await F.beschaeftigt(async function () {
      const neu = await UI.beschaeftigt(knopf, schreiben);
      erledigt = true;
      UI.meldung(neu ? "Spalte «" + id + "» in der Benutzer-Liste angelegt."
        : "Die Spalte «" + id + "» gibt es schon – sie ist nur überall leer.");
    }, {
      nachladen: async function () {
        if (!erledigt) return;
        await bannerEntfernen();
        await nachladenStill();
      }
    });
  } catch (fehler) {
    UI.meldung("Spalte konnte nicht angelegt werden. " + F.fehlerText(fehler), { ton: "fehler" });
  }
}

function bannerEntfernen() {
  const banner = $("sw-spalten-banner");
  if (!banner) return Promise.resolve();
  if (banner.contains(document.activeElement)) {
    const titel = $("sw-titel");
    if (titel) titel.focus({ preventScroll: true });
  }
  return Bewegung.umordnen(banner.parentNode, function () { banner.remove(); });
}


/* ==================================================================
   5. Bereich «Berechtigte»
   ================================================================== */

function bereichBerechtigte(ziel) {
  const id = programmId();
  const stufe2 = berechtigte(2);
  const stufe1 = berechtigte(1);
  const alle = stufe1.length + stufe2.length;
  const inaktiv = stufe1.concat(stufe2).filter(function (b) { return !Modell.adStatus(b).aktiv; }).length;
  const gruppen = gespeicherteGruppen();

  const k = UI.karte({
    titel: "Berechtigte",
    // Die Benutzerliste der Hauptseite, gefiltert auf dieses Programm; wie
    // der Filter im Hash heisst, weiss nur UI.adresse (gleich wie app.js).
    fuss: [UI.knopf({ text: "In der Benutzer-Liste zeigen", variante: "leise", weiter: true,
      href: UI.adresse.liste("benutzer", { programm: id }),
      fokus: "sw-benutzerliste" })]
  });
  k.inhalt.appendChild(UI.kacheln([
    kennzahl("sw-kz-alle", alle, { text: "Mit Berechtigung",
      unter: "von " + UI.zahlText(alleBenutzer.length) + " Benutzern" }),
    kennzahl("sw-kz-stufe2", stufe2.length, { text: "Aus AD-Gruppe (Stufe 2)",
      unter: gruppen.length ? "vom Abgleich gesetzt" : "keine AD-Gruppe hinterlegt" }),
    kennzahl("sw-kz-stufe1", stufe1.length, { text: "Von Hand (Stufe 1)",
      unter: "auf der Benutzerseite gesetzt" }),
    kennzahl("sw-kz-inaktiv", inaktiv, { text: "AD-Konto deaktiviert", ton: inaktiv ? "gefahr" : undefined,
      unter: inaktiv ? "Berechtigung noch nötig?" : "alle Konten aktiv" })
  ]));
  ziel.appendChild(k);

  ziel.appendChild(UI.anhaengen(el("div", "karten"), [
    personenKarte(2, stufe2, gruppen),
    personenKarte(1, stufe1, gruppen)
  ]));
}

function personenKarte(stufe, liste, gruppen) {
  const k = UI.karte({
    titel: stufe === 2 ? "Aus einer AD-Gruppe" : "Von Hand vergeben",
    unter: stufe === 2
      ? "Entziehen lassen sich diese Berechtigungen nur über die AD-Gruppe."
      : "Der Abgleich ändert diese Berechtigungen nie.",
    aktionen: liste.length ? [el("span", "anzahl", personenText(liste.length))] : []
  });

  if (!liste.length) {
    k.inhalt.appendChild(stufe === 2 ? leerStufe2(gruppen) : UI.leerzustand({
      sinnbild: "benutzer",
      titel: "Niemand von Hand berechtigt",
      text: "Vergeben wird auf der Benutzerseite unter «Berechtigungen»."
    }));
    return k;
  }

  const sichtbar = aufgeklappt[stufe] ? liste : liste.slice(0, PERSONEN_ANFANG);
  const zeilen = UI.zeilenliste(sichtbar.map(function (b) { return personZeile(b, stufe); }));
  zeilen.setAttribute("data-ds-key", "sw-personen-" + stufe);
  k.inhalt.appendChild(zeilen);
  if (sichtbar.length < liste.length) {
    k.inhalt.appendChild(UI.knopf({ text: "Alle " + personenText(liste.length) + " zeigen",
      beiKlick: function (ev) { alleZeigen(stufe, ev.currentTarget); }, fokus: "sw-alle-" + stufe }));
  }
  return k;
}

/* «Alle zeigen»: die übrigen Zeilen blenden unter den ersten ein
   (Bewegung.umordnen), der Knopf geht, und der Fokus steht auf der ersten
   neuen Zeile – dort liest man weiter. */
function alleZeigen(stufe, mehr) {
  aufgeklappt[stufe] = true;
  const karte = mehr.closest(".karte-inhalt") || mehr.parentNode;
  const liste = karte ? karte.querySelector('[data-ds-key="sw-personen-' + stufe + '"]') : null;
  const alle = berechtigte(stufe);
  if (!liste) { zeichneBereich(); return; }
  Bewegung.umordnen(karte, function (o) {
    UI.abgleichen(liste, alle.map(function (b) { return personZeile(b, stufe); }), o);
    mehr.remove();
  }, { eintraege: ".ds-list__item" });
  const erste = alle[PERSONEN_ANFANG];
  const neu = erste ? liste.querySelector('[data-ds-key="sw-person-' + stufe + "-" + erste.id + '"]') : null;
  if (neu) neu.focus();
}

function leerStufe2(gruppen) {
  if (gruppen.length) {
    return UI.leerzustand({
      sinnbild: "benutzerGruppe",
      titel: "Niemand über AD-Gruppen berechtigt",
      text: "Die Mitglieder von «" + gruppen.join("», «") + "» erhalten das Programm beim nächsten Abgleich."
    });
  }
  const l = UI.leerzustand({
    sinnbild: "benutzerGruppe",
    titel: "Keine AD-Gruppe hinterlegt",
    aktion: { text: "AD-Gruppen eintragen", beiKlick: zuDenGruppen, fokus: "sw-zu-gruppen" }
  });
  return l;
}

function zuDenGruppen() {
  bereichWechseln("stammdaten").then(function () {
    const f = $("sw-eingabe-AdGruppen");
    if (f) f.focus();
  });
}

function personZeile(b, stufe) {
  const name = b.__name || String(b.Title || "").trim() || "–";
  const login = String(b.Title || "").trim();
  const teile = [login !== name ? login : "", String(b.Abteilung || "").trim()].filter(Boolean);
  // Eine Regel und ein Text für alle Seiten (Modell.adStatus).
  const ad = Modell.adStatus(b);
  const z = UI.listenZeile({
    titel: name,
    unter: teile.length ? teile : null,
    href: UI.adresse.benutzer(b.id, { bereich: "berechtigungen" }),
    status: ad.aktiv ? null : UI.status(ad.text, ad.ton),
    fokus: "sw-person-" + stufe + "-" + b.id
  });
  z.setAttribute("data-ds-key", "sw-person-" + stufe + "-" + b.id);
  return z;
}


/* ==================================================================
   6. Seitenkopf, Schublade, Speicherleiste
   ================================================================== */

/* Die Teile unter dem Titel: ID, Kategorie und wie vergeben wird. Ein
   Status-Chip steht nur für die Abweichung (Spalte fehlt); die Zahl der
   Gruppen und Berechtigten ist kein Zustand. */
function kopfTeile() {
  if (neuModus) return [];
  const gruppen = adGruppen();
  const n = anzahlBerechtigte();
  return [
    programmId(),
    entwurf.textWert("Kategorie").trim(),
    gruppen.length ? (gruppen.length === 1 ? "1 AD-Gruppe" : gruppen.length + " AD-Gruppen") : "Nur von Hand vergeben",
    n ? personenText(n) + " berechtigt" : "Niemand berechtigt"
  ];
}

function statusChips() {
  return spalteFehlt() ? [UI.status("Spalte nicht gefunden", "warnung")] : [];
}

/* «Löschen …» steht im Kopf statt als roter Knopf in der Karte. Mit
   ungespeicherten Änderungen ist es gesperrt und nennt den Grund. */
function kopfAktionen() {
  if (neuModus || F.geloescht()) return [];
  return [UI.knopf({ text: "Löschen …", variante: "leise", sinnbild: "papierkorb", beiKlick: loeschenDialog,
    gesperrt: entwurf.anzahl() > 0 ? "Zuerst speichern oder verwerfen." : "" })];
}

/* Darf bei jedem Tastendruck laufen: F.seitenkopf gleicht an Ort und
   Stelle ab (Titel, Teile, Chips nur bei Änderung; Knöpfe bleiben stehen). */
function kopfZeichnen() {
  F.seitenkopf({
    titel: anzeigeName(),
    unter: kopfTeile(),
    status: statusChips(),
    aktionen: kopfAktionen()
  });
}

function navZeichnen() {
  if (neuModus) {
    F.navZeichnen([], null, null, { verstecken: true });
    return;
  }
  F.navZeichnen(BEREICHE, aktiverBereich, bereichWechseln, {
    zusatz: function (b) { return b.k === "berechtigte" ? (anzahlBerechtigte() || null) : null; }
  });
}

/* Still neu zeichnen: die Kennzahlen zählen vom gezeigten Wert, danach
   führt nachZeichnen nach, was am Getippten hängt. */
function zeichneBereich() {
  Bewegung.kennzahlenStill($("sw-bereich"), function () {
    aktiverBereich = F.zeichneBereich(sichtbareBereiche(), aktiverBereich);
  });
  nachZeichnen();
}

/* Was am Entwurf hängt, im gezeigten Bereich nachführen (Prüfung der
   Programm-ID, Vorschau der Gruppen). Läuft nach jedem Zeichnen: ein
   abgeglichener Bereich behält seine Knoten, ihr Inhalt soll trotzdem zum
   Entwurf passen. */
function nachZeichnen() {
  idPruefen();
  gruppenVorschauZeichnen();
}

/* Bereichswechsel: replaceState statt location.hash (kein Verlaufseintrag
   je Bereich), die Pille gleitet, der Bereich blendet durch. */
function bereichWechseln(schluessel) {
  aktiverBereich = schluessel;
  return F.bereichWechseln(sichtbareBereiche(), schluessel).then(function (k) {
    if (k) aktiverBereich = k;
    nachZeichnen();
    return k;
  });
}

function speicherleisteZeichnen() {
  F.speicherleisteZeichnen({ neuModus: neuModus, anzahl: entwurf.anzahl(), neuText: "Neues Programm" });
}

function zeichnenAlles() {
  kopfZeichnen();
  navZeichnen();
  zeichneBereich();
  speicherleisteZeichnen();
}


/* ==================================================================
   7. Laden
   ================================================================== */

function leereZeile() {
  const z = {};
  for (const s of SPALTEN_SOFTWARE) z[s.i] = "";
  z.id = null;
  return z;
}

async function datenLaden(still) {
  let nSoftware = 0, nBenutzer = 0;
  function fortschritt() {
    if (!still) F.fortschritt("Software " + UI.zahlText(nSoftware) + " · Benutzer " + UI.zahlText(nBenutzer));
  }
  const ergebnis = await Promise.all([
    Daten.software(function (n) { nSoftware = n; fortschritt(); }),
    Daten.benutzer(function (n) { nBenutzer = n; fortschritt(); })
  ]);
  alleSoftware = ergebnis[0];
  /* Die Benutzer brauchen ihre abgeleiteten Felder (__name, __adAktiv);
     Modell.anreichern liefert sie auch ohne Clients und Programme. */
  alleBenutzer = Modell.anreichern([], ergebnis[1], null).benutzer;
}

function zeileWaehlen() {
  if (neuModus) {
    zeile = leereZeile();
    return;
  }
  const treffer = alleSoftware.filter(function (z) { return String(z.id) === String(elementId); })[0];
  if (!treffer) {
    const fehler = new Error("In der Liste «Software» gibt es keine Zeile mit der Listen-ID " + elementId + ".");
    fehler.nichtGefunden = true;
    throw fehler;
  }
  zeile = treffer;
}

/* Still nachladen und neu zeichnen (Auto-Nachladen, nach dem Speichern,
   nach F.beschaeftigt): ohne Ladezustand und ohne Auftritt. */
async function nachladenStill() {
  await datenLaden(true);
  zeileWaehlen();
  zeichnenAlles();
}

/* Mit Ladezustand («Erneut laden» nach einem Fehler, Vorführ-Reset). */
async function neuLaden() {
  F.zeigeLaden(neuModus ? "Formular wird vorbereitet …" : "Programm wird geladen …");
  try {
    await datenLaden(false);
    zeileWaehlen();
    zeichnenAlles();
    await F.zeigeInhalt();
  } catch (fehler) {
    ladefehlerZeigen(fehler);
  }
}

/* Titel und Dokumenttitel nennen den Fehler, nicht «wird geladen» (F.ladefehler). */
function ladefehlerZeigen(fehler) {
  F.ladefehler(fehler, { titel: "Programm nicht gefunden", knopfText: "Zur Software-Liste",
    hinweis: "Gelöschte Zeilen liegen 93 Tage im Papierkorb der SharePoint-Site und lassen sich dort zurückholen." });
}


/* ==================================================================
   8. Speichern, Anlegen, Verwerfen, Löschen
   ================================================================== */

function pruefen() {
  if (!entwurf.textWert("Name").trim()) return { feld: "Name", text: "Bitte einen Namen eingeben." };
  if (neuModus) {
    const id = programmId();
    if (!id) return { feld: "Title", text: "Bitte eine Programm-ID eingeben." };
    if (!Modell.programmIdGueltig(id)) {
      return { feld: "Title", text: ID_REGEL };
    }
    if (idZwillinge().length) {
      return { feld: "Title", text: "Die Programm-ID «" + id + "» gibt es schon." };
    }
  }
  // Nur, was hier eingegeben wurde: ein älterer gespeicherter Wert hält
  // das Speichern anderer Felder nicht auf.
  if (entwurf.istGeaendert("Reihenfolge") && !reihenfolgeGueltig(entwurf.wert("Reihenfolge"))) {
    return { feld: "Reihenfolge", text: "Die Reihenfolge ist eine ganze Zahl ab 0, ohne Komma, Punkt oder Buchstaben (z. B. 10)." };
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
       Doppelte – genau so liest der Sync sie wieder. */
    const g = Modell.adGruppen(t);
    return g.length ? g.join("\n") : null;
  }
  return t.trim() === "" ? null : t.trim();
}

/* Zuerst die Spalte, dann die Zeile: Scheitert das Anlegen der Spalte
   (fehlende Berechtigung), entsteht kein Programm, das nirgends wirkt.
   Umgekehrt bliebe eine Software-Zeile ohne Spalte zurück. */
async function anlegen() {
  const felder = {};
  for (const s of SPALTEN_SOFTWARE) {
    const w = fuerGraph(s.i, entwurf.wert(s.i));
    if (w !== null && w !== "") felder[s.i] = w;
  }
  await Daten.programmSpalteAnlegen(felder.Title, felder.Name || felder.Title);
  spalteBestaetigen(felder.Title);
  const neu = await Daten.anlegen("software", felder);
  elementId = String(neu.id);
  neuModus = false;
  // Lokal übernehmen: scheitert das Nachladen, steht trotzdem das Richtige da.
  zeile = Object.assign(leereZeile(), felder, neu);
  entwurf.leeren();
  idVonHand = false;
  aktiverBereich = "stammdaten";
  // Die Adresse zeigt jetzt auf das angelegte Programm: Neuladen und Teilen gehen.
  try { history.replaceState(null, "", UI.adresse.software(elementId, { bereich: "stammdaten" })); } catch (e) { /* file:// */ }
  F.melden("software-neu", elementId);
  return { neu: true };
}

async function aendern() {
  const aenderungen = entwurf.aenderungen();
  const felder = {};
  for (const feld of Object.keys(aenderungen)) {
    // Die Programm-ID ist der Spaltenname und darf sich nie ändern.
    if (feld === "Title") continue;
    felder[feld] = fuerGraph(feld, aenderungen[feld]);
  }
  const anzahl = Object.keys(felder).length;
  if (!anzahl) {
    entwurf.leeren();
    return { anzahl: 0 };
  }
  const antwort = await Daten.speichern("software", elementId, felder, zeile ? zeile.__etag : "");
  // Felder UND das neue eTag in die lokale Zeile (sonst 412 beim nächsten Speichern).
  F.uebernehmen(zeile, felder, antwort);
  entwurf.leeren();
  F.melden("software-geaendert", elementId);
  return { anzahl: anzahl };
}

/* F.speicherAblauf tut nichts ohne Änderungen, trennt Schreiben und
   Nachladen (scheitert das Nachladen, bleibt das Geschriebene gespeichert)
   und sperrt Leiste und Kopfaktionen, solange es läuft. */
function speichern() {
  const anlegenJetzt = neuModus;
  return F.speicherAblauf({
    anzahl: entwurf.anzahl,
    immer: anlegenJetzt,
    pruefen: pruefen,
    schreiben: anlegenJetzt ? anlegen : aendern,
    nachladen: nachladenStill,
    zeichnen: zeichnenAlles,
    fehlerText: anlegenJetzt ? "Anlegen fehlgeschlagen." : "Speichern fehlgeschlagen.",
    erfolgText: function (e) {
      if (e && e.neu) return "Programm und Spalte angelegt.";
      if (!e || !e.anzahl) return false;
      return e.anzahl === 1 ? "Änderung gespeichert." : e.anzahl + " Änderungen gespeichert.";
    }
  });
}

function verwerfen() {
  return F.verwerfen({ anzahl: entwurf.anzahl(), neuModus: neuModus, danach: function () {
    entwurf.leeren();
    idVonHand = false;
    zeichnenAlles();
  } });
}

/* Nach dem Löschen steht der Endzustand mit «Zur Software-Liste»
   (gemerkte Listenadresse); das Fenster schliesst sich nicht selbst. */
function loeschenDialog() {
  const id = programmId();
  const name = anzeigeName();
  F.loeschenDialog({
    titel: "Programm löschen?",
    text: "Die Zeile wird in den Papierkorb der SharePoint-Site verschoben und lässt sich dort 93 Tage lang zurückholen.",
    warnung: "Die Spalte «" + id + "» bleibt mit allen Werten in der Benutzer-Liste, der Abgleich übergeht sie aber. "
      + "Entfernen lässt sie sich nur in den Listeneinstellungen von SharePoint oder mit Entferne-Spalte.ps1.",
    wort: id,
    knopfText: "Löschen",
    beiLoeschen: async function () {
      await Daten.loeschen("software", zeile.id);
      F.melden("software-geloescht", zeile.id);
      entwurf.leeren();
    },
    ende: {
      titel: "Programm gelöscht",
      text: "«" + name + "» liegt jetzt im Papierkorb der SharePoint-Site.",
      hinweis: "Die Spalte «" + id + "» bleibt in der Benutzer-Liste erhalten.",
      knopfText: "Zur Software-Liste"
    }
  });
}


/* ==================================================================
   9. Start und Ereignisse
   ================================================================== */

async function start() {
  F.logoZeichnen("software");
  aktiverBereich = F.hashBereich(sichtbareBereiche()) || "stammdaten";
  navZeichnen();
  F.bandZeichnen(undefined, function () {
    entwurf.leeren();
    F.melden("software-geaendert", elementId);
    neuLaden();
  });
  F.zeigeLaden(mockModus ? "Vorführdaten werden aufgebaut …" : "Anmeldung wird geprüft …");

  try {
    if (!mockModus) await Auth.anmeldungSicherstellen();
    F.kontoZeigen();
    if (!neuModus && !elementId) {
      F.zeigeFehler("Kein Programm angegeben",
        "In der Adresse fehlt die Listen-ID, zum Beispiel software.html?id=10.",
        "", "Zur Software-Liste", F.zurListe);
      return;
    }
    F.zeigeLaden(neuModus ? "Formular wird vorbereitet …" : "Programm wird geladen …");
    await datenLaden(false);
    zeileWaehlen();
    zeichnenAlles();
    await F.zeigeInhalt();
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
  anzahlAenderungen: entwurf.anzahl,
  verlassenFrei: F.geloescht,
  beiHash: function (h) {
    if (h !== aktiverBereich && sichtbareBereiche().some(function (b) { return b.k === h; })) bereichWechseln(h);
  }
});

/* Still nachladen, nie mit Entwurf, beim Anlegen oder nach dem Löschen;
   F.autoStarten prüft dazu Ebenen, Arbeit, Fokus im Feld, verborgenen Tab. */
F.autoStarten(function () { return !neuModus && entwurf.anzahl() === 0; }, nachladenStill);

start();

})();

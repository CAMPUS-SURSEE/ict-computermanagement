/* kamerarolle.js — Fenster einer Kamera-Rolle des ICT-Inventars.

   Wird von der Ansicht «Kamerarechte» als kamerarolle.html?id=… geöffnet
   und zeigt eine Zeile der Liste «Kamera-Rollen» in vier Bereichen:

     Rolle      Bemerkung (von Hand) und was Milestone über die Rolle
                weiss (Mitglieder, Rechte).
     Kameras    Die Kameras, auf die die Rolle Rechte hat, mit den Rechten.
     Personen   Wer die Rolle hat: die Mitglieder der AD-Gruppen, rekursiv
                aufgelöst (der Abgleich schreibt die Logins).
     Verlauf    Verlauf, auch die Änderungen an Mitgliedern und Kameras,
                die der Abgleich festhält.

   Führend ist Milestone: Rollen, Mitglieder und Rechte werden im Management
   Client geändert, nie hier. Bearbeitbar ist nur die Bemerkung.

   Gebaut wird nur über UI.*, Rahmen.*, F.* und Bewegung.*. */

"use strict";

(function () {

const ABFRAGE = new URLSearchParams(location.search);
const mockModus = UI.adresse.mock();
const elementId = ABFRAGE.get("id");

const SPALTEN = SPALTEN_KAMERAROLLE;
const SPALTE = {};
for (const s of SPALTEN) SPALTE[s.i] = s;

const GRUND_ENTWURF = "Zuerst speichern oder verwerfen.";

const F = Fenster.erstellen("kr", {
  liste: "kamerarechte",
  neuLaden: function () { neuLaden(); },
  nachladen: function () { return nachladenStill(); }
});

let alleRollen = [];
let zeile = null;

const entwurf = F.entwurf(function () { return zeile; }, { beiAenderung: nachAenderung });

let aktiverBereich = "rolle";

const BEREICHE = [
  { k: "rolle",    d: "Rolle",    sinnbild: "schild",         f: bereichRolle },
  { k: "kameras",  d: "Kameras",  sinnbild: "kamera",         f: bereichKameras },
  { k: "personen", d: "Personen", sinnbild: "benutzerGruppe", f: bereichPersonen },
  { k: "verlauf",  d: "Verlauf",  sinnbild: "verlauf",        f: bereichVerlauf }
];

function nachAenderung() {
  kopfZeichnen();
  speicherleisteZeichnen();
}

function speicherleisteZeichnen() {
  F.speicherleisteZeichnen({ neuModus: false, anzahl: entwurf.anzahl() });
}

function navZeichnen() {
  F.navZeichnen(BEREICHE, aktiverBereich, bereichWechseln, {
    zusatz: function (b) {
      if (!zeile) return null;
      if (b.k === "kameras") return (zeile.__kameras || []).length || null;
      if (b.k === "personen") return personenAnzahl() || null;
      return null;
    }
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

function inMilestone() { return !!zeile && Hilfe.istJa(zeile.MS_Gefunden); }
function personenAnzahl() { return zeile ? (zeile.__personen || []).length + (zeile.__unbekannt || []).length : 0; }



/* ---------- Rolle ---------- */

function bemerkungKarte() {
  const k = UI.karte({ titel: "Bemerkung" });
  k.inhalt.appendChild(UI.datenzeilen([
    F.feld("Bemerkung", { beschriftung: "Bemerkung", art: "textbereich", entwurf: entwurf, eingabe: { zeilen: 6 } })
  ]));
  return k;
}

function milestoneKarte() {
  const k = UI.karte({ titel: "Aus Milestone",
    unter: "Vom Abgleich gesetzt. Geändert wird im Management Client von Milestone." });
  const chips = [];
  if (!inMilestone()) chips.push(UI.status("Nicht mehr in Milestone", "neutral", { sinnbild: "archiv" }));
  if (zeile.__admin) chips.push(UI.status("Administratoren – sieht alle Kameras", "neutral", { sinnbild: "schloss" }));
  const sync = String(zeile.MS_SyncStatus || "").trim();
  if (sync && sync !== "OK" && inMilestone()) chips.push(UI.status(sync, "warnung"));
  if (chips.length) k.inhalt.appendChild(UI.chips(chips));

  const mitglieder = zeile.__mitglieder || [];
  const mitgliederKnoten = mitglieder.length
    ? UI.chips(mitglieder.map(m => UI.status(m.name, "neutral", { sinnbild: /gruppe/i.test(m.art) ? "benutzerGruppe" : "benutzer",
      titel: m.art || null })))
    : UI.el("span", "t-leise", "Keine");
  const rechte = zeile.__rechte || [];
  k.inhalt.appendChild(UI.datenzeilen([
    UI.feldZeile("Mitglieder", mitgliederKnoten),
    UI.feldZeile("Rechte", rechte.length ? UI.chips(rechte.map(r => UI.status(r, "neutral", { sinnbild: false }))) : ""),
    UI.feldZeile("Kameras", UI.zahlText((zeile.__kameras || []).length)),
    UI.feldZeile("Personen", UI.zahlText(personenAnzahl())),
    UI.feldZeile("Beschreibung", UI.text(zeile.MS_Beschreibung)),
    UI.feldZeile("Letzter Abgleich", UI.zeitText(zeile.MS_LetzterSync))
  ]));
  return k;
}

function bereichRolle(ziel) {
  const raster = UI.el("div", "karten");
  raster.appendChild(bemerkungKarte());
  raster.appendChild(milestoneKarte());
  ziel.appendChild(raster);
}


/* ---------- Kameras ---------- */

function bereichKameras(ziel) {
  const liste = zeile.__kameras || [];
  const zurListe = liste.length ? UI.knopf({ text: "In der Liste zeigen", variante: "leise", weiter: true,
    href: UI.adresse.liste("kameras", { ro: String(zeile.id), ar: "0" }), fokus: "kameras-liste" }) : null;
  const k = UI.karte({ titel: "Kameras", aktionen: zurListe ? [zurListe] : [],
    unter: liste.length ? UI.zahlText(liste.length) + (liste.length === 1 ? " Kamera" : " Kameras") + " mit Rechten dieser Rolle" : "" });
  if (!liste.length) {
    k.inhalt.appendChild(UI.leerzustand({ sinnbild: "kamera", titel: "Keine Kameras",
      text: inMilestone() ? "Die Rolle hat in Milestone auf keine Kamera Rechte – oder der Abgleich konnte sie noch nicht lesen." : "Die Rolle steht nicht mehr in Milestone." }));
  } else {
    k.inhalt.appendChild(UI.zeilenliste(liste.map(function (e) {
      const c = e.kamera;
      return UI.listenZeile({
        titel: String(c.Title || "").trim() || "(ohne Namen)",
        unter: [e.rechte.join(", "), UI.text(c.MS_Modell), UI.text(c.MS_Adresse)],
        href: UI.adresse.kamera(c.id),
        sinnbild: "kamera",
        status: c.__archiviert ? UI.status("Archiviert", "neutral", { sinnbild: "archiv" }) : null,
        fokus: "kamera-" + c.id
      });
    })));
  }
  ziel.appendChild(k);
}


/* ---------- Personen ---------- */

function bereichPersonen(ziel) {
  const personen = zeile.__personen || [];
  const unbekannt = zeile.__unbekannt || [];
  const gruppen = zeile.__adGruppen || [];
  const k = UI.karte({ titel: "Personen",
    unter: gruppen.length ? "Mitglieder von " + gruppen.join(", ") + " (rekursiv) und direkte Mitglieder." : "Direkte Mitglieder der Rolle." });
  if (!personen.length && !unbekannt.length) {
    k.inhalt.appendChild(UI.leerzustand({ sinnbild: "benutzer", titel: "Keine Personen",
      text: "Der Abgleich hat zu dieser Rolle keine Personen aufgelöst." }));
  } else {
    if (personen.length) {
      k.inhalt.appendChild(UI.zeilenliste(personen.map(function (b) {
        const ad = Modell.adStatus(b);
        return UI.listenZeile({
          titel: b.__name || b.Anzeigename || b.Title,
          unter: [UI.text(b.Title), UI.text(b.Abteilung), UI.text(b.Funktion)],
          href: UI.adresse.benutzer(b.id),
          sinnbild: "benutzer",
          status: ad.aktiv ? null : UI.status(ad.text, ad.ton),
          fokus: "person-" + b.id
        });
      })));
    }
    if (unbekannt.length) {
      k.inhalt.appendChild(UI.hinweis("Nicht in der Benutzer-Liste (ausserhalb der Mitarbeitenden-OUs): " + unbekannt.join(", ") + "."));
    }
  }
  ziel.appendChild(k);
}


/* ---------- Verlauf ---------- */

function bereichVerlauf(ziel) {
  const huelle = UI.el("div", "kr-verlauf");
  huelle.setAttribute("data-rolle", "verlauf");
  Verlauf.zeichnen(huelle, {
    schluessel: "kamerarolle",
    wert: entwurf.wert("Verlauf"),
    beiAenderung: function (json) { entwurf.setzeWert("Verlauf", json); },
    titel: "Verlauf"
  });
  ziel.appendChild(huelle);
}


/* ---------- Kopf ---------- */

function kopfZeichnen() {
  if (!zeile) return;
  const status = [];
  if (!inMilestone()) status.push(UI.status("Nicht mehr in Milestone", "neutral", { sinnbild: "archiv" }));
  const unter = [(zeile.__adGruppen || []).join(", "), (zeile.__rechte || []).join(", ")];
  const aktionen = F.geloescht() ? [] : [UI.knopf({ text: "Löschen …", variante: "leise", sinnbild: "papierkorb", beiKlick: loeschen,
    gesperrt: entwurf.anzahl() ? GRUND_ENTWURF : (inMilestone() ? "Die Rolle steht in Milestone – der Abgleich legte sie wieder an." : "") })];
  F.seitenkopf({ titel: String(zeile.Title || "").trim() || "(ohne Namen)", unter: unter, status: status, aktionen: aktionen });
}

function loeschen() {
  if (entwurf.anzahl() || F.istBeschaeftigt() || inMilestone()) return;
  const name = String(zeile.Title || "").trim();
  const id = zeile.id;
  F.loeschenDialog({
    titel: "Rolle löschen?",
    text: "Die Zeile wird in den Papierkorb der SharePoint-Site verschoben und lässt sich dort 93 Tage lang zurückholen. Mit ihr gehen Bemerkung und Verlauf.",
    wort: name || "löschen",
    knopfText: "Löschen",
    fehlerText: "Löschen fehlgeschlagen.",
    beiLoeschen: async function () {
      await Daten.loeschen("kamerarolle", id);
      F.melden("kamerarolle-geloescht", id);
      entwurf.leeren();
    },
    ende: { titel: "Rolle gelöscht", text: (name ? "«" + name + "»" : "Die Rolle") + " liegt jetzt im Papierkorb der SharePoint-Site.", knopfText: "Zur Liste" }
  });
}


/* ---------- Zeichnen, Laden, Speichern ---------- */

function zeichnenAlles() {
  kopfZeichnen();
  navZeichnen();
  zeichneBereich();
  speicherleisteZeichnen();
}

async function datenLaden(still) {
  if (!still) F.zeigeLaden(mockModus ? "Vorführdaten werden aufgebaut …" : "Daten werden aus SharePoint geladen …");
  const [rohRollen, rohKameras, rohBenutzer] = await Promise.all([
    Daten.kameraRollen(),
    Daten.kameras().catch(function () { return []; }),
    Daten.benutzer().catch(function () { return []; })
  ]);
  const benutzer = Modell.anreichern([], rohBenutzer, null).benutzer;
  alleRollen = Modell.kamerasAnreichern(rohKameras, rohRollen, benutzer).rollen;
}

function zeileWaehlen() {
  const treffer = alleRollen.filter(z => String(z.id) === String(elementId))[0];
  if (!treffer) {
    const fehler = new Error("In der Liste «Kamera-Rollen» gibt es keine Zeile mit der Listen-ID " + elementId + ".");
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
    F.ladefehler(fehler, { titel: "Rolle nicht gefunden",
      hinweis: "Gelöschte Zeilen liegen 93 Tage im Papierkorb der SharePoint-Site und lassen sich dort zurückholen." });
    return false;
  }
}

async function aendern() {
  const aenderungen = entwurf.aenderungen();
  const felder = {};
  for (const feld of Object.keys(aenderungen)) {
    if (!Modell.istBearbeitbar(SPALTE[feld])) continue;
    const t = aenderungen[feld] === null || aenderungen[feld] === undefined ? "" : String(aenderungen[feld]);
    felder[feld] = feld === "Verlauf" ? t : (t.trim() === "" ? null : t);
  }
  const anzahl = entwurf.anzahl();
  if (!Object.keys(felder).length) { entwurf.leeren(); return { anzahl: 0 }; }
  const antwort = await Daten.speichern("kamerarolle", elementId, felder, zeile.__etag);
  F.uebernehmen(zeile, felder, antwort);
  entwurf.leeren();
  F.melden("kamerarolle-geaendert", elementId);
  return { anzahl: anzahl };
}

function speichern() {
  return F.speicherAblauf({
    anzahl: function () { return entwurf.anzahl(); },
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
  return F.verwerfen({ anzahl: entwurf.anzahl(), neuModus: false, danach: function () {
    entwurf.leeren();
    zeichnenAlles();
  } });
}

async function start() {
  aktiverBereich = F.hashBereich(BEREICHE) || aktiverBereich;
  navZeichnen();
  F.logoZeichnen("kamerarechte");
  F.bandZeichnen(undefined, function () {
    entwurf.leeren();
    F.melden("kamerarolle-geaendert", elementId);
    neuLaden();
  });
  try {
    if (!mockModus) {
      F.zeigeLaden("Anmeldung wird geprüft …");
      await Auth.anmeldungSicherstellen();
    }
    F.kontoZeigen();
    if (!elementId) {
      F.zeigeFehler("Keine Rolle angegeben", "In der Adresse fehlt die Listen-ID, zum Beispiel kamerarolle.html?id=5.",
        "", "Zur Liste", function () { F.zurListe(); });
      return;
    }
    await neuLaden();
  } catch (fehler) {
    F.ladefehler(fehler, { titel: "Rolle nicht gefunden" });
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

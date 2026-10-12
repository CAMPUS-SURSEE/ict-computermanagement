/* styleguide.js — die lebende Komponentenübersicht (styleguide.html).

   Baut jede Komponente des Design-Systems in ihren Zuständen, und zwar
   ausschliesslich über die Bauer der Fundament-Dateien: UI.* (bausteine.js
   und rahmen.js), Rahmen.* und Bewegung.*. Was hier richtig aussieht,
   sieht in den Seiten gleich aus; was hier fehlt, fehlt im System. Darum
   steht hier kein eigenes Markup für Komponenten, nur das Gerüst der
   Abschnitte und ein paar Musterflächen (Farbfelder, Bühne).

   Aufbau
     ABSCHNITTE      Reihenfolge, Gruppen und Sinnbilder der Schublade; je
                     Abschnitt eine Funktion, die ein <section> liefert.
     Navigation      Die Schublade zeigt Anker auf die Abschnitte. Ein Klick
                     rollt weich hin (bei reduzierter Bewegung sofort), beim
                     Rollen folgt die Pastell-Pille (Bewegung.indikator
                     gleitet). Die Adresse trägt den Abschnitt im Hash
                     (replaceState: kein Verlaufseintrag pro Abschnitt).
     Start           Rahmen.zustand('inhalt'): derselbe erste Auftritt wie
                     auf jeder Seite (aufdecken, staffeln, hochzählen).

   Kein Inline-Skript (CSP), kein innerHTML, Texte in Schweizer Hochdeutsch.
   Alle Daten sind erfunden. */

"use strict";

(function () {

  const el = UI.el;
  const knopf = UI.knopf;
  const anhaengen = UI.anhaengen;

  /* ==================================================================
     Kleine Helfer für die Abschnitte
     ================================================================== */

  /* Ein Abschnitt: eigener Kopf (Titel 22/28, Lead) und darunter die
     Karten im Seitenrhythmus (20 px). */
  function abschnitt(schluessel, titel, lead, inhalt) {
    const s = el("section", "sg-abschnitt");
    s.id = schluessel;
    const kopf = UI.seitenkopf({ titel: titel, lead: lead, ebene: 2, titelId: schluessel + "-titel" });
    s.setAttribute("aria-labelledby", schluessel + "-titel");
    s.appendChild(kopf);
    anhaengen(s, inhalt);
    return s;
  }

  /* Karte mit Inhalt. o wie UI.karte ({titel, unter, aktionen, breit, gefuellt}). */
  function karte(o, inhalt) {
    const k = UI.karte(o);
    anhaengen(k.inhalt, inhalt);
    return k;
  }

  function reihe(kinder) { return anhaengen(el("div", "sg-reihe"), kinder); }

  function beschriftung(text) { return el("p", "sg-beschriftung", text); }

  function raster(kinder, klasse) { return anhaengen(el("div", klasse || "raster-2"), kinder); }

  function warten(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function info(text) { UI.meldung(text, { ton: "info" }); }

  /* Erfundene Geräteliste für Tabellen und Listen (feste Folge, kein Zufall). */
  const MODELLE = ["Latitude 7440", "Latitude 5430", "OptiPlex 7010", "EliteBook 840 G9", "ThinkPad T14", "Surface Pro 9"];
  const ORTE = ["Haus A / EG", "Haus A / 1. OG", "Haus B / EG", "Haus B / 2. OG", "Haus C / UG", "Aula"];
  const PERSONEN = ["Muster Max", "Beispiel Anna", "Keller Laura", "Meier Jonas", "Huber Sara", "Graf Luca", "Frei Nina", ""];
  const STATUS = [["Aktiv", "erfolg", "check"], ["Lager", "neutral", "lager"], ["Archiviert", "neutral", "archiv"], ["Ersatz fällig", "warnung", "achtung"]];

  function geraete(anzahl) {
    const liste = [];
    for (let i = 0; i < anzahl; i++) {
      liste.push({
        name: "CAMPUS-" + (901 + i),
        status: STATUS[(i * 7) % 11 === 3 ? 3 : (i % 9 === 4 ? 1 : (i % 13 === 6 ? 2 : 0))],
        inhaber: PERSONEN[(i * 3) % PERSONEN.length],
        ort: ORTE[(i * 5) % ORTE.length],
        modell: MODELLE[(i * 2) % MODELLE.length],
        system: i % 4 === 0 ? "Windows 10 Pro" : "Windows 11 Pro 24H2",
        speicher: 40 + ((i * 37) % 420),
        jahr: 2019 + (i % 7),
        gesehen: (1 + (i % 28)) + ".09.2026, " + String(6 + (i % 12)).padStart(2, "0") + "." + String((i * 7) % 60).padStart(2, "0")
      });
    }
    return liste;
  }

  /* ==================================================================
     Grundlagen: Farben, Schrift, Abstände, Radien, Erhebung, Sinnbilder
     ================================================================== */

  function bauenGrundlagen() {
    const stil = getComputedStyle(document.documentElement);
    const wert = function (token) { return stil.getPropertyValue(token).trim(); };

    const FARBEN = [
      ["Flächen", ["--hintergrund", "--flaeche", "--flaeche-tief", "--flaeche-hoch", "--flaeche-hoechst"]],
      ["Text und Linien", ["--text", "--text-leise", "--text-still", "--linie", "--linie-stark", "--umriss"]],
      ["Primär und Akzent", ["--primaer", "--auf-primaer", "--akzent", "--auf-akzent", "--campus-gruen"]],
      ["Status", ["--erfolg", "--erfolg-container", "--auf-erfolg", "--warnung", "--warnung-container",
        "--warnung-flaeche", "--gefahr", "--gefahr-container", "--auf-gefahr"]],
      ["Invers und Schleier", ["--invers", "--auf-invers", "--invers-primaer", "--schleier"]]
    ];
    const farben = [];
    FARBEN.forEach(function (gruppe, i) {
      const feld = el("div", "sg-farben");
      for (const token of gruppe[1]) {
        const f = el("div", "sg-farbe");
        const muster = el("div", "sg-farbe-feld");
        muster.style.setProperty("background", "var(" + token + ")");
        anhaengen(f, [muster, el("code", null, token), el("span", "meta", wert(token))]);
        feld.appendChild(f);
      }
      if (i) farben.push(el("h3", "karte-untertitel", gruppe[0]));
      else farben.push(el("p", "hinweis", "Das Pastell ist die einzige Tönung. Es gibt kein Blau, auch kein blaues «Info»: "
        + "neutrale Hinweise sind #f9f9f7 mit grünem Icon. #84b819 nur als Dekoration (Punkt der Wortmarke)."));
      if (!i) farben.push(el("h3", "karte-untertitel", gruppe[0]));
      farben.push(feld);
    });

    const ROLLEN = [
      ["--t-ueberschrift", "Seitentitel", "24/32 · 400 · h1 jeder Ansicht"],
      ["--t-titel", "Titel von Dialog und Seitenblatt", "22/28 · 400"],
      ["--t-untertitel", "Kartentitel", "16/24 · 500"],
      ["--t-lesen", "Lesetext in Blättern", "16/24 · 400"],
      ["--t-text", "Fliesstext, Felder, Tabellenzellen", "14/20 · 400"],
      ["--t-beschriftung", "Knöpfe, Tabellenkopf, aktive Navigation", "14/20 · 500"],
      ["--t-meta", "Meta-Zeile, Hinweise, Zeitstempel", "12/16 · 400"],
      ["--t-klein", "Status-Chips, Feldbeschriftungen", "12/16 · 500"],
      ["--t-anzeige", "1’284", "36/44 · 400 · Kennzahlen, tabellarische Ziffern"],
      ["--t-code", "{ \"Title\": \"CAMPUS-907\" }", "13/20 · Mono"]
    ];
    const schrift = el("div");
    for (const r of ROLLEN) {
      const z = el("div", "sg-schrift");
      const probe = el("p", null, r[1]);
      probe.style.setProperty("font", "var(" + r[0] + ")");
      if (r[0] === "--t-anzeige") probe.style.setProperty("font-variant-numeric", "tabular-nums");
      anhaengen(z, [probe, UI.teile([r[0], r[2]])]);
      z.lastChild.classList.add("meta");
      schrift.appendChild(z);
    }

    const abstaende = el("div", "sg-masse");
    for (const a of ["--a1", "--a2", "--a3", "--a4", "--a5", "--a6", "--a7", "--a8", "--a10", "--a12"]) {
      const m = el("div", "sg-mass");
      const b = el("div", "sg-mass-balken");
      b.style.setProperty("height", "var(" + a + ")");
      anhaengen(m, [b, el("span", "meta", a.replace("--", "") + " · " + wert(a))]);
      abstaende.appendChild(m);
    }

    const radien = el("div", "sg-flaechen");
    for (const r of [["--r-xs", "Tooltip, Code"], ["--r-s", "Felder, Chips, Meldung"], ["--r-m", "Karten, Status, Banner"],
      ["--r-l", "Kacheln, Dialoge, Blatt"], ["--r-xl", "Tafel (nur oben)"], ["--r-rund", "Jede Aktion"]]) {
      const f = el("div", "sg-flaeche");
      f.style.setProperty("border-radius", "var(" + r[0] + ")");
      anhaengen(f, [anhaengen(el("div"), [el("code", null, r[0]), el("div", "meta", r[1])])]);
      radien.appendChild(f);
    }
    const ebenen = el("div", "sg-flaechen");
    for (const e of [["--erhebung-1", "Hover gefüllter Knöpfe"], ["--erhebung-2", "Menüs, Sprungmarke"],
      ["--erhebung-3", "Dialog, Blatt, Meldung, Speicherleiste"]]) {
      const f = el("div", "sg-flaeche");
      f.style.setProperty("border-color", "transparent");
      f.style.setProperty("border-radius", "var(--r-karte)");
      f.style.setProperty("box-shadow", "var(" + e[0] + ")");
      anhaengen(f, [anhaengen(el("div"), [el("code", null, e[0]), el("div", "meta", e[1])])]);
      ebenen.appendChild(f);
    }

    // Sinnbilder: jede Glyphe einmal, Zweitnamen (Aliase) dahinter.
    const namenJeGlyphe = new Map();
    for (const name of Object.keys(UI.SINNBILDER)) {
      const g = UI.SINNBILDER[name];
      if (!namenJeGlyphe.has(g)) namenJeGlyphe.set(g, []);
      namenJeGlyphe.get(g).push(name);
    }
    const sinnbilder = el("div", "sg-sinnbilder");
    for (const namen of namenJeGlyphe.values()) {
      const z = el("div", "sg-sinnbild");
      z.appendChild(UI.sinnbild(namen[0], 20));
      const t = el("span");
      t.appendChild(el("code", null, namen[0]));
      if (namen.length > 1) t.appendChild(el("span", "meta", "auch " + namen.slice(1).join(", ")));
      z.appendChild(t);
      sinnbilder.appendChild(z);
    }

    return abschnitt("grundlagen", "Grundlagen",
      "Die Tokens aus design.css. Komponenten und Seiten lesen nur diese Namen, nie Farben, Radien, Schriften oder Dauern als Literal.",
      [
        karte({ titel: "Farben" }, farben),
        raster([
          karte({ titel: "Schriftrollen", unter: "Google Sans, nur 400 und 500. Überschriften sind nie fett, nichts ist gesperrt." }, [schrift]),
          anhaengen(el("div", "stapel"), [
            karte({ titel: "Abstände", unter: "4er-Raster. Seite 20 px zwischen Blöcken, Karte 16 px." }, [abstaende]),
            karte({ titel: "Radien" }, [radien]),
            karte({ titel: "Erhebung", unter: "Nur Schwebendes wirft Schatten; Karten haben eine Haarlinie." }, [ebenen])
          ])
        ]),
        karte({ titel: "Sinnbilder", unter: "Ein Set im Lucide-Stil: 24er-Raster, Strich 2, runde Enden, immer currentColor. "
          + "20 px in Navigation und Icon-Knöpfen, 16 px in Knöpfen und Chips, 24 px im Leerzustand." }, [sinnbilder])
      ]);
  }

  /* ==================================================================
     Knöpfe
     ================================================================== */

  function bauenKnoepfe() {
    const kompakt = knopf({ text: "Kompakt", sinnbild: "dichte", variante: "still", gedrueckt: true });
    kompakt.addEventListener("click", function () {
      kompakt.setAttribute("aria-pressed", kompakt.getAttribute("aria-pressed") === "true" ? "false" : "true");
    });

    // Gesperrt MIT Grund: fokussierbar, der Tooltip nennt den Grund; UI.knopfSperren
    // setzt und hebt die Sperre an Ort und Stelle (bei jedem Tastendruck erlaubt).
    const mitGrund = knopf({ text: "Ins Lager legen", sinnbild: "lager", variante: "leise",
      titel: "Gerät ins Lager legen", gesperrt: "Zuerst die Änderungen speichern oder verwerfen." });
    const sperreUmschalten = knopf({ text: "Sperre aufheben", variante: "leise", klein: true, beiKlick: function () {
      const gesperrt = mitGrund.getAttribute("aria-disabled") === "true";
      UI.knopfSperren(mitGrund, gesperrt ? "" : "Zuerst die Änderungen speichern oder verwerfen.");
      UI.knopfText(sperreUmschalten, gesperrt ? "Sperren" : "Sperre aufheben");
    } });

    const speichern = knopf({ text: "Speichern", variante: "primaer" });
    speichern.addEventListener("click", async function () {
      UI.beschaeftigt(speichern, true);
      await warten(1400);
      await UI.beschaeftigt(speichern, false);
      UI.meldung("Gespeichert.");
    });
    const testen = knopf({ text: "Verbindung testen" });
    testen.addEventListener("click", async function () {
      UI.beschaeftigt(testen, true, "Teste …");
      await warten(900);
      await UI.beschaeftigt(testen, false);
      info("Verbindung in Ordnung.");
    });

    return abschnitt("knoepfe", "Knöpfe",
      "Jede Aktion ist eine Pille (36 px, klein 32 px, Icon 40 px). Hover und Druck sind eine Ebene in der Schriftfarbe "
      + "(8 % / 10 %), nie ein Anheben oder Vergrössern. Es gibt keine roten Knöpfe.",
      [
        raster([
          karte({ titel: "Varianten" }, [
            reihe([
              knopf({ text: "Speichern", variante: "primaer" }),
              knopf({ text: "Verbindung testen" }),
              knopf({ text: "Jetzt abgleichen", variante: "tonal", sinnbild: "sync" }),
              knopf({ text: "Abbrechen", variante: "leise" })
            ]),
            reihe([
              knopf({ text: "Filter", variante: "still", sinnbild: "filter" }),
              knopf({ text: "Liste öffnen", variante: "leise", weiter: true }),
              knopf({ text: "CSV", sinnbild: "herunterladen" }),
              knopf({ text: "Neuer ADMIN-Client", variante: "primaer", sinnbild: "plus" })
            ]),
            beschriftung("Primär = DIE Hauptaktion eines Bereichs · Umrandet = zweite Aktion · Tonal = weiche Hauptaktion "
              + "in Karten · Leise = Text-Knopf · Still = Werkzeugleisten")
          ]),
          karte({ titel: "Nur Icon, klein" }, [
            reihe([
              knopf({ variante: "sinnbild", sinnbild: "schliessen", titel: "Schliessen" }),
              knopf({ variante: "sinnbild", sinnbild: "bearbeiten", titel: "Bearbeiten" }),
              knopf({ variante: "sinnbild", sinnbild: "mehr", titel: "Weitere Aktionen" }),
              knopf({ variante: "sinnbild", sinnbild: "verlauf", titel: "Verlauf (Scheibe)", klasse: "knopf-scheibe" }),
              knopf({ variante: "sinnbild", sinnbild: "papierkorb", titel: "Entfernen", klein: true })
            ]),
            reihe([
              knopf({ text: "Kopieren", sinnbild: "kopieren", klein: true }),
              knopf({ text: "Erneut versuchen", variante: "leise", klein: true }),
              knopf({ text: "Vorschlag übernehmen", variante: "tonal", klein: true })
            ]),
            beschriftung("Icon-Knöpfe brauchen einen Namen (aria-label) und zeigen ihn als Tooltip.")
          ])
        ]),
        karte({ titel: "Zustände", unter: "Gesperrte Knöpfe mit Grund bleiben fokussierbar (aria-disabled) und nennen den Grund im Tooltip. "
          + "Beschäftigt: sofort gesperrt, der Spinner erscheint erst nach 200 ms in gleicher Breite und bleibt mindestens 450 ms." }, [
          reihe([
            kompakt,
            knopf({ text: "Speichern", variante: "primaer", deaktiviert: true }),
            knopf({ text: "Abgleichen", variante: "tonal", deaktiviert: true }),
            knopf({ text: "Exportieren", deaktiviert: true }),
            mitGrund,
            sperreUmschalten
          ]),
          reihe([speichern, testen, beschriftung("← klicken: beschäftigt")])
        ]),
        karte({ titel: "Aktionszeile eines Formulars" }, [
          anhaengen(el("div", "aktionszeile"), [
            knopf({ text: "Speichern", variante: "primaer" }),
            knopf({ text: "Verbindung testen" }),
            knopf({ text: "Verlauf anzeigen", variante: "leise", sinnbild: "verlauf" }),
            UI.meta("Zuletzt gespeichert am 07.10.2026, 00.23 von Muster Max")
          ])
        ])
      ]);
  }

  /* ==================================================================
     Status, Chips, Zähler
     ================================================================== */

  function bauenStatus() {
    const wechsel = UI.status("Wird abgeglichen", "laeuft");
    const FOLGE = [["Wird abgeglichen", "laeuft"], ["Aktuell · abgeglichen vor 5 Min.", "erfolg"],
      ["Abgleich verspätet", "warnung"], ["Abgleich fehlgeschlagen", "gefahr"], ["Wartet auf den nächsten Lauf", "wartet"]];
    let stufe = 0;
    const weiter = knopf({ text: "Nächster Zustand", klein: true, beiKlick: function () {
      stufe = (stufe + 1) % FOLGE.length;
      wechsel.setzen(FOLGE[stufe][0], FOLGE[stufe][1]);
    } });

    // Filter-Chips wie eine Optionsgruppe: genau einer ist gewählt.
    const optionen = ["Alle", "Aktiv", "Im Lager", "Archiviert"].map(function (t, i) {
      return UI.chip({ text: t, gewaehlt: i === 0, umschalten: false });
    });
    optionen.forEach(function (c) {
      c.addEventListener("click", function () { for (const o of optionen) o.setzen(o === c); });
    });
    const trenner = el("span", "chips-trenner");
    trenner.setAttribute("aria-hidden", "true");
    const anzahl = el("p", "anzahl", "47 von 163");
    anzahl.setAttribute("aria-live", "polite");
    const gruppe = el("div", "chips");
    gruppe.setAttribute("role", "group");
    gruppe.setAttribute("aria-label", "Status");
    anhaengen(gruppe, optionen);
    const chipsZeile = UI.chips([gruppe, trenner, UI.chip({ text: "Nur mit Bemerkung", gewaehlt: false }),
      UI.chip({ text: "Deaktiviert", gewaehlt: false, deaktiviert: true }), anzahl]);

    const aktive = UI.chips([]);
    function aktivFilter(text) {
      const c = UI.chip({ text: text, entfernen: function () {
        Bewegung.austreten(c, "skalieren").then(function () {
          const rest = aktive.querySelectorAll(".chip-entfernbar").length;
          anzahl.textContent = rest ? (163 - rest * 38) + " von 163" : "163 ADMIN-Clients";
        });
      } });
      return c;
    }
    // Der letzte ist auf schmaler Bahn länger als die Zeile: er kürzt sich mit
    // «…», das × bleibt, der Tooltip zeigt den ganzen Filter.
    anhaengen(aktive, [aktivFilter("Suche: «latitude»"), aktivFilter("Hersteller: HP"), aktivFilter("Gebäude: Haus C"),
      aktivFilter("Bemerkung: Leihgerät für die Weiterbildung «Führung im Gesundheitswesen», Rückgabe nach dem letzten Kurstag im Sekretariat")]);

    const filterKnopf = knopf({ text: "Filter", sinnbild: "filter", variante: "still" });
    filterKnopf.appendChild(UI.zaehler(3));
    const filterOffen = knopf({ text: "Filter", sinnbild: "filter", variante: "still", gedrueckt: true });
    filterOffen.appendChild(UI.zaehler(3));
    const spalten = knopf({ text: "Spalten", sinnbild: "spalten", variante: "still" });
    spalten.appendChild(UI.zaehler(8, true));

    // Eine Plakette, die erscheint und wieder geht: einmal gebaut, nur .setzen().
    const erscheinend = UI.zaehler("");
    let erschienen = 0;
    const erscheinen = knopf({ text: "Filter setzen", klein: true, variante: "leise", beiKlick: function () {
      erschienen = erschienen ? 0 : 2;
      erscheinend.setzen(erschienen ? erschienen : "");
      UI.knopfText(erscheinen, erschienen ? "Filter entfernen" : "Filter setzen");
    } });
    const erscheinendKnopf = knopf({ text: "Filter", sinnbild: "filter", variante: "still" });
    erscheinendKnopf.appendChild(erscheinend);

    return abschnitt("status", "Status, Chips und Zähler",
      "Status immer mit Icon und Text, nie Farbe allein. Filter-Chips sind 32 px hoch mit Radius 8; gewählt = Pastell "
      + "mit Häkchen. Zähler sind Plaketten in Pastell oder neutral.",
      [
        karte({ titel: "Status-Chips" }, [
          reihe([
            UI.status("In SCCM", "erfolg"),
            UI.status("Ersatz fällig", "warnung"),
            UI.status("Abgleich fehlgeschlagen", "gefahr"),
            UI.status("Archiviert", "neutral", { sinnbild: "archiv" }),
            UI.status("Wird abgeglichen", "laeuft"),
            UI.status("Wartet", "wartet"),
            UI.status("AD-Konto deaktiviert", "aus"),
            UI.status("Online", "erfolg", { sinnbild: "online" }),
            UI.status("Mit Tooltip", "neutral", { titel: "Der Tooltip nennt die Herkunft: SCCM, 12.10.2026, 05.15." })
          ]),
          reihe([wechsel, weiter, beschriftung("setzen() ändert an Ort und Stelle; der Spinner dreht weiter.")])
        ]),
        karte({ titel: "Filter-Chips" }, [
          chipsZeile,
          aktive,
          beschriftung("Aktive Filter sind Pastell mit ×; der ganze Chip ist der Knopf und nennt die Folge.")
        ]),
        karte({ titel: "Zähler" }, [
          reihe([UI.zaehler(3), UI.zaehler(12, true), UI.zaehler(128), filterKnopf, filterOffen, spalten]),
          beschriftung("Auf Pastell (gedrückter Knopf) wird die Plakette dunkel, sonst verschwände sie."),
          reihe([erscheinendKnopf, erscheinen]),
          beschriftung("Leer ist die Plakette verborgen; erscheint sie (setzen von leer auf eine Zahl), ploppt sie "
            + "einmal. Ein neuer Wert ändert sich ohne Bewegung.")
        ])
      ]);
  }

  /* ==================================================================
     Karten und Kacheln
     ================================================================== */

  function bauenKarten() {

    const gefuellt = UI.karte({ titel: "Testergebnis", gefuellt: true, ebene: 3 });
    anhaengen(gefuellt.inhalt, [
      reihe([UI.status("Graph erreichbar", "erfolg"), el("span", "hinweis", "120 ms")]),
      reihe([UI.status("Liste «Clients» lesbar", "erfolg"), el("span", "hinweis", "50 Zeilen")])
    ]);

    const unterabschnitt = anhaengen(el("div", "unterabschnitt"), [
      el("h3", "karte-untertitel", "Deep Research"),
      el("p", "hinweis", "Ein Teil einer Karte mit eigenem kleinem Titel: Haarlinie und 20 px Luft darüber.")
    ]);

    const kacheln = UI.kacheln([
      UI.kachel({ text: "ADMIN-Clients", wert: "50", zahl: 50, unter: "47 im Einsatz" }),
      UI.kachel({ text: "EDU-Clients", wert: "18", zahl: 18, unter: "16 im Einsatz" }),
      UI.kachel({ text: "Ersatz fällig", wert: "6", zahl: 6, ton: "warnung", unter: "bis Ende GJ 2026/27" }),
      UI.kachel({ text: "Freier Speicher", wert: "41 %", zahl: 41, unter: "Durchschnitt aller Geräte" })
    ]);
    const kachelnKlick = UI.kacheln([
      UI.kachel({ text: "Nicht in SCCM", wert: "7", zahl: 7, ton: "gefahr", unter: "Liste öffnen",
        beiKlick: function () { info("Würde die gefilterte Liste öffnen."); } }),
      UI.kachel({ text: "Im Einsatz", wert: "1’284", zahl: 1284, unter: "als Link", href: "#karten" }),
      UI.kachel({ text: "Letzte Anmeldung", wert: "vor 2 Tagen", unter: "CAMPUS-907" }),
      UI.kachel({ text: "Ohne Wert", wert: "", unter: "Leerwert «–»" })
    ]);

    return abschnitt("karten", "Karten und Kacheln",
      "Karten: weiss, Haarlinie, Radius 12, Polster 24 (Handy 16), 16 px zwischen allen Kindern, kein Schatten. "
      + "Kennzahl-Kacheln: tonal, Radius 16, die Zahl wird nie gefärbt.",
      [
        raster([
          karte({ titel: "Karte" }, [
            UI.hinweis("Titel 16/24 500 (h2). Eine Beschreibung in 14/20 #444746, höchstens 76 Zeichen breit.")
          ]),
          karte({ titel: "Mit Unterzeile und Aktion", unter: "3 von 12 aktiv",
            aktionen: [knopf({ text: "Bearbeiten", variante: "leise", sinnbild: "bearbeiten" })] }, [
            UI.kennwerte([["Programme", "86"], ["Freier Speicher", "211 GB"], ["Letzter Neustart", ""]])
          ]),
          karte({ titel: "Mit Schalter im Kopf",
            aktionen: [UI.schalterZeile({ kompakt: true, name: "Abgleich", wort: true, an: true })] }, [
            UI.hinweis("Ein Knopf (36 px) oder Schalter (40 px) neben dem Titel ragt über dessen 24-px-Zeile hinaus, "
              + "statt die Zeile höher zu machen.")
          ]),
          karte({ titel: "Mit Fusszeile", fuss: [
            knopf({ text: "ADMIN-Clients", variante: "leise", weiter: true }),
            knopf({ text: "EDU-Clients", variante: "leise", weiter: true })
          ] }, [
            UI.hinweis("UI.karte({ fuss }): Links auf verwandte Seiten stehen als Text-Knöpfe unter einer Haarlinie; "
              + "der erste fluchtet mit dem Text. Im Kartenraster steht die Fusszeile unten bündig.")
          ]),
          karte({ titel: "Gefüllte Karte darin" }, [UI.hinweis("Ein ruhigerer Block in einer Karte (Testergebnis)."), gefuellt]),
          karte({ titel: "Zwischentitel" }, [
            el("h3", "karte-untertitel", "Datenquellen"),
            UI.hinweis("Ein h3 in 14/20 500 mit 24 px Luft darüber und 8 px darunter."),
            unterabschnitt
          ])
        ]),
        karte({ titel: "Kennzahlen", unter: "Vier Kacheln (≤ 1100 px zwei). Beim ersten Zeigen zählen die Zahlen hoch; "
          + "neu geladene Daten zählen nie.", breit: true }, [kacheln, kachelnKlick])
      ]);
  }

  /* ==================================================================
     Daten: Datenzeilen, Kennwerte, Fakten
     ================================================================== */

  function bauenDaten() {
    const inhaber = el("a", "name-link", "Muster Max");
    inhaber.href = "#daten";
    return abschnitt("daten", "Datenzeilen, Kennwerte, Fakten",
      "Lesen: Name links in #444746, Wert daneben, Haarlinien. Felder aus dem Abgleich tragen ein Schloss mit Tooltip. "
      + "Leerwert ist «–».",
      [
        raster([
          karte({ titel: "Datenzeilen" }, [
            UI.datenzeilen([
              UI.feldZeile("PC-Name", "CAMPUS-907"),
              UI.feldZeile("Gebäude / Stock", "Haus C / UG", { neben: "seit 2024" }),
              UI.feldGesperrt("Seriennummer", "5CG1234XYZ", "Kommt aus SCCM und lässt sich hier nicht ändern."),
              UI.feldZeile("Inhaber", inhaber),
              UI.feldZeile("Status", UI.status("Aktiv", "erfolg")),
              UI.feldZeile("Bemerkung", "")
            ])
          ]),
          anhaengen(el("div", "stapel"), [
            karte({ titel: "Kennwerte" }, [
              UI.kennwerte([["ADMIN-Clients", "50"], ["EDU-Clients", "18"], ["Benutzer", "56"], ["Telefonnummern", ""]])
            ]),
            karte({ titel: "ADMIN-Clients", sinnbild: "laptop", ebene: 3,
              aktionen: [knopf({ text: "Liste öffnen", variante: "leise", weiter: true, href: "#daten" })] }, [
              UI.kachel({ text: "Im Einsatz", wert: "47", zahl: 47, unter: "50 insgesamt", href: "#daten" }),
              UI.kennwerte([
                { name: "Im Lager", wert: 2, href: "#daten" },
                { name: "Nicht in SCCM", wert: 3, ton: "gefahr", href: "#daten", titel: "Nicht in SCCM – Abgleich findet kein Gerät" },
                { name: "Ersatz in diesem GJ", wert: 4, ton: "warnung", href: "#daten" },
                { name: "Ohne Inhaber", wert: 0, href: "#daten" }
              ]),
              beschriftung("Bestandskarte (Mapping 7.2 #15): UI.karte({ sinnbild }), die Hauptzahl als Kachel, darunter "
                + "klickbare Kennwerte (UI.kennwerte mit Objekten). Null leise, der Ton als Sinnbild, die Zahl nie gefärbt.")
            ]),
            karte({ titel: "Fakten" }, [
              UI.fakten([
                ["Zuletzt gesehen", UI.zeitText("2026-10-12T12:05:00Z")],
                ["Im Index", UI.teile(["1’284 Geräte", "56 Benutzer", "80 Nummern"])],
                ["Nächster Abgleich", "12.10.2026, 20.00 (in 6 Std.)"],
                ["Quelle", ""]
              ])
            ])
          ])
        ])
      ]);
  }

  /* ==================================================================
     Formulare: Eingaben, Felder, Kästchen, Suche, Schalter
     ================================================================== */

  function bauenFormulare() {
    const bemerkung = UI.formZeile("Bemerkung",
      UI.eingabe({ art: "textbereich", wert: "Akku schwach, Ersatz bestellt.", zeilen: 3 }), { geaendert: true });
    const ort = UI.formZeile("Gebäude / Stock", UI.eingabe({ wert: "Haus C / UG",
      vorschlaege: ORTE, beiEingabe: function () { ort.classList.add("geaendert"); } }));
    const inventar = UI.eingabe({ wert: "CAMPUS-912" });
    const inventarZeile = UI.formZeile("PC-Name", inventar, { hinweis: "Gross geschrieben, ohne Leerzeichen." });
    UI.feldFehler(inventar, "Diesen Namen gibt es schon (ADMIN-Client 12).");

    // Hinweis, der am Getippten hängt (UI.hinweisPlatz): erscheint aufgedeckt,
    // sobald der Name vergeben ist, und bleibt beim Weitertippen stehen.
    const namenWarnung = UI.hinweisPlatz({ id: "sg-namenswarnung" });
    const pcName = UI.eingabe({ platzhalter: "z. B. CAMPUS-907", beiEingabe: function (w) {
      const vergeben = /^campus-90\d$/i.test(w.trim());
      namenWarnung.setzen(vergeben ? w.trim().toUpperCase() : "", function () {
        return UI.banner({ ton: "warnung", titel: "Name schon vergeben.", text: "«" + w.trim().toUpperCase()
          + "» heisst bereits ein ADMIN-Client (Listen-ID 7)." });
      }, { aufdecken: true });
    } });
    // Feldhinweis mit Sinnbild (UI.feldHinweis): Live-Prüfung «in Ordnung».
    const idHinweis = el("div", "datenzeile-hinweis");
    const programmId = UI.eingabe({ platzhalter: "AdobeAcrobatPro", beiEingabe: function (w) {
      const id = w.trim();
      if (!id) UI.feldHinweis(idHinweis, "Buchstaben und Ziffern, zuerst ein Buchstabe.");
      else if (/^[A-Za-z][A-Za-z0-9]*$/.test(id)) UI.feldHinweis(idHinweis, "Wird als Spalte «" + id + "» angelegt.", { sinnbild: "checkKreis", ton: "erfolg" });
      else UI.feldHinweis(idHinweis, "");
      UI.feldFehler(programmId, id && !/^[A-Za-z][A-Za-z0-9]*$/.test(id) ? "Nur Buchstaben und Ziffern." : "");
    } });
    UI.feldHinweis(idHinweis, "Buchstaben und Ziffern, zuerst ein Buchstabe.");

    const vorschlag = anhaengen(el("div", "datenzeile-zeile"), [
      knopf({ text: "Vorschlag übernehmen: 2027/28", variante: "leise", klein: true }),
      el("span", "meta", "aus Beschaffungsjahr + 5")
    ]);

    const bearbeiten = UI.datenzeilen([
      inventarZeile,
      ort,
      UI.formZeile("Status", UI.eingabe({ art: "auswahl", werte: ["Aktiv", "Lager", "Archiviert"], wert: "Aktiv" })),
      UI.formZeile("Beschaffungsjahr", UI.eingabe({ art: "zahl", wert: 2022, min: 2000, max: 2100, schmal: true }),
        { hinweis: "Geschäftsjahr beginnt am 1. August.", zusatz: vorschlag }),
      UI.formZeile("Ersatz geplant", UI.eingabe({ art: "datum", wert: "2027-08-01", schmal: true })),
      bemerkung,
      UI.formZeile("Seriennummer", UI.eingabe({ wert: "5CG1234XYZ", nurLesen: true }), { hinweis: "Nur lesbar: kommt aus SCCM." }),
      UI.formZeile("Neuer PC-Name", pcName, { hinweis: "«CAMPUS-907» tippen: der Hinweis erscheint (UI.hinweisPlatz).",
        zusatz: namenWarnung }),
      UI.formZeile("Programm-ID", programmId, { zusatz: idHinweis })
    ]);

    const ticket = UI.eingabe({ platzhalter: "z. B. 3727", art: "text" });
    const pruefen = knopf({ text: "Prüfen", variante: "primaer", beiKlick: function () {
      if (!ticket.value.trim()) { UI.feldFehler(ticket, "Bitte eine Ticketnummer eingeben."); ticket.focus(); return; }
      info("Ticket «" + ticket.value.trim() + "» gefunden.");
    } });

    const felder = el("div", "feld-raster");
    anhaengen(felder, [
      UI.feld("Vorname", UI.eingabe({ platzhalter: "z. B. Max" }), { hinweis: "Wie im Active Directory." }),
      UI.feld("Abteilung", UI.eingabe({ art: "auswahl", werte: ["Informatik", "Verwaltung", "Lehrgänge"], leer: "Alle" })),
      UI.feld("Gültig ab", UI.eingabe({ art: "datum" })),
      UI.feld("Gesperrt", UI.eingabe({ wert: "nur zur Ansicht", gesperrt: true })),
      UI.feld("Notiz", UI.eingabe({ art: "textbereich", platzhalter: "Was soll die nächste Person wissen?" }), { voll: true })
    ]);

    const gefuellt = anhaengen(el("div", "feld-reihe"), [
      UI.feld("Quelle", UI.eingabe({ art: "auswahl", gefuellt: true, werte: ["Alle", "SCCM", "Von Hand"] })),
      UI.feld("Von", UI.eingabe({ art: "datum", gefuellt: true })),
      UI.feld("Bis", UI.eingabe({ art: "datum", gefuellt: true }))
    ]);

    const hersteller = UI.mehrfach({ legende: "Hersteller", eintraege: [
      { text: "Dell Inc.", zahl: 26, an: true }, { text: "HP", zahl: 11 }, { text: "LENOVO", zahl: 3 },
      { text: "Microsoft Corporation", zahl: 2 }, { text: "Apple", zahl: 0, gesperrt: true }
    ] });

    const suchAnzahl = el("p", "anzahl", "50 ADMIN-Clients");
    suchAnzahl.setAttribute("aria-live", "polite");
    const suche = UI.suchfeld({ id: "sg-suche", platzhalter: "PC-Name, Inhaber, Seriennummer", kuerzel: "/",
      beiEingabe: function (w) {
        suchAnzahl.textContent = w.trim() ? (w.trim().length % 7 + 3) + " von 50 ADMIN-Clients" : "50 ADMIN-Clients";
      } });
    const filter = knopf({ text: "Filter", sinnbild: "filter", variante: "still" });
    filter.appendChild(UI.zaehler(2));
    const leiste = anhaengen(el("div", "werkzeugleiste"), [suche, filter,
      knopf({ text: "Spalten", sinnbild: "spalten", variante: "still" }),
      knopf({ text: "CSV", sinnbild: "herunterladen", variante: "still" }), suchAnzahl]);

    const schalter = el("div");
    anhaengen(schalter, [
      UI.schalterZeile({ name: "Microsoft 365", unter: "Lizenzgruppe M365-A3", wort: true, an: true,
        zusatz: [UI.status("3 Geräte", "neutral", { sinnbild: "laptop" })] }),
      UI.schalterZeile({ name: "KeePass", wort: true, an: false }),
      UI.schalterZeile({ name: "Adobe Acrobat Pro", unter: "aus der AD-Gruppe «SW-Adobe»", wort: true, gesperrt: true,
        titel: "Kommt aus der AD-Gruppe «SW-Adobe» und lässt sich hier nicht ausschalten." }),
      UI.schalterZeile({ name: "Teams-Telefonie", wort: true,
        schalter: UI.schalter({ an: false, deaktiviert: true, titel: "Nur für Mitarbeitende mit Telefonnummer." }) }),
      UI.schalterZeile({ name: "Langsam", unter: "beiWechsel liefert ein Promise, das nach 1 s erfüllt", wort: true,
        beiWechsel: function () { return warten(1000).then(function () { return true; }); } }),
      UI.schalterZeile({ name: "Schlägt fehl", unter: "beiWechsel liefert false: der Schalter springt zurück", wort: true,
        beiWechsel: function () { UI.meldung("Konnte nicht umgeschaltet werden.", { ton: "fehler" }); return false; } })
    ]);

    return abschnitt("formulare", "Formulare",
      "Beschriftung über dem Feld, nie schwebend; 40 px, Radius 8, Rahmen #747775. Der Fokus erscheint sofort als 2-px-Ring "
      + "innen. Fehler stehen mit Icon unter dem Feld, nie nur als Farbe.",
      [
        karte({ titel: "Bearbeiten in Datenzeilen", unter: "Der Punkt hinter der Beschriftung heisst «geändert» "
          + "(Screenreader: «(geändert)»); die Zahl steht in der Speicherleiste." }, [bearbeiten]),
        raster([
          karte({ titel: "Felder mit Beschriftung" }, [felder]),
          anhaengen(el("div", "stapel"), [
            karte({ titel: "Gefüllte Felder (Werkzeugleisten)" }, [gefuellt]),
            karte({ titel: "Feldreihe mit Knopf" }, [
              anhaengen(el("div", "feld-reihe"), [UI.feld("Ticketnummer", ticket), pruefen]),
              beschriftung("Leer «Prüfen» zeigt den Feldfehler; die erste Eingabe löscht ihn.")
            ])
          ])
        ]),
        raster([
          karte({ titel: "Kästchen und Optionen" }, [
            reihe([
              UI.ankreuzen({ text: "Archivierte anzeigen" }),
              UI.ankreuzen({ text: "Nur mit Bemerkung", an: true }),
              UI.ankreuzen({ text: "Gesperrt", an: true, gesperrt: true })
            ]),
            reihe([
              UI.ankreuzen({ text: "Normale Zeilen", art: "radio", name: "sg-dichte", an: true }),
              UI.ankreuzen({ text: "Kompakte Zeilen", art: "radio", name: "sg-dichte" })
            ]),
            UI.ankreuzen({ text: "Klein (32 px), leiser", klein: true }),
            hersteller
          ]),
          karte({ titel: "Suche und Werkzeugleiste", unter: "Gefüllte Pille mit EINEM Icon; «/» springt hinein, "
            + "die Zahl rechts schliesst die Leiste ab." }, [leiste])
        ]),
        karte({ titel: "Schalter", unter: "Aus · an · an und gesperrt (Schloss im Griff, Tooltip nennt die Gruppe). "
          + "Ein Klick schaltet an Ort und Stelle um, der Griff gleitet; das Zustandswort hält seine Breite." }, [schalter])
      ]);
  }

  /* ==================================================================
     Tabellen: schlicht in der Karte, Liste mit klebendem Kopf
     ================================================================== */

  function bauenTabellen() {
    const schlicht = UI.tabelle(
      ["Programm", "Version", { text: "Geräte", zahl: true }, "Status"],
      [
        ["Microsoft 365 Apps", "2409", 47, UI.status("Aktuell", "erfolg")],
        ["Adobe Acrobat Reader", "24.003", 31, UI.status("Update fällig", "warnung")],
        ["KeePass", "2.57", 12, UI.status("Aktuell", "erfolg")],
        ["7-Zip", "", 9, UI.status("Nicht verwaltet", "aus")]
      ], { beschriftung: "Installierte Programme" });

    const SPALTEN = [
      { schluessel: "name", text: "PC-Name" },
      { schluessel: "status", text: "Status" },
      { schluessel: "inhaber", text: "Inhaber" },
      { schluessel: "ort", text: "Gebäude / Stock" },
      { schluessel: "modell", text: "Modell" },
      { schluessel: "system", text: "Betriebssystem" },
      { schluessel: "speicher", text: "Freier Speicher", zahl: true, titel: "Freier Platz auf Laufwerk C: laut SCCM." },
      { schluessel: "jahr", text: "Beschafft", zahl: true },
      { schluessel: "gesehen", text: "Zuletzt gesehen", sortierbar: false, titel: "Letzter Kontakt mit SCCM." }
    ];
    const daten = geraete(40);
    let sortiert = "name", richtung = "auf";
    const kopf = UI.tabellenKopf(SPALTEN, { sortiert: sortiert, richtung: richtung, beiSortieren: function (k) {
      richtung = k === sortiert && richtung === "auf" ? "ab" : "auf";
      sortiert = k;
      kopf.sortierungSetzen(sortiert, richtung);
      zeilenZeichnen();
    } });
    const koerper = el("tbody");
    function wertVon(z, k) { return k === "status" ? z.status[0] : z[k]; }
    function zeilenZeichnen() {
      const liste = daten.slice().sort(function (a, b) {
        const x = wertVon(a, sortiert), y = wertVon(b, sortiert);
        const v = typeof x === "number" ? x - y : String(x).localeCompare(String(y), "de-CH");
        return richtung === "auf" ? v : -v;
      });
      UI.leeren(koerper);
      for (const z of liste) {
        const tr = el("tr");
        tr.setAttribute("data-name", z.name);
        const link = el("a", "name-link", z.name);
        link.href = "#tabellen";
        const zellen = [link, UI.status(z.status[0], z.status[1], { sinnbild: z.status[2] }), z.inhaber || "–",
          z.ort, z.modell, z.system, z.speicher + " GB", String(z.jahr), z.gesehen];
        zellen.forEach(function (w, i) {
          const td = el("td", SPALTEN[i].zahl ? "zahl" : null);
          if (w && w.nodeType) td.appendChild(w); else td.textContent = w;
          if (i === 2 && !z.inhaber) td.classList.add("t-still");
          tr.appendChild(td);
        });
        koerper.appendChild(tr);
      }
    }
    zeilenZeichnen();
    // Zeilenklick öffnet das Gerät (hier nur eine Meldung); der Name ist ein echter Link.
    koerper.addEventListener("click", function (ev) {
      const tr = ev.target.closest("tr");
      if (!tr) return;
      ev.preventDefault();
      info("Würde «" + tr.getAttribute("data-name") + "» öffnen (im selben Tab, Ctrl-Klick: neuer Tab).");
    });
    const tabelle = el("table", "tabelle");
    tabelle.appendChild(el("caption", "nur-sr", "ADMIN-Clients"));
    anhaengen(tabelle, [kopf, koerper]);
    const rahmen = UI.tabellenRahmen(tabelle, { id: "sg-tabelle" });

    const dicht = knopf({ text: "Kompakt", sinnbild: "dichte", variante: "still", gedrueckt: false, beiKlick: function () {
      const an = dicht.getAttribute("aria-pressed") !== "true";
      dicht.setAttribute("aria-pressed", an ? "true" : "false");
      rahmen.classList.toggle("dicht", an);
    } });
    const liste = anhaengen(el("div", "sg-liste"), [rahmen]);

    return abschnitt("tabellen", "Tabellen",
      "Kopf 48 px (500, #444746), Zeilen 52 px (kompakt 40), Haarlinien zwischen den Zeilen, Hover #f3f4f2, Zahlen rechts "
      + "und tabellarisch, keine Zebrastreifen.",
      [
        karte({ titel: "Aufstellung in einer Karte", unter: "Läuft bis an den Kartenrand; die erste und letzte Zelle "
          + "fluchten mit dem Kartentext. Auf dem Handy blendet der rechte Rand aus." }, [schlicht]),
        anhaengen(el("div", "werkzeugleiste"), [
          UI.suchfeld({ platzhalter: "In der Liste suchen", label: "In der Liste suchen" }), dicht,
          el("p", "anzahl", "40 ADMIN-Clients")
        ]),
        liste,
        UI.hinweis("Die Liste ist ein eigener Roller: Kopf und erste Spalte kleben, die Haarlinie rechts der ersten Spalte "
          + "erscheint erst beim seitlichen Rollen. Sortieren über den Knopf im Kopf (aria-sort an allen sortierbaren "
          + "Spalten); der Pfeil steht nur an der sortierten.")
      ]);
  }

  /* ==================================================================
     Hinweise und Zustände
     ================================================================== */

  function bauenHinweise() {
    const fort = UI.fortschritt({ anteil: 0.36, text: "ADMIN-Clients: 18 von 50 geladen", detail: "Aktuell: CAMPUS-918",
      label: "Ladefortschritt" });
    let anteil = 0.36;
    const weiter = knopf({ text: "Weiter", klein: true, beiKlick: function () {
      anteil = anteil >= 1 ? 0.1 : Math.min(1, anteil + 0.22);
      const n = Math.round(anteil * 50);
      fort.setzen({ anteil: anteil, text: "ADMIN-Clients: " + n + " von 50 geladen", detail: "Aktuell: CAMPUS-" + (900 + n) });
    } });

    const ladeOrt = el("div");
    const ladezeileZeigen = function () { UI.leeren(ladeOrt).appendChild(UI.ladezeile("Verlauf wird geladen …")); };
    ladezeileZeigen();

    return abschnitt("hinweise", "Hinweise und Zustände",
      "Banner sind tonale Kästen mit Icon (Info neutral mit grünem Icon). Leerzustände sagen, was als Nächstes zu tun ist. "
      + "Ladeanzeigen erscheinen erst nach 200 ms und bleiben dann mindestens 450 ms.",
      [
        karte({ titel: "Banner" }, [
          UI.banner({ ton: "info", titel: "Neutraler Hinweis.", text: "Die Werte kommen aus dem nächtlichen SCCM-Abgleich." }),
          UI.banner({ ton: "erfolg", titel: "Alles abgeglichen.", text: "SCCM und AD stehen auf dem Stand von heute, 05.15." }),
          UI.banner({ ton: "warnung", titel: "Vorführmodus.", text: "Alle Daten sind erfunden; Änderungen bleiben im Browser.",
            knopf: knopf({ text: "Zurücksetzen", variante: "leise" }) }),
          UI.banner({ ton: "gefahr", rolle: "alert", text: "Die Daten konnten nicht geladen werden. Netzwerkfehler.",
            knopf: knopf({ text: "Erneut versuchen", variante: "leise" }) }),
          UI.banner({ ton: "info", sinnbild: "schloss", text: "Nur Mitglieder der Gruppe «ICT-Admins» sehen diese Seite." })
        ]),
        raster([
          karte({ titel: "Hinweisliste" }, [
            UI.hinweise([
              UI.hinweisZeile({ ton: "gefahr", titel: "Ersatz überfällig", text: "Beschafft 2019/20, geplant war 2024/25." }),
              UI.hinweisZeile({ ton: "warnung", titel: "Wenig Speicher", text: "Noch 9 GB frei (4 %)." }),
              UI.hinweisZeile({ ton: "info", titel: "Seit 40 Tagen nicht gesehen", text: "Zuletzt am 02.09.2026 in SCCM." }),
              UI.hinweisZeile({ ton: "erfolg", titel: "BitLocker aktiv", text: "Wiederherstellungsschlüssel im AD." })
            ])
          ]),
          karte({ titel: "Laden" }, [
            reihe([UI.spinner(), el("span", "hinweis", "Spinner 16 px"), UI.status("Läuft", "laeuft"),
              knopf({ text: "Ladezeile neu", klein: true, beiKlick: ladezeileZeigen })]),
            ladeOrt,
            fort,
            reihe([weiter, beschriftung("Der Balken gleitet per scaleX, nie über die Breite.")]),
            UI.fortschritt({ unbestimmt: true, text: "Abgleich läuft …", label: "Abgleich" })
          ])
        ]),
        raster([
          karte({ titel: "Leerzustand: noch nichts da" }, [
            UI.leerzustand({ sinnbild: "laptop", titel: "Noch keine Geräte",
              text: "Neue Geräte erscheinen nach dem nächsten SCCM-Abgleich oder über «Neuer ADMIN-Client»." })
          ]),
          karte({ titel: "Leerzustand: nichts für diese Filter" }, [
            UI.leerzustand({ sinnbild: "suche", titel: "Keine Treffer", text: "Für diese Filter gibt es keine ADMIN-Clients.",
              aktion: { text: "Filter zurücksetzen", beiKlick: function () { info("Filter zurückgesetzt."); } } })
          ])
        ]),
        karte({ titel: "Skelett", unter: "Seitenskelett: unsichtbar für 200 ms, dann pulsierend (kein Schimmer)." }, [
          UI.skelettSeite({ karten: 1, kopf: true })
        ])
      ]);
  }

  /* ==================================================================
     Listen und Diagramme
     ================================================================== */

  function bauenListen() {
    const zeilen = UI.zeilenliste([
      UI.listenZeile({ titel: "CAMPUS-907", unter: ["Haus C / UG", "Latitude 7440", "Muster Max"], href: "#listen",
        sinnbild: "laptop", status: UI.status("Online", "erfolg", { sinnbild: "online" }) }),
      UI.listenZeile({ titel: "EDU-AULA-03", unter: ["Aula", "OptiPlex 7010"], sinnbild: "edu",
        beiKlick: function () { info("Würde EDU-AULA-03 öffnen."); } }),
      UI.listenZeile({ titel: "Muster Max", unter: "max.muster@campus-sursee.ch", sinnbild: "benutzer", aktuell: true,
        status: UI.status("Inhaber", "neutral", { sinnbild: "benutzer" }) }),
      UI.listenZeile({ titel: "+41 41 926 22 01", unter: ["Kurzwahl 201", "Empfang"], sinnbild: "telefon", href: "#listen",
        aktionen: [knopf({ text: "Freigeben", variante: "leise", klein: true }),
          knopf({ variante: "sinnbild", sinnbild: "papierkorb", titel: "Entfernen", klein: true })] })
    ]);

    const aufgaben = UI.zeilenliste([
      UI.listenZeile({ titel: "Nicht in SCCM", unter: ["ADMIN-Clients", "Abgleich findet kein Gerät"], href: "#listen",
        marke: UI.zahlmarke(3, "gefahr"), status: UI.status("Dringend", "gefahr") }),
      UI.listenZeile({ titel: "Ersatz in diesem GJ", unter: ["EDU-Clients", "geplant 2026/27"], href: "#listen",
        marke: UI.zahlmarke(4, "warnung") })
    ]);

    const verlauf = UI.zeitachse([
      { titel: "12.10.2026", zeit: "14.05 · Muster Max", text: "Inhaber gewechselt: Beispiel Anna → Muster Max",
        zusatz: [UI.status("Von Hand", "neutral", { sinnbild: "bearbeiten" })],
        aktionen: [knopf({ text: "Bearbeiten", variante: "leise", klein: true }), knopf({ text: "Löschen", variante: "leise", klein: true })] },
      { titel: "03.09.2026", zeit: "erfasst um 05.15", zeitSinnbild: "sync",
        text: "Aus SCCM: Betriebssystem auf Windows 11 Pro 24H2 aktualisiert.", still: true,
        zusatz: [UI.status("Abgleich", "neutral", { sinnbild: "server" })] },
      { titel: "14.08.2026", zeit: "09.30 · Keller Laura", text: "Aus dem Lager ausgegeben an Beispiel Anna." }
    ]);

    const hersteller = UI.verteilung([
      { text: "Dell Inc.", zahl: 26 }, { text: "HP", zahl: 11 }, { text: "LENOVO", zahl: 3 },
      { text: "Microsoft Corporation", zahl: 2 }
    ].map(function (e) { e.beiKlick = function () { info("Würde nach «" + e.text + "» filtern."); }; return e; }));
    const abteilungen = UI.verteilung([
      { text: "Informatik", zahl: 9 }, { text: "Verwaltung", zahl: 21 }, { text: "Lehrgänge und Weiterbildung Bau und Technik", zahl: 14 }
    ]);

    return abschnitt("listen", "Listen und Diagramme",
      "Umrandete Listen mit klickbaren Zeilen (6-%-Ebene, der Pfeil rückt beim Hover 4 px nach), die Zeitachse des Verlaufs, "
      + "Verteilungen und Säulen. Balken und Säulen wachsen nur beim ersten Zeigen.",
      [
        raster([
          karte({ titel: "Zeilenliste" }, [zeilen]),
          karte({ titel: "Zeitachse", aktionen: [knopf({ text: "Neuer Eintrag", variante: "tonal", sinnbild: "plus" })] }, [verlauf])
        ]),
        karte({ titel: "Handlungsbedarf", unter: "UI.listenZeile({ marke: UI.zahlmarke(zahl, ton) }): 32-px-Zahlmarke, "
          + "tonal nach Dringlichkeit; das Wort «Dringend» steht zusätzlich in der Zeile." }, [aufgaben]),
        raster([
          karte({ titel: "Verteilung (klickbar)" }, [hersteller]),
          karte({ titel: "Verteilung" }, [abteilungen,
            UI.saeulen([3, 5, 8, 12, 9, 6, 4, 2].map(function (w, i) {
              return { wert: w, titel: "GJ " + (2019 + i) + "/" + String(20 + i).slice(-2) + ": " + w + " beschafft" };
            }), { hervorheben: 3, label: "Beschaffungen pro Geschäftsjahr, 2019/20 bis 2026/27" }),
            beschriftung("Säulen: Beschaffungen pro Geschäftsjahr, das aktuelle hervorgehoben.")
          ])
        ]),
        karte({ titel: "Balken" }, [
          UI.balken(0.72), UI.balken(0.4, "warnung"), UI.balken(0.9, "gefahr"), UI.balken(0.3, "still")
        ])
      ]);
  }

  /* ==================================================================
     Seitenkopf
     ================================================================== */

  function bauenSeitenkopf() {
    const detail = UI.seitenkopf({
      ebene: 3,
      pfad: { text: "ADMIN-Clients", href: "#seitenkopf" },
      titel: "CAMPUS-907",
      unter: ["Haus C / UG", "Latitude 7440", "Inventar 7", "Muster Max"],
      status: [UI.status("In SCCM", "erfolg"), UI.status("Online", "erfolg", { sinnbild: "online" }),
        UI.status("Ersatz 2027/28", "neutral", { sinnbild: "kalender" })],
      aktionen: [
        knopf({ text: "Ins Lager legen", variante: "leise", sinnbild: "lager" }),
        knopf({ text: "Archivieren", variante: "leise", sinnbild: "archiv" }),
        knopf({ variante: "sinnbild", sinnbild: "mehr", titel: "Weitere Aktionen" })
      ]
    });
    const liste = UI.seitenkopf({
      ebene: 3,
      titel: "ADMIN-Clients",
      lead: "Alle Verwaltungsgeräte aus SCCM und der Inventarliste. Ein Klick auf eine Zeile öffnet das Gerät."
    });
    return abschnitt("seitenkopf", "Seitenkopf",
      "UI.seitenkopf: Titel 24/32 und Lead 14/20 (höchstens 76 Zeichen) für jede Ansicht; auf Detailseiten darüber der "
      + "Zurück-Link zur gemerkten Liste, darunter Teile und Status, rechts die Schnellaktionen.",
      [
        anhaengen(el("div", "sg-probe"), [detail]),
        anhaengen(el("div", "sg-probe"), [liste]),
        UI.hinweis("Auf schmalen Bahnen (≤ 600 px) stehen die Aktionen unter dem Titel. Gesperrte Schnellaktionen "
          + "nennen ihren Grund im Tooltip (aria-disabled).")
      ]);
  }

  /* ==================================================================
     Überlagerungen: Dialog, Seitenblatt, Meldung, Tooltip, Speicherleiste
     ================================================================== */

  function bauenUeberlagerungen() {
    const bestaetigen = knopf({ text: "Bestätigen", beiKlick: async function () {
      const ja = await UI.bestaetigen({
        titel: "Gerät archivieren?",
        text: "CAMPUS-907 verschwindet aus der Liste der aktiven Geräte. Du kannst es jederzeit reaktivieren.",
        ja: "Archivieren"
      });
      info(ja ? "Antwort: Archivieren." : "Antwort: Abgebrochen.");
    } });

    const formular = knopf({ text: "Dialog mit Liste", beiKlick: function () {
      const personen = ["Muster Max", "Beispiel Anna", "Keller Laura", "Meier Jonas"];
      let gewaehlt = null;
      const uebernehmen = knopf({ text: "Übernehmen", variante: "primaer", deaktiviert: true });
      const zeilen = personen.map(function (p) {
        const z = UI.listenZeile({ titel: p, unter: p.toLowerCase().replace(" ", ".") + "@campus-sursee.ch", sinnbild: "benutzer",
          beiKlick: function () {
            gewaehlt = p;
            for (const andere of zeilen) andere.classList.toggle("aktuell", andere === z);
            uebernehmen.disabled = false;
          } });
        return z;
      });
      // Die Trefferliste als .dialog-liste: sie rollt selbst und nimmt die
      // Resthöhe; Titel, Suchfeld und Knöpfe bleiben stehen (rahmen.css).
      const d = UI.dialog({
        titel: "Inhaber festlegen", breit: true,
        inhalt: [el("p", null, "Wem gehört CAMPUS-907? Die Person bekommt das Gerät im Verlauf zugeschrieben."),
          UI.suchfeld({ platzhalter: "Name oder E-Mail", label: "Person suchen" }),
          UI.anhaengen(el("div", "dialog-liste"), UI.zeilenliste(zeilen))],
        knoepfe: [knopf({ text: "Abbrechen", variante: "leise", beiKlick: function () { d.schliessen("abbrechen"); } }), uebernehmen]
      });
      uebernehmen.addEventListener("click", function () {
        d.schliessen("ja");
        UI.meldung("Inhaber: " + gewaehlt + ".");
      });
    } });

    const loeschen = knopf({ text: "Löschen mit Eintippen", beiKlick: function () {
      const wort = "CAMPUS-907";
      const feld = UI.eingabe({ art: "text" });
      const endgueltig = knopf({ text: "Endgültig löschen", variante: "primaer", deaktiviert: true });
      const d = UI.dialog({
        titel: "CAMPUS-907 löschen?", breit: true,
        inhalt: [el("p", null, "Die Zeile verschwindet aus der Inventarliste. Der Verlauf geht mit."),
          UI.banner({ ton: "warnung", text: "Das lässt sich nicht rückgängig machen." }),
          UI.feld("Zur Bestätigung «" + wort + "» abtippen", feld, { klasse: "dialog-bestaetigung" })],
        knoepfe: [knopf({ text: "Abbrechen", variante: "leise", beiKlick: function () { d.schliessen("abbrechen"); } }), endgueltig],
        fokus: feld
      });
      feld.addEventListener("input", function () { endgueltig.disabled = feld.value.trim().toLowerCase() !== wort.toLowerCase(); });
      endgueltig.addEventListener("click", async function () {
        UI.beschaeftigt(endgueltig, true, "Wird gelöscht …");
        await warten(900);
        await UI.beschaeftigtAbwarten(endgueltig);
        d.schliessen("geloescht");
        UI.meldung("CAMPUS-907 gelöscht (nur im Styleguide).");
      });
    } });

    const filterBlatt = knopf({ text: "Filter (560 px)", sinnbild: "filter", beiKlick: function () {
      let blatt = null;
      function zaehlen() {
        const n = Array.from(blatt.koerper.querySelectorAll("input:checked")).length;
        blatt.unter((n ? 163 - n * 29 : 163) + " von 163");
      }
      const gruppen = [
        UI.mehrfach({ legende: "Hersteller", eintraege: [{ text: "Dell Inc.", zahl: 26 }, { text: "HP", zahl: 11 },
          { text: "LENOVO", zahl: 3 }], beiAenderung: function () { zaehlen(); } }),
        UI.mehrfach({ legende: "Status", eintraege: [{ text: "Aktiv", zahl: 47 }, { text: "Lager", zahl: 2 },
          { text: "Archiviert", zahl: 12 }], beiAenderung: function () { zaehlen(); } }),
        anhaengen(el("div", "feld-raster"), [UI.feld("Beschafft ab", UI.eingabe({ art: "datum" })),
          UI.feld("Beschafft bis", UI.eingabe({ art: "datum" }))])
      ];
      blatt = UI.blatt({
        titel: "Filter", unter: "163 von 163", inhalt: gruppen,
        fuss: [knopf({ text: "Filter zurücksetzen", variante: "tonal", beiKlick: function () {
          for (const g of gruppen) if (g.setzen) g.setzen([]);
          zaehlen();
        } }), knopf({ text: "Fertig", variante: "primaer", beiKlick: function () { blatt.schliessen("fertig"); } })]
      });
    } });

    const detailBlatt = knopf({ text: "Details (720 px)", beiKlick: function () {
      const roh = el("pre", "code-block", JSON.stringify({ Title: "CAMPUS-907", SCCM_Found: "Ja", Modell: "Latitude 7440",
        FreierSpeicherGB: 211, LetzteAnmeldung: "2026-10-10T07:12:00Z" }, null, 2));
      roh.tabIndex = 0;
      roh.setAttribute("aria-label", "Rohdaten");
      UI.blatt({
        titel: "CAMPUS-907", breite: 720,
        inhalt: [reihe([UI.status("In SCCM", "erfolg"), UI.meta("Zuletzt gesehen 12.10.2026, 14.05")]),
          UI.fakten([["Modell", "Latitude 7440"], ["Seriennummer", "5CG1234XYZ"], ["Gebäude / Stock", "Haus C / UG"],
            ["Inhaber", "Muster Max"]]),
          el("h3", "karte-untertitel", "Rohdaten"), roh,
          UI.hinweis("Der Körper rollt; die Haarlinie unter dem Kopf erscheint erst dann.")]
      });
    } });

    const meldungen = reihe([
      knopf({ text: "Erfolg", beiKlick: function () { UI.meldung("3 Änderungen gespeichert."); } }),
      knopf({ text: "Info", beiKlick: function () { UI.meldung("Liste aktualisiert.", { ton: "info" }); } }),
      knopf({ text: "Fehler", beiKlick: function () { UI.meldung("Speichern fehlgeschlagen. Netzwerkfehler.", { ton: "fehler" }); } }),
      knopf({ text: "Mit Aktion", beiKlick: function () {
        UI.meldung("Filter «Hersteller: HP» entfernt.", { ton: "info", aktion: { text: "Rückgängig",
          beiKlick: function () { UI.meldung("Filter wieder gesetzt."); } } });
      } })
    ]);

    // Speicherleiste: dieselbe, die fenster.js auf Detailseiten führt.
    let aenderungen = 0;
    let naechsterFehler = false;
    const leiste = UI.speicherleiste({
      beiSpeichern: async function () {
        leiste.setzen({ beschaeftigt: true, text: "Wird gespeichert …" });
        await warten(1100);
        if (naechsterFehler) {
          naechsterFehler = false;
          leiste.setzen({ beschaeftigt: false, text: aenderungen + (aenderungen === 1 ? " Änderung" : " Änderungen"),
            speichernText: "Nochmals speichern" });
          UI.meldung("Speichern fehlgeschlagen. Die Zeile wurde zwischenzeitlich geändert.", { ton: "fehler" });
          return;
        }
        aenderungen = 0;
        leiste.setzen({ beschaeftigt: false, sichtbar: false, speichernText: "Speichern" });
        UI.meldung("Gespeichert.");
      },
      beiVerwerfen: async function () {
        const ja = await UI.bestaetigen({ titel: "Änderungen verwerfen?",
          text: "Die ungespeicherten Änderungen gehen verloren.", ja: "Verwerfen" });
        if (!ja) return;
        aenderungen = 0;
        leiste.setzen({ sichtbar: false });
      }
    });
    const aendern = knopf({ text: "Änderung machen", beiKlick: function () {
      aenderungen += 1;
      leiste.setzen({ sichtbar: true, text: aenderungen + (aenderungen === 1 ? " Änderung" : " Änderungen"),
        meta: "Zuletzt gespeichert am 07.10.2026, 00.23", speichernAus: false, verwerfenAus: false });
    } });
    const fehlerKnopf = knopf({ text: "Nächstes Speichern scheitert", variante: "leise", beiKlick: function () {
      naechsterFehler = true;
      info("Das nächste Speichern scheitert.");
    } });

    const tippGesperrt = knopf({ text: "Nummer freigeben", variante: "leise", titel: "Zuerst die Änderungen speichern." });
    tippGesperrt.setAttribute("aria-disabled", "true");

    return abschnitt("ueberlagerungen", "Dialoge, Blatt, Meldungen",
      "Alle Ebenen fangen den Fokus, machen den Rest inert, schliessen mit Esc und geben den Fokus an den Auslöser zurück. "
      + "UI.bestaetigen löst bei Esc, Schleier und «Abbrechen» mit false auf.",
      [
        raster([
          karte({ titel: "Dialoge", unter: "400 px für Fragen, 560 px für Listen und Formulare; Radius 16, Ebene 3. "
            + "Der Hauptknopf nennt die Folge, «Abbrechen» steht als Text-Knopf links davon." }, [
            reihe([bestaetigen, formular, loeschen])
          ]),
          karte({ titel: "Seitenblatt", unter: "Von rechts, 560 oder 720 px, Kopf 64 px mit Titel 22/28 und ×. "
            + "Filter wirken sofort, die Trefferzahl steht live im Kopf." }, [reihe([filterBlatt, detailBlatt])])
        ]),
        raster([
          karte({ titel: "Meldungen", unter: "Unten links in der Tafel, #303030. Erfolg und Info gehen nach 3,2 s, "
            + "Fehler bleiben mit × stehen. Höchstens drei gleichzeitig." }, [meldungen]),
          karte({ titel: "Tooltips", unter: "Nach 500 ms Zeigen, mit der Tastatur sofort; der Zeiger darf auf den Tooltip wechseln." }, [
            reihe([
              knopf({ variante: "sinnbild", sinnbild: "kopieren", titel: "In die Zwischenablage" }),
              knopf({ variante: "sinnbild", sinnbild: "verknuepfung", titel: "Link kopieren" }),
              tippGesperrt,
              UI.status("Ersatz 2027/28", "neutral", { sinnbild: "kalender", titel: "Beschaffungsjahr 2022/23 + 5 Jahre" })
            ])
          ])
        ]),
        karte({ titel: "Speicherleiste", unter: "Schwebt unten in der Tafel über dem Inhalt (Radius 16, Ebene 3) und hält "
          + "ihren Platz frei. Fehler stehen als Meldung darüber, nie als rote Leiste. Ctrl+S speichert auf Detailseiten." }, [
          reihe([aendern, fehlerKnopf])
        ])
      ]);
  }

  /* ==================================================================
     Rahmen: Zustände der Tafel, Vorführ-Hinweis, Schublade
     ================================================================== */

  function bauenRahmen() {
    const laden = knopf({ text: "Ladezustand (2,5 s)", beiKlick: function () {
      Rahmen.zustand("laden", { text: "Styleguide wird geladen …", fortschritt: "ADMIN-Clients 18 / 50" });
      setTimeout(function () { Rahmen.zustand("laden", { fortschritt: "ADMIN-Clients 50 / 50 · Benutzer 12 / 56" }); }, 1200);
      setTimeout(function () { Rahmen.zustand("inhalt"); }, 2500);
    } });
    const fehler = knopf({ text: "Fehlerzustand", beiKlick: function () {
      Rahmen.zustand("fehler", {
        titel: "Die Daten konnten nicht geladen werden",
        text: "Vorführ-Fehler: so sieht es aus, wenn Microsoft Graph nicht antwortet.",
        knopfText: "Zurück zum Styleguide",
        beiKlick: function () {
          Rahmen.zustand("inhalt").then(function () {
            Rahmen.dokumentTitel("Styleguide");
            const t = document.getElementById("rahmen-titel");
            if (t) { t.scrollIntoView({ block: "start" }); t.focus({ preventScroll: true }); }
          });
        }
      });
    } });
    let vorfuehrung = false;
    const vorfuehren = knopf({ text: "Vorführ-Hinweis", gedrueckt: false, variante: "still", sinnbild: "flagge",
      beiKlick: function () {
        vorfuehrung = !vorfuehrung;
        vorfuehren.setAttribute("aria-pressed", String(vorfuehrung));
        Rahmen.vorfuehrung(vorfuehrung ? { beiZuruecksetzen: function () { UI.meldung("Vorführ-Änderungen zurückgesetzt."); } } : null);
      } });
    const schublade = knopf({ text: "Schublade öffnen", sinnbild: "menue", beiKlick: function () {
      if (window.matchMedia("(max-width: 900px)").matches) Rahmen.schublade.oeffnen();
      else info("Die Schublade wird erst unter 900 px Breite modal.");
    } });

    return abschnitt("rahmen", "Rahmen",
      "Kopf 64 px und Schublade 256 px liegen ohne Linie auf dem Grund #f3f4f2; die weisse Tafel (Radius 20 oben) ist der "
      + "einzige Roller. ≤ 900 px wird die Schublade modal, ≤ 720 px zeigt der Kopf die Initiale, ≤ 600 px ist die Tafel randlos.",
      [
        karte({ titel: "Zustände der Tafel", unter: "Laden: nach 200 ms Skelett und 4-px-Ladebalken, der Fortschritt als "
          + "Meta-Zeile. Fehler: Fehlerkasten mit Titel und «Erneut laden». Der Vorführ-Hinweis steht als erster Block." }, [
          reihe([laden, fehler, vorfuehren, schublade])
        ])
      ]);
  }

  /* ==================================================================
     Bewegung
     ================================================================== */

  function bauenBewegung() {
    const muster = UI.karte({ titel: "Muster", klasse: "sg-muster-karte", ebene: 3 });
    muster.inhalt.appendChild(UI.hinweis("Jeder Eintritt ist Blende auf der Standardkurve plus eine kleine Bewegung."));
    const buehne = anhaengen(el("div", "sg-buehne"), [muster]);

    function austreten(variante) {
      return function () {
        Bewegung.austreten(muster, variante, { dann: "verbergen" }).then(function () {
          setTimeout(function () { muster.hidden = false; Bewegung.eintreten(muster, "tausch"); }, 350);
        });
      };
    }
    const eintritte = reihe([
      ["Standard", ""], ["Blenden", "blenden"], ["Skalieren", "skalieren"], ["Schieben", "schieben"],
      ["Tausch", "tausch"], ["Ploppen", "ploppen"]
    ].map(function (v) {
      return knopf({ text: v[0], klein: true, beiKlick: function () { muster.hidden = false; Bewegung.eintreten(muster, v[1]); } });
    }));
    const austritte = reihe([["Ausblenden", ""], ["Sinken", "sinken"], ["Skalieren", "skalieren"], ["Schieben", "schieben"]]
      .map(function (v) { return knopf({ text: v[0], klein: true, variante: "leise", beiKlick: austreten(v[1]) }); }));

    const auftrittFlaeche = anhaengen(el("div", "stapel"), [
      UI.kacheln([
        UI.kachel({ text: "ADMIN-Clients", wert: "50", zahl: 50, unter: "47 im Einsatz" }),
        UI.kachel({ text: "Benutzer", wert: "56", zahl: 56, unter: "42 mit Gerät" }),
        UI.kachel({ text: "Telefonnummern", wert: "80", zahl: 80, unter: "12 frei" }),
        UI.kachel({ text: "Software", wert: "1’284", zahl: 1284, unter: "Installationen" })
      ]),
      UI.verteilung([{ text: "Dell Inc.", zahl: 26 }, { text: "HP", zahl: 11 }, { text: "LENOVO", zahl: 3 }])
    ]);
    const nochmal = knopf({ text: "Noch einmal auftreten", sinnbild: "zuruecksetzen", beiKlick: function () {
      Bewegung.aufdecken(auftrittFlaeche);
      Bewegung.auftritt(auftrittFlaeche);
    } });

    const zeitraeume = ["Tag", "Woche", "Monat", "Jahr"].map(function (t, i) {
      return knopf({ text: t, klein: true, variante: "still", gedrueckt: i === 1 });
    });
    const spur = anhaengen(el("div", "sg-spur"), zeitraeume);
    spur.setAttribute("role", "group");
    spur.setAttribute("aria-label", "Zeitraum");
    let indikator = null;
    zeitraeume.forEach(function (k) {
      k.addEventListener("click", function () {
        for (const a of zeitraeume) a.setAttribute("aria-pressed", String(a === k));
        if (indikator) indikator.aktualisieren();
      });
    });

    const reduziert = Bewegung.reduziert();
    const bereitmachen = function () {
      indikator = Bewegung.indikator(spur, { aktiv: "[aria-pressed=\"true\"]", klasse: "sg-indikator" });
    };

    const abschnittEl = abschnitt("bewegung", "Bewegung",
      "Nur transform, Deckkraft, Farben, Schatten. Austritte sind kürzer als Eintritte, Staffelung 30 ms × höchstens 6 nur "
      + "beim ersten Zeigen, aktualisierte Daten animieren nie. Reduzierte Bewegung schaltet EIN Token-Block ab.",
      [
        raster([
          karte({ titel: "Eintritt und Austritt" }, [buehne, beschriftung("Eintritt"), eintritte, beschriftung("Austritt"), austritte]),
          anhaengen(el("div", "stapel"), [
            karte({ titel: "Gleitender Indikator", unter: "Die Pille gleitet in Lage und Grösse (250 ms); die erste "
              + "Platzierung springt. Dieselbe Technik trägt die Schublade." }, [spur]),
            karte({ titel: "Reduzierte Bewegung" }, [
              UI.status(reduziert ? "Reduzierte Bewegung aktiv" : "Normale Bewegung", reduziert ? "warnung" : "erfolg",
                { sinnbild: reduziert ? "aus" : "aktivitaet" }),
              UI.hinweis("Alle Dauern 1 ms, Wege 0, Staffel 0; Spinner und Ladebalken laufen langsamer weiter, "
                + "Zahlen stehen sofort auf dem Endwert.")
            ])
          ])
        ]),
        karte({ titel: "Staffelung, Hochzählen, Aufziehen", unter: "Bewegung.auftritt(behälter): Kinder von Kacheln, "
          + "Karten, Stapeln und Listen blenden 30 ms nacheinander ein, Zahlen zählen 600 ms hoch, Balken wachsen.",
          aktionen: [nochmal] }, [auftrittFlaeche])
      ]);
    abschnittEl.bereitmachen = bereitmachen;
    return abschnittEl;
  }

  /* ==================================================================
     Abschnitte, Schublade, Rollen
     ================================================================== */

  const ABSCHNITTE = [
    { gruppe: "", k: "grundlagen", text: "Grundlagen", sinnbild: "einstellungen", bauen: bauenGrundlagen },
    { gruppe: "Bausteine", k: "knoepfe", text: "Knöpfe", sinnbild: "plus", bauen: bauenKnoepfe },
    { gruppe: "Bausteine", k: "status", text: "Status und Chips", sinnbild: "checkKreis", bauen: bauenStatus },
    { gruppe: "Bausteine", k: "karten", text: "Karten und Kacheln", sinnbild: "uebersicht", bauen: bauenKarten },
    { gruppe: "Bausteine", k: "daten", text: "Datenzeilen", sinnbild: "liste", bauen: bauenDaten },
    { gruppe: "Bausteine", k: "formulare", text: "Formulare", sinnbild: "bearbeiten", bauen: bauenFormulare },
    { gruppe: "Bausteine", k: "tabellen", text: "Tabellen", sinnbild: "spalten", bauen: bauenTabellen },
    { gruppe: "Bausteine", k: "hinweise", text: "Hinweise und Zustände", sinnbild: "info", bauen: bauenHinweise },
    { gruppe: "Bausteine", k: "listen", text: "Listen und Diagramme", sinnbild: "diagramm", bauen: bauenListen },
    { gruppe: "Muster", k: "seitenkopf", text: "Seitenkopf", sinnbild: "dateiText", bauen: bauenSeitenkopf },
    { gruppe: "Muster", k: "ueberlagerungen", text: "Dialoge und Meldungen", sinnbild: "kopieren", bauen: bauenUeberlagerungen },
    { gruppe: "Muster", k: "rahmen", text: "Rahmen", sinnbild: "monitor", bauen: bauenRahmen },
    { gruppe: "Muster", k: "bewegung", text: "Bewegung", sinnbild: "aktivitaet", bauen: bauenBewegung }
  ];

  function gruppen() {
    const liste = [];
    let letzte = null;
    for (const a of ABSCHNITTE) {
      if (!letzte || letzte.titel !== a.gruppe) {
        letzte = { titel: a.gruppe, eintraege: [] };
        liste.push(letzte);
      }
      letzte.eintraege.push({ schluessel: a.k, text: a.text, sinnbild: a.sinnbild, href: "#" + a.k });
    }
    return liste;
  }

  const tafel = Rahmen.elemente().tafel;
  let aktiv = ABSCHNITTE[0].k;
  /* Solange ein Klick weich rollt, folgt die Pille dem Ziel, nicht jedem
     Abschnitt, an dem das Rollen vorbeikommt. */
  let rolltBis = 0;

  function aktivSetzen(k) {
    if (k === aktiv) return;
    aktiv = k;
    Rahmen.aktiv(k);
    try { history.replaceState(history.state, "", location.pathname + location.search + "#" + k); } catch (e) { /* file:// */ }
  }

  /* Der Abschnitt, dessen Kopf zuletzt über die obere Kante gerollt ist;
     am Ende der Tafel der letzte. */
  function sichtbarerAbschnitt() {
    const oben = tafel.getBoundingClientRect().top + 96;
    if (tafel.scrollTop + tafel.clientHeight >= tafel.scrollHeight - 2) return ABSCHNITTE[ABSCHNITTE.length - 1].k;
    let k = ABSCHNITTE[0].k;
    for (const a of ABSCHNITTE) {
      const s = document.getElementById(a.k);
      if (s && s.getBoundingClientRect().top <= oben) k = a.k;
    }
    return k;
  }

  let rollPlan = 0;
  function beimRollen() {
    if (rollPlan) return;
    rollPlan = requestAnimationFrame(function () {
      rollPlan = 0;
      if (Date.now() < rolltBis) return;
      aktivSetzen(sichtbarerAbschnitt());
    });
  }

  function hinrollen(k, weich) {
    const s = document.getElementById(k);
    if (!s) return;
    rolltBis = Date.now() + (weich ? 1200 : 50);
    s.scrollIntoView({ block: "start", behavior: weich ? "smooth" : "auto" });
    const fertig = function () { rolltBis = 0; };
    if ("onscrollend" in window) tafel.addEventListener("scrollend", fertig, { once: true });
  }

  function beiWahl(k, ereignis) {
    aktivSetzen(k);
    hinrollen(k, !Bewegung.reduziert());
    // Tastatur oder modale Schublade: der Fokus folgt zum Abschnittstitel
    // (wie ein Anker); sonst bleibt er auf dem Eintrag.
    const tastatur = ereignis && ereignis.detail === 0;
    if (tastatur || window.matchMedia("(max-width: 900px)").matches) {
      const t = document.getElementById(k + "-titel");
      if (t) t.focus({ preventScroll: true });
    }
  }

  /* «/» springt in die Suche (wie auf der Hauptseite), ausser beim Tippen. */
  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "/" || ev.ctrlKey || ev.metaKey || ev.altKey || UI.ebeneOffen()) return;
    const a = document.activeElement;
    if (a && a.matches && a.matches("input, textarea, select, [contenteditable=\"true\"]")) return;
    const suche = document.getElementById("sg-suche");
    if (!suche) return;
    ev.preventDefault();
    suche.scrollIntoView({ block: "center" });
    suche.focus();
    suche.select();
  });

  /* ==================================================================
     Start
     ================================================================== */

  function starten() {
    Rahmen.dokumentTitel("Styleguide");
    Rahmen.stand("Stand 12.10.2026, 14.05", "Erfundene Daten des Vorführmodus");
    Rahmen.konto({ name: "Muster Max", email: "max.muster@campus-sursee.ch" });
    Rahmen.abmelden(function () { info("Im Styleguide meldet «Abmelden» nur das hier."); });

    const ziel = (location.hash || "").replace(/^#/, "");
    const start = ABSCHNITTE.some(function (a) { return a.k === ziel; }) ? ziel : ABSCHNITTE[0].k;
    aktiv = start;
    Rahmen.navigation({ gruppen: gruppen(), aktiv: start, beiWahl: beiWahl, label: "Abschnitte" });

    const bahn = Rahmen.elemente().bahn;
    bahn.appendChild(UI.seitenkopf({
      titel: "Styleguide",
      lead: "Jede Komponente des ICT-Inventars in ihren Zuständen, gebaut mit denselben Bausteinen wie die Seiten "
        + "(UI, Rahmen, Bewegung). Vorbild ist die Admin-Oberfläche von ChatBob."
    }));
    const nachher = [];
    for (const a of ABSCHNITTE) {
      const s = a.bauen();
      bahn.appendChild(s);
      if (typeof s.bereitmachen === "function") nachher.push(s.bereitmachen);
    }

    Rahmen.zustand("inhalt").then(function () {
      for (const f of nachher) f();
      if (start !== ABSCHNITTE[0].k) hinrollen(start, false);
      tafel.addEventListener("scroll", beimRollen, { passive: true });
    });
  }

  starten();
})();

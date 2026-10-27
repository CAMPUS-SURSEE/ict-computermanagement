/* styleguide.js – die lebende Komponentenübersicht (styleguide.html).

   Baut jeden Baustein in seinen Zuständen, und zwar ausschliesslich über
   die Bauer der Fundament-Dateien: UI.* (bausteine.js und rahmen.js),
   Rahmen.* und Bewegung.* – die ihrerseits die Bausteine und die Bewegung
   von Dashboard-Style 1.6.2 setzen (.ds-*, DS.motion, DS.overlay, DS.dom,
   DS.ripple, DS.indicator aus vendor/dashboard-style/). Der Abschnitt
   «Grundlagen» zeigt das Campus-Thema, die Version der eingecheckten Kopie
   (aus vendor/dashboard-style/VERSION) und verweist auf den Styleguide von
   Dashboard-Style. Was hier richtig aussieht, sieht in den Seiten gleich
   aus; was hier fehlt, fehlt im System. Darum steht hier kein eigenes
   Markup für Bausteine, nur das Gerüst der Abschnitte und ein paar
   Musterflächen (Farbfelder, Bühne); ihr Layout steht in styleguide.css.

   Aufbau
     ABSCHNITTE      Reihenfolge, Gruppen und Sinnbilder der Schublade; je
                     Abschnitt eine Funktion, die ein <section> liefert.
     Navigation      Die Schublade zeigt Anker auf die Abschnitte. Ein Klick
                     setzt den Eintrag sofort aktiv und rollt weich hin; beim
                     Rollen folgt die Pastell-Pille dem Abschnitt im oberen
                     Band der Tafel (IntersectionObserver, kein Zuhörer auf
                     dem Rollen). Während ein Klick hinrollt, gilt sein Ziel,
                     bis es erreicht ist oder rollen und tippen es ablösen.
                     Die Adresse trägt den Abschnitt im Hash (replaceState:
                     kein Verlaufseintrag pro Abschnitt).
     Start           Rahmen.zustand('inhalt'): derselbe erste Auftritt wie
                     auf jeder Seite (aufdecken, staffeln, hochzählen).

   Wer einen Bauer ändert oder neu anlegt, zeigt ihn hier in allen
   Zuständen (AGENTS.md, «Oberfläche bauen»). Kein Inline-Skript (CSP),
   kein innerHTML, Texte in Schweizer Hochdeutsch. Alle Daten sind erfunden. */

"use strict";

(function () {

  const el = UI.el;
  const knopf = UI.knopf;
  const anhaengen = UI.anhaengen;

  /* ==================================================================
     Kleine Helfer für die Abschnitte
     ================================================================== */

  /* Ein Abschnitt: eigener Kopf (Titel 22/28 über .sg-abschnitt-titel,
     Lead) und darunter die Karten im Seitenrhythmus. */
  function abschnitt(schluessel, titel, lead, inhalt) {
    const s = el("section", "sg-abschnitt");
    s.id = schluessel;
    const kopf = UI.seitenkopf({ titel: titel, lead: lead, ebene: 2, titelId: schluessel + "-titel" });
    kopf.knoten.titel.classList.add("sg-abschnitt-titel");
    s.setAttribute("aria-labelledby", schluessel + "-titel");
    s.appendChild(kopf);
    anhaengen(s, inhalt);
    return s;
  }

  /* Karte mit Inhalt. o wie UI.karte ({titel, unter, aktionen, fuss, breit, gefuellt}). */
  function karte(o, inhalt) {
    const k = UI.karte(o);
    anhaengen(k.inhalt, inhalt);
    return k;
  }

  function reihe(kinder) { return anhaengen(el("div", "sg-reihe"), kinder); }

  function beschriftung(text) { return el("p", "sg-beschriftung", text); }

  function raster(kinder, klasse) { return anhaengen(el("div", klasse || "ds-grid-2"), kinder); }

  /* Eine erfundene Arbeit (Netz, Graph): löst nach ms auf, mit
     scheitern: true wird sie verworfen. */
  function warten(ms, scheitern) {
    return new Promise(function (erfuellen, verwerfen) {
      setTimeout(function () {
        if (scheitern) verwerfen(new Error("Vorführfehler"));
        else erfuellen();
      }, ms);
    });
  }

  function info(text) { UI.meldung(text, { ton: "info" }); }

  function anzahlText(n, wort) { return UI.zahlText(n) + " " + wort; }

  /* Erfundene Geräteliste für Tabellen und Listen (feste Folge, kein Zufall). */
  const MODELLE = ["Latitude 7440", "Latitude 5430", "OptiPlex 7010", "EliteBook 840 G9", "ThinkPad T14", "Surface Pro 9"];
  const ORTE = ["Haus A / EG", "Haus A / 1. OG", "Haus B / EG", "Haus B / 2. OG", "Haus C / UG", "Aula"];
  const PERSONEN = ["Muster Max", "Beispiel Anna", "Keller Laura", "Meier Jonas", "Huber Sara", "Graf Luca", "Frei Nina", ""];
  /* Status wie in app.js: der Normalfall «Aktiv» bleibt Text, nur Lager
     und Archiv bekommen einen Status-Chip mit eigenem Sinnbild. */
  const STATUS = [["Aktiv"], ["Lager", "neutral", "lager"], ["Archiviert", "neutral", "archiv"]];

  function geraete(anzahl) {
    const liste = [];
    for (let i = 0; i < anzahl; i++) {
      liste.push({
        name: "CAMPUS-" + (901 + i),
        status: STATUS[i % 9 === 4 ? 1 : (i % 13 === 6 ? 2 : 0)],
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
     Grundlagen: Dashboard-Style, Farben, Schrift, Abstände, Radien,
     Erhebung, Zahlen und Zeiten, Sinnbilder
     ================================================================== */

  /* Version und Commit der Kopie stehen in vendor/dashboard-style/VERSION
     (die nächtliche Aktualisierung schreibt sie). Bis die Datei da ist,
     gilt die Version, mit der sich ds.js meldet. */
  function versionLesen(ziel) {
    if (typeof fetch !== "function") return;
    fetch("vendor/dashboard-style/VERSION", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.text() : ""; })
      .then(function (text) {
        const version = /^version\s+(\S+)/m.exec(text);
        const commit = /^commit\s+([0-9a-f]{7})/m.exec(text);
        if (version) UI.textSetzen(ziel, version[1] + (commit ? " · Commit " + commit[1] : ""));
      })
      .catch(function () { /* ohne Datei bleibt die Version aus ds.js */ });
  }

  function bauenGrundlagen() {
    const stil = getComputedStyle(document.documentElement);
    const wert = function (token) { return stil.getPropertyValue(token).trim(); };

    const FARBEN = [
      ["Flächen", ["--ds-backdrop", "--ds-surface", "--ds-surface-low", "--ds-surface-high", "--ds-surface-highest"]],
      ["Text und Linien", ["--ds-text", "--ds-text-2", "--ds-text-3", "--ds-line", "--ds-line-2", "--ds-outline"]],
      ["Primär und Akzent", ["--ds-primary", "--ds-on-primary", "--ds-accent", "--ds-on-accent", "--campus-gruen"]],
      ["Status", ["--ds-success", "--ds-success-container", "--ds-on-success-container", "--ds-warning", "--ds-warning-container",
        "--ds-warning-surface", "--ds-error", "--ds-error-container", "--ds-on-error-container"]],
      ["Invers und Schleier", ["--ds-inverse", "--ds-on-inverse", "--ds-inverse-primary", "--ds-scrim"]]
    ];
    const farben = [el("p", "ds-muted", "Das Pastell ist die einzige Tönung. Es gibt kein Blau, auch kein blaues «Info»: "
      + "Neutrale Hinweise stehen auf --ds-surface-low mit grünem Icon. --campus-gruen nur als Dekoration (Punkt der "
      + "Wortmarke). Flächen, Haarlinie, Primär und Akzent setzt thema.css; alles Übrige ist der Standard von Dashboard-Style.")];
    for (const gruppe of FARBEN) {
      const feld = el("div", "sg-farben");
      for (const token of gruppe[1]) {
        const f = el("div", "sg-farbe");
        const muster = el("div", "sg-farbe-feld");
        muster.style.setProperty("background", "var(" + token + ")");
        anhaengen(f, [muster, el("code", null, token), el("span", "ds-meta", wert(token))]);
        feld.appendChild(f);
      }
      farben.push(el("h3", "ds-card__subtitle", gruppe[0]), feld);
    }

    const ROLLEN = [
      ["--ds-font-headline", "Seitentitel", "24/32 · 400 · h1 jeder Ansicht"],
      ["--ds-font-title", "Titel von Dialog und Seitenblatt", "22/28 · 400"],
      ["--ds-font-subtitle", "Kartentitel", "16/24 · 500"],
      ["--ds-font-reading", "Lesetext in Blättern, Feldtext auf dem Telefon", "16/24 · 400"],
      ["--ds-font-body", "Fliesstext, Felder, Tabellenzellen", "14/20 · 400"],
      ["--ds-font-label", "Knöpfe, Tabellenkopf, aktive Navigation", "14/20 · 500"],
      ["--ds-font-meta", "Meta-Zeile, Hinweise, Zeitstempel", "12/16 · 400"],
      ["--ds-font-caption", "Status-Chips, Feldbeschriftungen", "12/16 · 500"],
      ["--ds-font-display", "1’284", "36/44 · 400 · Kennzahlen, tabellarische Ziffern"],
      ["--ds-font-code", "{ \"Title\": \"CAMPUS-907\" }", "13/20 · Mono"]
    ];
    const schrift = el("div");
    for (const r of ROLLEN) {
      const z = el("div", "sg-schrift");
      const probe = el("p", null, r[1]);
      probe.style.setProperty("font", "var(" + r[0] + ")");
      if (r[0] === "--ds-font-display") probe.style.setProperty("font-variant-numeric", "tabular-nums");
      const teile = UI.teile([r[0], r[2]]);
      teile.classList.add("ds-meta");
      anhaengen(z, [probe, teile]);
      schrift.appendChild(z);
    }

    const abstaende = el("div", "sg-masse");
    for (const a of ["--ds-space-1", "--ds-space-2", "--ds-space-3", "--ds-space-4", "--ds-space-5", "--ds-space-6", "--ds-space-7", "--ds-space-8", "--ds-space-10", "--ds-space-12"]) {
      const m = el("div", "sg-mass");
      const b = el("div", "sg-mass-balken");
      b.style.setProperty("height", "var(" + a + ")");
      anhaengen(m, [b, el("span", "ds-meta", a.replace("--", "") + " · " + wert(a))]);
      abstaende.appendChild(m);
    }

    const radien = el("div", "sg-flaechen");
    for (const r of [["--ds-radius-xs", "Tooltip, Code"], ["--ds-radius-sm", "Felder, Chips"], ["--ds-radius-md", "Karten, Status, Banner"],
      ["--ds-radius-lg", "Kacheln, Dialoge, Blatt"], ["--ds-radius-xl", "Tafel (nur oben)"], ["--ds-radius-action", "Jede Aktion"]]) {
      const f = el("div", "sg-flaeche");
      f.style.setProperty("border-radius", "var(" + r[0] + ")");
      anhaengen(f, [anhaengen(el("div"), [el("code", null, r[0]), el("div", "ds-meta", r[1])])]);
      radien.appendChild(f);
    }
    const ebenen = el("div", "sg-flaechen");
    for (const e of [["--ds-elev-1", "Hover gefüllter Knöpfe"], ["--ds-elev-2", "Menüs, Sprungmarke"],
      ["--ds-elev-3", "Dialog, Blatt, Meldung, Speicherleiste"]]) {
      const f = el("div", "sg-flaeche");
      f.style.setProperty("border-color", "transparent");
      f.style.setProperty("border-radius", "var(--ds-radius-card)");
      f.style.setProperty("box-shadow", "var(" + e[0] + ")");
      anhaengen(f, [anhaengen(el("div"), [el("code", null, e[0]), el("div", "ds-meta", e[1])])]);
      ebenen.appendChild(f);
    }

    // Zahlen und Zeiten: EIN Formatierer je Art (UI.zahlText, UI.zeitText).
    const zahlen = UI.fakten([
      ["UI.zahlText(1284)", UI.zahlText(1284)],
      ["UI.zahlText(7.5)", UI.zahlText(7.5)],
      ["UI.zahlText(41, 1)", UI.zahlText(41, 1)],
      ["UI.zeitText(…)", UI.zeitText("2026-10-12T12:05:00Z")],
      ["Leerwert", ""]
    ]);

    // Sinnbilder: jede Glyphe einmal (DS.icons), der deutsche Name und Zweitnamen (Aliase) dahinter.
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
      t.appendChild(el("span", "ds-meta", UI.SINNBILDER[namen[0]] + (namen.length > 1 ? " · auch " + namen.slice(1).join(", ") : "")));
      z.appendChild(t);
      sinnbilder.appendChild(z);
    }

    // Woher alles kommt: Dashboard-Style (vendor/dashboard-style/) mit seinem eigenen Styleguide.
    const DS_REPO = "https://github.com/saschazesiger/Dashboard-Style";
    function dsLink(text, pfad) {
      const a = el("a", null, text);
      a.href = DS_REPO + pfad;
      a.target = "_blank";
      a.rel = "noopener";
      a.appendChild(UI.sinnbild("extern", 16));
      return a;
    }
    const version = el("span", null, (typeof DS !== "undefined" && DS.version) || "–");
    versionLesen(version);
    const grundlage = karte({ titel: "Dashboard-Style", unter: "Die Grundlage aller Seiten: Tokens (--ds-*), Bausteine (.ds-*), Bewegung "
      + "(DS.motion), Ebenen (DS.overlay), stilles Abgleichen (DS.dom), Druckwelle (DS.ripple) und Sinnbilder (DS.icons). Diese "
      + "Seite zeigt sie so, wie ICT-Inventar sie über UI.* baut, dazu die Bausteine, die es nur hier gibt; die neutrale "
      + "Übersicht steht im Styleguide von Dashboard-Style. Die Kopie in vendor/dashboard-style/ wird nie von Hand geändert." }, [
      UI.kennwerte([
        ["Version", version],
        ["Ablage", "vendor/dashboard-style/"],
        ["Campus-Thema", "thema.css"],
        ["Grundregeln (vor Dashboard-Style)", "grund.css"],
        ["Eigene Bausteine", "bausteine.css, rahmen.css"]
      ]),
      reihe([
        dsLink("Repository", ""),
        dsLink("Bausteine (components.md)", "/blob/main/docs/components.md"),
        dsLink("Bewegung (motion.md)", "/blob/main/docs/motion.md"),
        dsLink("Tokens (tokens.md)", "/blob/main/docs/tokens.md"),
        dsLink("Styleguide (Quelltext; lokal öffnen)", "/blob/main/styleguide/index.html")
      ])
    ]);

    return abschnitt("grundlagen", "Grundlagen",
      "Dashboard-Style mit dem Campus-Thema. Bausteine und Seiten lesen nur diese Tokens, nie Farben, Radien, Schriften oder Dauern als Literal.",
      [
        grundlage,
        karte({ titel: "Farben" }, farben),
        raster([
          karte({ titel: "Schriftrollen", unter: "Google Sans, nur 400 und 500. Überschriften sind nie fett, nichts ist gesperrt." }, [schrift]),
          anhaengen(el("div", "ds-stack"), [
            karte({ titel: "Abstände", unter: "4er-Raster. Seite 20 px zwischen Blöcken, Karte 16 px." }, [abstaende]),
            karte({ titel: "Radien" }, [radien]),
            karte({ titel: "Erhebung", unter: "Nur Schwebendes wirft Schatten; Karten haben eine Haarlinie." }, [ebenen]),
            karte({ titel: "Zahlen und Zeiten", unter: "de-CH mit Hochkomma, Uhrzeit mit Punkt, leer «–»." }, [zahlen])
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
    // setzt und hebt die Sperre an Ort und Stelle (bei jedem Tastendruck erlaubt),
    // frei kehrt der frühere Tooltip zurück.
    const GRUND = "Zuerst speichern oder verwerfen.";
    const mitGrund = knopf({ text: "Ins Lager legen", sinnbild: "lager", variante: "leise",
      titel: "Gerät ins Lager legen", gesperrt: GRUND });
    const sperreText = beschriftung("");
    const istGesperrt = function () { return mitGrund.getAttribute("aria-disabled") === "true"; };
    function sperreZeigen() {
      UI.textSetzen(sperreText, (istGesperrt() ? "Gesperrt, Tooltip «" : "Frei, Tooltip «") + mitGrund.getAttribute("data-tip") + "»");
    }
    const sperreUmschalten = knopf({ text: "Sperre aufheben", variante: "leise", klein: true, beiKlick: function () {
      const gesperrt = istGesperrt();
      UI.knopfSperren(mitGrund, gesperrt ? "" : GRUND);
      UI.knopfText(sperreUmschalten, gesperrt ? "Sperren" : "Sperre aufheben");
      sperreZeigen();
    } });
    sperreZeigen();

    // Beschäftigt: die Gesichter stehen schon beim Bauen (UI.knopf({ beschaeftigt,
    // fertig })), der Knopf ist von Anfang an so breit wie das breiteste.
    const speichern = knopf({ text: "Speichern", variante: "primaer", beschaeftigt: "Wird gespeichert …", fertig: "Gespeichert" });
    speichern.addEventListener("click", function () {
      UI.beschaeftigt(speichern, warten(1400)).then(function () { UI.meldung("Gespeichert."); });
    });
    const testen = knopf({ text: "Verbindung testen", beschaeftigt: "Wird getestet …" });
    testen.addEventListener("click", function () {
      UI.beschaeftigt(testen, warten(900, true)).catch(function () {
        UI.meldung("Verbindung fehlgeschlagen. Vorführfehler.", { ton: "fehler" });
      });
    });
    const abgleichen = knopf({ variante: "sinnbild", sinnbild: "sync", titel: "Jetzt abgleichen", beschaeftigt: true, fertig: true });
    abgleichen.addEventListener("click", function () {
      UI.beschaeftigt(abgleichen, warten(1100)).then(function () { info("Abgleich fertig."); });
    });
    const schnell = knopf({ text: "Kurz", variante: "tonal", beschaeftigt: "Wird geprüft …" });
    schnell.addEventListener("click", function () {
      UI.beschaeftigt(schnell, warten(120)).then(function () { info("In 120 ms fertig: kein Spinner."); });
    });

    return abschnitt("knoepfe", "Knöpfe",
      "Jede Aktion ist eine Pille (36 px, klein 32 px, Icon 40 px). Hover und Druck sind eine Ebene in der Schriftfarbe "
      + "(8 % / 10 %), nie ein Anheben oder Vergrössern; beim Druck läuft die Welle (DS.ripple), die Ecken werden kurz "
      + "eckiger und federn zurück. Es gibt keine roten Knöpfe.",
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
              knopf({ text: "Liste öffnen", variante: "leise", weiter: true, href: "#knoepfe" }),
              knopf({ text: "CSV", sinnbild: "herunterladen" }),
              knopf({ text: "Neuer ADMIN-Client", variante: "primaer", sinnbild: "plus" })
            ]),
            beschriftung("Primär = DIE Hauptaktion eines Bereichs · Umrandet = zweite Aktion · Tonal = weiche Hauptaktion "
              + "in Karten · Leise = Text-Knopf · Still = Werkzeugleisten. «Liste öffnen» ist ein Link (href) im "
              + "Knopf-Aussehen; sein Pfeil bewegt sich beim Hover nicht.")
          ]),
          karte({ titel: "Nur Icon, klein" }, [
            reihe([
              knopf({ variante: "sinnbild", sinnbild: "schliessen", titel: "Schliessen" }),
              knopf({ variante: "sinnbild", sinnbild: "bearbeiten", titel: "Bearbeiten" }),
              knopf({ variante: "sinnbild", sinnbild: "mehr", titel: "Weitere Aktionen" }),
              knopf({ variante: "sinnbild", sinnbild: "verlauf", titel: "Verlauf (Scheibe)", klasse: "ds-btn--disc" }),
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
        karte({ titel: "Zustände", unter: "Gesperrte Knöpfe mit Grund bleiben fokussierbar (aria-disabled) und nennen den Grund "
          + "im Tooltip; deaktiviert ohne Grund heisst disabled. Gedrückt (aria-pressed) ist ein Umschalter." }, [
          reihe([
            kompakt,
            knopf({ text: "Speichern", variante: "primaer", deaktiviert: true }),
            knopf({ text: "Abgleichen", variante: "tonal", deaktiviert: true }),
            knopf({ text: "Exportieren", deaktiviert: true }),
            mitGrund,
            sperreUmschalten
          ]),
          sperreText
        ]),
        karte({ titel: "Beschäftigt", unter: "UI.beschaeftigt(knopf, arbeit) über DS.motion.busy: sofort aria-busy (Klicks "
          + "werden geschluckt, der Fokus bleibt), das Gesicht mit Spinner erst nach 200 ms und dann mindestens 450 ms; mit "
          + "fertig danach 600 ms das Erfolgsgesicht. Scheitert die Arbeit, ist der Knopf sofort frei. Das Ergebnis meldet "
          + "die Seite (UI.meldung)." }, [
          reihe([speichern, testen, abgleichen, schnell]),
          beschriftung("Speichern gelingt mit Erfolgsgesicht · Verbindung testen scheitert · der Icon-Knopf zeigt nur Spinner "
            + "und Häkchen · eine Arbeit unter 200 ms zeigt gar keinen Spinner.")
        ]),
        karte({ titel: "Aktionszeile eines Formulars" }, [
          anhaengen(el("div", "ds-form-actions"), [
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
    const FOLGE = [["Wird abgeglichen", "laeuft"], ["Abgeglichen vor 5 Min.", "erfolg"],
      ["Abgleich verspätet", "warnung"], ["Abgleich fehlgeschlagen", "gefahr"], ["Wartet auf den nächsten Lauf", "wartet"]];
    let stufe = 0;
    const weiter = knopf({ text: "Nächster Zustand", klein: true, beiKlick: function () {
      stufe = (stufe + 1) % FOLGE.length;
      wechsel.setzen(FOLGE[stufe][0], FOLGE[stufe][1]);
    } });

    // Filter-Chips als Optionsgruppe: genau einer ist gewählt (art: 'radio',
    // echte Optionsfelder; Dashboard-Style lässt beide Plätze zugleich gleiten).
    const optionen = ["Alle", "Aktiv", "Im Lager", "Archiviert"].map(function (t, i) {
      return UI.chip({ text: t, gewaehlt: i === 0, art: "radio", name: "sg-status", wert: t });
    });
    const gruppe = UI.chips(optionen, { legende: "Status" });
    const trenner = el("span", "ds-chips__divider");
    trenner.setAttribute("aria-hidden", "true");
    const anzahl = el("p", "anzahl", "47 von 163");
    anzahl.setAttribute("aria-live", "polite");
    const chipsZeile = UI.chips([gruppe, trenner, UI.chip({ text: "Nur mit Bemerkung", gewaehlt: false }),
      UI.chip({ text: "Deaktiviert", gewaehlt: false, deaktiviert: true }), anzahl]);

    // Aktive Filter mit ×: ein entfernter Chip geht über Bewegung.umordnen,
    // die übrigen gleiten an ihren neuen Platz.
    const FILTER = ["Suche: «latitude»", "Hersteller: HP", "Gebäude: Haus C",
      "Bemerkung: Leihgerät für die Weiterbildung «Führung im Gesundheitswesen», Rückgabe nach dem letzten Kurstag im Sekretariat"];
    let gesetzt = FILTER.slice();
    const aktive = UI.chips([]);
    function aktivFilter(text) {
      const c = UI.chip({ text: text, entfernen: function () { filterEntfernen(text); } });
      c.setAttribute("data-ds-key", text);
      return c;
    }
    function filterZeichnen(o) { UI.abgleichen(aktive, gesetzt.map(aktivFilter), o); }
    function filterEntfernen(text) {
      gesetzt = gesetzt.filter(function (t) { return t !== text; });
      Bewegung.umordnen(aktive, filterZeichnen);
      UI.textSetzen(anzahl, gesetzt.length ? (163 - gesetzt.length * 29) + " von 163" : "163 ADMIN-Clients");
    }
    filterZeichnen();
    const zuruecksetzen = UI.chip({ text: "Filter wiederherstellen", sinnbild: "zuruecksetzen", beiKlick: function () {
      gesetzt = FILTER.slice();
      Bewegung.umordnen(aktive, filterZeichnen);
      UI.textSetzen(anzahl, "47 von 163");
    } });

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
      "Ein Status-Chip steht nur für eine Abweichung: der Normalfall (aktiv, in SCCM, online) bekommt keinen. Status immer "
      + "mit Icon und Text, nie Farbe allein. Filter-Chips sind 32 px hoch mit Radius 8; gewählt = Pastell mit Häkchen.",
      [
        karte({ titel: "Status-Chips", unter: "Erfolg nur als Ergebnis eines Laufs oder einer Handlung, nie für den Normalfall." }, [
          reihe([
            UI.status("Ersatz überfällig", "gefahr"),
            UI.status("Nicht in SCCM", "gefahr"),
            UI.status("Wenig Speicher", "warnung"),
            UI.status("Lager", "neutral", { sinnbild: "lager" }),
            UI.status("Archiviert", "neutral", { sinnbild: "archiv" }),
            UI.status("Offline", "neutral", { sinnbild: "offline" }),
            UI.status("Wird abgeglichen", "laeuft"),
            UI.status("Wartet", "wartet"),
            UI.status("AD-Konto deaktiviert", "aus"),
            UI.status("Test bestanden", "erfolg"),
            UI.status("Mit Tooltip", "neutral", { titel: "Der Tooltip nennt die Herkunft: SCCM, 12.10.2026, 05.15." })
          ]),
          reihe([wechsel, weiter, beschriftung("setzen() ändert an Ort und Stelle: Farbe und Sinnbild gleiten, der Spinner dreht weiter.")])
        ]),
        karte({ titel: "Filter-Chips", unter: "Umschalter sind Chips von Dashboard-Style auf einem Kästchen: der Haken "
          + "zeichnet sich, der Platz dafür öffnet sich. Eine Gruppe steht in einem fieldset mit Legende; mit "
          + "art: 'radio' ist genau einer gewählt (Status). Eine Reihe ohne Filter-Chip (Status-Chips, Links) ist "
          + "keine Filtergruppe (UI.chips: .chip-zeile)." }, [
          chipsZeile,
          aktive,
          reihe([zuruecksetzen, UI.chip({ text: "Nur meine Geräte", href: "#status", sinnbild: "benutzer" })]),
          beschriftung("Aktive Filter sind Pastell mit ×; der ganze Chip ist der Knopf und nennt die Folge. Ein langer "
            + "Filter kürzt sich mit «…», das × bleibt, der Tooltip zeigt ihn ganz. Darunter Aktions-Chips (Knopf und Link).")
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
      reihe([UI.status("Graph erreichbar", "erfolg"), el("span", "ds-muted", "120 ms")]),
      reihe([UI.status("Liste «ADMIN-Clients» lesbar", "erfolg"), el("span", "ds-muted", "50 Zeilen")])
    ]);

    const unterabschnitt = anhaengen(el("div", "ds-subsection"), [
      el("h3", "ds-card__subtitle", "Netzwerk"),
      el("p", "ds-muted", "Ein Teil einer Karte mit eigenem kleinem Titel: Haarlinie und 20 px Luft darüber.")
    ]);

    // Kennzahlen: beim ersten Zeigen zählen sie hoch (Bewegung.auftritt).
    // «Neue Daten» baut die Kacheln neu und gleicht sie still ab
    // (UI.abgleichen in Bewegung.kennzahlenStill): jede Kachel mit Schlüssel
    // zählt vom gezeigten Wert zum neuen, im Format ihres Werts.
    const WERTE = [
      { text: "ADMIN-Clients", zahl: 50, unter: "47 im Einsatz" },
      { text: "EDU-Clients", zahl: 18, unter: "16 im Einsatz" },
      { text: "Ersatz überfällig", zahl: 6, ton: "gefahr", unter: "geplant vor 2026/2027" },
      { text: "Freier Speicher", zahl: 41.5, nachsatz: " %", unter: "Durchschnitt aller Geräte" }
    ];
    let stand = WERTE.map(function (w) { return w.zahl; });
    function kachelnBauen() {
      return WERTE.map(function (w, i) {
        return UI.kachel({ text: w.text, wert: UI.zahlText(stand[i]) + (w.nachsatz || ""), zahl: stand[i],
          schluessel: "sg-kennzahl-" + i, ton: w.ton, unter: w.unter });
      });
    }
    const kacheln = UI.kacheln(kachelnBauen());
    let runde = 0;
    const neueDaten = knopf({ text: "Neue Daten", variante: "leise", sinnbild: "sync", beiKlick: function () {
      runde += 1;
      stand = WERTE.map(function (w, i) {
        // Der freie Speicher hat eine Nachkommastelle: er zählt mit ihr.
        const neu = Math.max(0, Math.floor(w.zahl) + ((runde * (i + 3) * 7) % 23) - 11);
        return w.nachsatz ? neu + 0.5 : neu;
      });
      Bewegung.kennzahlenStill(kacheln, function () { UI.abgleichen(kacheln, kachelnBauen()); });
    } });
    const kachelnKlick = UI.kacheln([
      UI.kachel({ text: "Nicht in SCCM", wert: "7", zahl: 7, ton: "gefahr", unter: "Liste öffnen",
        beiKlick: function () { info("Würde die gefilterte Liste öffnen."); } }),
      UI.kachel({ text: "Im Einsatz", wert: "1’284", zahl: 1284, unter: "als Link", href: "#karten" }),
      UI.kachel({ text: "Letzte Anmeldung", wert: "vor 2 Tagen", unter: "CAMPUS-907" }),
      UI.kachel({ text: "Ohne Wert", wert: "", unter: "Leerwert «–»" })
    ]);

    return abschnitt("karten", "Karten und Kacheln",
      "Karten: weiss, Haarlinie, Radius 12, Polster 24 (Telefon 16), kein Schatten. Kennzahl-Kacheln: tonal, Radius 16, "
      + "die Zahl wird nie gefärbt.",
      [
        raster([
          karte({ titel: "Karte" }, [
            UI.hinweis("Titel 16/24 500. Eine Beschreibung in 14/20 in --ds-text-2, höchstens 76 Zeichen breit.")
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
          karte({ titel: "Zwischentitel", sinnbild: "server" }, [
            el("h3", "ds-card__subtitle", "Datenquellen"),
            UI.hinweis("UI.karte({ sinnbild }) setzt 20 px vor den Titel; ein h3 (14/20 500) gliedert die Karte."),
            unterabschnitt
          ])
        ]),
        karte({ titel: "Kennzahlen", unter: "Vier Kacheln (≤ 1100 px zwei). Beim ersten Zeigen zählen die Zahlen hoch; "
          + "neue Daten zählen vom gezeigten Wert aus, nie wieder von null.", breit: true, aktionen: [neueDaten] }, [kacheln, kachelnKlick])
      ]);
  }

  /* ==================================================================
     Daten: Datenzeilen, Kennwerte, Fakten
     ================================================================== */

  function bauenDaten() {
    const inhaber = el("a", "name-link", "Muster Max");
    inhaber.href = "#daten";
    return abschnitt("daten", "Datenzeilen, Kennwerte, Fakten",
      "Lesen: Name links in --ds-text-2, Wert daneben, Haarlinien. Felder aus dem Abgleich tragen ein Schloss mit Tooltip. "
      + "Leerwert ist «–».",
      [
        raster([
          karte({ titel: "Datenzeilen" }, [
            UI.datenzeilen([
              UI.feldZeile("PC-Name", "CAMPUS-907"),
              UI.feldZeile("Gebäude / Stock", "Haus C / UG", { neben: "seit 2024" }),
              UI.feldGesperrt("Seriennummer", "5CG1234XYZ"),
              UI.feldZeile("Modell", "Latitude 7440", { gesperrt: true, hinweis: "Aus SCCM, 12.10.2026, 05.15." }),
              UI.feldZeile("Inhaber", inhaber),
              UI.feldZeile("Status", "Aktiv"),
              UI.feldZeile("Ersatz", UI.status("Überfällig", "gefahr")),
              UI.feldZeile("Notiz", "")
            ])
          ]),
          anhaengen(el("div", "ds-stack"), [
            karte({ titel: "Kennwerte" }, [
              UI.kennwerte([["ADMIN-Clients", "50"], ["EDU-Clients", "18"], ["Benutzer", "56"], ["Telefonnummern", ""]])
            ]),
            karte({ titel: "ADMIN-Clients", sinnbild: "laptop", ebene: 3,
              aktionen: [knopf({ text: "Liste öffnen", variante: "leise", weiter: true, href: "#daten" })] }, [
              UI.kachel({ text: "Im Einsatz", wert: "47", zahl: 47, unter: "50 insgesamt", href: "#daten" }),
              UI.kennwerte([
                { name: "Im Lager", wert: 2, href: "#daten" },
                { name: "Nicht in SCCM", wert: 3, ton: "gefahr", href: "#daten", titel: "Nicht in SCCM – Abgleich findet kein Gerät" },
                { name: "Ersatz in diesem Geschäftsjahr", wert: 4, ton: "warnung", href: "#daten" },
                { name: "Ohne Inhaber", wert: 0, href: "#daten" }
              ]),
              beschriftung("Bestandskarte der Übersicht: UI.karte({ sinnbild }), die Hauptzahl als Kachel, darunter "
                + "klickbare Kennwerte (UI.kennwerte mit Objekten). Null leise, der Ton als Sinnbild, die Zahl nie gefärbt.")
            ]),
            karte({ titel: "Fakten" }, [
              UI.fakten([
                ["Zuletzt gesehen", UI.zeitText("2026-10-12T12:05:00Z")],
                ["Im Bestand", UI.teile(["1’284 Geräte", "56 Benutzer", "80 Nummern"])],
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
      vorschlaege: ORTE, beiEingabe: function () { UI.formZeileGeaendert(ort, true); } }));
    const inventar = UI.eingabe({ wert: "CAMPUS-912" });
    const inventarZeile = UI.formZeile("PC-Name", inventar, { hinweis: "In Grossbuchstaben, ohne Leerzeichen." });
    UI.feldFehler(inventar, "Diesen Namen gibt es schon (ADMIN-Client 12).");

    // Hinweis, der am Getippten hängt (UI.hinweisPlatz): blendet ein, sobald
    // der Name vergeben ist (die Zeilen darunter gleiten, FLIP), und bleibt
    // beim Weitertippen stehen.
    const namenWarnung = UI.hinweisPlatz({ id: "sg-namenswarnung" });
    const pcName = UI.eingabe({ platzhalter: "z. B. CAMPUS-907", beiEingabe: function (w) {
      const vergeben = /^campus-90\d$/i.test(w.trim());
      namenWarnung.setzen(vergeben ? w.trim().toUpperCase() : "", function () {
        return UI.banner({ ton: "warnung", titel: "Name schon vergeben.", text: "«" + w.trim().toUpperCase()
          + "» heisst bereits ein ADMIN-Client (Listen-ID 7)." });
      }, { ausEingabe: true });
    } });
    // Feldhinweis mit Sinnbild (UI.feldHinweis): Live-Prüfung «in Ordnung».
    const REGEL = "Nur A–Z, a–z und 0–9, beginnend mit einem Buchstaben.";
    const idHinweis = el("p", "ds-field__hint");
    const programmId = UI.eingabe({ platzhalter: "AdobeAcrobatPro", beiEingabe: function (w) {
      const id = w.trim();
      const gut = /^[A-Za-z][A-Za-z0-9]*$/.test(id);
      if (!id) UI.feldHinweis(idHinweis, REGEL);
      else if (gut) UI.feldHinweis(idHinweis, "Wird als Spalte «" + id + "» angelegt.", { sinnbild: "checkKreis", ton: "erfolg" });
      else UI.feldHinweis(idHinweis, "");
      UI.feldFehler(programmId, id && !gut ? REGEL : "");
    } });
    UI.feldHinweis(idHinweis, REGEL);

    const vorschlag = anhaengen(el("div", "datenzeile-zeile"), [
      knopf({ text: "Vorschlag 2027/28 übernehmen", variante: "leise", klein: true }),
      el("span", "ds-meta", "Beschaffung + 5 Jahre")
    ]);

    // Eine Auswahl mit einem unbekannten gespeicherten Wert behält ihn als
    // Option (.werteSetzen).
    const stufe = UI.eingabe({ art: "auswahl", werte: ["Aktiv", "Lager", "Archiviert"], wert: "Ausgeliehen" });

    const bearbeiten = UI.datenzeilen([
      inventarZeile,
      ort,
      UI.formZeile("Status", stufe, { hinweis: "«Ausgeliehen» gibt es nicht mehr, der gespeicherte Wert bleibt wählbar." }),
      UI.formZeile("Beschaffungsjahr", UI.eingabe({ art: "zahl", wert: 2022, min: 2000, max: 2100, schmal: true }),
        { hinweis: "Geschäftsjahr beginnt am 1. August.", zusatz: vorschlag }),
      UI.formZeile("Ersatz geplant", UI.eingabe({ art: "datum", wert: "2027-08-01", schmal: true })),
      bemerkung,
      UI.formZeile("Seriennummer", UI.eingabe({ wert: "5CG1234XYZ", nurLesen: true }), { hinweis: "Kommt aus SCCM." }),
      UI.formZeile("Neuer PC-Name", pcName, { hinweis: "Bei «CAMPUS-907» erscheint der Hinweis (UI.hinweisPlatz).",
        zusatz: namenWarnung }),
      UI.formZeile("Programm-ID", programmId, { zusatz: idHinweis })
    ]);

    const ticket = UI.eingabe({ platzhalter: "z. B. 3727", art: "text" });
    const pruefen = knopf({ text: "Prüfen", variante: "primaer", beiKlick: function () {
      if (!ticket.value.trim()) { UI.feldFehler(ticket, "Bitte eine Ticketnummer eingeben."); ticket.focus(); return; }
      info("Ticket «" + ticket.value.trim() + "» gefunden.");
    } });

    const felder = el("div", "ds-form-grid ds-form-grid--2");
    anhaengen(felder, [
      UI.feld("Vorname", UI.eingabe({ platzhalter: "z. B. Max" }), { hinweis: "Wie im Active Directory." }),
      UI.feld("Abteilung", UI.eingabe({ art: "auswahl", werte: ["Informatik", "Verwaltung", "Lehrgänge"], leer: "Alle" })),
      UI.feld("Gültig ab", UI.eingabe({ art: "datum" })),
      UI.feld("Gesperrt", UI.eingabe({ wert: "nur zur Ansicht", gesperrt: true })),
      UI.feld("Notiz", UI.eingabe({ art: "textbereich", platzhalter: "Was soll die nächste Person wissen?" }), { voll: true })
    ]);

    const gefuellt = anhaengen(el("div", "ds-inline-form"), [
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
        UI.textSetzen(suchAnzahl, w.trim() ? (w.trim().length % 7 + 3) + " von 50 ADMIN-Clients" : "50 ADMIN-Clients");
      } });
    const filter = knopf({ text: "Filter", sinnbild: "filter", variante: "still" });
    filter.appendChild(UI.zaehler(2));
    const leiste = anhaengen(el("div", "ds-action-bar"), [suche, filter,
      knopf({ text: "Spalten", sinnbild: "spalten", variante: "still" }),
      knopf({ text: "CSV", sinnbild: "herunterladen", variante: "still" }), suchAnzahl]);

    // Schalter einzeln (label.ds-switch) und in Zeilen.
    const einzeln = reihe([
      UI.schalter({ an: false, label: "Aus" }),
      UI.schalter({ an: true, label: "An" }),
      UI.schalter({ gesperrt: true, label: "An und gesperrt", titel: "Aus der AD-Gruppe «SW-Adobe»." }),
      UI.schalter({ an: false, deaktiviert: true, label: "Deaktiviert", titel: "Nur für Mitarbeitende mit Telefonnummer." }),
      beschriftung("aus · an · gesperrt (Schloss im Griff) · deaktiviert")
    ]);
    const schalter = el("div");
    anhaengen(schalter, [
      UI.schalterZeile({ name: "Microsoft 365", unter: "Lizenzgruppe M365-A3", wort: true, an: true,
        zusatz: [UI.status("3 Geräte", "neutral", { sinnbild: "laptop" })] }),
      UI.schalterZeile({ name: "KeePass", wort: true, an: false }),
      UI.schalterZeile({ name: "Adobe Acrobat Pro", unter: "AD-Gruppe «SW-Adobe»", wort: true, gesperrt: true,
        titel: "Aus der AD-Gruppe «SW-Adobe»." }),
      UI.schalterZeile({ name: "Teams-Telefonie", wort: true,
        schalter: UI.schalter({ an: false, deaktiviert: true, titel: "Nur für Mitarbeitende mit Telefonnummer." }) }),
      UI.schalterZeile({ name: "Langsam", unter: "beiWechsel liefert ein Promise, das nach 1 s erfüllt wird", wort: true,
        beiWechsel: function () { return warten(1000).then(function () { return true; }); } }),
      UI.schalterZeile({ name: "Schlägt fehl", unter: "beiWechsel liefert false: Der Schalter springt zurück", wort: true,
        beiWechsel: function () { UI.meldung("Umschalten fehlgeschlagen.", { ton: "fehler" }); return false; } })
    ]);

    return abschnitt("formulare", "Formulare",
      "Beschriftung über dem Feld, nie schwebend; 40 px, Radius 8, Rahmen in --ds-outline, Feldtext auf dem Telefon 16 px. "
      + "Der Fokus erscheint sofort als 2-px-Ring. Fehler stehen mit Icon unter dem Feld, nie nur als Farbe.",
      [
        karte({ titel: "Bearbeiten in Datenzeilen", unter: "Der Punkt hinter der Beschriftung heisst «geändert» "
          + "(Screenreader: «(geändert)»); die Zahl steht in der Speicherleiste." }, [bearbeiten]),
        raster([
          karte({ titel: "Felder mit Beschriftung" }, [felder]),
          anhaengen(el("div", "ds-stack"), [
            karte({ titel: "Gefüllte Felder (Werkzeugleisten)" }, [gefuellt]),
            karte({ titel: "Feldreihe mit Knopf" }, [
              anhaengen(el("div", "ds-inline-form"), [UI.feld("Ticketnummer", ticket), pruefen]),
              beschriftung("«Prüfen» bei leerem Feld zeigt den Feldfehler; die erste Eingabe löscht ihn.")
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
            + "Esc leert sie, die Zahl rechts schliesst die Leiste ab." }, [leiste])
        ]),
        karte({ titel: "Schalter", unter: "Der Schalter von Dashboard-Style: ein Klick schaltet an Ort und Stelle um, der "
          + "Griff gleitet und federt. ICT-eigen ist die Sperre: an und gesperrt zeigt das Schloss im Griff, der Tooltip "
          + "nennt die Gruppe; gesperrte und deaktivierte bleiben fokussierbar." }, [einzeln, schalter])
      ]);
  }

  /* ==================================================================
     Tabellen: schlicht in der Karte, Liste mit klebendem Kopf
     ================================================================== */

  function bauenTabellen() {
    const schlicht = UI.tabelle(
      ["Programm", "Version", { text: "Geräte", zahl: true }, "Status"],
      [
        ["Microsoft 365 Apps", "2409", 47, ""],
        ["Adobe Acrobat Reader", "24.003", 31, UI.status("Update fällig", "warnung")],
        ["KeePass", "2.57", 12, ""],
        ["7-Zip", "", 9, UI.status("Nicht verwaltet", "aus")]
      ], { beschriftung: "Installierte Programme" });

    const SPALTEN = [
      { schluessel: "name", text: "PC-Name" },
      { schluessel: "status", text: "Status" },
      { schluessel: "inhaber", text: "Inhaber" },
      { schluessel: "ort", text: "Gebäude / Stock" },
      { schluessel: "modell", text: "Modell" },
      { schluessel: "system", text: "Betriebssystem" },
      { schluessel: "speicher", text: "Freier Speicher", zahl: true, titel: "Freier Speicher auf Laufwerk C laut SCCM." },
      { schluessel: "jahr", text: "Beschafft", zahl: true },
      { schluessel: "gesehen", text: "Zuletzt gesehen", sortierbar: false, titel: "Letzter Kontakt mit SCCM." }
    ];
    const daten = geraete(40);
    let sortiert = "name", richtung = "auf", suchtext = "";
    const anzahl = el("p", "anzahl", anzahlText(daten.length, "ADMIN-Clients"));
    anzahl.setAttribute("aria-live", "polite");

    const kopf = UI.tabellenKopf(SPALTEN, { sortiert: sortiert, richtung: richtung, beiSortieren: function (k) {
      richtung = k === sortiert && richtung === "auf" ? "ab" : "auf";
      sortiert = k;
      kopf.sortierungSetzen(sortiert, richtung);
      zeilenZeichnen(true);
    } });
    const koerper = el("tbody");
    function wertVon(z, k) { return k === "status" ? z.status[0] : z[k]; }

    /* Eine Zeile mit Schlüssel: beim Sortieren und Filtern gleicht
       UI.abgleichen sie ab, Bewegung.umordnen lässt sie gleiten. Der Name
       ist der Link der Zeile (.ds-table__row-link: die ganze Zeile ist
       klickbar, Ctrl- und Mittelklick gehen nativ). */
    function zeileBauen(z) {
      const tr = el("tr");
      tr.setAttribute("data-ds-key", z.name);
      const link = el("a", "name-link ds-table__row-link", z.name);
      link.href = "#tabellen";
      const status = z.status[1] ? UI.status(z.status[0], z.status[1], { sinnbild: z.status[2] }) : z.status[0];
      const zellen = [link, status, z.inhaber || "–", z.ort, z.modell, z.system, UI.zahlText(z.speicher) + " GB", String(z.jahr), z.gesehen];
      zellen.forEach(function (w, i) {
        const td = el("td", SPALTEN[i].zahl ? "ds-num" : null);
        if (w && w.nodeType) td.appendChild(w); else td.textContent = w;
        if (i === 2 && !z.inhaber) td.classList.add("t-still");
        tr.appendChild(td);
      });
      return tr;
    }
    function zeilenZeichnen(gleiten) {
      const s = suchtext.trim().toLowerCase();
      const liste = daten.filter(function (z) {
        return !s || (z.name + " " + z.inhaber + " " + z.modell + " " + z.ort).toLowerCase().indexOf(s) !== -1;
      }).sort(function (a, b) {
        const x = wertVon(a, sortiert), y = wertVon(b, sortiert);
        const v = typeof x === "number" ? x - y : String(x).localeCompare(String(y), "de-CH");
        return richtung === "auf" ? v : -v;
      });
      UI.textSetzen(anzahl, liste.length === daten.length ? anzahlText(daten.length, "ADMIN-Clients")
        : UI.zahlText(liste.length) + " von " + anzahlText(daten.length, "ADMIN-Clients"));
      const neu = function (o) { UI.abgleichen(koerper, liste.map(zeileBauen), o); };
      if (gleiten) Bewegung.umordnen(koerper, neu);
      else neu();
    }
    zeilenZeichnen(false);
    // Ein Zuhörer am Körper für die Zeilenlinks (Delegation: die Zeilen
    // werden abgeglichen, nicht neu gebaut). Einen Klick in eine andere
    // Zelle reicht UI.tabellenRahmen an den Zeilenlink weiter (die klebende
    // erste Spalte begrenzt ihn auf seine Zelle); Ctrl- und Mittelklick
    // öffnen einen neuen Tab.
    koerper.addEventListener("click", function (ev) {
      const link = ev.target.closest ? ev.target.closest("a.ds-table__row-link") : null;
      if (!link || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
      ev.preventDefault();
      info("Würde «" + link.textContent + "» öffnen (im selben Tab; Ctrl-Klick: neuer Tab).");
    });
    const tabelle = el("table", "ds-table ds-table--interactive");
    tabelle.appendChild(el("caption", "ds-sr", "ADMIN-Clients"));
    anhaengen(tabelle, [kopf, koerper]);
    const rahmen = UI.tabellenRahmen(tabelle, { id: "sg-tabelle" });

    const dicht = knopf({ text: "Kompakt", sinnbild: "dichte", variante: "still", gedrueckt: false, beiKlick: function () {
      const an = dicht.getAttribute("aria-pressed") !== "true";
      dicht.setAttribute("aria-pressed", an ? "true" : "false");
      tabelle.classList.toggle("ds-table--dense", an);
    } });
    const liste = anhaengen(el("div", "sg-liste"), [rahmen]);

    return abschnitt("tabellen", "Tabellen",
      "Kopf 48 px (500, --ds-text-2), Zeilen 52 px (kompakt 40), Haarlinien zwischen den Zeilen, Zahlen rechts "
      + "und tabellarisch, keine Zebrastreifen. Ein Status steht nur bei Abweichungen.",
      [
        karte({ titel: "Aufstellung in einer Karte", unter: "Läuft bis an den Kartenrand; die erste und letzte Zelle "
          + "fluchten mit dem Kartentext. Rollt sie seitlich, blenden die Kanten aus (Dashboard-Style)." }, [schlicht]),
        anhaengen(el("div", "ds-action-bar"), [
          UI.suchfeld({ platzhalter: "In der Liste suchen", label: "In der Liste suchen",
            beiEingabe: function (w) { suchtext = w; zeilenZeichnen(true); } }), dicht, anzahl
        ]),
        liste,
        UI.hinweis("Die Liste ist ein eigener Roller: Kopf und erste Spalte kleben, die Haarlinie rechts der ersten Spalte "
          + "erscheint erst beim seitlichen Rollen. Die ganze Zeile ist der Link (.ds-table--interactive), mit Fokusring "
          + "und Welle. Sortieren über den Knopf im Kopf (aria-sort an allen sortierbaren Spalten, der Pfeil steht nur an "
          + "der sortierten und dreht sich); sortieren und suchen gleichen die Zeilen still ab, und sie gleiten an ihren Platz.")
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
    const wartend = UI.fortschritt({ wartet: true, text: "Wartet auf den Abgleich …", label: "Abgleich" });
    let wartet = true;
    const losKnopf = knopf({ text: "Starten", klein: true, beiKlick: function () {
      wartet = !wartet;
      wartend.setzen(wartet ? { wartet: true, unbestimmt: false, text: "Wartet auf den Abgleich …" }
        : { wartet: false, unbestimmt: true, text: "Abgleich läuft …" });
      UI.knopfText(losKnopf, wartet ? "Starten" : "Zurück auf wartend");
    } });

    // Laden, dann Inhalt: die Ladezeile erscheint erst nach 200 ms und hält
    // dann ihre Mindestzeit (Bewegung.ladeAbwarten); der Inhalt ersetzt sie
    // mit dem Tausch-Eintritt (Bewegung.aufdecken).
    const ladeOrt = el("div");
    let ladeLauf = 0;
    const ladezeileZeigen = function () {
      const lauf = ++ladeLauf;
      const start = Date.now();
      const zeile = UI.ladezeile("Verlauf wird geladen …");
      UI.leeren(ladeOrt).appendChild(zeile);
      warten(700)
        .then(function () { return Bewegung.ladeAbwarten(start, { element: zeile }); })
        .then(function () {
          if (lauf !== ladeLauf) return;
          const inhalt = UI.zeitachse([{ titel: "12.10.2026", zeit: "14.05 · Muster Max", text: "Inhaber gewechselt." }]);
          UI.leeren(ladeOrt).appendChild(inhalt);
          Bewegung.aufdecken(inhalt);
        });
    };
    ladezeileZeigen();
    const spinnerOrt = el("span");
    const spinnerZeigen = function () { UI.leeren(spinnerOrt).appendChild(UI.spinner(false, { verzoegert: true })); };
    spinnerZeigen();

    const skelettOrt = el("div");
    const skelettZeigen = function () { UI.leeren(skelettOrt).appendChild(UI.skelettSeite({ karten: 1, kopf: true })); };
    skelettZeigen();

    // Banner kommen und gehen über Bewegung.umordnen auf ihrem Stapel.
    let zusatzBanner = false;
    const stapel = el("div", "sg-stapel");
    function mitSchluessel(schluessel, knoten) { knoten.setAttribute("data-ds-key", schluessel); return knoten; }
    function bannerListe() {
      return [
        zusatzBanner && mitSchluessel("verspaetet", UI.banner({ ton: "warnung", titel: "Abgleich verspätet.",
          text: "Der letzte Lauf ist 26 Stunden her." })),
        mitSchluessel("info", UI.banner({ ton: "info", titel: "Neutraler Hinweis.", text: "Die Werte kommen aus dem nächtlichen SCCM-Abgleich." })),
        mitSchluessel("erfolg", UI.banner({ ton: "erfolg", titel: "Alles abgeglichen.", text: "SCCM und AD stehen auf dem Stand von heute, 05.15." })),
        mitSchluessel("vorfuehrung", UI.banner({ ton: "warnung", text: "Vorführmodus mit erfundenen Daten. Änderungen bleiben nur in diesem Browser.",
          knopf: knopf({ text: "Vorführdaten zurücksetzen", variante: "leise" }) })),
        mitSchluessel("fehler", UI.banner({ ton: "gefahr", text: "Die Daten konnten nicht geladen werden. Netzwerkfehler.",
          knopf: knopf({ text: "Erneut versuchen", variante: "leise" }) })),
        mitSchluessel("schloss", UI.banner({ ton: "info", sinnbild: "schloss", rolle: null,
          text: "Nur Mitglieder der Gruppe «ICT-Admins» sehen diese Seite." }))
      ];
    }
    UI.abgleichen(stapel, bannerListe());
    const bannerKnopf = knopf({ text: "Hinweis dazu", variante: "leise", klein: true, beiKlick: function () {
      zusatzBanner = !zusatzBanner;
      Bewegung.umordnen(stapel, function (o) { UI.abgleichen(stapel, bannerListe(), o); });
      UI.knopfText(bannerKnopf, zusatzBanner ? "Hinweis weg" : "Hinweis dazu");
    } });

    return abschnitt("hinweise", "Hinweise und Zustände",
      "Banner sind tonale Kästen mit Icon (Info neutral mit grünem Icon). Leerzustände sagen, was als Nächstes zu tun ist. "
      + "Ladeanzeigen erscheinen erst nach 200 ms und bleiben dann mindestens 450 ms.",
      [
        karte({ titel: "Banner", aktionen: [bannerKnopf], unter: "Ein neuer Hinweis blendet ein, die anderen gleiten Platz "
          + "(Bewegung.umordnen); geht er, rücken sie nach." }, [stapel]),
        raster([
          karte({ titel: "Hinweisliste" }, [
            UI.hinweise([
              UI.hinweisZeile({ ton: "gefahr", titel: "Ersatz überfällig", text: "Beschafft 2019/20, geplant war 2024/25." }),
              UI.hinweisZeile({ ton: "warnung", titel: "Wenig Speicher", text: "Noch 9 GB frei (4 %)." }),
              UI.hinweisZeile({ ton: "info", titel: "Seit 40 Tagen nicht gesehen", text: "Zuletzt am 02.09.2026 in SCCM." }),
              UI.hinweisZeile({ ton: "erfolg", titel: "BitLocker aktiv", text: "Wiederherstellungsschlüssel im AD." })
            ])
          ]),
          karte({ titel: "Laden", unter: "Der Bogen-Spinner hat keine eigene Verzögerung: im Knopf, im Status-Chip und in der "
            + "Ladezeile wartet der Behälter, frei stehend eine Hülle (verzoegert)." }, [
            reihe([UI.spinner(), el("span", "ds-muted", "16 px"), UI.spinner(true), el("span", "ds-muted", "klein 12 px"),
              spinnerOrt, knopf({ text: "Verzögert neu", klein: true, variante: "leise", beiKlick: spinnerZeigen }),
              UI.status("Läuft", "laeuft")]),
            ladeOrt,
            reihe([knopf({ text: "Verlauf laden", klein: true, variante: "leise", beiKlick: ladezeileZeigen }),
              beschriftung("Ladezeile mit dem Formen-Loader, dann der Inhalt (aufdecken).")]),
            fort,
            reihe([weiter, beschriftung("--ds-progress gleitet in 600 ms auf --ds-ease-value; der Balken ist beschnitten und "
              + "läuft als Welle.")]),
            UI.fortschritt({ unbestimmt: true, text: "Abgleich läuft …", label: "Abgleich" }),
            wartend,
            reihe([losKnopf, beschriftung("wartet: nur der Text, bis der Lauf beginnt; unbestimmt: zwei Segmente.")]),
            UI.fortschritt({ anteil: 0.62, flach: true, text: "62 % belegt", label: "Speicher" }),
            beschriftung("flach: ohne Welle, für dichte Zellen.")
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
        karte({ titel: "Skelett", unter: "Seitenskelett: erscheint nach 200 ms, dann läuft eine ruhige diagonale Welle. "
          + "Als Seitenzustand steht die Ladeleiste des Rahmens darüber (siehe «Rahmen», Ladezustand).",
          aktionen: [knopf({ text: "Neu zeigen", variante: "leise", beiKlick: skelettZeigen })] }, [skelettOrt])
      ]);
  }

  /* ==================================================================
     Listen und Diagramme
     ================================================================== */

  function bauenListen() {
    const zeilen = UI.zeilenliste([
      UI.listenZeile({ titel: "CAMPUS-907", unter: ["Haus C / UG", "Latitude 7440", "Muster Max"], href: "#listen",
        sinnbild: "laptop", status: UI.status("Seit 40 Tagen offline", "warnung") }),
      UI.listenZeile({ titel: "EDU-AULA-03", unter: ["Aula", "OptiPlex 7010"], sinnbild: "edu",
        beiKlick: function () { info("Würde «EDU-AULA-03» öffnen."); } }),
      UI.listenZeile({ titel: "Muster Max", unter: ["max.muster@campus-sursee.ch", "Inhaber"], sinnbild: "benutzer",
        aktuell: true }),
      UI.listenZeile({ titel: "+41 41 000 00 01", unter: ["Kurzwahl 201", "Empfang"], sinnbild: "telefon", href: "#listen",
        aktionen: [knopf({ text: "Freigeben", variante: "leise", klein: true }),
          knopf({ variante: "sinnbild", sinnbild: "papierkorb", titel: "Entfernen", klein: true })] })
    ]);

    // Handlungsbedarf wie auf der Hauptseite: jeder Punkt eine klickbare
    // Karte (.ds-card--interactive) mit Zahlmarke.
    const aufgabe = function (titel, unter, zahl, ton) {
      return UI.karte({ titel: titel, ebene: 3, unter: UI.teile(unter), marke: UI.zahlmarke(zahl, ton),
        aktionen: ton === "gefahr" ? [UI.status("Dringend", "gefahr")] : null, href: "#listen",
        beiKlick: function (ev) { ev.preventDefault(); info("Würde die gefilterte Liste «" + titel + "» öffnen."); } });
    };
    const aufgaben = anhaengen(el("div", "karten"), [
      aufgabe("Nicht in SCCM", ["ADMIN-Clients", "Abgleich findet kein Gerät"], 3, "gefahr"),
      aufgabe("Ersatz in diesem Geschäftsjahr", ["EDU-Clients", "geplant 2026/27"], 4, "warnung"),
      aufgabe("Ohne Inhaber", ["ADMIN-Clients"], 1)
    ]);

    const verlauf = UI.zeitachse([
      { titel: "12.10.2026", zeit: "14.05 · Muster Max", text: "Inhaber gewechselt: Beispiel Anna → Muster Max",
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

    const BALKEN = [[0.72], [0.4, "warnung"], [0.9, "gefahr"], [0.3, "still"]];
    const balken = BALKEN.map(function (b) { return UI.balken(b[0], b[1]); });
    let balkenRunde = 0;
    const balkenNeu = knopf({ text: "Neue Werte", variante: "leise", sinnbild: "sync", beiKlick: function () {
      balkenRunde += 1;
      balken.forEach(function (b, i) { b.setzen(((BALKEN[i][0] * 100 + balkenRunde * (17 + i * 11)) % 100) / 100); });
    } });

    return abschnitt("listen", "Listen und Diagramme",
      "Umrandete Listen mit klickbaren Zeilen (Zustandsebene und Welle; der Pfeil bewegt sich beim Hover nicht), die "
      + "Zeitachse des Verlaufs, Verteilungen und Säulen. Balken und Säulen wachsen nur beim ersten Zeigen; neue Werte gleiten.",
      [
        raster([
          karte({ titel: "Zeilenliste" }, [zeilen]),
          karte({ titel: "Zeitachse", aktionen: [knopf({ text: "Neuer Eintrag", variante: "tonal", sinnbild: "plus" })] }, [verlauf])
        ]),
        anhaengen(el("div", "sg-stapel"), [aufgaben,
          beschriftung("Handlungsbedarf: UI.karte({ href, beiKlick, marke: UI.zahlmarke(zahl, ton) }) – die ganze Karte "
            + "öffnet die gefilterte Liste, die 32-px-Zahlmarke ist tonal nach Dringlichkeit; das Wort «Dringend» steht "
            + "zusätzlich in der Karte.")]),
        raster([
          karte({ titel: "Verteilung (klickbar)" }, [hersteller]),
          karte({ titel: "Verteilung" }, [abteilungen,
            UI.saeulen([3, 5, 8, 12, 9, 6, 4, 2].map(function (w, i) {
              return { wert: w, titel: "Geschäftsjahr " + (2019 + i) + "/" + String(20 + i).slice(-2) + ": " + w + " beschafft" };
            }), { hervorheben: 3, label: "Beschaffungen pro Geschäftsjahr, 2019/20 bis 2026/27" }),
            beschriftung("Säulen: Beschaffungen pro Geschäftsjahr, das aktuelle hervorgehoben.")
          ])
        ]),
        karte({ titel: "Balken", aktionen: [balkenNeu], unter: "Normal, Warnung, Gefahr, still; .setzen(anteil) gleitet auf "
          + "--ds-ease-value." }, balken)
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
      unter: ["Haus C / UG", "Latitude 7440", "SN 5CG1234XYZ", "Muster Max", "Ersatz 2027/28"],
      status: [UI.status("Nicht in SCCM", "gefahr"), UI.status("Lager", "neutral", { sinnbild: "lager" })],
      aktionen: [
        knopf({ text: "Ausgeben", variante: "leise", sinnbild: "ausgeben" }),
        knopf({ text: "Archivieren", variante: "leise", sinnbild: "archiv", gesperrt: "Zuerst speichern oder verwerfen." }),
        knopf({ variante: "sinnbild", sinnbild: "mehr", titel: "Weitere Aktionen" })
      ]
    });
    const liste = UI.seitenkopf({
      ebene: 3,
      titel: "ADMIN-Clients",
      lead: "Alle Geräte der Verwaltung, abgeglichen mit SCCM."
    });
    let archiviert = false;
    const umschalten = knopf({ text: "Zustand wechseln", klein: true, variante: "leise", beiKlick: function () {
      archiviert = !archiviert;
      detail.setzen({
        status: archiviert ? [UI.status("Archiviert", "neutral", { sinnbild: "archiv" })]
          : [UI.status("Nicht in SCCM", "gefahr"), UI.status("Lager", "neutral", { sinnbild: "lager" })]
      });
    } });
    return abschnitt("seitenkopf", "Seitenkopf",
      "UI.seitenkopf: Titel 24/32 für jede Ansicht, ein Lead 14/20 (höchstens 76 Zeichen) nur, wo er Nicht-Offensichtliches "
      + "sagt; auf Detailseiten darüber der Zurück-Link zur gemerkten Liste, darunter Teile und Abweichungen als Status, "
      + "rechts die Schnellaktionen.",
      [
        anhaengen(el("div", "sg-probe"), [detail]),
        reihe([umschalten, beschriftung(".setzen({ status }) ersetzt nur, was übergeben wird.")]),
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
        text: "«CAMPUS-907» wird in der Liste ausgeblendet und lässt sich jederzeit reaktivieren.",
        ja: "Archivieren"
      });
      info(ja ? "Antwort: Archivieren." : "Antwort: Abgebrochen.");
    } });

    const formular = knopf({ text: "Dialog mit Liste", beiKlick: function () {
      const personen = ["Muster Max", "Beispiel Anna", "Keller Laura", "Meier Jonas", "Huber Sara", "Graf Luca"];
      let gewaehlt = null;
      const uebernehmen = knopf({ text: "Übernehmen", variante: "primaer", deaktiviert: true });
      const zeilen = personen.map(function (p) {
        const z = UI.listenZeile({ titel: p, unter: p.toLowerCase().replace(" ", ".") + "@campus-sursee.ch", sinnbild: "benutzer",
          beiKlick: function () {
            gewaehlt = p;
            for (const andere of zeilen) {
              if (andere === z) andere.setAttribute("aria-current", "true"); else andere.removeAttribute("aria-current");
            }
            uebernehmen.disabled = false;
          } });
        z.suchText = p.toLowerCase();
        return z;
      });
      // Die Suche filtert dieselben Zeilen (UI.kinderAbgleichen: bleibende
      // Zeilen bewegen sich nicht, der Fokus bleibt).
      const trefferListe = UI.zeilenliste(zeilen);
      const suche = UI.suchfeld({ platzhalter: "Name oder E-Mail", label: "Person suchen", beiEingabe: function (w) {
        const s = w.trim().toLowerCase();
        UI.kinderAbgleichen(trefferListe, zeilen.filter(function (z) { return !s || z.suchText.indexOf(s) !== -1; }));
      } });
      // Die Suche steht zwischen Titel und Körper (d.oben), nur die
      // Trefferliste im Körper rollt; die feste Höhe hält den Dialog beim
      // Filtern ruhig (Dashboard-Style, «A search over a list»).
      const d = UI.dialog({
        titel: "Inhaber festlegen", breit: true,
        inhalt: [trefferListe],
        knoepfe: [knopf({ text: "Abbrechen", variante: "leise", beiKlick: function () { d.schliessen("abbrechen"); } }), uebernehmen]
      });
      d.oben([suche]);
      d.hoehe("480px");
      uebernehmen.addEventListener("click", function () {
        d.schliessen("ja");
        UI.meldung("«" + gewaehlt + "» ist jetzt Inhaber.");
      });
    } });

    // Löschen wie F.loeschenDialog: Namenseingabe gibt frei, während der
    // Arbeit ist der Dialog gesperrt (weder Esc noch Schleier schliessen).
    function loeschenDialog(scheitern) {
      const wort = "CAMPUS-907";
      const feld = UI.eingabe({ art: "text" });
      const endgueltig = knopf({ text: "Löschen", variante: "primaer", deaktiviert: true, beschaeftigt: "Wird gelöscht …" });
      const abbrechen = knopf({ text: "Abbrechen", variante: "leise", beiKlick: function () { d.schliessen("abbrechen"); } });
      const textId = UI.id("sg-loeschen-text");
      const text = el("p", "ds-dialog__text", "Die Zeile wird in den Papierkorb der SharePoint-Site verschoben und lässt sich dort 93 Tage lang zurückholen.");
      text.id = textId;
      const d = UI.dialog({
        titel: "Gerät löschen?", breit: true, beschreibung: textId,
        inhalt: [text,
          UI.banner({ ton: "warnung", text: "Bei «Muster Max» bleibt die Inhaberschaft stehen und zeigt danach ins Leere." }),
          UI.feld("Zur Bestätigung «" + wort + "» eingeben", feld, { klasse: "dialog-bestaetigung" })],
        knoepfe: [abbrechen, endgueltig],
        fokus: feld
      });
      function passt() { return feld.value.trim().toLowerCase() === wort.toLowerCase(); }
      feld.addEventListener("input", function () { endgueltig.disabled = !passt(); });
      let laeuft = false;
      endgueltig.addEventListener("click", function () {
        if (laeuft || !passt()) return;
        laeuft = true;
        d.sperren(true);
        abbrechen.disabled = true;
        UI.beschaeftigt(endgueltig, warten(900, scheitern)).then(function () {
          d.sperren(false);
          d.schliessen("geloescht");
          UI.meldung("«CAMPUS-907» gelöscht (nur im Styleguide).");
        }, function () {
          laeuft = false;
          d.sperren(false);
          abbrechen.disabled = false;
          UI.meldung("Löschen fehlgeschlagen. Vorführfehler.", { ton: "fehler" });
        });
      });
    }
    const loeschen = knopf({ text: "Löschen mit Namenseingabe", beiKlick: function () { loeschenDialog(false); } });
    const loeschenFehler = knopf({ text: "Löschen scheitert", variante: "leise", beiKlick: function () { loeschenDialog(true); } });

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
        anhaengen(el("div", "ds-form-grid ds-form-grid--2"), [UI.feld("Beschafft ab", UI.eingabe({ art: "datum" })),
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
        inhalt: [reihe([UI.status("Lager", "neutral", { sinnbild: "lager" }), UI.meta("Zuletzt gesehen 12.10.2026, 14.05")]),
          UI.fakten([["Modell", "Latitude 7440"], ["Seriennummer", "5CG1234XYZ"], ["Gebäude / Stock", "Haus C / UG"],
            ["Inhaber", "Muster Max"]]),
          el("h3", "ds-card__subtitle", "Rohdaten"), roh,
          UI.hinweis("Der Körper rollt; die Haarlinie unter dem Kopf erscheint erst dann. Eine Meldung, die jetzt "
            + "kommt, steht im Blatt."),
          reihe([knopf({ text: "Meldung im Blatt", klein: true, beiKlick: function () { info("Meldung über dem Blatt."); } })])]
      });
    } });

    const meldungen = reihe([
      knopf({ text: "Erfolg", beiKlick: function () { UI.meldung("3 Änderungen gespeichert."); } }),
      knopf({ text: "Info", beiKlick: function () { UI.meldung("Liste aktualisiert.", { ton: "info" }); } }),
      knopf({ text: "Fehler", beiKlick: function () { UI.meldung("Speichern fehlgeschlagen. Netzwerkfehler.", { ton: "fehler" }); } }),
      knopf({ text: "Mit Aktion", beiKlick: function () {
        UI.meldung("Filter «Hersteller: HP» entfernt.", { ton: "info", aktion: { text: "Rückgängig",
          beiKlick: function () { UI.meldung("Filter wieder gesetzt."); } } });
      } }),
      knopf({ text: "Lange Meldung", variante: "leise", beiKlick: function () {
        UI.meldung("Der Abgleich hat 14 Geräte neu angelegt, 3 archiviert und bei 27 Geräten den Inhaber aus dem "
          + "Active Directory nachgeführt.", { ton: "info" });
      } })
    ]);

    // Speicherleiste: dieselbe, die fenster.js auf Detailseiten führt.
    let aenderungen = 0;
    let naechsterFehler = false;
    function aenderungenText() { return aenderungen + (aenderungen === 1 ? " Änderung" : " Änderungen"); }
    const leiste = UI.speicherleiste({
      beiSpeichern: function () {
        const scheitert = naechsterFehler;
        naechsterFehler = false;
        leiste.beschaeftigt(warten(1100, scheitert)).then(function () {
          aenderungen = 0;
          leiste.setzen({ sichtbar: false, speichernText: "Speichern" });
          UI.meldung("Gespeichert.");
        }, function () {
          leiste.setzen({ text: aenderungenText(), speichernText: "Nochmals speichern" });
          UI.meldung("Speichern fehlgeschlagen. Die Zeile wurde inzwischen anderswo geändert.", { ton: "fehler" });
        });
      },
      beiVerwerfen: async function () {
        const ja = await UI.bestaetigen({ titel: "Änderungen verwerfen?",
          text: "Die Felder zeigen danach wieder den gespeicherten Stand.", ja: "Verwerfen" });
        if (!ja) return;
        aenderungen = 0;
        leiste.setzen({ sichtbar: false });
      }
    });
    const aendern = knopf({ text: "Änderung machen", beiKlick: function () {
      aenderungen += 1;
      leiste.setzen({ sichtbar: true, text: aenderungenText(), speichernAus: false, verwerfenAus: false });
    } });
    const fehlerKnopf = knopf({ text: "Nächstes Speichern scheitert", variante: "leise", beiKlick: function () {
      naechsterFehler = true;
      info("Das nächste Speichern scheitert.");
    } });

    // UI.tipp setzt den Tooltip an ein beliebiges Element (hier eine
    // Zeitangabe, als Tabstopp auch per Tastatur).
    const zeitpunkt = el("span", "ds-meta", "vor 2 Tagen");
    zeitpunkt.tabIndex = 0;
    UI.tipp(zeitpunkt, UI.zeitText("2026-10-12T12:05:00Z"));

    // Tooltip nur bei Abschneiden (data-tip-abgeschnitten): derselbe Chip
    // zeigt ihn in der schmalen Spalte, in der breiten nicht.
    const LANG = "Bemerkung: Leihgerät für die Weiterbildung";
    const abgeschnitten = reihe([
      anhaengen(el("div", "sg-schmal"), [UI.chip({ text: LANG, href: "#ueberlagerungen" })]),
      UI.chip({ text: LANG, href: "#ueberlagerungen" })
    ]);

    return abschnitt("ueberlagerungen", "Dialoge, Blatt, Meldungen",
      "Dialog und Blatt sind native <dialog> über DS.overlay: Fokusfalle, der Rest inert, Esc, Bildlaufsperre, Fokus "
      + "zurück an den Auslöser. UI.bestaetigen löst bei Esc, Schleier und «Abbrechen» mit false auf.",
      [
        raster([
          karte({ titel: "Dialoge", unter: "400 px für Fragen, 560 px für Listen und Formulare; Radius 16, Ebene 3. "
            + "Der Hauptknopf nennt die Folge, «Abbrechen» steht als Text-Knopf links davon. Nur der Inhalt rollt." }, [
            reihe([bestaetigen, formular, loeschen, loeschenFehler])
          ]),
          karte({ titel: "Seitenblatt", unter: "Von rechts (Telefon: von unten), 560 oder 720 px, Kopf mit Titel 22/28 und ×. "
            + "Filter wirken sofort, die Trefferzahl steht live im Kopf." }, [reihe([filterBlatt, detailBlatt])])
        ]),
        raster([
          karte({ titel: "Meldungen", unter: "Unten links neben der Schublade, --ds-inverse. Erfolg und Info gehen nach der "
            + "Lesezeit (4 s, ab 40 Zeichen 50 ms je Zeichen mehr, höchstens 10 s; beim Zeigen und mit dem Fokus angehalten). "
            + "Fehler und Meldungen mit Aktion bleiben mit × stehen. Höchstens drei; dieselbe Meldung ersetzt die stehende, "
            + "ein neuer Fehler den offenen." }, [meldungen]),
          karte({ titel: "Tooltips", unter: "data-tip über DS.overlay.tooltips: mit der Maus nach 500 ms, mit der Tastatur "
            + "sofort; folgt gleich ein zweiter, erscheint er ohne Warten. Der Zeiger darf auf den Tooltip wechseln, Esc "
            + "schliesst ihn." }, [
            reihe([
              knopf({ variante: "sinnbild", sinnbild: "kopieren", titel: "Kopieren" }),
              knopf({ variante: "sinnbild", sinnbild: "verknuepfung", titel: "Link kopieren" }),
              knopf({ text: "Nummer freigeben", variante: "leise", gesperrt: "Zuerst speichern oder verwerfen." }),
              UI.status("Ersatz 2027/28", "neutral", { sinnbild: "kalender", titel: "Beschaffungsjahr 2022/23 + 5 Jahre" }),
              zeitpunkt
            ]),
            abgeschnitten,
            beschriftung("Ein Tooltip, der nur den sichtbaren Text wiederholt, erscheint nur, solange der Text abgeschnitten ist.")
          ])
        ]),
        karte({ titel: "Speicherleiste", unter: "Schwebt unten in der Tafel über dem Inhalt (Radius 16, Ebene 3) und hält "
          + "ihren Platz frei; Meldungen stehen darüber. Speichern ist beschäftigt, solange die Arbeit läuft "
          + "(leiste.beschaeftigt(arbeit)). Fehler stehen als Meldung, nie als rote Leiste. Ctrl+S speichert auf Detailseiten." }, [
          reihe([aendern, fehlerKnopf])
        ])
      ]);
  }

  /* ==================================================================
     Rahmen: Zustände der Tafel, Vorführhinweis, Schublade
     ================================================================== */

  function zurueckZumInhalt() {
    Rahmen.zustand("inhalt").then(function () {
      Rahmen.dokumentTitel("Styleguide");
      const t = document.getElementById("rahmen-titel");
      if (t) { t.scrollIntoView({ block: "start" }); t.focus({ preventScroll: true }); }
    });
  }

  function bauenRahmen() {
    const laden = knopf({ text: "Ladezustand (2,5 s)", beiKlick: function () {
      Rahmen.zustand("laden", { text: "Styleguide wird geladen …", fortschritt: "ADMIN-Clients 18 / 50" });
      setTimeout(function () { Rahmen.zustand("laden", { fortschritt: "ADMIN-Clients 50 / 50 · Benutzer 12 / 56" }); }, 1200);
      setTimeout(function () { Rahmen.zustand("inhalt"); }, 2500);
    } });
    const fehler = knopf({ text: "Fehlerzustand", beiKlick: function () {
      Rahmen.zustand("fehler", {
        titel: "Die Daten konnten nicht geladen werden",
        text: "Vorführfehler. So sieht es aus, wenn Microsoft Graph nicht antwortet.",
        knopfText: "Zurück zum Styleguide",
        beiKlick: zurueckZumInhalt
      });
    } });
    const ende = knopf({ text: "Endzustand", beiKlick: function () {
      Rahmen.zustand("ende", {
        titel: "CAMPUS-907 gelöscht",
        text: "Die Zeile liegt im Papierkorb der SharePoint-Site und lässt sich dort 93 Tage lang zurückholen.",
        pfad: { text: "Styleguide", href: "#rahmen" },
        knopfText: "Zurück zum Styleguide",
        beiKlick: zurueckZumInhalt
      });
    } });
    let vorfuehrung = false;
    const vorfuehren = knopf({ text: "Vorführhinweis", gedrueckt: false, variante: "still", sinnbild: "flagge",
      beiKlick: function () {
        vorfuehrung = !vorfuehrung;
        vorfuehren.setAttribute("aria-pressed", String(vorfuehrung));
        Rahmen.vorfuehrung(vorfuehrung ? { beiZuruecksetzen: function () { UI.meldung("Vorführdaten zurückgesetzt."); } } : null);
      } });
    let zahl = 0;
    const zaehlen = knopf({ text: "Zähler in der Schublade", variante: "still", sinnbild: "plus", beiKlick: function () {
      zahl = zahl >= 3 ? 0 : zahl + 1;
      Rahmen.zahl("tabellen", zahl || null);
    } });
    const schublade = knopf({ text: "Schublade öffnen", sinnbild: "menue", beiKlick: function () {
      // Der Fokus kommt nach dem Schliessen auf diesen Knopf zurück, nicht auf den Menüknopf.
      if (window.matchMedia("(max-width: 900px)").matches) Rahmen.schublade.oeffnen({ ausloeser: schublade });
      else info("Die Schublade wird erst unter 900 px Breite modal.");
    } });

    return abschnitt("rahmen", "Rahmen",
      "Kopf 64 px und Schublade 256 px liegen ohne Linie auf dem Grund --ds-backdrop; die weisse Tafel (Radius 20 oben) ist "
      + "der einzige Roller. ≤ 900 px wird die Schublade modal, ≤ 720 px zeigt der Kopf die Initiale, ≤ 600 px ist die Tafel randlos.",
      [
        karte({ titel: "Zustände der Tafel", unter: "Laden: nach 200 ms Skelett und 4-px-Ladeleiste, der Fortschritt als "
          + "Meta-Zeile; eine sichtbare Ladeanzeige hält mindestens 450 ms. Fehler: Fehlerkasten mit Titel und Knopf. "
          + "Ende: was nach dem Löschen bleibt. Der Vorführhinweis steht als erster Block." }, [
          reihe([laden, fehler, ende, vorfuehren])
        ]),
        karte({ titel: "Schublade", unter: "Rahmen.zahl setzt einen Zähler am Eintrag; erscheint er, ploppt er einmal. "
          + "Die Pille folgt dem aktiven Eintrag (Rahmen.aktiv) und gleitet." }, [
          reihe([zaehlen, schublade])
        ])
      ]);
  }

  /* ==================================================================
     Bewegung
     ================================================================== */

  function bauenBewegung() {
    const muster = UI.karte({ titel: "Muster", klasse: "sg-muster-karte", ebene: 3 });
    muster.inhalt.appendChild(UI.hinweis("Jeder Eintritt ist eine Blende plus eine kleine Bewegung auf der Feder."));
    const buehne = anhaengen(el("div", "sg-buehne"), [muster]);

    // Was gerade läuft, meldet Bewegung.abgeschlossen (ein späterer Aufruf
    // übernimmt, der frühere meldet dann nichts mehr).
    const ruhe = el("span", "ds-meta", "Ruht.");
    ruhe.setAttribute("aria-live", "polite");
    let bewegungLauf = 0;
    function beobachten(was) {
      const lauf = ++bewegungLauf;
      UI.textSetzen(ruhe, was + " läuft …");
      Bewegung.abgeschlossen(muster).then(function () { if (lauf === bewegungLauf) UI.textSetzen(ruhe, was + " abgeschlossen."); });
    }
    const eintritte = reihe([
      ["Standard", ""], ["Blenden", "blenden"], ["Skalieren", "skalieren"], ["Schieben", "schieben"],
      ["Tausch", "tausch"], ["Ploppen", "ploppen"]
    ].map(function (v) {
      return knopf({ text: v[0], klein: true, beiKlick: function () { Bewegung.eintreten(muster, v[1]); beobachten("Eintritt"); } });
    }));
    const austritte = reihe([["Ausblenden", ""], ["Sinken", "sinken"], ["Skalieren", "skalieren"], ["Schieben", "schieben"],
      ["Ploppen", "ploppen"]].map(function (v) {
      return knopf({ text: v[0], klein: true, variante: "leise", beiKlick: function () {
        Bewegung.austreten(muster, v[1], { dann: "behalten" });
        beobachten("Austritt");
      } });
    }));
    const abbrechen = knopf({ text: "Abbrechen", klein: true, variante: "still", sinnbild: "schliessen", beiKlick: function () {
      Bewegung.abbrechen(muster);
      bewegungLauf += 1;
      UI.textSetzen(ruhe, "Abgebrochen: das Muster steht sofort in Ruhe.");
    } });

    // Gleitender Indikator auf einer Knopf-Spur: die Pille folgt
    // aria-pressed selbst (Bewegung.indikator beobachtet).
    const zeitraeume = ["Tag", "Woche", "Monat", "Jahr"].map(function (t, i) {
      return knopf({ text: t, klein: true, variante: "still", gedrueckt: i === 1 });
    });
    const spur = anhaengen(el("div", "sg-spur"), zeitraeume);
    spur.setAttribute("role", "group");
    spur.setAttribute("aria-label", "Zeitraum");
    spur.addEventListener("click", function (ev) {
      const k = ev.target.closest ? ev.target.closest(".ds-btn") : null;
      if (!k) return;
      for (const a of zeitraeume) a.setAttribute("aria-pressed", String(a === k));
    });
    const bereitmachen = function () {
      Bewegung.indikator(spur, { aktiv: "[aria-pressed=\"true\"]", klasse: "sg-indikator" });
    };

    // Stilles Abgleichen und Umordnen: dieselbe Liste bekommt neue Daten.
    // Bleibende Zeilen werden gepatcht (Fokus, Zuhörer und Laufzeitklassen
    // bleiben), neue blenden ein, gegangene aus, die übrigen gleiten.
    const GERAETE = ["CAMPUS-901", "CAMPUS-902", "CAMPUS-903", "CAMPUS-904", "CAMPUS-905", "CAMPUS-906", "CAMPUS-907"];
    let datenRunde = 0, anzahlGeraete = 5;
    const datenListe = UI.zeilenliste([]);
    const behaltenText = beschriftung("");
    function geraetZeilen() {
      return GERAETE.slice(0, anzahlGeraete).map(function (name, i) {
        const frei = 20 + ((i * 53 + datenRunde * 31) % 180);
        return { name: name, frei: frei };
      }).sort(function (a, b) { return b.frei - a.frei; }).map(function (g) {
        const z = UI.listenZeile({ titel: g.name, unter: [UI.zahlText(g.frei) + " GB frei"], href: "#bewegung", sinnbild: "laptop",
          status: g.frei < 50 ? UI.status("Wenig Speicher", "warnung") : null, fokus: "sg-geraet-" + g.name });
        z.setAttribute("data-ds-key", g.name);
        return z;
      });
    }
    function zeichnen(art) {
      const vorher = new Set(Array.from(datenListe.children));
      if (art === "gleiten") {
        Bewegung.umordnen(datenListe, function (o) { UI.abgleichen(datenListe, geraetZeilen(), o); }, { live: true });
      } else {
        Rahmen.stillZeichnen(datenListe, geraetZeilen);
      }
      const nachher = Array.from(datenListe.children).filter(function (k) { return !k.hasAttribute("data-ds-leaving"); });
      const behalten = nachher.filter(function (k) { return vorher.has(k); }).length;
      UI.textSetzen(behaltenText, "Behaltene Knoten: " + behalten + " von " + nachher.length + ".");
    }
    UI.abgleichen(datenListe, geraetZeilen());
    UI.textSetzen(behaltenText, "Fünf Geräte, sortiert nach freiem Speicher.");
    const datenKnoepfe = reihe([
      knopf({ text: "Neue Daten (gleiten)", klein: true, variante: "tonal", sinnbild: "sync", beiKlick: function () {
        datenRunde += 1; zeichnen("gleiten");
      } }),
      knopf({ text: "Neue Daten (still)", klein: true, beiKlick: function () { datenRunde += 1; zeichnen("still"); } }),
      knopf({ text: "Gerät dazu", klein: true, variante: "leise", sinnbild: "plus", beiKlick: function () {
        anzahlGeraete = Math.min(GERAETE.length, anzahlGeraete + 1); zeichnen("gleiten");
      } }),
      knopf({ text: "Gerät weg", klein: true, variante: "leise", sinnbild: "minus", beiKlick: function () {
        anzahlGeraete = Math.max(1, anzahlGeraete - 1); zeichnen("gleiten");
      } })
    ]);

    // Ansichtswechsel (Bewegung.wechseln): eine Karte wächst in ihr Detail
    // (behaelter) und zurück; vor und zurück schieben, durchblenden wechselt
    // die ganze Tafel wie die Ansichten der Hauptseite.
    const wechselBuehne = el("div", "sg-buehne sg-wechsel");
    const ORTE_KURZ = [["Haus A", "18 Geräte"], ["Haus B", "11 Geräte"], ["Haus C", "21 Geräte"]];
    function zeigen(knoten) { UI.leeren(wechselBuehne).appendChild(knoten); return knoten; }
    function uebersichtBauen() {
      return UI.zeilenliste(ORTE_KURZ.map(function (o) {
        const z = UI.listenZeile({ titel: o[0], unter: o[1], sinnbild: "gebaeude", beiKlick: function () { detailZeigen(o, z); } });
        z.setAttribute("data-ds-key", o[0]);
        return z;
      }));
    }
    function detailZeigen(o, von) {
      Bewegung.wechseln(function () {
        const k = karte({ titel: o[0], sinnbild: "gebaeude", klasse: "sg-muster-karte", ebene: 3,
          aktionen: [knopf({ text: "Zurück", variante: "leise", sinnbild: "chevronLinks", beiKlick: function () { zurueck(o, k); } })] },
          [UI.fakten([["Geräte", o[1]], ["Gebäude / Stock", o[0] + " / EG"]])]);
        return zeigen(k);
      }, { art: "behaelter", von: von });
    }
    function zurueck(o, von) {
      Bewegung.wechseln(function () {
        const liste = zeigen(uebersichtBauen());
        return liste.querySelector("[data-ds-key=\"" + o[0] + "\"]");
      }, { art: "behaelter", von: von });
    }
    zeigen(uebersichtBauen());
    const wechselArten = reihe([["Vor", "vor"], ["Zurück", "zurueck"], ["Durchblenden", "durchblenden"]].map(function (v) {
      return knopf({ text: v[0], klein: true, variante: "leise", beiKlick: function () {
        Bewegung.wechseln(function () { return zeigen(uebersichtBauen()); }, { art: v[1] });
      } });
    }));

    // Staffelung: Bewegung.auftritt staffelt jedes Raster nur beim ersten
    // Zeigen. «Noch einmal» baut darum eine frische Fläche.
    function auftrittBauen() {
      return anhaengen(el("div", "ds-stack"), [
        UI.kacheln([
          UI.kachel({ text: "ADMIN-Clients", wert: "50", zahl: 50, unter: "47 im Einsatz" }),
          UI.kachel({ text: "Benutzer", wert: "56", zahl: 56, unter: "42 mit Gerät" }),
          UI.kachel({ text: "Telefonnummern", wert: "80", zahl: 80, unter: "12 frei" }),
          UI.kachel({ text: "Software", wert: "1’284", zahl: 1284, unter: "Installationen" })
        ]),
        UI.verteilung([{ text: "Dell Inc.", zahl: 26 }, { text: "HP", zahl: 11 }, { text: "LENOVO", zahl: 3 }])
      ]);
    }
    let auftrittFlaeche = auftrittBauen();
    const nochmal = knopf({ text: "Noch einmal auftreten", sinnbild: "zuruecksetzen", beiKlick: function () {
      const neu = auftrittBauen();
      auftrittFlaeche.replaceWith(neu);
      auftrittFlaeche = neu;
      Bewegung.auftritt(neu);
    } });

    const abschnittEl = abschnitt("bewegung", "Bewegung",
      "Alle Bewegung kommt von Dashboard-Style (DS.motion) und ist auf jedem Gerät gleich. Ein Eintritt ist eine Blende "
      + "plus eine kleine Bewegung, Austritte sind kürzer; was schwebt, federt. Ein späterer Aufruf übernimmt vom "
      + "aktuellen Stand. Neue Daten spielen keinen Auftritt: sie gleichen still ab, gleiten an ihren Platz und zählen "
      + "vom gezeigten Wert.",
      [
        raster([
          karte({ titel: "Eintritt und Austritt", unter: "Bewegung.eintreten und .austreten. Mitten im Austritt eintreten "
            + "kehrt vom aktuellen Stand um, ohne Sprung." }, [buehne, beschriftung("Eintritt"), eintritte,
            beschriftung("Austritt (das Muster bleibt unsichtbar, bis ein Eintritt es zurückholt)"), austritte, reihe([abbrechen, ruhe])]),
          karte({ titel: "Gleitender Indikator", unter: "Die Pille folgt aria-pressed selbst und gleitet auf der Feder: "
            + "die vordere Kante voraus, die hintere folgt; ein weiter Weg dauert länger. Die erste Platzierung springt. "
            + "Dieselbe Technik trägt die Schublade." }, [spur])
        ]),
        raster([
          karte({ titel: "Abgleichen und umordnen", unter: "Bewegung.umordnen(liste, o => UI.abgleichen(liste, neu, o)): "
            + "die Zeilen gleiten, neue blenden ein. Rahmen.stillZeichnen gleicht ohne Bewegung ab. Bleibende Knoten werden "
            + "nur gepatcht; liegt der Zeiger auf der Liste, wartet das Umordnen (live)." }, [datenListe, datenKnoepfe, behaltenText]),
          karte({ titel: "Ansichtswechsel", unter: "Bewegung.wechseln, nur für Navigation, nie für Daten: eine Zeile wächst in "
            + "ihr Detail (behaelter) und zurück; vor und zurück schieben die Tafel, durchblenden wechselt sie wie die "
            + "Ansichten der Hauptseite." }, [wechselBuehne, wechselArten])
        ]),
        karte({ titel: "Staffelung, Hochzählen, Aufziehen", unter: "Bewegung.auftritt(behälter) beim ersten Zeigen einer "
          + "Ansicht: Kinder von Kacheln, Karten, Stapeln und Listen blenden 30 ms nacheinander ein (höchstens sechs Stufen), "
          + "Zahlen zählen in 600 ms hoch, Balken wachsen. Ein zweiter Aufruf auf derselben Fläche staffelt nicht mehr.",
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
  /* Solange ein Klick hinrollt, folgt die Pille seinem Ziel, nicht jedem
     Abschnitt, an dem das Rollen vorbeikommt. */
  let rollZiel = null;

  function hashSetzen(k) {
    if (location.hash === "#" + k) return;
    try { history.replaceState(history.state, "", location.pathname + location.search + "#" + k); } catch (e) { /* file:// */ }
  }

  function aktivSetzen(k) {
    if (k === aktiv) return;
    aktiv = k;
    Rahmen.aktiv(k);
    hashSetzen(k);
  }

  /* Bildlauf-Spion über IntersectionObserver: aktiv ist der erste
     Abschnitt, der das obere Band der Tafel schneidet; ist das Ende der
     letzten Karte zu sehen, der letzte Abschnitt (er erreicht das Band
     sonst nie). */
  const imBand = new Set();
  let amEnde = false;

  function spionMelden() {
    let k = null;
    if (amEnde) k = ABSCHNITTE[ABSCHNITTE.length - 1].k;
    else for (const a of ABSCHNITTE) if (imBand.has(a.k)) { k = a.k; break; }
    if (!k) return;
    if (rollZiel) {
      if (k === rollZiel) rollZiel = null;
      return;
    }
    aktivSetzen(k);
  }

  function spionStarten() {
    if (typeof IntersectionObserver !== "function" || !tafel) return;
    const band = new IntersectionObserver(function (eintraege) {
      for (const e of eintraege) {
        if (e.isIntersecting) imBand.add(e.target.id); else imBand.delete(e.target.id);
      }
      spionMelden();
    }, { root: tafel, rootMargin: "-80px 0px -55% 0px" });
    for (const a of ABSCHNITTE) {
      const s = document.getElementById(a.k);
      if (s) band.observe(s);
    }
    const letzter = document.getElementById(ABSCHNITTE[ABSCHNITTE.length - 1].k);
    if (letzter && letzter.lastElementChild) {
      new IntersectionObserver(function (eintraege) {
        amEnde = eintraege[eintraege.length - 1].isIntersecting;
        spionMelden();
      }, { root: tafel, threshold: 1 }).observe(letzter.lastElementChild);
    }
    // Rollt oder tippt jemand selbst, gilt das Ziel des Klicks nicht mehr.
    const loesen = function () { rollZiel = null; };
    tafel.addEventListener("scrollend", function () { if (rollZiel) { rollZiel = null; spionMelden(); } });
    for (const art of ["wheel", "touchstart", "keydown"]) tafel.addEventListener(art, loesen, { passive: true });
  }

  function hinrollen(k, weich) {
    const s = document.getElementById(k);
    if (!s) return;
    rollZiel = weich ? k : null;
    s.scrollIntoView({ block: "start", behavior: weich ? "smooth" : "auto" });
  }

  function beiWahl(k, ereignis) {
    aktivSetzen(k);
    // Auch der schon aktive Abschnitt (zuoberst nach dem Laden) steht danach im Hash.
    hashSetzen(k);
    hinrollen(k, true);
    // Tastatur oder modale Schublade: der Fokus folgt zum Abschnittstitel
    // (wie ein Anker); sonst bleibt er auf dem Eintrag. Aus der modalen
    // Schublade erst, wenn Rahmen sie nach beiWahl geschlossen hat (sonst
    // gäbe DS.overlay den Fokus danach dem Menüknopf zurück).
    const tastatur = ereignis && ereignis.detail === 0;
    if (!tastatur && !Rahmen.schublade.offen()) return;
    Promise.resolve().then(function () {
      const t = document.getElementById(k + "-titel");
      if (t) t.focus({ preventScroll: true });
    });
  }

  /* «/» springt in die Suche (wie auf der Hauptseite), ausser beim Tippen
     und solange eine Überlagerung offen ist. */
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
    Rahmen.konto({ name: "Muster Max", email: "max.muster@campus-sursee.ch" });
    Rahmen.abmelden(function () { info("Im Styleguide meldet «Abmelden» nur das hier."); });

    const ziel = (location.hash || "").replace(/^#/, "");
    const start = ABSCHNITTE.some(function (a) { return a.k === ziel; }) ? ziel : ABSCHNITTE[0].k;
    aktiv = start;
    Rahmen.navigation({ gruppen: gruppen(), aktiv: start, beiWahl: beiWahl, label: "Abschnitte" });

    const bahn = Rahmen.elemente().bahn;
    bahn.appendChild(UI.seitenkopf({
      titel: "Styleguide",
      lead: "Jeder Baustein des ICT-Inventars in seinen Zuständen, gebaut mit denselben Bauern wie die Seiten "
        + "(UI, Rahmen, Bewegung). Grundlage ist Dashboard-Style mit dem Campus-Thema."
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
      spionStarten();
    });
  }

  starten();
})();

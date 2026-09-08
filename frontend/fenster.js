/* fenster.js — gemeinsames Gerüst der drei Detailseiten (Gerät, Benutzer,
   Telefonnummer).

   Die drei Seiten haben denselben Rahmen: App-Leiste, Titelzeile, linke
   Bereichsnavigation, Lade- und Fehlerzustand, Speicherleiste, Toast,
   Dialog, Vorführ-Band, automatisches Nachladen, Tastatur (Ctrl+S, Esc)
   und der Schutz vor dem Verlassen mit ungespeicherten Änderungen. Früher
   stand das dreimal in client.js, benutzer.js und telefon.js — mit kleinen
   Abweichungen, die niemand wollte. Jetzt steht es einmal hier.

   Was hier NICHT steht: der Entwurf (entwurf, zeile, neuModus …), die
   Bereiche und alles Fachliche. Das bleibt in der Seite; sie reicht dem
   Gerüst nur Rückrufe und Zustände hinein.

   Verwendung (am Anfang der Seite, innerhalb ihrer IIFE):

     const F = Fenster.erstellen("g", { neuLaden: function () { neuLaden(); } });
     const $ = F.$, el = F.el, leeren = F.leeren, knopf = F.knopf, …

   Das Präfix («g», «b», «tf») ist der Anfang der Element-IDs im HTML:
   g-nav, g-bereich, g-laden, g-fehler, g-speicherleiste, g-toast, g-dialog …
   Alle drei HTML-Dateien tragen dasselbe Gerüst mit ihrem Präfix.

   Grundsätze wie überall: kein Framework, kein innerHTML mit Daten. */

"use strict";

const Fenster = (function () {

  /* ---------- DOM ---------- */

  function $(id) { return document.getElementById(id); }

  function el(tag, klasse, text) {
    const k = document.createElement(tag);
    if (klasse) k.className = klasse;
    if (text !== undefined && text !== null) k.textContent = String(text);
    return k;
  }

  function leeren(knoten) {
    while (knoten.firstChild) knoten.removeChild(knoten.firstChild);
    return knoten;
  }

  function anhaengen(eltern, kinder) {
    for (const k of kinder) if (k) eltern.appendChild(k);
    return eltern;
  }

  function knopf(beschriftung, klasse, beiKlick) {
    const k = el("button", "knopf" + (klasse ? " " + klasse : ""), beschriftung);
    k.type = "button";
    if (beiKlick) k.addEventListener("click", beiKlick);
    return k;
  }

  function text(wertRoh) {
    return (wertRoh === null || wertRoh === undefined || wertRoh === false)
      ? "" : String(wertRoh);
  }

  function chip(beschriftung, ton) {
    return el("span", "chip" + (ton ? " chip-" + ton : ""), beschriftung);
  }

  /* Symbole als inline-SVG: keine Schriftart, kein CDN, Farbe = currentColor. */
  function symbol(pfadDaten, groesse) {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    const g = groesse || 16;
    svg.setAttribute("class", "icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", String(g));
    svg.setAttribute("height", String(g));
    svg.setAttribute("aria-hidden", "true");
    const pfad = document.createElementNS(NS, "path");
    pfad.setAttribute("d", pfadDaten);
    svg.appendChild(pfad);
    return svg;
  }

  const SYMBOL_ACHTUNG = "M12 3 2.5 20.5h19L12 3ZM12 10v4M12 17.5v.5";
  const SYMBOL_INFO    = "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v6M12 7.5v.5";

  /* «Gleich wie gespeichert»: leer, null, undefined und false gelten als
     dasselbe; Booleans werden als Booleans verglichen. Damit gilt ein Hin
     und Her im Formular wieder als unverändert. */
  function gleichwertig(a, b) {
    const nA = (a === null || a === undefined) ? "" : a;
    const nB = (b === null || b === undefined) ? "" : b;
    if (typeof nA === "boolean" || typeof nB === "boolean") return !!nA === !!nB;
    return String(nA) === String(nB);
  }

  /* ---------- Bausteine des Design-Systems ---------- */

  /* Eine Karte. Inhalt kommt in karte.inhalt. */
  function karte(titel, unter, breit) {
    const k = el("section", "karte" + (breit ? " karte-breit" : ""));
    if (titel || unter) {
      const kopf = el("div", "karte-kopf");
      if (titel) kopf.appendChild(el("h2", "karte-titel", titel));
      if (unter) kopf.appendChild(el("p", "karte-unter", unter));
      k.appendChild(kopf);
    }
    const inhalt = el("div", "karte-inhalt");
    k.appendChild(inhalt);
    k.inhalt = inhalt;
    return k;
  }

  /* Kennzahl-Kachel: Beschriftung, Wert, Unterzeile; Farbe nur auf dem Wert. */
  function kachel(beschriftung, wertText, unter, ton) {
    const k = el("div", "kachel" + (ton ? " ton-" + ton : ""));
    k.setAttribute("data-klickbar", "nein");
    const leer = wertText === "" || wertText === null || wertText === undefined;
    const w = leer ? "—" : String(wertText);
    k.appendChild(el("div", "kachel-wert" + (w.length > 7 ? " klein" : ""), w));
    k.appendChild(el("div", "kachel-text", beschriftung));
    if (unter) k.appendChild(el("div", "kachel-unter", unter));
    return k;
  }

  /* Schreibgeschütztes Feldpaar mit Schloss. */
  function feldGesperrt(beschriftung, wertText, hinweis) {
    const f = el("div", "datenzeile");
    const label = el("div", "datenzeile-name");
    label.appendChild(el("span", "schloss"));
    label.appendChild(document.createTextNode(beschriftung));
    label.title = hinweis || "Kommt aus dem Abgleich und lässt sich hier nicht ändern.";
    f.appendChild(label);
    const w = text(wertText);
    f.appendChild(el("div", "datenzeile-wert" + (w ? "" : " leer"), w || "—"));
    return f;
  }

  /* Feldpaar, dessen Wert frei aufgebaut wird (Link, Chips, Knöpfe). */
  function feldFrei(beschriftung, knoten, mitSchloss) {
    const f = el("div", "datenzeile");
    const label = el("div", "datenzeile-name");
    if (mitSchloss) label.appendChild(el("span", "schloss"));
    label.appendChild(document.createTextNode(beschriftung));
    f.appendChild(label);
    const wrap = el("div", "datenzeile-wert");
    wrap.appendChild(knoten);
    f.appendChild(wrap);
    return f;
  }

  /* Formularzeile: Beschriftung oben, Feld darunter, Hinweis und Zusatz
     (z. B. Knopfzeile) darunter. «geaendert» setzt den blauen Punkt. */
  function formZeile(beschriftung, feldKnoten, geaendert, hinweis, zusatz) {
    const z = el("div", "datenzeile datenzeile-form");
    z.appendChild(el("div", "datenzeile-name", beschriftung));
    const wrap = el("div", "datenzeile-wert");
    wrap.appendChild(feldKnoten);
    if (hinweis) wrap.appendChild(el("div", "datenzeile-hinweis", hinweis));
    if (zusatz) wrap.appendChild(zusatz);
    z.appendChild(wrap);
    z.classList.toggle("geaendert", !!geaendert);
    return z;
  }

  /* Farbiges Band mit Text und Knopf («Name aus AD übernehmen»). */
  function banner(textKnotenOderText, ton, knopfKnoten) {
    const b = el("div", "banner");
    if (typeof textKnotenOderText === "string") {
      b.appendChild(el("span", ton ? "t-" + ton : null, textKnotenOderText));
    } else if (textKnotenOderText) {
      b.appendChild(textKnotenOderText);
    }
    if (knopfKnoten) b.appendChild(knopfKnoten);
    return b;
  }

  /* Leerzustand mit Titel und Text. */
  function leerzustand(titel, textZeile) {
    const leer = el("div", "leerzustand");
    if (titel) leer.appendChild(el("p", "leer-titel", titel));
    if (textZeile) leer.appendChild(el("p", "leer-text", textZeile));
    return leer;
  }

  /* Einen Eintrag von heute an einen Verlauf anhängen; gibt den neuen
     Spaltentext zurück. Für die automatischen Einträge (Statuswechsel,
     Inhaberwechsel, Freigabe …). */
  function verlaufAnhaengen(verlaufRoh, textZeile) {
    const liste = Modell.verlaufLesen(verlaufRoh);
    liste.push(Modell.verlaufEintrag("", textZeile));
    return Modell.verlaufSchreiben(liste);
  }

  /* ---------- Meldung an die Hauptseite und die anderen Seiten ---------- */

  function melden(typ, id) {
    try {
      const kanal = new BroadcastChannel(KONFIG.kanalName);
      kanal.postMessage({ typ: typ, id: id === undefined ? null : String(id) });
      kanal.close();
    } catch (e) {
      // Ältere Browser kennen BroadcastChannel nicht. Dann bleibt die
      // Hauptseite bis zum nächsten automatischen Takt auf dem alten Stand.
    }
  }

  /* ---------- Das Gerüst einer Seite ---------- */

  function erstellen(praefix, optionen) {
    const o = optionen || {};
    const p = praefix + "-";
    const mockModus = new URLSearchParams(location.search).get("mock") === "1";
    const F = {
      praefix: praefix, mockModus: mockModus,
      $: $, el: el, leeren: leeren, anhaengen: anhaengen, knopf: knopf, text: text,
      chip: chip, symbol: symbol, SYMBOL_ACHTUNG: SYMBOL_ACHTUNG, SYMBOL_INFO: SYMBOL_INFO,
      gleichwertig: gleichwertig, karte: karte, kachel: kachel, feldGesperrt: feldGesperrt,
      feldFrei: feldFrei, formZeile: formZeile, banner: banner, leerzustand: leerzustand,
      melden: melden, verlaufAnhaengen: verlaufAnhaengen
    };

    /* ---- Toast ---- */
    let toastZeit = null;
    F.toast = function (meldung, istFehler) {
      const t = $(p + "toast");
      t.textContent = meldung;
      t.className = "toast" + (istFehler ? " toast-fehler" : "");
      t.hidden = false;
      if (toastZeit) clearTimeout(toastZeit);
      toastZeit = setTimeout(function () { t.hidden = true; }, istFehler ? 8000 : 3500);
    };

    /* ---- Dialog ---- */
    F.dialogOffen = function () {
      const d = $(p + "dialog");
      return !!d && !d.hidden;
    };
    F.dialogSchliessen = function () {
      $(p + "dialog").hidden = true;
      $(p + "dialog-hintergrund").hidden = true;
      leeren($(p + "dialog-inhalt"));
      leeren($(p + "dialog-knoepfe"));
    };
    F.dialogOeffnen = function (titel) {
      $(p + "dialog-titel").textContent = titel;
      $(p + "dialog-hintergrund").hidden = false;
      $(p + "dialog").hidden = false;
      return { inhalt: leeren($(p + "dialog-inhalt")), knoepfe: leeren($(p + "dialog-knoepfe")) };
    };
    /* Ja/Nein-Frage im Dialog des Design-Systems statt window.confirm.
       Gibt ein Promise auf true (bestätigt) oder false zurück. */
    F.bestaetigen = function (titel, frage, knopfText, gefaehrlich) {
      return new Promise(function (aufloesen) {
        const d = F.dialogOeffnen(titel);
        if (frage) d.inhalt.appendChild(el("p", null, frage));
        const fertig = function (antwort) { F.dialogSchliessen(); aufloesen(antwort); };
        d.knoepfe.appendChild(knopf("Abbrechen", "knopf-leise", function () { fertig(false); }));
        const ja = knopf(knopfText || "Ja", gefaehrlich ? "knopf-gefahr" : "knopf-primaer",
          function () { fertig(true); });
        d.knoepfe.appendChild(ja);
        ja.focus();
      });
    };

    /* ---- Lade-, Fehler- und Inhaltszustand ---- */
    F.zeigeLaden = function (meldung, fortschrittText) {
      $(p + "laden-text").textContent = meldung;
      $(p + "laden-fortschritt").textContent = fortschrittText || "";
      $(p + "laden").hidden = false;
      $(p + "fehler").hidden = true;
      $(p + "bereich").hidden = true;
      $(p + "nav").hidden = true;
    };
    F.fortschritt = function (textZeile) {
      $(p + "laden-fortschritt").textContent = textZeile || "";
    };
    F.zeigeFehler = function (titel, meldung, hinweis, knopfText, beiKlick) {
      $(p + "fehler-titel").textContent = titel;
      $(p + "fehler-text").textContent = meldung;
      $(p + "fehler-hinweis").textContent = hinweis || "";
      const k = $(p + "knopf-nochmal");
      k.textContent = knopfText || "Erneut laden";
      k.onclick = beiKlick || o.neuLaden || function () { location.reload(); };
      $(p + "laden").hidden = true;
      $(p + "fehler").hidden = false;
      $(p + "bereich").hidden = true;
      $(p + "nav").hidden = true;
      $(p + "speicherleiste").hidden = true;
    };
    F.zeigeInhalt = function () {
      $(p + "laden").hidden = true;
      $(p + "fehler").hidden = true;
      $(p + "laden-fortschritt").textContent = "";
    };

    /* ---- Speicherleiste ----
       z: { neuModus, geloescht, speichertGerade, speicherFehler, anzahl, neuText } */
    F.speicherleisteZeichnen = function (z) {
      const leiste = $(p + "speicherleiste");
      const anzahl = z.anzahl;
      const zeigen = !z.geloescht && (z.neuModus || anzahl > 0 || z.speichertGerade);
      leiste.hidden = !zeigen;
      if (!zeigen) return;

      const t = z.neuModus
        ? (anzahl === 0 ? (z.neuText || "Neu") + " — noch nicht angelegt"
                        : anzahl + (anzahl === 1 ? " Angabe" : " Angaben") + " erfasst")
        : (anzahl === 1 ? "1 Änderung" : anzahl + " Änderungen");
      $(p + "speicher-text").textContent = z.speichertGerade ? "Wird gespeichert …" : t;

      const fehlerFeld = $(p + "speicher-fehler");
      fehlerFeld.textContent = z.speicherFehler || "";
      fehlerFeld.hidden = !z.speicherFehler;

      const speichern = $(p + "knopf-speichern");
      speichern.textContent = z.speicherFehler ? "Nochmals speichern"
        : (z.neuModus ? "Anlegen" : "Speichern");
      speichern.disabled = z.speichertGerade || (!z.neuModus && anzahl === 0);

      const verwerfen = $(p + "knopf-verwerfen");
      verwerfen.textContent = z.neuModus ? "Formular leeren" : "Verwerfen";
      verwerfen.disabled = z.speichertGerade || anzahl === 0;
    };

    /* ---- Navigation und Bereiche ----
       bereiche: [{ k, d, f(ziel), gruppe? }]. «gruppe» ist eine optionale
       Zwischenüberschrift; Bereiche mit gleicher Gruppe stehen zusammen.
       zusatz(b) darf einen Knoten liefern (z. B. eine Zahl am Eintrag). */
    F.navZeichnen = function (bereiche, aktiv, beiKlick, optionenNav) {
      const on = optionenNav || {};
      const nav = leeren($(p + "nav"));
      nav.hidden = !!on.verstecken;
      if (on.verstecken) return;
      const menue = el("div", "fenster-nav-menue");
      let letzteGruppe = null;
      for (const b of bereiche) {
        if (b.gruppe && b.gruppe !== letzteGruppe) {
          menue.appendChild(el("div", "fenster-nav-gruppe", b.gruppe));
          letzteGruppe = b.gruppe;
        }
        const k = el("button", "fenster-nav-knopf" + (b.k === aktiv ? " aktiv" : ""));
        k.type = "button";
        if (b.k === aktiv) k.setAttribute("aria-current", "true");
        k.appendChild(document.createTextNode(b.d));
        const extra = on.zusatz ? on.zusatz(b) : null;
        if (extra) k.appendChild(extra);
        k.addEventListener("click", function () { beiKlick(b.k); });
        menue.appendChild(k);
      }
      nav.appendChild(menue);

      /* Auf schmalen Fenstern ist die Navigation eine waagrecht rollende
         Leiste. Nach dem Neuzeichnen soll der aktive Eintrag sichtbar
         bleiben; «nearest» rührt nichts an, wenn er ohnehin zu sehen ist. */
      const a = menue.querySelector(".fenster-nav-knopf.aktiv");
      if (a && a.scrollIntoView) a.scrollIntoView({ block: "nearest", inline: "nearest" });
    };

    /* Zeichnet den aktiven Bereich und gibt seinen Schlüssel zurück (den
       ersten, wenn «aktiv» nicht vorkommt). Mit «fokusHalten» kommt der
       Fokus samt Schreibmarke auf das gleichnamige Feld zurück, damit
       Tippen nicht abreisst. */
    F.zeichneBereich = function (bereiche, aktiv, fokusHalten) {
      const vorher = document.activeElement;
      const vorherId = vorher && vorher.id ? vorher.id : null;
      let anfang = null;
      try { anfang = vorher ? vorher.selectionStart : null; } catch (e) { anfang = null; }

      const ziel = leeren($(p + "bereich"));
      ziel.hidden = false;
      const bereich = bereiche.filter(b => b.k === aktiv)[0] || bereiche[0];
      bereich.f(ziel);

      if (fokusHalten && vorherId) {
        const nachher = $(vorherId);
        if (nachher && nachher.focus) {
          nachher.focus();
          if (anfang !== null && typeof anfang === "number") {
            try { nachher.setSelectionRange(anfang, anfang); } catch (e) { /* type=search */ }
          }
        }
      }
      return bereich.k;
    };

    /* Der Bereich aus dem Hash, falls es ihn gibt. */
    F.hashBereich = function (bereiche) {
      const h = (location.hash || "").replace(/^#/, "");
      return h && bereiche.some(b => b.k === h) ? h : null;
    };

    /* ---- Kopf: Wortmarke und Pfad zurück zur Liste ---- */
    F.logoZeichnen = function (listeHash) {
      const mock = mockModus ? "?mock=1" : "";
      const verweis = $(p + "logo");
      if (verweis) verweis.href = "index.html" + mock;
      const pfad = $(p + "pfad");
      if (!pfad || pfad.dataset.bereit) return;
      pfad.dataset.bereit = "1";
      pfad.href = "index.html" + mock + "#" + listeHash;
      /* Kam man aus der Liste, führt der Pfad per Verlauf zurück — mit
         allen Filtern und der Rollposition. Sonst ist er ein Link. */
      pfad.addEventListener("click", function (e) {
        let vonListe = false;
        try {
          const von = new URL(document.referrer);
          vonListe = von.origin === location.origin && /^\/(index(\.html)?)?$/.test(von.pathname);
        } catch (fehler) { vonListe = false; }
        if (vonListe && history.length > 1) { e.preventDefault(); history.back(); }
      });
    };

    /* ---- Vorführ-Band ---- */
    F.bandZeichnen = function (textZeile, beiZuruecksetzen) {
      if (!mockModus) return;
      const band = $(p + "band");
      band.hidden = false;
      band.appendChild(document.createTextNode(textZeile));
      band.appendChild(knopf("Vorführ-Änderungen zurücksetzen", "knopf-leise", async function () {
        const ja = await F.bestaetigen("Vorführ-Änderungen zurücksetzen",
          "Alle im Vorführmodus gemachten Änderungen verwerfen?", "Zurücksetzen", true);
        if (!ja) return;
        Mock.zuruecksetzen();
        beiZuruecksetzen();
      }));
    };

    /* ---- Automatisch nachladen ----
       Statt eines Knopfes «Neu laden» holt sich die Seite den Stand in
       ruhigen Abständen selbst — still, ohne den Inhalt gegen den Spinner
       zu tauschen. Übersprungen wird, sobald Nachladen mehr stören als
       nützen würde: erlaubt() sagt es (ungespeicherte Änderungen, Anlegen,
       Speichern, offener Dialog, gelöscht) — dazu nie in einem Hintergrund-
       Tab und nie, während schon geladen wird. */
    let autoLetzte = Date.now();
    let autoLaeuft = false;
    F.autoStarten = function (erlaubt, nachladen) {
      async function lauf() {
        autoLaeuft = true;
        try {
          await nachladen();
        } catch (fehler) {
          /* Still bleiben: Der bisher gezeigte Stand ist besser als ein
             Fehlerbild wegen einer kurzen Störung. */
        } finally {
          autoLaeuft = false;
          autoLetzte = Date.now();
        }
      }
      function pruefen() {
        if (autoLaeuft || document.hidden || F.dialogOffen()) return;
        if (!erlaubt()) return;
        if (Date.now() - autoLetzte < KONFIG.autoTaktMs) return;
        lauf();
      }
      autoLetzte = Date.now();
      setInterval(pruefen, KONFIG.autoPruefTaktMs);
      document.addEventListener("visibilitychange", pruefen);
    };

    /* ---- Ereignisse: Knöpfe, Hash, Tastatur, Verlassen ----
       e: { speichern, verwerfen, anzahlAenderungen, verlassenFrei?, beiHash(k) } */
    F.ereignisse = function (e) {
      const sp = $(p + "knopf-speichern");
      const vw = $(p + "knopf-verwerfen");
      if (sp) sp.addEventListener("click", e.speichern);
      if (vw) vw.addEventListener("click", e.verwerfen);
      const hg = $(p + "dialog-hintergrund");
      if (hg) hg.addEventListener("click", F.dialogSchliessen);

      window.addEventListener("hashchange", function () {
        const h = (location.hash || "").replace(/^#/, "");
        if (h && e.beiHash) e.beiHash(h);
      });

      document.addEventListener("keydown", function (ev) {
        // Ctrl+S beziehungsweise Cmd+S speichert.
        if ((ev.ctrlKey || ev.metaKey) && (ev.key === "s" || ev.key === "S")) {
          ev.preventDefault();
          e.speichern();
          return;
        }
        if (ev.key === "Escape") {
          if (F.dialogOffen()) { F.dialogSchliessen(); return; }
          if (e.anzahlAenderungen()) { ev.preventDefault(); e.verwerfen(); }
        }
      });

      window.addEventListener("beforeunload", function (ev) {
        if (!e.anzahlAenderungen()) return;
        if (e.verlassenFrei && e.verlassenFrei()) return;
        ev.preventDefault();
        // Der Text stammt vom Browser; zurückgeben muss man trotzdem etwas.
        ev.returnValue = "";
        return "";
      });
    };

    return F;
  }

  return { erstellen: erstellen, el: el, leeren: leeren, knopf: knopf, text: text, chip: chip };
})();

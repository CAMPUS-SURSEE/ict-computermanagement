/* verlauf.js — der Verlauf (Zeitachse der Ereignisse) für Client, Benutzer
   und Telefonnummer.

   Alle drei Listen haben eine Note-Spalte «Verlauf» mit einem JSON-Array;
   das Format und alle Lese- und Schreibhelfer stehen in modell.js. Diese
   Datei ist reine Oberfläche: eine Karte mit Kopfzeile (Titel, Zahl der
   Einträge, «Neuer Eintrag»), darunter die Zeitachse (UI.zeitachse,
   ChatBob-Mapping 7.2 #13) mit Bearbeiten und Löschen je Eintrag.

   Gespeichert wird NICHT hier. Jede Änderung geht als fertige Zeichenkette
   an «beiAenderung»; die Seite legt sie in ihren Entwurf (F.entwurf), und
   die Speicherleiste schreibt sie zusammen mit allen anderen Feldern. So
   gibt es genau einen Speicherweg.

   ------------------------------------------------------------------
   API
   ------------------------------------------------------------------
     Verlauf.zeichnen(ziel, {
       schluessel:   "geraet",              // Einbauort: merkt den Bedienzustand
       wert:         entwurf.wert("Verlauf"),// Rohwert der Spalte
       gesperrt:     false,                 // nur lesen (kein Neu/Bearbeiten/Löschen)
       beiAenderung: function (json) { entwurf.setzeWert("Verlauf", json); },
       titel:        "Verlauf",             // Kartentitel (optional)
       beschreibung: ""                     // Satz unter dem Kartentitel (optional;
                                            // zurzeit übergibt keine Seite einen)
     }) → ziel
       Leert ziel und baut darin genau eine UI.karte ({ titel, unter:
       beschreibung, aktionen: [Zahl, «Neuer Eintrag»] }) mit Formular und
       Zeitachse. Eine Einbauart für alle drei Fenster; die frühere Option
       «karte» («auto», true, false) gibt es nicht mehr.

     Verlauf.offeneEingabe(schluessel?) → bool
       Steht in einem Formular etwas, das beim Schliessen verloren ginge?
       Ohne Schlüssel über alle Einbauorte. Für die Rückfrage beim Verlassen
       der Seite (fenster.js, beforeunload).
     Verlauf.zuruecksetzen(schluessel?)
       Formulare schliessen, Getipptes vergessen (Seiten-«Verwerfen» in
       fenster.js); ein gezeichneter Verlauf zeigt es sofort, ohne Bewegung.

   Bewegung: Neuzeichnen (die Seite ruft zeichnen nach dem Nachladen oder
   Speichern erneut auf) animiert NIE. Nur Handlungen der Person bewegen
   etwas: das Formular tritt ein (Bewegung.eintreten), ein neuer Eintrag
   deckt sich auf, ein gelöschter tritt aus, ein abgebrochenes Formular
   blendet aus.

   Fokus: «schluessel» hält den Bedienzustand (offenes Formular, Entwürfe
   von Datum und Text) über jedes Neuzeichnen hinweg. Alle Bedienelemente
   tragen ein stabiles data-fokus («vl-<schluessel>-…»): F.zeichneBereich
   findet damit Fokus und Schreibmarke wieder, auch wenn die Seite den
   ganzen Bereich neu baut. Ruft eine Seite zeichnen ohne F.zeichneBereich
   erneut auf, setzt der Verlauf Fokus und Schreibmarke selbst zurück.

   Tastatur im Formular: Esc bricht ab (mit Rückfrage, wenn schon etwas
   eingetippt ist), Ctrl/Cmd+Enter übernimmt, Ctrl/Cmd+S übernimmt den
   Eintrag und lässt die Seite dann alles speichern.

   Grundsätze wie überall: kein innerHTML, Text nur über textContent; alles
   Sichtbare über UI.* (bausteine.js), Rückfragen über UI.bestaetigen. */

"use strict";

const Verlauf = (function () {

  const el = UI.el;

  /* ==================================================================
     Zustand je Einbauort
     ================================================================== */

  /* Was ein Neuzeichnen überleben muss: offenes Formular und die halb
     getippten Werte (neu: datum/text, bearbeiten: bDatum/bText). */
  const zustaende = {};

  function zustand(schluessel) {
    const k = schluessel || "standard";
    if (!zustaende[k]) {
      zustaende[k] = { offen: false, datum: "", text: "", bearbeitet: null, bDatum: "", bText: "", gelesen: null };
    }
    return zustaende[k];
  }

  /* Die zuletzt gezeichnete Ausgabe je Einbauort. Zeichnet die Seite in
     beiAenderung selbst neu, gehört der Fokus danach in die neue Ausgabe. */
  const letzte = {};

  function aktuell(ausgabe) {
    const neu = letzte[ausgabe.schluessel];
    return neu && neu.ziel.isConnected ? neu : ausgabe;
  }

  function kennung(schluessel) {
    return "vl-" + String(schluessel || "standard").replace(/[^A-Za-z0-9_-]/g, "-");
  }

  /* ==================================================================
     Kleine Helfer
     ================================================================== */

  function zz(n) { return String(n).padStart(2, "0"); }

  function datumText(e) {
    return e.datum ? Modell.datumSchweiz(e.datum) : "Ohne Datum";
  }

  /* «erfasst um 14.05» am Tag des Ereignisses, sonst mit Datum. Uhrzeiten
     mit Punkt (Schweizer Schreibweise). */
  function erfasstText(e) {
    const d = e.erstellt ? new Date(e.erstellt) : null;
    if (!d || isNaN(d.getTime())) return "";
    const tag = d.getFullYear() + "-" + zz(d.getMonth() + 1) + "-" + zz(d.getDate());
    const zeit = zz(d.getHours()) + "." + zz(d.getMinutes());
    return tag === e.datum ? "erfasst um " + zeit : "erfasst am " + Modell.datumSchweiz(tag) + ", " + zeit;
  }

  function auszug(text, laenge) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    return t.length > laenge ? t.slice(0, laenge - 1).trimEnd() + " …" : t;
  }

  function anzahlText(n) {
    if (!n) return "";
    return n === 1 ? "1 Eintrag" : UI.zahlText(n) + " Einträge";
  }

  function finden(ausgabe, fokus) {
    if (!fokus) return null;
    return ausgabe.ziel.querySelector("[data-fokus=\"" + CSS.escape(ausgabe.id + "-" + fokus) + "\"]");
  }

  /* Fokus über ein Neuzeichnen der Seite retten (Auto-Nachladen, Speichern,
     beiAenderung): Seiten, die über F.zeichneBereich zeichnen, bekommen ihn
     von dort zurück; alle anderen Aufrufer von hier. Gemerkt wird das
     data-fokus des Elements und die Auswahl im Feld. */
  function fokusMerken(schluessel) {
    const alt = letzte[schluessel];
    const a = document.activeElement;
    if (!alt || !a || a === document.body || !alt.ziel.contains(a)) return null;
    const fokus = a.getAttribute("data-fokus");
    if (!fokus) return null;
    let auswahl = null;
    try {
      if (typeof a.selectionStart === "number") auswahl = [a.selectionStart, a.selectionEnd, a.selectionDirection];
    } catch (e) { /* Datumsfeld: keine Auswahl */ }
    return { fokus: fokus, auswahl: auswahl };
  }

  function fokusZurueck(ausgabe, vorher) {
    if (!vorher) return;
    function versuchen() {
      const a = document.activeElement;
      // Hat ihn schon jemand gesetzt (F.zeichneBereich) oder steht das alte Feld noch da: so lassen.
      if (a && a !== document.body && a.isConnected) return;
      if (!ausgabe.ziel.isConnected || letzte[ausgabe.schluessel] !== ausgabe) return;
      const k = ausgabe.ziel.querySelector("[data-fokus=\"" + CSS.escape(vorher.fokus) + "\"]");
      if (!k) return;
      k.focus({ preventScroll: true });
      if (vorher.auswahl && typeof k.setSelectionRange === "function") {
        try { k.setSelectionRange(vorher.auswahl[0], vorher.auswahl[1], vorher.auswahl[2]); } catch (e) { /* Datum */ }
      }
    }
    // Ein noch nicht eingehängtes Ziel (die Seite hängt es gleich ein): danach versuchen.
    if (ausgabe.ziel.isConnected) versuchen();
    else queueMicrotask(versuchen);
  }

  function fokussieren(knoten, ansEnde) {
    if (!knoten || !knoten.focus) return;
    knoten.focus();
    if (ansEnde && typeof knoten.setSelectionRange === "function") {
      try { knoten.setSelectionRange(knoten.value.length, knoten.value.length); } catch (e) { /* Datum */ }
    }
  }

  /* ==================================================================
     Zeichnen
     ================================================================== */

  /**
   * Zeichnet den Verlauf in «ziel» (wird geleert). Siehe Kopfkommentar.
   * @param {HTMLElement} ziel
   * @param {Object} optionen
   * @returns {HTMLElement} ziel
   */
  function zeichnen(ziel, optionen) {
    const o = Object.assign({}, optionen || {});
    const schluessel = o.schluessel || "standard";
    const ausgabe = {
      ziel: ziel, o: o, schluessel: schluessel, id: kennung(schluessel),
      z: zustand(schluessel), gesperrt: !!o.gesperrt, eintraege: [],
      rumpf: null, anzahl: null, neu: null
    };

    // Kopfteile: die Zahl (Meta wie ChatBob «137 insgesamt») und die Hauptaktion.
    ausgabe.anzahl = el("span", "anzahl vl-anzahl");
    if (!ausgabe.gesperrt) {
      ausgabe.neu = UI.knopf({ text: "Neuer Eintrag", variante: "tonal", sinnbild: "plus",
        beiKlick: function () { neuOeffnen(ausgabe); }, fokus: ausgabe.id + "-neu" });
      ausgabe.neu.setAttribute("aria-expanded", "false");
    }
    ausgabe.rumpf = el("div", "vl");

    const vorher = fokusMerken(schluessel);
    const karte = UI.karte({ titel: o.titel || "Verlauf", unter: o.beschreibung || "",
      aktionen: [ausgabe.anzahl, ausgabe.neu], klasse: "vl-karte" });
    karte.inhalt.appendChild(ausgabe.rumpf);
    UI.leeren(ziel).appendChild(karte);

    letzte[schluessel] = ausgabe;
    rumpfZeichnen(ausgabe);
    fokusZurueck(ausgabe, vorher);
    return ziel;
  }

  /* Formular und Zeitachse neu; die Kopfzeile nur an Ort und Stelle (der
     Knopf «Neuer Eintrag» bleibt stehen, mit seinem Fokus). */
  function rumpfZeichnen(ausgabe) {
    const z = ausgabe.z;
    /* Derselbe Rohwert ergibt dieselben Einträge: Modell.verlaufLesen
       erfindet für Einträge ohne «id» (von Hand in SharePoint geändert)
       bei jedem Lesen eine neue – dann fände ein offenes Bearbeiten-Formular
       oder der Fokus seinen Eintrag nach dem Neuzeichnen nicht wieder. */
    const roh = ausgabe.o.wert;
    const eintraege = z.gelesen && z.gelesen.roh === roh ? z.gelesen.liste : Modell.verlaufLesen(roh);
    z.gelesen = { roh: roh, liste: eintraege };
    ausgabe.eintraege = eintraege;
    if (z.bearbeitet && !eintraege.some(function (e) { return e.id === z.bearbeitet; })) z.bearbeitet = null;

    // Nur lesen: kein Formular zeigen (der Zustand bleibt für später).
    const offen = z.offen && !ausgabe.gesperrt;

    UI.textSetzen(ausgabe.anzahl, anzahlText(eintraege.length));
    ausgabe.anzahl.hidden = !eintraege.length;
    if (ausgabe.neu) ausgabe.neu.setAttribute("aria-expanded", offen ? "true" : "false");

    const rumpf = UI.leeren(ausgabe.rumpf);
    if (offen) rumpf.appendChild(formular(ausgabe, null));

    if (!eintraege.length) {
      if (!offen) rumpf.appendChild(leer(ausgabe));
      return;
    }

    const liste = UI.zeitachse(eintraege.map(function (e) { return eintragDaten(ausgabe, e); }));
    liste.classList.add("vl-liste");
    Array.from(liste.children).forEach(function (li, i) { li.setAttribute("data-eintrag", eintraege[i].id); });
    rumpf.appendChild(liste);
  }

  /* Allgemein gehalten: der Verlauf steht beim Gerät, bei der Person und
     bei der Nummer. Titel und Sinnbild genügen – wie man einen Eintrag
     anlegt, zeigt der Knopf «Neuer Eintrag» im Kartenkopf schon. */
  function leer(ausgabe) {
    if (ausgabe.gesperrt) return UI.hinweis("Noch kein Verlauf erfasst.");
    return UI.leerzustand({
      sinnbild: "verlauf",
      titel: "Noch kein Verlauf"
    });
  }

  /* Ein Eintrag für UI.zeitachse: Datum (500, tabellarisch), wann erfasst
     (Meta). Abgleich-Einträge mit neutralem Status-Chip «Abgleich», grauem
     Punkt und Sync-Sinnbild in der Meta-Zeile (ChatBob 7.2 #13); von Hand
     erfasste sind der Normalfall und tragen keinen Chip (UI.anhaengen
     überspringt null). Im Bearbeiten steht das Formular statt des Texts. */
  function eintragDaten(ausgabe, e) {
    const sync = e.quelle === "sync";
    const quelle = sync ? UI.status("Abgleich", "neutral", { sinnbild: "server" }) : null;
    const d = {
      titel: datumText(e),
      // Abgleich: Sync-Sinnbild vor der Meta-Zeile (UI.zeitachse zeitSinnbild).
      zeit: sync ? (erfasstText(e) || "automatisch") : erfasstText(e),
      zeitSinnbild: sync ? "sync" : undefined,
      still: sync,
      zusatz: [quelle],
      text: e.text || "–"
    };
    if (ausgabe.gesperrt) return d;
    if (ausgabe.z.bearbeitet === e.id) {
      d.text = formular(ausgabe, e);
      return d;
    }
    const wann = e.datum ? "Eintrag vom " + datumText(e) : "Eintrag ohne Datum";
    const bearbeiten = UI.knopf({ text: "Bearbeiten", variante: "leise", klein: true,
      label: wann + " bearbeiten",
      beiKlick: function () { bearbeitenOeffnen(ausgabe, e); }, fokus: ausgabe.id + "-bearbeiten-" + e.id });
    const loeschen = UI.knopf({ text: "Löschen", variante: "leise", klein: true,
      label: wann + " löschen",
      beiKlick: function () { loeschenFragen(ausgabe, e); }, fokus: ausgabe.id + "-loeschen-" + e.id });
    d.aktionen = [bearbeiten, loeschen];
    return d;
  }

  /* ==================================================================
     Das Formular (neu oder bearbeiten): ein gefüllter Block mit Datum,
     Text und den Aktionen
     ================================================================== */

  function formular(ausgabe, eintrag) {
    const z = ausgabe.z;
    const neu = !eintrag;
    const p = formPraefix(ausgabe, neu);

    const block = UI.karte({ titel: neu ? "Neuer Eintrag" : "Eintrag bearbeiten", gefuellt: true, ebene: 3,
      klasse: "vl-formular" });
    block.setAttribute("data-vl-art", neu ? "neu" : "bearbeiten");

    const datum = UI.eingabe({ art: "datum", schmal: true,
      wert: neu ? (z.datum || Modell.heuteIso()) : z.bDatum,
      beiEingabe: function (w) { if (neu) z.datum = w; else z.bDatum = w; }, fokus: p + "datum" });
    const text = UI.eingabe({ art: "textbereich", zeilen: 3,
      wert: neu ? z.text : z.bText,
      platzhalter: neu ? "Was ist passiert?" : "",
      beiEingabe: function (w) { if (neu) z.text = w; else z.bText = w; }, fokus: p + "text" });
    text.spellcheck = true;

    const ok = UI.knopf({ text: neu ? "Hinzufügen" : "Übernehmen", variante: "primaer",
      beiKlick: function () { absenden(aktuell(ausgabe), neu); }, fokus: p + "ok" });
    const ab = UI.knopf({ text: "Abbrechen", variante: "leise",
      beiKlick: function () { schliessen(aktuell(ausgabe), neu, false); }, fokus: p + "abbrechen" });

    UI.anhaengen(block.inhalt, [
      UI.feld("Datum", datum),
      UI.feld("Text", text),
      UI.anhaengen(el("div", "aktionszeile"), [ok, ab, UI.meta("Gespeichert wird erst mit «Speichern».")])
    ]);
    block.addEventListener("keydown", function (ev) { tasten(aktuell(ausgabe), neu, ev); });
    return block;
  }

  /* data-fokus der Formularfelder: «vl-geraet-formular-neu-text» usw.
     (eigener Zweig, damit nie eine Eintrags-Id mit «text» zusammenfällt). */
  function formPraefix(ausgabe, neu) {
    return ausgabe.id + "-formular-" + (neu ? "neu" : "bearbeiten") + "-";
  }

  /* Die Felder des offenen Formulars in einer Ausgabe. */
  function felder(ausgabe, neu) {
    const teil = "formular-" + (neu ? "neu" : "bearbeiten") + "-";
    return { datum: finden(ausgabe, teil + "datum"), text: finden(ausgabe, teil + "text"),
      block: ausgabe.rumpf.querySelector(".vl-formular[data-vl-art=\"" + (neu ? "neu" : "bearbeiten") + "\"]") };
  }

  /* Ist im Formular etwas, das beim Schliessen verloren ginge? */
  function hatEingabe(ausgabe, neu) {
    const z = ausgabe.z;
    if (neu) return z.offen && !!String(z.text || "").trim();
    if (!z.bearbeitet) return false;
    const e = ausgabe.eintraege.filter(function (x) { return x.id === z.bearbeitet; })[0];
    if (!e) return false;
    return String(z.bText || "").trim() !== String(e.text || "").trim() || (z.bDatum || "") !== (e.datum || "");
  }

  /* Das andere offene Formular darf nur ohne Verlust zugehen. */
  async function anderesSchliessen(ausgabe, neu) {
    const z = ausgabe.z;
    const anderesOffen = neu ? !!z.bearbeitet : z.offen;
    if (!anderesOffen) return true;
    if (hatEingabe(ausgabe, !neu)) {
      const ja = await UI.bestaetigen({
        titel: neu ? "Bearbeitung verwerfen?" : "Neuen Eintrag verwerfen?",
        text: neu ? "Die Änderungen am offenen Eintrag gehen verloren."
          : "Der Text des neuen Eintrags geht verloren.",
        ja: "Verwerfen"
      });
      if (!ja) return false;
    }
    if (neu) z.bearbeitet = null;
    else { z.offen = false; z.text = ""; z.datum = ""; }
    return true;
  }

  async function neuOeffnen(ausgabe) {
    if (ausgabe.gesperrt) return;
    const z = ausgabe.z;
    if (z.offen) {
      // Schon offen: dorthin, statt ein zweites Formular zu öffnen.
      fokussieren(felder(aktuell(ausgabe), true).text, true);
      return;
    }
    if (!(await anderesSchliessen(ausgabe, true))) return;
    const jetzt = aktuell(ausgabe);
    z.offen = true;
    z.datum = Modell.heuteIso();
    z.text = "";
    rumpfZeichnen(jetzt);
    const f = felder(jetzt, true);
    Bewegung.eintreten(f.block);
    fokussieren(f.text);
  }

  async function bearbeitenOeffnen(ausgabe, eintrag) {
    const z = ausgabe.z;
    if (z.bearbeitet === eintrag.id) return;
    if (!(await anderesSchliessen(ausgabe, false))) return;
    if (z.bearbeitet && hatEingabe(aktuell(ausgabe), false)) {
      const ja = await UI.bestaetigen({ titel: "Bearbeitung verwerfen?",
        text: "Die Änderungen am anderen Eintrag gehen verloren.", ja: "Verwerfen" });
      if (!ja) return;
    }
    const jetzt = aktuell(ausgabe);
    z.bearbeitet = eintrag.id;
    z.bDatum = eintrag.datum || Modell.heuteIso();
    z.bText = eintrag.text || "";
    rumpfZeichnen(jetzt);
    const f = felder(jetzt, false);
    Bewegung.eintreten(f.block);
    fokussieren(f.text, true);
  }

  /* Prüfen und übernehmen. Gibt false zurück, wenn etwas fehlt (dann steht
     der Fehler am Feld und der Fokus im ersten falschen Feld). */
  function absenden(ausgabe, neu) {
    const f = felder(ausgabe, neu);
    if (!f.datum || !f.text) return false;
    const z = ausgabe.z;
    let erstesFalsches = null;
    if (!Modell.datumIsoGueltig(f.datum.value)) {
      UI.feldFehler(f.datum, "Bitte ein gültiges Datum wählen.");
      erstesFalsches = f.datum;
    }
    if (!f.text.value.trim()) {
      UI.feldFehler(f.text, "Bitte beschreiben, was passiert ist.");
      erstesFalsches = erstesFalsches || f.text;
    }
    if (erstesFalsches) { erstesFalsches.focus(); return false; }

    const datum = f.datum.value;
    const text = f.text.value.trim();
    if (neu) {
      const eintrag = Modell.verlaufEintrag(datum, text);
      z.offen = false; z.text = ""; z.datum = "";
      uebernehmen(ausgabe, ausgabe.eintraege.concat([eintrag]), { fokus: "neu", aufdecken: eintrag.id });
      return true;
    }
    const id = z.bearbeitet;
    const alt = ausgabe.eintraege.filter(function (e) { return e.id === id; })[0];
    z.bearbeitet = null;
    if (!alt || (alt.text === text && alt.datum === datum)) {
      // Nichts geändert: nur zu, kein neuer Wert für die Seite.
      rumpfZeichnen(ausgabe);
      fokussieren(finden(ausgabe, "bearbeiten-" + id));
      return true;
    }
    uebernehmen(ausgabe, ausgabe.eintraege.map(function (e) {
      if (e.id !== id) return e;
      /* Quelle und Erfassungszeitpunkt bleiben: sie sagen, woher der
         Eintrag stammt, nicht wann er zuletzt angefasst wurde. */
      return Object.assign({}, e, { datum: datum, text: text });
    }), { fokus: "bearbeiten-" + id });
    return true;
  }

  /* Abbrechen: das Formular blendet aus, der Fokus geht an den Auslöser
     zurück. «fragen» (Esc): erst nachfragen, wenn schon etwas getippt ist. */
  async function schliessen(ausgabe, neu, fragen) {
    const z = ausgabe.z;
    if (fragen && hatEingabe(ausgabe, neu)) {
      const ja = await UI.bestaetigen({
        titel: neu ? "Neuen Eintrag verwerfen?" : "Bearbeitung verwerfen?",
        text: neu ? "Der eingegebene Text geht verloren." : "Die Änderungen an diesem Eintrag gehen verloren.",
        ja: "Verwerfen"
      });
      if (!ja) {
        fokussieren(felder(aktuell(ausgabe), neu).text);
        return;
      }
    }
    const jetzt = aktuell(ausgabe);
    const id = z.bearbeitet;
    const block = felder(jetzt, neu).block;
    if (neu) { z.offen = false; z.text = ""; z.datum = ""; } else { z.bearbeitet = null; }
    if (jetzt.neu) {
      jetzt.neu.setAttribute("aria-expanded", "false");
      // Der Fokus wartet nicht im ausblendenden Block, er ist gleich wieder beim Auslöser.
      if (neu) fokussieren(jetzt.neu);
    }
    if (block) await Bewegung.austreten(block, "", { dann: "behalten" });
    const danach = aktuell(jetzt);
    rumpfZeichnen(danach);
    fokussieren(neu ? danach.neu : finden(danach, "bearbeiten-" + id));
  }

  async function loeschenFragen(ausgabe, eintrag) {
    const was = auszug(eintrag.text, 60);
    const ja = await UI.bestaetigen({
      titel: "Eintrag löschen?",
      text: (eintrag.datum ? "Der Eintrag vom " + datumText(eintrag) : "Der Eintrag ohne Datum")
        + (was ? " («" + was + "»)" : "") + " verschwindet aus dem Verlauf. Gespeichert wird erst mit «Speichern».",
      ja: "Eintrag löschen"
    });
    if (!ja) return;
    const jetzt = aktuell(ausgabe);
    const index = jetzt.eintraege.findIndex(function (e) { return e.id === eintrag.id; });
    if (index === -1) return;
    const li = jetzt.rumpf.querySelector("[data-eintrag=\"" + CSS.escape(eintrag.id) + "\"]");
    if (li) await Bewegung.austreten(li, "skalieren", { dann: "behalten" });
    const danach = aktuell(jetzt);
    if (danach.z.bearbeitet === eintrag.id) danach.z.bearbeitet = null;
    const rest = danach.eintraege.filter(function (e) { return e.id !== eintrag.id; });
    // Der Fokus rückt zum Nachbarn (Tastatur: gleich weiter löschen), sonst zu «Neuer Eintrag».
    const nachbar = rest[index] || rest[index - 1];
    uebernehmen(danach, rest, { fokus: nachbar ? "loeschen-" + nachbar.id : "neu" });
  }

  /* Die neue Liste an die Seite melden und zeigen. Zeichnet die Seite in
     beiAenderung selbst neu, wird nicht doppelt gezeichnet. */
  function uebernehmen(ausgabe, liste, nach) {
    const json = Modell.verlaufSchreiben(liste);
    ausgabe.o.wert = json;
    if (typeof ausgabe.o.beiAenderung === "function") ausgabe.o.beiAenderung(json);
    let jetzt = letzte[ausgabe.schluessel];
    if (!jetzt || jetzt === ausgabe || !jetzt.ziel.isConnected) {
      jetzt = ausgabe;
      rumpfZeichnen(ausgabe);
    }
    const n = nach || {};
    if (n.aufdecken) {
      const li = jetzt.rumpf.querySelector("[data-eintrag=\"" + CSS.escape(n.aufdecken) + "\"]");
      if (li) Bewegung.aufdecken(li);
    }
    fokussieren(n.fokus === "neu" ? jetzt.neu : finden(jetzt, n.fokus));
  }

  /* Esc bricht ab, Ctrl/Cmd+Enter übernimmt. Ctrl/Cmd+S mit Eingabe:
     erst übernehmen, dann darf F.ereignisse speichern (der Eintrag steht
     jetzt im Entwurf); ist die Eingabe falsch, wird nicht gespeichert. */
  function tasten(ausgabe, neu, ev) {
    if (ev.defaultPrevented || ev.isComposing) return;
    const strg = (ev.ctrlKey || ev.metaKey) && !ev.altKey;
    if (ev.key === "Escape" && !UI.ebeneOffen()) {
      ev.preventDefault();
      ev.stopPropagation();
      schliessen(ausgabe, neu, true);
      return;
    }
    if (strg && ev.key === "Enter") {
      ev.preventDefault();
      absenden(ausgabe, neu);
      return;
    }
    if (strg && (ev.key === "s" || ev.key === "S")) {
      const f = felder(ausgabe, neu);
      const leerNeu = neu && !String(f.text ? f.text.value : "").trim();
      if (leerNeu || (!neu && !hatEingabe(ausgabe, false))) return;   // nichts zu übernehmen
      if (!absenden(ausgabe, neu)) {
        ev.preventDefault();
        ev.stopPropagation();
      }
    }
  }

  /* ==================================================================
     Schnittstelle für das Gerüst (fenster.js): Verlassen und Verwerfen

     Was im Formular steht, gehört noch nicht zum Entwurf der Seite (erst
     «Hinzufügen»/«Übernehmen» meldet es an beiAenderung). Darum fragt das
     Gerüst hier nach, bevor die Seite verlassen wird, und setzt hier
     zurück, wenn die Person in der Speicherleiste «Verwerfen» wählt.
     ================================================================== */

  /* Die Einbauorte, die ein Aufruf betrifft: einer oder alle. */
  function schluesselVon(schluessel) {
    return schluessel ? [String(schluessel)] : Object.keys(zustaende);
  }

  /**
   * Steht in einem Formular etwas, das beim Schliessen verloren ginge
   * (neuer Eintrag mit Text, geänderte Bearbeitung)? Dieselbe Regel wie
   * die Rückfrage bei Esc. Ohne Schlüssel: über alle Einbauorte, auch
   * über einen gerade nicht gezeigten Bereich (das Formular kehrt mit ihm
   * zurück).
   * @param {string} [schluessel]
   * @returns {boolean}
   */
  function offeneEingabe(schluessel) {
    return schluesselVon(schluessel).some(function (k) {
      const ausgabe = letzte[k];
      // Nie gezeichnet oder nur lesen: kein sichtbares Formular, nichts zu verlieren.
      if (!ausgabe || ausgabe.gesperrt) return false;
      return hatEingabe(ausgabe, true) || hatEingabe(ausgabe, false);
    });
  }

  /**
   * Schliesst die Formulare und vergisst das Getippte (Seiten-«Verwerfen»).
   * Ein gezeichneter Verlauf zeigt das sofort, an Ort und Stelle und ohne
   * Bewegung – egal, ob die Seite vorher oder nachher neu zeichnet. Stand
   * der Fokus im Formular, geht er an dessen Auslöser zurück.
   * @param {string} [schluessel]
   */
  function zuruecksetzen(schluessel) {
    for (const k of schluesselVon(schluessel)) {
      const z = zustaende[k];
      if (!z || (!z.offen && !z.bearbeitet)) continue;
      const bearbeitet = z.bearbeitet;
      z.offen = false; z.datum = ""; z.text = "";
      z.bearbeitet = null; z.bDatum = ""; z.bText = "";
      const ausgabe = letzte[k];
      if (!ausgabe || !ausgabe.ziel.isConnected) continue;
      const a = document.activeElement;
      const block = a && ausgabe.rumpf.contains(a) ? a.closest(".vl-formular") : null;
      rumpfZeichnen(ausgabe);
      if (!block) continue;
      fokussieren(block.getAttribute("data-vl-art") === "neu" ? ausgabe.neu
        : finden(ausgabe, "bearbeiten-" + bearbeitet) || ausgabe.neu);
    }
  }

  return { zeichnen: zeichnen, offeneEingabe: offeneEingabe, zuruecksetzen: zuruecksetzen };
})();

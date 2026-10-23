/* verlauf.js – der Verlauf (Zeitachse der Ereignisse) für Client, Benutzer,
   Telefonnummer, Kamera und Kamerarolle.

   Diese Listen haben eine Note-Spalte «Verlauf» mit einem JSON-Array; das
   Format und alle Lese- und Schreibhelfer stehen in modell.js. Diese Datei
   ist reine Oberfläche: eine Karte mit Kopfzeile (Titel, Zahl der
   Einträge, «Neuer Eintrag»), darunter die Zeitachse (UI.zeitachse,
   ICT-eigen: Dashboard-Style hat keine) mit Bearbeiten und Löschen je
   Eintrag.

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
       Baut in ziel genau eine UI.karte ({ titel, unter: beschreibung,
       aktionen: [Zahl, «Neuer Eintrag»] }, id «vl-<schluessel>-karte») mit
       Formular und Zeitachse. Steht die Karte schon in ziel, gleicht
       UI.abgleichen sie an Ort und Stelle ab; sonst ersetzt sie den Inhalt.

     Verlauf.offeneEingabe(schluessel?) → bool
       Steht in einem Formular etwas, das beim Schliessen verloren ginge?
       Ohne Schlüssel über alle Einbauorte. Für die Rückfrage beim Verlassen
       der Seite (fenster.js, beforeunload).
     Verlauf.zuruecksetzen(schluessel?)
       Formulare schliessen, Getipptes vergessen (Seiten-«Verwerfen» in
       fenster.js); ein gezeichneter Verlauf zeigt es sofort, ohne Bewegung.

   Neuzeichnen: Die Seite baut den Verlauf bei jedem Nachladen, Speichern
   oder Verwerfen in eine neue Hülle, und F.zeichneBereich gleicht den
   Bereich mit dem gezeigten ab (DS.dom.morphChildren). Die gezeigte Karte
   bleibt dabei stehen, mit Fokus, Schreibmarke und Status-Chips (kein
   Auftritt spielt noch einmal); die Einträge tragen ihren Schlüssel
   (data-ds-key = «e-<id>»). Darum hält der Verlauf keine Knoten fest: er
   sucht die gezeigte Karte über ihre id, und alle Klicks, Eingaben und
   Tasten hören an der Karte (Delegation über data-vl-aktion, data-vl-feld,
   data-vl-eintrag), nie am einzelnen Knopf – ein stehen gebliebener Knopf
   ruft so immer den aktuellen Stand auf.

   Bewegung: Neuzeichnen durch die Seite bewegt NIE etwas. Nur Handlungen
   der Person bewegen: Formular öffnen und schliessen, Eintrag anlegen und
   löschen laufen über Bewegung.umordnen (DS.motion.flip) – Neues blendet
   ein, Entferntes blendet ausserhalb des Flusses aus, die übrigen
   Einträge gleiten an ihren Platz.

   Fokus: Steht er auf etwas, das gleich verschwindet, geht er vorher
   dorthin, wo die Person weiterarbeitet (Auslöser, Nachbar, «Neuer
   Eintrag»). Alle Bedienelemente tragen ein stabiles data-fokus
   («vl-<schluessel>-…»), die Felder dieselbe Zeichenkette als id.

   Tastatur im Formular: Esc bricht ab (mit Rückfrage, wenn schon etwas
   eingetippt ist), Ctrl/Cmd+Enter übernimmt, Ctrl/Cmd+S übernimmt den
   Eintrag und lässt die Seite dann alles speichern.

   Grundsätze wie überall: kein innerHTML, Text nur über textContent; alles
   Sichtbare über UI.* (bausteine.js), Rückfragen über UI.bestaetigen. */

"use strict";

const Verlauf = (function () {

  const el = UI.el;

  /* Was Bewegung.umordnen gleiten lässt: die Teile des Rumpfs (Formular,
     Leerzustand) und die einzelnen Einträge – nie die Liste als Ganzes,
     sonst glitten ihre Einträge doppelt. */
  const UMORDNEN = ".vl > :not(.vl-liste), .vl-liste > li";

  /* ==================================================================
     Zustand je Einbauort
     ================================================================== */

  /* Was ein Neuzeichnen überleben muss: offenes Formular, die halb
     getippten Werte (neu: datum/text, bearbeiten: bDatum/bText) und die
     zuletzt übergebenen Optionen (o) samt gelesenen Einträgen. */
  const zustaende = {};

  function zustand(schluessel) {
    const k = schluessel || "standard";
    if (!zustaende[k]) {
      zustaende[k] = { offen: false, datum: "", text: "", bearbeitet: null, bDatum: "", bText: "",
        gelesen: null, o: null, gesperrt: false, eintraege: [] };
    }
    return zustaende[k];
  }

  function kennung(schluessel) {
    return "vl-" + String(schluessel || "standard").replace(/[^A-Za-z0-9_-]/g, "-");
  }

  /* Die gezeigte Karte eines Einbauorts und ihre Teile, oder null. */
  function gezeigt(schluessel) {
    const karte = document.getElementById(kennung(schluessel) + "-karte");
    if (!karte) return null;
    return {
      karte: karte,
      rumpf: karte.querySelector(".vl"),
      anzahl: karte.querySelector(".vl-anzahl"),
      neu: karte.querySelector("[data-vl-aktion=\"neu\"]")
    };
  }

  /* Ein Bedienelement der gezeigten Karte über sein data-fokus («neu»,
     «bearbeiten-<id>», «loeschen-<id>» …). */
  function finden(schluessel, fokus) {
    const t = gezeigt(schluessel);
    if (!t || !fokus) return null;
    return t.karte.querySelector("[data-fokus=\"" + CSS.escape(kennung(schluessel) + "-" + fokus) + "\"]");
  }

  /* Ein Feld des offenen Formulars (id = data-fokus). */
  function feld(schluessel, neu, name) {
    return document.getElementById(formPraefix(schluessel, neu) + name);
  }

  /* data-fokus und id der Formularteile: «vl-geraet-formular-neu-text» usw.
     (eigener Zweig, damit nie eine Eintrags-Id mit «text» zusammenfällt). */
  function formPraefix(schluessel, neu) {
    return kennung(schluessel) + "-formular-" + (neu ? "neu" : "bearbeiten") + "-";
  }

  /* Derselbe Rohwert ergibt dieselben Einträge: Modell.verlaufLesen
     erfindet für Einträge ohne «id» (von Hand in SharePoint geändert) bei
     jedem Lesen eine neue – dann fände ein offenes Bearbeiten-Formular oder
     der Abgleich seinen Eintrag nicht wieder. */
  function lesen(z) {
    const roh = z.o ? z.o.wert : "";
    const eintraege = z.gelesen && z.gelesen.roh === roh ? z.gelesen.liste : Modell.verlaufLesen(roh);
    z.gelesen = { roh: roh, liste: eintraege };
    z.eintraege = eintraege;
    if (z.bearbeitet && !eintraege.some(function (e) { return e.id === z.bearbeitet; })) z.bearbeitet = null;
    return eintraege;
  }

  function eintragVon(z, id) {
    return z.eintraege.filter(function (e) { return e.id === id; })[0] || null;
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

  function fokussieren(knoten, ansEnde) {
    if (!knoten || !knoten.focus || !knoten.isConnected) return;
    knoten.focus();
    if (ansEnde && typeof knoten.setSelectionRange === "function") {
      try { knoten.setSelectionRange(knoten.value.length, knoten.value.length); } catch (e) { /* Datum */ }
    }
  }

  /* ==================================================================
     Bauen
     ================================================================== */

  /**
   * Zeichnet den Verlauf in «ziel». Siehe Kopfkommentar.
   * @param {HTMLElement} ziel
   * @param {Object} optionen
   * @returns {HTMLElement} ziel
   */
  function zeichnen(ziel, optionen) {
    const o = Object.assign({}, optionen || {});
    const schluessel = o.schluessel || "standard";
    const z = zustand(schluessel);
    z.o = o;
    z.gesperrt = !!o.gesperrt;
    lesen(z);
    UI.abgleichen(ziel, [karteBauen(schluessel)]);
    return ziel;
  }

  /* Die ganze Karte frisch, aus dem Zustand. Die Zuhörer hängen an der
     Karte: bleibt beim Abgleich die gezeigte stehen, hört weiter deren. */
  function karteBauen(schluessel) {
    const z = zustand(schluessel);
    const id = kennung(schluessel);

    // Kopfteile: die Zahl (Meta, z. B. «12 Einträge») und die Hauptaktion.
    const anzahl = el("span", "anzahl vl-anzahl");
    let neu = null;
    if (!z.gesperrt) {
      neu = UI.knopf({ text: "Neuer Eintrag", variante: "tonal", sinnbild: "plus", fokus: id + "-neu" });
      neu.setAttribute("data-vl-aktion", "neu");
    }
    const karte = UI.karte({ titel: z.o.titel || "Verlauf", unter: z.o.beschreibung || "",
      aktionen: [anzahl, neu], klasse: "vl-karte", id: id + "-karte" });
    karte.setAttribute("data-vl", schluessel);
    kopfNachfuehren({ anzahl: anzahl, neu: neu }, z);

    const rumpf = el("div", "vl");
    UI.anhaengen(rumpf, rumpfKinder(schluessel));
    karte.inhalt.appendChild(rumpf);
    verdrahten(karte, schluessel);
    return karte;
  }

  function kopfNachfuehren(t, z) {
    const n = z.eintraege.length;
    if (t.anzahl) {
      UI.textSetzen(t.anzahl, anzahlText(n));
      if (t.anzahl.hidden !== !n) t.anzahl.hidden = !n;
    }
    const offen = z.offen && !z.gesperrt;
    if (t.neu && t.neu.getAttribute("aria-expanded") !== String(offen)) t.neu.setAttribute("aria-expanded", String(offen));
  }

  /* Formular (neu), dann Zeitachse bzw. Leerzustand. Nur lesen: kein
     Formular (der Zustand bleibt für später). Alle Teile tragen einen
     Schlüssel: neben dem geschlüsselten Formular fände der Abgleich eine
     Liste ohne Schlüssel nicht wieder und baute sie samt ihren Status-
     Chips neu. */
  function rumpfKinder(schluessel) {
    const z = zustand(schluessel);
    const offen = z.offen && !z.gesperrt;
    const kinder = [];
    if (offen) kinder.push(formular(schluessel, null));
    if (!z.eintraege.length) {
      if (!offen) {
        const l = leer(z);
        l.setAttribute("data-ds-key", "leer");
        kinder.push(l);
      }
      return kinder;
    }
    const liste = UI.zeitachse(z.eintraege.map(function (e) { return eintragDaten(schluessel, e); }));
    liste.classList.add("vl-liste");
    liste.setAttribute("data-ds-key", "liste");
    Array.from(liste.children).forEach(function (li, i) { li.setAttribute("data-ds-key", "e-" + z.eintraege[i].id); });
    kinder.push(liste);
    return kinder;
  }

  /* Allgemein gehalten: der Verlauf steht beim Gerät, bei der Person, bei
     der Nummer und bei der Kamera. Titel und Sinnbild genügen – wie man
     einen Eintrag anlegt, zeigt der Knopf «Neuer Eintrag» im Kartenkopf. */
  function leer(z) {
    if (z.gesperrt) return UI.hinweis("Noch kein Verlauf erfasst.");
    return UI.leerzustand({ sinnbild: "verlauf", titel: "Noch kein Verlauf" });
  }

  /* Ein Eintrag für UI.zeitachse: Datum (500, tabellarisch), wann erfasst
     (Meta). Abgleich-Einträge weichen vom Normalfall ab: neutraler Status-
     Chip «Abgleich», grauer Punkt und Sync-Sinnbild in der Meta-Zeile; von
     Hand erfasste tragen keinen Chip (UI.anhaengen überspringt null). Im
     Bearbeiten steht das Formular statt des Texts. */
  function eintragDaten(schluessel, e) {
    const z = zustand(schluessel);
    const id = kennung(schluessel);
    const sync = e.quelle === "sync";
    const d = {
      titel: datumText(e),
      zeit: sync ? (erfasstText(e) || "automatisch") : erfasstText(e),
      zeitSinnbild: sync ? "sync" : undefined,
      still: sync,
      zusatz: [sync ? UI.status("Abgleich", "neutral", { sinnbild: "server" }) : null],
      text: e.text || "–"
    };
    if (z.gesperrt) return d;
    if (z.bearbeitet === e.id) {
      d.text = formular(schluessel, e);
      return d;
    }
    const wann = e.datum ? "Eintrag vom " + datumText(e) : "Eintrag ohne Datum";
    const bearbeiten = UI.knopf({ text: "Bearbeiten", variante: "leise", klein: true,
      label: wann + " bearbeiten", fokus: id + "-bearbeiten-" + e.id });
    const loeschen = UI.knopf({ text: "Löschen", variante: "leise", klein: true,
      label: wann + " löschen", fokus: id + "-loeschen-" + e.id });
    bearbeiten.setAttribute("data-vl-aktion", "bearbeiten");
    loeschen.setAttribute("data-vl-aktion", "loeschen");
    bearbeiten.setAttribute("data-vl-eintrag", e.id);
    loeschen.setAttribute("data-vl-eintrag", e.id);
    d.aktionen = [bearbeiten, loeschen];
    return d;
  }

  /* Das Formular (neu oder bearbeiten): ein gefüllter Block mit Datum,
     Text und den Aktionen. Die Felder hören nicht selbst (die Karte
     nimmt ihre Eingaben, verdrahten). */
  function formular(schluessel, eintrag) {
    const z = zustand(schluessel);
    const neu = !eintrag;
    const p = formPraefix(schluessel, neu);

    const block = UI.karte({ titel: neu ? "Neuer Eintrag" : "Eintrag bearbeiten", gefuellt: true, ebene: 3,
      klasse: "vl-formular" });
    block.setAttribute("data-vl-art", neu ? "neu" : "bearbeiten");
    block.setAttribute("data-ds-key", neu ? "formular-neu" : "formular-" + eintrag.id);

    const datum = UI.eingabe({ art: "datum", schmal: true, id: p + "datum", fokus: p + "datum",
      wert: neu ? (z.datum || Modell.heuteIso()) : z.bDatum });
    datum.setAttribute("data-vl-feld", "datum");
    const text = UI.eingabe({ art: "textbereich", zeilen: 3, id: p + "text", fokus: p + "text",
      wert: neu ? z.text : z.bText, platzhalter: neu ? "Was ist passiert?" : "" });
    text.setAttribute("data-vl-feld", "text");
    text.spellcheck = true;

    const ok = UI.knopf({ text: neu ? "Hinzufügen" : "Übernehmen", variante: "primaer", fokus: p + "ok" });
    ok.setAttribute("data-vl-aktion", "ok");
    const ab = UI.knopf({ text: "Abbrechen", variante: "leise", fokus: p + "abbrechen" });
    ab.setAttribute("data-vl-aktion", "abbrechen");

    UI.anhaengen(block.inhalt, [
      UI.feld("Datum", datum),
      UI.feld("Text", text),
      UI.anhaengen(el("div", "ds-form-actions"), [ok, ab, UI.meta("Gespeichert wird erst mit «Speichern».")])
    ]);
    return block;
  }

  /* Ein Zuhörer je Art an der Karte. Ein gesperrter oder beschäftigter
     Knopf kommt nicht an (bausteine.js schluckt seinen Klick). */
  function verdrahten(karte, schluessel) {
    function artVon(knoten) {
      const block = knoten.closest(".vl-formular");
      return block ? block.getAttribute("data-vl-art") === "neu" : null;
    }
    karte.addEventListener("click", function (ev) {
      const k = ev.target instanceof Element ? ev.target.closest("[data-vl-aktion]") : null;
      if (!k || !karte.contains(k)) return;
      const aktion = k.getAttribute("data-vl-aktion");
      const eintrag = k.getAttribute("data-vl-eintrag");
      if (aktion === "neu") neuOeffnen(schluessel);
      else if (aktion === "bearbeiten") bearbeitenOeffnen(schluessel, eintrag);
      else if (aktion === "loeschen") loeschenFragen(schluessel, eintrag);
      else if (aktion === "ok") absenden(schluessel, artVon(k));
      else if (aktion === "abbrechen") schliessen(schluessel, artVon(k), false);
    });
    karte.addEventListener("input", function (ev) {
      const f = ev.target;
      const name = f && f.getAttribute ? f.getAttribute("data-vl-feld") : null;
      if (!name) return;
      const z = zustand(schluessel);
      const neu = artVon(f);
      if (name === "datum") { if (neu) z.datum = f.value; else z.bDatum = f.value; }
      else if (neu) z.text = f.value;
      else z.bText = f.value;
    });
    karte.addEventListener("keydown", function (ev) {
      const neu = ev.target instanceof Element ? artVon(ev.target) : null;
      if (neu !== null) tasten(schluessel, neu, ev);
    });
  }

  /* Die gezeigte Karte nachführen: Kopfzeile an Ort und Stelle, der Rumpf
     über UI.abgleichen – mit bewegt über Bewegung.umordnen (Handlungen der
     Person), sonst still. */
  function neuZeichnen(schluessel, bewegt) {
    const z = zustand(schluessel);
    const t = gezeigt(schluessel);
    if (!t || !t.rumpf) return Promise.resolve();
    lesen(z);
    kopfNachfuehren(t, z);
    const kinder = rumpfKinder(schluessel);
    if (!bewegt) {
      UI.abgleichen(t.rumpf, kinder);
      return Promise.resolve();
    }
    return Bewegung.umordnen(t.rumpf, function (o) { UI.abgleichen(t.rumpf, kinder, o); }, { eintraege: UMORDNEN });
  }

  /* ==================================================================
     Handlungen
     ================================================================== */

  /* Ist im Formular etwas, das beim Schliessen verloren ginge? */
  function hatEingabe(z, neu) {
    if (neu) return z.offen && !!String(z.text || "").trim();
    if (!z.bearbeitet) return false;
    const e = eintragVon(z, z.bearbeitet);
    if (!e) return false;
    return String(z.bText || "").trim() !== String(e.text || "").trim() || (z.bDatum || "") !== (e.datum || "");
  }

  /* Das andere offene Formular darf nur ohne Verlust zugehen. */
  async function anderesSchliessen(z, neu) {
    const anderesOffen = neu ? !!z.bearbeitet : z.offen;
    if (!anderesOffen) return true;
    if (hatEingabe(z, !neu)) {
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

  async function neuOeffnen(schluessel) {
    const z = zustand(schluessel);
    if (z.gesperrt) return;
    if (z.offen) {
      // Schon offen: dorthin, statt ein zweites Formular zu öffnen.
      fokussieren(feld(schluessel, true, "text"), true);
      return;
    }
    if (!(await anderesSchliessen(z, true))) return;
    z.offen = true;
    z.datum = Modell.heuteIso();
    z.text = "";
    const lauf = neuZeichnen(schluessel, true);
    fokussieren(feld(schluessel, true, "text"));
    await lauf;
  }

  async function bearbeitenOeffnen(schluessel, id) {
    const z = zustand(schluessel);
    const eintrag = eintragVon(z, id);
    if (!eintrag || z.bearbeitet === id) return;
    if (!(await anderesSchliessen(z, false))) return;
    if (z.bearbeitet && hatEingabe(z, false)) {
      const ja = await UI.bestaetigen({ titel: "Bearbeitung verwerfen?",
        text: "Die Änderungen am anderen Eintrag gehen verloren.", ja: "Verwerfen" });
      if (!ja) return;
    }
    z.bearbeitet = eintrag.id;
    z.bDatum = eintrag.datum || Modell.heuteIso();
    z.bText = eintrag.text || "";
    const lauf = neuZeichnen(schluessel, true);
    fokussieren(feld(schluessel, false, "text"), true);
    await lauf;
  }

  /* Prüfen und übernehmen. Gibt false zurück, wenn etwas fehlt (dann steht
     der Fehler am Feld und der Fokus im ersten falschen Feld). */
  function absenden(schluessel, neu) {
    const fDatum = feld(schluessel, neu, "datum");
    const fText = feld(schluessel, neu, "text");
    if (!fDatum || !fText) return false;
    const z = zustand(schluessel);
    let erstesFalsches = null;
    if (!Modell.datumIsoGueltig(fDatum.value)) {
      UI.feldFehler(fDatum, "Bitte ein gültiges Datum wählen.");
      erstesFalsches = fDatum;
    }
    if (!fText.value.trim()) {
      UI.feldFehler(fText, "Bitte beschreiben, was passiert ist.");
      erstesFalsches = erstesFalsches || fText;
    }
    if (erstesFalsches) { erstesFalsches.focus(); return false; }

    const datum = fDatum.value;
    const text = fText.value.trim();
    if (neu) {
      z.offen = false; z.text = ""; z.datum = "";
      // Das Formular geht gleich: der Fokus wartet bei «Neuer Eintrag».
      const t = gezeigt(schluessel);
      fokussieren(t && t.neu);
      uebernehmen(schluessel, z.eintraege.concat([Modell.verlaufEintrag(datum, text)]));
      return true;
    }
    const id = z.bearbeitet;
    const alt = eintragVon(z, id);
    z.bearbeitet = null;
    if (!alt || (alt.text === text && alt.datum === datum)) {
      // Nichts geändert: nur zu, kein neuer Wert für die Seite.
      neuZeichnen(schluessel, true);
    } else {
      uebernehmen(schluessel, z.eintraege.map(function (e) {
        if (e.id !== id) return e;
        /* Quelle und Erfassungszeitpunkt bleiben: sie sagen, woher der
           Eintrag stammt, nicht wann er zuletzt angefasst wurde. */
        return Object.assign({}, e, { datum: datum, text: text });
      }));
    }
    // Der Knopf «Bearbeiten» steht erst nach dem Abgleich wieder da.
    fokussieren(finden(schluessel, "bearbeiten-" + id));
    return true;
  }

  /* Abbrechen: das Formular blendet aus, der Fokus geht an den Auslöser
     zurück. «fragen» (Esc): erst nachfragen, wenn schon etwas getippt ist. */
  async function schliessen(schluessel, neu, fragen) {
    const z = zustand(schluessel);
    if (fragen && hatEingabe(z, neu)) {
      const ja = await UI.bestaetigen({
        titel: neu ? "Neuen Eintrag verwerfen?" : "Bearbeitung verwerfen?",
        text: neu ? "Der eingegebene Text geht verloren." : "Die Änderungen an diesem Eintrag gehen verloren.",
        ja: "Verwerfen"
      });
      if (!ja) {
        fokussieren(feld(schluessel, neu, "text"));
        return;
      }
    }
    const id = z.bearbeitet;
    if (neu) {
      z.offen = false; z.text = ""; z.datum = "";
      // Der Fokus wartet nicht im ausblendenden Block, er ist gleich beim Auslöser.
      const t = gezeigt(schluessel);
      fokussieren(t && t.neu);
    } else {
      z.bearbeitet = null;
    }
    const lauf = neuZeichnen(schluessel, true);
    if (!neu) fokussieren(finden(schluessel, "bearbeiten-" + id));
    await lauf;
  }

  async function loeschenFragen(schluessel, id) {
    const z = zustand(schluessel);
    const eintrag = eintragVon(z, id);
    if (!eintrag) return;
    const was = auszug(eintrag.text, 60);
    const ja = await UI.bestaetigen({
      titel: "Eintrag löschen?",
      text: (eintrag.datum ? "Der Eintrag vom " + datumText(eintrag) : "Der Eintrag ohne Datum")
        + (was ? " («" + was + "»)" : "") + " verschwindet aus dem Verlauf. Gespeichert wird erst mit «Speichern».",
      ja: "Eintrag löschen"
    });
    if (!ja) return;
    // Inzwischen kann neu gezeichnet worden sein: mit dem jetzigen Stand.
    const index = z.eintraege.findIndex(function (e) { return e.id === id; });
    if (index === -1) return;
    if (z.bearbeitet === id) z.bearbeitet = null;
    const rest = z.eintraege.filter(function (e) { return e.id !== id; });
    // Der Fokus rückt zum Nachbarn (Tastatur: gleich weiter löschen), sonst
    // zu «Neuer Eintrag» – vor dem Abgleich, der gelöschte Eintrag geht gleich.
    const nachbar = rest[index] || rest[index - 1];
    const t = gezeigt(schluessel);
    fokussieren(nachbar ? finden(schluessel, "loeschen-" + nachbar.id) : (t && t.neu));
    await uebernehmen(schluessel, rest);
  }

  /* Die neue Liste an die Seite melden und mit Bewegung zeigen. Zeichnet
     die Seite in beiAenderung selbst neu, ist danach nichts mehr zu tun. */
  function uebernehmen(schluessel, liste) {
    const z = zustand(schluessel);
    const json = Modell.verlaufSchreiben(liste);
    z.o.wert = json;
    if (typeof z.o.beiAenderung === "function") z.o.beiAenderung(json);
    return neuZeichnen(schluessel, true);
  }

  /* Esc bricht ab, Ctrl/Cmd+Enter übernimmt. Ctrl/Cmd+S mit Eingabe:
     erst übernehmen, dann darf F.ereignisse speichern (der Eintrag steht
     jetzt im Entwurf); ist die Eingabe falsch, wird nicht gespeichert.
     Eine offene Überlagerung (Rückfrage) hat Esc für sich: UI.ebeneOffen. */
  function tasten(schluessel, neu, ev) {
    if (ev.defaultPrevented || ev.isComposing) return;
    const strg = (ev.ctrlKey || ev.metaKey) && !ev.altKey;
    if (ev.key === "Escape" && !UI.ebeneOffen()) {
      ev.preventDefault();
      ev.stopPropagation();
      schliessen(schluessel, neu, true);
      return;
    }
    if (strg && ev.key === "Enter") {
      ev.preventDefault();
      absenden(schluessel, neu);
      return;
    }
    if (strg && (ev.key === "s" || ev.key === "S")) {
      const z = zustand(schluessel);
      const fText = feld(schluessel, neu, "text");
      const leerNeu = neu && !String(fText ? fText.value : "").trim();
      if (leerNeu || (!neu && !hatEingabe(z, false))) return;   // nichts zu übernehmen
      if (!absenden(schluessel, neu)) {
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
  function einbauorte(schluessel) {
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
    return einbauorte(schluessel).some(function (k) {
      const z = zustaende[k];
      // Nie gezeichnet oder nur lesen: kein sichtbares Formular, nichts zu verlieren.
      if (!z || !z.o || z.gesperrt) return false;
      return hatEingabe(z, true) || hatEingabe(z, false);
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
    for (const k of einbauorte(schluessel)) {
      const z = zustaende[k];
      if (!z || (!z.offen && !z.bearbeitet)) continue;
      const bearbeitet = z.bearbeitet;
      z.offen = false; z.datum = ""; z.text = "";
      z.bearbeitet = null; z.bDatum = ""; z.bText = "";
      const t = gezeigt(k);
      if (!t) continue;
      const a = document.activeElement;
      const block = a && t.rumpf && t.rumpf.contains(a) ? a.closest(".vl-formular") : null;
      if (block && block.getAttribute("data-vl-art") === "neu") fokussieren(t.neu);
      neuZeichnen(k, false);
      if (block && block.getAttribute("data-vl-art") !== "neu") {
        fokussieren(finden(k, "bearbeiten-" + bearbeitet) || t.neu);
      }
    }
  }

  return { zeichnen: zeichnen, offeneEingabe: offeneEingabe, zuruecksetzen: zuruecksetzen };
})();

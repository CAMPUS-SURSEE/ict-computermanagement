/* verlauf.js — Verlaufs-Zeitstrahl für Gerätefenster und Benutzerfenster.

   Beide Listen haben eine Note-Spalte «Verlauf» mit einem JSON-Array; das
   Format und alle Lese- und Schreibhelfer stehen in modell.js. Diese Datei
   ist reine Oberfläche: sie zeichnet die Einträge als senkrechte Zeitachse
   und bietet Neu, Bearbeiten und Löschen an.

   Gespeichert wird NICHT hier. Jede Änderung geht als fertige Zeichenkette
   an den Rückruf «beiAenderung»; die Seite hängt das in ihren bestehenden
   Speichermechanismus ein (setzeWert → Entwurf → Speicherleiste), genau wie
   bei der Bemerkung. So gibt es weiterhin genau einen Speicherweg.

   Verwendung:

     Verlauf.zeichnen(zielKnoten, {
       schluessel:   "geraet",              // merkt den Bedienzustand
       wert:         textWert("Verlauf"),   // Rohwert der Spalte
       gesperrt:     false,                 // nur lesen
       beiAenderung: function (json) { setzeWert("Verlauf", json); }
     });

   «schluessel» ist nötig, weil die Seiten ihren Bereich neu zeichnen: ohne
   ihn wäre ein offenes Formular nach jedem Neuzeichnen wieder zu.

   Grundsätze wie überall: kein Framework, kein Inline-Script und niemals
   innerHTML mit Daten — jeder Wert geht über textContent in die Seite. */

"use strict";

const Verlauf = (function () {

  /* Bedienzustand je Einbauort, damit er ein Neuzeichnen überlebt.
     { offen: bool, bearbeitet: id|null, datum: string, text: string } */
  const zustaende = {};

  function zustand(schluessel) {
    const k = schluessel || "standard";
    if (!zustaende[k]) {
      zustaende[k] = { offen: false, bearbeitet: null, datum: "", text: "" };
    }
    return zustaende[k];
  }

  /* ---------- kleine DOM-Helfer (bewusst lokal, keine Abhängigkeit) ---------- */

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

  function knopf(beschriftung, klasse, beiKlick) {
    const k = el("button", "knopf" + (klasse ? " " + klasse : ""), beschriftung);
    k.type = "button";
    if (beiKlick) k.addEventListener("click", beiKlick);
    return k;
  }

  function datumsfeld(wert) {
    const f = el("input", "vl-datum-feld");
    f.type = "date";
    f.value = wert || Modell.heuteIso();
    f.setAttribute("aria-label", "Datum des Ereignisses");
    return f;
  }

  function textfeld(wert, platzhalter) {
    const f = el("textarea", "vl-text-feld");
    f.value = wert || "";
    f.rows = 3;
    f.placeholder = platzhalter || "";
    f.setAttribute("aria-label", "Text des Eintrags");
    return f;
  }


  /* ==================================================================
     Zeichnen
     ================================================================== */

  /**
   * Zeichnet den Verlauf in den angegebenen Knoten (der geleert wird).
   *
   * @param {HTMLElement} ziel
   * @param {Object} optionen
   * @param {string} optionen.schluessel   Kennung des Einbauorts
   * @param {*}      optionen.wert         Rohwert der Spalte «Verlauf»
   * @param {boolean} [optionen.gesperrt]  true = nur lesen
   * @param {function(string)} optionen.beiAenderung  bekommt das neue JSON
   */
  function zeichnen(ziel, optionen) {
    const o = optionen || {};
    const z = zustand(o.schluessel);
    const gesperrt = !!o.gesperrt;
    const eintraege = Modell.verlaufLesen(o.wert);

    leeren(ziel);
    ziel.classList.add("vl");

    /* Speichern heisst hier: die neue Liste serialisieren, an die Seite
       melden und sich selbst neu zeichnen. Die Seite legt den Wert in ihren
       Entwurf; gespeichert wird erst mit dem Speichern-Knopf. */
    const uebernehmen = function (neueListe) {
      const json = Modell.verlaufSchreiben(neueListe);
      if (typeof o.beiAenderung === "function") o.beiAenderung(json);
      zeichnen(ziel, Object.assign({}, o, { wert: json }));
    };

    /* ---------- Kopfzeile mit «Neu» ---------- */

    if (!gesperrt) {
      const werkzeuge = el("div", "vl-werkzeuge");
      if (!z.offen) {
        werkzeuge.appendChild(knopf("Neuer Eintrag", "knopf-primaer", function () {
          z.offen = true;
          z.bearbeitet = null;
          z.datum = Modell.heuteIso();
          z.text = "";
          zeichnen(ziel, o);
        }));
      }
      werkzeuge.appendChild(el("span", "hinweis", eintraege.length === 1
        ? "1 Eintrag" : eintraege.length + " Einträge"));
      ziel.appendChild(werkzeuge);

      if (z.offen) ziel.appendChild(neuFormular(ziel, o, z, eintraege, uebernehmen));
    }

    /* ---------- Die Zeitachse ---------- */

    if (!eintraege.length) {
      ziel.appendChild(el("p", "hinweis", gesperrt
        ? "Noch kein Verlauf erfasst."
        : "Noch kein Verlauf erfasst. Mit «Neuer Eintrag» das erste Ereignis "
          + "festhalten — etwa einen Handwechsel, eine Reparatur oder den "
          + "Gang ins Lager."));
      return ziel;
    }

    const liste = el("ol", "vl-liste");
    for (const e of eintraege) {
      liste.appendChild(z.bearbeitet === e.id && !gesperrt
        ? bearbeitenZeile(ziel, o, z, eintraege, e, uebernehmen)
        : leseZeile(ziel, o, z, eintraege, e, gesperrt, uebernehmen));
    }
    ziel.appendChild(liste);
    return ziel;
  }


  /* ---------- Formular für einen neuen Eintrag ---------- */

  function neuFormular(ziel, o, z, eintraege, uebernehmen) {
    const kasten = el("div", "vl-formular");

    const datum = datumsfeld(z.datum || Modell.heuteIso());
    const text = textfeld(z.text, "Was ist passiert? Mehrere Zeilen sind erlaubt.");
    datum.addEventListener("input", function () { z.datum = datum.value; });
    text.addEventListener("input", function () { z.text = text.value; });

    const zeileOben = el("div", "vl-formular-zeile");
    const label = el("label", "vl-feldname", "Datum");
    label.appendChild(datum);
    zeileOben.appendChild(label);
    kasten.appendChild(zeileOben);
    kasten.appendChild(text);

    const fehler = el("p", "hinweis t-gefahr");
    fehler.hidden = true;
    kasten.appendChild(fehler);

    const knoepfe = el("div", "vl-knoepfe");
    knoepfe.appendChild(knopf("Hinzufügen", "knopf-primaer", function () {
      if (!text.value.trim()) {
        fehler.textContent = "Ohne Text hat der Eintrag keinen Nutzen.";
        fehler.hidden = false;
        text.focus();
        return;
      }
      if (!Modell.datumIsoGueltig(datum.value)) {
        fehler.textContent = "Bitte ein gültiges Datum wählen.";
        fehler.hidden = false;
        datum.focus();
        return;
      }
      z.offen = false;
      z.datum = "";
      z.text = "";
      uebernehmen(eintraege.concat([
        Modell.verlaufEintrag(datum.value, text.value.trim())
      ]));
    }));
    knoepfe.appendChild(knopf("Abbrechen", null, function () {
      z.offen = false;
      z.datum = "";
      z.text = "";
      zeichnen(ziel, o);
    }));
    kasten.appendChild(knoepfe);

    // Nach dem Öffnen gleich losschreiben können.
    setTimeout(function () { if (!z.text) text.focus(); }, 0);
    return kasten;
  }


  /* ---------- Ein Eintrag im Lesemodus ---------- */

  function leseZeile(ziel, o, z, eintraege, eintrag, gesperrt, uebernehmen) {
    const li = el("li", "vl-eintrag" + (eintrag.quelle === "sync" ? " vl-sync" : ""));

    const kopf = el("div", "vl-kopf");
    kopf.appendChild(el("span", "vl-datum",
      eintrag.datum ? Modell.datumSchweiz(eintrag.datum) : "ohne Datum"));

    const marke = el("span", "vl-quelle", eintrag.quelle === "sync" ? "Sync" : "manuell");
    marke.title = eintrag.quelle === "sync"
      ? "Vom Abgleich erzeugt. Lässt sich hier trotzdem ändern oder löschen — "
        + "der Abgleich hängt nur an."
      : "Von Hand im Frontend erfasst.";
    kopf.appendChild(marke);

    if (eintrag.erstellt) {
      const erfasst = el("span", "vl-erfasst", "erfasst " + Hilfe.datumZeitText(eintrag.erstellt));
      erfasst.title = "Zeitpunkt der Erfassung";
      kopf.appendChild(erfasst);
    }
    li.appendChild(kopf);

    li.appendChild(el("div", "vl-text", eintrag.text || "—"));

    if (gesperrt) return li;

    const knoepfe = el("div", "vl-aktionen");
    knoepfe.appendChild(knopf("Bearbeiten", "knopf-leise", function () {
      z.offen = false;
      z.bearbeitet = eintrag.id;
      zeichnen(ziel, o);
    }));
    knoepfe.appendChild(knopf("Löschen", "knopf-leise", function () {
      const wann = eintrag.datum ? Modell.datumSchweiz(eintrag.datum) : "ohne Datum";
      if (!window.confirm("Verlaufseintrag vom " + wann + " löschen?")) return;
      if (z.bearbeitet === eintrag.id) z.bearbeitet = null;
      uebernehmen(eintraege.filter(e => e.id !== eintrag.id));
    }));
    li.appendChild(knoepfe);
    return li;
  }


  /* ---------- Ein Eintrag im Bearbeitungsmodus ---------- */

  function bearbeitenZeile(ziel, o, z, eintraege, eintrag, uebernehmen) {
    const li = el("li", "vl-eintrag vl-bearbeitet"
      + (eintrag.quelle === "sync" ? " vl-sync" : ""));

    const datum = datumsfeld(eintrag.datum || Modell.heuteIso());
    const text = textfeld(eintrag.text, "");

    const kopf = el("div", "vl-kopf");
    const label = el("label", "vl-feldname", "Datum");
    label.appendChild(datum);
    kopf.appendChild(label);
    li.appendChild(kopf);
    li.appendChild(text);

    const fehler = el("p", "hinweis t-gefahr");
    fehler.hidden = true;
    li.appendChild(fehler);

    const knoepfe = el("div", "vl-aktionen");
    knoepfe.appendChild(knopf("Speichern", "knopf-primaer", function () {
      if (!text.value.trim()) {
        fehler.textContent = "Ohne Text hat der Eintrag keinen Nutzen.";
        fehler.hidden = false;
        text.focus();
        return;
      }
      if (!Modell.datumIsoGueltig(datum.value)) {
        fehler.textContent = "Bitte ein gültiges Datum wählen.";
        fehler.hidden = false;
        datum.focus();
        return;
      }
      z.bearbeitet = null;
      uebernehmen(eintraege.map(function (e) {
        if (e.id !== eintrag.id) return e;
        /* Quelle und Erfassungszeitpunkt bleiben: sie sagen, woher der
           Eintrag stammt, nicht wann er zuletzt angefasst wurde. */
        return Object.assign({}, e, { datum: datum.value, text: text.value.trim() });
      }));
    }));
    knoepfe.appendChild(knopf("Abbrechen", null, function () {
      z.bearbeitet = null;
      zeichnen(ziel, o);
    }));
    li.appendChild(knoepfe);

    setTimeout(function () { text.focus(); }, 0);
    return li;
  }


  return { zeichnen: zeichnen };
})();

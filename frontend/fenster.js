/* fenster.js — gemeinsames Gerüst der vier Detailseiten (Client, Benutzer,
   Telefonnummer, Software), gebaut auf Rahmen (rahmen.js) und UI
   (bausteine.js).

   Die Seiten teilen sich: Seitenkopf mit Zurück-Link, Titel, Teile-Zeile,
   Status und Schnellaktionen; die Bereiche in der Schublade; Lade-, Fehler-
   und Endzustand; Speicherleiste; Meldungen; Dialoge; Vorführ-Hinweis;
   automatisches Nachladen; Tastatur (Ctrl/Cmd+S, Esc) und den Schutz vor
   dem Verlassen mit ungespeicherten Änderungen. Das steht einmal hier.
   Dazu die Helfer, die früher in jeder Seite kopiert standen: Entwurf,
   Feld am Entwurf, Speicherablauf, Übernahme nach dem Schreiben (eTag),
   Löschdialog mit Eintippen, «beschäftigt».

   Was hier NICHT steht: die Bereiche und alles Fachliche. Das bleibt in
   der Seite; sie reicht dem Gerüst Rückrufe und Zustände hinein.

   HTML der Seite (Präfix z. B. «g»): body[data-seite] mit dem Rahmen-Gerüst
   (siehe rahmen.js) und in der Bahn
       <header class="seitenkopf" id="g-kopf"></header>
       <div class="fenster-bereich" id="g-bereich"></div>
   Dialog, Meldung und Speicherleiste baut das Gerüst selbst.

   ------------------------------------------------------------------
   API:  const F = Fenster.erstellen(praefix, { neuLaden, nachladen, liste })
   ------------------------------------------------------------------
   neuLaden()   lädt mit Ladezustand neu («Erneut laden»)
   nachladen()  lädt still nach und zeichnet neu (nach F.beschaeftigt, nach
                «Neu laden» bei einem Speicherkonflikt)
   liste        Schlüssel der Liste für den Zurück-Link («admin», «edu»,
                «benutzer», «telefone», «software»)

   Bauen tun die Seiten über UI.* (bausteine.js, rahmen.js); die früheren
   Hüllen F.el, F.knopf, F.toast, F.dialogOeffnen … gibt es nicht mehr
   (kein Baustein zweimal).
     F.melden(typ, id)                    BroadcastChannel an Hauptseite und Fenster
     F.verlaufAnhaengen(verlaufRoh, text) Eintrag von heute an einen Verlauf hängen
   Zustände:
     F.zeigeLaden(text, fortschritt)  F.fortschritt(text)
     F.zeigeFehler(titel, text, hinweis, knopfText, beiKlick)   F.zeigeInhalt() → Promise
       (ohne Schublade – die Tafel nimmt die ganze Breite –; der Zurück-Link
       zur Liste bleibt im Fehler- und Endzustand stehen)
     F.ladefehler(fehler, {titel, hinweis, knopfText})   Ladefehler zeigen: «nicht
       gefunden» (fehler.nichtGefunden oder status 404) mit titel/hinweis und «Zur
       Liste», sonst «Die Daten konnten nicht geladen werden» mit «Erneut laden»
     F.fehlerText(fehler) → Text
     F.stand(zeitpunkt?)   Kopf rechts: mit Zeitpunkt «Stand 12.10.2026, 05.15»
       (Datenstand des Datensatzes, wie auf der Hauptseite), ohne «Geladen 14.05»
       (wann diese Seite geladen hat) – «Stand» heisst überall Datenstand
   Kopf und Navigation:
     F.seitenkopf({pfad:{text, href}|listenSchluessel|null, titel, lead, unter:[teile]|text,
                   status:[knoten], aktionen:[knöpfe]})       an Ort und Stelle
     F.logoZeichnen(listenSchluessel)    Standard für den Zurück-Link
     F.navZeichnen(bereiche, aktiv, beiKlick, {verstecken, zusatz(b) → Zahl|Knoten})
     F.zeichneBereich(bereiche, aktiv) → schluessel   (hält Fokus, Schreibmarke, Rollen:
                                                      Rahmen.stillZeichnen)
     F.bereichWechseln(bereiche, schluessel) → Promise<schluessel>   (replaceState + Fade-through)
     F.hashBereich(bereiche)
   Speichern:
     F.entwurf(zeileHolen, {beiAenderung, leer: {Feld: Wert}, neu}) → {wert, textWert, setzeWert, anzahl,
                istGeaendert, leeren, aenderungen, istNeu}   (leer: wofür ein leerer gespeicherter
                Wert steht, z. B. {InDomaene: true}; ein Boolean ist sonst nie gleich «leer»;
                neu: true|fn – Neu-Modus, F.feld zeigt dann keinen Punkt «geändert»)
     F.feld(feld, {beschriftung, art='text', hinweis, zusatz, eingabe:{…UI.eingabe}, beiEingabe(w, k),
                entwurf, neu}) → div.datenzeile-form (.feld = Steuerelement)
                Feld am Entwurf: id «<p>-eingabe-<Feld>», Wert aus dem Entwurf, jede Eingabe
                hinein, Punkt «geändert» an Ort und Stelle (im Neu-Modus keiner)
                art 'ankreuzen': Kontrollkästchen (UI.ankreuzen, eingabe:{text, …}), Entwurf mit
                true/false; ein leerer gespeicherter Wert gilt als leer[Feld] des Entwurfs, ohne
                Angabe als Nein; .feld = das Kästchen
     F.uebernehmen(zeile, felder, antwort) → zeile   nach Daten.speichern: Felder UND
                das neue eTag (antwort.__etag) in die lokale Zeile
     F.speicherleisteZeichnen({neuModus, geloescht, speichertGerade, speicherFehler, anzahl, neuText, meta})
     F.speicherAblauf({pruefen, schreiben, nachladen, erfolgText, fehlerText, anzahl, zeichnen, immer})
                → Promise<boolean>   (immer: auch ohne Änderungen, z. B. «Anlegen»)
     F.beschaeftigt(fn, {nachladen}) → Promise   F.istBeschaeftigt()
     F.verwerfen({anzahl, neuModus, danach}) → Promise<boolean>   Rückfrage mit einheitlichen
                Worten («2 Änderungen verwerfen?» / «Formular leeren?»), danach() und leise Meldung
     F.loeschenDialog({titel, text, warnung, wort, knopfText, beiLoeschen, ende:{titel, text, hinweis}})
     F.geloescht()
   Rahmen:
     F.bandZeichnen(text, beiZuruecksetzen)   F.kontoZeigen(konto?)   F.zurListe()
     F.autoStarten(erlaubt, nachladen)   still nachladen; «nicht gefunden» (im anderen
                Tab gelöscht) zeigt den Endzustand «Inzwischen gelöscht»
     F.ereignisse({speichern, verwerfen, anzahlAenderungen, verlassenFrei, beiHash})
                Leiste, Ctrl/Cmd+S, Esc, Hash, Schutz vor dem Verlassen (auch mit
                halb getipptem Verlauf-Eintrag, Verlauf.offeneEingabe)

   Grundsätze wie überall: kein Framework, kein innerHTML mit Daten. */

"use strict";

const Fenster = (function () {

  /* Kurzformen für das Gerüst selbst (keine Ausgabe an die Seiten: die
     bauen über UI.*; die früheren Hüllen F.el, F.knopf … sind entfallen). */
  const $ = UI.$;
  const el = UI.el;
  const leeren = UI.leeren;
  const anhaengen = UI.anhaengen;
  const text = UI.text;
  const gleichwertig = UI.gleichwertig;

  /* Einen Eintrag von heute an einen Verlauf anhängen; gibt den neuen
     Spaltentext zurück (automatische Einträge: Statuswechsel, Inhaber …). */
  function verlaufAnhaengen(verlaufRoh, textZeile) {
    const liste = Modell.verlaufLesen(verlaufRoh);
    liste.push(Modell.verlaufEintrag("", textZeile));
    return Modell.verlaufSchreiben(liste);
  }

  /* ---------- Meldung an die Hauptseite und die anderen Fenster ---------- */

  function melden(typ, id) {
    try {
      const kanal = new BroadcastChannel(KONFIG.kanalName);
      kanal.postMessage({ typ: typ, id: id === undefined ? null : String(id) });
      kanal.close();
    } catch (e) {
      // Ohne BroadcastChannel bleibt die Hauptseite bis zum nächsten Takt alt.
    }
  }

  function fehlerText(fehler) {
    return fehler && fehler.message ? fehler.message : String(fehler || "");
  }

  /* ==================================================================
     Das Gerüst einer Seite
     ================================================================== */

  function erstellen(praefix, optionen) {
    const o = optionen || {};
    const p = praefix + "-";
    const mockModus = UI.adresse.mock();

    const F = { melden: melden, verlaufAnhaengen: verlaufAnhaengen };

    let listeSchluessel = o.liste || null;
    let geloescht = false;
    F.geloescht = function () { return geloescht; };

    /* ---------- Behälter in der Bahn ---------- */

    function bahn() { return $("inhalt") || document.body; }

    function bereichEl() {
      let b = $(p + "bereich");
      if (!b) {
        b = el("div", "fenster-bereich");
        b.id = p + "bereich";
        bahn().appendChild(b);
      }
      b.classList.add("fenster-bereich");
      if (b.hidden) b.hidden = false;
      return b;
    }

    /* ==================================================================
       Lade-, Fehler- und Inhaltszustand
       ================================================================== */

    F.zeigeLaden = function (meldung, fortschrittText) {
      return Rahmen.zustand("laden", { text: meldung || "Wird geladen …", fortschritt: fortschrittText || "" });
    };

    F.fortschritt = function (textZeile) {
      if (Rahmen.zustandJetzt() !== "laden") return;   // stilles Nachladen zeigt nichts
      Rahmen.zustand("laden", { fortschritt: textZeile || "" });
    };

    /* Fehler C6: Titel und Dokumenttitel nennen den Fehler, nicht mehr
       «… wird geladen …». Ohne Datensatz gibt es keine Bereiche: die Seite
       steht ohne Schublade da wie im Neu-Modus (Tafel volle Breite) – eine
       leere Schublade bzw. ein Menüknopf, der eine leere öffnet, hülfe
       niemandem. */
    F.zeigeFehler = function (titel, meldung, hinweis, knopfText, beiKlick) {
      UI.speicherleiste().setzen({ sichtbar: false });
      F.navZeichnen([], null, null, { verstecken: true });
      return Rahmen.zustand("fehler", {
        titel: titel, text: meldung, hinweis: hinweis, knopfText: knopfText,
        beiKlick: beiKlick || o.neuLaden || function () { location.reload(); },
        pfad: listenPfad()
      });
    };

    F.zeigeInhalt = function () { return Rahmen.zustand("inhalt"); };

    F.fehlerText = fehlerText;

    /* Ein Ladefehler, für alle Detailseiten gleich: Gibt es den Datensatz
       nicht (fehler.nichtGefunden oder HTTP 404), führt der Knopf zur Liste;
       sonst lädt er erneut. ol: { titel, hinweis, knopfText } für «nicht
       gefunden» («Telefonnummer nicht gefunden», wohin Gelöschtes geht). */
    F.ladefehler = function (fehler, optionenFehler) {
      const ol = optionenFehler || {};
      if (fehler && (fehler.nichtGefunden || fehler.status === 404)) {
        return F.zeigeFehler(ol.titel || "Nicht gefunden", fehlerText(fehler), ol.hinweis || "",
          ol.knopfText || "Zur Liste", function () { F.zurListe(); });
      }
      return F.zeigeFehler("Die Daten konnten nicht geladen werden", fehlerText(fehler),
        mockModus ? "" : "Zum Anschauen ohne Anmeldung die Adresse mit «&mock=1» aufrufen.", "Erneut laden");
    };

    /* Rechts im Kopf. «Stand …» heisst auf allen Seiten der Datenstand (die
       Hauptseite: letzter SCCM-Abgleich): mit «zeitpunkt» übergibt die Seite
       den Stand ihres Datensatzes. Ohne zeigt der Kopf, wann diese Seite die
       Daten geladen hat – als «Geladen 14.05», nie als «Stand»: sonst wirkten
       dieselben Daten im Detailfenster neuer als in der Liste. Der Tooltip
       sagt, dass die Seite still nachlädt (F.autoStarten). */
    F.stand = function (zeitpunkt) {
      const takt = "Das Fenster lädt alle " + Math.round(KONFIG.autoTaktMs / 60000)
        + " Minuten still nach, solange nichts ungespeichert ist.";
      if (zeitpunkt) {
        Rahmen.stand("Stand " + UI.zeitText(zeitpunkt), "Stand der Daten. " + takt);
        return;
      }
      const jetzt = UI.zeitText(new Date());
      Rahmen.stand("Geladen " + (jetzt.split(", ")[1] || jetzt), "Geladen am " + jetzt + ". " + takt);
    };

    /* ==================================================================
       Seitenkopf an Ort und Stelle
       ================================================================== */

    let kopf = null;
    /** Knöpfe, die bei gleicher Gestalt stehen bleiben, übernehmen den
        beiKlick-Handler des zuletzt übergebenen Knopfs (UI.knopfUebernehmen:
        ev.currentTarget ist dann der sichtbare Knopf). Nur wo das nicht geht
        (Handler per addEventListener statt beiKlick), leiten sie den Klick an
        den übergebenen Knopf weiter – dort ist ev.currentTarget der
        unsichtbare neue Knopf (api.md §8). */
    const weiterleitung = new WeakMap();

    function kopfSichern() {
      if (kopf) return kopf;
      let wurzel = $(p + "kopf");
      if (!wurzel) {
        wurzel = el("header", "seitenkopf");
        wurzel.id = p + "kopf";
        const b = $(p + "bereich");
        if (b && b.parentNode) b.parentNode.insertBefore(wurzel, b);
        else bahn().appendChild(wurzel);
      }
      // Der Bauer ist derselbe wie für die Ansichten der Hauptseite
      // (UI.seitenkopf, rahmen.js); hier wird er nur an Ort und Stelle
      // nachgeführt (Signaturen unten), statt ihn neu zu bauen.
      const k0 = UI.seitenkopf({ element: wurzel, titelId: p + "titel" }).knoten;
      const pfad = k0.pfad, pfadText = k0.pfadText, titel = k0.titel, unter = k0.unter;
      const status = k0.status, aktionen = k0.aktionen;

      aktionen.addEventListener("click", function (ev) {
        const k = ev.target && ev.target.closest ? ev.target.closest("button, a") : null;
        if (!k || !aktionen.contains(k)) return;
        if (beschaeftigtZahl > 0) {   // Fehler A8: keine Aktion, solange geschrieben wird
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        const ziel = weiterleitung.get(k);
        if (ziel && ziel !== k && k.tagName === "BUTTON") {
          ev.preventDefault();
          ev.stopPropagation();
          ziel.click();
        }
      }, true);

      kopf = { wurzel: wurzel, pfad: pfad, pfadText: pfadText, titel: titel, unter: unter,
        status: status, aktionen: aktionen, unterSig: null, statusSig: null, pfadGesetzt: false };
      return kopf;
    }

    /* Der Zurück-Link zur gemerkten Liste (auch für den Fehlerzustand). */
    function listenPfad() {
      if (!listeSchluessel) return null;
      return { text: Rahmen.zielText(listeSchluessel), href: UI.adresse.zurueckZurListe(listeSchluessel) };
    }

    function pfadSetzen(wert) {
      const k = kopfSichern();
      k.pfadGesetzt = true;
      let ziel = wert;
      if (typeof ziel === "string") ziel = { text: Rahmen.zielText(ziel), href: UI.adresse.zurueckZurListe(ziel) };
      if (!ziel) { k.pfad.hidden = true; return; }
      UI.textSetzen(k.pfadText, ziel.text || (listeSchluessel ? Rahmen.zielText(listeSchluessel) : "Übersicht"));
      const href = ziel.href || UI.adresse.zurueckZurListe(listeSchluessel || "uebersicht");
      if (k.pfad.getAttribute("href") !== href) k.pfad.setAttribute("href", href);
      k.pfad.hidden = false;
    }

    /* Die Gestalt eines Kopfknopfs OHNE seine Sperre: weder die Sperre mit
       Grund (UI.knopfSperren – aria-disabled und der Grund als Tooltip)
       noch die eigene von F.beschaeftigt (data-f-gesperrt) zählen. Beide
       wechseln an Ort und Stelle (sperreUebernehmen, sperrenAnwenden);
       sonst baute jede erste Taste in einem Feld («Löschen …» wird
       gesperrt) die Knöpfe neu, und ein Fokus darauf ginge verloren. Ein
       aria-disabled, das die Seite selbst setzt (ohne Grund), zählt weiter. */
    function knopfSignatur(k) {
      const sperre = UI.knopfSperre(k);
      const ariaAus = k.hasAttribute("data-f-gesperrt") || sperre.grund ? "" : (k.getAttribute("aria-disabled") || "");
      return [k.tagName, k.className, k.textContent, k.disabled ? "1" : "0", ariaAus,
        k.getAttribute("title") || sperre.tipp,
        k.getAttribute("aria-pressed") || "", k.getAttribute("href") || "", k.hidden ? "1" : "0"].join("|");
    }

    /* Der stehende Knopf übernimmt die Sperre mit Grund des neuen (oder gibt
       sie auf). Hatte F.beschaeftigt ihn gesperrt, gehört aria-disabled ab
       jetzt der Seite – sonst höbe das Ende der Arbeit ihre Sperre mit auf.
       Ist noch Arbeit im Gang, sperrt sperrenAnwenden danach wieder. */
    function sperreUebernehmen(alt, neu) {
      const grund = UI.knopfSperre(neu).grund;
      if (grund && alt.hasAttribute("data-f-gesperrt")) alt.removeAttribute("data-f-gesperrt");
      UI.knopfSperren(alt, grund);
    }

    /* Knöpfe nur neu, wenn sich ihre Menge oder Gestalt ändert (nicht bei
       jedem Tastendruck, nicht beim Wechsel der Sperre); sonst bleiben die
       alten stehen — mit Fokus, Tooltip und Zustandsebene —, übernehmen die
       Handler der neuen und schalten nur ihre Sperre um. */
    function aktionenAbgleichen(behaelter, neue) {
      const liste = (neue || []).filter(Boolean);
      const alte = Array.from(behaelter.children);
      const gleich = alte.length === liste.length && alte.every(function (a, i) {
        return knopfSignatur(a) === knopfSignatur(liste[i]);
      });
      if (gleich) {
        alte.forEach(function (a, i) {
          if (UI.knopfUebernehmen(a, liste[i])) weiterleitung.delete(a);
          else weiterleitung.set(a, liste[i]);
          sperreUebernehmen(a, liste[i]);
        });
      } else {
        const aktiv = document.activeElement;
        const fokusText = aktiv && behaelter.contains(aktiv) ? aktiv.textContent : null;
        leeren(behaelter);
        anhaengen(behaelter, liste);
        if (fokusText !== null) {
          const nachfolger = liste.filter(function (k) { return k.textContent === fokusText && !k.disabled; })[0]
            || liste.filter(function (k) { return !k.disabled; })[0];
          if (nachfolger) nachfolger.focus({ preventScroll: true });
          else $(p + "titel").focus({ preventScroll: true });
        }
      }
      sperrenAnwenden();
    }

    /* Gestalt eines Knotens samt Kindern: Tag, Attribute, Text – so genau
       wie sein Markup, aber ohne die Markup-Schnittstellen (innerHTML,
       outerHTML …), die im ganzen Frontend nicht vorkommen sollen
       (code\Pruefe-Frontend.ps1). */
    function knotenGestalt(k) {
      if (!k || !k.nodeType) return String(k);
      if (k.nodeType === 3) return k.nodeValue;
      if (k.nodeType !== 1) return "";
      let s = "<" + k.tagName;
      for (const a of Array.from(k.attributes)) s += " " + a.name + "=" + a.value;
      s += ">";
      for (const c of Array.from(k.childNodes)) s += knotenGestalt(c);
      return s + "</" + k.tagName + ">";
    }

    function knotenSignatur(liste) {
      return (liste || []).filter(Boolean).map(knotenGestalt).join("\u0000");
    }

    F.seitenkopf = function (w) {
      const s = w || {};
      const k = kopfSichern();
      if (Object.prototype.hasOwnProperty.call(s, "pfad")) pfadSetzen(s.pfad);
      else if (!k.pfadGesetzt && listeSchluessel) pfadSetzen(listeSchluessel);
      if (s.titel !== undefined) {
        UI.textSetzen(k.titel, s.titel);
        if (s.titel) Rahmen.dokumentTitel(s.titel);
      }
      // Der Lead sagt, was man im gezeigten Bereich tut (nur bei Änderung).
      if (s.lead !== undefined) k.wurzel.setzen({ lead: s.lead || "" });
      if (s.unter !== undefined) {
        const teile = Array.isArray(s.unter) ? s.unter.filter(function (t) { return t !== null && t !== undefined && t !== ""; })
          : (s.unter ? [s.unter] : []);
        const sig = teile.map(function (t) { return t && t.nodeType ? t.textContent : String(t); }).join("\u0000");
        if (sig !== k.unterSig) {
          k.unterSig = sig;
          leeren(k.unter);
          if (teile.length) k.unter.appendChild(UI.teile(teile));
        }
      }
      if (s.status !== undefined) {
        const sig = knotenSignatur(s.status);
        if (sig !== k.statusSig) {
          k.statusSig = sig;
          leeren(k.status);
          anhaengen(k.status, (s.status || []).filter(Boolean));
        }
      }
      if (s.aktionen !== undefined) aktionenAbgleichen(k.aktionen, s.aktionen);
      return k.wurzel;
    };

    F.logoZeichnen = function (schluessel) {
      listeSchluessel = schluessel || listeSchluessel;
      const k = kopfSichern();
      if (!k.pfadGesetzt && listeSchluessel) pfadSetzen(listeSchluessel);
    };

    F.zurListe = function () {
      location.href = UI.adresse.zurueckZurListe(listeSchluessel || "uebersicht");
    };

    /* ==================================================================
       Navigation und Bereiche
       ================================================================== */

    function zusatzZahl(z) {
      if (z === null || z === undefined || z === false) return null;
      if (typeof z === "number" || typeof z === "string") return z;
      if (z.textContent !== undefined) return z.textContent.trim() || null;
      return null;
    }

    /* bereiche: [{ k, d, f(ziel), gruppe?, sinnbild? }]. Aufeinanderfolgende
       Bereiche mit gleicher «gruppe» bilden eine Gruppe (Satzschreibung). */
    F.navZeichnen = function (bereiche, aktiv, beiKlick, optionenNav) {
      const on = optionenNav || {};
      const gruppen = [];
      let letzte = null;
      for (const b of bereiche || []) {
        const titel = b.gruppe || "";
        if (!letzte || letzte.titel !== titel) {
          letzte = { titel: titel, eintraege: [] };
          gruppen.push(letzte);
        }
        // Ein echter Link: Mittel- und Ctrl-Klick öffnen den Bereich im neuen Tab.
        const e = { schluessel: b.k, text: b.d, sinnbild: b.sinnbild, href: "#" + b.k };
        if (on.zusatz) e.zahl = zusatzZahl(on.zusatz(b));
        letzte.eintraege.push(e);
      }
      Rahmen.navigation({
        gruppen: gruppen, aktiv: aktiv, label: on.label || "Bereiche", verstecken: !!on.verstecken,
        beiWahl: typeof beiKlick === "function" ? function (k) { beiKlick(k); } : null
      });
    };

    let gezeigterBereich = null;

    /* Zeichnet den aktiven Bereich und gibt seinen Schlüssel zurück. Wird
       derselbe Bereich neu gezeichnet (Tippen, Schalter, Nachladen), läuft
       das über Rahmen.stillZeichnen: Fokus (über data-fokus ODER id, sonst
       dieselbe Stelle), Schreibmarke und Rollpositionen (Tafel und innere
       Roller mit id/data-fokus/data-rolle) kommen zurück — Fehler C2. Kein
       Auftritt: animiert wird nur beim Bereichswechsel (F.bereichWechseln). */
    F.zeichneBereich = function (bereiche, aktiv) {
      const ziel = bereichEl();
      const bereich = (bereiche || []).filter(function (b) { return b.k === aktiv; })[0] || (bereiche || [])[0];
      const schluessel = bereich ? bereich.k : null;
      const derselbe = schluessel !== null && schluessel === gezeigterBereich;
      const bauen = function () {
        leeren(ziel);
        // Die alten Zeilen aus F.feld sind jetzt ausgehängt: vergessen.
        feldZeilen = feldZeilen.filter(function (e) { return e.zeile.isConnected; });
        if (bereich) bereich.f(ziel);
      };
      if (derselbe) Rahmen.stillZeichnen(ziel, bauen);
      else bauen();
      gezeigterBereich = schluessel;
      return schluessel;
    };

    /** Wechsel, deren Ausblenden (100 ms) noch läuft: so lange ist der
        gezeichnete Bereich nicht der, der gleich zu sehen sein wird. */
    let offeneWechsel = 0;

    /* Bereichswechsel (Fehler A4): replaceState statt neuem Verlaufseintrag,
       die Pille gleitet, der Bereich blendet durch und staffelt seine Karten.
       Hin und gleich zurück (A → B → A innerhalb des Ausblendens): auch der
       gezeigte Bereich geht dann durch Rahmen.wechseln – dessen Marke
       verwirft den Wechsel nach B, sonst stünde B im Inhalt, Pille und
       Adresse aber auf A. */
    F.bereichWechseln = function (bereiche, schluessel) {
      const gueltig = (bereiche || []).some(function (b) { return b.k === schluessel; });
      const k = gueltig ? schluessel : ((bereiche || [])[0] || {}).k;
      if (k === undefined || k === null) return Promise.resolve(null);
      try {
        history.replaceState(history.state, "", location.pathname + location.search + "#" + k);
      } catch (e) { /* file:// u. ä. */ }
      Rahmen.aktiv(k);
      if (k === gezeigterBereich && offeneWechsel === 0) return Promise.resolve(k);
      const ziel = bereichEl();
      offeneWechsel += 1;
      return Rahmen.wechseln(function () {
        F.zeichneBereich(bereiche, k);
        return ziel;
      }, { alt: ziel }).then(function () {
        offeneWechsel -= 1;
        return k;
      }, function (fehler) {
        offeneWechsel -= 1;
        throw fehler;
      });
    };

    F.hashBereich = function (bereiche) {
      const h = (location.hash || "").replace(/^#/, "");
      return h && (bereiche || []).some(function (b) { return b.k === h; }) ? h : null;
    };

    /* ==================================================================
       Entwurf (früher viermal kopiert)
       ================================================================== */

    /* oe.leer: { Feld: Wert } – wofür ein LEERER gespeicherter Wert steht
       (z. B. { InDomaene: true }: die Seite zeigt leer als «Ja»). Nur für
       den Vergleich; wert() gibt weiter den gespeicherten Wert zurück. */
    /** Das zuletzt bearbeitete Bedienelement (Selektor) und Feld: dorthin
        geht der Fokus, wenn er in der Speicherleiste steht und sie geht. */
    let letzteStelle = null;
    let letztesFeld = null;
    /** Der zuletzt erstellte Entwurf (Standard für F.feld). */
    let standardEntwurf = null;
    /** Innenleben jedes Entwurfs für F.feld (kein Teil der API): was ein
        leerer gespeicherter Wert bedeutet, und der gezeigte Wert. */
    const entwurfInnen = new WeakMap();

    function stelleVon(k) {
      if (!k || !k.getAttribute) return null;
      const df = k.getAttribute("data-fokus");
      if (df) return "[data-fokus=\"" + CSS.escape(df) + "\"]";
      return k.id ? "#" + CSS.escape(k.id) : null;
    }

    F.entwurf = function (zeileHolen, optionenEntwurf) {
      const oe = typeof optionenEntwurf === "function" ? { beiAenderung: optionenEntwurf } : (optionenEntwurf || {});
      // Eine Kopie: F.feld trägt für Kästchen «leer heisst Nein» nach.
      const leer = Object.assign({}, oe.leer || {});
      let daten = {};
      function zeile() { return typeof zeileHolen === "function" ? zeileHolen() : null; }
      function hat(feld) { return Object.prototype.hasOwnProperty.call(daten, feld); }
      function wert(feld) {
        if (hat(feld)) return daten[feld];
        const z = zeile();
        return z ? z[feld] : "";
      }
      function gespeichertWieGezeigt(feld) {
        const z = zeile();
        const w = z ? z[feld] : "";
        const istLeer = w === null || w === undefined || w === "";
        return istLeer && Object.prototype.hasOwnProperty.call(leer, feld) ? leer[feld] : w;
      }
      const api = {
        /** Der anzuzeigende Wert: Entwurf schlägt gespeicherten Wert. */
        wert: wert,
        textWert: function (feld) { return text(wert(feld)); },
        /** Ein Hin und Her zurück auf den gespeicherten Wert gilt als unverändert. */
        setzeWert: function (feld, neuerWert) {
          if (gleichwertig(gespeichertWieGezeigt(feld), neuerWert)) delete daten[feld];
          else daten[feld] = neuerWert;
          fehlerOffen = false;
          letztesFeld = feld;
          const a = document.activeElement;
          if (a && a !== document.body && bahn().contains(a)) letzteStelle = stelleVon(a) || letzteStelle;
          if (typeof oe.beiAenderung === "function") oe.beiAenderung(feld);
          feldZeilenMarkieren();
        },
        anzahl: function () { return Object.keys(daten).length; },
        istGeaendert: hat,
        leeren: function () { daten = {}; feldZeilenMarkieren(); },
        aenderungen: function () { return Object.assign({}, daten); },
        /** Neu-Modus (Option «neu»: true oder Funktion)? */
        istNeu: function () { return typeof oe.neu === "function" ? !!oe.neu() : !!oe.neu; }
      };
      entwurfInnen.set(api, {
        leer: leer,
        /* So, wie die Seite den Wert zeigt: Entwurf, sonst gespeichert –
           ein leerer gespeicherter Wert als das, wofür er steht. */
        gezeigt: function (feld) { return hat(feld) ? daten[feld] : gespeichertWieGezeigt(feld); }
      });
      standardEntwurf = api;
      return api;
    };

    /* ==================================================================
       Feld am Entwurf (früher je Seite kopiert: formFeld/textEingabe,
       feldEingabe, eingabeFuer/auswahlFuer, inline)
       ================================================================== */

    /** Zeilen aus F.feld, deren Punkt «geändert» dem Entwurf folgt. */
    let feldZeilen = [];

    function feldNeu(eintrag) {
      if (eintrag.neu !== undefined) return typeof eintrag.neu === "function" ? !!eintrag.neu() : !!eintrag.neu;
      return eintrag.entwurf.istNeu ? eintrag.entwurf.istNeu() : false;
    }

    function feldZeileMarkieren(eintrag) {
      const an = !feldNeu(eintrag) && eintrag.entwurf.istGeaendert(eintrag.feld);
      if (eintrag.zeile.classList.contains("geaendert") !== an) eintrag.zeile.classList.toggle("geaendert", an);
    }

    /* An Ort und Stelle, nach jeder Änderung im Entwurf (auch einer, die
       nicht aus dem Feld selbst kommt: Kurzwahl → Nummer, Verwerfen). */
    function feldZeilenMarkieren() {
      for (const e of feldZeilen) if (e.zeile.isConnected) feldZeileMarkieren(e);
    }

    /* Ein Feld der Liste, an den Entwurf gebunden: das Steuerelement über
       UI.eingabe mit der id «<p>-eingabe-<Feld>» (Fokus beim Neuzeichnen,
       Feldfehler aus F.speicherAblauf), Wert aus dem Entwurf, jede Eingabe
       in den Entwurf; die Zeile (UI.formZeile) zeigt den Punkt «geändert»
       an Ort und Stelle – im Neu-Modus nie (dort ist alles neu).
       of: { beschriftung, art = 'text' ('auswahl' meldet beim Ändern),
             hinweis, zusatz, eingabe: { weitere Optionen für UI.eingabe:
             werte, leer, vorschlaege, platzhalter, zeilen, schmal, … },
             beiEingabe(wert, feldKnoten) nach dem Eintrag in den Entwurf,
             entwurf (Standard: der zuletzt erstellte), neu (true|fn; Standard:
             Option «neu» des Entwurfs) }
       → div.datenzeile-form mit .feld (das Steuerelement).
       Ein Zahlenfeld mit unlesbarer Eingabe («1e», «-») meldet "" – das
       heisst nicht «leer»: der Entwurf behält dann den letzten lesbaren
       Wert (die Seite prüft das Feld in pruefen()).
       art 'ankreuzen': ein Kontrollkästchen (UI.ankreuzen; eingabe: { text,
       klein, … } gehen dorthin). Der Entwurf bekommt true/false; gezeigt
       wird der Wert so, wie der Entwurf vergleicht – ein leerer
       gespeicherter Wert steht für leer[Feld] aus F.entwurf (z. B.
       { InDomaene: true }), ohne Angabe für «Nein». Ein Hin und Her ist
       darum keine Änderung. .feld ist das <input type=checkbox>. */
    F.feld = function (feld, optionenFeld) {
      const of = optionenFeld || {};
      const ent = of.entwurf || standardEntwurf;
      if (!ent) throw new Error("F.feld: zuerst F.entwurf(…) anlegen.");
      const art = of.art || "text";
      const eintragen = function (w, k) {
        if (k && k.validity && k.validity.badInput) return;
        ent.setzeWert(feld, w);
        if (typeof of.beiEingabe === "function") of.beiEingabe(w, k);
      };
      const id = p + "eingabe-" + feld;
      let steuer;
      let knoten;
      if (art === "ankreuzen") {
        const innen = entwurfInnen.get(ent);
        if (innen && !Object.prototype.hasOwnProperty.call(innen.leer, feld)) innen.leer[feld] = false;
        const gezeigt = innen ? innen.gezeigt(feld) : ent.wert(feld);
        knoten = UI.ankreuzen(Object.assign({ id: id, an: Hilfe.istJa(gezeigt) }, of.eingabe || {},
          { beiAenderung: eintragen }));
        steuer = knoten.eingabe;
      } else {
        const optionen = Object.assign({ art: art, id: id, wert: ent.textWert(feld) }, of.eingabe || {});
        if (art === "auswahl") optionen.beiAenderung = eintragen;
        else optionen.beiEingabe = eintragen;
        steuer = UI.eingabe(optionen);
        knoten = steuer;
      }
      const eintrag = { feld: feld, entwurf: ent, neu: of.neu, zeile: null };
      eintrag.zeile = UI.formZeile(of.beschriftung || feld, knoten, {
        geaendert: !feldNeu(eintrag) && ent.istGeaendert(feld), hinweis: of.hinweis, zusatz: of.zusatz
      });
      eintrag.zeile.feld = steuer;
      feldZeilen.push(eintrag);
      return eintrag.zeile;
    };

    /* Nach Daten.speichern: die geschriebenen Felder UND das neue eTag in
       die lokale Zeile. Ohne das eTag schickte der nächste Speicherversuch
       das alte mit (wenn das Nachladen danach scheitert, zeichnet
       F.speicherAblauf aus dem lokalen Stand) und SharePoint meldete 412
       «Konflikt», obwohl niemand anders geschrieben hat.
       antwort: Ergebnis von Daten.speichern (trägt __etag). */
    F.uebernehmen = function (zeileObjekt, felder, antwort) {
      if (!zeileObjekt) return zeileObjekt;
      Object.assign(zeileObjekt, felder || {});
      const etag = antwort && (antwort.__etag || antwort["@odata.etag"]);
      if (etag) zeileObjekt.__etag = String(etag);
      return zeileObjekt;
    };

    /* ==================================================================
       Speicherleiste, beschäftigt, Speicherablauf
       ================================================================== */

    let letzteLeiste = null;
    let speichertIntern = false;
    let fehlerOffen = false;
    let beschaeftigtZahl = 0;

    function leiste() { return UI.speicherleiste(); }

    function leisteZeichnen() {
      if (!letzteLeiste) return;
      const z = letzteLeiste;
      const anzahl = z.anzahl || 0;
      const speichert = !!z.speichertGerade || speichertIntern;
      const zeigen = !geloescht && !z.geloescht && (!!z.neuModus || anzahl > 0 || speichert);
      let t;
      if (speichert) t = "Wird gespeichert …";
      else if (z.neuModus) {
        t = anzahl === 0 ? (z.neuText || "Neu") + " – noch nicht angelegt"
          : anzahl + (anzahl === 1 ? " Angabe" : " Angaben") + " erfasst";
      } else {
        t = anzahl === 1 ? "1 Änderung" : anzahl + " Änderungen";
      }
      const fehler = !!z.speicherFehler || fehlerOffen;
      leiste().setzen({
        text: t,
        meta: z.meta || "",
        speichernText: fehler ? "Nochmals speichern" : (z.neuModus ? "Anlegen" : "Speichern"),
        verwerfenText: z.neuModus ? "Formular leeren" : "Verwerfen",
        beschaeftigt: speichert,
        speichernAus: (!z.neuModus && anzahl === 0) || (beschaeftigtZahl > 0 && !speichert),
        verwerfenAus: speichert || anzahl === 0 || beschaeftigtZahl > 0,
        sichtbar: zeigen
      });
    }

    /* z: { neuModus, geloescht, speichertGerade, speicherFehler, anzahl, neuText, meta }.
       Wird bei jedem Tastendruck aufgerufen: ändert nur Texte und Zustände;
       Ein- und Austritt spielen nur, wenn die Leiste kommt oder geht. Fehler
       stehen nicht rot in der Leiste, sondern als Meldung darüber (E1). */
    F.speicherleisteZeichnen = function (z) {
      letzteLeiste = Object.assign({}, z || {});
      leisteZeichnen();
    };

    function sperrenAnwenden() {
      const gesperrt = beschaeftigtZahl > 0;
      if (kopf) {
        for (const k of Array.from(kopf.aktionen.querySelectorAll("button, a"))) {
          if (gesperrt) {
            if (k.getAttribute("aria-disabled") !== "true") {
              k.setAttribute("aria-disabled", "true");
              k.setAttribute("data-f-gesperrt", "");
            }
          } else if (k.hasAttribute("data-f-gesperrt")) {
            k.removeAttribute("aria-disabled");
            k.removeAttribute("data-f-gesperrt");
          }
        }
      }
      leisteZeichnen();
    }

    F.istBeschaeftigt = function () { return beschaeftigtZahl > 0; };

    /* Sperrt Schnellaktionen und Speicherleiste, solange fn läuft (Fehler
       A8), und lädt danach still nach — auch nach einem Fehler, damit kein
       veraltetes eTag stehen bleibt. Ein zweiter Aufruf während des ersten
       wird verworfen (Doppelklick). */
    F.beschaeftigt = async function (fn, optionenB) {
      const ob = optionenB || {};
      if (beschaeftigtZahl > 0) return undefined;
      beschaeftigtZahl += 1;
      sperrenAnwenden();
      try {
        // Ein stilles Nachladen (F.autoStarten), das noch unterwegs ist,
        // kommt zuerst an: seine ältere Antwort überschriebe sonst nach dem
        // Schreiben den eben gespeicherten Stand samt eTag (der nächste
        // Speicherversuch scheiterte mit 412).
        if (autoLauf) await autoLauf;
        return await fn();
      } finally {
        const nl = ob.nachladen === false ? null
          : (typeof ob.nachladen === "function" ? ob.nachladen : o.nachladen);
        try {
          if (typeof nl === "function") await nl();
        } catch (fehler) {
          UI.meldung("Der neue Stand konnte nicht geladen werden. Er erscheint beim nächsten "
            + "automatischen Nachladen.", { ton: "info" });
        } finally {
          beschaeftigtZahl -= 1;
          sperrenAnwenden();
        }
      }
    };

    /* ---------- Feldfehler ---------- */

    function feldFehlerLeeren() {
      for (const f of Array.from(document.querySelectorAll("[data-f-ungueltig]"))) {
        UI.feldFehler(f, "");
        f.removeAttribute("data-f-ungueltig");
      }
    }

    /* Ein Prüffehler steht am Feld (Rahmen + Hinweis mit Icon, UI.feldFehler),
       das Feld bekommt den Fokus. Ist das Feld nicht zu sehen (anderer
       Bereich), erscheint der Text als Meldung. */
    function feldKnoten(name) {
      if (name === null || name === undefined || name === "") return null;
      return $(p + "eingabe-" + name)
        || document.querySelector("[data-feld=\"" + CSS.escape(String(name)) + "\"]");
    }

    /* Wohin der Fokus geht, wenn er in der Speicherleiste steht und sie
       verschwindet oder ihr Knopf gesperrt wird (rahmen.js): zum zuletzt
       bearbeiteten Bedienelement, sonst zu seinem Feld, sonst zum Titel. */
    function fokusNachLeiste() {
      const bereit = function (k) {
        return !!k && k.isConnected && !k.disabled && !k.closest("[inert]") && k.getClientRects().length > 0;
      };
      let k = letzteStelle ? bahn().querySelector(letzteStelle) : null;
      if (!bereit(k)) k = feldKnoten(letztesFeld);
      if (!bereit(k)) k = $(p + "titel");
      return bereit(k) ? k : null;
    }

    function feldFehlerZeigen(pruefung) {
      const t = typeof pruefung === "string" ? pruefung : (pruefung.text || "Bitte die Eingaben prüfen.");
      const name = typeof pruefung === "object" ? pruefung.feld : null;
      const feld = name ? feldKnoten(name) : null;
      if (!feld || !feld.getClientRects().length) {
        UI.meldung(t, { ton: "fehler" });
        return;
      }
      UI.feldFehler(feld, t);
      feld.setAttribute("data-f-ungueltig", "");
      feld.focus();
      feld.scrollIntoView({ block: "nearest" });
    }

    /* Speichern in einem Zug, für alle Seiten gleich:
         pruefen()          → null | Text | {feld, text}   (Feldfehler, kein Schreiben)
         schreiben()        → Promise (PATCH/POST; danach den Entwurf leeren und die
                              geschriebenen Werte in die lokale Zeile übernehmen)
         nachladen(ergebnis)→ Promise (still nachladen und neu zeichnen)
         erfolgText         Text | fn(ergebnis) | false
         anzahl()           Zahl der Änderungen: 0 → nichts tun (Fehler A5)
       Schreiben und Nachladen sind getrennt (Fehler A7): nach erfolgreichem
       Schreiben kommt immer die Erfolgsmeldung; scheitert nur das Nachladen,
       folgt ein leiser Hinweis und zeichnen() zeichnet aus dem lokalen Stand.
       «Nochmals speichern» heisst der Knopf nur nach einem gescheiterten
       Schreiben – nicht nach einer Feldprüfung (es wurde nie geschrieben).
       Nach einem Konflikt (409/412: inzwischen anderswo geändert) hülfe
       «nochmals» nichts, das eTag bliebe alt: die Meldung bietet «Neu
       laden» an (still, der Entwurf bleibt), danach geht Speichern. */
    F.speicherAblauf = async function (a) {
      if (beschaeftigtZahl > 0 || geloescht) return false;
      if (typeof a.anzahl === "function" && !a.immer && a.anzahl() === 0) return false;
      feldFehlerLeeren();
      const pruefung = typeof a.pruefen === "function" ? a.pruefen() : null;
      if (pruefung) {
        feldFehlerZeigen(pruefung);
        return false;
      }
      let geschrieben = false;
      // Vor dem Sperren: der Speicherknopf wird beschäftigt statt gesperrt
      // (ein gesperrter fokussierter Knopf gäbe den Fokus an body ab).
      speichertIntern = true;
      fehlerOffen = false;
      await F.beschaeftigt(async function () {
        leisteZeichnen();
        let ergebnis;
        try {
          ergebnis = await a.schreiben();
          geschrieben = true;
        } catch (fehler) {
          const konflikt = !!fehler && (fehler.status === 409 || fehler.status === 412);
          fehlerOffen = !konflikt;
          UI.meldung((a.fehlerText || "Speichern fehlgeschlagen.") + " " + fehlerText(fehler), {
            ton: "fehler",
            aktion: konflikt && typeof o.nachladen === "function" ? { text: "Neu laden", beiKlick: konfliktNeuLaden } : undefined
          });
          return;
        } finally {
          speichertIntern = false;
          leisteZeichnen();
        }
        const erfolg = typeof a.erfolgText === "function" ? a.erfolgText(ergebnis) : a.erfolgText;
        if (erfolg !== false) UI.meldung(erfolg || "Gespeichert.", { ton: "erfolg" });
        if (typeof a.nachladen === "function") {
          try {
            await a.nachladen(ergebnis);
          } catch (fehler) {
            UI.meldung("Gespeichert. Der neue Stand konnte nicht geladen werden; er erscheint "
              + "beim nächsten Nachladen.", { ton: "info" });
            if (typeof a.zeichnen === "function") {
              try { a.zeichnen(); } catch (e) { setTimeout(function () { throw e; }, 0); }
            }
          }
        }
      }, { nachladen: false });
      speichertIntern = false;
      return geschrieben;
    };

    /* «Neu laden» nach einem Speicherkonflikt: still nachladen (frisches
       eTag und die Werte der anderen Änderung), der Entwurf bleibt stehen. */
    function konfliktNeuLaden() {
      let geladen = false;
      F.beschaeftigt(function () { return Promise.resolve(); }, {
        nachladen: async function () { await o.nachladen(); geladen = true; }
      }).then(function () {
        if (geladen) UI.meldung("Neuer Stand geladen. Die ungespeicherten Änderungen sind noch da.", { ton: "info" });
      });
    }

    /* Verwerfen mit Rückfrage, auf allen Seiten mit denselben Worten:
       «2 Änderungen verwerfen?» bzw. beim Anlegen «Formular leeren?». Nach
       dem Ja ruft es danach() (Entwurf leeren, still neu zeichnen) und meldet
       es leise. Nichts zu verwerfen oder Arbeit im Gang: false ohne Frage.
       ov: { anzahl: Zahl, neuModus, danach() } → Promise<boolean> */
    F.verwerfen = async function (ov) {
      const n = ov.anzahl || 0;
      if (!n || beschaeftigtZahl > 0 || geloescht) return false;
      const ja = await UI.bestaetigen(ov.neuModus
        ? { titel: "Formular leeren?", text: "Alle Eingaben dieses Formulars gehen verloren.", ja: "Formular leeren" }
        : { titel: n === 1 ? "Änderung verwerfen?" : n + " Änderungen verwerfen?",
            text: "Die Felder zeigen danach wieder den gespeicherten Stand.", ja: "Verwerfen" });
      if (!ja) return false;
      // Ein offenes Verlauf-Formular mit halb getipptem Eintrag gehört zum
      // Verworfenen (vor danach(): die Seite zeichnet dort neu).
      verlaufZuruecksetzen();
      ov.danach();
      UI.meldung(ov.neuModus ? "Formular geleert." : "Änderungen verworfen.", { ton: "info" });
      return true;
    };

    /* Der Verlauf (verlauf.js) hält offene Formulare je Einbauort selbst.
       Mit typeof: Seiten ohne Verlauf (Software) und ältere Fassungen von
       verlauf.js ohne diese Schnittstelle gehen weiter. */
    function verlaufOffen() {
      return typeof Verlauf !== "undefined" && typeof Verlauf.offeneEingabe === "function"
        && !!Verlauf.offeneEingabe();
    }

    function verlaufZuruecksetzen() {
      if (typeof Verlauf !== "undefined" && typeof Verlauf.zuruecksetzen === "function") Verlauf.zuruecksetzen();
    }

    /* ---------- Löschen mit Eintippen (früher dreimal kopiert) ---------- */

    /* Endzustand nach dem Löschen (oder wenn der Datensatz inzwischen
       anderswo gelöscht wurde): ohne Schublade wie der Fehlerzustand, mit
       dem Zurück-Link zur Liste über dem Titel. */
    function geloeschtZeigen(ende, mitFokus) {
      geloescht = true;
      leiste().setzen({ sichtbar: false });
      if (kopf) aktionenAbgleichen(kopf.aktionen, []);
      F.navZeichnen([], null, null, { verstecken: true });
      Rahmen.zustand("ende", {
        titel: ende.titel || "Gelöscht",
        text: ende.text || "",
        hinweis: ende.hinweis || "",
        knopfText: ende.knopfText || "Zur Liste",
        // Fehler A6: zurück zur gemerkten Liste statt window.close().
        beiKlick: function () { F.zurListe(); },
        fokus: mitFokus !== false,
        pfad: listenPfad()
      });
    }

    F.loeschenDialog = function (ol) {
      const wort = String(ol.wort || "").trim();
      const d = UI.dialog({ titel: ol.titel || "Löschen", breit: true });
      if (ol.text) d.inhalt.appendChild(el("p", null, ol.text));
      if (ol.warnung) d.inhalt.appendChild(UI.banner({ ton: "warnung", text: ol.warnung }));

      const feld = UI.eingabe({ art: "text", id: UI.id(p + "loeschen") });
      feld.autocomplete = "off";
      feld.spellcheck = false;
      d.inhalt.appendChild(UI.feld("Zur Bestätigung «" + wort + "» abtippen", feld, { klasse: "dialog-bestaetigung" }));

      const abbrechen = UI.knopf({ text: "Abbrechen", variante: "leise", beiKlick: function () { d.schliessen("abbrechen"); } });
      const loeschen = UI.knopf({ text: ol.knopfText || "Endgültig löschen", variante: "primaer" });
      loeschen.disabled = true;
      d.knoepfe.appendChild(abbrechen);
      d.knoepfe.appendChild(loeschen);

      function passt() { return !!wort && feld.value.trim().toLowerCase() === wort.toLowerCase(); }
      feld.addEventListener("input", function () { loeschen.disabled = !passt(); });
      feld.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" && passt()) { ev.preventDefault(); loeschen.click(); }
      });

      /* Während gelöscht wird, schliessen Esc und Schleier den Dialog nicht
         (er ist gesperrt), und der Vorgang läuft in F.beschaeftigt: Leiste,
         Ctrl+S und Schnellaktionen bleiben gesperrt – sonst liesse sich
         noch auf den Datensatz speichern, der gerade gelöscht wird. */
      let laeuft = false;
      loeschen.addEventListener("click", async function () {
        if (laeuft || !passt() || beschaeftigtZahl > 0) return;
        laeuft = true;
        d.sperren(true);
        UI.beschaeftigt(loeschen, true, "Wird gelöscht …");
        abbrechen.disabled = true;
        let fehlschlag = null;
        await F.beschaeftigt(async function () {
          try {
            await ol.beiLoeschen();
          } catch (fehler) {
            fehlschlag = { fehler: fehler };
          }
        }, { nachladen: false });
        if (fehlschlag) {
          laeuft = false;
          d.sperren(false);
          abbrechen.disabled = false;
          await UI.beschaeftigt(loeschen, false);
          UI.meldung((ol.fehlerText || "Löschen fehlgeschlagen.") + " " + fehlerText(fehlschlag.fehler), { ton: "fehler" });
          return;
        }
        await UI.beschaeftigtAbwarten(loeschen);
        d.sperren(false);
        d.schliessen("geloescht");
        geloeschtZeigen(ol.ende || {});
      });
      feld.focus();
      return d;
    };

    /* ==================================================================
       Rahmen: Vorführmodus, Konto
       ================================================================== */

    F.bandZeichnen = function (textZeile, beiZuruecksetzen) {
      if (!mockModus) return;
      Rahmen.vorfuehrung({
        text: textZeile,
        beiZuruecksetzen: function () {
          Mock.zuruecksetzen();
          // Nach dem Löschen kennt das Gerüst den Datensatz nicht mehr
          // (Endzustand, keine Leiste, kein Ctrl+S, kein Schutz beim
          // Verlassen); das Zurücksetzen bringt ihn zurück: neu laden.
          if (geloescht) { location.reload(); return; }
          if (typeof beiZuruecksetzen === "function") beiZuruecksetzen();
        }
      });
    };

    /* Detailfenster zeigen jetzt auch Konto und «Abmelden» (Inventar §8 Nr. 9). */
    F.kontoZeigen = function (konto) {
      if (mockModus) {
        Rahmen.konto({ name: "Vorführmodus" });
        return;
      }
      const k = konto || (typeof Auth !== "undefined" && Auth.konto ? Auth.konto() : null);
      if (k) Rahmen.konto({ name: k.name, email: k.adresse || k.email });
      if (typeof Auth !== "undefined" && Auth.abmelden) Rahmen.abmelden(function () { Auth.abmelden(); });
    };

    /* ==================================================================
       Automatisch nachladen
       ================================================================== */

    /* Statt eines Knopfes «Neu laden» holt sich die Seite den Stand in
       ruhigen Abständen selbst — still, ohne Animation. Übersprungen wird,
       sobald Nachladen mehr stören als nützen würde: erlaubt() sagt es
       (Entwurf, Anlegen …), dazu nie bei offener Ebene, während der Arbeit,
       nach dem Löschen, in einem Hintergrund-Tab und während der Fokus in
       einem Eingabefeld steht (C2). */
    let autoLetzte = Date.now();
    let autoLaeuft = false;
    /** Promise des laufenden stillen Nachladens (F.beschaeftigt wartet darauf). */
    let autoLauf = null;

    function fokusInEingabe() {
      const a = document.activeElement;
      return !!a && a.matches && a.matches("input, textarea, select, [contenteditable=\"true\"]");
    }

    F.autoStarten = function (erlaubt, nachladen) {
      function lauf() {
        autoLaeuft = true;
        autoLauf = Promise.resolve().then(nachladen).catch(function (fehler) {
          // Gibt es den Datensatz nicht mehr (in einem anderen Tab oder von
          // jemand anderem gelöscht), zeigt die Seite das, statt still einen
          // toten Datensatz stehen zu lassen. Sonst still bleiben: der
          // gezeigte Stand ist besser als ein Fehlerbild.
          if (fehler && (fehler.nichtGefunden || fehler.status === 404) && !geloescht) {
            geloeschtZeigen({
              titel: "Inzwischen gelöscht",
              text: "Diesen Datensatz gibt es nicht mehr: Er wurde in einem anderen Fenster oder "
                + "von einer anderen Person gelöscht."
            }, false);
          }
        }).then(function () {
          autoLaeuft = false;
          autoLauf = null;
          autoLetzte = Date.now();
        });
        return autoLauf;
      }
      function pruefen() {
        if (autoLaeuft || document.hidden || UI.ebeneOffen() || beschaeftigtZahl > 0 || geloescht) return;
        if (Rahmen.zustandJetzt() !== "inhalt" || fokusInEingabe()) return;
        if (!erlaubt()) return;
        if (Date.now() - autoLetzte < KONFIG.autoTaktMs) return;
        lauf();
      }
      autoLetzte = Date.now();
      setInterval(pruefen, KONFIG.autoPruefTaktMs);
      document.addEventListener("visibilitychange", pruefen);
    };

    /* ==================================================================
       Ereignisse: Speicherleiste, Hash, Tastatur, Verlassen
       e: { speichern, verwerfen, anzahlAenderungen, verlassenFrei?, beiHash(k) }
       ================================================================== */

    F.ereignisse = function (e) {
      UI.speicherleiste({ beiSpeichern: e.speichern, beiVerwerfen: e.verwerfen, fokusZiel: fokusNachLeiste });

      window.addEventListener("hashchange", function () {
        const h = (location.hash || "").replace(/^#/, "");
        if (h && e.beiHash) e.beiHash(h);
      });

      document.addEventListener("keydown", function (ev) {
        // Ctrl+S bzw. Cmd+S: nur, wenn es etwas zu speichern gibt (A5).
        if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && (ev.key === "s" || ev.key === "S")) {
          ev.preventDefault();
          if (UI.ebeneOffen() || !leiste().speicherbar()) return;
          e.speichern();
          return;
        }
        // Esc: offene Ebenen und die modale Schublade fängt rahmen.js vorher ab.
        // Während geschrieben wird, ist «Verwerfen» gesperrt – Esc auch.
        if (ev.key === "Escape" && !ev.defaultPrevented && !UI.ebeneOffen() && !geloescht
          && beschaeftigtZahl === 0 && !speichertIntern && !(letzteLeiste && letzteLeiste.speichertGerade)) {
          if (e.anzahlAenderungen()) { ev.preventDefault(); e.verwerfen(); }
        }
      });

      // Auch ein halb getippter, nicht übernommener Verlauf-Eintrag hält auf
      // (er zählt nicht als Änderung in der Leiste, ginge aber verloren).
      window.addEventListener("beforeunload", function (ev) {
        if (geloescht || (!e.anzahlAenderungen() && !verlaufOffen())) return;
        if (e.verlassenFrei && e.verlassenFrei()) return;
        ev.preventDefault();
        // Der Text stammt vom Browser; zurückgeben muss man trotzdem etwas.
        ev.returnValue = "";
        return "";
      });
    };

    return F;
  }

  return { erstellen: erstellen };
})();

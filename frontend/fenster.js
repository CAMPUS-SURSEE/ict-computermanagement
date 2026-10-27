/* fenster.js – gemeinsames Gerüst der sechs Detailseiten (Client, Benutzer,
   Telefonnummer, Software, Kamera, Kamerarolle), gebaut auf Rahmen
   (rahmen.js), UI und Bewegung (bausteine.js) und darunter Dashboard-Style
   (DS.dom, DS.motion, DS.overlay).

   Die Seiten teilen sich: Seitenkopf mit Zurück-Link, Titel, Teile-Zeile,
   Status und Schnellaktionen; die Bereiche in der Schublade; Lade-, Fehler-
   und Endzustand; Speicherleiste; Meldungen; Dialoge; Vorführ-Hinweis;
   automatisches Nachladen; Tastatur (Ctrl/Cmd+S, Esc) und den Schutz vor
   dem Verlassen mit ungespeicherten Änderungen. Das steht einmal hier.
   Dazu die Helfer, die sonst in jeder Seite stünden: Entwurf, Feld am
   Entwurf, Speicherablauf, Übernahme nach dem Schreiben (eTag), Arbeit
   aus einem Dialog, Löschdialog mit Eintippen, «beschäftigt».

   Was hier NICHT steht: die Bereiche und alles Fachliche. Das bleibt in
   der Seite; sie reicht dem Gerüst Rückrufe und Zustände hinein.

   HTML der Seite (Präfix z. B. «g»): div.ds-app[data-seite] mit dem
   Rahmen-Gerüst (siehe rahmen.js) und in der Bahn (#inhalt)
       <header class="ds-page-head" id="g-kopf"></header>
       <div class="fenster-bereich" id="g-bereich"></div>
   Dialog, Meldung und Speicherleiste baut das Gerüst selbst.

   Neu zeichnen heisst abgleichen: Kopf und Bereich werden bei jedem Aufruf
   frisch gebaut und dann mit dem Gezeigten abgeglichen (UI.abgleichen =
   DS.dom.morphChildren). Was gleich bleibt, bleibt stehen – mit Fokus,
   Schreibmarke, Rollstand, Tooltip und laufendem Spinner –, und kein
   Auftritt (das Sinnbild eines Status-Chips) spielt noch einmal. Für die
   Seiten heisst das:
     - Ein Knoten, den der Bauer eines Bereichs baut, ist nur bis zum
       nächsten F.zeichneBereich der gezeigte: danach kann es sein
       Vorgänger sein, der stehen geblieben ist. Wer später an Ort und
       Stelle nachführt, sucht den Knoten über seine id (UI.$) bzw.
       data-fokus, statt ihn festzuhalten – oder setzt data-ds-replace auf
       den Teilbaum, der immer frisch sein muss (dann spielt er aber auch
       seine Auftritte).
     - Ein stehen gebliebenes Bedienelement behält seine Zuhörer vom ersten
       Bauen. Handler lesen darum den aktuellen Stand (Modul-Variablen,
       Entwurf), statt Werte eines Bauens einzuschliessen; wo das nicht
       geht, hört der Behälter (Delegation) oder data-ds-replace hilft.
       Bedienelemente (Knöpfe, Links, Felder, Schalter, Chips) markiert das
       Gerüst im Bereich mit data-ds-replace: weicht eines in seinen
       Attributen ab (andere id, anderes data-fokus, anderer Text in einem
       Attribut), wird es ersetzt, nie zu einem anderen umgedeutet – es
       trüge sonst die Zuhörer eines anderen Felds. Das fokussierte bleibt
       immer stehen.
     - Werte von Feldern (value, checked) gleicht das Gerüst der Vorlage
       nach, auch im fokussierten Feld (mit Schreibmarke) – ausser in einem
       fokussierten Suchfeld, das verzögert meldet.
     - Kopfknöpfe nur mit beiKlick bauen: der stehende Knopf übernimmt den
       beiKlick des neu gebauten (UI.knopfUebernehmen).

   ------------------------------------------------------------------
   API:  const F = Fenster.erstellen(praefix, { neuLaden, nachladen, liste })
   ------------------------------------------------------------------
   neuLaden()   lädt mit Ladezustand neu («Erneut laden»)
   nachladen()  lädt still nach und zeichnet neu (nach F.beschaeftigt, nach
                «Neu laden» bei einem Speicherkonflikt)
   liste        Schlüssel der Liste für den Zurück-Link («admin», «edu»,
                «benutzer», «telefone», «software», «kameras», «kamerarechte»)

   Bauen tun die Seiten über UI.*, Rahmen.* und Bewegung.* (bausteine.js,
   rahmen.js); F.* hüllt keinen Baustein ein.
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
   Kopf und Navigation:
     F.seitenkopf({pfad:{text, href}|listenSchluessel|null, titel, lead, unter:[teile]|text,
                   status:[knoten], aktionen:[knöpfe]})
                                         gleicht an Ort und Stelle ab (darf bei jedem
                                         Tastendruck laufen): Teile und Status über
                                         UI.abgleichen (ein Status-Chip, der bleibt, spielt
                                         seinen Auftritt nicht noch einmal, ein neuer Ton
                                         gleitet); Knöpfe mit Schlüssel (data-ds-key aus
                                         data-fokus, id oder Text), ein stehender übernimmt
                                         Sperre und beiKlick des neuen
     F.logoZeichnen(listenSchluessel)    Standard für den Zurück-Link
     F.navZeichnen(bereiche, aktiv, beiKlick, {verstecken, label, zusatz(b) → Zahl|Knoten})
                                         zuoberst der Zurück-Eintrag zur gemerkten Liste
     F.zeichneBereich(bereiche, aktiv) → schluessel
                                         bereiche: [{k, d, f(ziel), gruppe?, sinnbild?}].
                                         Ein anderer Bereich wird frisch gebaut; derselbe wird
                                         still abgeglichen (siehe oben; Rahmen.stillZeichnen hält
                                         Tafel, Roller und einen verschwundenen Fokus). Der Bauer
                                         f(ziel) baut dabei in eine verborgene Vorlage vor dem
                                         Bereich: UI.$(id) findet beim Bauen schon die neuen Knoten.
     F.bereichWechseln(bereiche, schluessel) → Promise<schluessel>
                                         replaceState, Pille (Rahmen.aktiv) und Rahmen.wechseln
                                         (DS.motion.transition, fade-through; Raster staffeln)
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
     F.speicherleisteZeichnen({neuModus, anzahl, neuText})
     F.speicherAblauf({pruefen, schreiben, nachladen, erfolgText, fehlerText, anzahl, zeichnen, immer})
                → Promise<boolean>   (immer: auch ohne Änderungen, z. B. «Anlegen»; der
                Speichern-Knopf ist beschäftigt, solange schreiben() läuft:
                speicherleiste().beschaeftigt → DS.motion.busy)
     F.beschaeftigt(fn, {nachladen}) → Promise   F.istBeschaeftigt()
                sperrt Kopfaktionen (mit Grund im Tooltip), Speicherleiste, Ctrl+S und Esc,
                solange fn läuft; verwirft fn, wird das Promise verworfen
     F.imDialog(dialog, knopf, arbeit, {fehlerText, grund, nachladen}) → Promise<boolean>
                Arbeit aus einem offenen UI.dialog: knopf beschäftigt (UI.beschaeftigt; seine
                Gesichter baut UI.knopf({beschaeftigt: 'Wird gespeichert …'})), die übrigen
                Knöpfe des Dialogs gesperrt, Esc und Schleier schliessen nicht (sperren), dazu
                F.beschaeftigt. Gelungen: der Dialog schliesst (grund, Standard 'ja'), true.
                Gescheitert: er bleibt offen, Fehlermeldung (fehlerText + Grund), false.
     F.verwerfen({anzahl, neuModus, danach}) → Promise<boolean>   Rückfrage mit einheitlichen
                Worten («2 Änderungen verwerfen?» / «Formular leeren?»), danach() und leise Meldung
     F.loeschenDialog({titel, text, warnung, wort, knopfText, fehlerText, beiLoeschen, ende:{titel, text, hinweis}})
                → dialog   «Löschen» ist gesperrt (mit Grund), bis wort eingetippt ist; dann
                über F.imDialog («Wird gelöscht …»), danach der Endzustand
     F.geloescht()
   Rahmen:
     F.bandZeichnen(text, beiZuruecksetzen)   F.kontoZeigen(konto?)   F.zurListe()
     F.autoStarten(erlaubt, nachladen)   still nachladen; «nicht gefunden» (im anderen
                Tab gelöscht) zeigt den Endzustand «Inzwischen gelöscht»
     F.ereignisse({speichern, verwerfen, anzahlAenderungen, verlassenFrei, beiHash})
                Leiste, Ctrl/Cmd+S, Esc, Hash, Schutz vor dem Verlassen (auch mit
                halb getipptem Verlauf-Eintrag, Verlauf.offeneEingabe). Esc und Ctrl+S
                fragen UI.ebeneOffen(): eine offene Überlagerung hat die Taste für sich.

   Grundsätze wie überall: kein Framework, kein innerHTML mit Daten. */

"use strict";

const Fenster = (function () {

  /* Kurzformen für das Gerüst selbst (keine Ausgabe an die Seiten: die
     bauen über UI.*). */
  const $ = UI.$;
  const el = UI.el;
  const leeren = UI.leeren;
  const text = UI.text;
  const gleichwertig = UI.gleichwertig;

  /** Grund im Tooltip der Kopfaktionen, solange F.beschaeftigt läuft. */
  const GRUND_BESCHAEFTIGT = "Wird gespeichert … Gleich wieder möglich.";

  /** Formularfelder, deren Wert das Gerüst nach dem Abgleich nachführt. */
  const STEUERELEMENTE = "input, select, textarea";
  /** Was im Bereich beim Abgleich ersetzt statt umgedeutet wird (Zuhörer,
      Methoden am Knoten): Knöpfe, Links, Felder, Kästchen, Schalter, Chips. */
  const BEDIENELEMENTE = "button, a[href], input, select, textarea, label.ds-check, label.ds-switch, label.ds-chip";

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

  /* ---------- Abgleichen ---------- */

  /* Die Formularfelder unter den Knoten, in Dokumentreihenfolge. */
  function steuerelemente(knoten) {
    const liste = [];
    for (const k of knoten) {
      if (!k || k.nodeType !== 1) continue;
      if (k.matches(STEUERELEMENTE)) liste.push(k);
      for (const s of k.querySelectorAll(STEUERELEMENTE)) liste.push(s);
    }
    return liste;
  }

  /* Nach dem Abgleich steht unter dem Behälter dieselbe Folge von Feldern
     wie in der Vorlage; ein Feld, das stehen geblieben ist, übernimmt den
     Wert seiner Vorlage (value und checked sind keine Attribute, die
     DS.dom.morphChildren angleicht). Die Vorlage kommt aus dem Entwurf,
     und jede Eingabe geht sofort dorthin: darum auch das fokussierte Feld
     (nach «Verwerfen» steht der Fokus wieder darin, der Wert muss zurück),
     mit seiner Schreibmarke. Nur ein fokussiertes Suchfeld nicht: es meldet
     verzögert (UI.suchfeld), die Vorlage kennt das Letzte noch nicht.
     Stimmt die Folge nicht (ein Feld in einem austretenden Teil), bleibt
     alles, wie es ist. */
  function werteNachfuehren(behaelter, vorlage) {
    const gezeigt = Array.from(behaelter.querySelectorAll(STEUERELEMENTE))
      .filter(function (k) { return !k.closest("[data-ds-leaving]"); });
    if (gezeigt.length !== vorlage.length) return;
    const aktiv = document.activeElement;
    gezeigt.forEach(function (k, i) {
      const v = vorlage[i];
      if (k === v || k.tagName !== v.tagName || k.type !== v.type) return;
      if (k === aktiv && k.closest(".ds-search")) return;
      if (k.type === "checkbox" || k.type === "radio") {
        if (k.checked !== v.checked) k.checked = v.checked;
        if (k.indeterminate !== v.indeterminate) k.indeterminate = v.indeterminate;
      } else if (k.type !== "file" && k.value !== v.value) {
        let auswahl = null;
        try {
          if (k === aktiv && typeof k.selectionStart === "number") auswahl = [k.selectionStart, k.selectionEnd];
        } catch (e) { auswahl = null; }   // Feldart ohne Schreibmarke (Datum, Zahl)
        k.value = v.value;
        if (auswahl) {
          const n = k.value.length;
          try { k.setSelectionRange(Math.min(auswahl[0], n), Math.min(auswahl[1], n)); } catch (e) { /* ohne Schreibmarke */ }
        }
      }
    });
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

    /* Titel und Dokumenttitel nennen den Fehler, nicht «… wird geladen …».
       Ohne Datensatz gibt es keine Bereiche: die Seite steht ohne Schublade
       da wie im Neu-Modus (Tafel volle Breite) – eine leere Schublade bzw.
       ein Menüknopf, der eine leere öffnet, hülfe niemandem. */
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
        "", "Erneut laden");
    };

    /* ==================================================================
       Seitenkopf an Ort und Stelle
       ================================================================== */

    let kopf = null;

    function kopfSichern() {
      if (kopf) return kopf;
      let wurzel = $(p + "kopf");
      if (!wurzel) {
        wurzel = el("header", "ds-page-head");
        wurzel.id = p + "kopf";
        const b = $(p + "bereich");
        if (b && b.parentNode) b.parentNode.insertBefore(wurzel, b);
        else bahn().appendChild(wurzel);
      }
      // Der Bauer ist derselbe wie für die Ansichten der Hauptseite
      // (UI.seitenkopf, rahmen.js); hier wird er nur an Ort und Stelle
      // abgeglichen, statt ihn neu zu bauen.
      const k0 = UI.seitenkopf({ element: wurzel, titelId: p + "titel" }).knoten;
      kopf = { wurzel: wurzel, pfad: k0.pfad, pfadText: k0.pfadText, titel: k0.titel, unter: k0.unter,
        status: k0.status, aktionen: k0.aktionen, pfadGesetzt: false };
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
      UI.textSetzen(k.pfadText, ziel.text || Rahmen.zielText(listeSchluessel || Rahmen.STARTZIEL));
      const href = ziel.href || UI.adresse.zurueckZurListe(listeSchluessel || Rahmen.STARTZIEL);
      if (k.pfad.getAttribute("href") !== href) k.pfad.setAttribute("href", href);
      k.pfad.hidden = false;
    }

    /* Der Schlüssel eines Kopfknopfs für den Abgleich: dieselbe Aktion
       bleibt derselbe Knopf, eine andere («Ins Lager legen» → «Ausgeben
       an …») ist ein neuer, auch an derselben Stelle. */
    function aktionsSchluessel(k) {
      return k.getAttribute("data-fokus") || k.id || "text-" + k.textContent.trim();
    }

    /* Die Knöpfe werden frisch gebaut (bei jedem Tastendruck) und mit den
       gezeigten abgeglichen: ein Knopf, der bleibt, behält Fokus, Tooltip
       und Zustandsebene; seine Sperre mit Grund (aria-disabled, data-tip)
       gleicht UI.abgleichen an, den beiKlick übernimmt er vom neuen
       (UI.knopfUebernehmen). Ein Knopf ohne beiKlick wird ersetzt. Ging der
       Fokus mit einem Knopf, geht er zur ersten freien Aktion, sonst zum
       Titel. */
    function aktionenAbgleichen(behaelter, neue) {
      const liste = (neue || []).filter(Boolean);
      for (const k of liste) if (!k.hasAttribute("data-ds-key")) k.setAttribute("data-ds-key", aktionsSchluessel(k));
      const aktiv = document.activeElement;
      const fokusDrin = !!aktiv && aktiv !== behaelter && behaelter.contains(aktiv);
      UI.abgleichen(behaelter, liste);
      Array.from(behaelter.children).forEach(function (gezeigt, i) {
        const neu = liste[i];
        if (!neu || gezeigt === neu || UI.knopfUebernehmen(gezeigt, neu)) return;
        const hatteFokus = gezeigt === document.activeElement;
        gezeigt.replaceWith(neu);
        if (hatteFokus) neu.focus({ preventScroll: true });
      });
      sperrenAnwenden();
      if (fokusDrin && !behaelter.contains(document.activeElement)) {
        const nachfolger = Array.from(behaelter.children).filter(function (k) { return !k.disabled; })[0];
        (nachfolger || $(p + "titel")).focus({ preventScroll: true });
      }
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
        UI.abgleichen(k.unter, teile.length ? [UI.teile(teile)] : []);
      }
      if (s.status !== undefined) UI.abgleichen(k.status, (s.status || []).filter(Boolean));
      if (s.aktionen !== undefined) aktionenAbgleichen(k.aktionen, s.aktionen);
      return k.wurzel;
    };

    F.logoZeichnen = function (schluessel) {
      listeSchluessel = schluessel || listeSchluessel;
      const k = kopfSichern();
      if (!k.pfadGesetzt && listeSchluessel) pfadSetzen(listeSchluessel);
    };

    F.zurListe = function () {
      location.href = UI.adresse.zurueckZurListe(listeSchluessel || Rahmen.STARTZIEL);
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
        zurueck: listenPfad(),
        beiWahl: typeof beiKlick === "function" ? function (k) { beiKlick(k); } : null
      });
    };

    let gezeigterBereich = null;
    /** Der zuletzt angefragte Bereich (F.bereichWechseln): solange ein
        Wechsel noch nicht gebaut hat, ist er nicht der gezeigte. */
    let angefragterBereich = null;

    /* Zeilen aus F.feld, die zu keinem gezeigten Knoten mehr gehören
       (ersetzt, oder die Vorlage eines Abgleichs, deren Vorgänger blieb),
       vergessen. */
    function feldZeilenAufraeumen() {
      feldZeilen = feldZeilen.filter(function (e) { return e.zeile.isConnected; });
    }

    /* Der Bauer f(ziel) baut in eine verborgene Vorlage, die kurz VOR dem
       Bereich steht: so findet UI.$(id) beim Bauen schon die neuen Knoten
       (die Bauer füllen Teile über ihre id), nicht die gezeigten. */
    function vorlageBauen(ziel, bereich) {
      const vorlage = el("div");
      vorlage.hidden = true;
      vorlage.inert = true;
      ziel.parentNode.insertBefore(vorlage, ziel);
      try {
        bereich.f(vorlage);
      } finally {
        vorlage.remove();
      }
      ersetzenMarkieren(vorlage);
      return Array.from(vorlage.childNodes);
    }

    /* Bedienelemente werden beim Abgleich ersetzt statt umgedeutet, sobald
       sie abweichen (data-ds-replace, DS.dom.morphChildren). Nicht der
       ganze Bereich: Karten und Raster tragen nach dem ersten Zeigen
       Laufzeit-Attribute von Dashboard-Style (Staffelung) und blieben sonst
       nie stehen – mit ihnen spielten alle Auftritte darin noch einmal. */
    function ersetzenMarkieren(behaelter) {
      for (const k of behaelter.querySelectorAll(BEDIENELEMENTE)) k.setAttribute("data-ds-replace", "");
    }

    /* Zeichnet den aktiven Bereich und gibt seinen Schlüssel zurück. Ein
       anderer Bereich (Wechsel, erstes Zeigen) wird frisch gebaut; derselbe
       (Tippen, Schalter, Nachladen, Speichern) still abgeglichen:
       Rahmen.stillZeichnen bekommt die Knoten der Vorlage, gleicht sie mit
       DS.dom.morphChildren ab und hält Tafel, innere Roller und einen
       verschwundenen Fokus; danach die Feldwerte. Kein Auftritt: animiert
       wird nur beim Bereichswechsel (F.bereichWechseln). */
    F.zeichneBereich = function (bereiche, aktiv) {
      const ziel = bereichEl();
      const bereich = (bereiche || []).filter(function (b) { return b.k === aktiv; })[0] || (bereiche || [])[0];
      const schluessel = bereich ? bereich.k : null;
      const derselbe = schluessel !== null && schluessel === gezeigterBereich;
      if (derselbe) {
        let werte = [];
        Rahmen.stillZeichnen(ziel, function () {
          const knoten = vorlageBauen(ziel, bereich);
          werte = steuerelemente(knoten);
          // Ein leeres style-Attribut bleibt, wo Dashboard-Style seine
          // Laufzeit-Eigenschaften (Staffelung, Hochzählen) wieder entfernt
          // hat; die Vorlage hat keines. Ein Bedienelement (data-ds-replace)
          // gälte sonst als abweichend und würde ersetzt.
          for (const k of ziel.querySelectorAll("[style=\"\"]")) k.removeAttribute("style");
          return knoten;
        });
        werteNachfuehren(ziel, werte);
        feldZeilenAufraeumen();
      } else {
        leeren(ziel);
        feldZeilenAufraeumen();
        if (bereich) {
          bereich.f(ziel);
          ersetzenMarkieren(ziel);
        }
      }
      gezeigterBereich = schluessel;
      return schluessel;
    };

    /* Bereichswechsel: replaceState statt neuem Verlaufseintrag (Zurück
       führt zur Liste, nicht durch die Bereiche), die Pille gleitet, der
       Bereich blendet durch (Rahmen.wechseln, DS.motion.transition) und
       staffelt seine Karten. Hin und gleich zurück (A → B → A, bevor B
       gebaut ist): auch der gezeigte Bereich geht dann durch Rahmen.wechseln
       – der neuere Aufruf überholt den Wechsel nach B, sonst stünde B im
       Inhalt, Pille und Adresse aber auf A. */
    F.bereichWechseln = function (bereiche, schluessel) {
      const gueltig = (bereiche || []).some(function (b) { return b.k === schluessel; });
      const k = gueltig ? schluessel : ((bereiche || [])[0] || {}).k;
      if (k === undefined || k === null) return Promise.resolve(null);
      try {
        history.replaceState(history.state, "", location.pathname + location.search + "#" + k);
      } catch (e) { /* file:// u. ä. */ }
      Rahmen.aktiv(k);
      const unterwegs = angefragterBereich !== null && angefragterBereich !== gezeigterBereich;
      angefragterBereich = k;
      if (k === gezeigterBereich && !unterwegs) return Promise.resolve(k);
      const ziel = bereichEl();
      return Rahmen.wechseln(function () {
        F.zeichneBereich(bereiche, k);
        return ziel;
      }, { alt: ziel }).then(function () { return k; });
    };

    F.hashBereich = function (bereiche) {
      const h = (location.hash || "").replace(/^#/, "");
      return h && (bereiche || []).some(function (b) { return b.k === h; }) ? h : null;
    };

    /* ==================================================================
       Entwurf
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
       Feld am Entwurf
       ================================================================== */

    /** Zeilen aus F.feld, deren Punkt «geändert» dem Entwurf folgt. Nach
        einem Abgleich bleibt der Eintrag der gezeigten Zeile (die
        stehen gebliebene alte oder die neu eingesetzte). */
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
       UI.eingabe mit der id «<p>-eingabe-<Feld>» (Abgleich, Fokus beim
       Neuzeichnen, Feldfehler aus F.speicherAblauf), Wert aus dem Entwurf,
       jede Eingabe in den Entwurf; die Zeile (UI.formZeile) zeigt den
       Punkt «geändert» an Ort und Stelle – im Neu-Modus nie (dort ist
       alles neu).
       of: { beschriftung, art = 'text' ('auswahl' meldet beim Ändern),
             hinweis, zusatz, eingabe: { weitere Optionen für UI.eingabe:
             werte, leer, vorschlaege, platzhalter, zeilen, schmal, … },
             beiEingabe(wert, feldKnoten) nach dem Eintrag in den Entwurf,
             entwurf (Standard: der zuletzt erstellte), neu (true|fn; Standard:
             Option «neu» des Entwurfs) }
       → div.datenzeile-form mit .feld (das Steuerelement; nur bis zum
       nächsten Abgleich das gezeigte, danach UI.$(id)).
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
      const speichert = speichertIntern;
      const zeigen = !geloescht && (!!z.neuModus || anzahl > 0 || speichert);
      let t;
      if (speichert) t = "Wird gespeichert …";
      else if (z.neuModus) {
        t = anzahl === 0 ? (z.neuText || "Neu") + " – noch nicht angelegt"
          : anzahl + (anzahl === 1 ? " Angabe" : " Angaben") + " erfasst";
      } else {
        t = anzahl === 1 ? "1 Änderung" : anzahl + " Änderungen";
      }
      const fehler = fehlerOffen;
      // Beschäftigt zeigt der Speichern-Knopf selbst (speicherleiste().beschaeftigt
      // in F.speicherAblauf); hier stehen nur Texte und Sperren.
      leiste().setzen({
        text: t,
        speichernText: fehler ? "Nochmals speichern" : (z.neuModus ? "Anlegen" : "Speichern"),
        verwerfenText: z.neuModus ? "Formular leeren" : "Verwerfen",
        speichernAus: (!z.neuModus && anzahl === 0) || (beschaeftigtZahl > 0 && !speichert),
        verwerfenAus: speichert || anzahl === 0 || beschaeftigtZahl > 0,
        sichtbar: zeigen
      });
    }

    /* z: { neuModus, anzahl, neuText }.
       Wird bei jedem Tastendruck aufgerufen: ändert nur Texte und Zustände;
       Ein- und Austritt spielen nur, wenn die Leiste kommt oder geht. Fehler
       stehen nicht rot in der Leiste, sondern als Meldung darüber. */
    F.speicherleisteZeichnen = function (z) {
      letzteLeiste = Object.assign({}, z || {});
      leisteZeichnen();
    };

    /* Solange F.beschaeftigt läuft, sind die Kopfaktionen gesperrt – mit
       Grund im Tooltip, fokussierbar (bausteine.js schluckt ihre Klicks).
       data-f-gesperrt merkt sich den Tooltip des freien Knopfs; eine Sperre,
       die die Seite selbst gesetzt hat, bleibt unberührt. Ein Abgleich des
       Kopfs nimmt die Sperre mit den Attributen der Vorlage weg; danach
       läuft sperrenAnwenden wieder. */
    function sperrenAnwenden() {
      const gesperrt = beschaeftigtZahl > 0;
      if (kopf) {
        for (const k of Array.from(kopf.aktionen.querySelectorAll("button, a"))) {
          if (gesperrt) {
            if (k.getAttribute("aria-disabled") !== "true") {
              k.setAttribute("data-f-gesperrt", k.getAttribute("data-tip") || "");
              k.setAttribute("aria-disabled", "true");
              k.setAttribute("data-tip", GRUND_BESCHAEFTIGT);
            }
          } else if (k.hasAttribute("data-f-gesperrt")) {
            const frei = k.getAttribute("data-f-gesperrt");
            k.removeAttribute("data-f-gesperrt");
            k.removeAttribute("aria-disabled");
            if (frei) k.setAttribute("data-tip", frei);
            else k.removeAttribute("data-tip");
          }
        }
      }
      leisteZeichnen();
    }

    F.istBeschaeftigt = function () { return beschaeftigtZahl > 0; };

    /* Sperrt Schnellaktionen und Speicherleiste, solange fn läuft, und lädt
       danach still nach – auch nach einem Fehler, damit kein veraltetes
       eTag stehen bleibt. Ein zweiter Aufruf während des ersten wird
       verworfen (Doppelklick): er löst mit undefined auf. */
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
          UI.meldung("Der neue Stand erscheint beim nächsten automatischen Nachladen.", { ton: "info" });
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
         anzahl()           Zahl der Änderungen: 0 → nichts tun (auch kein Ctrl+S)
       Der Speichern-Knopf ist beschäftigt, solange schreiben() läuft
       (speicherleiste().beschaeftigt, DS.motion.busy: sofort gesperrt, das
       Gesicht «Wird gespeichert …» erst nach einer kurzen Verzögerung).
       Schreiben und Nachladen sind getrennt: nach erfolgreichem Schreiben
       kommt immer die Erfolgsmeldung; scheitert nur das Nachladen, folgt
       ein leiser Hinweis und zeichnen() zeichnet aus dem lokalen Stand.
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
        let ergebnis;
        try {
          ergebnis = await leiste().beschaeftigt(function () { return a.schreiben(); });
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
            UI.meldung("Der neue Stand erscheint beim nächsten automatischen Nachladen.", { ton: "info" });
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
        ? { titel: "Formular leeren?", text: "Alle Eingaben gehen verloren.", ja: "Formular leeren" }
        : { titel: n === 1 ? "Änderung verwerfen?" : n + " Änderungen verwerfen?",
            text: "Die Felder zeigen danach wieder den gespeicherten Stand.", ja: "Verwerfen" });
      if (!ja) return false;
      // Ein offenes Verlauf-Formular mit halb getipptem Eintrag gehört zum
      // Verworfenen (vor danach(): die Seite zeichnet dort neu).
      verlaufZuruecksetzen();
      ov.danach();
      UI.meldung(ov.neuModus ? "Formular geleert." : (n === 1 ? "Änderung verworfen." : "Änderungen verworfen."), { ton: "info" });
      return true;
    };

    /* Der Verlauf (verlauf.js) hält offene Formulare je Einbauort selbst.
       Mit typeof: Seiten ohne Verlauf (Software) laden verlauf.js nicht. */
    function verlaufOffen() {
      return typeof Verlauf !== "undefined" && typeof Verlauf.offeneEingabe === "function"
        && !!Verlauf.offeneEingabe();
    }

    function verlaufZuruecksetzen() {
      if (typeof Verlauf !== "undefined" && typeof Verlauf.zuruecksetzen === "function") Verlauf.zuruecksetzen();
    }

    /* ---------- Arbeit aus einem Dialog ---------- */

    /* Ein Vorgang, den ein Knopf in einem offenen Dialog auslöst (Löschen,
       Schnellaktionen): der Knopf ist beschäftigt (UI.beschaeftigt →
       DS.motion.busy), die übrigen Knöpfe des Dialogs sind gesperrt, Esc
       und Schleier schliessen nicht (d.sperren), und der Vorgang läuft in
       F.beschaeftigt – Leiste, Ctrl+S und Schnellaktionen bleiben gesperrt,
       danach lädt die Seite still nach (nachladen: false lässt das aus).
       Erst wenn alles fertig ist, schliesst der Dialog; bei einem Fehler
       bleibt er offen und die Meldung steht darüber. */
    F.imDialog = async function (d, knopf, arbeit, optionenDialog) {
      const od = optionenDialog || {};
      if (beschaeftigtZahl > 0) {
        UI.meldung("Es wird gerade gespeichert. Bitte gleich noch einmal versuchen.", { ton: "info" });
        return false;
      }
      const andere = Array.from(d.knoepfe.querySelectorAll("button")).filter(function (k) {
        return k !== knopf && k.getAttribute("aria-disabled") !== "true";
      });
      d.sperren(true);
      for (const k of andere) UI.knopfSperren(k, "Bitte warten, bis der Vorgang abgeschlossen ist.");
      const frei = function () {
        d.sperren(false);
        for (const k of andere) UI.knopfSperren(k, "");
      };
      try {
        await UI.beschaeftigt(knopf, function () {
          return F.beschaeftigt(arbeit, { nachladen: od.nachladen });
        });
      } catch (fehler) {
        frei();
        UI.meldung((od.fehlerText || "Speichern fehlgeschlagen.") + " " + fehlerText(fehler), { ton: "fehler" });
        return false;
      }
      frei();
      await d.schliessen(od.grund || "ja");
      return true;
    };

    /* ---------- Löschen mit Eintippen ---------- */

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
        // Zurück zur gemerkten Liste: das Detailfenster ist ein Tab wie jeder andere.
        beiKlick: function () { F.zurListe(); },
        fokus: mitFokus !== false,
        pfad: listenPfad()
      });
    }

    /* Löschen gibt es erst, wenn das Wort eingetippt ist: bis dahin ist der
       Knopf gesperrt mit Grund (fokussierbar, der Tooltip sagt, was fehlt).
       Gelöscht wird über F.imDialog; nach dem Schliessen des Dialogs steht
       der Endzustand da und bekommt den Fokus. */
    F.loeschenDialog = function (ol) {
      const wort = String(ol.wort || "").trim();
      // Dashboard-Style, «Confirm by typing the name»: alertdialog, breit,
      // Text, Warnung und das Feld im Körper.
      const textId = UI.id(p + "loeschen-text");
      const d = UI.dialog({ titel: ol.titel || "Löschen", breit: true, rolle: "alertdialog",
        beschreibung: ol.text ? textId : null });
      if (ol.text) {
        const t = el("p", "ds-dialog__text", ol.text);
        t.id = textId;
        d.inhalt.appendChild(t);
      }
      if (ol.warnung) d.inhalt.appendChild(UI.banner({ ton: "warnung", text: ol.warnung }));

      const feld = UI.eingabe({ art: "text", id: UI.id(p + "loeschen") });
      feld.autocomplete = "off";
      feld.spellcheck = false;
      feld.setAttribute("autocapitalize", "off");
      d.inhalt.appendChild(UI.feld("Zur Bestätigung «" + wort + "» eingeben", feld, { klasse: "dialog-bestaetigung" }));

      const grund = "Zur Bestätigung «" + wort + "» eingeben.";
      const abbrechen = UI.knopf({ text: "Abbrechen", variante: "leise", beiKlick: function () { d.schliessen("abbrechen"); } });
      const loeschen = UI.knopf({ text: ol.knopfText || "Löschen", variante: "primaer",
        beschaeftigt: "Wird gelöscht …", gesperrt: grund });
      d.knoepfe.appendChild(abbrechen);
      d.knoepfe.appendChild(loeschen);

      let laeuft = false;
      function passt() { return !!wort && feld.value.trim().toLowerCase() === wort.toLowerCase(); }
      feld.addEventListener("input", function () {
        if (!laeuft) UI.knopfSperren(loeschen, passt() ? "" : grund);
      });
      feld.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" && !ev.isComposing && passt()) { ev.preventDefault(); loeschen.click(); }
      });

      loeschen.addEventListener("click", async function () {
        if (laeuft || !passt() || beschaeftigtZahl > 0) return;
        laeuft = true;
        feld.readOnly = true;
        const ok = await F.imDialog(d, loeschen, ol.beiLoeschen, {
          nachladen: false, grund: "geloescht", fehlerText: ol.fehlerText || "Löschen fehlgeschlagen."
        });
        laeuft = false;
        feld.readOnly = false;
        if (ok) geloeschtZeigen(ol.ende || {});
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

    /* Konto und «Abmelden» im Kopf, wie auf der Hauptseite. */
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
       ruhigen Abständen selbst – still, ohne Animation (die Seite zeichnet
       über F.seitenkopf und F.zeichneBereich, die abgleichen). Übersprungen
       wird, sobald Nachladen mehr stören als nützen würde: erlaubt() sagt
       es (Entwurf, Anlegen …), dazu nie bei offener Ebene, während der
       Arbeit, nach dem Löschen, in einem Hintergrund-Tab und während der
       Fokus in einem Eingabefeld steht (dort könnte gleich getippt werden). */
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
              text: "Die Zeile wurde in einem anderen Tab oder von einer anderen Person gelöscht."
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

      /* Eine offene Überlagerung (Dialog, Blatt, modale Schublade, Menü)
         hat Esc und Ctrl+S für sich: das sagt UI.ebeneOffen(). Nicht
         defaultPrevented – DS.overlay meldet seinen Esc-Zuhörer erst beim
         ersten Öffnen an, also nach diesem; er kommt hier zu spät. Was
         defaultPrevented trotzdem abfängt: Esc, das ein Teil der Seite schon
         verbraucht hat (eine gefüllte Suche leert sich). */
      document.addEventListener("keydown", function (ev) {
        // Ctrl+S bzw. Cmd+S: nur, wenn es etwas zu speichern gibt.
        if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && (ev.key === "s" || ev.key === "S")) {
          ev.preventDefault();
          if (UI.ebeneOffen() || !leiste().speicherbar()) return;
          e.speichern();
          return;
        }
        // Esc verwirft (mit Rückfrage). Während geschrieben wird, ist
        // «Verwerfen» gesperrt – Esc auch.
        if (ev.key === "Escape" && !ev.isComposing && !ev.defaultPrevented && !UI.ebeneOffen() && !geloescht
          && beschaeftigtZahl === 0 && !speichertIntern) {
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

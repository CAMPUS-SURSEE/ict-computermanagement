/* bewegung.js — die JS-Hälfte von bewegung.css (Namensraum «Bewegung»).

   Port von ChatBob design/motion.js und design/indicator.js mit deutschen
   Namen. Hier werden nur Klassen und Custom Properties umgeschaltet; die
   Zeiten stehen als Tokens in design.css. Wer auf eine Animation wartet,
   wartet immer auch mit einer Frist: für verborgene oder ausgehängte
   Elemente feuert animationend nie.

   Grundregeln (ChatBob designsystem.md):
     - Auftritte werden AUSDRÜCKLICH ausgelöst (erstes Zeigen, Wechsel der
       Ansicht), nie von Zeichenfunktionen selbst. Aktualisierte Daten
       (Auto-Nachladen, BroadcastChannel) animieren nie.
     - Ladeanzeigen erscheinen erst nach LADE_VERZOEGERUNG_MS und bleiben
       dann mindestens LADE_MINDESTENS_MS stehen.
     - Reduzierte Bewegung läuft über die Tokens (1 ms); hier zählen nur
       hochzaehlen (zeigt sofort das Ziel) und weiches Rollen.

   ------------------------------------------------------------------
   API
   ------------------------------------------------------------------
   Konstanten (müssen den Tokens entsprechen):
     Bewegung.LADE_VERZOEGERUNG_MS   200  (= --verzoegerung-lader)
     Bewegung.LADE_MINDESTENS_MS     450
     Bewegung.ZAEHLEN_MS             600  (= --dauer-gleiten)
     Bewegung.STAFFEL_MAX            5    (Stufen 0…5 = sechs)

   Bewegung.reduziert() → boolean
     prefers-reduced-motion: reduce aktiv?

   Bewegung.staffeln(elemente, { ab = 0, max = STAFFEL_MAX })
     Nummeriert Elemente für gestaffelte Auftritte (--i, über das CSSOM,
     also CSP-sicher). Elemente nach dem sechsten teilen die letzte Stufe.

   Bewegung.wiederholen(el, ...klassen)
     Startet eine einmalige Animationsklasse neu (der Browser spielt nur
     neu, wenn sich der Name ändert).

   Bewegung.abgeschlossen(el, { zeit = 1000, ereignis = 'animationend', eigenschaft }) → Promise
     Löst auf, wenn die EIGENE Animation/Transition des Elements endet
     (Kinder zählen nicht) oder nach «zeit» ms. «eigenschaft» wartet bei
     transitionend auf eine bestimmte Eigenschaft.

   Bewegung.eintreten(el, variante = '') → Promise
     Spielt .eintritt einmal und entfernt die Klassen danach (spätere
     Neuzeichnungen spielen ihn nicht erneut). Wartet auf ALLE eigenen
     Animationen (mit Frist); ein neuerer Ein- oder Austritt desselben
     Elements überholt den alten. Varianten: '' | 'blenden' |
     'skalieren' | 'schieben' | 'tausch' | 'verzoegert' | 'ploppen' |
     'aufziehen' | 'aufrichten'.

   Bewegung.austreten(el, variante = '', { dann = 'entfernen' }) → Promise
     Spielt .austritt und entfernt ('entfernen'), verbirgt ('verbergen':
     hidden + Klassen weg) oder behält ('behalten': Klassen bleiben) das
     Element. Varianten: '' | 'sinken' | 'skalieren' | 'schieben'.

   Bewegung.aufdecken(el) → Promise
     Frisch geladener Inhalt ersetzt seinen Platzhalter: bricht einen noch
     laufenden Eintritt im selben Takt ab (kein Bild mit halber Deckkraft)
     und spielt eintreten(el, 'tausch'). (ChatBob reveal)

   Bewegung.ladeHaltenMs(start, jetzt = Date.now()) → ms
     Wie lange eine um «start» eingefügte Ladeanzeige noch bleiben muss:
     0, wenn sie nie sichtbar wurde (< 200 ms) oder schon ≥ 450 ms sichtbar
     war, sonst der Rest der 450 ms.
   Bewegung.ladeAbwarten(start, jetzt) → Promise
     Wartet genau so lange.

   Bewegung.kurveAusgleiten(t) → 0…1
     Die Kurve des Hochzählens (ease-out cubic) für eigene Schritte per
     requestAnimationFrame; t von 0 bis 1.

   Bewegung.hochzaehlen(el, ziel, { format, dauer = 600 })
     Zählt die Zahl im Text von 0 auf «ziel» (ease-out cubic). Ohne rAF,
     mit reduzierter Bewegung oder bei 0 sofort der Endwert. Standard-
     format: de-CH («1’284»).
   Bewegung.zahlenHochzaehlen(behaelter)
     Zählt jedes [data-zahl] im Behälter hoch und behält, was hinter der
     letzten Ziffer steht («88 %» zählt 88 und behält « %»).
   Bewegung.aufziehen(behaelter)
     Lässt .balken-fuell und .saeule-fuell einmal zu ihrem Anteil wachsen.
   Bewegung.auftritt(behaelter, { wurzel = true })
     Der Auftritt einer frisch geladenen Ansicht (ChatBob animateEntrance):
     staffelt die Kinder von .karten, .raster-2, .stapel, .kacheln,
     .zeilenliste, zählt [data-zahl] hoch und zieht Balken auf. NUR beim
     ersten Zeigen bzw. Ansichtswechsel aufrufen (Rahmen.erstauftritt).
     wurzel: false staffelt nur Raster IM Behälter, nicht den Behälter
     selbst (so ruft Rahmen ihn für ganze Ansichten auf: der Seitenkopf
     erscheint mit der Ansicht, nicht als erste Staffelstufe). Listen-
     einträge (.zeilenliste) blenden in 150 statt 250 ms ein.

   Bewegung.indikator(spur, { aktiv: selektor, klasse }) → { aktualisieren(), zerstoeren() }
     Ein Element hinter den Einträgen, das zum aktiven gleitet, statt dass
     jeder Eintrag seine eigene Fläche malt. Waagrecht und senkrecht, in
     rollenden Spuren und mit umbrechenden Einträgen. Erste Platzierung
     und Grössenänderungen springen; nur ein Wechsel des aktiven Eintrags
     gleitet. «klasse» gibt das Aussehen (Fläche, Radius).

   Beispiel:
     const start = Date.now();
     tafel.appendChild(UI.skelettSeite({ karten: 2 }));   // unsichtbar für 200 ms
     const daten = await laden();
     await Bewegung.ladeAbwarten(start);                   // sichtbares Skelett ≥ 450 ms
     UI.leeren(tafel).appendChild(inhalt);
     Bewegung.aufdecken(inhalt);
     Bewegung.auftritt(inhalt);
   ------------------------------------------------------------------ */

"use strict";

const Bewegung = (function () {

  /** Muss --verzoegerung-lader entsprechen. */
  const LADE_VERZOEGERUNG_MS = 200;
  /** Eine sichtbar gewordene Ladeanzeige bleibt mindestens so lange: eine,
      die erscheint und gleich wieder verschwindet, wirkt wie Flackern. */
  const LADE_MINDESTENS_MS = 450;
  /** Muss --dauer-gleiten entsprechen. */
  const ZAEHLEN_MS = 600;
  /** Höchste Staffelstufe: 30 ms × höchstens sechs Schritte (0…5). */
  const STAFFEL_MAX = 5;
  /** Längste Animation des Systems (--dauer-gleiten) plus Reserve. */
  const STANDARD_FRIST_MS = 1000;
  /** So lange gilt ein Gleiten des Indikators als laufend. */
  const INDIKATOR_GLEITEN_MS = 600;

  const EINTRITT_VARIANTEN = ["blenden", "skalieren", "schieben", "tausch", "verzoegert",
    "ploppen", "aufziehen", "aufrichten"];
  const AUSTRITT_VARIANTEN = ["sinken", "skalieren", "schieben"];

  /* Grids, deren Kinder beim ersten Zeigen gestaffelt einblenden. */
  const STAFFEL_RASTER = ".karten, .raster-2, .stapel, .kacheln, .zeilenliste";

  const zahlFormat = (function () {
    try { return new Intl.NumberFormat("de-CH"); } catch (e) { return null; }
  })();

  function zahlText(wert) {
    const gerundet = Math.round(wert);
    return zahlFormat ? zahlFormat.format(gerundet) : String(gerundet);
  }

  function reduziert() {
    try {
      return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (e) {
      return false;
    }
  }

  function staffeln(elemente, optionen) {
    const o = optionen || {};
    const ab = o.ab || 0;
    const max = o.max === undefined ? STAFFEL_MAX : o.max;
    let i = 0;
    for (const element of Array.from(elemente || [])) {
      element.style.setProperty("--i", String(Math.min(ab + i, max)));
      i += 1;
    }
  }

  function wiederholen(element) {
    if (!element) return;
    const klassen = Array.prototype.slice.call(arguments, 1);
    element.classList.remove.apply(element.classList, klassen);
    void element.offsetWidth;   // das Lesen des Layouts übernimmt das Entfernen
    element.classList.add.apply(element.classList, klassen);
  }

  function abgeschlossen(element, optionen) {
    const o = optionen || {};
    const zeit = o.zeit || STANDARD_FRIST_MS;
    const ereignis = o.ereignis || "animationend";
    return new Promise(function (aufloesen) {
      if (!element) { aufloesen(); return; }
      let uhr = 0;
      function fertig(e) {
        if (e && (e.target !== element || (o.eigenschaft && e.propertyName !== o.eigenschaft))) return;
        clearTimeout(uhr);
        element.removeEventListener(ereignis, fertig);
        aufloesen();
      }
      element.addEventListener(ereignis, fertig);
      uhr = setTimeout(fertig, zeit);
    });
  }

  function eintrittKlassen(variante) {
    return variante && EINTRITT_VARIANTEN.indexOf(variante) !== -1
      ? ["eintritt", "eintritt--" + variante] : ["eintritt"];
  }

  function austrittKlassen(variante) {
    return variante && AUSTRITT_VARIANTEN.indexOf(variante) !== -1
      ? ["austritt", "austritt--" + variante] : ["austritt"];
  }

  function alleAustrittKlassen() {
    return ["austritt"].concat(AUSTRITT_VARIANTEN.map(function (v) { return "austritt--" + v; }));
  }

  /* Abweichung von ChatBob (Robustheit): ein Eintritt besteht aus ZWEI
     Animationen. Auf das erste animationend zu warten, lässt das zweite
     als Nachzügler stehen – ein gleich danach gestarteter Austritt hielte
     es für sein eigenes Ende und entfernte das Element ohne Bewegung.
     Darum wartet ein Ein- oder Austritt auf ALLE eigenen Animationen
     (Web Animations API, mit Frist), und eine Laufnummer pro Element sorgt
     dafür, dass ein überholter Lauf die Klassen eines neueren nicht
     wegnimmt (aufdecken während eines laufenden Eintritts). */
  const EINTRITT_KEYFRAMES = ["einblenden", "anheben", "wachsen", "einschieben", "einrollen",
    "aufploppen", "zeichnen", "aufziehen", "aufrichten"];
  const AUSTRITT_KEYFRAMES = ["ausblenden", "absinken", "schrumpfen", "wegschieben", "ausrollen"];
  const laeufe = new WeakMap();

  function neuerLauf(element) {
    const nr = (laeufe.get(element) || 0) + 1;
    laeufe.set(element, nr);
    return nr;
  }

  function animationenAbwarten(element, namen) {
    const eigene = element.getAnimations
      ? element.getAnimations().filter(function (a) { return namen.indexOf(a.animationName) !== -1; })
      : [];
    // Ohne Animation (verborgen, ausgehängt, kein Web-Animations-API): Ereignis mit Frist.
    if (!eigene.length) return abgeschlossen(element);
    return Promise.race([
      Promise.all(eigene.map(function (a) { return a.finished.catch(function () {}); })),
      new Promise(function (r) { setTimeout(r, STANDARD_FRIST_MS); })
    ]);
  }

  function eintreten(element, variante) {
    if (!element) return Promise.resolve();
    const lauf = neuerLauf(element);
    const klassen = eintrittKlassen(variante);
    element.classList.remove.apply(element.classList, alleAustrittKlassen());
    wiederholen.apply(null, [element].concat(klassen));
    return animationenAbwarten(element, EINTRITT_KEYFRAMES).then(function () {
      if (laeufe.get(element) === lauf) element.classList.remove.apply(element.classList, klassen);
    });
  }

  function austreten(element, variante, optionen) {
    if (!element) return Promise.resolve();
    const lauf = neuerLauf(element);
    const dann = (optionen && optionen.dann) || "entfernen";
    const klassen = austrittKlassen(variante);
    element.classList.remove("eintritt");
    element.classList.add.apply(element.classList, klassen);
    return animationenAbwarten(element, AUSTRITT_KEYFRAMES).then(function () {
      if (laeufe.get(element) !== lauf) return;   // ein neuerer Ein- oder Austritt gilt
      if (dann === "entfernen") {
        element.remove();
      } else if (dann === "verbergen") {
        element.hidden = true;
        element.classList.remove.apply(element.classList, klassen);
      }
    });
  }

  function aufdecken(element) {
    if (!element) return Promise.resolve();
    if (element.classList.contains("eintritt") && element.getAnimations) {
      element.getAnimations().forEach(function (a) { a.cancel(); });
    }
    return eintreten(element, "tausch");
  }

  function ladeHaltenMs(start, jetzt) {
    const sichtbar = (jetzt === undefined ? Date.now() : jetzt) - start - LADE_VERZOEGERUNG_MS;
    if (sichtbar <= 0 || sichtbar >= LADE_MINDESTENS_MS) return 0;
    return LADE_MINDESTENS_MS - sichtbar;
  }

  function ladeAbwarten(start, jetzt) {
    const ms = ladeHaltenMs(start, jetzt);
    return ms ? new Promise(function (r) { setTimeout(r, ms); }) : Promise.resolve();
  }

  function kurveAusgleiten(t) { return 1 - Math.pow(1 - t, 3); }

  function hochzaehlen(element, ziel, optionen) {
    if (!element) return;
    const o = optionen || {};
    const format = o.format || zahlText;
    const dauer = o.dauer || ZAEHLEN_MS;
    const endwert = Number(ziel) || 0;
    if (!window.requestAnimationFrame || reduziert() || endwert === 0) {
      element.textContent = format(endwert);
      return;
    }
    const start = (window.performance && performance.now) ? performance.now() : Date.now();
    function schritt(zeit) {
      const anteil = Math.min(1, Math.max(0, (zeit - start) / dauer));
      element.textContent = format(anteil >= 1 ? endwert : endwert * kurveAusgleiten(anteil));
      if (anteil < 1 && element.isConnected) window.requestAnimationFrame(schritt);
    }
    element.textContent = format(0);
    window.requestAnimationFrame(schritt);
  }

  function mitSelbst(behaelter, selektor) {
    if (!behaelter || !behaelter.querySelectorAll) return [];
    const liste = Array.from(behaelter.querySelectorAll(selektor));
    if (behaelter.matches && behaelter.matches(selektor)) liste.unshift(behaelter);
    return liste;
  }

  function zahlenHochzaehlen(behaelter) {
    for (const wert of mitSelbst(behaelter, "[data-zahl]")) {
      const ziel = Number(wert.getAttribute("data-zahl"));
      if (!isFinite(ziel)) continue;
      // «88 %» zählt 88 und behält « %».
      const nachsatz = /\d/.test(wert.textContent) ? wert.textContent.replace(/^.*\d/, "") : "";
      hochzaehlen(wert, ziel, { format: function (z) { return zahlText(z) + nachsatz; } });
    }
  }

  function aufziehen(behaelter) {
    for (const f of mitSelbst(behaelter, ".balken-fuell")) eintreten(f, "aufziehen");
    for (const f of mitSelbst(behaelter, ".saeule-fuell")) eintreten(f, "aufrichten");
  }

  /* Laufnummer der Staffelung pro Raster: eine Ansicht, die während ihrer
     Staffelung verborgen und gleich wieder gezeigt wird, startet eine neue;
     die Frist der alten darf die Klasse dann nicht mitten darin entfernen. */
  const staffelLaeufe = new WeakMap();

  function auftritt(behaelter, optionen) {
    if (!behaelter) return;
    // Wie ChatBob animateEntrance: Rahmen ruft den Auftritt für die ganze
    // Ansicht auf und staffelt nur die Raster DARIN; Seitenkopf, Banner und
    // Werkzeugleiste erscheinen mit der Ansicht selbst (wurzel: false).
    const mitWurzel = !optionen || optionen.wurzel !== false;
    const raster = mitWurzel ? mitSelbst(behaelter, STAFFEL_RASTER)
      : (behaelter.querySelectorAll ? Array.from(behaelter.querySelectorAll(STAFFEL_RASTER)) : []);
    for (const r of raster) {
      if (!r.lastElementChild) continue;
      const lauf = (staffelLaeufe.get(r) || 0) + 1;
      staffelLaeufe.set(r, lauf);
      staffeln(r.children);
      // wiederholen: stand die Klasse noch (zweiter Auftritt in der Frist), spielt die Staffelung neu.
      wiederholen(r, "staffel");
      // Später eingefügte Kinder (Nachladen, «Mehr laden») blenden nicht erneut ein.
      abgeschlossen(r.lastElementChild).then(function () {
        if (staffelLaeufe.get(r) === lauf) r.classList.remove("staffel");
      });
    }
    zahlenHochzaehlen(behaelter);
    aufziehen(behaelter);
  }

  function indikator(spur, optionen) {
    const o = optionen || {};
    const aktiv = o.aktiv;
    const anzeige = document.createElement("span");
    anzeige.className = "indikator indikator--sofort" + (o.klasse ? " " + o.klasse : "");
    anzeige.setAttribute("aria-hidden", "true");
    spur.prepend(anzeige);
    spur.classList.add("hat-indikator");

    /* Zuletzt platzierter Eintrag: nur ein ANDERER Eintrag gleitet. */
    let platziert = null;
    /* Während ein Gleiten läuft, lenken Grössenänderungen (die aktive
       Beschriftung wird 500) es um, statt es abzuschneiden. */
    let gleitenBis = 0;

    function platzieren(gleitend) {
      const eintrag = spur.querySelector(aktiv);
      const spurRect = spur.getBoundingClientRect();
      if (!eintrag || spurRect.width === 0) {
        anzeige.dataset.leer = "";
        platziert = null;
        return;
      }
      const rect = eintrag.getBoundingClientRect();
      const jetzt = Date.now();
      const gleiten = (gleitend && platziert !== null && platziert !== eintrag) || jetzt < gleitenBis;
      if (gleiten && platziert !== eintrag) gleitenBis = jetzt + INDIKATOR_GLEITEN_MS;
      anzeige.classList.toggle("indikator--sofort", !gleiten);
      const s = anzeige.style;
      s.setProperty("--indikator-x", (rect.left - spurRect.left - spur.clientLeft + spur.scrollLeft) + "px");
      s.setProperty("--indikator-y", (rect.top - spurRect.top - spur.clientTop + spur.scrollTop) + "px");
      s.setProperty("--indikator-w", rect.width + "px");
      s.setProperty("--indikator-h", rect.height + "px");
      delete anzeige.dataset.leer;
      platziert = eintrag;
    }

    const beobachter = typeof ResizeObserver === "function"
      ? new ResizeObserver(function () { platzieren(false); }) : null;
    if (beobachter) beobachter.observe(spur);
    // Webschriften ändern die Breite der Einträge, sobald sie da sind.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { platzieren(false); }).catch(function () {});
    }

    platzieren(false);

    return {
      element: anzeige,
      aktualisieren: function () { platzieren(true); },
      zerstoeren: function () {
        if (beobachter) beobachter.disconnect();
        anzeige.remove();
        spur.classList.remove("hat-indikator");
      }
    };
  }

  return Object.freeze({
    LADE_VERZOEGERUNG_MS: LADE_VERZOEGERUNG_MS,
    LADE_MINDESTENS_MS: LADE_MINDESTENS_MS,
    ZAEHLEN_MS: ZAEHLEN_MS,
    STAFFEL_MAX: STAFFEL_MAX,
    reduziert: reduziert,
    staffeln: staffeln,
    wiederholen: wiederholen,
    abgeschlossen: abgeschlossen,
    eintreten: eintreten,
    austreten: austreten,
    aufdecken: aufdecken,
    ladeHaltenMs: ladeHaltenMs,
    ladeAbwarten: ladeAbwarten,
    kurveAusgleiten: kurveAusgleiten,
    hochzaehlen: hochzaehlen,
    zahlenHochzaehlen: zahlenHochzaehlen,
    aufziehen: aufziehen,
    auftritt: auftritt,
    indikator: indikator
  });
})();

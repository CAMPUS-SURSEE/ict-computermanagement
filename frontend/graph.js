/* graph.js — Daten für das ICT-Inventar.

   Drei Teile:
     1. Hilfe   — Formatierung von Datum, Zahlen, Ja/Nein und mehrzeiligem Text.
     2. Daten   — Lesen und Schreiben der fünf SharePoint-Listen über Microsoft Graph.
     3. Mock    — Fantasie-Datensatz für den Modus ?mock=1.

   Die Berechtigung ist delegiert (Sites.ReadWrite.All): das Token kann genau
   das, was die angemeldete Person in SharePoint ohnehin darf.

   Öffentliche Schnittstelle (auch im Vorführmodus identisch):
     await Daten.clients(liste, fortschritt) → Array flacher Zeilen ("admin" | "edu")
     await Daten.benutzer(fortschritt)     → Array flacher Zeilen
     await Daten.telefone(fortschritt)     → Array flacher Zeilen
     await Daten.software(fortschritt)     → Array flacher Zeilen der Liste «Software»
     await Daten.kameras(fortschritt)      → Array flacher Zeilen der Liste «Kameras»
     await Daten.kameraRollen(fortschritt) → Array flacher Zeilen der Liste «Kamera-Rollen»
       (jede flache Zeile trägt ihr eTag als «__etag»)
     await Daten.zeile(liste, id)          → eine Zeile
     await Daten.speichern(liste, id, felder, etagErwartet?)
                                           → geänderte Felder mit «__etag» (das neue
                                             eTag; F.uebernehmen trägt es in die Zeile).
                                             etagErwartet: 412 statt Überschreiben, wenn
                                             die Zeile inzwischen anders ist
     await Daten.anlegen(liste, felder)    → neue Zeile
     await Daten.loeschen(liste, id)       → true
     await Daten.programmSpalteAnlegen(id, name) → legt die Spalte eines neuen
                                             Programms in der Benutzer-Liste an
     await Daten.syncStatus()              → { zeit, text } des letzten Sync-Laufs
                                             oder null
     Daten.mockModus                       → true im Vorführmodus (?mock=1)
   «liste» ist "admin", "edu", "benutzer", "telefon", "software", "kamera" oder
   "kamerarolle".
   «fortschritt» ist eine Rückrufe-Funktion, die nach jeder geladenen Seite die
   bisherige Anzahl bekommt.

   Setzt konfig.js, spalten.js und auth.js voraus. */

"use strict";


/* ==================================================================
   1. Hilfe — Formatierung
   ================================================================== */

const Hilfe = (function () {

  const MS_TAG = 24 * 60 * 60 * 1000;

  /* Aus einem ISO-Zeitstempel (Graph liefert UTC) ein Date-Objekt, oder null. */
  function datum(wert) {
    if (!wert) return null;
    const d = wert instanceof Date ? wert : new Date(wert);
    return isNaN(d.getTime()) ? null : d;
  }

  function zweistellig(n) { return String(n).padStart(2, "0"); }

  /* «2026-09-01T05:41:00Z» -> «01.09.2026 07:41» in lokaler Zeit. */
  function datumZeitText(wert) {
    const d = datum(wert);
    if (!d) return "";
    return zweistellig(d.getDate()) + "." + zweistellig(d.getMonth() + 1) + "."
      + d.getFullYear() + " " + zweistellig(d.getHours()) + ":" + zweistellig(d.getMinutes());
  }

  /* Nur der Tag: «01.09.2026». */
  function datumText(wert) {
    const d = datum(wert);
    if (!d) return "";
    return zweistellig(d.getDate()) + "." + zweistellig(d.getMonth() + 1) + "." + d.getFullYear();
  }

  /* Ganze Tage zwischen dem Zeitpunkt und jetzt. Negativ, wenn in der Zukunft. */
  function tageHer(wert) {
    const d = datum(wert);
    if (!d) return null;
    return Math.floor((Date.now() - d.getTime()) / MS_TAG);
  }

  /* «vor 3 Tagen», «heute», «vor 2 Monaten». */
  function relativText(wert) {
    const tage = tageHer(wert);
    if (tage === null) return "";
    if (tage < 0) return "in der Zukunft";
    if (tage === 0) return "heute";
    if (tage === 1) return "gestern";
    if (tage < 31) return "vor " + tage + " Tagen";
    if (tage < 365) {
      const monate = Math.round(tage / 30);
      return monate <= 1 ? "vor einem Monat" : "vor " + monate + " Monaten";
    }
    const jahre = Math.floor(tage / 365);
    return jahre <= 1 ? "vor einem Jahr" : "vor " + jahre + " Jahren";
  }

  /* Zahlen in Schweizer Schreibweise: derselbe Formatierer wie UI.zahlText
     (bausteine.js, auf allen Seiten vor graph.js geladen) – ohne
     «nachkomma» höchstens eine Nachkommastelle, sonst genau so viele. Der
     Rückfall gilt nur, wo graph.js ohne die Bausteine läuft. */
  function zahlText(wert, nachkomma) {
    if (typeof UI !== "undefined" && UI.zahlText) return UI.zahlText(wert, nachkomma);
    if (wert === null || wert === undefined || wert === "") return "";
    const n = Number(wert);
    return isNaN(n) ? String(wert) : String(n);
  }

  /* Ja/Nein: SCCM und AD liefern Text, ältere Spalten echte Wahrheitswerte. */
  function istJa(wert) {
    if (wert === true) return true;
    if (typeof wert === "string") {
      const t = wert.trim().toLowerCase();
      return t === "ja" || t === "true" || t === "yes" || t === "1";
    }
    return false;
  }

  /* Mehrzeilige Note-Spalten in saubere Zeilen zerlegen. */
  function zeilen(wert) {
    if (!wert) return [];
    return String(wert).replace(/\r/g, "").split("\n")
      .map(z => z.trim()).filter(z => z.length > 0);
  }

  /* Eine Zeile einer Note-Spalte am Trennzeichen «|» in Felder zerlegen. */
  function felder(zeile) {
    return String(zeile).split("|").map(f => f.trim());
  }

  /* Sortierung immer mit Schweizer Regeln (ä vor b, Gross/Klein egal). */
  const sammler = new Intl.Collator("de-CH", { sensitivity: "base", numeric: true });

  function vergleiche(a, b) {
    return sammler.compare(a === null || a === undefined ? "" : String(a),
                           b === null || b === undefined ? "" : String(b));
  }

  return {
    datum: datum, datumText: datumText, datumZeitText: datumZeitText,
    tageHer: tageHer, relativText: relativText, zahlText: zahlText,
    istJa: istJa, zeilen: zeilen, felder: felder, vergleiche: vergleiche
  };
})();


/* ==================================================================
   2. Daten — Microsoft Graph
   ================================================================== */

const Daten = (function () {

  const WURZEL = "https://graph.microsoft.com/v1.0";
  const ABFRAGE = new URLSearchParams(location.search);
  const mockModus = ABFRAGE.get("mock") === "1";

  const LISTEN_TITEL = {
    admin: "ADMIN-Clients", edu: "EDU-Clients", benutzer: "Benutzer",
    telefon: "Telefonnummern", software: "Software",
    kamera: "Kameras", kamerarolle: "Kamera-Rollen"
  };

  function listenPfad(liste) {
    if (!KONFIG.listeBereit(liste)) {
      const fehler = new Error(
        "In konfig.js fehlt die Listen-ID der Liste «" + (LISTEN_TITEL[liste] || liste)
        + "». Sie steht in SharePoint in den Listeneinstellungen. "
        + "Bis dahin lässt sich die Seite mit ?mock=1 im Vorführmodus anschauen.");
      fehler.status = 0;
      fehler.konfiguration = true;
      throw fehler;
    }
    return "/sites/" + KONFIG.siteId + "/lists/" + KONFIG.listId(liste);
  }

  function warten(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }

  /* Eine Anfrage an Graph. Bei Drosselung (429) oder kurzer Störung (503,
     504) wird bis zu dreimal gewartet und wiederholt — so lange, wie Graph
     es im Kopf «Retry-After» verlangt, sonst 2, 4, 6 Sekunden. Ein POST
     wird nie wiederholt: er könnte sonst eine zweite Zeile anlegen. */
  async function anfrage(pfad, einstellungen) {
    const e = einstellungen || {};
    const methode = e.methode || "GET";
    const url = pfad.indexOf("http") === 0 ? pfad : WURZEL + pfad;
    let rumpf;
    if (e.rumpf !== undefined && e.rumpf !== null) rumpf = JSON.stringify(e.rumpf);

    for (let versuch = 1; ; versuch++) {
      const zugriff = await Auth.token();
      const kopfzeilen = {
        "Authorization": "Bearer " + zugriff,
        "Accept": e.roh ? "*/*" : "application/json"
      };
      if (rumpf !== undefined) kopfzeilen["Content-Type"] = "application/json";
      if (e.kopf) for (const name in e.kopf) kopfzeilen[name] = e.kopf[name];

      const antwort = await fetch(url, { method: methode, headers: kopfzeilen, body: rumpf });

      // DELETE antwortet mit 204 und leerem Rumpf.
      const daten = antwort.status === 204 ? null : await antwort.json().catch(() => null);
      if (antwort.ok) return daten;

      // Token abgelehnt: nicht halb angemeldet weiterlaufen, sondern
      // abmelden und die Anmeldeseite zeigen (Auth.abgelehnt löst nie auf,
      // oder wirft, wenn auch die frische Anmeldung abgelehnt wurde).
      if (antwort.status === 401) await Auth.abgelehnt(antwort.headers.get("WWW-Authenticate"));

      const wiederholbar = (antwort.status === 429 || antwort.status === 503 || antwort.status === 504)
        && methode !== "POST" && versuch < 4;
      if (wiederholbar) {
        const nach = Number(antwort.headers.get("Retry-After"));
        await warten((nach > 0 ? Math.min(nach, 30) : versuch * 2) * 1000);
        continue;
      }
      const fehler = new Error(lesbarerFehler(antwort.status, daten, methode, e.was));
      fehler.status = antwort.status;
      throw fehler;
    }
  }

  function lesbarerFehler(status, daten, methode, was) {
    const meldung = daten && daten.error && (daten.error.message || daten.error.code);
    const schreibend = methode && methode !== "GET";
    const ziel = was || "die Liste";
    if (status === 400) return "Microsoft Graph hat die Änderung abgelehnt ("
      + (meldung || "ungültiger Wert") + "). Bitte die Eingaben prüfen.";
    if (status === 401) return "Die Anmeldung wurde abgelehnt. Bitte abmelden und neu anmelden.";
    if (status === 403 && schreibend) return "Keine Schreibberechtigung für " + ziel
      + ". Entweder darf das Konto in SharePoint nur lesen, oder der App-Registrierung "
      + "«Computer Inventar Frontend» fehlt die Berechtigung Sites.ReadWrite.All.";
    if (status === 403) return "Keine Berechtigung für " + ziel + ". Bitte prüfen, ob das "
      + "Konto Zugriff auf die SharePoint-Site «mgmts-ict-s» hat.";
    if (status === 409 || status === 412) return "Die Zeile wurde inzwischen anderswo "
      + "geändert. Bitte neu laden und nochmals speichern.";
    if (status === 404) return "Die Zeile wurde inzwischen gelöscht, oder eine ID "
      + "in konfig.js stimmt nicht (betrifft " + ziel + ").";
    if (status === 429) return "Zu viele Anfragen an Microsoft Graph. "
      + "Bitte eine Minute warten und dann neu laden.";
    if (status >= 500) return "Microsoft Graph antwortet gerade nicht (HTTP " + status + "). "
      + "Bitte später noch einmal versuchen.";
    return meldung || ("Fehler von Microsoft Graph (HTTP " + status + ").");
  }

  /* Graph verschachtelt die Listenspalten unter «fields». Flach ist bequemer.
     Das eTag der Zeile kommt als «__etag» mit: damit erkennt speichern(),
     ob jemand anderes die Zeile inzwischen geändert hat. */
  function flach(element) {
    const satz = Object.assign({}, element.fields || {});
    satz.id = element.id;
    satz.__etag = String(element.eTag || "");
    return satz;
  }

  /* Alle Zeilen einer Liste, inklusive Folgeseiten.
     Bewusst ohne $select und ohne serverseitiges $filter: die Client-Listen
     haben rund 86 Spalten, die Benutzer-Liste wächst mit jedem Programm, und
     ein paar hundert Zeilen filtert der Browser mühelos selbst. */
  async function alleZeilen(liste, fortschritt) {
    if (mockModus) return Mock.zeilen(liste);
    let url = listenPfad(liste) + "/items?$expand=fields&$top=999";
    const treffer = [];
    while (url) {
      const seite = await anfrage(url, { was: "die Liste «" + LISTEN_TITEL[liste] + "»" });
      for (const el of (seite.value || [])) treffer.push(flach(el));
      if (fortschritt) fortschritt(treffer.length);
      url = seite["@odata.nextLink"] || null;
    }
    return treffer;
  }

  /** Alle Clients einer der beiden Listen ("admin" | "edu"). */
  async function clients(liste, fortschritt) {
    return alleZeilen(liste === "edu" ? "edu" : "admin", fortschritt);
  }

  /** Alle Benutzer. */
  async function benutzer(fortschritt) { return alleZeilen("benutzer", fortschritt); }

  /** Alle Telefonnummern. */
  async function telefone(fortschritt) { return alleZeilen("telefon", fortschritt); }

  /** Alle Zeilen der Liste «Software» (eine je Programm). */
  async function software(fortschritt) { return alleZeilen("software", fortschritt); }

  /** Alle Kameras (eine Zeile je Hardware in Milestone). */
  async function kameras(fortschritt) { return alleZeilen("kamera", fortschritt); }

  /** Alle Rollen aus Milestone samt Rechten auf die Kameras. */
  async function kameraRollen(fortschritt) { return alleZeilen("kamerarolle", fortschritt); }

  /** Legt die Spalte eines neuen Programms in der Benutzer-Liste an.

     Ein Programm ohne Spalte ist wirkungslos: die Berechtigungsstufe steht
     je Person in einer eigenen Textspalte der Benutzer-Liste, deren interner
     Name die Programm-Id ist. Deshalb legt das Softwarefenster die Spalte
     gleich beim Erfassen an — sonst müsste jemand von Hand
     Ergaenze-Spalten.ps1 nachschieben.

     Der Sync legt weiterhin nie eine Spalte an; das hier tut ein Mensch mit
     seinen eigenen Rechten (delegiert Sites.ReadWrite.All).

     Gibt es die Spalte schon, ist das kein Fehler — dann war sie von einem
     früheren Versuch übrig. */
  async function programmSpalteAnlegen(id, name) {
    if (mockModus) return Mock.programmSpalteAnlegen(id, name);
    const pfad = listenPfad("benutzer") + "/columns";
    const was = "die Spalte «" + id + "» der Liste «Benutzer»";
    const vorhanden = await anfrage(pfad + "?$select=id,name", { was: was });
    for (const c of (vorhanden.value || [])) {
      if (String(c.name) === String(id)) return false;
    }
    await anfrage(pfad, {
      methode: "POST", was: was,
      rumpf: {
        name: id,
        displayName: name || id,
        description: "Berechtigungsstufe: 0 = aus, 1 = manuell aktiviert, "
          + "2 = durch AD-Gruppe aktiviert",
        text: { allowMultipleLines: false, maxLength: 8 }
      }
    });
    return true;
  }

  /** Eine einzelne Zeile, flach wie bei clients()/benutzer(). */
  async function zeile(liste, id) {
    if (mockModus) return Mock.zeile(liste, id);
    const el = await anfrage(listenPfad(liste) + "/items/" + encodeURIComponent(id)
      + "?$expand=fields", { was: "die Liste «" + LISTEN_TITEL[liste] + "»" });
    return flach(el);
  }

  /* Ändert nur die übergebenen Felder einer Zeile. «felder» ist ein flaches
     Objekt { InternerName: Wert }; Texte als Zeichenkette (leer = ""),
     Zahlen als Zahl oder null. Alles Übrige bleibt unangetastet.

     «etagErwartet» ist das eTag der Zeile, wie sie geladen wurde (__etag).
     Ist es gesetzt, wird vor dem Schreiben nachgesehen, ob die Zeile noch
     dieselbe ist — sonst hätte die zweite Person die Änderung der ersten
     stillschweigend überschrieben. Bei Abweichung kommt Fehler 412 zurück:
     neu laden, dann noch einmal.

     Zwischen Nachsehen und Schreiben könnte trotzdem jemand schreiben. Der
     PATCH trägt darum zusätzlich «If-Match»: dann prüft Graph selbst, im
     selben Schritt, und antwortet bei einem Konflikt mit 412 (Fehler A9).
     Weil sich das gegen das echte SharePoint nicht vorab prüfen lässt, ist
     der Kopf nur ein Zusatz: scheitert der PATCH mit If-Match aus einem
     anderen Grund als einem bestätigten Konflikt (412 und das eTag hat sich
     wirklich geändert), wird er einmal ohne den Kopf wiederholt — schlimmstens
     also das Verhalten von vorher. */
  async function speichern(liste, id, felder, etagErwartet) {
    if (mockModus) return Mock.speichern(liste, id, felder);
    const was = "die Liste «" + LISTEN_TITEL[liste] + "»";
    const elementPfad = listenPfad(liste) + "/items/" + encodeURIComponent(id);
    async function etagJetzt() {
      const jetzt = await anfrage(elementPfad + "?$select=id,eTag", { was: was });
      return String(jetzt && jetzt.eTag || "");
    }
    function konflikt() {
      const fehler = new Error(lesbarerFehler(412, null, "PATCH", was));
      fehler.status = 412;
      return fehler;
    }
    if (etagErwartet) {
      const aktuell = await etagJetzt();
      if (aktuell && aktuell !== String(etagErwartet)) throw konflikt();
    }
    const schreiben = { methode: "PATCH", rumpf: felder, was: was };
    let geaendert;
    if (!etagErwartet) {
      geaendert = await anfrage(elementPfad + "/fields", schreiben);
    } else {
      try {
        geaendert = await anfrage(elementPfad + "/fields",
          Object.assign({ kopf: { "If-Match": String(etagErwartet) } }, schreiben));
      } catch (fehler) {
        if (fehler && (fehler.status === 412 || fehler.status === 409)) {
          const aktuell = await etagJetzt();
          if (aktuell && aktuell !== String(etagErwartet)) throw konflikt();
        }
        geaendert = await anfrage(elementPfad + "/fields", schreiben);
      }
    }
    const satz = Object.assign({}, geaendert || {});
    satz.id = String(id);
    // Das neue eTag der Zeile (Graph liefert es mit den Feldern): wer die
    // Zeile lokal weiterführt, schickt beim nächsten Speichern das richtige.
    if (satz["@odata.etag"]) satz.__etag = String(satz["@odata.etag"]);
    return satz;
  }

  /** Legt eine neue Zeile an und gibt sie flach zurück. */
  async function anlegen(liste, felder) {
    if (mockModus) return Mock.anlegen(liste, felder);
    const el = await anfrage(listenPfad(liste) + "/items",
      { methode: "POST", rumpf: { fields: felder },
        was: "die Liste «" + LISTEN_TITEL[liste] + "»" });
    return flach(el);
  }

  /* Löscht eine Zeile. SharePoint legt sie in den Papierkorb der Site, ein
     Versehen lässt sich dort innerhalb von 93 Tagen rückgängig machen. */
  async function loeschen(liste, id) {
    if (mockModus) return Mock.loeschen(liste, id);
    await anfrage(listenPfad(liste) + "/items/" + encodeURIComponent(id),
      { methode: "DELETE", was: "die Liste «" + LISTEN_TITEL[liste] + "»" });
    return true;
  }

  /** Zustand des letzten Sync-Laufs (Sync-Inventar.ps1 auf adminsrv319):
     { zeit, text } aus Änderungszeit und Titel der Datei
     Inventar/sync-status.json, die der Sync nach jedem vollständigen Lauf
     schreibt. Gelesen werden nur die Metadaten über Graph – der Inhalt käme
     über eine Umleitung nach SharePoint, die die Inhaltsrichtlinie
     (_headers, connect-src) nicht zulässt. null, wenn die Datei fehlt oder
     nicht lesbar ist; die Übersicht zeigt dann nichts dazu an. */
  async function syncStatus() {
    if (mockModus) return Mock.syncStatus();
    try {
      const d = await anfrage("/sites/" + KONFIG.siteId
        + "/drive/root:/Inventar/sync-status.json?$expand=listItem($expand=fields($select=Title))",
        { was: "den Sync-Status" });
      const felder = d && d.listItem && d.listItem.fields ? d.listItem.fields : {};
      return { zeit: d ? d.lastModifiedDateTime : null, text: String(felder.Title || "") };
    } catch (e) {
      return null;
    }
  }

  return {
    mockModus: mockModus,
    clients: clients,
    benutzer: benutzer,
    telefone: telefone,
    software: software,
    kameras: kameras,
    kameraRollen: kameraRollen,
    zeile: zeile,
    speichern: speichern,
    anlegen: anlegen,
    loeschen: loeschen,
    programmSpalteAnlegen: programmSpalteAnlegen,
    syncStatus: syncStatus
  };
})();


/* ==================================================================
   3. Mock — Fantasie-Daten für ?mock=1

   Damit lässt sich die Seite ohne Anmeldung anschauen und vorführen. Alle
   Namen und Geräte sind erfunden, die Zahlen stammen aus einem
   Zufallsgenerator mit festem Startwert: derselbe Aufruf ergibt immer
   dieselben Daten.

   Enthalten sind bewusst auch die Sonderfälle:
     - Benutzer, die Inhaber keines Geräts sind
     - Geräte ohne Inhaber
     - Geräte mit zwei Inhaber-Einträgen (die zu bereinigende Altlast)
     - Programme mit Stufe 0, 1 und 2, mit und ohne AD-Gruppe
     - EDU-Clients, die bewusst keinen Inhaber haben
     - Geräte ohne Beschaffungsjahr und mit überfälligem Ersatz

   Mit ?mock=1&fehler=1 wirft jeder Ladevorgang einen Fehler. Damit lässt
   sich der Fehlerzustand der Oberfläche prüfen.
   ================================================================== */

const Mock = (function () {

  const ABFRAGE = new URLSearchParams(location.search);
  const fehlerModus = ABFRAGE.get("fehler") === "1";

  function fehlerPruefen() {
    if (!fehlerModus) return;
    const f = new Error("Vorführfehler (?fehler=1). So sieht die Seite aus, "
      + "wenn Microsoft Graph nicht antwortet.");
    f.status = 503;
    throw f;
  }

  /* Kleiner Generator mit festem Startwert (mulberry32). */
  function wuerfel(saat) {
    let a = saat >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const NACHNAMEN = ["Muster", "Beispiel", "Probe", "Vorlage", "Blumer", "Steiner",
                     "Meierhans", "Wildhaber", "Ammann", "Zurflueh", "Kaufmann", "Hodel"];
  const VORNAMEN  = ["Anna", "Beat", "Petra", "Urs", "Lena", "Marco", "Sara",
                     "Tobias", "Nina", "Reto", "Iris", "Fabian"];
  const FIRMEN    = ["Bildung", "Betriebe", "Seminarhotel", "Sport", "Verwaltung"];
  const ABTEILUNGEN = ["ICT", "Finanzen", "Human Resources", "Marketing",
                       "Technischer Dienst", "Bildung", "Empfang", "Gastronomie"];
  const FUNKTIONEN = ["Sachbearbeiter/in", "Fachspezialist/in", "Leiter/in",
                      "Assistent/in", "Lernende/r", "Projektleiter/in"];
  const GEBAEUDE  = ["Haus A / EG", "Haus A / 1. OG", "Haus B / 2. OG",
                     "Haus C / UG", "Werkhof / EG", "Sportzentrum / 1. OG"];
  const HERSTELLER = ["Dell Inc.", "Dell Inc.", "Dell Inc.", "HP", "LENOVO"];
  const MODELLE   = ["Latitude 5540", "Latitude 7440", "OptiPlex 7010",
                     "Precision 3581", "EliteBook 840 G10", "ThinkCentre M70q"];
  const OSVERSION = ["10.0.26100", "10.0.26100", "10.0.22631", "10.0.19045"];
  const GEHAEUSE  = ["Notebook", "Notebook", "Desktop", "Mini PC"];
  const BESCHAFFUNG = ["2019/2020", "2020/2021", "2021/2022", "2022/2023",
                       "2023/2024", "2024/2025", "2025/2026"];
  const APPS = ["7-Zip 24.09", "Adobe Acrobat Reader", "Google Chrome",
                "KeePass 2.57", "Microsoft 365 Apps", "Notepad++ 8.7",
                "VLC Media Player", "Citrix Workspace", "Power BI Desktop"];
  const SAMMLUNGEN = ["Alle Notebooks", "Alle Desktops", "Standard-Software",
                      "Bildung", "Verwaltung", "Technischer Dienst"];

  function waehle(r, liste) { return liste[Math.floor(r() * liste.length)]; }

  function vorTagen(tage, stunde) {
    const d = new Date();
    d.setDate(d.getDate() - tage);
    d.setHours(stunde === undefined ? 8 : stunde, 15, 0, 0);
    return d.toISOString();
  }


  /* ---------- Liste «Software» ---------- */

  /* [id, Anzeigename] je Kategorie. Anzeigenamen wie in der bisherigen
     Spaltendefinition. */
  const PROGRAMME_ROH = {
    "Standard-Software und Rechte": [
      ["Microsoft365", "Microsoft 365"], ["Project2019", "Project 2019"],
      ["Visio2019", "Visio 2019"], ["SharePoint", "SharePoint"],
      ["ZeitAG", "Zeit AG"], ["TimePro", "Time.pro"], ["Presento", "Presento"],
      ["Projekto", "Projekto"], ["Dispo", "Dispo"], ["Exporto", "Exporto"],
      ["PerformX", "PerformX"], ["CampusAdmin", "Campus_Admin"],
      ["CampusBenutzer", "Campus_Benutzer"], ["CampusSchuladmin", "Campus_Schuladmin"],
      ["RechtBearbeitungLogin", "Recht_Bearbeitung_Login"],
      ["RechtBewertungen", "Recht_Bewertungen"], ["RechtHonorar", "Recht_Honorar"],
      ["RechtLohnDebi", "Recht_Lohn_Debi"], ["RechtReferentenAdmin", "Recht_Referenten_Admin"],
      ["Protel", "Protel"], ["PDFCreator", "PDFCreator"], ["CitrixClient", "Citrix-Client"],
      ["VLCPlayer", "VLC-Player"], ["AdobeReader", "Adobe Reader"],
      ["CAFMMeldeformular", "CAFM (Meldeformular)"], ["Frontify", "Frontify"],
      ["KeePass", "KeePass"], ["EvaSysCloud", "EvaSys Cloud"], ["Milestone", "Milestone"],
      ["Monocard", "Monocard"], ["Wallboard", "Wallboard"], ["AppCore", "AppCore"],
      ["ABACUS", "ABACUS"]
    ],
    "ABACUS": [
      ["AbaView", "AbaView"], ["Administrator", "Administrator"],
      ["Anlagenbuchhaltung", "Anlagenbuchhaltung"],
      ["Debitorenbuchhaltung", "Debitorenbuchhaltung"],
      ["Finanzbuchhaltung", "Finanzbuchhaltung"],
      ["AbacusHumanResources", "Human Resources (ABACUS)"],
      ["Kreditorenbuchhaltung", "Kreditorenbuchhaltung"],
      ["Lohnbuchhaltung", "Lohnbuchhaltung"]
    ],
    "Zusatz-Software": [
      ["AdobeAcrobatPro", "Adobe Acrobat Pro"], ["AdobeCreativeSuite", "Adobe Creative Suite"],
      ["AttendantPro", "Attendant Pro"], ["CADdyPP2D", "CADdy++ 2D"],
      ["CADdyPP3D", "CADdy++ 3D"], ["Microsoft365Copilot", "Microsoft 365 Copilot"],
      ["MicrosoftPowerBIDesktop", "Microsoft Power BI Desktop"],
      ["MicrosoftPowerBIProLizenz", "Microsoft Power BI Pro - Lizenz"],
      ["PDFXChangeEditor", "PDF-XChange Editor"], ["PrismaPrepare", "PrismaPrepare"],
      ["Sunetplus", "Sunetplus"], ["Supermailer", "Supermailer"],
      ["TACReservationssystem", "TAC Reservationssystem"], ["TCPOSAdmin", "TCPOS Admin"],
      ["Silverlight", "Silverlight"]
    ],
    "Spezial-Software": [
      ["ADPhotoEdit", "AD Photo Edit"], ["AdobePhotoshopCS6", "Adobe Photoshop CS6"],
      ["ContentStudio", "Content Studio"], ["Firefox", "Firefox"],
      ["ForatableReservationsbuch", "Foratable Reservationsbuch"], ["KeyMagic", "KeyMagic"],
      ["PaulisKitchenSolution", "Paulis Kitchen Solution"], ["PostPWC", "postPWC"],
      ["Salto", "Salto"], ["SupermailerADGruppe", "Supermailer (AD-Gruppe)"],
      ["TACVista", "TAC Vista"], ["Tiffany", "Tiffany"]
    ],
    "Technik-Software": [
      ["AutoCADLT", "AutoCAD LT"], ["ChauvinArnoux", "Chauvin Arnoux"],
      ["ELDESConfigTool", "ELDES Config Tool"], ["ETS6KNX", "ETS 6 (KNX)"],
      ["GateControl", "Gate Control"], ["SaltoPPDUSB", "Salto PPD USB"],
      ["SnapformViewer", "SnapformViewer"], ["Testo", "Testo"], ["Woehler", "Wöhler"]
    ],
    "Bpanda": [
      ["BpandaConsumer", "Bpanda Consumer"], ["BpandaContributor", "Bpanda Contributor"],
      ["BpandaManager", "Bpanda Manager"]
    ]
  };

  /* AD-Gruppen im Vorführmodus: die Spezial-Software hat welche, dazu ein
     paar aus anderen Kategorien. Alles Übrige ist rein manuell. */
  const AD_GRUPPEN = {
    ADPhotoEdit: ["Hot_ADPhoto"], AdobePhotoshopCS6: ["Hot_Reze"],
    ContentStudio: ["SW_ContentStudio"], Firefox: ["SW_Firefox"],
    ForatableReservationsbuch: ["Hot_Foratable"], KeyMagic: ["SW_KeyMagic"],
    PaulisKitchenSolution: ["Resto_Paulis"], PostPWC: ["Fin_PostPWC"],
    Salto: ["TD_Salto", "TD_Salto_Admin"], SupermailerADGruppe: ["MK_Supermailer"],
    TACVista: ["TD_TACVista"], Tiffany: ["Hot_Tiffany"],
    Microsoft365: ["SW_M365"], AutoCADLT: ["TD_AutoCAD"],
    BpandaManager: ["Bpanda_Manager"]
  };

  /* Vorschläge – nur Demodaten für den Vorführmodus. */
  const VORSCHLAEGE = {
    Frontify: ["SW_Frontify"], KeePass: ["SW_KeePass", "SW_KeePass_Admin"],
    Milestone: ["TD_Milestone"], AdobeAcrobatPro: ["SW_AcrobatPro"],
    BpandaConsumer: ["Bpanda_Consumer"]
  };

  /* Die Zeilen der Liste «Software»: je Programm eine. «Reihenfolge» in
     Zehnerschritten, damit die Kategorien in derselben Folge erscheinen wie
     in PROGRAMME_ROH und zwischen zwei Einträgen Platz zum Einschieben ist. */
  function softwareZeilen() {
    const liste = [];
    let nr = 0;
    for (const kategorie of Object.keys(PROGRAMME_ROH)) {
      for (const [id, name] of PROGRAMME_ROH[kategorie]) {
        nr += 10;
        const z = leereZeile(SPALTEN_SOFTWARE);
        z.id = String(nr);
        z.Title = id;
        z.Name = name;
        z.Kategorie = kategorie;
        z.AdGruppen = (AD_GRUPPEN[id] || []).join("\n");
        z.Reihenfolge = nr;
        z.Bemerkung = (VORSCHLAEGE[id] || []).length
          ? (VORSCHLAEGE[id].length > 1 ? "Mögliche AD-Gruppen: " : "Mögliche AD-Gruppe: ") + VORSCHLAEGE[id].join(", ")
          : "";
        liste.push(z);
      }
    }
    return liste;
  }

  /* Alle Programm-IDs, für die leeren Benutzerzeilen. */
  function programmIds() {
    const ids = [];
    for (const kategorie of Object.keys(PROGRAMME_ROH)) {
      for (const [id] of PROGRAMME_ROH[kategorie]) ids.push(id);
    }
    return ids;
  }


  /* ---------- Telefonnummern ----------

     Kurzwahlen 200 … 259 gehören den Benutzern 1 … 60 (siehe benutzerZeile),
     dazu Dienste, Räume und HelpFons wie in der echten Liste. Ein paar
     Nummern sind frei, ein paar inaktiv, und bei einigen weicht die
     Person in der Liste vom AD ab — damit die Hinweise zu sehen sind. */

  function kurzwahlVoll(kurz) {
    const k = String(kurz).padStart(3, "0").slice(-3);
    return "+41 41 926 2" + k.charAt(0) + " " + k.slice(1);
  }

  const DIENSTE = [
    ["270", "Human Ressources", "Dienst"], ["279", "Technischer Dienst AA", "Dienst"],
    ["301", "Securitas", "Dienst"], ["320", "Pikett UmgD", "Dienst"],
    ["369", "Service-Desk ICT Campus AA", "Dienst"], ["370", "Informatik ICT-S", "Dienst"],
    ["322", "Raum 17.3 Küche", "Raum"], ["325", "Lieferanteneingang", "Raum"],
    ["374", "Raum 17.2 ICT", "Raum"], ["402", "HWS Portier1", "Raum"],
    ["384", "HelpFon G32.230", "Notruf"], ["487", "HelpFon G20.4", "Notruf"],
    ["488", "HelpFon G20.3", "Notruf"], ["527", "HelpFon G10.132", "Notruf"],
    ["626", "Zentrale Campus Sursee AA", "Dienst"], ["828", "Zentrale Sportarena AA", "Dienst"]
  ];
  const INAKTIVE = [
    ["300", "Sportteam", "nicht im Teams-Tenant (evtl. SIP-Apparat)"],
    ["410", "Raum 20.320", "nicht im Teams-Tenant (evtl. SIP-Apparat)"],
    ["504", "Schmid Martin", "nicht im Teams-Tenant (evtl. SIP-Apparat)"]
  ];
  const FREIE = [["222", "Egger Bernadette"], ["231", "Kreienbühl Rafaela"],
                 ["267", "Itin Giulia"], ["318", "Auviso (Ersatz B+T)"], ["396", "Hecht Mathias"]];

  function telefonZeile(r, nr, kurz, name, typ, status, benutzerLogin, hinweis, frueher) {
    /* «frueher»: wer die Nummer vorher hatte — steht wie in der echten Liste
       als Verlaufseintrag (Migration vom 2026-09), nicht in einer Spalte. */
    const z = leereZeile(SPALTEN_TELEFON);
    z.id = String(nr);
    z.Title = kurz;
    z.Telefonnummer = kurzwahlVoll(kurz);
    z.Name = name || "";
    z.Typ = typ || "";
    z.Status = status || "";
    z.Benutzer = benutzerLogin || "";
    z.ADLetzterSync = benutzerLogin ? vorTagen(0, 4) : "";
    z.Apparat = typ === "Notruf" ? "HelpFon" : (typ === "Raum" ? "SIP-Apparat"
      : (r() < 0.6 ? "Teams" : (r() < 0.5 ? "Tischtelefon" : "Headset")));
    z.Standort = typ === "Raum" ? name : (r() < 0.3 ? waehle(r, GEBAEUDE) : "");
    z.Hinweis = hinweis || "";
    const verlauf = [{
      id: "mock-t-" + nr, datum: tagIso(35), quelle: "sync", erstellt: vorTagen(35, 9),
      text: "Aus der Telefonliste S4B importiert (Stand 31.07.2026)"
    }];
    if (frueher) {
      verlauf.push({
        id: "mock-tf-" + nr, datum: "2026-07-31", quelle: "sync", erstellt: vorTagen(3, 10),
        text: "Früherer Eintrag: " + frueher + " (aus der alten Telefonliste S4B übernommen)"
      });
    }
    z.Verlauf = JSON.stringify(verlauf);
    return z;
  }

  function telefone(r, benutzer) {
    const liste = [];
    let nr = 1;
    /* Personen: Kurzwahl = 200 + Benutzernummer, wie in benutzerZeile. */
    for (const b of benutzer) {
      if (!b.Telefon || b.Telefon.indexOf("+41 41 926 2") !== 0) continue;
      const kurz = b.Telefon.replace(/\D/g, "").slice(-3);
      /* Bei rund jedem zwölften stimmt der Name in der Liste nicht mehr mit
         dem AD überein (Handwechsel), und der Sync ist noch nicht gelaufen. */
      const veraltet = r() < 0.08;
      const name = veraltet ? waehle(r, NACHNAMEN) + " " + waehle(r, VORNAMEN) : b.Anzeigename;
      liste.push(telefonZeile(r, nr++, kurz, name, "Person", "Aktiv",
        veraltet ? "" : b.Title, "", veraltet ? "" : ""));
    }
    for (const [kurz, name, typ] of DIENSTE) {
      liste.push(telefonZeile(r, nr++, kurz, name, typ, "Aktiv", "", "", ""));
    }
    for (const [kurz, name, hinweis] of INAKTIVE) {
      liste.push(telefonZeile(r, nr++, kurz, name, "", "Inaktiv", "", hinweis, ""));
    }
    for (const [kurz, frueher] of FREIE) {
      liste.push(telefonZeile(r, nr++, kurz, "", "", "Frei", "", "frei - sofort vergebbar", frueher));
    }
    // Zwei Nummern ohne jede Angabe: weder Name noch Benutzer — nicht zugewiesen.
    liste.push(telefonZeile(r, nr++, "398", "", "Person", "", "", "", ""));
    liste.push(telefonZeile(r, nr++, "399", "", "", "", "", "Apparat im Lager", ""));
    return liste;
  }

  /* ---------- Kameras und Kamera-Rollen ----------

     Erfundene Räume in den Häusern A, B und C, dazu ein Parkhaus P. Die
     Sonderfälle sind absichtlich dabei: eine Kamera mit zwei Kanälen
     (360°), eine mit einem Kanal ohne Namen, eine deaktivierte, eine ohne
     Aufzeichnung, eine im Lager, eine archivierte, eine, die nur von Hand
     erfasst ist, und eine Rolle, die nicht mehr in Milestone steht. Ein eigener
     Würfel, damit die übrigen Vorführdaten bleiben, wie sie sind. */

  const KAMERA_ORTE = [
    ["A.010", "Eingang Nord"], ["A.010", "Eingang Süd"], ["A.120", "Empfang"], ["A.205", "Gang Ost"],
    ["A.305", "Gang West"], ["A.U01", "Anlieferung"], ["B.100", "Foyer"], ["B.140", "Treppe Nord"],
    ["B.240", "Treppe Süd"], ["B.310", "Lounge"], ["B.A02", "Innenhof"], ["C.020", "Halle Mitte"],
    ["C.020", "Halle Tribüne"], ["C.110", "Garderobe Korridor"], ["C.A01", "Aussen Nord"], ["C.A01", "Aussen Süd"],
    ["P.001", "Einfahrt"], ["P.001", "Ausfahrt"], ["P.101", "Sektor A"], ["P.101", "Sektor B"],
    ["P.201", "Sektor C"], ["P.A10", "Kasse 1"], ["P.A10", "Kasse 2"], ["A.050", "Gepäckraum"],
    ["B.020", "Ladestation"], ["C.300", "Fitness"]
  ];
  const KAMERA_MODELLE = [
    ["Hikvision", "DS-2CD2743G1-IZS"], ["Hikvision", "DS-2CD2146G2-I"], ["Hikvision", "DS-2DE3204W-DE"],
    ["Axis", "M3086-V"], ["Axis", "P3285-LV"], ["Axis", "M4338-PLVE"]
  ];
  const ZUSTAENDIG = ["Nachtdienst", "Technischer Dienst", "Team Halle", "Empfang"];

  function kameraZeilen(r) {
    const liste = [];
    KAMERA_ORTE.forEach(function ([raum, bezeichnung], i) {
      const nr = i + 1;
      const z = leereZeile(SPALTEN_KAMERA);
      const [hersteller, modell] = waehle(r, KAMERA_MODELLE);
      const name = raum + " " + bezeichnung;
      const ip = "10.99.15." + (100 + nr);
      const mac = (hersteller === "Axis" ? "AC:CC:8E" : "24:28:FD") + ":" + ["1A", "2B", "3C"][nr % 3] + ":"
        + String(10 + nr).padStart(2, "0") + ":" + String(40 + nr).padStart(2, "0");
      z.id = String(700 + nr);
      z.Title = name;
      z.Gebaeude = raum.split(".")[0];
      z.Raum = raum;
      z.Status = nr === 5 ? "Lager" : (nr === 9 ? "Archiviert" : (r() < 0.5 ? "Aktiv" : ""));
      z.Beschaffungsjahr = r() < 0.75 ? waehle(r, BESCHAFFUNG) : "";
      z.ErsatzGeplant = z.Beschaffungsjahr && r() < 0.7 ? Modell.gjPlus(z.Beschaffungsjahr, 8) : "";
      if (r() < 0.6) {
        z.Zustaendig = waehle(r, ZUSTAENDIG);
        if (r() < 0.5) {
          z.Qualitaet = r() < 0.8 ? "Gut" : "Genügend";
          z.Positionierung = r() < 0.7 ? "Gut" : (r() < 0.5 ? "Genügend" : "Schlecht");
          z.Verbesserungen = z.Positionierung === "Schlecht" ? "Blickwinkel nach links drehen, Eingang ist nur halb sichtbar." : "";
          z.BewertetAm = tagIso(120 + Math.floor(r() * 400));
        }
      }
      z.MS_HardwareId = "mock-hw-" + nr;
      z.MS_Gefunden = nr === 9 ? "Nein" : "Ja";
      z.MS_HardwareName = (hersteller === "Axis" ? "AXIS " : "HikVision ") + modell + " (" + ip + ")";
      z.MS_Adresse = ip;
      z.MS_Mac = mac;
      z.MS_Seriennummer = hersteller === "Axis" ? mac.replace(/:/g, "") : modell + "2023" + String(100000 + nr * 37);
      z.MS_Hersteller = hersteller;
      z.MS_Modell = modell;
      z.MS_Firmware = hersteller === "Axis" ? "11.11." + (50 + nr) : "V5.7." + (nr % 9);
      z.MS_Aktiv = nr === 14 ? "Nein" : "Ja";
      z.MS_Aufzeichnung = nr === 14 || nr === 18 ? "Nein" : "Ja";
      const kanaele = [[1, name, z.MS_Aktiv === "Ja", z.MS_Aufzeichnung === "Ja"]];
      if (nr === 12) kanaele.push([2, raum + " " + bezeichnung + " (zweite Linse)", true, true]);
      if (nr === 7) kanaele.push([2, "AXIS P3285-LV Dome Camera (" + ip + ") - Kamera 2", true, true]);
      z.MS_KanalAnzahl = kanaele.length;
      z.MS_Kanaele = kanaele.map(k => k[0] + " | " + k[1] + " | " + (k[2] ? "Aktiv" : "Deaktiviert") + " | Aufzeichnung " + (k[3] ? "ein" : "aus")).join("\n");
      z.MS_RecordingServer = "rec01.beispiel.local";
      z.MS_Geaendert = vorTagen(20 + Math.floor(r() * 300), 10);
      z.MS_LetzterSync = nr === 9 ? vorTagen(30, 5) : vorTagen(0, 5);
      z.MS_SyncStatus = nr === 9 ? "Nicht mehr in Milestone" : "OK";
      const verlauf = [{ id: "mock-k-" + nr, datum: tagIso(40), text: "Aus Milestone neu angelegt", quelle: "sync", erstellt: vorTagen(40, 3) }];
      if (nr === 9) verlauf.push({ id: "mock-ka-" + nr, datum: tagIso(30), text: "In Milestone nicht mehr vorhanden, archiviert", quelle: "sync", erstellt: vorTagen(30, 3) });
      if (nr === 3) verlauf.push({ id: "mock-ku-" + nr, datum: tagIso(12), text: "Umbenannt in Milestone: A.120 Reception → A.120 Empfang", quelle: "sync", erstellt: vorTagen(12, 3) });
      z.Verlauf = JSON.stringify(verlauf);
      liste.push(z);
    });
    // Nur von Hand erfasst: liegt im Lager, steht in keinem Milestone.
    const hand = leereZeile(SPALTEN_KAMERA);
    hand.id = "799";
    hand.Title = "Ersatzkamera Dome";
    hand.Status = "Lager";
    hand.Bemerkung = "Reserve für den Ausfall einer Dome-Kamera im Haus A.";
    hand.Beschaffungsjahr = "2025/2026";
    hand.Verlauf = JSON.stringify([{ id: "mock-kh", datum: tagIso(60), text: "Im Frontend neu erfasst", quelle: "manuell", erstellt: vorTagen(60, 9) }]);
    liste.push(hand);
    return liste;
  }

  /* Rollen: Mitglieder sind AD-Gruppen; die Personen dahinter sind
     Benutzer der Vorführdaten (nach Abteilung). Rechte je Kamera als JSON
     Hardware-ID → Rechte, wie der Sync sie schreibt. */
  function kameraRollenZeilen(r, benutzer, kameras) {
    const imMilestone = kameras.filter(k => k.MS_HardwareId && k.MS_Gefunden === "Ja");
    const logins = function (abteilungen) {
      return benutzer.filter(b => abteilungen.indexOf(b.Abteilung) > -1).map(b => b.Title).sort().join("\n");
    };
    const rechteFuer = function (filter, rechte) {
      const o = {};
      for (const k of imMilestone.filter(filter)) o[k.MS_HardwareId] = rechte.slice();
      return o;
    };
    const definitionen = [
      { id: "1", name: "Administratoren", typ: "Administratoren", gruppen: [], mitglieder: ["Basisbenutzer | admin", "AD-Gruppe | BEISPIEL\\ICT_Admins"],
        abt: ["ICT"], kameras: rechteFuer(() => true, ["Vollzugriff"]) },
      { id: "2", name: "Nachtdienst", typ: "Benutzerdefiniert", gruppen: ["Hot_Nachtdienst"], mitglieder: ["AD-Gruppe | BEISPIEL\\Hot_Nachtdienst"],
        abt: ["Empfang"], kameras: rechteFuer(k => k.Gebaeude !== "P", ["Live", "Wiedergabe", "Export"]) },
      { id: "3", name: "Technischer Dienst", typ: "Benutzerdefiniert", gruppen: ["TD_Alle"], mitglieder: ["AD-Gruppe | BEISPIEL\\TD_Alle"],
        abt: ["Technischer Dienst"], kameras: rechteFuer(k => k.Gebaeude === "P", ["Live", "Wiedergabe"]) },
      { id: "4", name: "Team Halle", typ: "Benutzerdefiniert", gruppen: ["Sport_Halle"], mitglieder: ["AD-Gruppe | BEISPIEL\\Sport_Halle", "AD-Benutzer | BEISPIEL\\muster.anna"],
        abt: ["Gastronomie"], kameras: rechteFuer(k => k.Gebaeude === "C", ["Live"]) },
      { id: "5", name: "Empfang (alt)", typ: "Benutzerdefiniert", gruppen: ["Hot_Empfang_alt"], mitglieder: ["AD-Gruppe | BEISPIEL\\Hot_Empfang_alt"],
        abt: [], kameras: {}, bemerkung: "Abgelöst durch «Nachtdienst».", fehlt: true }
    ];
    return definitionen.map(function (d) {
      const z = leereZeile(SPALTEN_KAMERAROLLE);
      const anzahl = Object.keys(d.kameras).length;
      const rechte = [];
      for (const k of Object.keys(d.kameras)) for (const x of d.kameras[k]) if (rechte.indexOf(x) === -1) rechte.push(x);
      z.id = String(900 + Number(d.id));
      z.Title = d.name;
      z.Bemerkung = d.bemerkung || "";
      z.MS_RolleId = "mock-rolle-" + d.id;
      z.MS_Gefunden = d.fehlt ? "Nein" : "Ja";
      z.MS_RollenTyp = d.typ;
      z.MS_Mitglieder = d.mitglieder.join("\n");
      z.MS_AdGruppen = d.gruppen.join("\n");
      z.MS_Benutzer = logins(d.abt);
      z.MS_Rechte = rechte.join("\n");
      z.MS_Kameras = JSON.stringify(d.kameras);
      z.MS_KameraAnzahl = anzahl;
      z.MS_LetzterSync = vorTagen(0, 5);
      z.MS_SyncStatus = d.fehlt ? "Nicht mehr in Milestone" : "OK";
      z.Verlauf = JSON.stringify([{ id: "mock-r-" + d.id, datum: tagIso(40), text: "Aus Milestone neu angelegt", quelle: "sync", erstellt: vorTagen(40, 3) }]);
      return z;
    });
  }

  /* «Sichtbar für» je Kamera, wie es der Sync aus den Rollen schreibt. */
  function kameraSichtbarkeit(kameras, rollen) {
    for (const k of kameras) {
      const zeilen = [];
      for (const rolle of rollen) {
        let o = {};
        try { o = JSON.parse(rolle.MS_Kameras || "{}"); } catch (e) { o = {}; }
        if (o[k.MS_HardwareId]) zeilen.push(rolle.Title + ": " + o[k.MS_HardwareId].join(", "));
      }
      k.MS_Rollen = zeilen.sort().join("\n");
    }
  }

  /* ---------- Grunddaten ---------- */

  function leereZeile(spalten) {
    const z = {};
    for (const s of spalten) z[s.i] = s.t === "Boolean" ? false : "";
    return z;
  }

  /* ---------- Verlauf ----------

     Die Spalte «Verlauf» der beiden Listen enthält ein JSON-Array; das
     Format steht in modell.js. Hier entstehen ein paar glaubwürdige
     Einträge, damit sich die Zeitachse im Vorführmodus anschauen lässt —
     gemischt aus «sync» (vom Abgleich) und «manuell» (von Hand). */

  const VERLAUF_SYNC = [
    "Umbenannt von CAMPUS-812 zu CAMPUS-905 (SCCM)",
    "In SCCM nicht mehr vorhanden, archiviert",
    "Aus SCCM neu angelegt",
    "Wieder in SCCM vorhanden, reaktiviert"
  ];
  const VERLAUF_MANUELL = [
    "Gerät an neue Mitarbeiterin übergeben.",
    "Akku ersetzt, Garantiefall über Dell abgewickelt.",
    "Von Haus A ins Sportzentrum umgezogen.",
    "Nach Wasserschaden neu aufgesetzt.\nDaten aus der Sicherung "
      + "zurückgespielt, alles vollständig.",
    "Ins Lager gestellt, wartet auf Wiederverwendung."
  ];

  /* Ein Datum vor n Tagen als «JJJJ-MM-TT». */
  function tagIso(tage) {
    const d = new Date();
    d.setDate(d.getDate() - tage);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")
      + "-" + String(d.getDate()).padStart(2, "0");
  }

  function mockVerlauf(r, immer) {
    if (!immer && r() > 0.45) return "";
    const anzahl = 1 + Math.floor(r() * 3);
    const eintraege = [];
    for (let i = 0; i < anzahl; i++) {
      const sync = r() < 0.4;
      const tage = 10 + Math.floor(r() * 700);
      eintraege.push({
        id: "mock-" + Math.floor(r() * 1e9).toString(16) + "-" + i,
        datum: tagIso(tage),
        text: sync ? waehle(r, VERLAUF_SYNC) : waehle(r, VERLAUF_MANUELL),
        quelle: sync ? "sync" : "manuell",
        erstellt: vorTagen(tage, 9)
      });
    }
    if (immer) {
      eintraege.push({
        id: "mock-archiv-" + Math.floor(r() * 1e9).toString(16),
        datum: tagIso(5 + Math.floor(r() * 60)),
        text: "In SCCM nicht mehr vorhanden, archiviert",
        quelle: "sync",
        erstellt: vorTagen(5, 3)
      });
    }
    return JSON.stringify(eintraege);
  }

  /* Ein Client. «praefix» entscheidet über den Namen und damit über die
     Liste: «CAMPUS-9xx» gehört zu den ADMIN-Clients, «EDU-9xx» zu den
     EDU-Clients. Die Zeilen sind sonst gleich gebaut — die beiden Listen
     haben dieselben Spalten. */
  function geraet(r, nummer, praefix) {
    const z = leereZeile(SPALTEN_CLIENT);
    const name = (praefix || "CAMPUS-") + "9" + String(nummer).padStart(2, "0");

    z.id = String(nummer);
    z.Title = name;
    z.GebaeudeStock = waehle(r, GEBAEUDE);
    z.Bemerkung = r() < 0.15 ? "Ersatzgerät, Rückgabe offen" : "";

    /* «In Domäne»: der Normalfall ist Ja. Bei den EDU-Clients steht rund jedes
       dritte Gerät ausserhalb der Domäne (Gäste- und Prüfungsnotebooks) — nur so
       lässt sich im Vorführmodus anschauen, wie solche Zeilen aussehen. */
    z.InDomaene = (praefix === "EDU-") ? (r() > 0.35) : true;

    /* Status: die grosse Mehrheit ist im Einsatz, ein paar liegen im Lager,
       ein paar sind archiviert. Bewusst bleibt ein Teil der Zeilen leer —
       so wird geprüft, dass ein leerer Wert als «Aktiv» durchgeht. */
    const wStatus = r();
    if (wStatus < 0.08) z.Status = "Archiviert";
    else if (wStatus < 0.16) z.Status = "Lager";
    else if (wStatus < 0.6) z.Status = "Aktiv";
    else z.Status = "";

    /* Verlauf: manche Geräte haben Einträge, gemischt aus Abgleich und
       Handarbeit — sonst liesse sich die Zeitachse nie anschauen. */
    z.Verlauf = mockVerlauf(r, z.Status === "Archiviert");

    // Rund jedes achte Gerät hat kein Beschaffungsjahr: alter Bestand.
    if (r() > 0.12) {
      z.Beschaffungsjahr = waehle(r, BESCHAFFUNG);
      // Meist der Vorschlag +5, manchmal von Hand vorgezogen oder leer.
      const w = r();
      if (w < 0.15) z.ErsatzGeplant = "";
      else if (w < 0.3) z.ErsatzGeplant = Modell.gjPlus(z.Beschaffungsjahr, 4);
      else z.ErsatzGeplant = Modell.gjPlus(z.Beschaffungsjahr, 5);
    }

    /* Rund jedes zehnte Gerät ist nicht in SCCM — und ein Gerät ausserhalb der
       Domäne ist es nie: Der Abgleich fasst diese Zeilen gar nicht erst an. */
    const inSccm = z.InDomaene && r() > 0.1;
    z.SCCM_Found = inSccm ? "Ja" : "Nein";
    if (!inSccm) {
      z.SCCM_SyncStatus = z.InDomaene ? "Kein SCCM-Gerät gefunden"
                                      : "Ausserhalb der Domäne, vom Abgleich ausgenommen";
      return z;
    }

    const aktivVorTagen = Math.floor(Math.pow(r(), 3) * 200);
    const online = aktivVorTagen === 0 && r() < 0.7;

    z.SCCM_Name = name;
    z.SCCM_ResourceID = 16770000 + nummer;
    z.SCCM_SMSID = "GUID:00000000-0000-0000-0000-" + String(nummer).padStart(12, "0");
    z.SCCM_Domain = "SASADMIN";
    z.SCCM_OU = "CN=" + name + ",OU=Clients,DC=sasadmin,DC=local";
    z.SCCM_ADSite = "Sursee";
    z.SCCM_ADCreated = vorTagen(400 + nummer * 3, 9);
    z.SCCM_ADLastLogon = vorTagen(aktivVorTagen, 7);
    z.SCCM_LastConsoleUse = vorTagen(aktivVorTagen, 7);
    /* Die Benutzerkonten (PrimaryUser, LastLogonUser, CurrentLogonUser,
       TopConsoleUser, ConsoleUsers) setzt benutzerkontenAbgleichen(), sobald
       die Benutzerzeilen stehen — sie werden aus deren Logins abgeleitet. */

    z.SCCM_ClientVersion = "5.00.9132.1000";
    z.SCCM_ClientActive = aktivVorTagen < 30 ? "Ja" : "Nein";
    z.SCCM_Online = online ? "Ja" : "Nein";
    z.SCCM_LastOnline = vorTagen(aktivVorTagen, 7);
    z.SCCM_LastOffline = vorTagen(aktivVorTagen + 1, 17);
    z.SCCM_LastActive = vorTagen(aktivVorTagen, 7);
    z.SCCM_LastHardwareScan = vorTagen(aktivVorTagen + 1, 3);
    z.SCCM_LastSoftwareScan = vorTagen(aktivVorTagen + 2, 3);
    z.SCCM_LastDDR = vorTagen(aktivVorTagen, 5);
    z.SCCM_LastPolicyRequest = vorTagen(aktivVorTagen, 6);
    z.SCCM_LastClientCheck = vorTagen(aktivVorTagen + 1, 4);
    z.SCCM_ClientCheckPass = "Ja";
    z.SCCM_ManagementPoint = "adminsrv319.sasadmin.local";
    z.SCCM_BoundaryGroups = "BG-Sursee";
    z.SCCM_CoManaged = r() < 0.3 ? "Ja" : "Nein";
    z.SCCM_AADDeviceID = "00000000-0000-0000-0000-" + String(900 + nummer).padStart(12, "0");

    z.SCCM_Manufacturer = waehle(r, HERSTELLER);
    z.SCCM_Model = waehle(r, MODELLE);
    z.SCCM_SerialNumber = "SN" + String(100000 + Math.floor(r() * 899999));
    z.SCCM_ChassisType = waehle(r, GEHAEUSE);
    z.SCCM_IsVirtual = "Nein";
    z.SCCM_CPU = "Intel(R) Core(TM) i" + waehle(r, ["5", "5", "7"]) + "-1345U";
    z.SCCM_CPUCores = 10;
    z.SCCM_CPULogical = 12;
    z.SCCM_RAMGB = waehle(r, [8, 16, 16, 32]);
    z.SCCM_DiskCGB = waehle(r, [256, 476, 476, 953]);
    const knapp = r() < 0.15;
    z.SCCM_DiskCFreeGB = Math.round(z.SCCM_DiskCGB
      * (knapp ? 0.005 + r() * 0.03 : 0.1 + r() * 0.55) * 10) / 10;
    z.SCCM_PhysicalDisks = "NVMe SSD " + z.SCCM_DiskCGB + " GB | Zustand OK";
    z.SCCM_BIOSVersion = "1.2" + Math.floor(r() * 9);
    z.SCCM_BIOSDate = vorTagen(300 + Math.floor(r() * 400), 12);
    z.SCCM_TPMVersion = "2.0";
    z.SCCM_TPMEnabled = "Ja";
    z.SCCM_BitLocker = r() < 0.85 ? "Verschlüsselt" : "Nicht verschlüsselt";
    z.SCCM_Monitors = "DELL P2422H | 1920x1080\nDELL P2422H | 1920x1080";
    z.SCCM_Battery = z.SCCM_ChassisType === "Notebook"
      ? "OK, " + (60 + Math.floor(r() * 40)) + " %" : "";

    z.SCCM_OS = "Microsoft Windows 11 Enterprise";
    z.SCCM_OSVersion = waehle(r, OSVERSION);
    z.SCCM_OSInstallDate = vorTagen(380 + Math.floor(r() * 300), 10);
    z.SCCM_LastBoot = vorTagen(Math.max(0, aktivVorTagen + Math.floor(r() * 5)), 6);
    z.SCCM_OSLanguage = "Deutsch (Schweiz)";
    z.SCCM_SystemType = "X64-based PC";
    z.SCCM_IPv4 = "10.11." + (20 + Math.floor(r() * 5)) + "." + (10 + nummer);
    z.SCCM_IPAddresses = z.SCCM_IPv4;
    z.SCCM_MACAddresses = "00:1A:2B:" + String(nummer).padStart(2, "0") + ":CD:EF";
    z.SCCM_DHCP = "Ja";

    const signaturAlter = Math.floor(Math.pow(r(), 2) * 40);
    z.SCCM_EPEnabled = r() < 0.95 ? "Ja" : "Nein";
    z.SCCM_EPClientVersion = "4.18.24090.11";
    z.SCCM_EPSignatureVersion = "1.417." + (100 + Math.floor(r() * 800)) + ".0";
    z.SCCM_EPSignatureDate = vorTagen(signaturAlter, 4);
    z.SCCM_EPLastQuickScan = vorTagen(signaturAlter + 1, 2);
    z.SCCM_EPLastFullScan = vorTagen(signaturAlter + 20, 2);
    z.SCCM_EPInfectionStatus = "Sauber";
    z.SCCM_EPPendingReboot = "Nein";

    z.SCCM_Office = "Microsoft 365 Apps for enterprise | 16.0.18324.20194";

    const appAnzahl = 3 + Math.floor(r() * 5);
    const appZeilen = [];
    let erfolgreich = 0;
    for (let i = 0; i < appAnzahl; i++) {
      const app = APPS[(nummer + i * 3) % APPS.length];
      const pflicht = r() < 0.7 ? "Erforderlich" : "Verfügbar";
      const status = r() < 0.85 ? "Erfolgreich" : (r() < 0.5 ? "Fehlgeschlagen" : "Ausstehend");
      if (status === "Erfolgreich") erfolgreich++;
      appZeilen.push(app + " | " + SAMMLUNGEN[(nummer + i) % SAMMLUNGEN.length]
        + " | " + pflicht + " | " + status);
    }
    z.SCCM_DeployedApps = appZeilen.join("\n");
    z.SCCM_AppsRequired = appZeilen.filter(a => a.indexOf("Erforderlich") > -1).length;
    z.SCCM_AppsInstalled = erfolgreich;

    z.SCCM_InstalledSoftwareCount = 40 + Math.floor(r() * 60);
    z.SCCM_InstalledSoftware = APPS.slice(0, 6)
      .map((a, i) => a + " | " + (1 + i) + "." + i + ".0").join("\n");
    z.SCCM_Collections = SAMMLUNGEN.slice(0, 3).join("\n");

    z.SCCM_LastSync = vorTagen(0, 5);
    z.SCCM_SyncStatus = "OK";
    return z;
  }

  /* «geraet»: die Clientzeile, deren Inhaber die Person ist, oder null.
     Eingetragen wird ihre Listen-ID, wie in SharePoint. */
  function benutzerZeile(r, nummer, geraet, ids) {
    const z = leereZeile(SPALTEN_BENUTZER);
    for (const id of ids) z[id] = "0";

    const nach = waehle(r, NACHNAMEN);
    const vor = waehle(r, VORNAMEN);
    const login = (nach + "." + vor).toLowerCase() + (nummer % 7 === 0 ? String(nummer) : "");

    z.id = String(nummer);
    z.Title = login;
    z.Anzeigename = vor + " " + nach;
    z.EMail = login + "@campus-sursee.ch";
    z.Abteilung = waehle(r, ABTEILUNGEN);
    z.Funktion = waehle(r, FUNKTIONEN);
    z.Vorgesetzter = waehle(r, VORNAMEN) + " " + waehle(r, NACHNAMEN);
    /* Telefon: die meisten haben eine Kurzwahl aus dem Hausblock (Mock-
       Telefonliste weiter unten), ein paar gar keine, ein paar eine
       Mobilnummer — so lassen sich alle Fälle der Telefonansicht anschauen. */
    const wTel = r();
    if (wTel < 0.1) z.Telefon = "";
    else if (wTel < 0.18) z.Telefon = "+41 79 " + (300 + Math.floor(r() * 600)) + " "
      + (10 + Math.floor(r() * 89)) + " " + (10 + Math.floor(r() * 89));
    else z.Telefon = kurzwahlVoll(200 + nummer);
    z.Firma = waehle(r, FIRMEN);
    z.ADAktiviert = r() < 0.92 ? "Ja" : "Nein";
    z.ADLetzterSync = vorTagen(0, 4);
    z.AdminClientId = geraet ? Number(geraet.id) : "";
    /* SCCMPrimaerGeraet setzt benutzerkontenAbgleichen(): meist gleich der
       Zuordnung, bei rund jedem zehnten Benutzer abweichend. */
    z.Bemerkung = r() < 0.1 ? "Zweitgerät im Homeoffice" : "";
    z.Verlauf = r() < 0.3
      ? JSON.stringify([{
          id: "mock-b-" + nummer,
          datum: tagIso(20 + Math.floor(r() * 500)),
          text: r() < 0.5
            ? "Gerätewechsel: altes Notebook zurückgegeben."
            : "Abteilungswechsel, Berechtigungen angepasst.",
          quelle: "manuell",
          erstellt: vorTagen(20, 10)
        }])
      : "";

    // Berechtigungen: Stufe 2 nur dort, wo es auch AD-Gruppen gibt.
    for (const id of ids) {
      const hatGruppe = !!AD_GRUPPEN[id];
      const w = r();
      if (hatGruppe && w < 0.12) z[id] = "2";
      else if (w < 0.3) z[id] = "1";
    }
    // Microsoft 365 hat praktisch jeder — und zwar über die AD-Gruppe.
    if (r() < 0.85) z.Microsoft365 = "2";
    return z;
  }

  /* ---------- SCCM-Konten aus der Inhaberschaft ableiten ----------

     Im echten SCCM stehen in SCCM_PrimaryUser, SCCM_LastLogonUser und
     SCCM_CurrentLogonUser die Konten, die an diesem Gerät wirklich
     arbeiten — also normalerweise der Inhaber, geschrieben als
     «DOMAENE\login». Umgekehrt meldet SMS_UserMachineRelationship für jede
     Person ihr Primärgerät; das landet in SCCMPrimaerGeraet.

     SCCM schreibt die Inhaberschaft nie: die Felder hier sind Beobachtung,
     die Spalte «AdminClientId» bleibt Handarbeit. Bei rund jedem zehnten
     Datensatz weicht darum ein Feld ab — Handwechsel nicht nachgeführt,
     Support-Anmeldung, Zweitgerät. Genau diese Abweichungen erzeugen im
     Frontend die Hinweise «Primärer Benutzer ist nicht der Inhaber» und
     «SCCM meldet ein anderes Primärgerät». Ohne sie wären die Hinweise nie
     zu sehen, mit zu vielen wären sie unglaubwürdig. */

  const DOMAENE = "SASADMIN";

  function konto(login) {
    return login ? DOMAENE + "\\" + login : "";
  }

  function benutzerkontenAbgleichen(r, clients, benutzer) {
    // Logins je Gerät (Listen-ID), in der Reihenfolge der Benutzerliste.
    // Die EDU-Clients haben im Vorführmodus eigene Ids ab 500.
    const nachGeraet = new Map();
    for (const b of benutzer) {
      const id = Modell.geraetId(b.AdminClientId);
      if (!id) continue;
      if (!nachGeraet.has(id)) nachGeraet.set(id, []);
      nachGeraet.get(id).push(b.Title);
    }
    const nachId = new Map(clients.map(z => [String(z.id), z]));
    const alleLogins = benutzer.map(b => b.Title);
    const inSccm = clients.filter(z => Hilfe.istJa(z.SCCM_Found));

    /* --- Geräteseite --- */
    for (const z of clients) {
      if (!Hilfe.istJa(z.SCCM_Found)) continue;
      const logins = nachGeraet.get(String(z.id)) || [];
      const online = Hilfe.istJa(z.SCCM_Online);
      const fremd = alleLogins[Math.floor(r() * alleLogins.length)];

      let primaer;
      if (!logins.length) {
        // Gerät ohne Zuordnung: mal steht noch ein altes Konto darauf,
        // mal ist es tatsächlich unbenutzt.
        primaer = r() < 0.5 ? fremd : "";
      } else {
        primaer = r() < 0.1 ? fremd : logins[0];
      }

      // Der zuletzt angemeldete Benutzer ist meist derselbe; sonst ein
      // überzähliger Eintrag oder der Support.
      const letzter = r() < 0.1 ? (logins[1] || "ict.support") : primaer;

      z.SCCM_PrimaryUser = konto(primaer);
      z.SCCM_TopConsoleUser = konto(primaer);
      z.SCCM_LastLogonUser = konto(letzter);
      z.SCCM_CurrentLogonUser = online ? konto(letzter) : "";

      const zeilen = [];
      if (primaer) {
        zeilen.push(konto(primaer) + " | " + (20 + Math.floor(r() * 300))
          + " Anmeldungen | " + (500 + Math.floor(r() * 40000)) + " Min | zuletzt "
          + Hilfe.datumZeitText(z.SCCM_LastConsoleUse));
      }
      zeilen.push(konto("ict.support") + " | " + (1 + Math.floor(r() * 9))
        + " Anmeldungen | " + (10 + Math.floor(r() * 200)) + " Min | zuletzt "
        + Hilfe.datumZeitText(z.SCCM_LastOffline));
      z.SCCM_ConsoleUsers = zeilen.join("\n");
    }

    /* --- Benutzerseite --- */
    for (const b of benutzer) {
      const geraet = nachId.get(Modell.geraetId(b.AdminClientId));
      const zugeordnet = geraet ? String(geraet.Title || "").trim() : "";
      if (!zugeordnet) {
        // Ohne eigenes Gerät meldet SCCM manchmal trotzdem ein Primärgerät.
        b.SCCMPrimaerGeraet = r() < 0.25 && inSccm.length
          ? inSccm[Math.floor(r() * inSccm.length)].Title : "";
        continue;
      }
      if (r() < 0.1 && inSccm.length) {
        // Abweichung: SCCM sieht die Person hauptsächlich an einem anderen Gerät.
        b.SCCMPrimaerGeraet = inSccm[Math.floor(r() * inSccm.length)].Title;
      } else {
        b.SCCMPrimaerGeraet = zugeordnet;
      }
    }
  }


  /* Eine Neuaufsetzung unter altem Namen: Der Vorgänger (andere Hardware,
     andere Seriennummer) bleibt archiviert als eigene Zeile liegen, sein
     Inhaber hängt noch an ihm; das neue Gerät hat noch keinen. So lässt
     sich im Vorführmodus anschauen, dass die Inhaberschaft an der Hardware
     hängt und nicht am Namen. Ohne Würfel, damit alle übrigen Vorführdaten
     bleiben, wie sie sind. */
  function neuaufsetzungZeigen(admin, benutzer) {
    const vergeben = new Set(benutzer.map(b => Modell.geraetId(b.AdminClientId)));
    const neu = admin.filter(z => Hilfe.istJa(z.SCCM_Found) && Modell.status(z.Status) === "Aktiv"
      && !vergeben.has(String(z.id)))[0];
    const person = benutzer.filter(b => !Modell.geraetId(b.AdminClientId))[0];
    if (!neu || !person) return;
    const eintrag = function (tage, text) {
      return { id: "mock-neuaufsetzung-" + tage, datum: tagIso(tage), text: text, quelle: "sync", erstellt: vorTagen(tage, 4) };
    };
    neu.Verlauf = JSON.stringify([eintrag(21, "Aus SCCM neu angelegt")]);
    let hoechste = 0;
    for (const z of admin) hoechste = Math.max(hoechste, Number(z.id) || 0);
    const alt = Object.assign({}, neu, {
      id: String(hoechste + 1),
      Status: "Archiviert",
      SCCM_Found: "Nein",
      SCCM_Online: "Nein",
      SCCM_CurrentLogonUser: "",
      SCCM_SyncStatus: "Kein SCCM-Gerät zu '" + neu.Title + "'",
      SCCM_ResourceID: Number(neu.SCCM_ResourceID) - 4200,
      SCCM_SerialNumber: "SN" + String(Number(String(neu.SCCM_SerialNumber).replace(/\D/g, "")) + 7),
      SCCM_LastActive: vorTagen(23, 16),
      Beschaffungsjahr: "2019/2020",
      ErsatzGeplant: "2024/2025",
      Verlauf: JSON.stringify([eintrag(1900, "Aus SCCM neu angelegt"),
        eintrag(20, "In SCCM nicht mehr vorhanden, archiviert")])
    });
    admin.push(alt);
    person.AdminClientId = Number(alt.id);
    person.SCCMPrimaerGeraet = neu.Title;
  }


  /* Die Grunddaten: immer dieselben, weil der Würfel einen festen Startwert
     hat. Was im Vorführmodus bearbeitet wird, liegt separat im Overlay. */
  let zwischenspeicher = null;

  function grunddaten() {
    if (zwischenspeicher) return zwischenspeicher;
    const r = wuerfel(20260902);
    const ids = programmIds();

    const admin = [];
    for (let i = 1; i <= 50; i++) admin.push(geraet(r, i, "CAMPUS-"));

    /* Die EDU-Clients: Schulungsgeräte ohne Inhaber. Sie bekommen eigene
       Listen-Ids ab 500, damit sich die beiden Listen im Vorführmodus nicht
       ins Gehege kommen. */
    const edu = [];
    for (let i = 1; i <= 18; i++) {
      const z = geraet(r, i, "EDU-");
      z.id = String(500 + i);
      edu.push(z);
    }

    const benutzer = [];
    let nr = 1;
    // Die ersten 42 ADMIN-Clients bekommen ihren Inhaber.
    for (let i = 0; i < 42; i++) benutzer.push(benutzerZeile(r, nr++, admin[i], ids));
    /* Zwei Altlasten: hier trägt eine zweite Person dasselbe Gerät. Ein
       Gerät hat genau einen Inhaber, darum zeigt das Frontend darauf den
       Fehler «Mehr als ein Inhaber» — ohne solche Zeilen wäre er im
       Vorführmodus nie zu sehen. */
    for (let i = 0; i < 2; i++) benutzer.push(benutzerZeile(r, nr++, admin[i * 3], ids));
    // Zwölf Personen ohne Gerät. Die Geräte 43..50 bleiben ohne Inhaber.
    for (let i = 0; i < 12; i++) benutzer.push(benutzerZeile(r, nr++, null, ids));

    /* Erst jetzt, wo beide Seiten stehen, die SCCM-Konten ableiten. Die
       EDU-Clients kommen mit: SCCM meldet auch dort Anmeldungen, nur die
       Inhaberschaft gibt es bei ihnen bewusst nicht. */
    benutzerkontenAbgleichen(r, admin.concat(edu), benutzer);

    // Die Telefonliste hängt an den Benutzern (Kurzwahl = 200 + Nummer).
    const telefon = telefone(r, benutzer);

    neuaufsetzungZeigen(admin, benutzer);

    // Kameras mit eigenem Würfel: die übrigen Vorführdaten bleiben unverändert.
    const rk = wuerfel(20261013);
    const kamera = kameraZeilen(rk);
    const kamerarolle = kameraRollenZeilen(rk, benutzer, kamera);
    kameraSichtbarkeit(kamera, kamerarolle);

    zwischenspeicher = {
      admin: admin, edu: edu, benutzer: benutzer,
      telefon: telefon, software: softwareZeilen(),
      kamera: kamera, kamerarolle: kamerarolle
    };
    return zwischenspeicher;
  }


  /* ---------- Overlay: Änderungen im Vorführmodus ----------

     Im Vorführmodus gibt es kein SharePoint. Damit Bearbeiten trotzdem
     etwas bewirkt und alle Fenster dasselbe sehen, landen Änderungen im
     localStorage, getrennt nach Liste:

       { admin: { geaendert:{}, neu:[], geloescht:[] },
         edu: { … }, benutzer: { … }, telefon: { … }, software: { … } }

     Mock.zuruecksetzen() räumt alles wieder weg. */

  const SCHLUESSEL = "ictinventar.mock.aenderungen.v3";
  const LISTEN = ["admin", "edu", "benutzer", "telefon", "software", "kamera", "kamerarolle"];

  /* Listenname auf die bekannten bringen; Unbekanntes gilt als ADMIN-Clients. */
  function listenName(liste) {
    return LISTEN.indexOf(liste) > -1 ? liste : "admin";
  }

  function spaltenVon(liste) {
    if (liste === "benutzer") return SPALTEN_BENUTZER;
    if (liste === "telefon") return SPALTEN_TELEFON;
    if (liste === "software") return SPALTEN_SOFTWARE;
    if (liste === "kamera") return SPALTEN_KAMERA;
    if (liste === "kamerarolle") return SPALTEN_KAMERAROLLE;
    return SPALTEN_CLIENT;
  }

  // Ersatzspeicher, falls localStorage nicht zur Verfügung steht.
  let ersatz = null;

  function leeresOverlay() {
    const o = {};
    for (const l of LISTEN) o[l] = { geaendert: {}, neu: [], geloescht: [] };
    return o;
  }

  function teilLesen(o, liste) {
    const t = (o && o[liste]) || {};
    return { geaendert: t.geaendert || {}, neu: t.neu || [], geloescht: t.geloescht || [] };
  }

  function overlayLesen() {
    if (ersatz) return ersatz;
    try {
      const roh = window.localStorage.getItem(SCHLUESSEL);
      if (!roh) return leeresOverlay();
      const o = JSON.parse(roh);
      const ergebnis = {};
      for (const l of LISTEN) ergebnis[l] = teilLesen(o, l);
      return ergebnis;
    } catch (e) {
      return leeresOverlay();
    }
  }

  function overlaySchreiben(o) {
    try {
      window.localStorage.setItem(SCHLUESSEL, JSON.stringify(o));
      ersatz = null;
    } catch (e) {
      ersatz = o;
    }
  }

  /* Alle Zeilen einer Liste mit angewandtem Overlay. */
  function zeilen(liste) {
    fehlerPruefen();
    const l = listenName(liste);
    const o = overlayLesen()[l];
    const alle = grunddaten()[l]
      .filter(z => o.geloescht.indexOf(String(z.id)) === -1)
      .map(function (z) {
        const aenderung = o.geaendert[String(z.id)];
        return aenderung ? Object.assign({}, z, aenderung) : Object.assign({}, z);
      });
    for (const n of o.neu) {
      if (o.geloescht.indexOf(String(n.id)) > -1) continue;
      const aenderung = o.geaendert[String(n.id)];
      alle.push(aenderung ? Object.assign({}, n, aenderung) : Object.assign({}, n));
    }
    return alle;
  }

  function zeile(liste, id) {
    const gesucht = String(id);
    const treffer = zeilen(liste).filter(z => String(z.id) === gesucht)[0];
    if (!treffer) {
      const fehler = new Error("Diese Zeile gibt es im Vorführmodus nicht (mehr).");
      fehler.status = 404;
      throw fehler;
    }
    return treffer;
  }

  function speichern(liste, id, felder) {
    const l = listenName(liste);
    const o = overlayLesen();
    const s = String(id);
    o[l].geaendert[s] = Object.assign({}, o[l].geaendert[s] || {}, felder);
    overlaySchreiben(o);
    return zeile(l, id);
  }

  function anlegen(liste, felder) {
    const l = listenName(liste);
    const o = overlayLesen();
    let hoechste = 1000;
    for (const z of grunddaten()[l]) hoechste = Math.max(hoechste, Number(z.id) || 0);
    for (const z of o[l].neu) hoechste = Math.max(hoechste, Number(z.id) || 0);
    const vorlage = leereZeile(spaltenVon(l));
    if (l === "benutzer") for (const id of programmIds()) vorlage[id] = "0";
    const z = Object.assign(vorlage, felder);
    z.id = String(hoechste + 1);
    o[l].neu.push(z);
    overlaySchreiben(o);
    return z;
  }

  function loeschen(liste, id) {
    const l = listenName(liste);
    const o = overlayLesen();
    const s = String(id);
    if (o[l].geloescht.indexOf(s) === -1) o[l].geloescht.push(s);
    delete o[l].geaendert[s];
    overlaySchreiben(o);
    return true;
  }

  function zuruecksetzen() {
    ersatz = null;
    try { window.localStorage.removeItem(SCHLUESSEL); } catch (e) { /* egal */ }
  }

  /* Gibt es überhaupt Änderungen? Für den Hinweis im Vorführband. */
  function anzahlAenderungen() {
    const o = overlayLesen();
    let n = 0;
    for (const l of LISTEN) {
      n += Object.keys(o[l].geaendert).length + o[l].neu.length + o[l].geloescht.length;
    }
    return n;
  }

  /* Im Vorführmodus gibt es keine SharePoint-Spalten – das Anlegen tut
     nichts und meldet Erfolg, damit sich das Softwarefenster ganz normal
     bedienen lässt. */
  function programmSpalteAnlegen() { return true; }

  /* Sync-Zustand: Standard «vor 12 Minuten ohne Fehler»; ?sync=fehler zeigt
     einen Lauf mit Fehler, ?sync=alt einen, der zu lange zurückliegt. */
  function syncStatus() {
    const art = ABFRAGE.get("sync");
    const minuten = art === "alt" ? 26 * 60 : 12;
    const zeit = new Date(Date.now() - minuten * 60 * 1000).toISOString();
    if (art === "fehler") return { zeit: zeit, text: "1 Fehler: EDU-Clients: Liste konnte nicht gelesen werden (Vorführfehler)." };
    return { zeit: zeit, text: "OK" };
  }

  return {
    zeilen: zeilen,
    clients: function (liste) { return zeilen(liste === "edu" ? "edu" : "admin"); },
    benutzer: function () { return zeilen("benutzer"); },
    telefone: function () { return zeilen("telefon"); },
    software: function () { return zeilen("software"); },
    kameras: function () { return zeilen("kamera"); },
    kameraRollen: function () { return zeilen("kamerarolle"); },
    zeile: zeile,
    speichern: speichern,
    anlegen: anlegen,
    loeschen: loeschen,
    programmSpalteAnlegen: programmSpalteAnlegen,
    syncStatus: syncStatus,
    zuruecksetzen: zuruecksetzen,
    anzahlAenderungen: anzahlAenderungen
  };
})();

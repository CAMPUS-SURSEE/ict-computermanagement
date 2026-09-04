/* graph.js — Daten für «Computer Inventar».

   Drei Teile:
     1. Hilfe   — Formatierung von Datum, Zahlen, Ja/Nein und mehrzeiligem Text.
     2. Daten   — Lesen und Schreiben der drei SharePoint-Listen und der
                  Datei programme.json über Microsoft Graph.
     3. Mock    — Fantasie-Datensatz für den Modus ?mock=1.

   Die Berechtigung ist delegiert (Sites.ReadWrite.All): das Token kann genau
   das, was die angemeldete Person in SharePoint ohnehin darf.

   Öffentliche Schnittstelle (auch im Vorführmodus identisch):
     await Daten.computer(fortschritt)     → Array flacher Zeilen
     await Daten.benutzer(fortschritt)     → Array flacher Zeilen
     await Daten.telefone(fortschritt)     → Array flacher Zeilen
     await Daten.programme()               → Objekt aus programme.json
     await Daten.zeile(liste, id)          → eine Zeile
     await Daten.speichern(liste, id, f)   → geänderte Zeile
     await Daten.anlegen(liste, felder)    → neue Zeile
     await Daten.loeschen(liste, id)       → true
   «liste» ist "computer", "benutzer" oder "telefon". «fortschritt» ist eine
   Rückrufe-Funktion, die nach jeder geladenen Seite die bisherige Anzahl
   bekommt.

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

  /* Zahlen in Schweizer Schreibweise. */
  function zahlText(wert, nachkomma) {
    if (wert === null || wert === undefined || wert === "") return "";
    const n = Number(wert);
    if (isNaN(n)) return String(wert);
    return n.toLocaleString("de-CH", {
      minimumFractionDigits: nachkomma || 0,
      maximumFractionDigits: nachkomma === undefined ? 1 : nachkomma
    });
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

  const LISTEN_TITEL = { computer: "Computer", benutzer: "Benutzer", telefon: "Telefonnummern" };

  function listenPfad(liste) {
    if (!KONFIG.listeBereit(liste)) {
      const fehler = new Error(
        "In konfig.js fehlt die Listen-ID für die Liste «" + (LISTEN_TITEL[liste] || liste)
        + "». Sie steht in den Listeneinstellungen in SharePoint und gehört in konfig.js. "
        + "Bis dahin lässt sich die Seite mit "
        + "?mock=1 im Vorführmodus anschauen.");
      fehler.status = 0;
      fehler.konfiguration = true;
      throw fehler;
    }
    return "/sites/" + KONFIG.siteId + "/lists/" + KONFIG.listId(liste);
  }

  /* Eine Anfrage an Graph. */
  async function anfrage(pfad, einstellungen) {
    const e = einstellungen || {};
    const methode = e.methode || "GET";
    const zugriff = await Auth.token();

    const kopfzeilen = {
      "Authorization": "Bearer " + zugriff,
      "Accept": e.roh ? "*/*" : "application/json"
    };
    let rumpf;
    if (e.rumpf !== undefined && e.rumpf !== null) {
      kopfzeilen["Content-Type"] = "application/json";
      rumpf = JSON.stringify(e.rumpf);
    }

    const antwort = await fetch(pfad.indexOf("http") === 0 ? pfad : WURZEL + pfad, {
      method: methode, headers: kopfzeilen, body: rumpf
    });

    // DELETE antwortet mit 204 und leerem Rumpf.
    const daten = antwort.status === 204 ? null : await antwort.json().catch(() => null);
    if (!antwort.ok) {
      const fehler = new Error(lesbarerFehler(antwort.status, daten, methode, e.was));
      fehler.status = antwort.status;
      throw fehler;
    }
    return daten;
  }

  function lesbarerFehler(status, daten, methode, was) {
    const meldung = daten && daten.error && (daten.error.message || daten.error.code);
    const schreibend = methode && methode !== "GET";
    const ziel = was || "die Liste";
    if (status === 400) return "Microsoft Graph hat die Änderung abgelehnt: "
      + (meldung || "ungültiger Wert") + ". Bitte die Eingaben prüfen.";
    if (status === 401) return "Die Anmeldung ist abgelaufen. Bitte die Seite neu laden.";
    if (status === 403 && schreibend) return "Keine Schreibberechtigung für " + ziel
      + ". Entweder fehlt der App-Registrierung «Computer Inventar Frontend» die delegierte "
      + "Berechtigung Sites.ReadWrite.All samt Administratorzustimmung (README Abschnitt 7.2) "
      + "— oder das Konto darf in SharePoint nur lesen.";
    if (status === 403) return "Keine Berechtigung für " + ziel + ". Bitte prüfen, ob das "
      + "Konto Zugriff auf die SharePoint-Site «mgmts-ict-s» hat.";
    if (status === 409 || status === 412) return "Die Zeile wurde zwischenzeitlich von "
      + "jemand anderem geändert. Bitte neu laden und die Änderung wiederholen.";
    if (status === 404) return "Nicht gefunden: " + ziel + ". Entweder wurde die Zeile "
      + "gelöscht, oder die IDs in konfig.js stimmen nicht mehr.";
    if (status === 429) return "Zu viele Anfragen an Microsoft Graph. "
      + "Bitte eine Minute warten und dann neu laden.";
    if (status >= 500) return "Microsoft Graph antwortet gerade nicht (HTTP " + status + "). "
      + "Bitte später noch einmal versuchen.";
    return meldung || ("Fehler von Microsoft Graph (HTTP " + status + ")");
  }

  /* Graph verschachtelt die Listenspalten unter «fields». Flach ist bequemer. */
  function flach(element) {
    const satz = Object.assign({}, element.fields || {});
    satz.id = element.id;
    return satz;
  }

  /* Alle Zeilen einer Liste, inklusive Folgeseiten.
     Bewusst ohne $select und ohne serverseitiges $filter: die Computer-Liste
     hat rund 85 Spalten, die Benutzer-Liste wächst mit jedem Programm, und
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

  /** Alle Geräte. */
  async function computer(fortschritt) { return alleZeilen("computer", fortschritt); }

  /** Alle Benutzer. */
  async function benutzer(fortschritt) { return alleZeilen("benutzer", fortschritt); }

  /** Alle Telefonnummern. */
  async function telefone(fortschritt) { return alleZeilen("telefon", fortschritt); }

  /* Verständliche Meldung, wenn programme.json nicht geladen werden kann. */
  function programmFehler(ursache) {
    const fehler = new Error(
      "Die Datei " + KONFIG.programmeDateiPfad + " konnte nicht geladen werden. "
      + "Microsoft Graph leitet für Dateien auf campussursee.sharepoint.com weiter. "
      + "Diese Adresse muss in frontend/_headers unter «connect-src» stehen, sonst "
      + "blockiert der Browser den Abruf. Ohne die Datei fehlen alle Berechtigungen. "
      + "(" + ((ursache && ursache.message) || "unbekannter Fehler") + ")");
    fehler.programme = true;
    return fehler;
  }

  /** Inhalt von programme.json aus der Dokumentbibliothek der Site.

     Graph liefert Dateiinhalte nicht selbst aus: der Aufruf von «:/content»
     endet in einer Weiterleitung auf campussursee.sharepoint.com. Diese Adresse
     muss in frontend/_headers unter connect-src stehen, sonst bricht der Browser
     mit «Failed to fetch» ab. Scheitert der Weg trotzdem (etwa weil der
     Authorization-Kopf bei der Weiterleitung verloren geht), wird die von Graph
     gemeldete Download-Adresse ohne Kopfzeilen nachgeladen. */
  async function programme() {
    if (mockModus) return Mock.programme();
    const wurzel = "/sites/" + KONFIG.siteId + "/drive/root:/"
      + KONFIG.programmeDateiPfad.split("/").map(encodeURIComponent).join("/");
    const was = "die Datei " + KONFIG.programmeDateiPfad;

    let inhalt = null;
    try {
      inhalt = await anfrage(wurzel + ":/content", { was: was });
    } catch (e) {
      if (e && e.status !== undefined && e.status !== 0) throw e;
      // Netzwerk- oder Richtlinienfehler: über die Download-Adresse versuchen.
      let beschreibung;
      try {
        beschreibung = await anfrage(wurzel, { was: was });
      } catch (e2) {
        throw programmFehler(e2);
      }
      const adresse = beschreibung && beschreibung["@microsoft.graph.downloadUrl"];
      if (!adresse) throw programmFehler(e);
      try {
        const antwort = await fetch(adresse);
        if (!antwort.ok) throw new Error("HTTP " + antwort.status);
        inhalt = await antwort.json();
      } catch (e3) {
        throw programmFehler(e3);
      }
    }

    if (!inhalt || !Array.isArray(inhalt.programme)) {
      throw new Error("Die Datei " + KONFIG.programmeDateiPfad
        + " ist leer oder hat nicht die erwartete Form (Schlüssel «programme»).");
    }
    return inhalt;
  }

  /** Eine einzelne Zeile, flach wie bei computer()/benutzer(). */
  async function zeile(liste, id) {
    if (mockModus) return Mock.zeile(liste, id);
    const el = await anfrage(listenPfad(liste) + "/items/" + encodeURIComponent(id)
      + "?$expand=fields", { was: "die Liste «" + LISTEN_TITEL[liste] + "»" });
    return flach(el);
  }

  /* Ändert nur die übergebenen Felder einer Zeile. «felder» ist ein flaches
     Objekt { InternerName: Wert }; Texte als Zeichenkette (leer = ""),
     Zahlen als Zahl oder null. Alles Übrige bleibt unangetastet. */
  async function speichern(liste, id, felder) {
    if (mockModus) return Mock.speichern(liste, id, felder);
    const geaendert = await anfrage(
      listenPfad(liste) + "/items/" + encodeURIComponent(id) + "/fields",
      { methode: "PATCH", rumpf: felder, was: "die Liste «" + LISTEN_TITEL[liste] + "»" });
    const satz = Object.assign({}, geaendert || {});
    satz.id = String(id);
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

  /* Ältere Schnittstelle für das Gerätefenster: eine Quelle mit immer
     gleicher Signatur, fest auf die Computer-Liste. Neuer Code ruft besser
     direkt Daten.computer() / Daten.speichern("computer", …) auf. */
  function quelle(mock, liste) {
    const l = liste || "computer";
    return {
      mock: !!mock || mockModus,
      liste: l,
      alleZeilen: function (fortschritt) { return alleZeilen(l, fortschritt); },
      zeile: function (id) { return zeile(l, id); },
      speichern: function (id, felder) { return speichern(l, id, felder); },
      anlegen: function (felder) { return anlegen(l, felder); },
      loeschen: function (id) { return loeschen(l, id); }
    };
  }

  return {
    mockModus: mockModus,
    computer: computer,
    benutzer: benutzer,
    telefone: telefone,
    programme: programme,
    zeile: zeile,
    speichern: speichern,
    anlegen: anlegen,
    loeschen: loeschen,
    quelle: quelle
  };
})();


/* ==================================================================
   3. Mock — Fantasie-Daten für ?mock=1

   Damit lässt sich die Seite ohne Anmeldung anschauen und vorführen. Alle
   Namen und Geräte sind erfunden, die Zahlen stammen aus einem
   Zufallsgenerator mit festem Startwert: derselbe Aufruf ergibt immer
   dieselben Daten.

   Enthalten sind bewusst auch die Sonderfälle:
     - Benutzer ohne Gerät
     - Geräte ohne Benutzer
     - Geräte mit zwei Benutzern
     - Programme mit Stufe 0, 1 und 2 sowie Vorschlägen
     - Geräte ohne Beschaffungsjahr und mit überfälligem Ersatz

   Mit ?mock=1&fehler=1 wirft jeder Ladevorgang einen Fehler. Damit lässt
   sich der Fehlerzustand der Oberfläche prüfen.
   ================================================================== */

const Mock = (function () {

  const ABFRAGE = new URLSearchParams(location.search);
  const fehlerModus = ABFRAGE.get("fehler") === "1";

  function fehlerPruefen() {
    if (!fehlerModus) return;
    const f = new Error("Vorführ-Fehler (?fehler=1): so sieht die Seite aus, "
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


  /* ---------- programme.json ---------- */

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

  function programme() {
    fehlerPruefen();
    const liste = [];
    const kategorien = Object.keys(PROGRAMME_ROH);
    for (const kategorie of kategorien) {
      for (const [id, name] of PROGRAMME_ROH[kategorie]) {
        liste.push({
          id: id, name: name, kategorie: kategorie,
          adGruppen: (AD_GRUPPEN[id] || []).slice(),
          vorschlaege: (VORSCHLAEGE[id] || []).slice()
        });
      }
    }
    return {
      version: 1,
      aktualisiert: vorTagen(1, 6),
      kategorien: kategorien,
      programme: liste
    };
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
    z.FruehererEintrag = frueher || "";
    z.Verlauf = JSON.stringify([{
      id: "mock-t-" + nr, datum: tagIso(35), quelle: "sync", erstellt: vorTagen(35, 9),
      text: "Aus der Telefonliste S4B importiert (Stand 31.07.2026)"
    }]);
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
    "Neu in SCCM gefunden und mit der Liste verbunden",
    "Modell laut SCCM gewechselt: Latitude 5540 statt OptiPlex 7010"
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

  function geraet(r, nummer) {
    const z = leereZeile(SPALTEN_COMPUTER);
    const name = "CAMPUS-9" + String(nummer).padStart(2, "0");

    z.id = String(nummer);
    z.Title = name;
    z.Seriennummer = "SN" + String(100000 + Math.floor(r() * 899999));
    z.GebaeudeStock = waehle(r, GEBAEUDE);
    z.Bemerkung = r() < 0.15 ? "Ersatzgerät, Rückgabe offen" : "";

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

    // Rund jedes zehnte Gerät ist nicht in SCCM.
    const inSccm = r() > 0.1;
    z.SCCM_Found = inSccm ? "Ja" : "Nein";
    if (!inSccm) {
      z.SCCM_SyncStatus = "Kein SCCM-Gerät gefunden";
      return z;
    }

    const aktivVorTagen = Math.floor(Math.pow(r(), 3) * 200);
    const online = aktivVorTagen === 0 && r() < 0.7;

    z.SCCM_Name = name;
    z.SCCM_ResourceID = 16770000 + nummer;
    z.SCCM_SMSID = "GUID:00000000-0000-0000-0000-" + String(nummer).padStart(12, "0");
    z.SCCM_Domain = "SASADMIN";
    z.SCCM_OU = "CN=" + name + ",OU=Computer,DC=sasadmin,DC=local";
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
    z.SCCM_SerialNumber = z.Seriennummer;
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

  function benutzerZeile(r, nummer, pcName, ids) {
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
    z.Computer = pcName || "";
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

  /* ---------- SCCM-Konten aus den Zuordnungen ableiten ----------

     Im echten SCCM stehen in SCCM_PrimaryUser, SCCM_LastLogonUser und
     SCCM_CurrentLogonUser die Konten, die an diesem Gerät wirklich
     arbeiten — also normalerweise die zugeordnete Person, geschrieben als
     «DOMAENE\login». Umgekehrt meldet SMS_UserMachineRelationship für jede
     Person ihr Primärgerät; das landet in SCCMPrimaerGeraet.

     «Normalerweise»: bei rund jedem zehnten Datensatz weicht ein Feld ab —
     Handwechsel nicht nachgeführt, Support-Anmeldung, Zweitgerät. Genau
     diese Abweichungen erzeugen im Frontend die Hinweise «Primärer Benutzer
     ist nicht zugeordnet» und «SCCM meldet ein anderes Primärgerät». Ohne
     sie wären die Hinweise nie zu sehen, mit zu vielen wären sie unglaubwürdig. */

  const DOMAENE = "SASADMIN";

  function konto(login) {
    return login ? DOMAENE + "\\" + login : "";
  }

  function benutzerkontenAbgleichen(r, computer, benutzer) {
    // Logins je Gerät, in der Reihenfolge der Benutzerliste.
    const nachGeraet = new Map();
    for (const b of benutzer) {
      const pc = String(b.Computer || "").trim().toLowerCase();
      if (!pc) continue;
      if (!nachGeraet.has(pc)) nachGeraet.set(pc, []);
      nachGeraet.get(pc).push(b.Title);
    }
    const alleLogins = benutzer.map(b => b.Title);
    const inSccm = computer.filter(z => Hilfe.istJa(z.SCCM_Found));

    /* --- Geräteseite --- */
    for (const z of computer) {
      if (!Hilfe.istJa(z.SCCM_Found)) continue;
      const logins = nachGeraet.get(String(z.Title || "").toLowerCase()) || [];
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

      // Der zuletzt angemeldete Benutzer ist meist derselbe; sonst der
      // zweite zugeordnete Benutzer oder der Support.
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
      const zugeordnet = String(b.Computer || "").trim();
      if (!zugeordnet) {
        // Ohne Zuordnung meldet SCCM manchmal trotzdem ein Primärgerät.
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


  /* Die Grunddaten: immer dieselben, weil der Würfel einen festen Startwert
     hat. Was im Vorführmodus bearbeitet wird, liegt separat im Overlay. */
  let zwischenspeicher = null;

  function grunddaten() {
    if (zwischenspeicher) return zwischenspeicher;
    const r = wuerfel(20260902);
    const ids = programmIds();

    const computer = [];
    for (let i = 1; i <= 50; i++) computer.push(geraet(r, i));

    const benutzer = [];
    let nr = 1;
    // Die ersten 42 Geräte bekommen einen Benutzer, sechs davon einen zweiten.
    for (let i = 0; i < 42; i++) benutzer.push(benutzerZeile(r, nr++, computer[i].Title, ids));
    for (let i = 0; i < 6; i++) benutzer.push(benutzerZeile(r, nr++, computer[i * 3].Title, ids));
    // Acht Personen ohne Gerät. Die Geräte 43..50 bleiben ohne Benutzer.
    for (let i = 0; i < 8; i++) benutzer.push(benutzerZeile(r, nr++, "", ids));

    // Erst jetzt, wo beide Seiten stehen, die SCCM-Konten ableiten.
    benutzerkontenAbgleichen(r, computer, benutzer);

    // Die Telefonliste hängt an den Benutzern (Kurzwahl = 200 + Nummer).
    const telefon = telefone(r, benutzer);

    zwischenspeicher = { computer: computer, benutzer: benutzer, telefon: telefon };
    return zwischenspeicher;
  }


  /* ---------- Overlay: Änderungen im Vorführmodus ----------

     Im Vorführmodus gibt es kein SharePoint. Damit Bearbeiten trotzdem
     etwas bewirkt und alle Fenster dasselbe sehen, landen Änderungen im
     localStorage, getrennt nach Liste:

       { computer: { geaendert:{}, neu:[], geloescht:[] },
         benutzer: { … }, telefon: { … } }

     Mock.zuruecksetzen() räumt alles wieder weg. */

  const SCHLUESSEL = "computerinventar.mock.aenderungen.v2";
  const LISTEN = ["computer", "benutzer", "telefon"];

  /* Listenname auf die drei bekannten bringen; Unbekanntes gilt als Computer. */
  function listenName(liste) {
    return LISTEN.indexOf(liste) > -1 ? liste : "computer";
  }

  function spaltenVon(liste) {
    if (liste === "benutzer") return SPALTEN_BENUTZER;
    if (liste === "telefon") return SPALTEN_TELEFON;
    return SPALTEN_COMPUTER;
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

  return {
    zeilen: zeilen,
    computer: function () { return zeilen("computer"); },
    benutzer: function () { return zeilen("benutzer"); },
    telefone: function () { return zeilen("telefon"); },
    programme: programme,
    zeile: zeile,
    speichern: speichern,
    anlegen: anlegen,
    loeschen: loeschen,
    zuruecksetzen: zuruecksetzen,
    anzahlAenderungen: anzahlAenderungen
  };
})();

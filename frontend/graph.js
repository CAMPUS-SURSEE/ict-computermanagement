/* graph.js — Daten für «Computer Inventar».

   Zwei Aufgaben:
     1. Hilfe   — Formatierung von Datum, Zahlen, Ja/Nein und mehrzeiligem Text.
     2. Daten   — Lesen und Schreiben der SharePoint-Liste über Microsoft Graph,
                  dazu der Fantasie-Datensatz für den Modus ?mock=1.

   Die Berechtigung ist delegiert (Sites.ReadWrite.All): das Token kann genau
   das, was die angemeldete Person in SharePoint ohnehin darf. Geschrieben
   werden ausschliesslich die von Hand gepflegten Spalten (Quelle «excel»);
   die SCCM-Spalten überschreibt der Abgleich ohnehin bei jedem Lauf.

   Setzt konfig.js, spalten.js und auth.js voraus. */


/* ==================================================================
   Hilfe — Formatierung
   ================================================================== */

const Hilfe = (function () {

  const MS_TAG = 24 * 60 * 60 * 1000;

  /* Aus einem ISO-Zeitstempel (Graph liefert UTC) ein Date-Objekt, oder null.
     Alle Vergleiche im Frontend laufen über Date-Objekte, nie über Text. */
  function datum(wert) {
    if (!wert) return null;
    const d = new Date(wert);
    return isNaN(d.getTime()) ? null : d;
  }

  function zweistellig(n) {
    return String(n).padStart(2, "0");
  }

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

  /* «vor 3 Tagen», «heute», «vor 2 Monaten». Bewusst grob: für die Frage
     «ist das Gerät noch in Betrieb» reicht die Grössenordnung. */
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

  /* Zahlen in Schweizer Schreibweise, mit Apostroph als Tausendertrenner. */
  function zahlText(wert, nachkomma) {
    if (wert === null || wert === undefined || wert === "") return "";
    const n = Number(wert);
    if (isNaN(n)) return String(wert);
    return n.toLocaleString("de-CH", {
      minimumFractionDigits: nachkomma || 0,
      maximumFractionDigits: nachkomma === undefined ? 1 : nachkomma
    });
  }

  /* Die SCCM-Spalten liefern «Ja»/«Nein» als Text, die Excel-Spalten echte
     Wahrheitswerte. Beides landet hier. */
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
    return String(wert)
      .replace(/\r/g, "")
      .split("\n")
      .map(z => z.trim())
      .filter(z => z.length > 0);
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
    datum: datum,
    datumText: datumText,
    datumZeitText: datumZeitText,
    tageHer: tageHer,
    relativText: relativText,
    zahlText: zahlText,
    istJa: istJa,
    zeilen: zeilen,
    felder: felder,
    vergleiche: vergleiche
  };
})();


/* ==================================================================
   Daten — Microsoft Graph
   ================================================================== */

const Daten = (function () {

  const WURZEL = "https://graph.microsoft.com/v1.0";
  const LISTE = "/sites/" + KONFIG.siteId + "/lists/" + KONFIG.listId;

  /* Eine Anfrage an Graph. «einstellungen» erlaubt eine andere Methode und
     einen Rumpf; ohne Angabe ist es ein einfaches GET. */
  async function anfrage(pfad, einstellungen) {
    const e = einstellungen || {};
    const methode = e.methode || "GET";
    const zugriff = await Auth.token();

    const kopfzeilen = {
      "Authorization": "Bearer " + zugriff,
      "Accept": "application/json"
    };
    let rumpf;
    if (e.rumpf !== undefined && e.rumpf !== null) {
      kopfzeilen["Content-Type"] = "application/json";
      rumpf = JSON.stringify(e.rumpf);
    }

    const antwort = await fetch(pfad.indexOf("http") === 0 ? pfad : WURZEL + pfad, {
      method: methode,
      headers: kopfzeilen,
      body: rumpf
    });

    // DELETE antwortet mit 204 und leerem Rumpf.
    const daten = antwort.status === 204 ? null : await antwort.json().catch(() => null);
    if (!antwort.ok) {
      const fehler = new Error(lesbarerFehler(antwort.status, daten, methode));
      fehler.status = antwort.status;
      throw fehler;
    }
    return daten;
  }

  function lesbarerFehler(status, daten, methode) {
    const meldung = daten && daten.error && (daten.error.message || daten.error.code);
    const schreibend = methode && methode !== "GET";
    if (status === 400) return "Microsoft Graph hat die Änderung abgelehnt: "
      + (meldung || "ungültiger Wert") + ". Bitte die Eingaben prüfen.";
    if (status === 401) return "Die Anmeldung ist abgelaufen. Bitte die Seite neu laden.";
    if (status === 403 && schreibend) return "Keine Schreibberechtigung für die Liste "
      + "«Computer Inventar». Entweder fehlt der Anwendung die Berechtigung "
      + "Sites.ReadWrite.All — dann bitte code\\Setup-FrontendApp.ps1 erneut ausführen, "
      + "damit der Admin-Consent erteilt wird — oder das Konto darf in SharePoint "
      + "nur lesen.";
    if (status === 403) return "Keine Berechtigung für die Liste «Computer Inventar». "
      + "Bitte prüfen, ob das Konto Zugriff auf die SharePoint-Site «mgmts-ict-s» hat.";
    if (status === 409 || status === 412) return "Die Zeile wurde zwischenzeitlich von "
      + "jemand anderem geändert. Bitte neu laden und die Änderung wiederholen.";
    if (status === 404) return "Nicht gefunden. Entweder wurde die Zeile inzwischen gelöscht, "
      + "oder siteId und listId in konfig.js stimmen nicht mehr.";
    if (status === 429) return "Zu viele Anfragen an Microsoft Graph. "
      + "Bitte eine Minute warten und dann neu laden.";
    if (status >= 500) return "Microsoft Graph antwortet gerade nicht (HTTP " + status + "). "
      + "Bitte später noch einmal versuchen.";
    return meldung || ("Fehler von Microsoft Graph (HTTP " + status + ")");
  }

  /* Graph verschachtelt die Listenspalten unter «fields». Für die Seite ist
     ein flaches Objekt bequemer. */
  function flach(element) {
    const satz = Object.assign({}, element.fields || {});
    satz.id = element.id;
    return satz;
  }

  /* Lädt die ganze Liste, inklusive Folgeseiten.

     Bewusst ohne $select: die Liste hat rund 190 Spalten, eine Auswahl wäre
     länger als die Adresse erlaubt und müsste bei jeder Schemaänderung
     nachgeführt werden. Ebenso bewusst ohne serverseitiges $filter: das
     bräuchte Indizes und scheitert bei dieser Listengrösse sporadisch.
     Rund 220 Zeilen sind im Browser mühelos zu filtern. */
  async function alleZeilen(fortschritt) {
    let url = LISTE + "/items?$expand=fields&$top=999";
    const treffer = [];
    while (url) {
      const seite = await anfrage(url);
      for (const el of (seite.value || [])) treffer.push(flach(el));
      if (fortschritt) fortschritt(treffer.length);
      url = seite["@odata.nextLink"] || null;
    }
    return treffer;
  }

  /* Eine einzelne Zeile, flach wie bei alleZeilen(). */
  async function zeile(id) {
    const el = await anfrage(LISTE + "/items/" + encodeURIComponent(id) + "?$expand=fields");
    return flach(el);
  }

  /* Ändert nur die übergebenen Felder einer Zeile.
     «felder» ist ein flaches Objekt { InternerName: Wert }. Texte als
     Zeichenkette (leer = ""), Ja/Nein als true/false, Zahlen als Zahl oder
     null. Alles Übrige bleibt unangetastet. */
  async function speichern(id, felder) {
    const geaendert = await anfrage(
      LISTE + "/items/" + encodeURIComponent(id) + "/fields",
      { methode: "PATCH", rumpf: felder });
    const satz = Object.assign({}, geaendert || {});
    satz.id = String(id);
    return satz;
  }

  /* Legt eine neue Zeile an und gibt sie flach zurück. */
  async function anlegen(felder) {
    const el = await anfrage(LISTE + "/items",
      { methode: "POST", rumpf: { fields: felder } });
    return flach(el);
  }

  /* Löscht eine Zeile. SharePoint legt sie in den Papierkorb der Site, ein
     Versehen lässt sich dort innerhalb von 93 Tagen rückgängig machen. */
  async function loeschen(id) {
    await anfrage(LISTE + "/items/" + encodeURIComponent(id), { methode: "DELETE" });
    return true;
  }

  /* Eine Quelle mit immer gleicher Signatur: entweder Graph oder die
     Fantasie-Daten. So muss die Oberfläche nirgends zwischen den beiden
     Fällen verzweigen. Mock wird erst hier nachgeschlagen, weil das Modul
     weiter unten in derselben Datei steht. */
  function quelle(mockModus) {
    if (mockModus) {
      return {
        mock: true,
        alleZeilen: async function () { return Mock.zeilen(); },
        zeile: async function (id) { return Mock.zeile(id); },
        speichern: async function (id, felder) { return Mock.speichern(id, felder); },
        anlegen: async function (felder) { return Mock.anlegen(felder); },
        loeschen: async function (id) { return Mock.loeschen(id); }
      };
    }
    return {
      mock: false,
      alleZeilen: alleZeilen,
      zeile: zeile,
      speichern: speichern,
      anlegen: anlegen,
      loeschen: loeschen
    };
  }

  return {
    alleZeilen: alleZeilen,
    zeile: zeile,
    speichern: speichern,
    anlegen: anlegen,
    loeschen: loeschen,
    quelle: quelle
  };
})();


/* ==================================================================
   Mock — Fantasie-Daten für ?mock=1

   Damit lässt sich die Seite ohne Anmeldung anschauen und im Netz
   vorführen. Alle Namen und Geräte sind erfunden, die Zahlen stammen aus
   einem Zufallsgenerator mit festem Startwert: derselbe Aufruf ergibt immer
   dieselben Daten.
   ================================================================== */

const Mock = (function () {

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
  const GEBAEUDE  = ["Haus A / EG", "Haus A / 1. OG", "Haus B / 2. OG",
                     "Haus C / UG", "Werkhof / EG", "Sportzentrum / 1. OG"];
  const HERSTELLER = ["Dell Inc.", "Dell Inc.", "Dell Inc.", "HP", "LENOVO"];
  const MODELLE   = ["Latitude 5540", "Latitude 7440", "OptiPlex 7010",
                     "Precision 3581", "EliteBook 840 G10", "ThinkCentre M70q"];
  const OSVERSION = ["10.0.26100", "10.0.26100", "10.0.22631", "10.0.19045"];
  const GEHAEUSE  = ["Notebook", "Notebook", "Desktop", "Mini PC"];
  const TYPEN     = ["Notebook", "Desktop", "Notebook", "Mini PC"];
  const JAHRE     = ["J20212022", "J20222023", "J20232024", "J20242025", "J20252026"];

  const SOFTWARE_JA = ["Microsoft365", "SharePoint", "AdobeReader", "PDFCreator",
                       "KeePass", "VLCPlayer", "CitrixClient", "ZeitAG", "TimePro",
                       "Protel", "ABACUS", "Frontify", "Microsoft365Copilot",
                       "AdobeAcrobatPro", "MicrosoftPowerBIDesktop", "AutoCADLT",
                       "BpandaConsumer", "PerformX", "Milestone", "AppCore"];
  const ADGRUPPEN = ["ADPhotoEdit", "ContentStudio", "Firefox", "KeyMagic",
                     "Salto", "Tiffany", "PostPWC"];
  const APPS = ["7-Zip 24.09", "Adobe Acrobat Reader", "Google Chrome",
                "KeePass 2.57", "Microsoft 365 Apps", "Notepad++ 8.7",
                "VLC Media Player", "Citrix Workspace", "Power BI Desktop"];
  const SAMMLUNGEN = ["Alle Notebooks", "Alle Desktops", "Standard-Software",
                      "Bildung", "Verwaltung", "Technischer Dienst"];

  function waehle(r, liste) {
    return liste[Math.floor(r() * liste.length)];
  }

  function vorTagen(tage, stunde) {
    const d = new Date();
    d.setDate(d.getDate() - tage);
    d.setHours(stunde === undefined ? 8 : stunde, 15, 0, 0);
    return d.toISOString();
  }

  /* Baut eine vollständige Zeile: erst alle Spalten leer, dann gefüllt.
     So sieht die Seite im Mock-Modus genau die Spalten, die sie auch
     produktiv sieht. */
  function leereZeile() {
    const z = {};
    for (const s of SPALTEN) {
      z[s.i] = s.t === "Boolean" ? false : "";
    }
    return z;
  }

  function geraet(r, nummer) {
    const z = leereZeile();
    const nach = waehle(r, NACHNAMEN);
    const vor = waehle(r, VORNAMEN);
    const person = nach + " " + vor;
    const login = (nach + "." + vor).toLowerCase();
    const name = "CAMPUS-9" + String(nummer).padStart(2, "0");

    z.id = String(nummer);
    z.Title = name;
    z.Arbeitsplatz = person;
    z.Login = login;
    z.Firma = waehle(r, FIRMEN);
    z.Typ = waehle(r, TYPEN);
    z.Seriennummer = "SN" + String(100000 + Math.floor(r() * 899999));
    z.GebaeudeStock = waehle(r, GEBAEUDE);
    z.Bemerkung = r() < 0.15 ? "Ersatzgerät, Rückgabe offen" : "";
    z[waehle(r, JAHRE)] = true;

    for (const spalte of SOFTWARE_JA) {
      if (r() < 0.35) z[spalte] = true;
    }
    for (const spalte of ADGRUPPEN) {
      if (r() < 0.2) z[spalte] = "Ja";
    }

    // Rund jedes zehnte Gerät ist nicht in SCCM: alte Excel-Zeile ohne Abgleich.
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
    z.SCCM_LastLogonUser = "SASADMIN\\" + login;
    z.SCCM_CurrentLogonUser = online ? "SASADMIN\\" + login : "";
    z.SCCM_PrimaryUser = "SASADMIN\\" + login;
    z.SCCM_TopConsoleUser = "SASADMIN\\" + login;
    z.SCCM_LastConsoleUse = vorTagen(aktivVorTagen, 7);
    z.SCCM_ConsoleUsers = [
      "SASADMIN\\" + login + " | " + (20 + Math.floor(r() * 300)) + " Anmeldungen | "
        + (500 + Math.floor(r() * 40000)) + " Min | zuletzt "
        + Hilfe.datumZeitText(vorTagen(aktivVorTagen, 7)),
      "SASADMIN\\ict.support | " + (1 + Math.floor(r() * 9)) + " Anmeldungen | "
        + (10 + Math.floor(r() * 200)) + " Min | zuletzt "
        + Hilfe.datumZeitText(vorTagen(aktivVorTagen + 40, 14))
    ].join("\n");

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
    // Rund jedes siebte Gerät läuft absichtlich knapp am Speicherplatz,
    // damit die Kennzahl «unter 20 GB frei» im Vorführmodus etwas zeigt.
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
    z.SCCM_Battery = z.SCCM_ChassisType === "Notebook" ? "OK, " + (60 + Math.floor(r() * 40)) + " %" : "";

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

    const swAnzahl = 40 + Math.floor(r() * 60);
    z.SCCM_InstalledSoftwareCount = swAnzahl;
    z.SCCM_InstalledSoftware = APPS.slice(0, 6)
      .map((a, i) => a + " | " + (1 + i) + "." + i + ".0").join("\n");
    z.SCCM_Collections = SAMMLUNGEN.slice(0, 3).join("\n");

    z.SCCM_LastSync = vorTagen(0, 5);
    z.SCCM_SyncStatus = "OK";
    return z;
  }

  /* Weitere Benutzerzeile desselben Geräts: gleiche SCCM-Daten, andere Person. */
  function geteiltesGeraet(r, quelle, nummer) {
    const z = Object.assign({}, quelle);
    const nach = waehle(r, NACHNAMEN);
    const vor = waehle(r, VORNAMEN);
    z.id = String(nummer);
    z.Title = "Shared " + quelle.Title;
    z.Arbeitsplatz = nach + " " + vor;
    z.Login = (nach + "." + vor).toLowerCase();
    z.Firma = waehle(r, FIRMEN);
    return z;
  }

  /* Person ohne eigenes Gerät. */
  function ohneGeraet(r, nummer) {
    const z = leereZeile();
    const nach = waehle(r, NACHNAMEN);
    const vor = waehle(r, VORNAMEN);
    z.id = String(nummer);
    z.Title = "Kein PC";
    z.Arbeitsplatz = nach + " " + vor;
    z.Login = (nach + "." + vor).toLowerCase();
    z.Firma = waehle(r, FIRMEN);
    z.Typ = "";
    z.SCCM_Found = "Nein";
    z.SCCM_SyncStatus = "Kein Gerät hinterlegt";
    for (const spalte of SOFTWARE_JA) {
      if (r() < 0.25) z[spalte] = true;
    }
    return z;
  }

  /* Die Grunddaten: immer dieselben, weil der Würfel einen festen Startwert
     hat. Was im Vorführmodus bearbeitet wird, liegt separat im Overlay. */
  function grunddaten() {
    const r = wuerfel(20260902);
    const alle = [];
    let nr = 1;
    for (let i = 1; i <= 50; i++) alle.push(geraet(r, nr++));
    for (let i = 0; i < 6; i++) {
      const quelle = alle[i * 7];
      if (quelle && quelle.SCCM_Found === "Ja") alle.push(geteiltesGeraet(r, quelle, nr++));
    }
    for (let i = 0; i < 5; i++) alle.push(ohneGeraet(r, nr++));
    return alle;
  }

  /* ---------- Overlay: Änderungen im Vorführmodus ----------

     Im Vorführmodus gibt es kein SharePoint. Damit Bearbeiten trotzdem
     etwas bewirkt und Hauptseite wie Detailfenster dasselbe sehen, landen
     Änderungen in localStorage. Struktur bewusst schlicht:

       { geaendert: { "5": { Firma: "Sport" } },
         neu: [ { id: "1001", Title: "…", … } ],
         geloescht: [ "7" ] }

     Mock.zuruecksetzen() räumt alles wieder weg. */

  const SCHLUESSEL = "computerinventar.mock.aenderungen";
  const LEER = { geaendert: {}, neu: [], geloescht: [] };

  // Ersatzspeicher, falls localStorage nicht zur Verfügung steht (privater
  // Modus, gesperrte Site-Daten). Dann gilt die Änderung nur für dieses Fenster.
  let ersatz = null;

  function overlayLesen() {
    if (ersatz) return ersatz;
    try {
      const roh = window.localStorage.getItem(SCHLUESSEL);
      if (!roh) return JSON.parse(JSON.stringify(LEER));
      const o = JSON.parse(roh);
      return {
        geaendert: (o && o.geaendert) || {},
        neu: (o && o.neu) || [],
        geloescht: (o && o.geloescht) || []
      };
    } catch (e) {
      return JSON.parse(JSON.stringify(LEER));
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

  /* Alle Zeilen mit angewandtem Overlay. */
  function zeilen() {
    const o = overlayLesen();
    const alle = grunddaten()
      .filter(z => o.geloescht.indexOf(String(z.id)) === -1)
      .map(function (z) {
        const aenderung = o.geaendert[String(z.id)];
        return aenderung ? Object.assign({}, z, aenderung) : z;
      });
    for (const n of o.neu) {
      if (o.geloescht.indexOf(String(n.id)) > -1) continue;
      const aenderung = o.geaendert[String(n.id)];
      alle.push(aenderung ? Object.assign({}, n, aenderung) : n);
    }
    return alle;
  }

  function zeile(id) {
    const gesucht = String(id);
    const treffer = zeilen().filter(z => String(z.id) === gesucht)[0];
    if (!treffer) {
      const fehler = new Error("Diese Zeile gibt es im Vorführmodus nicht (mehr).");
      fehler.status = 404;
      throw fehler;
    }
    return treffer;
  }

  function speichern(id, felder) {
    const o = overlayLesen();
    const schluessel = String(id);
    o.geaendert[schluessel] = Object.assign({}, o.geaendert[schluessel] || {}, felder);
    overlaySchreiben(o);
    return zeile(id);
  }

  function anlegen(felder) {
    const o = overlayLesen();
    let hoechste = 1000;
    for (const z of grunddaten()) hoechste = Math.max(hoechste, Number(z.id) || 0);
    for (const z of o.neu) hoechste = Math.max(hoechste, Number(z.id) || 0);
    const z = Object.assign(leereZeile(), felder);
    z.id = String(hoechste + 1);
    o.neu.push(z);
    overlaySchreiben(o);
    return z;
  }

  function loeschen(id) {
    const o = overlayLesen();
    const schluessel = String(id);
    if (o.geloescht.indexOf(schluessel) === -1) o.geloescht.push(schluessel);
    delete o.geaendert[schluessel];
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
    return Object.keys(o.geaendert).length + o.neu.length + o.geloescht.length;
  }

  return {
    zeilen: zeilen,
    zeile: zeile,
    speichern: speichern,
    anlegen: anlegen,
    loeschen: loeschen,
    zuruecksetzen: zuruecksetzen,
    anzahlAenderungen: anzahlAenderungen
  };
})();

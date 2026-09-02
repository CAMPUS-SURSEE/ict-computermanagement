/* konfig.js — zentrale Einstellungen für «Computer Inventar».

   Diese Datei enthält KEINE Geheimnisse. Mandanten- und Client-ID sind bei
   Single-Page-Applications öffentlich sichtbar; der Schutz kommt aus der
   Anmeldung an Entra ID und aus den SharePoint-Berechtigungen der
   angemeldeten Person.

   Seit dem Umbau auf zwei Listen gibt es «computerListId» und
   «benutzerListId». Beide werden von code/Migrate-ToTwoLists.ps1 mit
   -UpdateKonfig eingetragen. Solange der Platzhalter steht, zeigt das
   Frontend eine verständliche Meldung statt einer Fehlerkaskade. */

const KONFIG = {

  /* ---- Entra ID (Microsoft 365) ---- */
  // Mandant Campus Sursee
  mandantId: "2553fb74-5dcc-4072-8bb5-399d18f72af9",

  // Anwendungs-ID (Client-ID) der App-Registrierung «Computer Inventar».
  clientId: "58384569-7580-4617-ad5c-2bf5a81d397d",

  /* ---- SharePoint (Site «mgmts-ict-s») ---- */
  siteId: "campussursee.sharepoint.com,b2339cb3-8025-46c6-8fc1-2399e252377e,2ee595fd-6462-42fb-9591-c0dc589480b8",

  // Listen-IDs der beiden neuen Listen. Werden von der Migration gesetzt.
  computerListId: "7870205c-bfa6-4d18-8035-d16d0a082637",
  benutzerListId: "7db0cf44-7a2a-4937-b982-03236858b4b9",

  /* ---- programme.json in der Dokumentbibliothek der Site ----
     Graph: GET /sites/{siteId}/drive/root:/{programmeDateiPfad}:/content */
  programmeDateiPfad: "Inventar/programme.json",

  /* ---- Logo und Favicon ---- */
  logoUrl: "https://www.campus-sursee.ch/wp-content/themes/campus-sursee/assets/images/Campus_Sursee_Hauptlogo_RGB.svg"
};

/* Ist eine Listen-ID eingetragen, oder steht noch der Platzhalter?
   Das Frontend prüft das vor dem ersten Graph-Aufruf und zeigt sonst eine
   Meldung, die sagt, was zu tun ist. */
KONFIG.listeBereit = function (liste) {
  const id = liste === "benutzer" ? KONFIG.benutzerListId : KONFIG.computerListId;
  return !!id && id.indexOf("<") === -1;
};

/* Listen-ID nach Name («computer» | «benutzer»). */
KONFIG.listId = function (liste) {
  return liste === "benutzer" ? KONFIG.benutzerListId : KONFIG.computerListId;
};


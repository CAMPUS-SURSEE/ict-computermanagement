/* konfig.js — zentrale Einstellungen für «Computer Inventar».

   Diese Datei enthält KEINE Geheimnisse. Mandanten- und Client-ID sind bei
   Single-Page-Applications öffentlich sichtbar; der Schutz kommt aus der
   Anmeldung an Entra ID und aus den SharePoint-Berechtigungen der
   angemeldeten Person. Das Frontend liest nur, es schreibt nie. */

const KONFIG = {

  /* ---- Entra ID (Microsoft 365) ---- */
  // Mandant Campus Sursee
  mandantId: "2553fb74-5dcc-4072-8bb5-399d18f72af9",

  // Anwendungs-ID (Client-ID) der App-Registrierung «Computer Inventar».
  // Muss nach dem Anlegen der Registrierung hier eingetragen werden.
  // Solange der Platzhalter steht, zeigt die Seite eine Meldung statt einer
  // Anmeldeschleife.
  clientId: "HIER-CLIENT-ID-EINTRAGEN",

  /* ---- SharePoint (Site «mgmts-ict-s», Liste «Computer Inventar») ---- */
  siteId: "campussursee.sharepoint.com,b2339cb3-8025-46c6-8fc1-2399e252377e,2ee595fd-6462-42fb-9591-c0dc589480b8",
  listId: "70afe6a4-0d23-4582-80c7-0cd0776961f8",

  // Adresse der Liste in SharePoint, für die Links «In SharePoint öffnen».
  sharepointListUrl: "https://campussursee.sharepoint.com/sites/mgmts-ict-s/Lists/Computer%20Inventar/AllItems.aspx",

  /* ---- Logo und Favicon ---- */
  logoUrl: "https://www.campus-sursee.ch/wp-content/themes/campus-sursee/assets/images/Campus_Sursee_Hauptlogo_RGB.svg"
};

/* Adresse eines einzelnen Listenelements in SharePoint. */
KONFIG.sharepointElementUrl = function (id) {
  return KONFIG.sharepointListUrl.replace(/AllItems\.aspx.*$/, "DispForm.aspx")
    + "?ID=" + encodeURIComponent(id);
};

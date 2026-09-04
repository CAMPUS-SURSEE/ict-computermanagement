/* konfig.js — zentrale Einstellungen für «Computer Inventar».

   Diese Datei enthält KEINE Geheimnisse. Mandanten- und Client-ID sind bei
   Single-Page-Applications öffentlich sichtbar; der Schutz kommt aus der
   Anmeldung an Entra ID und aus den SharePoint-Berechtigungen der
   angemeldeten Person.

   Es gibt drei Listen: «computerListId», «benutzerListId» und
   «telefonListId». Alle stehen in den Listeneinstellungen in SharePoint.
   Solange ein Platzhalter steht, zeigt das Frontend eine verständliche
   Meldung statt einer Fehlerkaskade. */

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

  // Liste «Telefonnummern». Die ID steht in den Listeneinstellungen in SharePoint.
  telefonListId: "bd91b4ff-af5f-4457-8a37-13dad6ba6c39",

  /* Nummernblock des Hauses ohne Kurzwahl: aus der Kurzwahl 373 wird
     +41 41 926 23 73. Muss mit «TelefonPraefix» in Sync-Inventar.config.json
     übereinstimmen. */
  telefonPraefix: "+41 41 926 2",

  /* ---- programme.json in der Dokumentbibliothek der Site ----
     Graph: GET /sites/{siteId}/drive/root:/{programmeDateiPfad}:/content */
  programmeDateiPfad: "Inventar/programme.json",

  /* ---- Automatisches Nachladen ----
     Es gibt keinen Knopf «Neu laden» mehr. Stattdessen holen sich die Liste
     und die Detailfenster ihre Daten in diesem Abstand still selbst nach —
     aber nur, wenn das Fenster sichtbar ist und nichts Ungespeichertes offen
     steht. Wer sofort einen frischen Stand will, lädt die Seite neu. */
  autoTaktMs: 5 * 60 * 1000,

  /* Wie oft geprüft wird, ob der Takt abgelaufen ist. Kurz genug, damit ein
     Fenster nach der Rückkehr aus dem Hintergrund rasch aktuell ist; das
     Prüfen selbst löst keine Abfrage aus. */
  autoPruefTaktMs: 30 * 1000,

  /* ---- Logo und Favicon ---- */
  logoUrl: "https://www.campus-sursee.ch/wp-content/themes/campus-sursee/assets/images/Campus_Sursee_Hauptlogo_RGB.svg"
};

/* Ist eine Listen-ID eingetragen, oder steht noch der Platzhalter?
   Das Frontend prüft das vor dem ersten Graph-Aufruf und zeigt sonst eine
   Meldung, die sagt, was zu tun ist. */
KONFIG.listeBereit = function (liste) {
  const id = KONFIG.listId(liste);
  return !!id && id.indexOf("<") === -1;
};

/* Listen-ID nach Name («computer» | «benutzer» | «telefon»). */
KONFIG.listId = function (liste) {
  if (liste === "benutzer") return KONFIG.benutzerListId;
  if (liste === "telefon") return KONFIG.telefonListId;
  return KONFIG.computerListId;
};


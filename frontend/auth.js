/* auth.js — Anmeldung an Entra ID (Microsoft 365) für «Computer Inventar».

   Dünner Aufsatz auf MSAL, der offiziellen Anmeldebibliothek von Microsoft.
   MSAL wird per CDN eingebunden, siehe die Script-Zeile in index.html. Hier
   steht nur die Übersetzung in die vier Funktionen, welche die Seite braucht.
   Den OAuth-Ablauf selbst, das Zwischenspeichern der Token und die stille
   Erneuerung erledigt MSAL.

   Ablauf:
     1. Die Seite ruft Auth.anmeldungSicherstellen() auf.
     2. Keine Anmeldung vorhanden  ->  Weiterleitung an login.microsoftonline.com.
        Wer bereits an Microsoft 365 angemeldet ist, wird ohne Eingabe
        durchgereicht (Single Sign-on).
     3. MSAL kehrt danach von selbst auf die ursprüngliche Adresse zurück.
     4. Auth.token() liefert jederzeit ein gültiges Zugriffstoken.

   Die Berechtigung ist delegiert und umfasst Lesen und Schreiben
   (Sites.ReadWrite.All): das Detailfenster geraet.html pflegt die von Hand
   geführten Spalten der Liste. Mehr als die angemeldete Person in SharePoint
   selbst darf, kann das Token nie.

   Ablage: localStorage. Damit übernimmt das Detailfenster, das die Hauptseite
   mit window.open() öffnet, die bestehende Anmeldung, statt eine zweite
   Umleitung auszulösen. Abmelden räumt den Speicher auf. */

const Auth = (function () {

  const BEREICHE = [
    "https://graph.microsoft.com/Sites.ReadWrite.All",
    "https://graph.microsoft.com/User.Read"
  ];

  let anwendungPromise = null;
  let konto = null;

  /* Die Umleitungsadresse muss exakt so in der App-Registrierung stehen.
     Deshalb immer die Wurzel der Seite, ohne Dateiname, ohne
     Abfragezeichenfolge und ohne Rautezeichen: sonst müsste neben «/» auch
     «/geraet.html» eingetragen werden, und jede weitere Seite ebenso.
     navigateToLoginRequestUrl: true bringt MSAL nach der Anmeldung von selbst
     auf die ursprünglich gewünschte Adresse zurück, also auch auf
     geraet.html?id=… */
  function zielUrl() {
    return location.origin + "/";
  }

  async function anwendung() {
    if (anwendungPromise) return anwendungPromise;

    anwendungPromise = (async function () {
      if (typeof msal === "undefined") {
        throw new Error("Die Anmeldebibliothek konnte nicht geladen werden. "
          + "Bitte die Internetverbindung prüfen und die Seite neu laden.");
      }
      if (!KONFIG.clientId || KONFIG.clientId.indexOf("HIER-") === 0) {
        throw new Error("In konfig.js ist keine Client-ID eingetragen. "
          + "Bitte die App-Registrierung «Computer Inventar» in Entra ID anlegen "
          + "und die Anwendungs-ID dort eintragen. Zum Anschauen ohne Anmeldung "
          + "die Seite mit ?mock=1 aufrufen.");
      }
      const app = new msal.PublicClientApplication({
        auth: {
          clientId:    KONFIG.clientId,
          authority:   "https://login.microsoftonline.com/" + KONFIG.mandantId,
          redirectUri: zielUrl(),
          // Nach der Anmeldung zurück auf die ursprünglich gewünschte Adresse.
          navigateToLoginRequestUrl: true
        },
        cache: {
          // localStorage statt sessionStorage: nur so teilen Hauptseite und
          // das mit window.open() geöffnete Detailfenster dieselbe Anmeldung.
          cacheLocation: "localStorage",
          storeAuthStateInCookie: false
        }
      });
      await app.initialize();
      return app;
    })();

    return anwendungPromise;
  }

  function merken(msalKonto) {
    konto = msalKonto
      ? { name: msalKonto.name || "", adresse: msalKonto.username || "" }
      : null;
    return konto;
  }

  /* Stellt sicher, dass eine gültige Anmeldung vorliegt. Löst mit den
     Kontodaten auf, oder leitet weiter und löst nie auf. */
  async function anmeldungSicherstellen() {
    const app = await anwendung();

    // Wirft bei einer Fehlerantwort von Entra, etwa wenn die Person der
    // Unternehmensanwendung nicht zugewiesen ist.
    const antwort = await app.handleRedirectPromise();

    let gefunden = antwort ? antwort.account : null;
    if (!gefunden) gefunden = app.getActiveAccount() || app.getAllAccounts()[0] || null;

    if (!gefunden) {
      await app.loginRedirect({ scopes: BEREICHE });
      // Danach passiert auf dieser Seite nichts mehr.
      return new Promise(function () {});
    }

    app.setActiveAccount(gefunden);
    return merken(gefunden);
  }

  /* Liefert ein gültiges Zugriffstoken. MSAL erneuert es still, solange das
     möglich ist; sonst wird neu angemeldet. */
  async function token() {
    const app = await anwendung();
    const vorhanden = app.getActiveAccount() || app.getAllAccounts()[0];

    if (!vorhanden) {
      await app.loginRedirect({ scopes: BEREICHE });
      return new Promise(function () {});
    }
    try {
      const ergebnis = await app.acquireTokenSilent({ account: vorhanden, scopes: BEREICHE });
      return ergebnis.accessToken;
    } catch (e) {
      // Stille Erneuerung nicht möglich, etwa weil die Sitzung abgelaufen ist.
      await app.acquireTokenRedirect({ account: vorhanden, scopes: BEREICHE });
      return new Promise(function () {});
    }
  }

  function angemeldetesKonto() {
    return konto;
  }

  async function abmelden() {
    const app = await anwendung();
    await app.logoutRedirect({ postLogoutRedirectUri: zielUrl() });
  }

  return {
    anmeldungSicherstellen: anmeldungSicherstellen,
    token: token,
    konto: angemeldetesKonto,
    abmelden: abmelden,
    umleitungsadresse: zielUrl
  };
})();

/* auth.js – Anmeldung an Entra ID (Microsoft 365) für das ICT-Inventar.

   Dünner Aufsatz auf MSAL, der offiziellen Anmeldebibliothek von Microsoft.
   MSAL wird per CDN eingebunden, siehe die Script-Zeile in jeder der sieben
   Seiten (index, client, benutzer, telefon, software, kamera, kamerarolle;
   _headers erklärt die Prüfsumme). Hier steht nur die Übersetzung in die vier Funktionen, welche
   die Seiten brauchen.
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
   (Sites.ReadWrite.All): alle sechs Detailseiten (client, benutzer, telefon,
   software, kamera, kamerarolle) pflegen die von Hand geführten Spalten
   ihrer Liste. Mehr als die
   angemeldete Person in SharePoint selbst darf, kann das Token nie.

   Ablage: localStorage. Detailseiten öffnen im selben Tab, mit Ctrl- oder
   Mittelklick in einem neuen; beide übernehmen so die bestehende Anmeldung,
   statt eine zweite Umleitung auszulösen. Abmelden räumt den Speicher auf.

   Keine halbe Anmeldung: Lässt sich kein Token mehr holen, oder lehnt Graph
   ein Token mit 401 ab (Sitzung widerrufen, Passwort geändert, Richtlinie für
   bedingten Zugriff), verwirft neuAnmelden() das Konto im Speicher und zeigt
   die Anmeldeseite von Microsoft. Damit das nicht im Kreis läuft, falls Graph
   auch das frische Token ablehnt, geschieht es höchstens einmal in zwei
   Minuten pro Tab; danach erscheint der Fehler auf der Seite. */

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
     «/client.html» eingetragen werden, und jede weitere Seite ebenso.
     navigateToLoginRequestUrl: true bringt MSAL nach der Anmeldung von selbst
     auf die ursprünglich gewünschte Adresse zurück, also auch auf
     client.html?liste=admin&id=… */
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
        throw new Error("In konfig.js fehlt die Client-ID. Sie steht in Entra ID bei der "
          + "App-Registrierung «Computer Inventar Frontend». Bis dahin lässt sich die Seite "
          + "mit ?mock=1 im Vorführmodus anschauen.");
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
          // localStorage statt sessionStorage: nur so teilen alle Tabs (auch
          // ein per Ctrl-/Mittelklick geöffnetes Detailfenster) die Anmeldung.
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

  const NEUANMELDUNG_SCHLUESSEL = "inventar.neuanmeldung";
  const NEUANMELDUNG_SPERRE_MS = 2 * 60 * 1000;
  let neuAnmeldungLaeuft = null;

  function kuerzlichNeuAngemeldet() {
    try {
      const zeit = Number(sessionStorage.getItem(NEUANMELDUNG_SCHLUESSEL));
      return zeit > 0 && Date.now() - zeit < NEUANMELDUNG_SPERRE_MS;
    } catch (e) { return false; }
  }

  /* Verwirft die Anmeldung im Speicher (nur lokal, die Microsoft-Sitzung
     bleibt) und leitet auf die Anmeldeseite. Löst nie auf. «claims» ist die
     Forderung aus dem Kopf WWW-Authenticate einer 401-Antwort, falls Graph
     eine mitschickt; Entra stellt das neue Token dann passend dazu aus.
     Wirft, wenn schon vor weniger als zwei Minuten neu angemeldet wurde. */
  async function neuAnmelden(grund, claims) {
    if (neuAnmeldungLaeuft) return neuAnmeldungLaeuft;
    if (kuerzlichNeuAngemeldet()) {
      throw new Error("Microsoft Graph lehnt die Anmeldung auch nach einer neuen Anmeldung ab"
        + (grund ? " (" + grund + ")" : "") + ". Bitte abmelden und in ein paar Minuten "
        + "nochmals versuchen; bleibt es dabei, die ICT-Administration verständigen.");
    }
    neuAnmeldungLaeuft = (async function () {
      const app = await anwendung();
      try { sessionStorage.setItem(NEUANMELDUNG_SCHLUESSEL, String(Date.now())); } catch (e) { /* egal */ }
      const vorher = app.getActiveAccount() || app.getAllAccounts()[0] || null;
      try {
        await app.clearCache(vorher ? { account: vorher } : undefined);
      } catch (e) { /* weiter, die Anmeldeseite ersetzt das Konto ohnehin */ }
      app.setActiveAccount(null);
      merken(null);
      const anfrage = { scopes: BEREICHE, prompt: "select_account" };
      if (vorher && vorher.username) anfrage.loginHint = vorher.username;
      if (claims) anfrage.claims = claims;
      await app.loginRedirect(anfrage);
      // Danach passiert auf dieser Seite nichts mehr.
      return new Promise(function () {});
    })();
    return neuAnmeldungLaeuft;
  }

  /* Stellt sicher, dass eine gültige Anmeldung vorliegt. Löst mit den
     Kontodaten auf, oder leitet weiter und löst nie auf. Ein Konto im
     Speicher genügt nicht: erst wenn sich dazu ein Token holen lässt, gilt
     die Person als angemeldet. */
  async function anmeldungSicherstellen() {
    const app = await anwendung();

    let antwort = null;
    try {
      antwort = await app.handleRedirectPromise();
    } catch (e) {
      // Ein verdorbener Zwischenstand im Speicher (nicht abgeschlossene
      // Umleitung, Token-Cache) oder eine Forderung nach erneuter Anmeldung
      // wird mit einer neuen Anmeldung bereinigt. Alles andere gehört auf
      // die Seite: eine Fehlerantwort von Entra (AADSTS…, etwa wenn die
      // Person der Unternehmensanwendung nicht zugewiesen ist), ein
      // Netzwerkfehler, eine falsche Konfiguration.
      const bereinigbar = ["BrowserAuthError", "ClientAuthError", "CacheError",
        "InteractionRequiredAuthError"];
      if (!e || bereinigbar.indexOf(e.name) < 0) throw e;
      return neuAnmelden(e.errorCode || e.message);
    }

    let gefunden = antwort ? antwort.account : null;
    if (!gefunden) gefunden = app.getActiveAccount() || app.getAllAccounts()[0] || null;

    if (!gefunden) {
      await app.loginRedirect({ scopes: BEREICHE });
      // Danach passiert auf dieser Seite nichts mehr.
      return new Promise(function () {});
    }

    app.setActiveAccount(gefunden);
    await token();
    return merken(gefunden);
  }

  /* Liefert ein gültiges Zugriffstoken. MSAL erneuert es still, solange das
     möglich ist; sonst wird abgemeldet und neu angemeldet. */
  async function token() {
    const app = await anwendung();
    const vorhanden = app.getActiveAccount() || app.getAllAccounts()[0];

    if (!vorhanden) return neuAnmelden();
    try {
      const ergebnis = await app.acquireTokenSilent({ account: vorhanden, scopes: BEREICHE });
      return ergebnis.accessToken;
    } catch (e) {
      // Stille Erneuerung nicht möglich, etwa weil die Sitzung abgelaufen
      // oder widerrufen ist.
      return neuAnmelden(e && (e.errorCode || e.message));
    }
  }

  /* Graph hat ein Token mit 401 abgelehnt. Die Forderung «claims» aus dem
     Kopf WWW-Authenticate (bei widerrufenen Sitzungen) geht an Entra mit. */
  function abgelehnt(wwwAuthenticate) {
    let claims = null;
    const treffer = /claims="([^"]+)"/.exec(wwwAuthenticate || "");
    if (treffer) {
      try { claims = atob(treffer[1]); } catch (e) { claims = null; }
    }
    return neuAnmelden("HTTP 401", claims);
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
    abgelehnt: abgelehnt,
    konto: angemeldetesKonto,
    abmelden: abmelden,
    umleitungsadresse: zielUrl
  };
})();

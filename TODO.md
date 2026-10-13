# TODO

## Inhaberschaft auf die Listen-ID umstellen (Stand 13.10.2026)

Im Repository ist alles umgestellt: Die Benutzer-Liste verknüpft eine Person über `AdminClientId`
(Listen-ID der Zeile in «ADMIN-Clients») mit ihrem Gerät statt über den PC-Namen in `Computer`.
In SharePoint ist noch nichts passiert. Der Sync ist nicht betroffen und muss nicht neu auf den Server.

Schritte 1–3 zeitnah hintereinander: Bis Schritt 3 gelaufen ist, zeigt das neue Frontend bei den
Personen kein Gerät an.

- [ ] **1. Frontend veröffentlichen** – Push nach `main`, Cloudflare Pages baut selbst (README 7.4).
- [ ] **2. Trockenlauf** – liest, sichert nach `lokal\`, zählt, schreibt nichts. Im Log sollten nur
      «gesetzt» stehen, keine «ohne passendes Gerät» und keine «Konflikte» (Export vom 08.09.2026:
      134 Personen, alle eindeutig).
      ```powershell
      powershell -ExecutionPolicy Bypass -File .\code\Migriere-Inhaberschaft.ps1 -WhatIf
      ```
- [ ] **3. Umstellen** – legt die Spalte `AdminClientId` an und schreibt die IDs; `Computer` bleibt
      stehen. Mit einem Konto mit Vollzugriff auf die Site, nicht während eines laufenden Syncs
      (geplante Aufgabe alle 4 h).
      ```powershell
      powershell -ExecutionPolicy Bypass -File .\code\Migriere-Inhaberschaft.ps1
      ```
- [ ] **4. Im Frontend kontrollieren**
  - Benutzertabelle: Spalte «ADMIN-Client» ist gefüllt, kein «Gerät fehlt».
  - Auf einer Benutzerseite «Inhaberschaft aufheben» und speichern, dann in SharePoint prüfen, dass
    `AdminClientId` wirklich leer ist. Das Leeren der Zahlenspalte mit `null` ist nur im
    Vorführmodus getestet, nicht gegen das echte SharePoint. Danach das Gerät wieder zuweisen.
  - Auf einer Geräteseite einen Inhaber wechseln und den Verlauf beider Personen ansehen.
- [ ] **5. Alte Spalte löschen** – erst, wenn Schritt 4 stimmt. Das Skript prüft vorher, dass jede
      Person mit Namen die passende ID trägt, und bricht sonst ab.
      ```powershell
      powershell -ExecutionPolicy Bypass -File .\code\Migriere-Inhaberschaft.ps1 -AlteSpalteLoeschen
      ```
- [ ] **6. `Abgleich-Excel.ps1` stilllegen** – es schreibt noch die alte Spalte `Computer` und darf
      nach Schritt 5 nicht mehr laufen. Löschen oder auf `AdminClientId` umbauen.

## Zu entscheiden

- [ ] **SMBIOS-GUID als zweites Erkennungsmerkmal** für Geräte ohne brauchbare Seriennummer
      (Platzhalter wie «Default string», teils VMs). Heute ordnet der Sync sie nur über den Namen zu:
      Werden alter und neuer PC innerhalb eines Sync-Intervalls (4 h) getauscht, übernimmt der neue
      die Zeile des alten. Der Sync liest die GUID schon (`SCCM_SMBIOSGUID`). Die MAC-Adresse taugt
      nicht als Schlüssel: Dockingstationen und USB-Netzwerkadapter wandern zwischen Geräten.

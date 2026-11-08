# ❄️ Vriezer-voorraad

Een simpele, mobielvriendelijke web-app om samen bij te houden wat er in de vriezer ligt.

## Functies

- **Toevoegen**: product, aantal/gewicht + eenheid, categorie, plek (lade), datum in vriezer, THT en notitie.
- **THT-suggestie**: wordt automatisch ingevuld op basis van de categorie (bijv. gehakt 3 mnd, groente 9 mnd). Aanpasbaar per categorie in Instellingen.
- **Eruit halen**: deels of helemaal, met reden *opgemaakt* of *weggegooid*. Met "Ongedaan maken" als je mistikt.
- **Eerst op**: sortering op THT, kleurmarkering voor bijna/over datum, en een filter "wat moet eerst op".
- **Zoeken, filteren** op categorie en sorteren per lade.
- **Geschiedenis**: wie legde wat erin / haalde wat eruit, met knop om iets snel opnieuw toe te voegen.
- **Slim invullen**: bekende producten vullen categorie, eenheid en lade automatisch in.
- **Samen gebruiken**: via een deel-link zien jullie allebei direct dezelfde voorraad.
- **Installeerbaar** als app op het beginscherm (PWA) en werkt ook offline.
- **CSV-export**.

## Online zetten (GitHub Pages)

1. Ga op GitHub naar **Settings → Pages**.
2. Kies bij *Source*: **Deploy from a branch**, branch `main` (of deze branch), map `/ (root)`.
3. Na een minuut staat de app op `https://<gebruikersnaam>.github.io/Vriezer-voorraad/`.
4. Open die link op je telefoon → *Deel* → **Zet op beginscherm** (iPhone) of **App installeren** (Android).

Zonder verdere configuratie draait de app in **lokale modus**: alles werkt, maar de gegevens staan alleen op dat ene apparaat.

## Synchroniseren tussen twee telefoons (Firebase, gratis)

✅ Al ingesteld voor project `vriezer-voorraad`. De stappen hieronder zijn alleen nodig als je ooit een nieuw project wilt koppelen.

Eenmalig ± 10 minuten:

1. Ga naar <https://console.firebase.google.com> en maak een nieuw project (Google Analytics mag uit).
2. **Build → Authentication → Get started → Sign-in method** → zet **Anonymous** aan.
3. **Build → Firestore Database → Create database** → kies een locatie in Europa (bijv. `eur3`) → *production mode*.
4. Open in Firestore het tabblad **Rules**, vervang de inhoud door die van [`firestore.rules`](firestore.rules) en klik **Publish**.
5. **Project settings (tandwiel) → General → Your apps → Web (`</>`)** → registreer een app. Kopieer het `firebaseConfig`-object.
6. Plak dat object in [`config.js`](config.js) in plaats van `null` en commit/push.
7. Open de app, ga naar **Instellingen → Samen gebruiken → Deel link** en stuur die link naar je partner. Zodra die de link opent, delen jullie dezelfde vriezer.

### Hoe zit het met de beveiliging?

Iedere vriezer heeft een lange, willekeurige code (in de deel-link). De Firestore-regels staan alleen toegang toe als je die code kent. Houd de link dus privé. De waarden in `config.js` zijn geen geheim.

## Bestanden

| Bestand | Doel |
|---|---|
| `index.html` | Opbouw van de app |
| `styles.css` | Opmaak (licht/donker, mobiel eerst) |
| `app.js` | App-logica |
| `store.js` | Opslag: lokaal of Firebase |
| `vendor/firebase.js` | Meegebundelde Firebase SDK v10.12.2 (geen externe CDN nodig) |
| `config.js` | Firebase-instellingen (optioneel) |
| `firestore.rules` | Beveiligingsregels voor Firestore |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installeerbaar + offline |

Lokaal testen: `python3 -m http.server` en open <http://localhost:8000>.

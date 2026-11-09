# 🏠 Voorraad (vriezer, voorraadkast & koelkast)

Een simpele, mobielvriendelijke web-app om samen bij te houden wat er in huis ligt: in de vriezer, de voorraadkast en de koelkast.

## Functies

- **Drie locaties**: ❄️ Vriezer, 🥫 Voorraadkast en 🥛 Koelkast, met een schakelaar bovenin (of alles tegelijk).
- **Toevoegen**: product, aantal/gewicht + eenheid, categorie, plek (lade/plank), datum, THT, minimumvoorraad, winkel en notitie.
- **Snel − / +** op elk product. Snelle herhaalde tikken worden in de geschiedenis samengevoegd.
- **THT-suggestie** voor de vriezer op basis van de categorie (aanpasbaar in Instellingen). Voor kast/koelkast vul je de datum van de verpakking in.
- **Minimumvoorraad → boodschappenlijst**: zakt een product onder het minimum, dan staat het vanzelf op de lijst. Ook los iets op de lijst zetten kan.
- **Boodschappenlijst per winkel**, met ✓ *gekocht* (gaat direct terug in de voorraad), ✕ *niet nodig* (7 dagen van de lijst) en *lijst delen* (bijv. via WhatsApp).
- **Barcodescanner**: productnaam wordt opgezocht via Open Food Facts; een al bekend product herkent de app direct (− eruit / + erbij).
- **Eruit halen** (deels of alles), met reden *opgemaakt* of *weggegooid*, en overal *ongedaan maken*.
- **Eerst op**: sortering op THT, kleurmarkering voor bijna/over datum.
- **Geschiedenis**: wie wat erin legde, eruit haalde of kocht.
- **Samen gebruiken** via een privé deel-link; **installeerbaar** op het beginscherm en werkt offline.
- **Recepten**: jullie vaste recepten met ingrediënten. Typ ze of spreek ze in (*"200 gram kipfilet, 1 ui, 2 teentjes knoflook"*), de app herkent hoeveelheden en eenheden.
  - Per recept zie je wat er in huis is (✅), wat er tekort is (⚠️) en wat ontbreekt (❌), omgerekend naar het aantal personen.
  - **🛒 Op de lijst**: ontbrekende ingrediënten met één tik op de boodschappenlijst.
  - **📅 Op het menu**: plan recepten en zet in één keer alles voor het menu op de lijst.
  - **🍳 Gekookt**: boekt de gebruikte ingrediënten af uit de voorraad.
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
| `recipes.js` | Ingrediënten herkennen en vergelijken met de voorraad |
| `vendor/firebase.js` | Meegebundelde Firebase SDK v10.12.2 (geen externe CDN nodig) |
| `vendor/barcode.js`, `vendor/zxing_reader.wasm` | Barcode-lezer (barcode-detector 2.2.11 / zxing-wasm 1.2.14) voor telefoons zonder ingebouwde scanner, zoals iPhone |
| `config.js` | Firebase-instellingen (optioneel) |
| `firestore.rules` | Beveiligingsregels voor Firestore |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installeerbaar + offline |

Lokaal testen: `python3 -m http.server` en open <http://localhost:8000>.

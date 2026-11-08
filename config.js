// Firebase-configuratie voor synchronisatie tussen telefoons.
//
// Laat dit op `null` staan om de app alleen lokaal (op dit apparaat) te gebruiken.
// Om samen te synchroniseren: maak een gratis Firebase-project aan en plak
// hier de web-config (zie README.md, stap "Synchroniseren").
//
// Let op: deze waarden zijn geen geheim; ze identificeren alleen je project.
// De beveiliging zit in de Firestore-regels (firestore.rules) en de
// geheime huishoud-code in de deel-link.

export const firebaseConfig = null;

// Voorbeeld:
// export const firebaseConfig = {
//   apiKey: "AIza...",
//   authDomain: "mijn-vriezer.firebaseapp.com",
//   projectId: "mijn-vriezer",
//   storageBucket: "mijn-vriezer.appspot.com",
//   messagingSenderId: "1234567890",
//   appId: "1:1234567890:web:abcdef123456",
// };

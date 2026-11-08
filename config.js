// Firebase-configuratie voor synchronisatie tussen telefoons.
//
// Laat dit op `null` staan om de app alleen lokaal (op dit apparaat) te gebruiken.
// Om samen te synchroniseren: maak een gratis Firebase-project aan en plak
// hier de web-config (zie README.md, stap "Synchroniseren").
//
// Let op: deze waarden zijn geen geheim; ze identificeren alleen je project.
// De beveiliging zit in de Firestore-regels (firestore.rules) en de
// geheime huishoud-code in de deel-link.

export const firebaseConfig = {
  apiKey: "AIzaSyC9sPurlUgHuC-pf4ZRxmlC7Nql3TF98lc",
  authDomain: "vriezer-voorraad.firebaseapp.com",
  projectId: "vriezer-voorraad",
  storageBucket: "vriezer-voorraad.firebasestorage.app",
  messagingSenderId: "763248093696",
  appId: "1:763248093696:web:1aac6863315994721646e5",
};

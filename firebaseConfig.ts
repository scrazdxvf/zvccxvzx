// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyD6Q-a21OKorFz8tKJgpVkx9L8DTqKSfHQ",
  authDomain: "skrbarackholka.firebaseapp.com",
  projectId: "skrbarackholka",
  storageBucket: "skrbarackholka.firebasestorage.app",
  messagingSenderId: "294946515979",
  appId: "1:294946515979:web:86769e1ff8cf2880beab0e",
  measurementId: "G-PH7NWS64C9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
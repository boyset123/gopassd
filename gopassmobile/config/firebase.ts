// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyC2no7quf15FAA02MxwaTF8H14awKD7Jcs",
  authDomain: "gopassdorsu1.firebaseapp.com",
  projectId: "gopassdorsu1",
  storageBucket: "gopassdorsu1.appspot.com",
  messagingSenderId: "653981431918",
  appId: "1:653981431918:web:c57993d1904a76fc6a8e7f",
  measurementId: "G-7T70VFP7PE"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

export default app;

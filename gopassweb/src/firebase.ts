import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyC2no7quf15FAA02MxwaTF8H14awKD7Jcs",
  authDomain: "gopassdorsu1.firebaseapp.com",
  projectId: "gopassdorsu1",
  storageBucket: "gopassdorsu1.firebasestorage.app",
  messagingSenderId: "653981431918",
  appId: "1:653981431918:web:c57993d1904a76fc6a8e7f",
  measurementId: "G-7T70VFP7PE"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

export { auth };

import { initializeApp } from 'firebase/app'
import { getDatabase, ref, set, get, onValue, update, remove, push } from 'firebase/database'

const firebaseConfig = {
  apiKey: "AIzaSyA0KeVOgtWHb48ByACOLnE4WOa8wLs3_D4",
  authDomain: "biteam-yutnori.firebaseapp.com",
  databaseURL: "https://biteam-yutnori-default-rtdb.firebaseio.com",
  projectId: "biteam-yutnori",
  storageBucket: "biteam-yutnori.firebasestorage.app",
  messagingSenderId: "125873831578",
  appId: "1:125873831578:web:5dd3a9fc19729ff1466923",
  measurementId: "G-SSDCEB2TPX"
}

const app = initializeApp(firebaseConfig)
const db = getDatabase(app)

export { db, ref, set, get, onValue, update, remove, push }

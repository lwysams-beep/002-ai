// 1. 引入必要的工具
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// 2. 這裡貼上你剛剛在 Firebase 網頁複製的內容 (取代下方範例)
// --- 請從這裡開始取代 ---
const firebaseConfig = {
  apiKey: "AIzaSyCaKP9-4hiL99G9NZZr6eir7tJFqPzm_xo",
  authDomain: "school-sub-system.firebaseapp.com",
  projectId: "school-sub-system",
  storageBucket: "school-sub-system.firebasestorage.app",
  messagingSenderId: "884739374056",
  appId: "1:884739374056:web:d58442209e09a9bde5c25d",
  measurementId: "G-D97PZDCLZ8"
};
// --- 取代到這裡結束 ---

// 3. 啟動 Firebase
const app = initializeApp(firebaseConfig);

// 4. 匯出資料庫功能 (讓 App.jsx 可以使用)
export const db = getFirestore(app);
// Firebase 초기화 — Auth + Firestore
// ⚠ 아래 firebaseConfig 를 본인 Firebase 콘솔 값으로 교체하세요.
//    콘솔 → 프로젝트 설정(⚙) → 일반 → 내 앱(웹) → SDK 설정 및 구성 → "구성" 의 객체를 복붙.
//    config를 안 넣으면(REPLACE_ME) 로그인 없이 기존처럼 로컬 모드로 동작합니다.
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyDcrRd-YIi-VKn4zFx7Ya4hmN171EYpyfI',
  authDomain: 'nexushmi.firebaseapp.com',
  projectId: 'nexushmi',
  storageBucket: 'nexushmi.firebasestorage.app',
  messagingSenderId: '895729864016',
  appId: '1:895729864016:web:527df164ec8c489a66f055',
}

export const firebaseEnabled = firebaseConfig.apiKey !== 'REPLACE_ME'

let auth = null, db = null
if (firebaseEnabled) {
  const app = initializeApp(firebaseConfig)
  auth = getAuth(app)
  db = getFirestore(app)
}
export { auth, db }
export const googleProvider = new GoogleAuthProvider()

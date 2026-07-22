// 인증 상태 훅 + 로그인/로그아웃 헬퍼 (Firebase Auth)
import { useState, useEffect } from 'react'
import { auth, googleProvider, firebaseEnabled } from '../firebase'
import {
  onAuthStateChanged, signInWithPopup,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
} from 'firebase/auth'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(firebaseEnabled)
  useEffect(() => {
    if (!firebaseEnabled) { setLoading(false); return }
    return onAuthStateChanged(auth, u => { setUser(u); setLoading(false) })
  }, [])
  return { user, loading }
}

export const signInGoogle = () => signInWithPopup(auth, googleProvider)
export const signInEmail = (email, pw) => signInWithEmailAndPassword(auth, email, pw)
export const signUpEmail = (email, pw) => createUserWithEmailAndPassword(auth, email, pw)
export const doSignOut = () => signOut(auth)

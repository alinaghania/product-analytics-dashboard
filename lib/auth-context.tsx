"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged as authStateChanged,
  type User as FirebaseUser,
} from "firebase/auth"
import { getFirebaseAuth } from "./firebase"

interface AuthContextType {
  user: FirebaseUser | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const auth = getFirebaseAuth()
    const unsubscribe = authStateChanged(auth, (user) => {
      setUser(user)
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  const handleSignIn = async (email: string, password: string) => {
    const auth = getFirebaseAuth()
    await signInWithEmailAndPassword(auth, email, password)
  }

  const handleSignOut = async () => {
    const auth = getFirebaseAuth()
    await firebaseSignOut(auth)
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn: handleSignIn, signOut: handleSignOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

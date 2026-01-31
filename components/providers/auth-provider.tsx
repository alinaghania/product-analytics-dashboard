"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import {
  isFirebaseConfigured,
  getMissingConfig,
  signInWithGoogle,
  signOut,
  onAuthChange,
  isAdmin,
  getFirebaseApp,
  type User,
} from "@/lib/firebase"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Chrome } from "lucide-react"

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  isAdminUser: boolean
  signIn: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function ConfigScreen() {
  const missing = getMissingConfig()
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            <CardTitle className="text-lg">Firebase Configuration</CardTitle>
          </div>
          <CardDescription>Add your Firebase credentials to use the dashboard.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md bg-muted p-4">
            <p className="mb-2 text-sm font-medium">Required variables:</p>
            <div className="space-y-1 font-mono text-xs">
              {missing.map((v) => (
                <p key={v} className="text-destructive">
                  {v}
                </p>
              ))}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Add these in the <strong>Vars</strong> section of the sidebar, then refresh.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function LoginScreen({ onSignIn, error }: { onSignIn: () => void; error: string | null }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Endora Analytics</CardTitle>
          <CardDescription>Sign in with your admin Google account to access the dashboard</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={onSignIn} className="w-full" size="lg">
            <Chrome className="mr-2 h-5 w-5" />
            Sign in with Google
          </Button>
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <p className="font-medium">Authentication Error</p>
              <p className="mt-1 text-xs">{error}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Make sure you've added <code className="text-xs">*.vusercontent.net</code> to Firebase Console →
                Authentication → Authorized domains
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function AccessDeniedScreen({ user, onLogout }: { user: User; onLogout: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            <CardTitle className="text-lg">Access Denied</CardTitle>
          </div>
          <CardDescription>Your account does not have admin access to this dashboard.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md bg-muted p-4">
            <p className="mb-2 text-sm font-medium">Your account:</p>
            <p className="text-xs font-mono text-muted-foreground">{user.email}</p>
            <p className="mt-2 text-xs font-mono text-muted-foreground">UID: {user.uid}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Add your UID to the <code className="text-xs">ADMIN_UIDS</code> array in{" "}
            <code className="text-xs">lib/firebase.ts</code> and to your Firestore Rules admin function.
          </p>
          <Button onClick={onLogout} variant="outline" className="w-full bg-transparent">
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAdminUser, setIsAdminUser] = useState(false)

  const firebaseConfigured = isFirebaseConfigured()

  useEffect(() => {
    if (!firebaseConfigured) {
      setIsLoading(false)
      return
    }

    console.log("[v0] Setting up auth state listener")
    const unsubscribe = onAuthChange((user) => {
      console.log("[v0] Auth state changed:", user?.email || "No user")
      if (user) {
        console.log("[v0] User UID:", user.uid)
        console.log("[v0] User email:", user.email)
        console.log("[v0] Firebase project:", getFirebaseApp().options.projectId || "unknown")
        ;(async () => {
          try {
            const tokenResult = await user.getIdTokenResult(true)
            console.log("[v0] ID token claims:", tokenResult.claims)
            console.log("[v0] admin claim:", tokenResult.claims?.admin === true)
          } catch (err: any) {
            console.warn("[v0] Failed to read token claims:", err?.message || err)
          }
        })()
        const adminStatus = isAdmin(user)
        console.log("[v0] Admin status:", adminStatus)
        setIsAdminUser(adminStatus)
      } else {
        setIsAdminUser(false)
      }
      setUser(user)
      setIsLoading(false)
    })

    return () => unsubscribe()
  }, [firebaseConfigured])

  const handleSignIn = async () => {
    setError(null)
    setIsLoading(true)
    try {
      console.log("[v0] Attempting Google Sign In with popup...")
      await signInWithGoogle()
      // Success will be handled by onAuthChange
    } catch (err: any) {
      console.error("[v0] Sign in error:", err.message)
      setError(err.message || "Failed to sign in")
      setIsLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      await signOut()
      setUser(null)
      setError(null)
    } catch (err: any) {
      console.error("[v0] Logout error:", err)
    }
  }

  if (!firebaseConfigured) {
    return <ConfigScreen />
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <LoginScreen onSignIn={handleSignIn} error={error} />
  }

  if (!isAdminUser) {
    return <AccessDeniedScreen user={user} onLogout={handleLogout} />
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading: false,
        isAuthenticated: true,
        isAdminUser: isAdminUser, // Already verified above
        signIn: handleSignIn,
        logout: handleLogout,
      }}
    >
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

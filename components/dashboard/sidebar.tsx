"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { getFirebaseAuth } from "@/lib/firebase"
import { LayoutDashboard, Users, TrendingUp } from "lucide-react"
import { useAuth } from "@/components/providers/auth-provider"

const navItems = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/users", label: "Users", icon: Users },
]

export function Sidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuth()

  const handleDebugClaims = async () => {
    try {
      const auth = getFirebaseAuth()
      const current = auth.currentUser
      if (!current) {
        console.log("[v0] debug claims: not logged")
        return
      }
      const result = await current.getIdTokenResult(true)
      console.log("[v0] debug claims:", result.claims)
    } catch (err) {
      console.warn("[v0] debug claims failed:", err)
    }
  }

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-border bg-sidebar">
      <div className="flex h-full flex-col">
        <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <TrendingUp className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-lg font-semibold text-sidebar-foreground">Endora Analytics</span>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {user && (
          <div className="border-t border-sidebar-border p-4">
            <div className="mb-3 rounded-lg bg-sidebar-accent p-3">
              <p className="text-xs font-medium text-sidebar-foreground">Signed in as</p>
              <p className="mt-1 truncate text-sm text-sidebar-foreground/80">{user.email}</p>
            </div>
            <button
              onClick={logout}
              className="w-full rounded-lg bg-sidebar-accent px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
            >
              Sign out
            </button>
            <button
              onClick={handleDebugClaims}
              className="mt-2 w-full rounded-lg bg-transparent px-3 py-2 text-xs font-medium text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              Debug token claims
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}

"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { LogOut, User as UserIcon, Menu, X, BookOpen } from "lucide-react"

import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { useEffect, useState } from "react"
import { ModeToggle } from "@/components/mode-toggle"
import { cn } from "@/lib/utils"

const navItems = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/import", label: "Import Deck" },
    { href: "/dictionary", label: "Tra Cứu" },
    { href: "/cognates", label: "Từ Đồng Âm" },
    { href: "/reader", label: "Reader" },
]

export function Header() {
    const router = useRouter()
    const pathname = usePathname()
    const supabase = createClient()
    const [user, setUser] = useState<any>(null)
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    useEffect(() => {
        const getUser = async () => {
            try {
                const { data, error } = await supabase.auth.getUser()
                if (error) {
                    console.error("Header Auth Error:", error)
                    setUser(null)
                } else {
                    setUser(data?.user || null)
                }
            } catch (err) {
                console.error("Header Auth Exception:", err)
                setUser(null)
            }
        }
        getUser()

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, session) => {
                setUser(session?.user ?? null)
            }
        )

        return () => subscription.unsubscribe()
    }, [])

    // Close mobile menu on route change
    useEffect(() => {
        setMobileMenuOpen(false)
    }, [pathname])

    const handleSignOut = async () => {
        await supabase.auth.signOut()
        router.push("/")
        router.refresh()
    }

    const isActive = (href: string) => {
        if (href === "/dashboard") return pathname === "/dashboard" || pathname.startsWith("/study")
        return pathname === href || pathname.startsWith(href + "/")
    }

    return (
        <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container mx-auto flex h-14 items-center justify-between px-4">
                {/* Left: Logo + Nav (desktop) */}
                <div className="flex items-center gap-4">
                    <Link href="/" className="flex items-center space-x-2 shrink-0">
                        <BookOpen className="h-5 w-5 text-primary" />
                        <span className="font-bold">Anki Chinese</span>
                    </Link>

                    {/* Desktop nav */}
                    {user && (
                        <nav className="hidden md:flex items-center space-x-1 text-sm font-medium">
                            {navItems.map((item) => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={cn(
                                        "px-3 py-1.5 rounded-md transition-colors",
                                        isActive(item.href)
                                            ? "bg-primary/10 text-primary font-semibold"
                                            : "text-foreground/60 hover:text-foreground hover:bg-muted"
                                    )}
                                >
                                    {item.label}
                                </Link>
                            ))}
                        </nav>
                    )}
                </div>

                {/* Right: User actions + theme toggle */}
                <div className="flex items-center gap-2">
                    {user ? (
                        <>
                            {/* Email - hidden on small screens */}
                            <div className="hidden lg:flex items-center text-sm font-medium text-muted-foreground mr-2">
                                <UserIcon className="mr-1.5 h-4 w-4 shrink-0" />
                                <span className="max-w-[180px] truncate">{user.email}</span>
                            </div>
                            <Button variant="outline" size="sm" onClick={handleSignOut} className="hidden sm:flex">
                                <LogOut className="mr-2 h-4 w-4" />
                                Đăng xuất
                            </Button>
                            {/* Icon-only sign out on very small screens */}
                            <Button variant="ghost" size="icon" onClick={handleSignOut} className="sm:hidden h-8 w-8">
                                <LogOut className="h-4 w-4" />
                            </Button>
                        </>
                    ) : (
                        <>
                            <Link href="/login">
                                <Button variant="ghost" size="sm">Đăng nhập</Button>
                            </Link>
                            <Link href="/register">
                                <Button size="sm">Đăng ký</Button>
                            </Link>
                        </>
                    )}

                    <ModeToggle />

                    {/* Mobile hamburger - only for authed users */}
                    {user && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="md:hidden h-8 w-8 ml-1"
                            onClick={() => setMobileMenuOpen((v) => !v)}
                            aria-label="Toggle menu"
                        >
                            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                        </Button>
                    )}
                </div>
            </div>

            {/* Mobile dropdown menu */}
            {user && mobileMenuOpen && (
                <div className="md:hidden border-t bg-background/98 backdrop-blur px-4 py-3 space-y-1">
                    {navItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                                isActive(item.href)
                                    ? "bg-primary/10 text-primary font-semibold"
                                    : "text-foreground/70 hover:text-foreground hover:bg-muted"
                            )}
                        >
                            {item.label}
                        </Link>
                    ))}
                    {/* Email in mobile menu */}
                    <div className="flex items-center px-3 pt-2 pb-1 text-sm text-muted-foreground border-t mt-2">
                        <UserIcon className="mr-2 h-4 w-4 shrink-0" />
                        <span className="truncate">{user.email}</span>
                    </div>
                </div>
            )}
        </header>
    )
}

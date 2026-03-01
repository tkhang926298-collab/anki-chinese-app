"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { LogOut, User } from "lucide-react"

import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { useEffect, useState } from "react"
import { ModeToggle } from "@/components/mode-toggle"

export function Header() {
    const router = useRouter()
    const supabase = createClient()
    const [user, setUser] = useState<any>(null)

    useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            setUser(user)
        }
        getUser()

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, session) => {
                setUser(session?.user ?? null)
            }
        )

        return () => subscription.unsubscribe()
    }, [])

    const handleSignOut = async () => {
        await supabase.auth.signOut()
        router.push("/")
        router.refresh()
    }

    return (
        <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container mx-auto flex h-14 items-center justify-between px-4">
                <div className="flex items-center gap-4">
                    <Link href="/" className="flex items-center space-x-2">
                        <span className="font-bold sm:inline-block">
                            Anki Chinese
                        </span>
                    </Link>
                    {user && (
                        <nav className="flex items-center space-x-6 text-sm font-medium">
                            <Link
                                href="/dashboard"
                                className="transition-colors hover:text-foreground/80 text-foreground"
                            >
                                Dashboard
                            </Link>
                            <Link
                                href="/import"
                                className="transition-colors hover:text-foreground/80 text-foreground/60"
                            >
                                Import Deck
                            </Link>
                            <Link
                                href="/dictionary"
                                className="transition-colors hover:text-foreground/80 text-foreground/60"
                            >
                                Tra Cứu
                            </Link>
                            <Link
                                href="/cognates"
                                className="transition-colors hover:text-foreground/80 text-foreground/60"
                            >
                                Từ Đồng Âm
                            </Link>
                        </nav>
                    )}
                </div>

                <div className="flex flex-1 items-center justify-end space-x-4">
                    <nav className="flex items-center space-x-2">
                        {user ? (
                            <>
                                <div className="flex items-center text-sm font-medium text-muted-foreground mr-4">
                                    <User className="mr-2 h-4 w-4" />
                                    {user.email}
                                </div>
                                <Button variant="outline" size="sm" onClick={handleSignOut}>
                                    <LogOut className="mr-2 h-4 w-4" />
                                    Đăng xuất
                                </Button>
                            </>
                        ) : (
                            <>
                                <Link href="/login">
                                    <Button variant="ghost" size="sm">
                                        Đăng nhập
                                    </Button>
                                </Link>
                                <Link href="/register">
                                    <Button size="sm">Đăng ký</Button>
                                </Link>
                            </>
                        )}
                        <ModeToggle />
                    </nav>
                </div>
            </div>
        </header>
    )
}

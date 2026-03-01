"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"

const loginSchema = z.object({
    email: z.string().email({
        message: "Email không hợp lệ.",
    }),
    password: z.string().min(6, {
        message: "Mật khẩu phải có ít nhất 6 ký tự.",
    }),
})

export function LoginForm() {
    const router = useRouter()
    const [isLoading, setIsLoading] = React.useState<boolean>(false)
    const supabase = createClient()

    const form = useForm<z.infer<typeof loginSchema>>({
        resolver: zodResolver(loginSchema),
        defaultValues: {
            email: "",
            password: "",
        },
    })

    async function onSubmit(data: z.infer<typeof loginSchema>) {
        setIsLoading(true)

        const { data: authData, error } = await supabase.auth.signInWithPassword({
            email: data.email,
            password: data.password,
        })

        if (error) {
            setIsLoading(false)
            return toast.error("Đăng nhập thất bại", {
                description: error.message,
            })
        }

        // Kiểm tra quyền Admin
        const user = authData.user;
        if (user) {
            const createdAt = new Date(user.created_at).getTime();
            const cutoffDate = new Date('2026-03-02T00:00:00').getTime();

            // Nếu tài khoản tạo MỚI SAU mốc thời gian này thì bắt buộc phải có `is_approved = true`
            if (createdAt > cutoffDate) {
                const isApproved = user.user_metadata?.is_approved === true;

                if (!isApproved) {
                    await supabase.auth.signOut();
                    setIsLoading(false)
                    return toast.error("Đăng nhập bị từ chối", {
                        description: "Tài khoản của bạn chưa được Admin phê duyệt. Vui lòng liên hệ Admin.",
                    })
                }
            }
        }

        setIsLoading(false)

        toast.success("Đăng nhập thành công!", {
            description: "Đang chuyển hướng đến Dashboard...",
        })

        router.push("/dashboard")
        router.refresh()
    }

    return (
        <div className="grid gap-6">
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Email</FormLabel>
                                <FormControl>
                                    <Input placeholder="name@example.com" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="password"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Mật khẩu</FormLabel>
                                <FormControl>
                                    <Input type="password" placeholder="••••••••" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <Button type="submit" className="w-full" disabled={isLoading}>
                        {isLoading && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Đăng nhập
                    </Button>
                </form>
            </Form>
        </div>
    )
}

import os
import customtkinter as ctk
from tkinter import messagebox, filedialog
from supabase import create_client, Client
from gotrue.errors import AuthApiError
import datetime
from dotenv import load_dotenv

# Tìm thư mục gốc (.env.local) - Thích ứng nếu chạy từ admin_tool/
env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env.local')
load_dotenv(env_path)

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("WARNING: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")

# Supabase Admin Client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None

class AdminApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("Anki Chinese - Admin Tool")
        self.geometry("900x600")
        
        # Grid Layout
        self.grid_columnconfigure(0, weight=1)
        self.grid_columnconfigure(1, weight=3)
        self.grid_rowconfigure(0, weight=1)
        
        # ---- Menu Trái: Nút bấm ----
        self.sidebar_frame = ctk.CTkFrame(self, width=200, corner_radius=0)
        self.sidebar_frame.grid(row=0, column=0, sticky="nsew")
        self.sidebar_frame.grid_rowconfigure(5, weight=1)
        
        self.logo_label = ctk.CTkLabel(self.sidebar_frame, text="Admin Control", font=ctk.CTkFont(size=20, weight="bold"))
        self.logo_label.grid(row=0, column=0, padx=20, pady=(20, 10))
        
        self.btn_refresh = ctk.CTkButton(self.sidebar_frame, text="Tải Danh Sách User", command=self.load_users)
        self.btn_refresh.grid(row=1, column=0, padx=20, pady=10)
        
        self.btn_create = ctk.CTkButton(self.sidebar_frame, text="Tạo Mới & Cấp Phép", command=self.open_create_dialog)
        self.btn_create.grid(row=2, column=0, padx=20, pady=10)

        self.btn_import = ctk.CTkButton(self.sidebar_frame, text="Import từ File TXT", command=self.import_from_txt)
        self.btn_import.grid(row=3, column=0, padx=20, pady=10)
        
        self.appearance_mode_label = ctk.CTkLabel(self.sidebar_frame, text="Giao diện:", anchor="w")
        self.appearance_mode_label.grid(row=6, column=0, padx=20, pady=(10, 0))
        self.appearance_mode_optionemenu = ctk.CTkOptionMenu(self.sidebar_frame, values=["System", "Dark", "Light"], command=self.change_appearance_mode_event)
        self.appearance_mode_optionemenu.grid(row=7, column=0, padx=20, pady=(10, 20))
        
        # ---- Vùng Phải: Danh sách Users ----
        self.main_frame = ctk.CTkFrame(self, corner_radius=10)
        self.main_frame.grid(row=0, column=1, sticky="nsew", padx=20, pady=20)
        self.main_frame.grid_rowconfigure(1, weight=1)
        self.main_frame.grid_columnconfigure(0, weight=1)
        
        self.list_title = ctk.CTkLabel(self.main_frame, text="Danh sách Tài Khoản", font=ctk.CTkFont(size=18, weight="bold"))
        self.list_title.grid(row=0, column=0, padx=20, pady=10, sticky="w")
        
        self.scrollable_frame = ctk.CTkScrollableFrame(self.main_frame, label_text="Tài khoản cần chú ý / Mới đăng ký")
        self.scrollable_frame.grid(row=1, column=0, padx=10, pady=10, sticky="nsew")
        self.scrollable_frame.grid_columnconfigure(0, weight=3) # Email
        self.scrollable_frame.grid_columnconfigure(1, weight=2) # Date
        self.scrollable_frame.grid_columnconfigure(2, weight=1) # Status
        self.scrollable_frame.grid_columnconfigure(3, weight=1) # Action
        
        self.user_rows = []
        
        if not supabase:
            messagebox.showerror("Lỗi", "Không tìm thấy SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY. Hãy kiểm tra biến môi trường.")
        else:
            self.load_users()

    def change_appearance_mode_event(self, new_appearance_mode: str):
        ctk.set_appearance_mode(new_appearance_mode)

    def load_users(self):
        if not supabase: return
        
        # Xóa các dòng cũ
        for widget in self.scrollable_frame.winfo_children():
            widget.destroy()
        self.user_rows = []
        
        try:
            # Service role call:
            response = supabase.auth.admin.list_users()
            users = response.users if hasattr(response, 'users') else response
            
            # Tiêu đề cột
            ctk.CTkLabel(self.scrollable_frame, text="Email", font=ctk.CTkFont(weight="bold")).grid(row=0, column=0, padx=5, pady=5, sticky="w")
            ctk.CTkLabel(self.scrollable_frame, text="Ngày tạo", font=ctk.CTkFont(weight="bold")).grid(row=0, column=1, padx=5, pady=5, sticky="w")
            ctk.CTkLabel(self.scrollable_frame, text="Trạng thái", font=ctk.CTkFont(weight="bold")).grid(row=0, column=2, padx=5, pady=5)
            ctk.CTkLabel(self.scrollable_frame, text="Hành động", font=ctk.CTkFont(weight="bold")).grid(row=0, column=3, padx=5, pady=5)
            
            # Build rows
            for i, user in enumerate(users):
                row_idx = i + 1
                email = user.email
                created_at = user.created_at
                try:
                    dt = datetime.datetime.fromisoformat(created_at.replace("Z", "+00:00")).strftime("%Y-%m-%d %H:%M:%S")
                except:
                    dt = created_at
                
                is_approved = user.user_metadata.get('is_approved', False) if user.user_metadata else False
                
                status_text = "Đã duyệt" if is_approved else "Chờ duyệt"
                status_color = "green" if is_approved else "orange"
                
                ctk.CTkLabel(self.scrollable_frame, text=email).grid(row=row_idx, column=0, padx=5, pady=5, sticky="w")
                ctk.CTkLabel(self.scrollable_frame, text=dt).grid(row=row_idx, column=1, padx=5, pady=5, sticky="w")
                ctk.CTkLabel(self.scrollable_frame, text=status_text, text_color=status_color).grid(row=row_idx, column=2, padx=5, pady=5)
                
                if not is_approved:
                    btn = ctk.CTkButton(self.scrollable_frame, text="Phê Duyệt", width=80, fg_color="green", hover_color="darkgreen",
                                        command=lambda uid=user.id: self.approve_user(uid))
                    btn.grid(row=row_idx, column=3, padx=5, pady=5)
                else:
                    ctk.CTkLabel(self.scrollable_frame, text="-").grid(row=row_idx, column=3, padx=5, pady=5)
                    
        except Exception as e:
            messagebox.showerror("Lỗi khi tải", str(e))

    def approve_user(self, user_id):
        try:
            supabase.auth.admin.update_user_by_id(
                user_id,
                {"user_metadata": {"is_approved": True}}
            )
            messagebox.showinfo("Thành công", f"Đã cấp phép truy cập cho tài khoản!")
            self.load_users()
        except Exception as e:
            messagebox.showerror("Lỗi", str(e))

    def create_approved_user(self, email, password):
        try:
            # 1. Tạo User (Auth Admin tạo thẳng không cần confirm email luôn cũng được vì qua admin)
            # Ở đây ta sẽ đặt email_confirm=True
            response = supabase.auth.admin.create_user({
                "email": email,
                "password": password,
                "email_confirm": True,
                "user_metadata": {"is_approved": True}
            })
            return True, "Thành công"
        except AuthApiError as e:
            if "already registered" in str(e).lower():
                return False, f"Email {email} đã tồn tại."
            return False, str(e)
        except Exception as e:
            return False, str(e)

    def open_create_dialog(self):
        dialog = ctk.CTkToplevel(self)
        dialog.title("Tạo tài khoản mới")
        dialog.geometry("400x300")
        dialog.transient(self) # Bám theo cửa sổ cha
        dialog.grab_set()
        
        ctk.CTkLabel(dialog, text="Tạo Nhanh Tài Khoản (Đã Phê Duyệt)", font=ctk.CTkFont(weight="bold")).pack(pady=10)
        
        email_entry = ctk.CTkEntry(dialog, placeholder_text="Email", width=250)
        email_entry.pack(pady=10)
        
        pass_entry = ctk.CTkEntry(dialog, placeholder_text="Mật khẩu", show="*", width=250)
        pass_entry.pack(pady=10)
        
        def handle_create():
            email = email_entry.get().strip()
            password = pass_entry.get()
            if not email or not password:
                messagebox.showerror("Lỗi", "Vui lòng nhập đầy đủ!")
                return
            if len(password) < 6:
                messagebox.showerror("Lỗi", "Mật khẩu tối thiểu 6 ký tự!")
                return
            
            success, msg = self.create_approved_user(email, password)
            if success:
                messagebox.showinfo("Thành công", f"Tạo thành công {email}!")
                dialog.destroy()
                self.load_users()
            else:
                messagebox.showerror("Lỗi", f"Không thể tạo: {msg}")
                
        ctk.CTkButton(dialog, text="Tạo Tài Khoản", command=handle_create).pack(pady=20)
        
    def import_from_txt(self):
        file_path = filedialog.askopenfilename(
            title="Chọn file danh sách (TXT/CSV)",
            filetypes=[("Text Files", "*.txt"), ("CSV Files", "*.csv"), ("All Files", "*.*")]
        )
        if not file_path:
            return
            
        success_count = 0
        error_count = 0
        errors = []
        
        try:
            with open(file_path, "r", encoding="utf-8") as file:
                for line_idx, line in enumerate(file):
                    line = line.strip()
                    if not line: continue
                    
                    # Giả định format là email|pass hoặc email,pass hoặc email - pass
                    # Tách chuỗi linh hoạt bằng khoảng trắng, dấu phẩy, v.v.
                    parts = line.split(",") if "," in line else line.split("|") if "|" in line else line.split()
                    if len(parts) >= 2:
                        email = parts[0].strip()
                        password = "".join(parts[1:]).strip() 
                        
                        if len(password) < 6:
                            errors.append(f"Dòng {line_idx+1}: {email} (Mật khẩu < 6)")
                            error_count += 1
                            continue
                            
                        success, msg = self.create_approved_user(email, password)
                        if success:
                            success_count += 1
                        else:
                            errors.append(f"Dòng {line_idx+1}: {email} ({msg})")
                            error_count += 1
                    else:
                        errors.append(f"Dòng {line_idx+1}: Sai định dạng ({line})")
                        error_count += 1
                        
            # Thông báo kết quả
            res_msg = f"Đã import xong!\n- Thành công: {success_count}\n- Thất bại: {error_count}"
            if errors:
                res_msg += "\n\nLỗi tiêu biểu:\n" + "\n".join(errors[:5])
                if len(errors) > 5: res_msg += "\n..."
                
            messagebox.showinfo("Kết quả Import", res_msg)
            self.load_users()
            
        except Exception as e:
            messagebox.showerror("Lỗi khi đọc file", str(e))

if __name__ == "__main__":
    ctk.set_appearance_mode("System")
    ctk.set_default_color_theme("green")
    app = AdminApp()
    app.mainloop()

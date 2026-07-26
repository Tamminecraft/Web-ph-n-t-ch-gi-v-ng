import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { loginUser, registerUser, type AuthUser } from "@/lib/gold";
import { toast } from "sonner";

export function AuthDialog({
  open,
  onOpenChange,
  onAuth,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAuth: (u: AuthUser) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user = mode === "login" ? loginUser(email, password) : registerUser(name, email, password);
      onAuth(user);
      toast.success(mode === "login" ? "Đăng nhập thành công" : "Tạo tài khoản thành công");
      onOpenChange(false);
      setName(""); setEmail(""); setPassword("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            {mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}
          </DialogTitle>
          <DialogDescription>
            {mode === "login"
              ? "Truy cập lịch sử phân tích và các tính năng cá nhân."
              : "Đăng ký để lưu lại lịch sử phân tích của bạn."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {mode === "register" && (
            <div className="space-y-2">
              <Label htmlFor="name">Họ và tên</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Mật khẩu</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={4} />
          </div>
          <Button type="submit" disabled={loading} className="w-full bg-gradient-gold text-foreground shadow-gold hover:opacity-90">
            {loading ? "Đang xử lý..." : mode === "login" ? "Đăng nhập" : "Đăng ký"}
          </Button>
          <p className="text-sm text-center text-muted-foreground">
            {mode === "login" ? "Chưa có tài khoản?" : "Đã có tài khoản?"}{" "}
            <button
              type="button"
              className="text-gold-dark font-semibold hover:underline"
              onClick={() => setMode(mode === "login" ? "register" : "login")}
            >
              {mode === "login" ? "Đăng ký ngay" : "Đăng nhập"}
            </button>
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}

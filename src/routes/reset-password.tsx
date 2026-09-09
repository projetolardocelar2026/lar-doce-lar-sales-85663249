import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  head: () => ({
    meta: [
      { title: "Redefinir senha — Lar Doce Lar" },
      { name: "description", content: "Defina uma nova senha para acessar o sistema Lar Doce Lar." },
      { property: "og:title", content: "Redefinir senha — Lar Doce Lar" },
      { property: "og:description", content: "Defina uma nova senha para acessar o sistema Lar Doce Lar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ResetPasswordPage() {
  const nav = useNavigate();
  const [senha, setSenha] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => {
      if (sess) setPronto(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setPronto(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (senha.length < 6) {
      toast.error("A senha precisa de pelo menos 6 caracteres");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Senha alterada! Entrando…");
    nav({ to: "/pdv" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="w-full max-w-md shadow-elevated">
        <CardContent className="pt-8 pb-8 px-6 sm:px-8 space-y-6">
          <div className="flex flex-col items-center gap-3">
            <Logo size={64} />
            <div className="text-center">
              <div className="font-bold text-xl">Nova senha</div>
              <div className="text-sm text-muted-foreground">
                {pronto ? "Digite a nova senha de acesso" : "Abra esta página pelo link enviado no seu e-mail"}
              </div>
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nova-senha">Nova senha</Label>
              <div className="relative">
                <Input
                  id="nova-senha"
                  type={show ? "text" : "password"}
                  required
                  minLength={6}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" variant="hero" size="lg" className="w-full" disabled={busy || !pronto}>
              {busy ? "Salvando…" : "Salvar nova senha"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

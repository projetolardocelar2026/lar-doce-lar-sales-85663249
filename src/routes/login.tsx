import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({ meta: [{ title: "Acesso — Lar Doce Lar" }] }),
});

function LoginPage() {
  const nav = useNavigate();
  const { user, role, loading } = useAuth();

  useEffect(() => {
    if (!loading && user && role) nav({ to: "/pdv" });
  }, [user, role, loading, nav]);

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Brand panel */}
      <div className="hidden lg:flex flex-col justify-between bg-gradient-hero p-12 text-white relative overflow-hidden">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative">
          <Logo size={72} className="shadow-glow" />
        </div>
        <div className="relative space-y-4">
          <h1 className="text-5xl font-bold leading-tight">
            Lar Doce Lar
          </h1>
          <p className="text-2xl text-accent font-light">Limpeza e Praticidade</p>
          <p className="text-white/80 max-w-md">
            Sistema completo de gestão e vendas. PDV, caderneta inteligente,
            relatórios e vitrine online — tudo num só lugar.
          </p>
        </div>
        <div className="relative text-sm text-white/60">
          © {new Date().getFullYear()} Lar Doce Lar
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 bg-background">
        <Card className="w-full max-w-md shadow-elevated">
          <CardContent className="pt-8 pb-8 px-6 sm:px-8">
            <div className="lg:hidden flex flex-col items-center gap-3 mb-6">
              <Logo size={64} />
              <div className="text-center">
                <div className="font-bold text-xl">Lar Doce Lar</div>
                <div className="text-sm text-muted-foreground">Limpeza e Praticidade</div>
              </div>
            </div>

            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid grid-cols-2 w-full mb-6">
                <TabsTrigger value="login">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Criar conta</TabsTrigger>
              </TabsList>
              <TabsContent value="login"><SignInForm /></TabsContent>
              <TabsContent value="signup"><SignUpForm /></TabsContent>
            </Tabs>

            <div className="mt-6 text-center text-sm">
              <Link to="/" className="text-muted-foreground hover:text-primary">
                ← Voltar para a vitrine
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SignInForm() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error(error.message === "Invalid login credentials" ? "E-mail ou senha incorretos" : error.message);
      return;
    }
    toast.success("Bem-vindo(a) de volta!");
    nav({ to: "/pdv" });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
        <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
      </div>
      <Button type="submit" variant="hero" size="lg" className="w-full" disabled={busy}>
        {busy ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}

function SignUpForm() {
  const nav = useNavigate();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) { toast.error("Senha precisa de pelo menos 6 caracteres"); return; }
    setBusy(true);
    const redirectUrl = `${window.location.origin}/pdv`;
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: redirectUrl, data: { nome_completo: nome } },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message.includes("already registered") ? "E-mail já cadastrado" : error.message);
      return;
    }
    toast.success("Conta criada! Você já pode entrar.");
    nav({ to: "/pdv" });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="nome">Nome completo</Label>
        <Input id="nome" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email-s">E-mail</Label>
        <Input id="email-s" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password-s">Senha</Label>
        <Input id="password-s" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
      </div>
      <Button type="submit" variant="hero" size="lg" className="w-full" disabled={busy}>
        {busy ? "Criando…" : "Criar conta"}
      </Button>
      <p className="text-xs text-muted-foreground text-center">
        O primeiro usuário criado vira <strong>administrador</strong>. Os próximos vêm como atendentes.
      </p>
    </form>
  );
}

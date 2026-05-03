import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../_app";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { brl } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ShoppingCart, Package, Users, Notebook, Target, TrendingUp, Pencil, Trophy, AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function Dashboard() {
  const { isAdmin } = useAuth();
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1;

  const [meta, setMeta] = useState<number>(0);
  const [metaId, setMetaId] = useState<string | null>(null);
  const [faturado, setFaturado] = useState<number>(0);
  const [vendasMes, setVendasMes] = useState<number>(0);
  const [estoqueBaixo, setEstoqueBaixo] = useState<{ id: string; nome: string; estoque: number; estoque_minimo: number | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMeta, setShowMeta] = useState(false);
  const [valorInput, setValorInput] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);

  const carregar = async () => {
    setLoading(true);
    const inicio = new Date(ano, mes - 1, 1).toISOString();
    const fim = new Date(ano, mes, 1).toISOString();

    const [{ data: m }, { data: vendas }, { data: prods }] = await Promise.all([
      supabase.from("metas").select("id,valor_meta").eq("ano", ano).eq("mes", mes).maybeSingle(),
      supabase
        .from("vendas")
        .select("total,status")
        .gte("data_venda", inicio)
        .lt("data_venda", fim)
        .neq("status", "cancelada"),
      supabase.from("produtos").select("id,nome,estoque,estoque_minimo").eq("ativo", true),
    ]);

    setMeta(Number(m?.valor_meta ?? 0));
    setMetaId(m?.id ?? null);
    setValorInput(m?.valor_meta ? String(m.valor_meta) : "");
    const list = (vendas as { total: number }[]) || [];
    setFaturado(list.reduce((s, v) => s + Number(v.total), 0));
    setVendasMes(list.length);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, []);

  const percentual = meta > 0 ? Math.min(100, (faturado / meta) * 100) : 0;
  const restante = Math.max(0, meta - faturado);
  const diasNoMes = new Date(ano, mes, 0).getDate();
  const diasRestantes = Math.max(1, diasNoMes - hoje.getDate() + 1);
  const ritmoDiarioNecessario = restante / diasRestantes;

  const corBarra = useMemo(() => {
    if (percentual >= 100) return "bg-emerald-500";
    if (percentual >= 70) return "bg-brand-sky";
    if (percentual >= 40) return "bg-amber-500";
    return "bg-rose-500";
  }, [percentual]);

  const salvarMeta = async () => {
    const v = parseFloat((valorInput || "0").replace(",", "."));
    if (isNaN(v) || v < 0) { toast.error("Valor inválido"); return; }
    setSavingMeta(true);
    try {
      if (metaId) {
        const { error } = await supabase.from("metas").update({ valor_meta: v }).eq("id", metaId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("metas").insert({ ano, mes, valor_meta: v });
        if (error) throw error;
      }
      toast.success("Meta atualizada!");
      setShowMeta(false);
      carregar();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar meta");
    } finally {
      setSavingMeta(false);
    }
  };

  const cards = [
    { to: "/pdv", icon: ShoppingCart, label: "Abrir PDV", desc: "Registrar nova venda" },
    { to: "/produtos", icon: Package, label: "Produtos", desc: "Gerenciar catálogo" },
    { to: "/clientes", icon: Users, label: "Clientes", desc: "Cadastros e histórico" },
    { to: "/caderneta", icon: Notebook, label: "Caderneta", desc: "Saldos e pagamentos" },
  ];

  return (
    <div>
      <PageHeader title="Painel" description="Visão geral do mês" />

      {/* Meta do mês */}
      <Card className="mb-6 overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-5 w-5 text-primary" />
              Meta de {MESES[mes - 1]} / {ano}
              {percentual >= 100 && (
                <Badge className="bg-emerald-500 text-white gap-1">
                  <Trophy className="h-3 w-3" /> Batida!
                </Badge>
              )}
            </CardTitle>
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => setShowMeta(true)}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                {meta > 0 ? "Editar meta" : "Definir meta"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="text-sm text-muted-foreground">Carregando…</div>
          ) : meta === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Target className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhuma meta definida para este mês.</p>
              {isAdmin && (
                <Button className="mt-3" size="sm" onClick={() => setShowMeta(true)}>
                  Definir meta agora
                </Button>
              )}
            </div>
          ) : (
            <>
              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Faturado / Meta</div>
                    <div className="text-2xl font-bold text-primary">
                      {brl(faturado)} <span className="text-sm font-normal text-muted-foreground">de {brl(meta)}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Atingido</div>
                    <div className="text-2xl font-bold">{percentual.toFixed(1)}%</div>
                  </div>
                </div>
                <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${corBarra} transition-all`}
                    style={{ width: `${percentual}%` }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                <Stat label="Vendas" value={String(vendasMes)} />
                <Stat label="Falta" value={brl(restante)} />
                <Stat label="Dias restantes" value={String(diasRestantes)} />
                <Stat
                  label="Ritmo / dia"
                  value={brl(ritmoDiarioNecessario)}
                  highlight={percentual < 100}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Atalhos */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.to} to={c.to}>
              <Card className="bg-gradient-card hover:shadow-elevated transition-smooth h-full">
                <CardContent className="p-5 space-y-3">
                  <div className="h-12 w-12 rounded-xl bg-gradient-brand flex items-center justify-center text-white">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="font-bold">{c.label}</div>
                    <div className="text-xs text-muted-foreground">{c.desc}</div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Dialog de meta */}
      <Dialog open={showMeta} onOpenChange={setShowMeta}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" /> Meta de {MESES[mes - 1]} / {ano}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="mb-1 block">Valor da meta (R$)</Label>
              <Input
                inputMode="decimal"
                value={valorInput}
                onChange={(e) => setValorInput(e.target.value)}
                placeholder="Ex: 15000,00"
                autoFocus
              />
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                Faturamento atual: <strong>{brl(faturado)}</strong>
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowMeta(false)} disabled={savingMeta}>
              Cancelar
            </Button>
            <Button onClick={salvarMeta} disabled={savingMeta}>
              {savingMeta ? "Salvando…" : "Salvar meta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? "border-primary/40 bg-primary/5" : "bg-muted/30"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-bold text-base">{value}</div>
    </div>
  );
}

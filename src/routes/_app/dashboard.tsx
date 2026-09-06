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
  Boxes, Percent, CircleDollarSign, PiggyBank, Receipt, ArrowUpRight, ArrowDownRight, Minus,
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

  type Periodo = "hoje" | "semana" | "mes";
  const [periodo, setPeriodo] = useState<Periodo>("mes");

  const [meta, setMeta] = useState<number>(0);
  const [metaId, setMetaId] = useState<string | null>(null);
  const [faturado, setFaturado] = useState<number>(0);
  const [vendasMes, setVendasMes] = useState<number>(0);
  const [estoqueBaixo, setEstoqueBaixo] = useState<{ id: string; nome: string; estoque: number; estoque_minimo: number | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMeta, setShowMeta] = useState(false);
  const [valorInput, setValorInput] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);
  const [kpis, setKpis] = useState<{
    custoEstoque: number; potencialVenda: number; margem: number; markup: number;
    faturamento: number; lucro: number; ticket: number;
    dMarkup: number | null; dMargem: number | null;
    dFat: number | null; dLucro: number | null; dTicket: number | null;
  } | null>(null);

  const carregar = async () => {
    setLoading(true);
    let inicio: string, fim: string, inicioPrev: string;
    if (periodo === "hoje") {
      const ini = new Date(hoje); ini.setHours(0, 0, 0, 0);
      const fimD = new Date(ini); fimD.setDate(fimD.getDate() + 1);
      const prevIni = new Date(ini); prevIni.setDate(prevIni.getDate() - 1);
      inicio = ini.toISOString(); fim = fimD.toISOString(); inicioPrev = prevIni.toISOString();
    } else if (periodo === "semana") {
      const ini = new Date(hoje); ini.setHours(0, 0, 0, 0);
      ini.setDate(ini.getDate() - ((ini.getDay() + 6) % 7)); // segunda-feira
      const fimS = new Date(ini); fimS.setDate(fimS.getDate() + 7);
      const prevIni = new Date(ini); prevIni.setDate(prevIni.getDate() - 7);
      inicio = ini.toISOString(); fim = fimS.toISOString(); inicioPrev = prevIni.toISOString();
    } else {
      inicio = new Date(ano, mes - 1, 1).toISOString();
      fim = new Date(ano, mes, 1).toISOString();
      inicioPrev = new Date(ano, mes - 2, 1).toISOString();
    }

    const [{ data: m }, { data: vendas }, { data: prods }, { data: vendasPrev }] = await Promise.all([
      supabase.from("metas").select("id,valor_meta").eq("ano", ano).eq("mes", mes).maybeSingle(),
      supabase
        .from("vendas")
        .select("id,total,status")
        .gte("data_venda", inicio)
        .lt("data_venda", fim)
        .neq("status", "cancelada"),
      supabase.from("produtos").select("id,nome,estoque,estoque_minimo,preco,preco_custo").eq("ativo", true),
      supabase
        .from("vendas")
        .select("id,total")
        .gte("data_venda", inicioPrev)
        .lt("data_venda", inicio)
        .neq("status", "cancelada"),
    ]);

    // ---- KPIs executivos ----
    const listaProds = (prods as any[]) || [];
    const custoMap = new Map<string, number>(
      listaProds.map((p) => [p.id, Number(p.preco_custo ?? 0)])
    );
    const custoEstoque = listaProds.reduce((s, p) => s + Number(p.estoque) * Number(p.preco_custo ?? 0), 0);
    const potencialVenda = listaProds.reduce((s, p) => s + Number(p.estoque) * Number(p.preco ?? 0), 0);
    const lucroPotencial = Math.max(0, potencialVenda - custoEstoque);
    const margem = potencialVenda > 0 ? (lucroPotencial / potencialVenda) * 100 : 0;
    const markup = custoEstoque > 0 ? (lucroPotencial / custoEstoque) * 100 : 0;

    const vendasList = (vendas as { id: string; total: number }[]) || [];
    const prevList = (vendasPrev as { id: string; total: number }[]) || [];
    const fatPrev = prevList.reduce((s, v) => s + Number(v.total), 0);
    const ticketPrev = prevList.length > 0 ? fatPrev / prevList.length : 0;

    const lucroDe = async (ids: string[]) => {
      if (ids.length === 0) return 0;
      const { data: itens } = await supabase
        .from("itens_venda")
        .select("produto_id,quantidade,subtotal")
        .in("venda_id", ids);
      return ((itens as any[]) || []).reduce(
        (s, it) => s + Number(it.subtotal) - (custoMap.get(it.produto_id) ?? 0) * Number(it.quantidade),
        0
      );
    };
    const [lucroMes, lucroPrev] = await Promise.all([
      lucroDe(vendasList.map((v) => v.id)),
      lucroDe(prevList.map((v) => v.id)),
    ]);

    const fatMes = vendasList.reduce((s, v) => s + Number(v.total), 0);
    const ticketMes = vendasList.length > 0 ? fatMes / vendasList.length : 0;
    const margemPrev = fatPrev > 0 ? (lucroPrev / fatPrev) * 100 : 0;
    const delta = (cur: number, prev: number) => (prev > 0 ? ((cur - prev) / prev) * 100 : null);

    setKpis({
      custoEstoque, potencialVenda, margem, markup,
      faturamento: fatMes, lucro: lucroMes, ticket: ticketMes,
      dMarkup: markup > 0 ? markup : null,
      dMargem: margemPrev > 0 ? margem - margemPrev : null,
      dFat: delta(fatMes, fatPrev),
      dLucro: delta(lucroMes, lucroPrev),
      dTicket: delta(ticketMes, ticketPrev),
    });

    setMeta(Number(m?.valor_meta ?? 0));
    setMetaId(m?.id ?? null);
    setValorInput(m?.valor_meta ? String(m.valor_meta) : "");
    const list = (vendas as { total: number }[]) || [];
    setFaturado(list.reduce((s, v) => s + Number(v.total), 0));
    setVendasMes(list.length);
    const baixos = ((prods as any[]) || [])
      .filter((p) => p.estoque <= (p.estoque_minimo ?? 0))
      .sort((a, b) => a.estoque - b.estoque);
    setEstoqueBaixo(baixos);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, [periodo]);

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
      <PageHeader title="Painel" description="Visão geral do período" />

      {/* Filtro de período */}
      <div className="flex items-center gap-2 mb-4">
        {([
          { id: "hoje", label: "Hoje" },
          { id: "semana", label: "Esta Semana" },
          { id: "mes", label: "Este Mês" },
        ] as const).map((p) => (
          <Button
            key={p.id}
            size="sm"
            variant={periodo === p.id ? "default" : "outline"}
            onClick={() => setPeriodo(p.id)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {/* Painel executivo escuro — KPIs */}
      <div className="exec-panel rounded-2xl p-5 md:p-6 mb-6 text-primary-foreground">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold tracking-wide uppercase text-primary-foreground/70">
            Indicadores executivos
          </h2>
          <span className="text-xs text-primary-foreground/50">
            {periodo === "hoje"
              ? "Comparativo vs. ontem"
              : periodo === "semana"
                ? "Comparativo vs. semana anterior"
                : `Comparativo vs. ${MESES[(mes - 2 + 12) % 12]}`}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <KpiCard
            icon={Boxes}
            title="Custo Total em Estoque"
            value={brl(kpis?.custoEstoque ?? 0)}
            delta={kpis?.dMarkup ?? null}
            deltaLabel="markup potencial"
            loading={loading}
          />
          <KpiCard
            icon={TrendingUp}
            title="Potencial de Venda"
            value={brl(kpis?.potencialVenda ?? 0)}
            delta={kpis && kpis.custoEstoque > 0 ? kpis.margem : null}
            deltaLabel="margem potencial"
            loading={loading}
          />
          <KpiCard
            icon={Percent}
            title="Margem / Markup Média"
            value={`${(kpis?.margem ?? 0).toFixed(1)}%`}
            sub={`Markup ${(kpis?.markup ?? 0).toFixed(1)}%`}
            delta={kpis?.dMargem ?? null}
            deltaLabel="vs. margem realizada"
            loading={loading}
          />
          <KpiCard
            icon={CircleDollarSign}
            title="Faturamento do Mês"
            value={brl(kpis?.faturamento ?? 0)}
            delta={kpis?.dFat ?? null}
            loading={loading}
          />
          <KpiCard
            icon={PiggyBank}
            title="Lucro Bruto"
            value={brl(kpis?.lucro ?? 0)}
            delta={kpis?.dLucro ?? null}
            loading={loading}
          />
          <KpiCard
            icon={Receipt}
            title="Ticket Médio"
            value={brl(kpis?.ticket ?? 0)}
            delta={kpis?.dTicket ?? null}
            loading={loading}
          />
        </div>
      </div>

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

      {/* Alerta de estoque mínimo */}
      {estoqueBaixo.length > 0 && (
        <Card className="mb-6 border-rose-500/60 bg-rose-50 dark:bg-rose-950/30 shadow-[0_0_0_1px_rgba(244,63,94,0.25)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-rose-700 dark:text-rose-400">
              <AlertTriangle className="h-5 w-5" />
              {estoqueBaixo.length} produto{estoqueBaixo.length > 1 ? "s" : ""} no estoque mínimo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {estoqueBaixo.slice(0, 8).map((p) => (
                <div key={p.id} className="flex items-center justify-between text-sm py-1">
                  <span className="font-medium text-rose-800 dark:text-rose-200">{p.nome}</span>
                  <Badge variant="destructive">
                    {p.estoque} / mín {p.estoque_minimo ?? 0}
                  </Badge>
                </div>
              ))}
              {estoqueBaixo.length > 8 && (
                <Link to="/relatorios" className="text-xs text-primary hover:underline block pt-2">
                  Ver lista completa em Relatórios →
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      )}

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

function KpiCard({
  icon: Icon, title, value, sub, delta, deltaLabel, loading,
}: {
  icon: any; title: string; value: string; sub?: string;
  delta: number | null; deltaLabel?: string; loading?: boolean;
}) {
  const positivo = delta !== null && delta > 0;
  const negativo = delta !== null && delta < 0;
  return (
    <div className="exec-card rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-primary-foreground/60 leading-tight">
          {title}
        </span>
        <div className="h-7 w-7 rounded-lg bg-brand-sky/20 flex items-center justify-center shrink-0">
          <Icon className="h-3.5 w-3.5 text-brand-sky" />
        </div>
      </div>
      <div className="text-xl font-bold leading-none">
        {loading ? "…" : value}
      </div>
      {sub && <div className="text-[11px] text-primary-foreground/50">{sub}</div>}
      <div className="flex items-center gap-1 text-xs font-semibold">
        {delta === null ? (
          <span className="inline-flex items-center gap-1 text-primary-foreground/40">
            <Minus className="h-3 w-3" /> sem base
          </span>
        ) : (
          <span
            className={`inline-flex items-center gap-1 ${
              positivo ? "text-emerald-400" : negativo ? "text-rose-400" : "text-primary-foreground/50"
            }`}
          >
            {positivo ? <ArrowUpRight className="h-3.5 w-3.5" /> : negativo ? <ArrowDownRight className="h-3.5 w-3.5" /> : <Minus className="h-3 w-3" />}
            {positivo ? "+" : ""}{delta.toFixed(1)}%
          </span>
        )}
        {deltaLabel && <span className="text-[10px] font-normal text-primary-foreground/40">{deltaLabel}</span>}
      </div>
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

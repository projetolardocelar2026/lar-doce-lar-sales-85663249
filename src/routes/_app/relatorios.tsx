import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../_app";
import { supabase } from "@/integrations/supabase/client";
import { brl, fmtDateOnly, formaPagamentoLabel, round2 } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend, LineChart, Line, AreaChart, Area, ComposedChart,
} from "recharts";
import { downloadCSV, downloadTablePDF } from "@/lib/exporters";
import {
  Download, FileSpreadsheet, FileText, Trophy, AlertTriangle, Package,
  ArrowDownRight, ArrowUpRight, CircleDollarSign, ShieldAlert,
  Boxes, TrendingUp, TrendingDown, Minus, PieChart as PieIcon, Users, Target,
} from "lucide-react";


export const Route = createFileRoute("/_app/relatorios")({
  component: Relatorios,
});

const PIE_COLORS = ["#0EA5E9", "#22C55E", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];
const EXPENSE_COLORS = ["var(--finance-profit)", "var(--finance-loss)", "var(--finance-income)", "var(--finance-expense)", "var(--muted-foreground)"];

type Venda = {
  id: string;
  total: number;
  forma_pagamento: string;
  data_venda: string;
  cliente_id: string | null;
  status: string;
};
type Item = {
  produto_id: string | null;
  produto_nome: string;
  quantidade: number;
  subtotal: number;
  venda_id: string;
  categoria_id: string | null;
};
type Cliente = { id: string; nome: string; saldo_devedor?: number };
type Produto = { id: string; nome: string; estoque: number; estoque_minimo: number | null; ativo: boolean; categoria_id: string | null; preco: number; preco_custo: number | null };

type Categoria = { id: string; nome: string };

type Movimento = { tipo: string; valor: number; data_movimento: string };
type ContaFinanceira = { categoria: string | null; valor: number; status: string; data_pagamento: string | null };

function Relatorios() {
  const hoje = new Date();
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>("todas");
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [inicio, setInicio] = useState(() => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    return d.toISOString().slice(0, 10);
  });
  const [fim, setFim] = useState(() => hoje.toISOString().slice(0, 10));

  const [vendas, setVendas] = useState<Venda[]>([]);
  const [pagamentos, setPagamentos] = useState<{ venda_id: string; forma_pagamento: string; valor: number }[]>([]);
  const [itens, setItens] = useState<Item[]>([]);
  const [pagCaderneta, setPagCaderneta] = useState<{ forma_pagamento: string; valor: number }[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [movimentos, setMovimentos] = useState<Movimento[]>([]);
  const [contasFinanceiras, setContasFinanceiras] = useState<ContaFinanceira[]>([]);

  const carregar = async () => {
    setLoading(true);
    const ini = new Date(inicio + "T00:00:00").toISOString();
    const fimISO = new Date(fim + "T23:59:59").toISOString();

    const [{ data: v }, { data: c }, { data: p }, { data: cats }, { data: mov }, { data: contas }, { data: pagCad }] = await Promise.all([
      supabase.from("vendas").select("id,total,forma_pagamento,data_venda,cliente_id,status")
        .gte("data_venda", ini).lte("data_venda", fimISO).eq("status", "paga")
        .order("data_venda", { ascending: false }),

      supabase.from("clientes").select("id,nome,saldo_devedor"),
      supabase.from("produtos").select("id,nome,estoque,estoque_minimo,ativo,categoria_id,preco"),
      supabase.from("categorias").select("id,nome").eq("ativa", true).order("ordem"),
      supabase.from("fluxo_caixa").select("tipo,valor,data_movimento")
        .gte("data_movimento", ini).lte("data_movimento", fimISO),
      supabase.from("contas_pagar").select("categoria,valor,status,data_pagamento")
        .eq("status", "paga").gte("data_pagamento", ini).lte("data_pagamento", fimISO),
      supabase.from("pagamentos_caderneta").select("forma_pagamento,valor,data_pagamento")
        .gte("data_pagamento", ini).lte("data_pagamento", fimISO),
    ]);
    const vendasArr = (v as Venda[]) || [];
    setVendas(vendasArr);
    setClientes((c as Cliente[]) || []);
    setProdutos((p as Produto[]) || []);
    setCategorias((cats as Categoria[]) || []);
    setMovimentos((mov as Movimento[]) || []);
    setContasFinanceiras((contas as ContaFinanceira[]) || []);
    setPagCaderneta(((pagCad as any[]) || []).map(x => ({ forma_pagamento: x.forma_pagamento, valor: Number(x.valor) })));

    if (vendasArr.length > 0) {
      const ids = vendasArr.map(x => x.id);
      const [{ data: it }, { data: pg }] = await Promise.all([
        supabase.from("itens_venda")
          .select("produto_id,produto_nome,quantidade,subtotal,venda_id,categoria_id")
          .in("venda_id", ids),
        supabase.from("pagamentos_venda")
          .select("venda_id,forma_pagamento,valor")
          .in("venda_id", ids),
      ]);
      setItens((it as Item[]) || []);
      setPagamentos((pg as any[])?.map(p => ({ ...p, valor: Number(p.valor) })) || []);
    } else {
      setItens([]);
      setPagamentos([]);
    }
    setLoading(false);
  };

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, []);

  // ===== Filtro por categoria =====
  // Aplicado a itens; vendas são filtradas indiretamente (apenas vendas que
  // contenham itens da categoria filtrada).
  const itensFiltrados = useMemo(() => {
    if (categoriaFiltro === "todas") return itens;
    // fallback: se item não tem categoria_id, recupera pelo produto
    const catByProduto = new Map(produtos.map(p => [p.id, p.categoria_id]));
    return itens.filter(i => {
      const cat = i.categoria_id ?? (i.produto_id ? catByProduto.get(i.produto_id) ?? null : null);
      return cat === categoriaFiltro;
    });
  }, [itens, categoriaFiltro, produtos]);

  const vendasFiltradas = useMemo(() => {
    if (categoriaFiltro === "todas") return vendas;
    const ids = new Set(itensFiltrados.map(i => i.venda_id));
    return vendas.filter(v => ids.has(v.id));
  }, [vendas, itensFiltrados, categoriaFiltro]);

  // Faturamento total (no filtro: soma dos subtotais dos itens da categoria)
  const faturamento = useMemo(() => {
    if (categoriaFiltro === "todas") return vendas.reduce((s, v) => s + Number(v.total), 0);
    return itensFiltrados.reduce((s, i) => s + Number(i.subtotal), 0);
  }, [vendas, itensFiltrados, categoriaFiltro]);
  const ticketMedio = vendasFiltradas.length ? faturamento / vendasFiltradas.length : 0;

  // Por dia
  const porDia = useMemo(() => {
    const map = new Map<string, number>();
    if (categoriaFiltro === "todas") {
      vendasFiltradas.forEach(v => {
        const d = new Date(v.data_venda).toISOString().slice(0, 10);
        map.set(d, (map.get(d) || 0) + Number(v.total));
      });
    } else {
      const vendaPorData = new Map(vendasFiltradas.map(v => [v.id, v.data_venda]));
      itensFiltrados.forEach(i => {
        const dv = vendaPorData.get(i.venda_id);
        if (!dv) return;
        const d = new Date(dv).toISOString().slice(0, 10);
        map.set(d, (map.get(d) || 0) + Number(i.subtotal));
      });
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([data, total]) => ({ data: data.slice(5), total }));
  }, [vendasFiltradas, itensFiltrados, categoriaFiltro]);

  // Por forma de pagamento — usa os pagamentos fracionados (pagto. misto) quando existirem
  const porPagamento = useMemo(() => {
    const map = new Map<string, number>();
    const subtotalPorVenda = new Map<string, number>();
    if (categoriaFiltro !== "todas") {
      itensFiltrados.forEach(i => {
        subtotalPorVenda.set(i.venda_id, (subtotalPorVenda.get(i.venda_id) || 0) + Number(i.subtotal));
      });
    }
    vendasFiltradas.forEach(v => {
      const base = categoriaFiltro === "todas" ? Number(v.total) : (subtotalPorVenda.get(v.id) || 0);
      if (!base) return;
      const splits = pagamentos.filter(p => p.venda_id === v.id);
      const somaSplits = splits.reduce((s, p) => s + Number(p.valor), 0);
      if (splits.length > 0 && somaSplits > 0) {
        splits.forEach(p => {
          if (p.forma_pagamento === "caderneta") return; // fiado não é entrada de caixa
          const parte = base * (Number(p.valor) / somaSplits);
          map.set(p.forma_pagamento, (map.get(p.forma_pagamento) || 0) + parte);
        });
      } else if (v.forma_pagamento !== "caderneta") {
        map.set(v.forma_pagamento, (map.get(v.forma_pagamento) || 0) + base);
      }
    });
    // Recebimentos de caderneta entram pela forma REAL do pagamento
    if (categoriaFiltro === "todas") {
      pagCaderneta.forEach(p => {
        if (p.forma_pagamento === "caderneta") return;
        map.set(p.forma_pagamento, (map.get(p.forma_pagamento) || 0) + Number(p.valor));
      });
    }
    return Array.from(map.entries()).map(([forma, total]) => ({
      name: formaPagamentoLabel[forma] || forma,
      value: round2(total),
    }));
  }, [vendasFiltradas, itensFiltrados, categoriaFiltro, pagamentos, pagCaderneta]);

  const totalAReceberCaderneta = useMemo(
    () => clientes.reduce((s, c) => s + Number(c.saldo_devedor || 0), 0),
    [clientes],
  );


  // Top produtos
  const topProdutos = useMemo(() => {
    const map = new Map<string, { nome: string; qtd: number; total: number }>();
    itensFiltrados.forEach(i => {
      const key = i.produto_id || i.produto_nome;
      const cur = map.get(key) || { nome: i.produto_nome, qtd: 0, total: 0 };
      cur.qtd += Number(i.quantidade);
      cur.total += Number(i.subtotal);
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [itensFiltrados]);

  // VIP clientes
  const vipClientes = useMemo(() => {
    const map = new Map<string, { nome: string; total: number; compras: number }>();
    const nomeById = new Map(clientes.map(c => [c.id, c.nome]));
    vendasFiltradas.forEach(v => {
      if (!v.cliente_id) return;
      const cur = map.get(v.cliente_id) || { nome: nomeById.get(v.cliente_id) || "—", total: 0, compras: 0 };
      cur.total += Number(v.total);
      cur.compras += 1;
      map.set(v.cliente_id, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [vendasFiltradas, clientes]);

  // Estoque baixo (respeita filtro categoria)
  const estoqueBaixo = useMemo(() => {
    const base = produtos.filter(p => p.ativo && p.estoque <= (p.estoque_minimo ?? 0));
    const filtrados = categoriaFiltro === "todas" ? base : base.filter(p => p.categoria_id === categoriaFiltro);
    return filtrados.sort((a, b) => a.estoque - b.estoque);
  }, [produtos, categoriaFiltro]);

  // ===== Por categoria (faturamento e estoque) =====
  const porCategoria = useMemo(() => {
    const catByProduto = new Map(produtos.map(p => [p.id, p.categoria_id]));
    const map = new Map<string, { catId: string | null; nome: string; faturamento: number; qtd: number }>();
    itens.forEach(i => {
      const catId = i.categoria_id ?? (i.produto_id ? catByProduto.get(i.produto_id) ?? null : null);
      const key = catId ?? "__sem__";
      const nome = categorias.find(c => c.id === catId)?.nome ?? "Sem categoria";
      const cur = map.get(key) || { catId, nome, faturamento: 0, qtd: 0 };
      cur.faturamento += Number(i.subtotal);
      cur.qtd += Number(i.quantidade);
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.faturamento - a.faturamento);
  }, [itens, categorias, produtos]);

  const estoquePorCategoria = useMemo(() => {
    const map = new Map<string, { catId: string | null; nome: string; itens: number; valor: number; criticos: number }>();
    produtos.filter(p => p.ativo).forEach(p => {
      const key = p.categoria_id ?? "__sem__";
      const nome = categorias.find(c => c.id === p.categoria_id)?.nome ?? "Sem categoria";
      const cur = map.get(key) || { catId: p.categoria_id, nome, itens: 0, valor: 0, criticos: 0 };
      cur.itens += Number(p.estoque);
      cur.valor += Number(p.estoque) * Number(p.preco);
      if (Number(p.estoque) <= Number(p.estoque_minimo ?? 0)) cur.criticos += 1;
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.valor - a.valor);
  }, [produtos, categorias]);

  const catNome = categoriaFiltro === "todas"
    ? "Todas categorias"
    : (categorias.find(c => c.id === categoriaFiltro)?.nome ?? "Categoria");

  const financeiro = useMemo(() => {
    let entradas = 0;
    let saidas = 0;
    movimentos.forEach((movimento) => {
      if (movimento.tipo.startsWith("entrada")) entradas += Number(movimento.valor);
      else saidas += Number(movimento.valor);
    });
    const avarias = contasFinanceiras
      .filter((conta) => conta.categoria === "Avarias / Quebras")
      .reduce((total, conta) => total + Number(conta.valor), 0);
    return { entradas, saidas, lucro: entradas - saidas, avarias };
  }, [movimentos, contasFinanceiras]);

  const evolucaoFinanceira = useMemo(() => {
    const porData = new Map<string, { data: string; entradas: number; saidas: number }>();
    movimentos.forEach((movimento) => {
      const dataMovimento = new Date(movimento.data_movimento).toISOString().slice(0, 10);
      const atual = porData.get(dataMovimento) ?? { data: dataMovimento, entradas: 0, saidas: 0 };
      if (movimento.tipo.startsWith("entrada")) atual.entradas += Number(movimento.valor);
      else atual.saidas += Number(movimento.valor);
      porData.set(dataMovimento, atual);
    });
    let acumulado = 0;
    return Array.from(porData.values()).sort((a, b) => a.data.localeCompare(b.data)).map((dia) => {
      acumulado += dia.entradas - dia.saidas;
      return { ...dia, label: dia.data.slice(5), saldo: acumulado };
    });
  }, [movimentos]);

  const despesasPorCategoria = useMemo(() => {
    const mapa = new Map<string, number>();
    contasFinanceiras.forEach((conta) => {
      const categoria = conta.categoria || "Outros";
      mapa.set(categoria, (mapa.get(categoria) ?? 0) + Number(conta.valor));
    });
    return Array.from(mapa, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [contasFinanceiras]);

  const exportarCSV = () => {
    downloadCSV(`relatorio-vendas-${inicio}-${fim}.csv`, vendasFiltradas.map(v => ({
      Data: fmtDateOnly(v.data_venda),
      Total: Number(v.total).toFixed(2),
      Pagamento: formaPagamentoLabel[v.forma_pagamento] || v.forma_pagamento,
      Cliente: clientes.find(c => c.id === v.cliente_id)?.nome || "—",
    })));
  };

  const exportarPDF = () => {
    downloadTablePDF({
      filename: `relatorio-${inicio}-${fim}.pdf`,
      title: "Relatório de Vendas",
      subtitle: `Período: ${fmtDateOnly(inicio)} a ${fmtDateOnly(fim)} • Categoria: ${catNome} • Faturamento: ${brl(faturamento)} • ${vendasFiltradas.length} vendas`,
      headers: ["Data", "Cliente", "Pagamento", "Total"],
      rows: vendasFiltradas.map(v => [
        fmtDateOnly(v.data_venda),
        clientes.find(c => c.id === v.cliente_id)?.nome || "—",
        formaPagamentoLabel[v.forma_pagamento] || v.forma_pagamento,
        brl(Number(v.total)),
      ]),
      footer: "Lar Doce Lar — Limpeza e Praticidade",
    });
  };

  return (
    <div>
      <PageHeader
        title="Relatórios & BI"
        description="Faturamento, rankings, formas de pagamento e estoque"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportarCSV}>
              <FileSpreadsheet className="h-4 w-4 mr-1.5" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportarPDF}>
              <FileText className="h-4 w-4 mr-1.5" /> PDF
            </Button>
          </>
        }
      />

      {/* Filtro período + categoria */}
      <Card className="mb-6">
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <Label className="mb-1 block text-xs">Início</Label>
            <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Fim</Label>
            <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Categoria</Label>
            <Select value={categoriaFiltro} onValueChange={setCategoriaFiltro}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas categorias</SelectItem>
                {categorias.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={carregar} disabled={loading}>
            {loading ? "Carregando…" : "Atualizar"}
          </Button>
        </CardContent>
      </Card>

      {categoriaFiltro !== "todas" && (
        <div className="mb-4 text-xs text-muted-foreground">
          Filtrando por <Badge variant="secondary" className="ml-1">{catNome}</Badge>
        </div>
      )}

      <section className="mb-8" aria-labelledby="dashboard-financeiro-title">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="dashboard-financeiro-title" className="text-xl font-bold">Dashboard financeiro</h2>
            <p className="text-sm text-muted-foreground">Visão real de entradas, despesas, resultado e perdas no período</p>
          </div>
          <Badge variant="outline" className="w-fit">Atualizado pelo fluxo de caixa</Badge>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <FinanceKPI label="Total de Entradas / Vendas" value={financeiro.entradas} icon={ArrowUpRight} tone="income" delay="0ms" />
          <FinanceKPI label="Total de Saídas / Despesas" value={financeiro.saidas} icon={ArrowDownRight} tone="expense" delay="70ms" />
          <FinanceKPI label="Lucro Líquido Real" value={financeiro.lucro} icon={CircleDollarSign} tone="profit" delay="140ms" />
          <FinanceKPI label="Avarias / Quebras" value={financeiro.avarias} icon={ShieldAlert} tone="loss" delay="210ms" />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
          <Card className="finance-panel xl:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Evolução do fluxo de caixa</CardTitle>
              <p className="text-xs text-muted-foreground">Saldo líquido acumulado ao longo do período</p>
            </CardHeader>
            <CardContent className="h-72 px-2 pb-4 sm:px-5">
              {evolucaoFinanceira.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem movimentações no período.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={evolucaoFinanceira} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="financeGlow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--finance-profit)" stopOpacity={0.55} />
                        <stop offset="100%" stopColor="var(--finance-profit)" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="4 5" vertical={false} />
                    <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `R$${Math.round(v / 1000)}k`} />
                    <Tooltip formatter={(value: number) => brl(value)} />
                    <Area type="monotone" dataKey="saldo" name="Saldo líquido" stroke="var(--finance-profit)" strokeWidth={3} fill="url(#financeGlow)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="finance-panel xl:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Despesas por categoria</CardTitle>
              <p className="text-xs text-muted-foreground">Contas pagas no período selecionado</p>
            </CardHeader>
            <CardContent className="h-72 px-2 pb-4 sm:px-4">
              {despesasPorCategoria.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem despesas categorizadas.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={despesasPorCategoria} dataKey="value" nameKey="name" innerRadius={55} outerRadius={88} paddingAngle={4} cornerRadius={4}>
                      {despesasPorCategoria.map((item, index) => <Cell key={item.name} fill={EXPENSE_COLORS[index % EXPENSE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(value: number) => brl(value)} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KPI label="Faturamento" value={brl(faturamento)} />
        <KPI label="Vendas" value={String(vendasFiltradas.length)} />
        <KPI label="Ticket médio" value={brl(ticketMedio)} />
        <KPI label="Itens vendidos" value={String(itensFiltrados.reduce((s, i) => s + Number(i.quantidade), 0))} />
      </div>

      <Tabs defaultValue="faturamento">
        <TabsList className="grid grid-cols-3 md:grid-cols-6 w-full">
          <TabsTrigger value="faturamento">Faturamento</TabsTrigger>
          <TabsTrigger value="pagamentos">Pagamentos</TabsTrigger>
          <TabsTrigger value="rankings">Rankings</TabsTrigger>
          <TabsTrigger value="categorias">Por Categoria</TabsTrigger>
          <TabsTrigger value="estoque">Estoque</TabsTrigger>
          <TabsTrigger value="comprar">Comprar</TabsTrigger>
        </TabsList>

        <TabsContent value="faturamento" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Faturamento por dia</CardTitle></CardHeader>
            <CardContent className="h-80">
              {porDia.length === 0 ? (
                <div className="text-center text-muted-foreground py-12">Sem vendas no período.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={porDia}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="data" fontSize={11} />
                    <YAxis fontSize={11} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => brl(v)} />
                    <Line type="monotone" dataKey="total" stroke="#0EA5E9" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pagamentos" className="mt-4 grid md:grid-cols-2 gap-4">
          <Card className="md:col-span-2 border-amber-500/40 bg-amber-500/5">
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-amber-500" />
                <div>
                  <div className="text-sm font-medium">Total a Receber em Caderneta (Fiado)</div>
                  <div className="text-xs text-muted-foreground">Crédito a receber — não entra no caixa do dia</div>
                </div>
              </div>
              <span className="font-mono text-xl font-bold text-amber-600">{brl(totalAReceberCaderneta)}</span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Formas de pagamento</CardTitle></CardHeader>
            <CardContent className="h-72">
              {porPagamento.length === 0 ? (
                <div className="text-center text-muted-foreground py-12">Sem dados.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={porPagamento} dataKey="value" nameKey="name" outerRadius={90} label={(e) => e.name}>
                      {porPagamento.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => brl(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Detalhamento</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {porPagamento.length === 0 ? (
                <div className="text-muted-foreground text-sm">Sem dados.</div>
              ) : porPagamento.map((p, i) => (
                <div key={p.name} className="flex items-center justify-between p-2 rounded-md bg-muted/40">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-sm font-medium">{p.name}</span>
                  </div>
                  <span className="font-mono font-bold">{brl(p.value)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rankings" className="mt-4 grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" /> Top 10 produtos
              </CardTitle>
            </CardHeader>
            <CardContent className="h-80">
              {topProdutos.length === 0 ? (
                <div className="text-muted-foreground text-sm">Sem itens vendidos.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topProdutos} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis type="number" fontSize={10} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="nome" fontSize={10} width={80} />
                    <Tooltip formatter={(v: number) => brl(v)} />
                    <Bar dataKey="total" fill="#0EA5E9" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" /> Clientes VIP
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {vipClientes.length === 0 ? (
                <div className="text-muted-foreground text-sm">Sem clientes identificados nas vendas.</div>
              ) : vipClientes.map((c, i) => (
                <div key={c.nome + i} className="flex items-center justify-between p-2 rounded-md bg-muted/40">
                  <div className="flex items-center gap-2">
                    <Badge variant={i < 3 ? "default" : "secondary"} className="w-7 h-6 justify-center">
                      {i + 1}º
                    </Badge>
                    <div>
                      <div className="text-sm font-medium">{c.nome}</div>
                      <div className="text-xs text-muted-foreground">{c.compras} compras</div>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-primary">{brl(c.total)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categorias" className="mt-4 grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" /> Faturamento por categoria
              </CardTitle>
            </CardHeader>
            <CardContent>
              {porCategoria.length === 0 ? (
                <div className="text-muted-foreground text-sm py-4">Sem vendas no período.</div>
              ) : (
                <div className="space-y-1">
                  {porCategoria.map((c, i) => {
                    const pct = porCategoria[0].faturamento > 0 ? (c.faturamento / porCategoria[0].faturamento) * 100 : 0;
                    return (
                      <div key={c.nome + i} className="p-2 rounded-md bg-muted/40">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">{c.nome}</span>
                          <span className="font-mono font-bold text-primary">{brl(c.faturamento)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1">{c.qtd} unidades vendidas</div>
                      </div>
                    );
                  })}
                  <Button
                    variant="outline" size="sm" className="mt-3 w-full"
                    onClick={() => downloadCSV(`faturamento-categorias-${inicio}-${fim}.csv`,
                      porCategoria.map(c => ({ Categoria: c.nome, Faturamento: c.faturamento.toFixed(2), Unidades: c.qtd })))}
                  >
                    <Download className="h-3.5 w-3.5 mr-1.5" /> Exportar CSV
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" /> Estoque por categoria
              </CardTitle>
            </CardHeader>
            <CardContent>
              {estoquePorCategoria.length === 0 ? (
                <div className="text-muted-foreground text-sm py-4">Sem produtos cadastrados.</div>
              ) : (
                <div className="space-y-1">
                  {estoquePorCategoria.map((c, i) => (
                    <div key={c.nome + i} className="p-2 rounded-md bg-muted/40">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{c.nome}</span>
                        <span className="font-mono font-bold">{brl(c.valor)}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground flex items-center gap-2 mt-0.5">
                        <span>{c.itens} unidades em estoque</span>
                        {c.criticos > 0 && (
                          <Badge variant="destructive" className="text-[10px] py-0 h-4">
                            {c.criticos} crítico(s)
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                  <Button
                    variant="outline" size="sm" className="mt-3 w-full"
                    onClick={() => downloadCSV(`estoque-categorias.csv`,
                      estoquePorCategoria.map(c => ({
                        Categoria: c.nome, Unidades: c.itens, Valor: c.valor.toFixed(2), Criticos: c.criticos,
                      })))}
                  >
                    <Download className="h-3.5 w-3.5 mr-1.5" /> Exportar CSV
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="estoque" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-500" />
                Estoque crítico ({estoqueBaixo.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {estoqueBaixo.length === 0 ? (
                <div className="text-muted-foreground text-sm py-8 text-center">
                  Nenhum produto abaixo do mínimo. ✓
                </div>
              ) : (
                <div className="space-y-1 max-h-[500px] overflow-y-auto">
                  {estoqueBaixo.map(p => (
                    <div key={p.id} className="flex items-center justify-between p-2 rounded-md bg-muted/40">
                      <span className="text-sm font-medium">{p.nome}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant={p.estoque === 0 ? "destructive" : "secondary"}>
                          Estoque: {p.estoque}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          mín: {p.estoque_minimo ?? 0}
                        </span>
                      </div>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full"
                    onClick={() => downloadCSV("estoque-critico.csv", estoqueBaixo.map(p => ({
                      Produto: p.nome, Estoque: p.estoque, Minimo: p.estoque_minimo ?? 0,
                    })))}
                  >
                    <Download className="h-3.5 w-3.5 mr-1.5" /> Exportar lista
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comprar" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Produtos para Comprar ({estoqueBaixo.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {estoqueBaixo.length === 0 ? (
                <div className="text-muted-foreground text-sm py-8 text-center">
                  Tudo abastecido. ✓
                </div>
              ) : (
                <div className="space-y-1 max-h-[500px] overflow-y-auto">
                  {estoqueBaixo.map((p) => {
                    const min = p.estoque_minimo ?? 0;
                    const sugestao = Math.max(min * 2 - p.estoque, min || 1);
                    return (
                      <div key={p.id} className="flex items-center justify-between p-2 rounded-md bg-muted/40">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{p.nome}</div>
                          <div className="text-xs text-muted-foreground">
                            Atual: {p.estoque} · Mínimo: {min}
                          </div>
                        </div>
                        <Badge variant="default" className="ml-2">
                          Comprar ~{sugestao}
                        </Badge>
                      </div>
                    );
                  })}
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full"
                    onClick={() => downloadCSV("produtos-para-comprar.csv", estoqueBaixo.map((p) => {
                      const min = p.estoque_minimo ?? 0;
                      return {
                        Produto: p.nome,
                        EstoqueAtual: p.estoque,
                        Minimo: min,
                        SugestaoCompra: Math.max(min * 2 - p.estoque, min || 1),
                      };
                    }))}
                  >
                    <Download className="h-3.5 w-3.5 mr-1.5" /> Exportar lista para o fornecedor
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl md:text-2xl font-bold text-primary mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

type FinanceTone = "income" | "expense" | "profit" | "loss";

const FINANCE_TONES: Record<FinanceTone, { icon: string; value: string; glow: string }> = {
  income: { icon: "bg-finance-income/15 text-finance-income", value: "text-finance-income", glow: "border-finance-income/30" },
  expense: { icon: "bg-finance-expense/15 text-finance-expense", value: "text-finance-expense", glow: "border-finance-expense/30" },
  profit: { icon: "bg-finance-profit/15 text-finance-profit", value: "text-finance-profit", glow: "border-finance-profit/30" },
  loss: { icon: "bg-finance-loss/15 text-finance-loss", value: "text-finance-loss", glow: "border-finance-loss/30" },
};

function FinanceKPI({
  label, value, icon: Icon, tone, delay,
}: {
  label: string;
  value: number;
  icon: typeof ArrowUpRight;
  tone: FinanceTone;
  delay: string;
}) {
  const classes = FINANCE_TONES[tone];
  return (
    <Card className={`finance-panel finance-kpi overflow-hidden ${classes.glow}`} style={{ animationDelay: delay }}>
      <CardContent className="flex items-center gap-3 p-4 sm:p-5">
        <div className={`flex size-11 shrink-0 items-center justify-center rounded-lg ${classes.icon}`}>
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground">{label}</div>
          <div className={`mt-1 truncate text-xl font-bold md:text-2xl ${classes.value}`}>{brl(value)}</div>
        </div>
      </CardContent>
    </Card>
  );
}

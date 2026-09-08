import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../_app";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { brl, fmtDate, fmtDateOnly, formaPagamentoLabel, parseBRL } from "@/lib/format";
import { abrirWhatsApp, preAbrirJanelaWhatsApp, gerarTextoCupom, gerarTextoComprasSelecionadas, gerarTextoExtratoAberto, gerarTextoReciboPagamentoCaderneta, gerarTextoComprovanteQuitacao } from "@/lib/whatsapp";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Search, HandCoins, History, AlertCircle, AlertTriangle, ShieldAlert, CalendarClock, Pencil, ShoppingCart, Send, Receipt } from "lucide-react";

const catalogoUrl = () =>
  typeof window !== "undefined" ? `${window.location.origin}/catalogo` : undefined;


type RiscoNivel = "ok" | "atencao" | "alto" | "estourado";

function calcularRisco(saldo: number, limite: number): { nivel: RiscoNivel; pct: number } {
  const s = Number(saldo) || 0;
  const l = Number(limite) || 0;
  if (s <= 0) return { nivel: "ok", pct: 0 };
  if (l <= 0) {
    // sem limite definido: alerta apenas por valor absoluto
    if (s >= 500) return { nivel: "alto", pct: 100 };
    if (s >= 200) return { nivel: "atencao", pct: 60 };
    return { nivel: "ok", pct: 0 };
  }
  const pct = (s / l) * 100;
  if (pct >= 100) return { nivel: "estourado", pct };
  if (pct >= 80) return { nivel: "alto", pct };
  if (pct >= 50) return { nivel: "atencao", pct };
  return { nivel: "ok", pct };
}

const RISCO_STYLES: Record<RiscoNivel, { bar: string; text: string; ring: string; label: string }> = {
  ok: { bar: "bg-emerald-500", text: "text-emerald-600", ring: "", label: "Em dia" },
  atencao: { bar: "bg-amber-500", text: "text-amber-600", ring: "", label: "Atenção" },
  alto: { bar: "bg-orange-500", text: "text-orange-600", ring: "ring-1 ring-orange-300", label: "Risco alto" },
  estourado: { bar: "bg-destructive", text: "text-destructive", ring: "ring-2 ring-destructive/60", label: "Limite estourado" },
};

export const Route = createFileRoute("/_app/caderneta")({
  component: CadernetaPage,
});

type Cliente = {
  id: string;
  nome: string;
  telefone: string | null;
  saldo_devedor: number;
  limite_caderneta: number;
};

type Venda = {
  id: string;
  data_venda: string;
  total: number;
  desconto: number | null;
  observacoes: string | null;
  forma_pagamento: string;
  status: string;
  vencimento_caderneta: string | null;
  cobranca_status: string | null;
  quitacao_formas?: { forma: string; valor: number }[] | null;
};

type ItemVenda = {
  venda_id: string;
  produto_nome: string;
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
};


type Pagamento = {
  id: string;
  data_pagamento: string;
  valor: number;
  forma_pagamento: string;
  observacoes: string | null;
};

const FORMAS_PAGAMENTO = [
  { v: "dinheiro", l: "Dinheiro" },
  { v: "pix", l: "PIX" },
  { v: "cartao_debito", l: "Cartão Débito" },
  { v: "cartao_credito", l: "Cartão Crédito" },
] as const;

function todayInput() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function CadernetaPage() {
  const { user } = useAuth();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [selecionado, setSelecionado] = useState<Cliente | null>(null);
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [itensPorVenda, setItensPorVenda] = useState<Record<string, ItemVenda[]>>({});
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);


  // Dialog: pagamento
  const [pagOpen, setPagOpen] = useState(false);
  const [pagValor, setPagValor] = useState("");
  const [pagForma, setPagForma] = useState<string>("dinheiro");
  const [pagData, setPagData] = useState(todayInput());
  const [pagObs, setPagObs] = useState("");
  // Pagamento misto (múltiplas formas no mesmo recebimento)
  const [pagMisto, setPagMisto] = useState(false);
  const [pagPartes, setPagPartes] = useState<{ forma: string; valor: string }[]>([
    { forma: "dinheiro", valor: "" },
    { forma: "pix", valor: "" },
  ]);

  // Seleção manual de compras para envio no WhatsApp
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [mostrarPagas, setMostrarPagas] = useState(false);

  // Dialog: cupom individual
  const [cupomVenda, setCupomVenda] = useState<Venda | null>(null);


  // Dialog: editar vencimento
  const [vencOpen, setVencOpen] = useState(false);
  const [vencVendaId, setVencVendaId] = useState<string | null>(null);
  const [vencNovo, setVencNovo] = useState("");
  const [vencMotivo, setVencMotivo] = useState("");

  const carregarClientes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("clientes")
      .select("id, nome, telefone, saldo_devedor, limite_caderneta")
      .eq("ativo", true)
      .order("saldo_devedor", { ascending: false })
      .order("nome", { ascending: true });
    if (error) toast.error("Erro ao carregar clientes");
    setClientes(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    carregarClientes();
  }, []);

  const carregarHistorico = async (clienteId: string) => {
    const [{ data: v }, { data: p }] = await Promise.all([
      supabase
        .from("vendas")
        .select("id, data_venda, total, desconto, observacoes, forma_pagamento, status, vencimento_caderneta, cobranca_status, quitacao_formas")
        .eq("cliente_id", clienteId)
        .eq("forma_pagamento", "caderneta")
        .neq("status", "cancelada")
        .order("data_venda", { ascending: false }),
      supabase
        .from("pagamentos_caderneta")
        .select("id, data_pagamento, valor, forma_pagamento, observacoes")
        .eq("cliente_id", clienteId)
        .order("data_pagamento", { ascending: false }),
    ]);
    const lista = (v as Venda[]) ?? [];
    setVendas(lista);
    setPagamentos((p as Pagamento[]) ?? []);

    if (lista.length > 0) {
      const { data: itens } = await supabase
        .from("itens_venda")
        .select("venda_id, produto_nome, quantidade, preco_unitario, subtotal")
        .in("venda_id", lista.map((x) => x.id));
      const mapa: Record<string, ItemVenda[]> = {};
      for (const it of (itens as ItemVenda[]) ?? []) {
        (mapa[it.venda_id] ??= []).push(it);
      }
      setItensPorVenda(mapa);
    } else {
      setItensPorVenda({});
    }
  };


  const abrirCliente = async (c: Cliente) => {
    setSelecionado(c);
    setSelecionadas([]);
    await carregarHistorico(c.id);
  };

  const clientesComRisco = useMemo(
    () => clientes.map((c) => ({ ...c, risco: calcularRisco(Number(c.saldo_devedor), Number(c.limite_caderneta)) })),
    [clientes],
  );

  const ordemRisco: Record<RiscoNivel, number> = { estourado: 0, alto: 1, atencao: 2, ok: 3 };

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const base = !q
      ? clientesComRisco
      : clientesComRisco.filter(
          (c) => c.nome.toLowerCase().includes(q) || (c.telefone ?? "").includes(q),
        );
    return [...base].sort((a, b) => {
      const r = ordemRisco[a.risco.nivel] - ordemRisco[b.risco.nivel];
      if (r !== 0) return r;
      return Number(b.saldo_devedor) - Number(a.saldo_devedor);
    });
  }, [busca, clientesComRisco]);

  type LancamentoExtrato = {
    key: string;
    data: string;
    descricao: string;
    valor: number;
    tipo: "compra" | "pagamento";
    saldo: number;
  };

  const extrato = useMemo<LancamentoExtrato[]>(() => {
    const eventos = [
      ...vendas.map((v) => ({
        key: `v-${v.id}`,
        data: v.data_venda,
        descricao:
          (itensPorVenda[v.id] ?? [])
            .map((i) => `${Number(i.quantidade)}× ${i.produto_nome}`)
            .join(", ") || v.observacoes || "Compra na caderneta",
        valor: Number(v.total),
        tipo: "compra" as const,
      })),
      ...pagamentos.map((p) => ({
        key: `p-${p.id}`,
        data: p.data_pagamento,
        descricao: `Pagamento (${formaPagamentoLabel[p.forma_pagamento] ?? p.forma_pagamento})`,
        valor: Number(p.valor),
        tipo: "pagamento" as const,
      })),
    ].sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());

    let saldo = 0;
    return eventos.map((e) => {
      saldo += e.tipo === "compra" ? e.valor : -e.valor;
      return { ...e, saldo };
    });
  }, [vendas, pagamentos, itensPorVenda]);

  // Compras ainda em aberto (não quitadas)
  const vendasEmAberto = useMemo(
    () => vendas.filter((v) => v.status !== "paga" && v.cobranca_status !== "paga"),
    [vendas],
  );

  const totalSelecionado = useMemo(
    () =>
      vendasEmAberto
        .filter((v) => selecionadas.includes(v.id))
        .reduce((s, v) => s + Number(v.total), 0),
    [vendasEmAberto, selecionadas],
  );


  const totalDevedor = useMemo(
    () => clientes.reduce((s, c) => s + Number(c.saldo_devedor || 0), 0),
    [clientes],
  );
  const qtdDevedores = useMemo(
    () => clientes.filter((c) => Number(c.saldo_devedor) > 0).length,
    [clientes],
  );
  const qtdAltoRisco = useMemo(
    () => clientesComRisco.filter((c) => c.risco.nivel === "alto" || c.risco.nivel === "estourado").length,
    [clientesComRisco],
  );

  // ============ PAGAMENTO ============
  const abrirPagamento = (valorSugerido?: number) => {
    setPagValor(valorSugerido ? brl(valorSugerido) : "");
    setPagForma("dinheiro");
    setPagData(todayInput());
    setPagObs("");
    setPagMisto(false);
    setPagPartes([
      { forma: "dinheiro", valor: "" },
      { forma: "pix", valor: "" },
    ]);
    setPagOpen(true);
  };

  const num = (s: string) => parseBRL(s);
  const totalMisto = pagPartes.reduce((s, p) => s + num(p.valor), 0);

  const registrarPagamento = async () => {
    if (!selecionado) return;

    type Forma = "dinheiro" | "pix" | "cartao_debito" | "cartao_credito";
    let partes: { forma: Forma; valor: number }[];

    if (pagMisto) {
      partes = pagPartes
        .filter((p) => num(p.valor) > 0)
        .map((p) => ({ forma: p.forma as Forma, valor: num(p.valor) }));
      if (partes.length === 0) {
        toast.error("Informe pelo menos um valor");
        return;
      }
    } else {
      const valor = num(pagValor);
      if (!valor || valor <= 0) {
        toast.error("Informe um valor válido");
        return;
      }
      partes = [{ forma: pagForma as Forma, valor }];
    }

    const total = partes.reduce((s, p) => s + p.valor, 0);
    if (total > Number(selecionado.saldo_devedor) + 0.001) {
      toast.error("Valor maior que o saldo devedor");
      return;
    }

    // Baixa das compras: as selecionadas ou, se nenhuma, as mais antigas cobertas pelo valor pago
    let quitadas = vendasEmAberto.filter((v) => selecionadas.includes(v.id));
    if (quitadas.length > 0) {
      const totalCompras = quitadas.reduce((s, v) => s + Number(v.total), 0);
      if (Math.abs(total - totalCompras) > 0.009) {
        toast.error(`O pagamento deve ser exatamente ${brl(totalCompras)} para quitar as compras selecionadas`);
        return;
      }
    }
    if (quitadas.length === 0) {
      let restante = total + 0.001;
      const ordenadas = [...vendasEmAberto].sort(
        (a, b) => new Date(a.data_venda).getTime() - new Date(b.data_venda).getTime(),
      );
      const auto: typeof quitadas = [];
      for (const v of ordenadas) {
        if (Number(v.total) <= restante) {
          restante -= Number(v.total);
          auto.push(v);
        } else break;
      }
      quitadas = auto;
    }

    // Abre a janela do WhatsApp no gesto do clique (antes dos awaits)
    const waWin = selecionado.telefone ? preAbrirJanelaWhatsApp() : null;

    const dataISO = new Date(pagData).toISOString();
    const { data: baixadas, error } = await supabase.rpc("registrar_pagamento_e_quitar_caderneta", {
      _cliente: selecionado.id,
      _partes: partes,
      _compras: quitadas.map((v) => v.id),
      _data_pagamento: dataISO,
      _observacoes: pagObs || undefined,
    });
    if (error) {
      toast.error("Não foi possível concluir o pagamento: " + error.message);
      return;
    }
    if (quitadas.length > 0 && Number(baixadas) !== quitadas.length) {
      toast.error("O pagamento não foi concluído porque a compra não pôde ser marcada como paga");
      return;
    }
    toast.success(
      quitadas.length > 0
        ? `${quitadas.length} compra(s) marcada(s) como paga(s)`
        : partes.length > 1
          ? `Pagamento misto de ${brl(total)} registrado em ${partes.length} formas`
          : "Pagamento registrado e lançado no fluxo de caixa",
    );

    setPagOpen(false);
    await carregarClientes();
    const { data: atualizado } = await supabase
      .from("clientes")
      .select("id, nome, telefone, saldo_devedor, limite_caderneta")
      .eq("id", selecionado.id)
      .maybeSingle();
    const cliAtual = (atualizado as Cliente | null) ?? selecionado;
    if (atualizado) setSelecionado(atualizado as Cliente);
    await carregarHistorico(selecionado.id);
    setSelecionadas([]);

    // Recibo/comprovante pelo WhatsApp com a FORMA REAL do pagamento
    if (cliAtual.telefone) {
      const comum = {
        clienteNome: cliAtual.nome,
        data: new Date(dataISO),
        partes: partes.map((p) => ({ forma: p.forma, valor: p.valor })),
        total,
        saldoAtualizado: Number(cliAtual.saldo_devedor || 0),
        catalogoUrl: catalogoUrl(),
      };
      abrirWhatsApp(
        cliAtual.telefone,
        quitadas.length > 0
          ? gerarTextoComprovanteQuitacao({ ...comum, compras: quitadas.map(compraParaTexto) })
          : gerarTextoReciboPagamentoCaderneta(comum),
      );
    }
  };


  // ============ WHATSAPP ============
  const enviarCupomCompra = (v: Venda) => {
    if (!selecionado?.telefone) {
      toast.error("Cliente sem telefone cadastrado");
      return;
    }
    const paga = v.status === "paga" || v.cobranca_status === "paga";
    const texto = paga
      ? gerarTextoComprovanteQuitacao({
          clienteNome: selecionado.nome,
          data: new Date(),
          partes: (Array.isArray(v.quitacao_formas) ? v.quitacao_formas : []).map((p) => ({
            forma: String(p.forma),
            valor: Number(p.valor),
          })),
          total: Number(v.total),
          compras: [compraParaTexto(v)],
          saldoAtualizado: Number(selecionado.saldo_devedor),
          catalogoUrl: catalogoUrl(),
        })
      : gerarTextoCupom({
          vendaId: v.id,
          data: new Date(v.data_venda),
          clienteNome: selecionado.nome,
          itens: (itensPorVenda[v.id] ?? []).map((i) => ({
            nome: i.produto_nome,
            quantidade: Number(i.quantidade),
            preco: Number(i.preco_unitario),
          })),
          total: Number(v.total),
          formaPagamento: "caderneta",
          saldoCadernetaAtualizado: Number(selecionado.saldo_devedor),
          vencimentoCaderneta: v.vencimento_caderneta,
          cobrancaPix: true,
          catalogoUrl: catalogoUrl(),
        });
    abrirWhatsApp(selecionado.telefone, texto);
  };

  const compraParaTexto = (v: Venda) => ({
    id: v.id,
    data: new Date(v.data_venda),
    total: Number(v.total),
    vencimento: v.vencimento_caderneta,
    itens: (itensPorVenda[v.id] ?? []).map((i) => ({
      nome: i.produto_nome,
      quantidade: Number(i.quantidade),
      preco: Number(i.preco_unitario),
    })),
  });

  // Extrato compacto: só compras em aberto, agrupadas por vencimento
  const enviarCadernetaWhatsApp = () => {
    if (!selecionado?.telefone) {
      toast.error("Cliente sem telefone cadastrado");
      return;
    }
    const texto = gerarTextoExtratoAberto({
      clienteNome: selecionado.nome,
      compras: vendasEmAberto.map(compraParaTexto),
      saldoAtual: Number(selecionado.saldo_devedor),
      catalogoUrl: catalogoUrl(),
    });
    abrirWhatsApp(selecionado.telefone, texto);
  };

  const enviarComprasSelecionadas = () => {
    if (!selecionado?.telefone) {
      toast.error("Cliente sem telefone cadastrado");
      return;
    }
    const marcadas = vendasEmAberto.filter((v) => selecionadas.includes(v.id));
    if (marcadas.length === 0) {
      toast.error("Selecione ao menos uma compra");
      return;
    }
    const texto = gerarTextoComprasSelecionadas({
      clienteNome: selecionado.nome,
      compras: marcadas.map(compraParaTexto),
      saldoTotal: Number(selecionado.saldo_devedor),
      catalogoUrl: catalogoUrl(),
    });
    abrirWhatsApp(selecionado.telefone, texto);
  };



  // ============ EDITAR VENCIMENTO ============
  const abrirEditarVenc = (v: Venda) => {
    setVencVendaId(v.id);
    setVencNovo(v.vencimento_caderneta ?? new Date().toISOString().slice(0, 10));
    setVencMotivo("");
    setVencOpen(true);
  };

  const salvarNovoVenc = async () => {
    if (!vencVendaId || !vencNovo) {
      toast.error("Informe a nova data");
      return;
    }
    const { error } = await supabase.rpc("editar_vencimento_caderneta", {
      _venda: vencVendaId,
      _novo: vencNovo,
      _motivo: vencMotivo || undefined,
    });
    if (error) {
      toast.error("Erro ao alterar vencimento: " + error.message);
      return;
    }
    toast.success("Vencimento atualizado");
    setVencOpen(false);
    if (selecionado) await carregarHistorico(selecionado.id);
  };

  const diasAtraso = (venc: string | null) => {
    if (!venc) return 0;
    const d = Math.floor((Date.now() - new Date(venc + "T23:59:59").getTime()) / 86400000);
    return d > 0 ? d : 0;
  };

  return (
    <div>
      <PageHeader
        title="Caderneta"
        description="Compras a prazo geradas no PDV, extrato consolidado e baixas de pagamento"
      />

      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Total devedor</div>
            <div className="text-2xl font-bold text-destructive">
              {brl(totalDevedor)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Devedores ativos</div>
            <div className="text-2xl font-bold">{qtdDevedores}</div>
          </CardContent>
        </Card>
        <Card className={qtdAltoRisco > 0 ? "border-destructive/50 bg-destructive/5" : ""}>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <ShieldAlert className="h-3 w-3" /> Alto risco
            </div>
            <div className={`text-2xl font-bold ${qtdAltoRisco > 0 ? "text-destructive" : ""}`}>
              {qtdAltoRisco}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              ≥ 80% do limite
            </div>
          </CardContent>
        </Card>
        <Card className="hidden md:block">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Clientes cadastrados</div>
            <div className="text-2xl font-bold">{clientes.length}</div>
          </CardContent>
        </Card>
      </div>

      {qtdAltoRisco > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <strong>{qtdAltoRisco}</strong> {qtdAltoRisco === 1 ? "cliente está" : "clientes estão"} próximos ou acima do limite da caderneta.
            Revise antes de liberar novas vendas a prazo.
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-6">
        {/* Lista de clientes */}
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Clientes</CardTitle>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou telefone…"
                className="pl-9"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[60vh] overflow-y-auto divide-y">
              {loading && (
                <div className="p-6 text-center text-muted-foreground text-sm">
                  Carregando…
                </div>
              )}
              {!loading && filtrados.length === 0 && (
                <div className="p-6 text-center text-muted-foreground text-sm">
                  Nenhum cliente encontrado.
                </div>
              )}
              {filtrados.map((c) => {
                const saldo = Number(c.saldo_devedor);
                const limite = Number(c.limite_caderneta);
                const ativo = selecionado?.id === c.id;
                const risco = c.risco;
                const styles = RISCO_STYLES[risco.nivel];
                const pctClamp = Math.min(100, Math.max(0, risco.pct));
                return (
                  <button
                    key={c.id}
                    onClick={() => abrirCliente(c)}
                    className={[
                      "w-full text-left px-4 py-3 flex items-center justify-between gap-3 transition-smooth relative",
                      ativo ? "bg-accent" : "hover:bg-muted/50",
                      risco.nivel === "estourado" ? "bg-destructive/5" : "",
                    ].join(" ")}
                  >
                    <span
                      aria-hidden
                      className={[
                        "absolute left-0 top-0 bottom-0 w-1",
                        risco.nivel === "ok" ? "bg-transparent" : styles.bar,
                      ].join(" ")}
                    />
                    <div className="min-w-0 pl-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{c.nome}</span>
                        {(risco.nivel === "alto" || risco.nivel === "estourado") && (
                          <Badge
                            variant={risco.nivel === "estourado" ? "destructive" : "outline"}
                            className={[
                              "text-[10px] px-1.5 py-0 h-5 gap-1",
                              risco.nivel === "alto" ? "border-orange-400 text-orange-600" : "",
                            ].join(" ")}
                          >
                            <AlertTriangle className="h-3 w-3" />
                            {styles.label}
                          </Badge>
                        )}
                        {risco.nivel === "atencao" && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-amber-400 text-amber-600">
                            {styles.label}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {c.telefone || "Sem telefone"}
                      </div>
                      {limite > 0 && saldo > 0 && (
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="h-1.5 flex-1 max-w-[140px] rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full ${styles.bar} transition-all`}
                              style={{ width: `${pctClamp}%` }}
                            />
                          </div>
                          <span className={`text-[10px] font-medium ${styles.text}`}>
                            {Math.round(risco.pct)}%
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div
                        className={[
                          "font-semibold",
                          saldo > 0 ? styles.text : "text-muted-foreground",
                        ].join(" ")}
                      >
                        {brl(saldo)}
                      </div>
                      {limite > 0 && (
                        <div className="text-[10px] text-muted-foreground">
                          limite {brl(limite)}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Detalhes */}
        <div>
          {!selecionado && (
            <Card>
              <CardContent className="p-10 text-center text-muted-foreground">
                Selecione um cliente à esquerda para ver as compras da caderneta,
                o extrato consolidado e registrar pagamentos.

              </CardContent>
            </Card>
          )}

          {selecionado && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <CardTitle>{selecionado.nome}</CardTitle>
                    <div className="text-sm text-muted-foreground mt-1">
                      {selecionado.telefone || "Sem telefone"}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge
                        variant={
                          Number(selecionado.saldo_devedor) > 0
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        Saldo: {brl(selecionado.saldo_devedor)}
                      </Badge>
                      {Number(selecionado.limite_caderneta) > 0 && (
                        <Badge variant="outline">
                          Limite {brl(selecionado.limite_caderneta)}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" asChild>
                      <Link to="/pdv">
                        <ShoppingCart className="h-4 w-4 mr-1" /> Nova compra no PDV
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={enviarCadernetaWhatsApp}
                      disabled={!selecionado.telefone}
                      title={!selecionado.telefone ? "Cliente sem telefone" : "Enviar caderneta"}
                    >
                      <Send className="h-4 w-4 mr-1" /> Enviar Extrato (em aberto)
                    </Button>
                    <Button
                      onClick={() => abrirPagamento()}
                      disabled={Number(selecionado.saldo_devedor) <= 0}
                    >
                      <HandCoins className="h-4 w-4 mr-1" /> Registrar pagamento
                    </Button>
                  </div>

                </div>

                {Number(selecionado.limite_caderneta) > 0 &&
                  Number(selecionado.saldo_devedor) >=
                    Number(selecionado.limite_caderneta) && (
                    <div className="mt-3 flex items-start gap-2 text-xs bg-destructive/10 text-destructive rounded-md p-2">
                      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                      Cliente atingiu o limite da caderneta.
                    </div>
                  )}

                {Number(selecionado.saldo_devedor) > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        abrirPagamento(Number(selecionado.saldo_devedor))
                      }
                    >
                      Quitar total ({brl(selecionado.saldo_devedor)})
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        abrirPagamento(Number(selecionado.saldo_devedor) / 2)
                      }
                    >
                      Pagar 50%
                    </Button>
                  </div>
                )}
              </CardHeader>

              <CardContent>
                <Tabs defaultValue="vendas">
                  <TabsList>
                    <TabsTrigger value="vendas">
                      <History className="h-4 w-4 mr-1" /> Compras
                    </TabsTrigger>
                    <TabsTrigger value="pagamentos">Pagamentos</TabsTrigger>
                    <TabsTrigger value="extrato">Extrato</TabsTrigger>
                  </TabsList>

                  <TabsContent value="vendas" className="mt-4">
                    {vendas.length === 0 ? (
                      <div className="text-sm text-muted-foreground py-6 text-center">
                        Nenhuma compra na caderneta. Registre a venda no PDV escolhendo o pagamento
                        "Caderneta".
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {vendasEmAberto.length > 0 && (
                          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2">
                            <label className="flex items-center gap-2 text-xs">
                              <Checkbox
                                checked={
                                  selecionadas.length > 0 &&
                                  selecionadas.length === vendasEmAberto.length
                                }
                                onCheckedChange={(c) =>
                                  setSelecionadas(c ? vendasEmAberto.map((x) => x.id) : [])
                                }
                              />
                              Selecionar todas em aberto
                            </label>
                            <span className="text-xs text-muted-foreground">
                              {selecionadas.length} selecionada(s) · {brl(totalSelecionado)}
                            </span>
                            <Button
                              size="sm"
                              className="ml-auto"
                              onClick={enviarComprasSelecionadas}
                              disabled={selecionadas.length === 0 || !selecionado.telefone}
                              title={!selecionado.telefone ? "Cliente sem telefone" : undefined}
                            >
                              <Send className="h-4 w-4 mr-1" /> Enviar Compras Selecionadas no WhatsApp
                            </Button>
                          </div>
                        )}
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Checkbox
                            checked={mostrarPagas}
                            onCheckedChange={(c) => setMostrarPagas(!!c)}
                          />
                          Mostrar compras já pagas
                        </label>
                        {(mostrarPagas ? vendas : vendasEmAberto).map((v) => {
                          const atraso = diasAtraso(v.vencimento_caderneta);
                          const paga = v.status === "paga" || v.cobranca_status === "paga";
                          const statusLabel = paga ? "Paga" : atraso > 0 ? "Vencida" : "Aberta";
                          const statusVar: "default" | "destructive" | "secondary" =
                            paga ? "secondary" : atraso > 0 ? "destructive" : "default";
                          const itens = itensPorVenda[v.id] ?? [];
                          const marcada = selecionadas.includes(v.id);
                          return (
                            <div
                              key={v.id}
                              className={`rounded-md border p-3 ${marcada ? "ring-1 ring-primary bg-primary/5" : ""}`}
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                {!paga && (
                                  <Checkbox
                                    checked={marcada}
                                    onCheckedChange={(c) =>
                                      setSelecionadas((prev) =>
                                        c ? [...prev, v.id] : prev.filter((x) => x !== v.id),
                                      )
                                    }
                                    aria-label="Selecionar compra para envio"
                                  />
                                )}
                                <Badge
                                  variant={statusVar}
                                  className={paga ? "bg-emerald-600 text-white hover:bg-emerald-600" : undefined}
                                >
                                  {statusLabel}
                                </Badge>
                                <span className="text-sm font-medium">{fmtDate(v.data_venda)}</span>
                                <span className="text-xs text-muted-foreground">
                                  Vencimento:{" "}
                                  {v.vencimento_caderneta ? fmtDateOnly(v.vencimento_caderneta) : "—"}
                                  {!paga && atraso > 0 && (
                                    <span className="text-destructive">
                                      {" "}· {atraso} {atraso === 1 ? "dia em atraso" : "dias em atraso"}
                                    </span>
                                  )}
                                </span>
                                <span className="ml-auto font-semibold">{brl(v.total)}</span>
                              </div>


                              <div className="mt-2 space-y-1">
                                {itens.length === 0 ? (
                                  <div className="text-xs text-muted-foreground">Sem itens registrados.</div>
                                ) : (
                                  itens.map((i, idx) => (
                                    <div key={idx} className="flex justify-between text-xs">
                                      <span>
                                        {Number(i.quantidade)}× {i.produto_nome}
                                        <span className="text-muted-foreground">
                                          {" "}({brl(i.preco_unitario)} un.)
                                        </span>
                                      </span>
                                      <span>{brl(i.subtotal)}</span>
                                    </div>
                                  ))
                                )}
                                {Number(v.desconto) > 0 && (
                                  <div className="flex justify-between text-xs text-emerald-600">
                                    <span>Desconto</span>
                                    <span>− {brl(v.desconto)}</span>
                                  </div>
                                )}
                              </div>

                              {v.observacoes && (
                                <div className="mt-2 text-xs text-muted-foreground">Obs.: {v.observacoes}</div>
                              )}

                              <div className="mt-2 flex flex-wrap gap-2">
                                <Button size="sm" variant="outline" onClick={() => setCupomVenda(v)}>
                                  <Receipt className="h-4 w-4 mr-1" /> Ver cupom
                                </Button>
                                {!paga && (
                                  <Button size="sm" variant="ghost" onClick={() => abrirEditarVenc(v)}>
                                    <Pencil className="h-4 w-4 mr-1" /> Vencimento
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="pagamentos" className="mt-4">
                    {pagamentos.length === 0 ? (
                      <div className="text-sm text-muted-foreground py-6 text-center">
                        Nenhum pagamento registrado.
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Forma</TableHead>
                            <TableHead>Obs.</TableHead>
                            <TableHead className="text-right">Valor</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pagamentos.map((p) => (
                            <TableRow key={p.id}>
                              <TableCell className="whitespace-nowrap">
                                {fmtDateOnly(p.data_pagamento)}
                              </TableCell>
                              <TableCell>
                                {formaPagamentoLabel[p.forma_pagamento] ??
                                  p.forma_pagamento}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {p.observacoes || "—"}
                              </TableCell>
                              <TableCell className="text-right font-medium text-emerald-600">
                                {brl(p.valor)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </TabsContent>

                  <TabsContent value="extrato" className="mt-4">
                    <div className="text-xs text-muted-foreground mb-2">
                      Saldo anterior: <strong>{brl(0)}</strong>
                    </div>
                    {extrato.length === 0 ? (
                      <div className="text-sm text-muted-foreground py-6 text-center">
                        Sem lançamentos na caderneta.
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Lançamento</TableHead>
                            <TableHead className="text-right">Valor</TableHead>
                            <TableHead className="text-right">Saldo</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {extrato.map((l) => (
                            <TableRow key={l.key}>
                              <TableCell className="whitespace-nowrap text-xs">
                                {fmtDateOnly(l.data)}
                              </TableCell>
                              <TableCell className="text-xs">{l.descricao}</TableCell>
                              <TableCell
                                className={`text-right text-xs font-medium ${
                                  l.tipo === "compra" ? "text-destructive" : "text-emerald-600"
                                }`}
                              >
                                {l.tipo === "compra" ? "+" : "−"} {brl(l.valor)}
                              </TableCell>
                              <TableCell className="text-right text-xs font-semibold">
                                {brl(l.saldo)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                    <div className="mt-3 flex justify-between items-center border-t pt-3">
                      <span className="text-sm text-muted-foreground">Saldo atual</span>
                      <span className="text-lg font-bold text-destructive">
                        {brl(selecionado.saldo_devedor)}
                      </span>
                    </div>
                  </TabsContent>
                </Tabs>

              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Dialog: registrar pagamento */}
      <Dialog open={pagOpen} onOpenChange={setPagOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Registrar pagamento — {selecionado?.nome}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={pagMisto} onCheckedChange={(c) => setPagMisto(!!c)} />
              Pagamento misto (mais de uma forma)
            </label>

            {!pagMisto ? (
              <>
                <div>
                  <Label>Valor recebido</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={pagValor}
                    onChange={(e) => setPagValor(e.target.value)}
                    onBlur={() => {
                      const valor = parseBRL(pagValor);
                      setPagValor(valor > 0 ? brl(valor) : "");
                    }}
                    placeholder="R$ 0,00"
                    autoFocus
                  />
                  <div className="text-xs text-muted-foreground mt-1">
                    Saldo atual: {brl(selecionado?.saldo_devedor ?? 0)}
                  </div>
                </div>
                <div>
                  <Label>Forma de pagamento</Label>
                  <Select value={pagForma} onValueChange={setPagForma}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FORMAS_PAGAMENTO.map((f) => (
                        <SelectItem key={f.v} value={f.v}>
                          {f.l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Label>Formas e valores</Label>
                {pagPartes.map((p, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <Select
                      value={p.forma}
                      onValueChange={(val) =>
                        setPagPartes((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, forma: val } : x)),
                        )
                      }
                    >
                      <SelectTrigger className="w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FORMAS_PAGAMENTO.map((f) => (
                          <SelectItem key={f.v} value={f.v}>
                            {f.l}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="R$ 0,00"
                      value={p.valor}
                      onChange={(e) =>
                        setPagPartes((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, valor: e.target.value } : x)),
                        )
                      }
                      onBlur={() =>
                        setPagPartes((prev) =>
                          prev.map((x, i) => {
                            if (i !== idx) return x;
                            const valor = parseBRL(x.valor);
                            return { ...x, valor: valor > 0 ? brl(valor) : "" };
                          }),
                        )
                      }
                    />
                    {pagPartes.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPagPartes((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        ✕
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPagPartes((prev) => [...prev, { forma: "dinheiro", valor: "" }])}
                >
                  + Adicionar forma
                </Button>
                <div className="flex justify-between text-sm border-t pt-2">
                  <span className="text-muted-foreground">
                    Saldo atual: {brl(selecionado?.saldo_devedor ?? 0)}
                  </span>
                  <span className="font-semibold">Total: {brl(totalMisto)}</span>
                </div>
              </div>
            )}

            <div>
              <Label>Data do pagamento</Label>
              <Input
                type="datetime-local"
                value={pagData}
                onChange={(e) => setPagData(e.target.value)}
              />
            </div>


            <div>
              <Label>Observações</Label>
              <Textarea
                rows={2}
                value={pagObs}
                onChange={(e) => setPagObs(e.target.value)}
                placeholder="Opcional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPagOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={registrarPagamento}>Confirmar pagamento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: cupom individual da compra */}
      <Dialog open={!!cupomVenda} onOpenChange={(o) => !o && setCupomVenda(null)}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" /> Cupom da compra
            </DialogTitle>
          </DialogHeader>
          {cupomVenda && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-muted-foreground">Data</div>
                  {fmtDate(cupomVenda.data_venda)}
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Vencimento</div>
                  {cupomVenda.vencimento_caderneta ? fmtDateOnly(cupomVenda.vencimento_caderneta) : "—"}
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Cliente</div>
                  {selecionado?.nome}
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Compra</div>
                  #{cupomVenda.id.slice(0, 8)}
                </div>
              </div>
              <div className="border-t pt-2 space-y-1">
                {(itensPorVenda[cupomVenda.id] ?? []).map((i, idx) => (
                  <div key={idx} className="flex justify-between text-xs">
                    <span>
                      {Number(i.quantidade)}× {i.produto_nome}
                      <span className="text-muted-foreground"> ({brl(i.preco_unitario)} un.)</span>
                    </span>
                    <span>{brl(i.subtotal)}</span>
                  </div>
                ))}
              </div>
              {Number(cupomVenda.desconto) > 0 && (
                <div className="flex justify-between text-xs text-emerald-600">
                  <span>Desconto</span>
                  <span>− {brl(cupomVenda.desconto)}</span>
                </div>
              )}
              <div className="border-t pt-2 flex justify-between font-semibold">
                <span>Total</span>
                <span>{brl(cupomVenda.total)}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCupomVenda(null)}>Fechar</Button>
            <Button
              onClick={() => cupomVenda && enviarCupomCompra(cupomVenda)}
              disabled={!selecionado?.telefone}
              title={!selecionado?.telefone ? "Cliente sem telefone" : "Enviar cupom"}
            >
              <Send className="h-4 w-4 mr-1" /> Enviar no WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Dialog: editar vencimento */}
      <Dialog open={vencOpen} onOpenChange={setVencOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5" /> Alterar vencimento
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nova data de vencimento</Label>
              <Input
                type="date"
                value={vencNovo}
                onChange={(e) => setVencNovo(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <Label>Motivo da alteração</Label>
              <Textarea
                rows={2}
                value={vencMotivo}
                onChange={(e) => setVencMotivo(e.target.value)}
                placeholder="Ex.: Cliente pediu mais prazo"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVencOpen(false)}>Cancelar</Button>
            <Button onClick={salvarNovoVenc}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

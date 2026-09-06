import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "../_app";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";

import { brl, formaPagamentoLabel, STORE_NAME, maskBRL, parseBRL } from "@/lib/format";
import { precoVigente } from "@/lib/preco";
import { toast } from "sonner";
import {
  Search, Plus, Minus, Trash2, ShoppingCart, X, Check, UserPlus,
  Banknote, CreditCard, Smartphone, Notebook, Clock, MessageCircle, AlertTriangle, DoorOpen,
} from "lucide-react";
import { validateDocumento, validateTelefone, maskDocumento, maskTelefone } from "@/lib/validators";
import { gerarTextoCupom, abrirWhatsApp } from "@/lib/whatsapp";
import { BarcodeScanner, beep } from "@/components/BarcodeScanner";
import { ScanBarcode } from "lucide-react";

export const Route = createFileRoute("/_app/pdv")({
  component: PDVPage,
});

type Produto = {
  id: string;
  nome: string;
  preco: number;
  estoque: number;
  imagem_url: string | null;
  categoria_id: string | null;
  codigo_barras: string | null;
  ativo: boolean;
  preco_promocional: number | null;
  promo_inicio: string | null;
  promo_fim: string | null;
};
type Categoria = { id: string; nome: string };
type Cliente = { id: string; nome: string; telefone: string | null; saldo_devedor: number; limite_caderneta: number; saldo_credito: number };
type CartItem = {
  produto_id: string;
  nome: string;
  preco: number;
  quantidade: number;
  estoque: number;
  categoria_id: string | null;
};
type Forma = "dinheiro" | "pix" | "cartao_debito" | "cartao_credito" | "caderneta";
type SplitPag = { forma: Forma; valor: number };

const FORMAS: { value: Forma; label: string; icon: typeof Banknote }[] = [
  { value: "dinheiro", label: "Dinheiro", icon: Banknote },
  { value: "pix", label: "PIX", icon: Smartphone },
  { value: "cartao_debito", label: "Cartão Débito", icon: CreditCard },
  { value: "cartao_credito", label: "Cartão Crédito", icon: CreditCard },
  { value: "caderneta", label: "A Prazo (Caderneta)", icon: Notebook },
];

function PDVPage() {
  const { user, nomeCompleto, role } = useAuth();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("todas");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [clienteId, setClienteId] = useState<string>("");
  const [forma, setForma] = useState<Forma>("dinheiro");
  const [observacoes, setObservacoes] = useState("");
  const [valorRecebido, setValorRecebido] = useState<string>("");
  const [cliOpen, setCliOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [showNovoCliente, setShowNovoCliente] = useState(false);
  const [novoCli, setNovoCli] = useState({ nome: "", telefone: "", documento: "", limite_caderneta: "" });
  const [novoCliErr, setNovoCliErr] = useState<{ nome?: string; telefone?: string; documento?: string }>({});
  const [savingCli, setSavingCli] = useState(false);
  const [aberturaCaixa] = useState<Date>(() => new Date());
  const [sessaoCaixaId, setSessaoCaixaId] = useState<string | null>(null);
  const [descontoStr, setDescontoStr] = useState("");
  const [descontoPct, setDescontoPct] = useState(false);
  const [taxaStr, setTaxaStr] = useState("");
  const [usarCreditoStr, setUsarCreditoStr] = useState("");
  const [splits, setSplits] = useState<SplitPag[]>([]);
  const [showSplit, setShowSplit] = useState(false);
  const [splitForma, setSplitForma] = useState<Forma>("dinheiro");
  const [splitValor, setSplitValor] = useState("");
  const [cupomVenda, setCupomVenda] = useState<null | {
    cliente: Cliente;
    vendaId: string;
    texto: string;
    saldoAtualizado: number | null;
  }>(null);
  const [estoqueZero, setEstoqueZero] = useState<Produto | null>(null);
  const [reposQtd, setReposQtd] = useState("");
  const [repondo, setRepondo] = useState(false);
  const [pulseId, setPulseId] = useState<string | null>(null);
  const [scanVenda, setScanVenda] = useState(false);
  const buscaRef = useRef<HTMLInputElement>(null);
  const catalogoUrl = typeof window !== "undefined" ? `${window.location.origin}/` : "";

  const loadData = async () => {
    setLoading(true);
    const [{ data: p }, { data: c }, { data: cl }, { data: sess }] = await Promise.all([
      supabase.from("produtos").select("id,nome,preco,estoque,imagem_url,categoria_id,codigo_barras,ativo,preco_promocional,promo_inicio,promo_fim").eq("ativo", true).order("nome"),
      supabase.from("categorias").select("id,nome").eq("ativa", true).order("ordem"),
      supabase.from("clientes").select("id,nome,telefone,saldo_devedor,limite_caderneta,saldo_credito").eq("ativo", true).order("nome"),
      user ? supabase.from("caixa_sessoes").select("id").eq("operador_id", user.id).eq("status", "aberta").maybeSingle() : Promise.resolve({ data: null } as any),
    ]);
    setProdutos((p as Produto[]) || []);
    setCategorias((c as Categoria[]) || []);
    setClientes((cl as Cliente[]) || []);
    setSessaoCaixaId((sess as any)?.id || null);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [user]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return produtos.filter((p) => {
      if (catFilter !== "todas" && p.categoria_id !== catFilter) return false;
      if (q && !p.nome.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [produtos, search, catFilter]);

  const subtotal = useMemo(
    () => cart.reduce((s, i) => s + i.preco * i.quantidade, 0),
    [cart],
  );
  const descontoNum = useMemo(() => {
    const v = parseFloat((descontoStr || "0").replace(",", ".")) || 0;
    if (descontoPct) return Math.min(subtotal, subtotal * (v / 100));
    return Math.min(subtotal, v);
  }, [descontoStr, descontoPct, subtotal]);
  const taxaNum = parseFloat((taxaStr || "0").replace(",", ".")) || 0;
  const creditoUsado = useMemo(() => {
    const v = parseFloat((usarCreditoStr || "0").replace(",", ".")) || 0;
    return Math.max(0, v);
  }, [usarCreditoStr]);
  const total = useMemo(
    () => Math.max(0, subtotal - descontoNum + taxaNum - creditoUsado),
    [subtotal, descontoNum, taxaNum, creditoUsado],
  );
  const splitsTotal = useMemo(() => splits.reduce((s, p) => s + p.valor, 0), [splits]);

  const addToCart = (p: Produto, ignoreStock = false) => {
    if (p.estoque <= 0 && !ignoreStock) {
      setEstoqueZero(p);
      setReposQtd("");
      return;
    }
    setPulseId(p.id);
    setTimeout(() => setPulseId((id) => (id === p.id ? null : id)), 250);
    setCart((cur) => {
      const ex = cur.find((i) => i.produto_id === p.id);
      if (ex) {
        if (!ignoreStock && ex.quantidade + 1 > p.estoque) { toast.error("Estoque insuficiente"); return cur; }
        return cur.map((i) => i.produto_id === p.id ? { ...i, quantidade: i.quantidade + 1 } : i);
      }
      return [...cur, {
        produto_id: p.id, nome: p.nome, preco: precoVigente(p).preco,
        quantidade: 1, estoque: ignoreStock ? Math.max(p.estoque, 9999) : p.estoque, categoria_id: p.categoria_id,
      }];
    });
  };

  const biparCodigo = (codigo: string) => {
    const cod = codigo.trim();
    if (!cod) return;
    const p = produtos.find((x) => (x.codigo_barras ?? "").trim() === cod);
    if (!p) {
      toast.error("Produto não cadastrado", { description: `Código ${cod}` });
      return;
    }
    beep();
    addToCart(p);
    toast.success(`${p.nome} adicionado`);
    setSearch("");
    buscaRef.current?.focus();
  };

  const venderAssimMesmo = () => {
    if (!estoqueZero) return;
    addToCart(estoqueZero, true);
    toast.warning("Estoque ficará negativo — ajuste depois em Produtos");
    setEstoqueZero(null);
  };

  const abastecerAgora = async () => {
    if (!estoqueZero) return;
    const qtd = parseInt(reposQtd);
    if (!qtd || qtd <= 0) { toast.error("Informe a quantidade recebida"); return; }
    setRepondo(true);
    const novoEstoque = estoqueZero.estoque + qtd;
    const { error } = await supabase.from("produtos").update({ estoque: novoEstoque }).eq("id", estoqueZero.id);
    setRepondo(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Abastecido: +${qtd} un.`);
    const atualizado = { ...estoqueZero, estoque: novoEstoque };
    setProdutos((cur) => cur.map((p) => p.id === atualizado.id ? atualizado : p));
    addToCart(atualizado);
    setEstoqueZero(null);
  };

  const changeQty = (id: string, delta: number) => {
    setCart((cur) => cur.flatMap((i) => {
      if (i.produto_id !== id) return [i];
      const next = i.quantidade + delta;
      if (next <= 0) return [];
      if (next > i.estoque) { toast.error("Estoque insuficiente"); return [i]; }
      return [{ ...i, quantidade: next }];
    }));
  };

  const removeItem = (id: string) =>
    setCart((cur) => cur.filter((i) => i.produto_id !== id));

  const clearCart = () => {
    setCart([]); setClienteId(""); setObservacoes(""); setValorRecebido("");
    setDescontoStr(""); setTaxaStr(""); setUsarCreditoStr(""); setSplits([]);
  };

  const cliente = clientes.find((c) => c.id === clienteId);
  const troco = forma === "dinheiro" && valorRecebido && splits.length === 0
    ? Math.max(0, parseFloat(valorRecebido.replace(",", ".")) - total)
    : 0;

  const openCheckout = () => {
    if (cart.length === 0) { toast.error("Carrinho vazio"); return; }
    setShowCheckout(true);
  };

  const addSplit = () => {
    const v = parseFloat((splitValor || "0").replace(",", ".")) || 0;
    if (v <= 0) return toast.error("Informe valor");
    if (splitsTotal + v > total + 0.001) return toast.error("Excede o total");
    setSplits((cur) => [...cur, { forma: splitForma, valor: v }]);
    setSplitValor("");
  };
  const removeSplit = (idx: number) => setSplits((cur) => cur.filter((_, i) => i !== idx));

  const finalizar = async () => {
    if (cart.length === 0) return;
    if (creditoUsado > 0 && !cliente) return toast.error("Selecione cliente para usar crédito");
    if (creditoUsado > 0 && cliente && creditoUsado > Number(cliente.saldo_credito)) {
      return toast.error("Crédito insuficiente do cliente");
    }
    const usandoSplit = splits.length > 0;
    if (usandoSplit && Math.abs(splitsTotal - total) > 0.01) {
      return toast.error(`Pagamentos somam ${brl(splitsTotal)} mas total é ${brl(total)}`);
    }
    const formasUsadas: Forma[] = usandoSplit ? splits.map((s) => s.forma) : [forma];
    const usaCaderneta = formasUsadas.includes("caderneta");
    if (usaCaderneta && !clienteId) return toast.error("Selecione cliente para caderneta");
    const valorCaderneta = usandoSplit ? splits.filter((s) => s.forma === "caderneta").reduce((a, s) => a + s.valor, 0) : (forma === "caderneta" ? total : 0);
    if (usaCaderneta && cliente && Number(cliente.limite_caderneta) > 0) {
      const novoSaldo = Number(cliente.saldo_devedor) + valorCaderneta;
      if (novoSaldo > Number(cliente.limite_caderneta)) {
        return toast.error(`Limite excedido. Saldo ficaria em ${brl(novoSaldo)}`);
      }
    }

    setSaving(true);
    try {
      const agora = new Date().toISOString();
      const formaPrincipal: Forma = usandoSplit
        ? (splits.find((s) => s.forma !== "caderneta")?.forma || splits[0].forma)
        : forma;
      const statusVenda = (formaPrincipal === "caderneta" && !usandoSplit) ? "pendente" : "paga";

      // Debita crédito do cliente antes (se houver)
      if (creditoUsado > 0 && cliente) {
        const { error: cErr } = await supabase.rpc("usar_credito_cliente", {
          _cliente: cliente.id, _valor: creditoUsado,
        });
        if (cErr) throw cErr;
      }

      const vencCaderneta = usaCaderneta
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
        : null;

      const { data: venda, error: vErr } = await supabase
        .from("vendas")
        .insert({
          cliente_id: clienteId || null,
          atendente_id: user?.id ?? null,
          forma_pagamento: formaPrincipal,
          total,
          desconto: descontoNum,
          taxa: taxaNum,
          credito_usado: creditoUsado,
          sessao_caixa_id: sessaoCaixaId,
          observacoes: observacoes || null,
          status: statusVenda,
          data_venda: agora,
          vencimento_caderneta: vencCaderneta,
          cobranca_status: usaCaderneta ? 'aberta' : 'paga',
        })
        .select("id")
        .single();
      if (vErr || !venda) throw vErr ?? new Error("Falha ao criar venda");

      const itens = cart.map((i) => ({
        venda_id: venda.id,
        produto_id: i.produto_id,
        produto_nome: i.nome,
        categoria_id: i.categoria_id,
        quantidade: i.quantidade,
        preco_unitario: i.preco,
        subtotal: i.preco * i.quantidade,
      }));
      const { error: iErr } = await supabase.from("itens_venda").insert(itens);
      if (iErr) throw iErr;

      if (usandoSplit) {
        const pgs = splits.map((s) => ({ venda_id: venda.id, forma_pagamento: s.forma, valor: s.valor }));
        const { error: pErr } = await supabase.from("pagamentos_venda").insert(pgs);
        if (pErr) throw pErr;
      }

      toast.success("Venda finalizada!");

      if (cliente) {
        const saldoAtualizado = usaCaderneta ? Number(cliente.saldo_devedor) + valorCaderneta : null;
        const splitTxt = usandoSplit
          ? splits.map((s) => `${formaPagamentoLabel[s.forma] ?? s.forma}: ${brl(s.valor)}`).join(" • ")
          : (formaPagamentoLabel[forma] ?? forma);
        const extras: string[] = [];
        if (descontoNum > 0) extras.push(`Desconto: −${brl(descontoNum)}`);
        if (taxaNum > 0) extras.push(`Taxa: +${brl(taxaNum)}`);
        if (creditoUsado > 0) extras.push(`Crédito usado: −${brl(creditoUsado)}`);
        const obsExtra = extras.length ? `\n${extras.join(" | ")}` : "";
        const texto = gerarTextoCupom({
          vendaId: venda.id,
          data: new Date(),
          clienteNome: cliente.nome,
          itens: cart.map((i) => ({ nome: i.nome, quantidade: i.quantidade, preco: i.preco })),
          total,
          formaPagamento: splitTxt,
          saldoCadernetaAtualizado: saldoAtualizado,
          catalogoUrl,
        });
        setCupomVenda({
          cliente: cliente as Cliente,
          vendaId: venda.id,
          texto: texto + obsExtra,
          saldoAtualizado,
        });
      }

      clearCart();
      setShowCheckout(false);
      setShowCart(false);
      loadData();
    } catch (e: any) {
      toast.error(e.message || "Erro ao finalizar venda");
    } finally {
      setSaving(false);
    }
  };

  const enviarCupomWhatsApp = async () => {
    if (!cupomVenda) return;
    abrirWhatsApp(cupomVenda.cliente.telefone, cupomVenda.texto);
    // Salva no histórico
    const { error } = await supabase.from("cupons_enviados").insert({
      cliente_id: cupomVenda.cliente.id,
      venda_id: cupomVenda.vendaId,
      conteudo: cupomVenda.texto,
      atendente_id: user?.id ?? null,
    });
    if (error) console.warn("Falha ao salvar cupom:", error.message);
    else toast.success("Cupom registrado no histórico do cliente");
    setCupomVenda(null);
  };

  const cadastrarCliente = async () => {
    const errs: typeof novoCliErr = {};
    if (!novoCli.nome.trim()) errs.nome = "Informe o nome";
    const docErr = validateDocumento(novoCli.documento);
    if (docErr) errs.documento = docErr;
    const telErr = validateTelefone(novoCli.telefone);
    if (telErr) errs.telefone = telErr;
    setNovoCliErr(errs);
    if (Object.keys(errs).length > 0) {
      toast.error("Verifique os campos destacados");
      return;
    }
    setSavingCli(true);
    try {
      const limite = parseFloat((novoCli.limite_caderneta || "0").replace(",", ".")) || 0;
      const { data, error } = await supabase
        .from("clientes")
        .insert({
          nome: novoCli.nome.trim(),
          telefone: novoCli.telefone.trim() || null,
          documento: novoCli.documento.trim() || null,
          limite_caderneta: limite,
        })
        .select("id,nome,telefone,saldo_devedor,limite_caderneta")
        .single();
      if (error || !data) throw error ?? new Error("Falha ao cadastrar");
      setClientes((cur) => [...cur, data as Cliente].sort((a, b) => a.nome.localeCompare(b.nome)));
      setClienteId(data.id);
      toast.success("Cliente cadastrado!");
      setShowNovoCliente(false);
      setNovoCli({ nome: "", telefone: "", documento: "", limite_caderneta: "" });
      setNovoCliErr({});
    } catch (e: any) {
      toast.error(e.message || "Erro ao cadastrar cliente");
    } finally {
      setSavingCli(false);
    }
  };

  const horaAbertura = aberturaCaixa.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dataAbertura = aberturaCaixa.toLocaleDateString("pt-BR");
  const operadorNome = nomeCompleto || user?.email || "Operador";

  if (!loading && !sessaoCaixaId) {
    return (
      <div>
        <PageHeader title="PDV — Caixa" description="Registre vendas à vista ou na caderneta" />
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="p-6 text-center space-y-4">
            <AlertTriangle className="h-10 w-10 text-amber-600 mx-auto" />
            <div>
              <h2 className="text-lg font-bold text-amber-900">Caixa fechado</h2>
              <p className="text-sm text-amber-800 mt-1">
                Atenção: É necessário realizar a Abertura de Caixa (Troco Inicial) antes de iniciar as vendas.
              </p>
            </div>
            <Link to="/caixa">
              <Button variant="sky" size="lg">
                <DoorOpen className="h-4 w-4 mr-2" /> Abrir Caixa
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="PDV — Caixa"
        description="Registre vendas à vista ou na caderneta"
        actions={
          <Button
            onClick={() => setShowCart(true)}
            className="lg:hidden relative"
            variant="default"
          >
            <ShoppingCart className="h-4 w-4 mr-2" />
            Carrinho
            {cart.length > 0 && (
              <Badge className="ml-2 bg-brand-sky text-brand-navy">{cart.length}</Badge>
            )}
          </Button>
        }
      />

      {/* Barra do operador / abertura do caixa */}
      <Card className="mb-4 bg-gradient-card border-brand-sky/30">
        <CardContent className="p-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
              {operadorNome.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Operador(a)</div>
              <div className="font-semibold leading-tight">{operadorNome}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="text-xs text-muted-foreground">Caixa aberto em</div>
              <div className="font-semibold leading-tight">{dataAbertura} às {horaAbertura}</div>
            </div>
          </div>
          {role && (
            <Badge variant="secondary" className="ml-auto capitalize">{role}</Badge>
          )}
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-[1fr_380px] gap-4">
        {/* Produtos */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={buscaRef}
                autoFocus
                placeholder="Buscar produto ou bipar código…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && search.trim()) {
                    e.preventDefault();
                    biparCodigo(search);
                  }
                }}
                className="pl-9"
              />
            </div>
            <Button type="button" variant="secondary" onClick={() => setScanVenda(true)} title="Bipar código de barras">
              <ScanBarcode className="h-5 w-5" /> Bipar
            </Button>
            <Select value={catFilter} onValueChange={setCatFilter}>
              <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas categorias</SelectItem>
                {categorias.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">Carregando…</CardContent></Card>
          ) : filtered.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              Nenhum produto encontrado. Cadastre produtos em <strong>Produtos</strong>.
            </CardContent></Card>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {filtered.map((p) => {
                const inCart = cart.find((i) => i.produto_id === p.id)?.quantidade ?? 0;
                const pulse = pulseId === p.id;
                const vig = precoVigente(p);
                return (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    className={"relative text-left bg-card border border-border rounded-xl overflow-hidden hover:border-brand-sky shadow-sm " + (pulse ? "ring-2 ring-brand-sky scale-[1.04]" : "")}
                    style={{ transition: "transform 180ms ease, box-shadow 180ms ease" }}
                  >
                    {inCart > 0 && (
                      <div className="absolute top-1.5 right-1.5 z-10 h-7 min-w-7 px-1.5 rounded-full bg-brand-sky text-brand-navy text-xs font-bold flex items-center justify-center shadow-md">
                        {inCart}
                      </div>
                    )}
                    {vig.emPromocao && (
                      <div className="absolute top-1.5 left-1.5 z-10 px-2 py-0.5 rounded-full bg-accent text-accent-foreground text-[10px] font-bold shadow-md">
                        PROMO
                      </div>
                    )}
                    <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                      {p.imagem_url ? (
                        <img src={p.imagem_url} alt={p.nome} className="w-full h-full object-cover" />
                      ) : (
                        <ShoppingCart className="h-8 w-8 text-muted-foreground" />
                      )}
                    </div>
                    <div className="p-2.5">
                      <div className="text-sm font-medium line-clamp-2 min-h-[2.5rem]">{p.nome}</div>
                      <div className="flex items-baseline justify-between mt-1">
                        <div className="flex flex-col">
                          {vig.emPromocao && (
                            <span className="text-[10px] text-muted-foreground line-through leading-none">{brl(vig.precoOriginal)}</span>
                          )}
                          <span className={"text-base font-bold " + (vig.emPromocao ? "text-accent" : "text-primary")}>{brl(vig.preco)}</span>
                        </div>
                        <span className={"text-xs " + (p.estoque <= 0 ? "text-destructive" : "text-muted-foreground")}>
                          Est: {p.estoque}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Carrinho desktop */}
        <div className="hidden lg:block">
          <CartPanel
            cart={cart} total={total}
            onChangeQty={changeQty} onRemove={removeItem}
            onClear={clearCart} onCheckout={openCheckout}
          />
        </div>
      </div>

      {/* Carrinho mobile */}
      <Dialog open={showCart} onOpenChange={setShowCart}>
        <DialogContent className="max-w-md p-0 gap-0">
          <DialogHeader className="p-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" /> Carrinho
            </DialogTitle>
          </DialogHeader>
          <div className="p-4">
            <CartPanel
              cart={cart} total={total}
              onChangeQty={changeQty} onRemove={removeItem}
              onClear={clearCart}
              onCheckout={() => { setShowCart(false); openCheckout(); }}
              embedded
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Checkout */}
      <Dialog open={showCheckout} onOpenChange={setShowCheckout}>
        <DialogContent className="max-w-lg p-0 gap-0 max-h-[90vh] flex flex-col">
          <DialogHeader className="p-4 border-b shrink-0">
            <DialogTitle>Finalizar venda</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto px-4 py-4 flex-1">
            {!sessaoCaixaId && (
              <div className="rounded-md bg-amber-100 text-amber-900 text-xs p-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4"/> Nenhum caixa aberto. Abra o caixa para conferência precisa do dinheiro.
              </div>
            )}
            <div className="bg-muted rounded-lg p-3 space-y-1 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{brl(subtotal)}</span></div>
              {descontoNum > 0 && <div className="flex justify-between text-success"><span>Desconto</span><span>−{brl(descontoNum)}</span></div>}
              {taxaNum > 0 && <div className="flex justify-between"><span>Taxa</span><span>+{brl(taxaNum)}</span></div>}
              {creditoUsado > 0 && <div className="flex justify-between text-success"><span>Crédito do cliente</span><span>−{brl(creditoUsado)}</span></div>}
              <div className="border-t pt-1 flex items-center justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="text-2xl font-bold text-primary">{brl(total)}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Desconto</Label>
                <div className="flex gap-1">
                  <Input className="h-8 text-sm" value={descontoStr} onChange={(e) => setDescontoStr(e.target.value)} placeholder="0,00"/>
                  <Button type="button" size="sm" className="h-8 px-2" variant={descontoPct ? "default" : "outline"} onClick={() => setDescontoPct((v) => !v)}>{descontoPct ? "%" : "R$"}</Button>
                </div>
              </div>
              <div>
                <Label className="text-xs">Taxa/Entrega</Label>
                <Input className="h-8 text-sm" value={taxaStr} onChange={(e) => setTaxaStr(e.target.value)} placeholder="0,00"/>
              </div>
              <div>
                <Label className="text-xs">Usar crédito</Label>
                <Input className="h-8 text-sm" value={usarCreditoStr} onChange={(e) => setUsarCreditoStr(e.target.value)} placeholder="0,00" disabled={!cliente || Number(cliente?.saldo_credito || 0) <= 0}/>
                {cliente && Number(cliente.saldo_credito) > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">Disp.: {brl(cliente.saldo_credito)}</p>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Forma de pagamento</Label>
                <Button type="button" size="sm" variant={splits.length > 0 ? "default" : "outline"} className="h-7 text-xs"
                  onClick={() => setShowSplit((v) => !v)}>
                  {splits.length > 0 ? `Pagto. misto (${splits.length})` : "Pagto. misto"}
                </Button>
              </div>
              {splits.length === 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {FORMAS.map((f) => {
                    const Icon = f.icon;
                    const active = forma === f.value;
                    return (
                      <button key={f.value} type="button" onClick={() => setForma(f.value)}
                        className={`px-2 py-2 border rounded-md flex items-center gap-1.5 text-xs transition ${active ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}>
                        <Icon className="h-3.5 w-3.5" />{f.label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-1">
                  {splits.map((s, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-muted/40 rounded p-2 text-sm">
                      <span>{formaPagamentoLabel[s.forma] ?? s.forma}</span>
                      <div className="flex items-center gap-2">
                        <strong>{brl(s.valor)}</strong>
                        <button onClick={() => removeSplit(idx)} className="text-destructive"><X className="h-3 w-3"/></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {showSplit && (
                <div className="mt-2 p-2 border rounded space-y-2">
                  <div className="flex gap-2">
                    <Select value={splitForma} onValueChange={(v) => setSplitForma(v as Forma)}>
                      <SelectTrigger className="flex-1 h-8 text-sm"><SelectValue/></SelectTrigger>
                      <SelectContent>
                        {FORMAS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input className="w-24 h-8 text-sm" placeholder="Valor" value={splitValor} onChange={(e) => setSplitValor(e.target.value)}/>
                    <Button type="button" size="sm" className="h-8" onClick={addSplit}><Plus className="h-4 w-4"/></Button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>
                  Cliente {forma === "caderneta" && <span className="text-destructive">*</span>}
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setShowNovoCliente(true)}
                >
                  <UserPlus className="h-3.5 w-3.5 mr-1" /> Novo cliente
                </Button>
              </div>
              <Popover open={cliOpen} onOpenChange={setCliOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={cliOpen}
                    className="h-9 w-full justify-between font-normal"
                  >
                    <span className="truncate">
                      {cliente ? cliente.nome : "Sem cliente (venda avulsa)"}
                    </span>
                    <Search className="h-4 w-4 opacity-50 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[260px]" align="start">
                  <Command>
                    <CommandInput placeholder="Digite nome ou telefone…" />
                    <CommandList className="max-h-64">
                      <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="sem cliente venda avulsa"
                          onSelect={() => { setClienteId(""); setCliOpen(false); }}
                        >
                          Sem cliente (venda avulsa)
                        </CommandItem>
                        {clientes.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={`${c.nome} ${c.telefone ?? ""}`}
                            onSelect={() => { setClienteId(c.id); setCliOpen(false); }}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="truncate">{c.nome}</div>
                              <div className="text-[11px] text-muted-foreground truncate">
                                {c.telefone || "Sem telefone"}
                                {Number(c.saldo_devedor) > 0 ? ` · deve ${brl(c.saldo_devedor)}` : ""}
                              </div>
                            </div>
                            {clienteId === c.id && <Check className="h-4 w-4 text-primary" />}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {cliente && (
                <div className="mt-2 rounded-md border bg-muted/40 p-2.5 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Saldo devedor</span>
                    <strong className={Number(cliente.saldo_devedor) > 0 ? "text-destructive" : ""}>
                      {brl(cliente.saldo_devedor)}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Limite caderneta</span>
                    <strong>{Number(cliente.limite_caderneta) > 0 ? brl(cliente.limite_caderneta) : "Sem limite"}</strong>
                  </div>
                  {forma === "caderneta" && (
                    <div className="flex justify-between border-t pt-1">
                      <span className="text-muted-foreground">Saldo após esta venda</span>
                      <strong className="text-primary">{brl(Number(cliente.saldo_devedor) + total)}</strong>
                    </div>
                  )}
                  {forma === "caderneta" && Number(cliente.limite_caderneta) > 0 &&
                    Number(cliente.saldo_devedor) + total > Number(cliente.limite_caderneta) && (
                    <div className="flex items-center gap-1 text-destructive font-medium pt-1">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Limite excedido em {brl(Number(cliente.saldo_devedor) + total - Number(cliente.limite_caderneta))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {forma === "dinheiro" && splits.length === 0 && (
              <div>
                <Label className="mb-2 block">Valor recebido</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={valorRecebido}
                  onChange={(e) => setValorRecebido(e.target.value)}
                />
                {troco > 0 && (
                  <p className="text-sm mt-1">Troco: <strong className="text-primary">{brl(troco)}</strong></p>
                )}
              </div>
            )}

            <div>
              <Label className="mb-2 block">Observações</Label>
              <Textarea
                rows={2}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Opcional"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 p-4 border-t shrink-0 flex-col sm:flex-row bg-background">
            {(() => {
              const usandoSplit = splits.length > 0;
              const somaPag = usandoSplit ? splitsTotal : total;
              const falta = usandoSplit ? Math.max(0, total - splitsTotal) : 0;
              const sobra = usandoSplit ? Math.max(0, splitsTotal - total) : 0;
              const atingido = !usandoSplit || Math.abs(splitsTotal - total) < 0.01;
              const podeFinalizar = atingido && cart.length > 0 && !saving;
              return (
                <>
                  <div className="w-full text-center text-xs mb-1 sm:hidden">
                    {usandoSplit ? (
                      atingido
                        ? <span className="text-success font-semibold">✓ Total atingido</span>
                        : falta > 0
                          ? <span className="text-destructive">Faltando {brl(falta)}</span>
                          : <span className="text-destructive">Excede em {brl(sobra)}</span>
                    ) : <span className="text-success font-semibold">✓ Total atingido</span>}
                  </div>
                  <div className="hidden sm:block flex-1 text-xs">
                    {usandoSplit && !atingido && (
                      falta > 0
                        ? <span className="text-destructive font-medium">Faltando {brl(falta)}</span>
                        : <span className="text-destructive font-medium">Excede em {brl(sobra)}</span>
                    )}
                    {(!usandoSplit || atingido) && <span className="text-success font-medium">✓ Total atingido</span>}
                  </div>
                  <Button variant="outline" onClick={() => setShowCheckout(false)} disabled={saving}>
                    Cancelar
                  </Button>
                  <Button onClick={finalizar} disabled={!podeFinalizar} variant="sky" size="lg">
                    <Check className="h-4 w-4 mr-2" />
                    {saving ? "Salvando…" : `Finalizar ${brl(total)}`}
                  </Button>
                  <span className="hidden">{somaPag}</span>
                </>
              );
            })()}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showNovoCliente} onOpenChange={setShowNovoCliente}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" /> Cadastrar novo cliente
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="mb-1 block">Nome <span className="text-destructive">*</span></Label>
              <Input
                value={novoCli.nome}
                onChange={(e) => setNovoCli((s) => ({ ...s, nome: e.target.value }))}
                placeholder="Nome completo"
                autoFocus
                aria-invalid={!!novoCliErr.nome}
              />
              {novoCliErr.nome && <p className="text-xs text-destructive mt-1">{novoCliErr.nome}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1 block">Telefone</Label>
                <Input
                  value={novoCli.telefone}
                  onChange={(e) => setNovoCli((s) => ({ ...s, telefone: maskTelefone(e.target.value) }))}
                  placeholder="(11) 90000-0000"
                  aria-invalid={!!novoCliErr.telefone}
                />
                {novoCliErr.telefone && <p className="text-xs text-destructive mt-1">{novoCliErr.telefone}</p>}
              </div>
              <div>
                <Label className="mb-1 block">CPF / CNPJ</Label>
                <Input
                  value={novoCli.documento}
                  onChange={(e) => setNovoCli((s) => ({ ...s, documento: maskDocumento(e.target.value) }))}
                  aria-invalid={!!novoCliErr.documento}
                />
                {novoCliErr.documento && <p className="text-xs text-destructive mt-1">{novoCliErr.documento}</p>}
              </div>
            </div>
            <div>
              <Label className="mb-1 block">Limite na caderneta (R$)</Label>
              <Input
                inputMode="decimal"
                value={novoCli.limite_caderneta}
                onChange={(e) => setNovoCli((s) => ({ ...s, limite_caderneta: e.target.value }))}
                placeholder="0,00"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowNovoCliente(false)} disabled={savingCli}>
              Cancelar
            </Button>
            <Button onClick={cadastrarCliente} disabled={savingCli}>
              <Check className="h-4 w-4 mr-2" />
              {savingCli ? "Salvando…" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cupom Digital pós-venda */}
      <Dialog open={!!cupomVenda} onOpenChange={(o) => !o && setCupomVenda(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-success" /> Venda finalizada
            </DialogTitle>
          </DialogHeader>
          {cupomVenda && (
            <div className="space-y-3">
              <div className="text-sm">
                Cliente: <strong>{cupomVenda.cliente.nome}</strong>
                {cupomVenda.cliente.telefone && <> — {cupomVenda.cliente.telefone}</>}
              </div>
              <div className="rounded-md border bg-muted/30 p-3 max-h-60 overflow-y-auto">
                <pre className="text-xs whitespace-pre-wrap font-sans">{cupomVenda.texto}</pre>
              </div>
              {!cupomVenda.cliente.telefone && (
                <p className="text-xs text-muted-foreground">
                  Cliente sem telefone cadastrado. Cadastre o WhatsApp para enviar diretamente.
                </p>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCupomVenda(null)}>Fechar</Button>
            <Button onClick={enviarCupomWhatsApp} disabled={!cupomVenda?.cliente.telefone}>
              <MessageCircle className="h-4 w-4 mr-2" />
              Enviar via WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Estoque zerado */}
      <BarcodeScanner
        open={scanVenda}
        onOpenChange={setScanVenda}
        onDetected={biparCodigo}
        title="Bipar produto para o carrinho"
      />

      <Dialog open={!!estoqueZero} onOpenChange={(o) => !o && setEstoqueZero(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" /> Produto sem estoque
            </DialogTitle>
          </DialogHeader>
          {estoqueZero && (
            <div className="space-y-3">
              <p className="text-sm">
                <strong>{estoqueZero.nome}</strong> está com estoque zerado.
              </p>
              <div className="rounded-md border p-3 space-y-2">
                <Label className="text-sm">Abastecer agora (qtd. recebida):</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={reposQtd}
                  onChange={(e) => setReposQtd(e.target.value)}
                  placeholder="Ex: 10"
                />
                <Button onClick={abastecerAgora} disabled={repondo} className="w-full" variant="success">
                  {repondo ? "Abastecendo…" : "Abastecer e vender"}
                </Button>
              </div>
              <div className="text-xs text-center text-muted-foreground">— ou —</div>
              <Button onClick={venderAssimMesmo} variant="outline" className="w-full">
                Vender assim mesmo (estoque ficará negativo)
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Barra flutuante mobile do carrinho */}
      {cart.length > 0 && (
        <div className="lg:hidden fixed bottom-3 left-3 right-3 z-30">
          <button
            onClick={() => setShowCart(true)}
            className="w-full bg-gradient-brand text-white rounded-xl shadow-elevated px-4 py-3 flex items-center justify-between"
          >
            <span className="flex items-center gap-2 font-semibold">
              <ShoppingCart className="h-5 w-5" />
              {cart.reduce((s, i) => s + i.quantidade, 0)} {cart.reduce((s, i) => s + i.quantidade, 0) === 1 ? "item" : "itens"}
            </span>
            <span className="text-lg font-bold">{brl(total)}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function CartPanel({
  cart, total, onChangeQty, onRemove, onClear, onCheckout, embedded,
}: {
  cart: CartItem[];
  total: number;
  onChangeQty: (id: string, d: number) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onCheckout: () => void;
  embedded?: boolean;
}) {
  const Wrapper = embedded ? "div" : Card;
  const Inner = embedded ? "div" : CardContent;
  return (
    <Wrapper className={embedded ? "" : "sticky top-4"}>
      {!embedded && (
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShoppingCart className="h-5 w-5" /> Carrinho
            {cart.length > 0 && <Badge variant="secondary">{cart.length}</Badge>}
          </CardTitle>
        </CardHeader>
      )}
      <Inner className={embedded ? "p-0 space-y-3" : "space-y-3"}>
        {cart.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Toque em um produto para adicionar.
          </p>
        ) : (
          <>
            <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
              {cart.map((i) => (
                <div key={i.produto_id} className="flex gap-2 p-2 border rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium line-clamp-1">{i.nome}</div>
                    <div className="text-xs text-muted-foreground">{brl(i.preco)} un.</div>
                    <div className="flex items-center gap-1 mt-1">
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => onChangeQty(i.produto_id, -1)}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center text-sm font-medium">{i.quantidade}</span>
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => onChangeQty(i.produto_id, 1)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-col items-end justify-between">
                    <button onClick={() => onRemove(i.produto_id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <div className="text-sm font-semibold">{brl(i.preco * i.quantidade)}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t pt-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-xl font-bold text-primary">{brl(total)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={onClear}>
                <X className="h-4 w-4 mr-1" /> Limpar
              </Button>
              <Button onClick={onCheckout}>
                <Check className="h-4 w-4 mr-1" /> Finalizar
              </Button>
            </div>
          </>
        )}
      </Inner>
    </Wrapper>
  );
}

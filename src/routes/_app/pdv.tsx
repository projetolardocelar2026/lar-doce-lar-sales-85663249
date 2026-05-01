import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { brl, formaPagamentoLabel, STORE_NAME } from "@/lib/format";
import { toast } from "sonner";
import {
  Search, Plus, Minus, Trash2, ShoppingCart, X, Check, UserPlus,
  Banknote, CreditCard, Smartphone, Notebook, Clock, MessageCircle, AlertTriangle,
} from "lucide-react";
import { validateDocumento, validateTelefone, maskDocumento, maskTelefone } from "@/lib/validators";
import { gerarTextoCupom, abrirWhatsApp } from "@/lib/whatsapp";

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
  ativo: boolean;
};
type Categoria = { id: string; nome: string };
type Cliente = { id: string; nome: string; telefone: string | null; saldo_devedor: number; limite_caderneta: number };
type CartItem = {
  produto_id: string;
  nome: string;
  preco: number;
  quantidade: number;
  estoque: number;
  categoria_id: string | null;
};
type Forma = "dinheiro" | "pix" | "cartao_debito" | "cartao_credito" | "caderneta";

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [showNovoCliente, setShowNovoCliente] = useState(false);
  const [novoCli, setNovoCli] = useState({ nome: "", telefone: "", documento: "", limite_caderneta: "" });
  const [novoCliErr, setNovoCliErr] = useState<{ nome?: string; telefone?: string; documento?: string }>({});
  const [savingCli, setSavingCli] = useState(false);
  const [aberturaCaixa] = useState<Date>(() => new Date());
  const [cupomVenda, setCupomVenda] = useState<null | {
    cliente: Cliente;
    vendaId: string;
    texto: string;
    saldoAtualizado: number | null;
  }>(null);
  const catalogoUrl = typeof window !== "undefined" ? `${window.location.origin}/` : "";

  const loadData = async () => {
    setLoading(true);
    const [{ data: p }, { data: c }, { data: cl }] = await Promise.all([
      supabase.from("produtos").select("id,nome,preco,estoque,imagem_url,categoria_id,ativo").eq("ativo", true).order("nome"),
      supabase.from("categorias").select("id,nome").eq("ativa", true).order("ordem"),
      supabase.from("clientes").select("id,nome,telefone,saldo_devedor,limite_caderneta").eq("ativo", true).order("nome"),
    ]);
    setProdutos((p as Produto[]) || []);
    setCategorias((c as Categoria[]) || []);
    setClientes((cl as Cliente[]) || []);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return produtos.filter((p) => {
      if (catFilter !== "todas" && p.categoria_id !== catFilter) return false;
      if (q && !p.nome.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [produtos, search, catFilter]);

  const total = useMemo(
    () => cart.reduce((s, i) => s + i.preco * i.quantidade, 0),
    [cart],
  );

  const addToCart = (p: Produto) => {
    if (p.estoque <= 0) { toast.error("Sem estoque"); return; }
    setCart((cur) => {
      const ex = cur.find((i) => i.produto_id === p.id);
      if (ex) {
        if (ex.quantidade + 1 > p.estoque) { toast.error("Estoque insuficiente"); return cur; }
        return cur.map((i) => i.produto_id === p.id ? { ...i, quantidade: i.quantidade + 1 } : i);
      }
      return [...cur, {
        produto_id: p.id, nome: p.nome, preco: Number(p.preco),
        quantidade: 1, estoque: p.estoque, categoria_id: p.categoria_id,
      }];
    });
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

  const clearCart = () => { setCart([]); setClienteId(""); setObservacoes(""); setValorRecebido(""); };

  const cliente = clientes.find((c) => c.id === clienteId);
  const troco = forma === "dinheiro" && valorRecebido
    ? Math.max(0, parseFloat(valorRecebido.replace(",", ".")) - total)
    : 0;

  const openCheckout = () => {
    if (cart.length === 0) { toast.error("Carrinho vazio"); return; }
    setShowCheckout(true);
  };

  const finalizar = async () => {
    if (cart.length === 0) return;
    if (forma === "caderneta" && !clienteId) {
      toast.error("Selecione o cliente para venda na caderneta");
      return;
    }
    if (forma === "caderneta" && cliente) {
      const novoSaldo = Number(cliente.saldo_devedor) + total;
      if (cliente.limite_caderneta > 0 && novoSaldo > Number(cliente.limite_caderneta)) {
        toast.error(`Limite excedido. Saldo ficaria em ${brl(novoSaldo)}`);
        return;
      }
    }

    setSaving(true);
    try {
      const { data: venda, error: vErr } = await supabase
        .from("vendas")
        .insert({
          cliente_id: clienteId || null,
          atendente_id: user?.id ?? null,
          forma_pagamento: forma,
          total,
          observacoes: observacoes || null,
          status: forma === "caderneta" ? "pendente" : "paga",
          data_venda: new Date().toISOString(),
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

      toast.success("Venda finalizada!");

      // Cupom digital se houver cliente cadastrado
      if (cliente) {
        const saldoAtualizado =
          forma === "caderneta" ? Number(cliente.saldo_devedor) + total : null;
        const texto = gerarTextoCupom({
          vendaId: venda.id,
          data: new Date(),
          clienteNome: cliente.nome,
          itens: cart.map((i) => ({ nome: i.nome, quantidade: i.quantidade, preco: i.preco })),
          total,
          formaPagamento: forma,
          saldoCadernetaAtualizado: saldoAtualizado,
          catalogoUrl,
        });
        setCupomVenda({
          cliente: cliente as Cliente,
          vendaId: venda.id,
          texto,
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
                placeholder="Buscar produto…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
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
              {filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  disabled={p.estoque <= 0}
                  className="text-left bg-card border border-border rounded-xl overflow-hidden hover:border-brand-sky transition shadow-sm disabled:opacity-50"
                >
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
                      <span className="text-base font-bold text-primary">{brl(p.preco)}</span>
                      <span className={`text-xs ${p.estoque <= 0 ? "text-destructive" : "text-muted-foreground"}`}>
                        Est: {p.estoque}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Finalizar venda</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-muted rounded-lg p-4 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-2xl font-bold text-primary">{brl(total)}</span>
            </div>

            <div>
              <Label className="mb-2 block">Forma de pagamento</Label>
              <div className="grid grid-cols-2 gap-2">
                {FORMAS.map((f) => {
                  const Icon = f.icon;
                  const active = forma === f.value;
                  return (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setForma(f.value)}
                      className={`p-3 border rounded-lg flex items-center gap-2 text-sm transition ${
                        active
                          ? "border-primary bg-primary/10 text-primary font-medium"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {f.label}
                    </button>
                  );
                })}
              </div>
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
              <Select value={clienteId || "none"} onValueChange={(v) => setClienteId(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Sem cliente (venda avulsa)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem cliente (venda avulsa)</SelectItem>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}{Number(c.saldo_devedor) > 0 ? ` — deve ${brl(c.saldo_devedor)}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

            {forma === "dinheiro" && (
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

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowCheckout(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={finalizar} disabled={saving}>
              <Check className="h-4 w-4 mr-2" />
              {saving ? "Salvando…" : `Confirmar ${brl(total)}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Novo cliente */}
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

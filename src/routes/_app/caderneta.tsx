import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../_app";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { brl, fmtDate, fmtDateOnly, formaPagamentoLabel } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Search, Plus, HandCoins, History, AlertCircle, AlertTriangle, ShieldAlert } from "lucide-react";

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
  observacoes: string | null;
  forma_pagamento: string;
  status: string;
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
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);

  // Dialog: pagamento
  const [pagOpen, setPagOpen] = useState(false);
  const [pagValor, setPagValor] = useState("");
  const [pagForma, setPagForma] = useState<string>("dinheiro");
  const [pagData, setPagData] = useState(todayInput());
  const [pagObs, setPagObs] = useState("");

  // Dialog: nova venda a prazo
  const [vendaOpen, setVendaOpen] = useState(false);
  const [vendaValor, setVendaValor] = useState("");
  const [vendaData, setVendaData] = useState(todayInput());
  const [vendaObs, setVendaObs] = useState("");

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
        .select("id, data_venda, total, observacoes, forma_pagamento, status")
        .eq("cliente_id", clienteId)
        .eq("forma_pagamento", "caderneta")
        .order("data_venda", { ascending: false }),
      supabase
        .from("pagamentos_caderneta")
        .select("id, data_pagamento, valor, forma_pagamento, observacoes")
        .eq("cliente_id", clienteId)
        .order("data_pagamento", { ascending: false }),
    ]);
    setVendas((v as Venda[]) ?? []);
    setPagamentos((p as Pagamento[]) ?? []);
  };

  const abrirCliente = async (c: Cliente) => {
    setSelecionado(c);
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
    setPagValor(valorSugerido ? valorSugerido.toFixed(2) : "");
    setPagForma("dinheiro");
    setPagData(todayInput());
    setPagObs("");
    setPagOpen(true);
  };

  const registrarPagamento = async () => {
    if (!selecionado) return;
    const valor = parseFloat(pagValor.replace(",", "."));
    if (!valor || valor <= 0) {
      toast.error("Informe um valor válido");
      return;
    }
    if (valor > Number(selecionado.saldo_devedor) + 0.001) {
      toast.error("Valor maior que o saldo devedor");
      return;
    }
    const { error } = await supabase.from("pagamentos_caderneta").insert({
      cliente_id: selecionado.id,
      valor,
      forma_pagamento: pagForma as "dinheiro" | "pix" | "cartao_debito" | "cartao_credito",
      data_pagamento: new Date(pagData).toISOString(),
      observacoes: pagObs || null,
      atendente_id: user?.id ?? null,
    });
    if (error) {
      toast.error("Erro ao registrar pagamento: " + error.message);
      return;
    }
    toast.success("Pagamento registrado e lançado no fluxo de caixa");
    setPagOpen(false);
    await carregarClientes();
    const novo = clientes.find((c) => c.id === selecionado.id);
    if (novo) {
      const { data } = await supabase
        .from("clientes")
        .select("id, nome, telefone, saldo_devedor, limite_caderneta")
        .eq("id", selecionado.id)
        .maybeSingle();
      if (data) setSelecionado(data as Cliente);
    }
    await carregarHistorico(selecionado.id);
  };

  // ============ NOVA VENDA A PRAZO ============
  const abrirNovaVenda = () => {
    setVendaValor("");
    setVendaData(todayInput());
    setVendaObs("");
    setVendaOpen(true);
  };

  const registrarVendaPrazo = async () => {
    if (!selecionado) return;
    const valor = parseFloat(vendaValor.replace(",", "."));
    if (!valor || valor <= 0) {
      toast.error("Informe um valor válido");
      return;
    }
    const novoSaldo = Number(selecionado.saldo_devedor) + valor;
    if (
      Number(selecionado.limite_caderneta) > 0 &&
      novoSaldo > Number(selecionado.limite_caderneta)
    ) {
      toast.error(
        `Valor excede o limite de ${brl(selecionado.limite_caderneta)} do cliente`,
      );
      return;
    }
    const { data: venda, error } = await supabase
      .from("vendas")
      .insert({
        cliente_id: selecionado.id,
        forma_pagamento: "caderneta",
        total: valor,
        data_venda: new Date(vendaData).toISOString(),
        status: "pendente",
        observacoes: vendaObs || "Lançamento manual de caderneta",
        atendente_id: user?.id ?? null,
      })
      .select("id")
      .single();
    if (error || !venda) {
      toast.error("Erro ao registrar venda: " + (error?.message ?? ""));
      return;
    }
    // item genérico para preservar histórico
    await supabase.from("itens_venda").insert({
      venda_id: venda.id,
      produto_nome: vendaObs || "Lançamento de caderneta",
      quantidade: 1,
      preco_unitario: valor,
      subtotal: valor,
    });
    toast.success("Venda a prazo lançada na caderneta");
    setVendaOpen(false);
    await carregarClientes();
    const { data } = await supabase
      .from("clientes")
      .select("id, nome, telefone, saldo_devedor, limite_caderneta")
      .eq("id", selecionado.id)
      .maybeSingle();
    if (data) setSelecionado(data as Cliente);
    await carregarHistorico(selecionado.id);
  };

  return (
    <div>
      <PageHeader
        title="Caderneta"
        description="Devedores, vendas a prazo e baixas de pagamento"
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
                const ativo = selecionado?.id === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => abrirCliente(c)}
                    className={[
                      "w-full text-left px-4 py-3 flex items-center justify-between gap-3 transition-smooth",
                      ativo ? "bg-accent" : "hover:bg-muted/50",
                    ].join(" ")}
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{c.nome}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {c.telefone || "Sem telefone"}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div
                        className={[
                          "font-semibold",
                          saldo > 0 ? "text-destructive" : "text-muted-foreground",
                        ].join(" ")}
                      >
                        {brl(saldo)}
                      </div>
                      {Number(c.limite_caderneta) > 0 && (
                        <div className="text-[10px] text-muted-foreground">
                          limite {brl(c.limite_caderneta)}
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
                Selecione um cliente à esquerda para ver o histórico, lançar uma
                venda a prazo ou registrar pagamento.
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
                    <Button variant="outline" onClick={abrirNovaVenda}>
                      <Plus className="h-4 w-4 mr-1" /> Venda a prazo
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
                      <History className="h-4 w-4 mr-1" /> Vendas a prazo
                    </TabsTrigger>
                    <TabsTrigger value="pagamentos">Pagamentos</TabsTrigger>
                  </TabsList>

                  <TabsContent value="vendas" className="mt-4">
                    {vendas.length === 0 ? (
                      <div className="text-sm text-muted-foreground py-6 text-center">
                        Nenhuma venda a prazo registrada.
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Observação</TableHead>
                            <TableHead className="text-right">Valor</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {vendas.map((v) => (
                            <TableRow key={v.id}>
                              <TableCell className="whitespace-nowrap">
                                {fmtDate(v.data_venda)}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {v.observacoes || "—"}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {brl(v.total)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
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
            <div>
              <Label>Valor recebido</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={pagValor}
                onChange={(e) => setPagValor(e.target.value)}
                placeholder="0,00"
                autoFocus
              />
              <div className="text-xs text-muted-foreground mt-1">
                Saldo atual: {brl(selecionado?.saldo_devedor ?? 0)}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
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
              <div>
                <Label>Data do pagamento</Label>
                <Input
                  type="datetime-local"
                  value={pagData}
                  onChange={(e) => setPagData(e.target.value)}
                />
              </div>
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

      {/* Dialog: nova venda a prazo */}
      <Dialog open={vendaOpen} onOpenChange={setVendaOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Lançar venda a prazo — {selecionado?.nome}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Valor da venda</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={vendaValor}
                onChange={(e) => setVendaValor(e.target.value)}
                placeholder="0,00"
                autoFocus
              />
            </div>
            <div>
              <Label>Data da venda</Label>
              <Input
                type="datetime-local"
                value={vendaData}
                onChange={(e) => setVendaData(e.target.value)}
              />
              <div className="text-xs text-muted-foreground mt-1">
                Use a data real em que o cliente levou o produto.
              </div>
            </div>
            <div>
              <Label>Descrição / observação</Label>
              <Textarea
                rows={2}
                value={vendaObs}
                onChange={(e) => setVendaObs(e.target.value)}
                placeholder="Ex.: Sabão em pó, vassoura, etc."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVendaOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={registrarVendaPrazo}>Lançar na caderneta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

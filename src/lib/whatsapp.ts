// Geração de cupom de venda e abertura do WhatsApp.
import { brl, formaPagamentoLabel, STORE_NAME, PIX_KEY, PIX_TITULAR } from "./format";
import { onlyDigits } from "./validators";

export type CupomItem = { nome: string; quantidade: number; preco: number };
export type CupomVenda = {
  vendaId?: string;
  data: Date;
  clienteNome?: string | null;
  itens: CupomItem[];
  total: number;
  formaPagamento: string;
  saldoCadernetaAtualizado?: number | null;
  catalogoUrl?: string;
};

export function gerarTextoCupom(v: CupomVenda): string {
  const dataStr = v.data.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  const linhas: string[] = [];
  linhas.push(`*${STORE_NAME}*`);
  linhas.push(`🧾 *Cupom de Compra*`);
  linhas.push(`📅 ${dataStr}`);
  if (v.clienteNome) linhas.push(`👤 ${v.clienteNome}`);
  linhas.push("");
  linhas.push("*Itens:*");
  for (const it of v.itens) {
    linhas.push(`• ${it.quantidade}x ${it.nome} — ${brl(it.preco * it.quantidade)}`);
  }
  linhas.push("");
  linhas.push(`*Total:* ${brl(v.total)}`);
  linhas.push(`*Pagamento:* ${formaPagamentoLabel[v.formaPagamento] ?? v.formaPagamento}`);
  if (v.formaPagamento === "caderneta" && v.saldoCadernetaAtualizado != null) {
    linhas.push(`*Saldo atualizado da caderneta:* ${brl(v.saldoCadernetaAtualizado)}`);
  }
  if (v.catalogoUrl) {
    linhas.push("");
    linhas.push(`🛍️ Catálogo: ${v.catalogoUrl}`);
  }
  linhas.push("");
  linhas.push("Obrigada pela preferência! 💙");
  return linhas.join("\n");
}

export function abrirWhatsApp(telefone: string | null | undefined, mensagem: string) {
  const tel = onlyDigits(telefone || "");
  const numero = tel ? (tel.startsWith("55") ? tel : `55${tel}`) : "";
  const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

// ===== Caderneta consolidada =====
export type CadernetaItem = { nome: string; quantidade: number; preco: number };
export type CadernetaCompra = {
  id: string;
  data: Date;
  total: number;
  vencimento?: string | null;
  itens: CadernetaItem[];
};
export type CadernetaPagamento = { data: Date; valor: number; forma: string };

export function gerarTextoCaderneta(params: {
  clienteNome: string;
  compras: CadernetaCompra[];
  pagamentos: CadernetaPagamento[];
  saldoAtual: number;
  catalogoUrl?: string;
}): string {
  const { clienteNome, compras, pagamentos, saldoAtual, catalogoUrl } = params;
  const d = (x: Date) => x.toLocaleDateString("pt-BR");
  const L: string[] = [];
  L.push(`*${STORE_NAME}*`);
  L.push(`📒 *Caderneta de ${clienteNome}*`);
  L.push("");
  L.push(`Saldo anterior: ${brl(0)}`);
  L.push("");
  L.push("*Compras:*");
  if (compras.length === 0) L.push("• Nenhuma compra registrada");
  for (const c of [...compras].sort((a, b) => a.data.getTime() - b.data.getTime())) {
    L.push(`• ${d(c.data)} — + ${brl(c.total)}${c.vencimento ? ` (vence ${new Date(c.vencimento + "T12:00:00").toLocaleDateString("pt-BR")})` : ""}`);
    for (const it of c.itens) {
      L.push(`   - ${it.quantidade}x ${it.nome} — ${brl(it.preco * it.quantidade)}`);
    }
  }
  if (pagamentos.length > 0) {
    L.push("");
    L.push("*Pagamentos:*");
    for (const p of [...pagamentos].sort((a, b) => a.data.getTime() - b.data.getTime())) {
      L.push(`• ${d(p.data)} — − ${brl(p.valor)} (${formaPagamentoLabel[p.forma] ?? p.forma})`);
    }
  }
  L.push("");
  L.push(`*Saldo atual: ${brl(saldoAtual)}*`);
  if (catalogoUrl) {
    L.push("");
    L.push(`🛍️ Catálogo: ${catalogoUrl}`);
  }
  L.push("");
  L.push("Obrigada pela preferência! 💙");
  return L.join("\n");
}

// ===== Cobrança de compras selecionadas / em aberto =====
export type CobrancaCompra = {
  id: string;
  data: Date;
  total: number;
  vencimento?: string | null;
  itens: CadernetaItem[];
};

const fmtVenc = (v?: string | null) =>
  v ? new Date(v + "T12:00:00").toLocaleDateString("pt-BR") : "Sem vencimento";

function linhasPix(): string[] {
  return [
    "💳 *Pagamento via PIX*",
    `Chave: ${PIX_KEY}`,
    `Titular: ${PIX_TITULAR}`,
  ];
}

/** Mensagem com APENAS as compras marcadas pelo operador. */
export function gerarTextoComprasSelecionadas(params: {
  clienteNome: string;
  compras: CobrancaCompra[];
  saldoTotal?: number | null;
  catalogoUrl?: string;
}): string {
  const { clienteNome, compras, saldoTotal, catalogoUrl } = params;
  const L: string[] = [];
  L.push(`*${STORE_NAME}*`);
  L.push(`📒 *Compras da caderneta — ${clienteNome}*`);
  L.push("");
  const ordenadas = [...compras].sort((a, b) => a.data.getTime() - b.data.getTime());
  let subtotal = 0;
  for (const c of ordenadas) {
    subtotal += c.total;
    L.push(`🗓️ ${c.data.toLocaleDateString("pt-BR")} — vence ${fmtVenc(c.vencimento)}`);
    for (const it of c.itens) {
      L.push(`   • ${it.quantidade}x ${it.nome} — ${brl(it.preco * it.quantidade)}`);
    }
    L.push(`   Subtotal: ${brl(c.total)}`);
    L.push("");
  }
  L.push(`*Total selecionado: ${brl(subtotal)}*`);
  if (saldoTotal != null && Math.abs(saldoTotal - subtotal) > 0.009) {
    L.push(`Saldo total em aberto: ${brl(saldoTotal)}`);
  }
  L.push("");
  L.push(...linhasPix());
  if (catalogoUrl) {
    L.push("");
    L.push(`🛍️ Catálogo: ${catalogoUrl}`);
  }
  L.push("");
  L.push("Obrigada pela preferência! 💙");
  return L.join("\n");
}

/** Extrato compacto: só compras em aberto, agrupadas por vencimento. */
export function gerarTextoExtratoAberto(params: {
  clienteNome: string;
  compras: CobrancaCompra[];
  saldoAtual: number;
  catalogoUrl?: string;
}): string {
  const { clienteNome, compras, saldoAtual, catalogoUrl } = params;
  const L: string[] = [];
  L.push(`*${STORE_NAME}*`);
  L.push(`📒 *Extrato em aberto — ${clienteNome}*`);
  L.push("");

  const grupos = new Map<string, CobrancaCompra[]>();
  for (const c of compras) {
    const k = c.vencimento ?? "";
    const arr = grupos.get(k) ?? [];
    arr.push(c);
    grupos.set(k, arr);
  }
  const chaves = [...grupos.keys()].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));

  if (chaves.length === 0) {
    L.push("Nenhuma compra em aberto. 🎉");
  }

  for (const k of chaves) {
    const lista = grupos.get(k)!;
    const subtotal = lista.reduce((s, c) => s + c.total, 0);
    L.push(`📅 *Vencimento: ${fmtVenc(k || null)}*`);
    for (const c of lista) {
      for (const it of c.itens) {
        L.push(`   • ${it.quantidade}x ${it.nome} — ${brl(it.preco * it.quantidade)}`);
      }
    }
    L.push(`   *Subtotal: ${brl(subtotal)}*`);
    L.push("");
  }

  L.push(`*SALDO TOTAL EM ABERTO: ${brl(saldoAtual)}*`);
  L.push("");
  L.push(...linhasPix());
  if (catalogoUrl) {
    L.push("");
    L.push(`🛍️ Catálogo: ${catalogoUrl}`);
  }
  L.push("");
  L.push("Obrigada pela preferência! 💙");
  return L.join("\n");
}

// ===== Pedido do catálogo público (carrinho) =====
export type PedidoItem = { nome: string; quantidade: number; preco: number };

export function gerarTextoPedidoCatalogo(params: {
  itens: PedidoItem[];
  total: number;
  entrega: "retirada" | "entrega";
  nome?: string;
  endereco?: string;
  observacao?: string;
}): string {
  const { itens, total, entrega, nome, endereco, observacao } = params;
  const L: string[] = [];
  L.push(
    entrega === "retirada"
      ? "Olá! Gostaria de fazer o seguinte pedido para *retirada na loja*:"
      : "Olá! Gostaria de fazer o seguinte pedido com *entrega*:"
  );
  L.push("");
  for (const it of itens) {
    L.push(`• ${it.quantidade}x ${it.nome} — ${brl(it.preco * it.quantidade)}`);
  }
  L.push("");
  L.push(`*Total: ${brl(total)}*`);
  if (nome) L.push(`👤 Nome: ${nome}`);
  if (entrega === "entrega" && endereco) L.push(`📍 Endereço: ${endereco}`);
  if (observacao) L.push(`📝 Obs.: ${observacao}`);
  L.push("");
  L.push(`_${STORE_NAME}_`);
  return L.join("\n");
}

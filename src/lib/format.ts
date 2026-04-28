export const brl = (n: number | string | null | undefined) => {
  const v = typeof n === "string" ? parseFloat(n) : (n ?? 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
};

export const fmtDate = (d: string | Date) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(d));

export const fmtDateOnly = (d: string | Date) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(d));

export const WHATSAPP_NUMBER = "5511976781948";
export const STORE_NAME = "Lar Doce Lar — Limpeza e Praticidade";

export const formaPagamentoLabel: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  cartao_debito: "Cartão Débito",
  cartao_credito: "Cartão Crédito",
  caderneta: "Caderneta",
};

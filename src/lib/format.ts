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
// Chave PIX exibida nas cobranças enviadas pelo WhatsApp
export const PIX_KEY = "5511976781948";
export const PIX_TITULAR = "Lar Doce Lar";


export const formaPagamentoLabel: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  cartao_debito: "Cartão Débito",
  cartao_credito: "Cartão Crédito",
  caderneta: "Caderneta",
};

// Arredondamento monetário padrão (2 casas) — garante que carrinho, banco e relatórios batam.
export const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// ===== Máscara de moeda (entrada em centavos) =====
/** Formata a digitação como moeda: "8" -> "R$ 0,08", "2530" -> "R$ 25,30". */
export const maskBRL = (input: string): string => {
  const digits = (input || "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!digits) return "";
  return brl(Number(digits) / 100);
};

/** Converte texto mascarado ("R$ 25,30") ou livre ("25,3") em número. */
export const parseBRL = (input: string | null | undefined): number => {
  if (!input) return 0;
  const s = String(input).replace(/[^\d,.-]/g, "");
  if (!s) return 0;
  const norm = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  return parseFloat(norm) || 0;
};

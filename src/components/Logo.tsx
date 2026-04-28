import logoSrc from "@/assets/logo-lar-doce-lar.webp";

export function Logo({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src={logoSrc}
      alt="Lar Doce Lar — Limpeza e Praticidade"
      width={size}
      height={size}
      className={`rounded-lg object-cover ${className}`}
    />
  );
}

// Helpers para exportar listas em CSV / PDF.
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export function downloadCSV(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) {
    const blob = new Blob(["\uFEFF"], { type: "text/csv;charset=utf-8;" });
    triggerDownload(blob, filename);
    return;
  }
  const headers = Object.keys(rows[0]);
  const escape = (val: unknown) => {
    const s = val == null ? "" : String(val);
    if (/[",;\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const csv = [
    headers.join(";"),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(";")),
  ].join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, filename);
}

export function downloadTablePDF(opts: {
  filename: string;
  title: string;
  subtitle?: string;
  headers: string[];
  rows: (string | number)[][];
  footer?: string;
}) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(15, 38, 76);
  doc.text(opts.title, 14, 16);
  if (opts.subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(80);
    doc.text(opts.subtitle, 14, 22);
  }
  autoTable(doc, {
    head: [opts.headers],
    body: opts.rows,
    startY: opts.subtitle ? 28 : 22,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [15, 38, 76], textColor: 255 },
    alternateRowStyles: { fillColor: [240, 247, 255] },
  });
  if (opts.footer) {
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(
        `${opts.footer} — pág. ${i}/${pages}`,
        14,
        doc.internal.pageSize.getHeight() - 6,
      );
    }
  }
  doc.save(opts.filename);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

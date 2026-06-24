import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { saveOrSharePdf } from "./pdfFile";

const formatDateTime = (value) => {
  if (!value) return "";
  return new Date(value).toLocaleString();
};

const readableCalculatorType = (type) => {
  const labels = {
    drug: "Drug Calculator",
    protocol: "Protocol Calculator",
    emergency: "Emergency Drugs",
    fluid: "Fluid Therapy",
    transfusion: "Blood Transfusion",
    cri: "CRI Calculator"
  };
  return labels[type] || "Calculator";
};

export const exportCalculationHistoryPdf = async (rows = []) => {
  if (!rows.length) return false;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("VetLearn Clinical Tools History", 14, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Generated ${new Date().toLocaleString()} | ${rows.length} calculation${rows.length === 1 ? "" : "s"} from the last 72 hours`, 14, 26);

  autoTable(doc, {
    startY: 34,
    head: [["Date", "Calculator", "Item", "Weight", "Result"]],
    body: rows.map((row) => [
      formatDateTime(row.created_at),
      readableCalculatorType(row.calculator_type),
      row.drug_name || "",
      row.patient_weight ? `${row.patient_weight} kg` : "",
      row.result || ""
    ]),
    styles: { fontSize: 8, cellPadding: 2, overflow: "linebreak" },
    headStyles: { fillColor: [15, 143, 131], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 32 },
      2: { cellWidth: 34 },
      3: { cellWidth: 22 },
      4: { cellWidth: "auto" }
    }
  });

  return saveOrSharePdf(doc, "VetLearn-Clinical-Tools-History.pdf", {
    print: true,
    dialogTitle: "Print clinical tools history",
    text: "Your VetLearn clinical tools history PDF is ready.",
    successMessage: "PDF ready to print",
    errorMessage: "Unable to generate PDF"
  });
};

import ExcelJS from "exceljs";
import { prisma } from "../lib/prisma";

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { gte: new Date(y, m - 1, 1), lte: new Date(y, m, 0, 23, 59, 59) };
}

function cop(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}

export async function buildMonthlyExcel(month: string, branchId?: string): Promise<Buffer> {
  const range = monthRange(month);
  const orderWhere = branchId ? { branchId, deliveredAt: range } : { deliveredAt: range };
  const baseWhere = branchId ? { branchId, date: range } : { date: range };
  const convWhere = branchId ? { branchId, date: range } : { date: range };

  const [orders, bases, conversions, drivers] = await Promise.all([
    prisma.shipdayOrder.findMany({
      where: orderWhere,
      include: { driver: { select: { name: true } }, branch: { select: { name: true } } },
      orderBy: { deliveredAt: "asc" },
    }),
    prisma.baseTransaction.findMany({
      where: baseWhere,
      include: { driver: { select: { name: true } }, branch: { select: { name: true } } },
      orderBy: { date: "asc" },
    }),
    prisma.conversion.findMany({
      where: convWhere,
      include: { branch: { select: { name: true } } },
      orderBy: { date: "asc" },
    }),
    prisma.driver.findMany({
      where: branchId ? { branchId } : {},
      include: { branch: { select: { name: true } } },
    }),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Cash Buddy EPA";
  wb.created = new Date();

  const headerStyle: Partial<ExcelJS.Style> = {
    font: { bold: true, color: { argb: "FFFFFFFF" } },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } },
    alignment: { horizontal: "center" },
  };

  // ─── Sheet 1: Resumen ───────────────────────────────────────────────────
  const summary = wb.addWorksheet("Resumen");
  summary.columns = [
    { header: "Concepto", key: "concept", width: 35 },
    { header: "Valor", key: "value", width: 20 },
  ];
  summary.getRow(1).eachCell(c => Object.assign(c, headerStyle));

  const totalValue = orders.reduce((s, o) => s + o.deliveryValue, 0);
  const totalCompany = orders.reduce((s, o) => s + o.companyAmount, 0);
  const basesGiven = bases.filter(b => b.type === "entrega").reduce((s, b) => s + b.amount, 0);
  const basesPaid = bases.filter(b => b.type === "pago").reduce((s, b) => s + b.amount, 0);
  const convB2E = conversions.filter(c => c.type === "banco_a_efectivo").reduce((s, c) => s + c.amount, 0);
  const convE2B = conversions.filter(c => c.type === "efectivo_a_banco").reduce((s, c) => s + c.amount, 0);

  [
    ["Período", month],
    ["Total domicilios", orders.length],
    ["Total valor domicilios", cop(totalValue)],
    ["Total porcentaje empresa (30%)", cop(totalCompany)],
    ["Bases entregadas", cop(basesGiven)],
    ["Bases pagadas", cop(basesPaid)],
    ["Bases pendientes", cop(basesGiven - basesPaid)],
    ["Conversiones banco→efectivo", cop(convB2E)],
    ["Conversiones efectivo→banco", cop(convE2B)],
  ].forEach(([c, v]) => summary.addRow({ concept: c, value: v }));

  // ─── Sheet 2: Domicilios ────────────────────────────────────────────────
  const ordersSheet = wb.addWorksheet("Domicilios");
  ordersSheet.columns = [
    { header: "Sucursal", key: "branch", width: 18 },
    { header: "Fecha", key: "date", width: 20 },
    { header: "# Pedido", key: "number", width: 12 },
    { header: "Domiciliario", key: "driver", width: 22 },
    { header: "Cliente", key: "customer", width: 22 },
    { header: "Valor domicilio", key: "value", width: 18 },
    { header: "% Empresa (30%)", key: "company", width: 18 },
    { header: "Estado", key: "status", width: 14 },
  ];
  ordersSheet.getRow(1).eachCell(c => Object.assign(c, headerStyle));
  for (const o of orders) {
    ordersSheet.addRow({
      branch: o.branch?.name ?? "",
      date: o.deliveredAt ? o.deliveredAt.toLocaleString("es-CO") : "",
      number: o.orderNumber ?? "",
      driver: o.driver?.name ?? "Sin asignar",
      customer: o.customerName ?? "",
      value: o.deliveryValue,
      company: o.companyAmount,
      status: o.status,
    });
  }
  ordersSheet.getColumn("value").numFmt = '"$"#,##0';
  ordersSheet.getColumn("company").numFmt = '"$"#,##0';

  // ─── Sheet 3: Domiciliarios ─────────────────────────────────────────────
  const driversSheet = wb.addWorksheet("Domiciliarios");
  driversSheet.columns = [
    { header: "Sucursal", key: "branch", width: 18 },
    { header: "Nombre", key: "name", width: 22 },
    { header: "Teléfono", key: "phone", width: 16 },
    { header: "Deuda pendiente", key: "debt", width: 20 },
    { header: "Estado", key: "active", width: 12 },
  ];
  driversSheet.getRow(1).eachCell(c => Object.assign(c, headerStyle));
  for (const d of drivers) {
    driversSheet.addRow({
      branch: d.branch?.name ?? "",
      name: d.name,
      phone: d.phone ?? "",
      debt: d.pendingDebt,
      active: d.active ? "Activo" : "Inactivo",
    });
  }
  driversSheet.getColumn("debt").numFmt = '"$"#,##0';

  // ─── Sheet 4: Bases ─────────────────────────────────────────────────────
  const basesSheet = wb.addWorksheet("Bases");
  basesSheet.columns = [
    { header: "Sucursal", key: "branch", width: 18 },
    { header: "Fecha", key: "date", width: 20 },
    { header: "Domiciliario", key: "driver", width: 22 },
    { header: "Tipo", key: "type", width: 12 },
    { header: "Monto", key: "amount", width: 16 },
    { header: "Notas", key: "notes", width: 30 },
  ];
  basesSheet.getRow(1).eachCell(c => Object.assign(c, headerStyle));
  for (const b of bases) {
    basesSheet.addRow({
      branch: b.branch?.name ?? "",
      date: b.date.toLocaleString("es-CO"),
      driver: b.driver?.name ?? "",
      type: b.type === "entrega" ? "Entrega" : "Pago",
      amount: b.amount,
      notes: b.notes ?? "",
    });
  }
  basesSheet.getColumn("amount").numFmt = '"$"#,##0';

  // ─── Sheet 5: Conversiones ──────────────────────────────────────────────
  const convSheet = wb.addWorksheet("Conversiones");
  convSheet.columns = [
    { header: "Sucursal", key: "branch", width: 18 },
    { header: "Fecha", key: "date", width: 20 },
    { header: "Tipo", key: "type", width: 24 },
    { header: "Monto", key: "amount", width: 16 },
    { header: "Notas", key: "notes", width: 30 },
  ];
  convSheet.getRow(1).eachCell(c => Object.assign(c, headerStyle));
  for (const c of conversions) {
    convSheet.addRow({
      branch: c.branch?.name ?? "",
      date: c.date.toLocaleString("es-CO"),
      type: c.type === "banco_a_efectivo" ? "Banco → Efectivo" : "Efectivo → Banco",
      amount: c.amount,
      notes: c.notes ?? "",
    });
  }
  convSheet.getColumn("amount").numFmt = '"$"#,##0';

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

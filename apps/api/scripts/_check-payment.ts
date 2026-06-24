import { prisma } from "../src/lib/prisma";

async function main() {
  // Fix 1: BaseTransaction $20,375 banco - "Devolución de base (transferencia)"
  const r1 = await prisma.baseTransaction.update({
    where: { id: "cmqsay7om00fmck0ozbxxps23" },
    data: { bankAmount: 20375, cashAmount: 0 },
  });
  console.log(`✓ Base $20375 banco: bankAmount=${r1.bankAmount} cashAmount=${r1.cashAmount}`);

  // Fix 2: BaseTransaction $29,625 efectivo - "Devolución de base (efectivo)"
  const r2 = await prisma.baseTransaction.update({
    where: { id: "cmqsaxogu00fkck0owjjvrlnq" },
    data: { cashAmount: 29625, bankAmount: 0 },
  });
  console.log(`✓ Base $29625 efectivo: cashAmount=${r2.cashAmount} bankAmount=${r2.bankAmount}`);

  // Verificar BankTransaction del pago banco (ya existe, solo confirmar)
  const bt = await prisma.bankTransaction.findUnique({ where: { id: "cmqsay7p800fnck0oh57lp9zo" } });
  console.log(`\n✓ BankTransaction ingreso banco: $${bt?.amount} medio=${bt?.medium} (ya registrado ✓)`);

  await prisma.$disconnect();
}
main().catch(console.error);

CREATE TYPE "CashFlowTreatment" AS ENUM ('AUTO', 'SPENDING', 'INCOME', 'TRANSFER');
CREATE TYPE "TransferMatchSource" AS ENUM ('AUTO', 'MANUAL');

ALTER TABLE "PlaidTransaction"
ADD COLUMN "cashFlowTreatment" "CashFlowTreatment" NOT NULL DEFAULT 'AUTO';

CREATE TABLE "TransactionTransferPair" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "debitTransactionId" TEXT NOT NULL,
  "creditTransactionId" TEXT NOT NULL,
  "matchSource" "TransferMatchSource" NOT NULL DEFAULT 'AUTO',
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "matchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TransactionTransferPair_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountNetWorthSnapshot" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "snapshotKey" TEXT NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source" "NetWorthSnapshotSource" NOT NULL,
  "accountKey" TEXT NOT NULL,
  "accountName" TEXT NOT NULL,
  "institution" TEXT,
  "kind" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "value" DOUBLE PRECISION NOT NULL,
  CONSTRAINT "AccountNetWorthSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TransactionTransferPair_debitTransactionId_key" ON "TransactionTransferPair"("debitTransactionId");
CREATE UNIQUE INDEX "TransactionTransferPair_creditTransactionId_key" ON "TransactionTransferPair"("creditTransactionId");
CREATE INDEX "TransactionTransferPair_userId_matchedAt_idx" ON "TransactionTransferPair"("userId", "matchedAt");
CREATE INDEX "PlaidTransaction_cashFlowTreatment_date_idx" ON "PlaidTransaction"("cashFlowTreatment", "date");
CREATE UNIQUE INDEX "AccountNetWorthSnapshot_userId_snapshotKey_accountKey_key" ON "AccountNetWorthSnapshot"("userId", "snapshotKey", "accountKey");
CREATE INDEX "AccountNetWorthSnapshot_userId_accountKey_capturedAt_idx" ON "AccountNetWorthSnapshot"("userId", "accountKey", "capturedAt");
CREATE INDEX "AccountNetWorthSnapshot_userId_capturedAt_idx" ON "AccountNetWorthSnapshot"("userId", "capturedAt");

ALTER TABLE "TransactionTransferPair" ADD CONSTRAINT "TransactionTransferPair_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransactionTransferPair" ADD CONSTRAINT "TransactionTransferPair_debitTransactionId_fkey" FOREIGN KEY ("debitTransactionId") REFERENCES "PlaidTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransactionTransferPair" ADD CONSTRAINT "TransactionTransferPair_creditTransactionId_fkey" FOREIGN KEY ("creditTransactionId") REFERENCES "PlaidTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountNetWorthSnapshot" ADD CONSTRAINT "AccountNetWorthSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

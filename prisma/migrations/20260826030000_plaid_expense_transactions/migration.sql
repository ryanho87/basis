ALTER TABLE "PlaidItem"
ADD COLUMN "transactionsCursor" TEXT;

ALTER TABLE "PlaidSyncRun"
ADD COLUMN "transactionsCount" INTEGER NOT NULL DEFAULT 0;

CREATE TYPE "ExpenseTreatment" AS ENUM ('UNREVIEWED', 'BUSINESS', 'PERSONAL', 'MIXED', 'EXCLUDED');
CREATE TYPE "ExpenseCategory" AS ENUM ('ADVERTISING', 'AUTO', 'EDUCATION', 'INSURANCE', 'MEALS', 'MEDICAL_SUPPLIES', 'OFFICE', 'PAYROLL', 'PROFESSIONAL_FEES', 'RENT', 'SOFTWARE', 'TAXES', 'TRAVEL', 'UTILITIES', 'TRANSFER', 'OTHER');

CREATE TABLE "PlaidTransaction" (
  "id" TEXT NOT NULL,
  "plaidAccountId" TEXT NOT NULL,
  "externalTransactionId" TEXT NOT NULL,
  "pendingTransactionId" TEXT,
  "date" TIMESTAMP(3) NOT NULL,
  "authorizedDate" TIMESTAMP(3),
  "datetime" TIMESTAMP(3),
  "name" TEXT NOT NULL,
  "merchantName" TEXT,
  "amount" DOUBLE PRECISION NOT NULL,
  "isoCurrencyCode" TEXT,
  "unofficialCurrencyCode" TEXT,
  "paymentChannel" TEXT,
  "pending" BOOLEAN NOT NULL DEFAULT false,
  "plaidPrimaryCategory" TEXT,
  "plaidDetailedCategory" TEXT,
  "plaidConfidenceLevel" TEXT,
  "originalDescription" TEXT,
  "logoUrl" TEXT,
  "website" TEXT,
  "expenseTreatment" "ExpenseTreatment" NOT NULL DEFAULT 'UNREVIEWED',
  "expenseCategory" "ExpenseCategory",
  "deductiblePercent" DOUBLE PRECISION,
  "userNote" TEXT,
  "isRemoved" BOOLEAN NOT NULL DEFAULT false,
  "lastSyncedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlaidTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlaidTransaction_externalTransactionId_key" ON "PlaidTransaction"("externalTransactionId");
CREATE INDEX "PlaidTransaction_plaidAccountId_date_idx" ON "PlaidTransaction"("plaidAccountId", "date");
CREATE INDEX "PlaidTransaction_expenseTreatment_date_idx" ON "PlaidTransaction"("expenseTreatment", "date");
CREATE INDEX "PlaidTransaction_expenseCategory_date_idx" ON "PlaidTransaction"("expenseCategory", "date");

ALTER TABLE "PlaidTransaction"
ADD CONSTRAINT "PlaidTransaction_plaidAccountId_fkey"
FOREIGN KEY ("plaidAccountId") REFERENCES "PlaidAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

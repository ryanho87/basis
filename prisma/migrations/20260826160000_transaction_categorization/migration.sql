-- User-editable transaction categories, merchant rules, and split transactions.
CREATE TABLE "TransactionCategory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TransactionCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TransactionCategorizationRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "merchantPattern" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TransactionCategorizationRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TransactionSplit" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TransactionSplit_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PlaidTransaction" ADD COLUMN "transactionCategoryId" TEXT;
ALTER TABLE "PlaidTransaction" ADD COLUMN "categorizationSource" TEXT NOT NULL DEFAULT 'PLAID';

CREATE UNIQUE INDEX "TransactionCategory_userId_slug_key" ON "TransactionCategory"("userId", "slug");
CREATE INDEX "TransactionCategory_userId_archivedAt_idx" ON "TransactionCategory"("userId", "archivedAt");
CREATE UNIQUE INDEX "TransactionCategorizationRule_userId_merchantPattern_key" ON "TransactionCategorizationRule"("userId", "merchantPattern");
CREATE INDEX "TransactionCategorizationRule_categoryId_idx" ON "TransactionCategorizationRule"("categoryId");
CREATE INDEX "TransactionSplit_transactionId_idx" ON "TransactionSplit"("transactionId");
CREATE INDEX "TransactionSplit_categoryId_idx" ON "TransactionSplit"("categoryId");
CREATE INDEX "PlaidTransaction_transactionCategoryId_date_idx" ON "PlaidTransaction"("transactionCategoryId", "date");

ALTER TABLE "TransactionCategory" ADD CONSTRAINT "TransactionCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransactionCategorizationRule" ADD CONSTRAINT "TransactionCategorizationRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransactionCategorizationRule" ADD CONSTRAINT "TransactionCategorizationRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TransactionCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransactionSplit" ADD CONSTRAINT "TransactionSplit_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "PlaidTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransactionSplit" ADD CONSTRAINT "TransactionSplit_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TransactionCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlaidTransaction" ADD CONSTRAINT "PlaidTransaction_transactionCategoryId_fkey" FOREIGN KEY ("transactionCategoryId") REFERENCES "TransactionCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

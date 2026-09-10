CREATE TYPE "PlanCommitmentKind" AS ENUM ('SAVINGS', 'DEBT', 'FIXED_EXPENSE', 'GIVING');
CREATE TYPE "PlanAmountMode" AS ENUM ('ANNUAL', 'MONTHLY', 'PERCENT_OF_AFTER_TAX');

CREATE TABLE "MoneyPlan" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "planYear" INTEGER,
  "assumptionsJson" TEXT NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MoneyPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlanCommitment" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" "PlanCommitmentKind" NOT NULL,
  "amountMode" "PlanAmountMode" NOT NULL DEFAULT 'ANNUAL',
  "amount" DOUBLE PRECISION NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlanCommitment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MoneyPlan_userId_key" ON "MoneyPlan"("userId");
CREATE INDEX "PlanCommitment_userId_sortOrder_idx" ON "PlanCommitment"("userId", "sortOrder");

ALTER TABLE "MoneyPlan" ADD CONSTRAINT "MoneyPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanCommitment" ADD CONSTRAINT "PlanCommitment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

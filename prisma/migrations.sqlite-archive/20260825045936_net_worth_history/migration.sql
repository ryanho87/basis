-- CreateTable
CREATE TABLE "NetWorthSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "grossAssets" REAL NOT NULL,
    "totalLiabilities" REAL NOT NULL,
    "netWorth" REAL NOT NULL,
    "estimatedTaxLiability" REAL NOT NULL,
    "afterTaxNetWorth" REAL NOT NULL,
    "plaidAssets" REAL NOT NULL,
    "plaidLiabilities" REAL NOT NULL,
    "manualAssets" REAL NOT NULL,
    "manualLiabilities" REAL NOT NULL,
    "basisCoverage" REAL,
    CONSTRAINT "NetWorthSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "NetWorthSnapshot_userId_capturedAt_idx" ON "NetWorthSnapshot"("userId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "NetWorthSnapshot_userId_dateKey_key" ON "NetWorthSnapshot"("userId", "dateKey");

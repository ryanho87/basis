-- CreateTable
CREATE TABLE "CoinbaseConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastSyncedAt" DATETIME,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CoinbaseConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CoinbaseAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "coinbaseConnectionId" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "holdQuantity" REAL NOT NULL DEFAULT 0,
    "priceUsd" REAL,
    "valueUsd" REAL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CoinbaseAccount_coinbaseConnectionId_fkey" FOREIGN KEY ("coinbaseConnectionId") REFERENCES "CoinbaseConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_NetWorthSnapshot" (
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
    "coinbaseAssets" REAL NOT NULL DEFAULT 0,
    "manualAssets" REAL NOT NULL,
    "manualLiabilities" REAL NOT NULL,
    "basisCoverage" REAL,
    CONSTRAINT "NetWorthSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_NetWorthSnapshot" ("afterTaxNetWorth", "basisCoverage", "capturedAt", "dateKey", "estimatedTaxLiability", "grossAssets", "id", "manualAssets", "manualLiabilities", "netWorth", "plaidAssets", "plaidLiabilities", "source", "totalLiabilities", "userId") SELECT "afterTaxNetWorth", "basisCoverage", "capturedAt", "dateKey", "estimatedTaxLiability", "grossAssets", "id", "manualAssets", "manualLiabilities", "netWorth", "plaidAssets", "plaidLiabilities", "source", "totalLiabilities", "userId" FROM "NetWorthSnapshot";
DROP TABLE "NetWorthSnapshot";
ALTER TABLE "new_NetWorthSnapshot" RENAME TO "NetWorthSnapshot";
CREATE INDEX "NetWorthSnapshot_userId_capturedAt_idx" ON "NetWorthSnapshot"("userId", "capturedAt");
CREATE UNIQUE INDEX "NetWorthSnapshot_userId_dateKey_key" ON "NetWorthSnapshot"("userId", "dateKey");
CREATE TABLE "new_W2Snapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "snapshotDate" DATETIME NOT NULL,
    "ytdWages" REAL NOT NULL,
    "ytdFederalWithheld" REAL NOT NULL DEFAULT 0,
    "ytdStateWithheld" REAL NOT NULL DEFAULT 0,
    "ytdSocialSecurity" REAL NOT NULL DEFAULT 0,
    "ytdMedicare" REAL NOT NULL DEFAULT 0,
    "ytdBonuses" REAL NOT NULL DEFAULT 0,
    "ytdRsuVestIncome" REAL NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "employerName" TEXT,
    "socialSecurityWages" REAL,
    "medicareWages" REAL,
    "stateWages" REAL,
    "localWages" REAL,
    "localWithheld" REAL,
    "box12Json" TEXT,
    "documentHash" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "W2Snapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_W2Snapshot" ("createdAt", "id", "notes", "snapshotDate", "taxYear", "userId", "ytdBonuses", "ytdFederalWithheld", "ytdMedicare", "ytdRsuVestIncome", "ytdSocialSecurity", "ytdStateWithheld", "ytdWages") SELECT "createdAt", "id", "notes", "snapshotDate", "taxYear", "userId", "ytdBonuses", "ytdFederalWithheld", "ytdMedicare", "ytdRsuVestIncome", "ytdSocialSecurity", "ytdStateWithheld", "ytdWages" FROM "W2Snapshot";
DROP TABLE "W2Snapshot";
ALTER TABLE "new_W2Snapshot" RENAME TO "W2Snapshot";
CREATE INDEX "W2Snapshot_userId_taxYear_idx" ON "W2Snapshot"("userId", "taxYear");
CREATE INDEX "W2Snapshot_userId_documentHash_idx" ON "W2Snapshot"("userId", "documentHash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "CoinbaseConnection_userId_key" ON "CoinbaseConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CoinbaseAccount_externalAccountId_key" ON "CoinbaseAccount"("externalAccountId");

-- CreateIndex
CREATE INDEX "CoinbaseAccount_coinbaseConnectionId_idx" ON "CoinbaseAccount"("coinbaseConnectionId");

-- CreateIndex
CREATE INDEX "CoinbaseAccount_currency_idx" ON "CoinbaseAccount"("currency");

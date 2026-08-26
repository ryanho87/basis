-- CreateTable
CREATE TABLE "PlaidAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "plaidItemId" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "persistentAccountId" TEXT,
    "name" TEXT NOT NULL,
    "officialName" TEXT,
    "mask" TEXT,
    "type" TEXT NOT NULL,
    "subtype" TEXT,
    "currentBalance" REAL,
    "availableBalance" REAL,
    "creditLimit" REAL,
    "isoCurrencyCode" TEXT,
    "unofficialCurrencyCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlaidAccount_plaidItemId_fkey" FOREIGN KEY ("plaidItemId") REFERENCES "PlaidItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlaidSecurity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalSecurityId" TEXT NOT NULL,
    "institutionSecurityId" TEXT,
    "institutionId" TEXT,
    "tickerSymbol" TEXT,
    "name" TEXT,
    "type" TEXT,
    "subtype" TEXT,
    "isCashEquivalent" BOOLEAN,
    "closePrice" REAL,
    "closePriceAsOf" DATETIME,
    "updateDatetime" DATETIME,
    "isoCurrencyCode" TEXT,
    "unofficialCurrencyCode" TEXT,
    "marketIdentifierCode" TEXT,
    "sector" TEXT,
    "industry" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PlaidHolding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "plaidAccountId" TEXT NOT NULL,
    "plaidSecurityId" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "institutionPrice" REAL NOT NULL,
    "institutionPriceAsOf" DATETIME,
    "institutionPriceDatetime" DATETIME,
    "institutionValue" REAL NOT NULL,
    "aggregateCostBasis" REAL,
    "vestedQuantity" REAL,
    "vestedValue" REAL,
    "isoCurrencyCode" TEXT,
    "unofficialCurrencyCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlaidHolding_plaidAccountId_fkey" FOREIGN KEY ("plaidAccountId") REFERENCES "PlaidAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlaidHolding_plaidSecurityId_fkey" FOREIGN KEY ("plaidSecurityId") REFERENCES "PlaidSecurity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlaidTaxLot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "plaidHoldingId" TEXT NOT NULL,
    "lotKey" TEXT NOT NULL,
    "institutionLotId" TEXT,
    "originalPurchaseDatetime" DATETIME,
    "quantity" REAL,
    "purchasePrice" REAL,
    "costBasis" REAL,
    "currentValue" REAL,
    "positionType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlaidTaxLot_plaidHoldingId_fkey" FOREIGN KEY ("plaidHoldingId") REFERENCES "PlaidHolding" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlaidLiability" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "plaidAccountId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "detailsJson" TEXT NOT NULL,
    "lastSyncedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlaidLiability_plaidAccountId_fkey" FOREIGN KEY ("plaidAccountId") REFERENCES "PlaidAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlaidSyncRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "plaidItemId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "accountsCount" INTEGER NOT NULL DEFAULT 0,
    "holdingsCount" INTEGER NOT NULL DEFAULT 0,
    "taxLotsCount" INTEGER NOT NULL DEFAULT 0,
    "liabilitiesCount" INTEGER NOT NULL DEFAULT 0,
    "warningsJson" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "PlaidSyncRun_plaidItemId_fkey" FOREIGN KEY ("plaidItemId") REFERENCES "PlaidItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PlaidAccount_externalAccountId_key" ON "PlaidAccount"("externalAccountId");

-- CreateIndex
CREATE INDEX "PlaidAccount_plaidItemId_idx" ON "PlaidAccount"("plaidItemId");

-- CreateIndex
CREATE INDEX "PlaidAccount_type_subtype_idx" ON "PlaidAccount"("type", "subtype");

-- CreateIndex
CREATE UNIQUE INDEX "PlaidSecurity_externalSecurityId_key" ON "PlaidSecurity"("externalSecurityId");

-- CreateIndex
CREATE INDEX "PlaidHolding_plaidSecurityId_idx" ON "PlaidHolding"("plaidSecurityId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaidHolding_plaidAccountId_plaidSecurityId_key" ON "PlaidHolding"("plaidAccountId", "plaidSecurityId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaidTaxLot_plaidHoldingId_lotKey_key" ON "PlaidTaxLot"("plaidHoldingId", "lotKey");

-- CreateIndex
CREATE UNIQUE INDEX "PlaidLiability_plaidAccountId_key" ON "PlaidLiability"("plaidAccountId");

-- CreateIndex
CREATE INDEX "PlaidSyncRun_plaidItemId_startedAt_idx" ON "PlaidSyncRun"("plaidItemId", "startedAt");

-- CreateTable
CREATE TABLE "PlaidDeveloperCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "clientIdEncrypted" TEXT NOT NULL,
    "secretEncrypted" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlaidDeveloperCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PlaidItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "developerCredentialId" TEXT,
    "itemId" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT NOT NULL,
    "institutionId" TEXT,
    "institutionName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "consentExpiresAt" DATETIME,
    "lastSyncedAt" DATETIME,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlaidItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlaidItem_developerCredentialId_fkey" FOREIGN KEY ("developerCredentialId") REFERENCES "PlaidDeveloperCredential" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_PlaidItem" ("accessTokenEncrypted", "consentExpiresAt", "createdAt", "errorCode", "errorMessage", "id", "institutionId", "institutionName", "itemId", "lastSyncedAt", "status", "updatedAt", "userId") SELECT "accessTokenEncrypted", "consentExpiresAt", "createdAt", "errorCode", "errorMessage", "id", "institutionId", "institutionName", "itemId", "lastSyncedAt", "status", "updatedAt", "userId" FROM "PlaidItem";
DROP TABLE "PlaidItem";
ALTER TABLE "new_PlaidItem" RENAME TO "PlaidItem";
CREATE UNIQUE INDEX "PlaidItem_itemId_key" ON "PlaidItem"("itemId");
CREATE INDEX "PlaidItem_userId_idx" ON "PlaidItem"("userId");
CREATE INDEX "PlaidItem_developerCredentialId_idx" ON "PlaidItem"("developerCredentialId");
CREATE INDEX "PlaidItem_institutionId_idx" ON "PlaidItem"("institutionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "PlaidDeveloperCredential_userId_key" ON "PlaidDeveloperCredential"("userId");

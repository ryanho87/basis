-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "stateCode" TEXT,
    "stateWages" REAL,
    "localWages" REAL,
    "localWithheld" REAL,
    "box12Json" TEXT,
    "payPeriodStart" DATETIME,
    "payPeriodEnd" DATETIME,
    "currentGrossPay" REAL,
    "currentNetPay" REAL,
    "ytdNetPay" REAL,
    "ytdPretaxDeductions" REAL NOT NULL DEFAULT 0,
    "ytdRetirement" REAL NOT NULL DEFAULT 0,
    "ytdHsa" REAL NOT NULL DEFAULT 0,
    "payFrequency" TEXT,
    "documentHash" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "W2Snapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_W2Snapshot" ("box12Json", "createdAt", "documentHash", "employerName", "id", "localWages", "localWithheld", "medicareWages", "notes", "snapshotDate", "socialSecurityWages", "source", "stateCode", "stateWages", "taxYear", "userId", "ytdBonuses", "ytdFederalWithheld", "ytdMedicare", "ytdRsuVestIncome", "ytdSocialSecurity", "ytdStateWithheld", "ytdWages") SELECT "box12Json", "createdAt", "documentHash", "employerName", "id", "localWages", "localWithheld", "medicareWages", "notes", "snapshotDate", "socialSecurityWages", "source", "stateCode", "stateWages", "taxYear", "userId", "ytdBonuses", "ytdFederalWithheld", "ytdMedicare", "ytdRsuVestIncome", "ytdSocialSecurity", "ytdStateWithheld", "ytdWages" FROM "W2Snapshot";
DROP TABLE "W2Snapshot";
ALTER TABLE "new_W2Snapshot" RENAME TO "W2Snapshot";
CREATE INDEX "W2Snapshot_userId_taxYear_idx" ON "W2Snapshot"("userId", "taxYear");
CREATE INDEX "W2Snapshot_userId_documentHash_idx" ON "W2Snapshot"("userId", "documentHash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

ALTER TABLE "W2Snapshot" ADD COLUMN "rsuIncomeIsExplicit" BOOLEAN NOT NULL DEFAULT false;

-- Existing non-zero values were necessarily entered or extracted explicitly.
UPDATE "W2Snapshot"
SET "rsuIncomeIsExplicit" = true
WHERE "ytdRsuVestIncome" <> 0;

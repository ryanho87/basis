ALTER TYPE "NetWorthSnapshotSource" ADD VALUE 'SCHEDULED_REFRESH';

CREATE TYPE "ScheduledRefreshStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'SKIPPED');

CREATE TABLE "ScheduledRefreshRun" (
    "id" TEXT NOT NULL,
    "window" TEXT NOT NULL,
    "candidate" TEXT,
    "trigger" TEXT,
    "status" "ScheduledRefreshStatus" NOT NULL DEFAULT 'RUNNING',
    "eligibleProfiles" INTEGER NOT NULL DEFAULT 0,
    "snapshotsCaptured" INTEGER NOT NULL DEFAULT 0,
    "refreshedProfiles" INTEGER NOT NULL DEFAULT 0,
    "failedProfiles" INTEGER NOT NULL DEFAULT 0,
    "errorsJson" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ScheduledRefreshRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScheduledRefreshRun_startedAt_idx" ON "ScheduledRefreshRun"("startedAt");
CREATE INDEX "ScheduledRefreshRun_status_startedAt_idx" ON "ScheduledRefreshRun"("status", "startedAt");

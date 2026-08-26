ALTER TABLE "User"
ADD COLUMN "primaryPersona" TEXT,
ADD COLUMN "financialCapabilitiesJson" TEXT NOT NULL DEFAULT '[]';

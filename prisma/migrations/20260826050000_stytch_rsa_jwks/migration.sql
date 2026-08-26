-- Retire the original Ed25519 bridge key. Better Auth keeps expired public
-- keys in JWKS during its grace period and lazily creates the new RS256 key.
UPDATE "Jwks"
SET "expiresAt" = CURRENT_TIMESTAMP
WHERE "alg" = 'EdDSA' AND "expiresAt" IS NULL;

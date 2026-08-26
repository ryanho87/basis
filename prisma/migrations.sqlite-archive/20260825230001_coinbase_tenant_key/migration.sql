DROP INDEX "CoinbaseAccount_externalAccountId_key";

CREATE UNIQUE INDEX "CoinbaseAccount_coinbaseConnectionId_externalAccountId_key"
ON "CoinbaseAccount"("coinbaseConnectionId", "externalAccountId");

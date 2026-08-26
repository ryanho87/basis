-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CoinbaseConnectionStatus" AS ENUM ('ACTIVE', 'ERROR', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "NetWorthSnapshotSource" AS ENUM ('PLAID_SYNC', 'COINBASE_SYNC', 'DASHBOARD', 'MANUAL');

-- CreateEnum
CREATE TYPE "PlaidSyncStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "PlaidItemStatus" AS ENUM ('ACTIVE', 'LOGIN_REQUIRED', 'ERROR', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "FilingStatus" AS ENUM ('SINGLE', 'MARRIED_FILING_JOINTLY', 'MARRIED_FILING_SEPARATELY', 'HEAD_OF_HOUSEHOLD');

-- CreateEnum
CREATE TYPE "ProfileType" AS ENUM ('UNCLASSIFIED', 'TECH_EMPLOYEE', 'W2_PROFESSIONAL', 'S_CORP_OWNER', 'SELF_EMPLOYED', 'MIXED');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CHECKING', 'SAVINGS', 'TAXABLE_BROKERAGE', 'K401_TRADITIONAL', 'K401_ROTH', 'IRA_TRADITIONAL', 'IRA_ROTH', 'HSA', 'CRYPTO', 'OTHER');

-- CreateEnum
CREATE TYPE "AcquisitionType" AS ENUM ('PURCHASE', 'RSU_VEST', 'ESPP', 'DIVIDEND_REINVESTMENT', 'GIFT', 'INHERITANCE', 'TRANSFER_IN');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('BUY', 'SELL', 'DIVIDEND', 'INTEREST', 'TRANSFER_IN', 'TRANSFER_OUT', 'FEE', 'OTHER');

-- CreateEnum
CREATE TYPE "VestStatus" AS ENUM ('PENDING', 'VESTED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ManualAssetType" AS ENUM ('REAL_ESTATE', 'VEHICLE', 'COLLECTIBLE', 'PRIVATE_EQUITY', 'OTHER');

-- CreateEnum
CREATE TYPE "LiabilityType" AS ENUM ('MORTGAGE', 'AUTO_LOAN', 'CREDIT_CARD', 'PERSONAL_LOAN', 'OTHER');

-- CreateEnum
CREATE TYPE "StudentLoanType" AS ENUM ('FEDERAL_DIRECT', 'FEDERAL_PLUS', 'PRIVATE', 'OTHER');

-- CreateEnum
CREATE TYPE "RepaymentPlan" AS ENUM ('STANDARD', 'GRADUATED', 'IBR', 'PAYE', 'SAVE', 'ICR', 'REFINANCED');

-- CreateEnum
CREATE TYPE "PayFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'SEMIMONTHLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "W2SnapshotSource" AS ENUM ('MANUAL', 'DOCUMENT_UPLOAD', 'PAY_STUB_UPLOAD');

-- CreateEnum
CREATE TYPE "ChatKind" AS ENUM ('ONBOARDING', 'GENERAL', 'SCENARIO');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('NEW', 'ACKNOWLEDGED', 'DISMISSED', 'ACTIONED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "filingStatus" "FilingStatus" NOT NULL DEFAULT 'SINGLE',
    "state" TEXT,
    "profileType" "ProfileType" NOT NULL DEFAULT 'UNCLASSIFIED',
    "onboardingSummary" TEXT,
    "primaryConcern" TEXT,
    "onboardedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthUser" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "profileUserId" TEXT,

    CONSTRAINT "AuthUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthAccount" (
    "id" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "AuthAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthVerification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthInvite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "tokenHash" TEXT NOT NULL,
    "profileUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaidDeveloperCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientIdEncrypted" TEXT NOT NULL,
    "secretEncrypted" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaidDeveloperCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaidItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "developerCredentialId" TEXT,
    "itemId" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT NOT NULL,
    "institutionId" TEXT,
    "institutionName" TEXT,
    "status" "PlaidItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "consentExpiresAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaidItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaidAccount" (
    "id" TEXT NOT NULL,
    "plaidItemId" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "persistentAccountId" TEXT,
    "name" TEXT NOT NULL,
    "officialName" TEXT,
    "mask" TEXT,
    "type" TEXT NOT NULL,
    "subtype" TEXT,
    "currentBalance" DOUBLE PRECISION,
    "availableBalance" DOUBLE PRECISION,
    "creditLimit" DOUBLE PRECISION,
    "isoCurrencyCode" TEXT,
    "unofficialCurrencyCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaidAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaidSecurity" (
    "id" TEXT NOT NULL,
    "externalSecurityId" TEXT NOT NULL,
    "institutionSecurityId" TEXT,
    "institutionId" TEXT,
    "tickerSymbol" TEXT,
    "name" TEXT,
    "type" TEXT,
    "subtype" TEXT,
    "isCashEquivalent" BOOLEAN,
    "closePrice" DOUBLE PRECISION,
    "closePriceAsOf" TIMESTAMP(3),
    "updateDatetime" TIMESTAMP(3),
    "isoCurrencyCode" TEXT,
    "unofficialCurrencyCode" TEXT,
    "marketIdentifierCode" TEXT,
    "sector" TEXT,
    "industry" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaidSecurity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaidHolding" (
    "id" TEXT NOT NULL,
    "plaidAccountId" TEXT NOT NULL,
    "plaidSecurityId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "institutionPrice" DOUBLE PRECISION NOT NULL,
    "institutionPriceAsOf" TIMESTAMP(3),
    "institutionPriceDatetime" TIMESTAMP(3),
    "institutionValue" DOUBLE PRECISION NOT NULL,
    "aggregateCostBasis" DOUBLE PRECISION,
    "vestedQuantity" DOUBLE PRECISION,
    "vestedValue" DOUBLE PRECISION,
    "isoCurrencyCode" TEXT,
    "unofficialCurrencyCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaidHolding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaidTaxLot" (
    "id" TEXT NOT NULL,
    "plaidHoldingId" TEXT NOT NULL,
    "lotKey" TEXT NOT NULL,
    "institutionLotId" TEXT,
    "originalPurchaseDatetime" TIMESTAMP(3),
    "quantity" DOUBLE PRECISION,
    "purchasePrice" DOUBLE PRECISION,
    "costBasis" DOUBLE PRECISION,
    "currentValue" DOUBLE PRECISION,
    "positionType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaidTaxLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaidLiability" (
    "id" TEXT NOT NULL,
    "plaidAccountId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "detailsJson" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaidLiability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaidSyncRun" (
    "id" TEXT NOT NULL,
    "plaidItemId" TEXT NOT NULL,
    "status" "PlaidSyncStatus" NOT NULL DEFAULT 'RUNNING',
    "accountsCount" INTEGER NOT NULL DEFAULT 0,
    "holdingsCount" INTEGER NOT NULL DEFAULT 0,
    "taxLotsCount" INTEGER NOT NULL DEFAULT 0,
    "liabilitiesCount" INTEGER NOT NULL DEFAULT 0,
    "warningsJson" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PlaidSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoinbaseConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "CoinbaseConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSyncedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoinbaseConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoinbaseAccount" (
    "id" TEXT NOT NULL,
    "coinbaseConnectionId" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "holdQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "priceUsd" DOUBLE PRECISION,
    "valueUsd" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoinbaseAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NetWorthSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "NetWorthSnapshotSource" NOT NULL,
    "grossAssets" DOUBLE PRECISION NOT NULL,
    "totalLiabilities" DOUBLE PRECISION NOT NULL,
    "netWorth" DOUBLE PRECISION NOT NULL,
    "estimatedTaxLiability" DOUBLE PRECISION NOT NULL,
    "afterTaxNetWorth" DOUBLE PRECISION NOT NULL,
    "plaidAssets" DOUBLE PRECISION NOT NULL,
    "plaidLiabilities" DOUBLE PRECISION NOT NULL,
    "coinbaseAssets" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "manualAssets" DOUBLE PRECISION NOT NULL,
    "manualLiabilities" DOUBLE PRECISION NOT NULL,
    "basisCoverage" DOUBLE PRECISION,

    CONSTRAINT "NetWorthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "institution" TEXT,
    "type" "AccountType" NOT NULL,
    "cashBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetLot" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "name" TEXT,
    "shares" DOUBLE PRECISION NOT NULL,
    "costBasisPerShare" DOUBLE PRECISION NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL,
    "acquisitionType" "AcquisitionType" NOT NULL DEFAULT 'PURCHASE',
    "notes" TEXT,
    "vestEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HoldingPosition" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "name" TEXT,
    "shares" DOUBLE PRECISION NOT NULL,
    "currentValue" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HoldingPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" "TransactionType" NOT NULL,
    "ticker" TEXT,
    "shares" DOUBLE PRECISION,
    "pricePerShare" DOUBLE PRECISION,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "fees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RsuGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "company" TEXT,
    "grantDate" TIMESTAMP(3) NOT NULL,
    "totalShares" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RsuGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VestEvent" (
    "id" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "vestDate" TIMESTAMP(3) NOT NULL,
    "shares" DOUBLE PRECISION NOT NULL,
    "fmvAtVest" DOUBLE PRECISION,
    "status" "VestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualAsset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ManualAssetType" NOT NULL,
    "currentValue" DOUBLE PRECISION NOT NULL,
    "purchasePrice" DOUBLE PRECISION,
    "purchaseDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Liability" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LiabilityType" NOT NULL,
    "currentBalance" DOUBLE PRECISION NOT NULL,
    "interestRate" DOUBLE PRECISION,
    "monthlyPayment" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Liability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentLoan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "servicer" TEXT,
    "loanType" "StudentLoanType" NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL,
    "interestRate" DOUBLE PRECISION NOT NULL,
    "monthlyPayment" DOUBLE PRECISION,
    "repaymentPlan" "RepaymentPlan",
    "pslfEligible" BOOLEAN NOT NULL DEFAULT false,
    "pslfPaymentsCount" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentLoan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaycheckProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "annualSalary" DOUBLE PRECISION NOT NULL,
    "payFrequency" "PayFrequency" NOT NULL,
    "expectedBonus" DOUBLE PRECISION,
    "bonusMonth" INTEGER,
    "k401Contribution" DOUBLE PRECISION,
    "hsaContribution" DOUBLE PRECISION,
    "otherPretax" DOUBLE PRECISION,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaycheckProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SCorpProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "corpName" TEXT,
    "annualRevenue" DOUBLE PRECISION NOT NULL,
    "operatingExpenses" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "w2SalaryFromCorp" DOUBLE PRECISION NOT NULL,
    "projectedDistribution" DOUBLE PRECISION,
    "solo401kContribution" DOUBLE PRECISION,
    "sepIraContribution" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SCorpProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "W2Snapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "ytdWages" DOUBLE PRECISION NOT NULL,
    "ytdFederalWithheld" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ytdStateWithheld" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ytdSocialSecurity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ytdMedicare" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ytdBonuses" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ytdRsuVestIncome" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rsuIncomeIsExplicit" BOOLEAN NOT NULL DEFAULT false,
    "source" "W2SnapshotSource" NOT NULL DEFAULT 'MANUAL',
    "employerName" TEXT,
    "socialSecurityWages" DOUBLE PRECISION,
    "medicareWages" DOUBLE PRECISION,
    "stateCode" TEXT,
    "stateWages" DOUBLE PRECISION,
    "localWages" DOUBLE PRECISION,
    "localWithheld" DOUBLE PRECISION,
    "box12Json" TEXT,
    "payPeriodStart" TIMESTAMP(3),
    "payPeriodEnd" TIMESTAMP(3),
    "currentGrossPay" DOUBLE PRECISION,
    "currentNetPay" DOUBLE PRECISION,
    "ytdNetPay" DOUBLE PRECISION,
    "ytdPretaxDeductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ytdRetirement" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ytdHsa" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "payFrequency" TEXT,
    "documentHash" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "W2Snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannedSale" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "shares" DOUBLE PRECISION NOT NULL,
    "lotSelection" TEXT,
    "estimatedPricePerShare" DOUBLE PRECISION NOT NULL,
    "plannedDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannedSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatThread" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "kind" "ChatKind" NOT NULL DEFAULT 'GENERAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategySuggestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "category" TEXT,
    "detail" TEXT,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategySuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AuthUser_email_key" ON "AuthUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AuthUser_profileUserId_key" ON "AuthUser"("profileUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_token_key" ON "AuthSession"("token");

-- CreateIndex
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

-- CreateIndex
CREATE INDEX "AuthAccount_userId_idx" ON "AuthAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthAccount_issuer_accountId_key" ON "AuthAccount"("issuer", "accountId");

-- CreateIndex
CREATE INDEX "AuthVerification_identifier_idx" ON "AuthVerification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "AuthInvite_tokenHash_key" ON "AuthInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthInvite_email_acceptedAt_idx" ON "AuthInvite"("email", "acceptedAt");

-- CreateIndex
CREATE INDEX "AuthInvite_profileUserId_idx" ON "AuthInvite"("profileUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaidDeveloperCredential_userId_key" ON "PlaidDeveloperCredential"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaidItem_itemId_key" ON "PlaidItem"("itemId");

-- CreateIndex
CREATE INDEX "PlaidItem_userId_idx" ON "PlaidItem"("userId");

-- CreateIndex
CREATE INDEX "PlaidItem_developerCredentialId_idx" ON "PlaidItem"("developerCredentialId");

-- CreateIndex
CREATE INDEX "PlaidItem_institutionId_idx" ON "PlaidItem"("institutionId");

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

-- CreateIndex
CREATE UNIQUE INDEX "CoinbaseConnection_userId_key" ON "CoinbaseConnection"("userId");

-- CreateIndex
CREATE INDEX "CoinbaseAccount_coinbaseConnectionId_idx" ON "CoinbaseAccount"("coinbaseConnectionId");

-- CreateIndex
CREATE INDEX "CoinbaseAccount_currency_idx" ON "CoinbaseAccount"("currency");

-- CreateIndex
CREATE UNIQUE INDEX "CoinbaseAccount_coinbaseConnectionId_externalAccountId_key" ON "CoinbaseAccount"("coinbaseConnectionId", "externalAccountId");

-- CreateIndex
CREATE INDEX "NetWorthSnapshot_userId_capturedAt_idx" ON "NetWorthSnapshot"("userId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "NetWorthSnapshot_userId_dateKey_key" ON "NetWorthSnapshot"("userId", "dateKey");

-- CreateIndex
CREATE UNIQUE INDEX "AssetLot_vestEventId_key" ON "AssetLot"("vestEventId");

-- CreateIndex
CREATE UNIQUE INDEX "PaycheckProfile_userId_key" ON "PaycheckProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SCorpProfile_userId_key" ON "SCorpProfile"("userId");

-- CreateIndex
CREATE INDEX "W2Snapshot_userId_taxYear_idx" ON "W2Snapshot"("userId", "taxYear");

-- CreateIndex
CREATE INDEX "W2Snapshot_userId_documentHash_idx" ON "W2Snapshot"("userId", "documentHash");

-- AddForeignKey
ALTER TABLE "AuthUser" ADD CONSTRAINT "AuthUser_profileUserId_fkey" FOREIGN KEY ("profileUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AuthUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthAccount" ADD CONSTRAINT "AuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AuthUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaidDeveloperCredential" ADD CONSTRAINT "PlaidDeveloperCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaidItem" ADD CONSTRAINT "PlaidItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaidItem" ADD CONSTRAINT "PlaidItem_developerCredentialId_fkey" FOREIGN KEY ("developerCredentialId") REFERENCES "PlaidDeveloperCredential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaidAccount" ADD CONSTRAINT "PlaidAccount_plaidItemId_fkey" FOREIGN KEY ("plaidItemId") REFERENCES "PlaidItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaidHolding" ADD CONSTRAINT "PlaidHolding_plaidAccountId_fkey" FOREIGN KEY ("plaidAccountId") REFERENCES "PlaidAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaidHolding" ADD CONSTRAINT "PlaidHolding_plaidSecurityId_fkey" FOREIGN KEY ("plaidSecurityId") REFERENCES "PlaidSecurity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaidTaxLot" ADD CONSTRAINT "PlaidTaxLot_plaidHoldingId_fkey" FOREIGN KEY ("plaidHoldingId") REFERENCES "PlaidHolding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaidLiability" ADD CONSTRAINT "PlaidLiability_plaidAccountId_fkey" FOREIGN KEY ("plaidAccountId") REFERENCES "PlaidAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaidSyncRun" ADD CONSTRAINT "PlaidSyncRun_plaidItemId_fkey" FOREIGN KEY ("plaidItemId") REFERENCES "PlaidItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinbaseConnection" ADD CONSTRAINT "CoinbaseConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinbaseAccount" ADD CONSTRAINT "CoinbaseAccount_coinbaseConnectionId_fkey" FOREIGN KEY ("coinbaseConnectionId") REFERENCES "CoinbaseConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetWorthSnapshot" ADD CONSTRAINT "NetWorthSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetLot" ADD CONSTRAINT "AssetLot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetLot" ADD CONSTRAINT "AssetLot_vestEventId_fkey" FOREIGN KEY ("vestEventId") REFERENCES "VestEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoldingPosition" ADD CONSTRAINT "HoldingPosition_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RsuGrant" ADD CONSTRAINT "RsuGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VestEvent" ADD CONSTRAINT "VestEvent_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "RsuGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualAsset" ADD CONSTRAINT "ManualAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liability" ADD CONSTRAINT "Liability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentLoan" ADD CONSTRAINT "StudentLoan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaycheckProfile" ADD CONSTRAINT "PaycheckProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SCorpProfile" ADD CONSTRAINT "SCorpProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "W2Snapshot" ADD CONSTRAINT "W2Snapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedSale" ADD CONSTRAINT "PlannedSale_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategySuggestion" ADD CONSTRAINT "StrategySuggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

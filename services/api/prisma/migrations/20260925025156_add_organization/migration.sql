-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('active', 'inactive');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "pan_number" TEXT,
    "vat_number" TEXT,
    "contact" TEXT,
    "address" TEXT,
    "currency" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kathmandu',
    "status" "OrganizationStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."AutomationChoice" AS ENUM ('oui', 'non', 'peut_etre');

-- CreateTable
CREATE TABLE "public"."feedbacks" (
    "id" UUID NOT NULL,
    "version" VARCHAR(20) NOT NULL DEFAULT 'v1',
    "zip_par_mail" BOOLEAN NOT NULL,
    "outil_automatise" "public"."AutomationChoice" NOT NULL,
    "plateforme_reception" VARCHAR(40) NOT NULL,
    "plateforme_autre" VARCHAR(120),
    "vods_par_mois" VARCHAR(20) NOT NULL,
    "profil" VARCHAR(40) NOT NULL,
    "manque" TEXT,
    "email" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedbacks_pkey" PRIMARY KEY ("id")
);


-- Inscription libre jusqu'a N chaines (0 = coupee) : colonne additive, sans toucher aux donnees.
ALTER TABLE "invitation_settings" ADD COLUMN "open_until" INTEGER NOT NULL DEFAULT 0;

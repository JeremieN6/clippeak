-- Ouverture automatique par lots (0 = manuelle) : colonne additive, sans toucher aux donnees.
ALTER TABLE "invitation_settings" ADD COLUMN "auto_open_batch" INTEGER NOT NULL DEFAULT 0;

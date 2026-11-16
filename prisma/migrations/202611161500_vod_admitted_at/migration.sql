-- Gratuit compte en lives (2 par mois) : date d'admission d'une VOD comme live du mois (additive : colonne facultative, aucune donnee modifiee).
ALTER TABLE "public"."vods" ADD COLUMN "admitted_at" TIMESTAMP(3);

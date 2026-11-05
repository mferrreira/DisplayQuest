-- plan-v15 S04 (R9): slot equipável. Default false — ninguém começa equipado.
ALTER TABLE "user_badges" ADD COLUMN     "equipped" BOOLEAN NOT NULL DEFAULT false;

-- Legacy clients used a display sentinel. Keep absence canonical in PostgreSQL.
UPDATE "User"
SET "rfidUid" = NULL
WHERE "rfidUid" IS NULL
   OR BTRIM("rfidUid") = ''
   OR UPPER(BTRIM("rfidUid")) = 'NOT LINKED';

CREATE TABLE "FaceProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "embedding" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "dimension" INTEGER NOT NULL,
    "imagePath" TEXT NOT NULL,
    "imageMimeType" TEXT NOT NULL DEFAULT 'image/jpeg',
    "imageSize" INTEGER NOT NULL,
    "imageSha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FaceProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FaceProfile_userId_key" ON "FaceProfile"("userId");
CREATE INDEX "FaceProfile_model_dimension_idx" ON "FaceProfile"("model", "dimension");

ALTER TABLE "FaceProfile"
ADD CONSTRAINT "FaceProfile_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

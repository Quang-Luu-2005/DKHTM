-- Face enrollment is server-derived. A status without a durable template must
-- not be presented as enrolled or used for access.
UPDATE "User" AS users
SET "faceIdStatus" = 'PENDING'
WHERE users."faceIdStatus" = 'ENROLLED'
  AND NOT EXISTS (
    SELECT 1
    FROM "FaceProfile" AS profiles
    WHERE profiles."userId" = users."id"
  );

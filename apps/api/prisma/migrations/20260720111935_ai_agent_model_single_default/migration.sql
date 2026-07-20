-- PartialIndex: at most one AiAgentModel row may have isDefault = true at any time. App-level
-- code (AiAgentModelsService.create/setDefault) already tries to enforce "exactly one default,"
-- but a plain count()-then-create/update has a TOCTOU race under concurrent requests — this
-- unique partial index makes the invariant hold at the DB level regardless of timing. Prisma's
-- schema DSL can't express a partial index, so it's added by hand here, same as the Enrollment
-- CHECK constraints above.
CREATE UNIQUE INDEX "AiAgentModel_isDefault_key" ON "AiAgentModel" ("isDefault") WHERE "isDefault" = true;

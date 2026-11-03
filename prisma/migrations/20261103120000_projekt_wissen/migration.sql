-- TOF-0839 Projekt-Wissen (Tarek 03.11.2026). Rein additiv: neue Tabellen + eine Tenant-Spalte.
-- ProjectContext bleibt unverändert bestehen; sein Inhalt wird unten als angepinnte Seite „stand“
-- übernommen (alle Fassungen als Versionen, die Geschichte bleibt erhalten).
-- Die Volltext-Spalten "suche" sind GENERATED (Postgres ≥ 12) — Prisma kennt sie als Unsupported.
-- Eine Transaktion: schlägt ein Schritt fehl, bleibt die DB unverändert (danach nur
-- `prisma migrate resolve --rolled-back 20261103120000_projekt_wissen`, siehe docs/WISSEN.md).

BEGIN;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "keineExterneKi" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "WissenSeite" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titel" TEXT NOT NULL,
    "art" TEXT NOT NULL DEFAULT 'seite',
    "inhalt" TEXT NOT NULL,
    "angepinnt" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aktualisiertAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aktualisiertVonId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "suche" tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('german'::regconfig, coalesce("titel", '')), 'A') ||
        setweight(to_tsvector('german'::regconfig, coalesce("inhalt", '')), 'B')
    ) STORED,

    CONSTRAINT "WissenSeite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WissenVersion" (
    "id" TEXT NOT NULL,
    "seiteId" TEXT NOT NULL,
    "titel" TEXT NOT NULL,
    "art" TEXT NOT NULL,
    "inhalt" TEXT NOT NULL,
    "userId" TEXT,
    "vonName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WissenVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entscheidung" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "datum" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "wer" TEXT NOT NULL,
    "was" TEXT NOT NULL,
    "warum" TEXT NOT NULL,
    "aufgaben" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "korrigiertId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "suche" tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('german'::regconfig, coalesce("was", '')), 'A') ||
        setweight(to_tsvector('german'::regconfig, coalesce("warum", '')), 'B')
    ) STORED, -- TOF-Nummern (aufgaben) sucht die Abfrage per ILIKE; array_to_string ist nicht IMMUTABLE.

    CONSTRAINT "Entscheidung_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WissenLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "seiteId" TEXT NOT NULL,
    "typ" TEXT NOT NULL,
    "ziel" TEXT NOT NULL,

    CONSTRAINT "WissenLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WissenSeite_tenantId_projectId_idx" ON "WissenSeite"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "WissenSeite_suche_idx" ON "WissenSeite" USING GIN ("suche");

-- CreateIndex
CREATE UNIQUE INDEX "WissenSeite_projectId_slug_key" ON "WissenSeite"("projectId", "slug");

-- CreateIndex
CREATE INDEX "WissenVersion_seiteId_createdAt_idx" ON "WissenVersion"("seiteId", "createdAt");

-- CreateIndex
CREATE INDEX "Entscheidung_tenantId_projectId_datum_idx" ON "Entscheidung"("tenantId", "projectId", "datum");

-- CreateIndex
CREATE INDEX "Entscheidung_suche_idx" ON "Entscheidung" USING GIN ("suche");

-- CreateIndex
CREATE INDEX "WissenLink_tenantId_typ_ziel_idx" ON "WissenLink"("tenantId", "typ", "ziel");

-- CreateIndex
CREATE UNIQUE INDEX "WissenLink_seiteId_typ_ziel_key" ON "WissenLink"("seiteId", "typ", "ziel");

-- AddForeignKey
ALTER TABLE "WissenSeite" ADD CONSTRAINT "WissenSeite_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WissenSeite" ADD CONSTRAINT "WissenSeite_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WissenSeite" ADD CONSTRAINT "WissenSeite_aktualisiertVonId_fkey" FOREIGN KEY ("aktualisiertVonId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WissenVersion" ADD CONSTRAINT "WissenVersion_seiteId_fkey" FOREIGN KEY ("seiteId") REFERENCES "WissenSeite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WissenVersion" ADD CONSTRAINT "WissenVersion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entscheidung" ADD CONSTRAINT "Entscheidung_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entscheidung" ADD CONSTRAINT "Entscheidung_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entscheidung" ADD CONSTRAINT "Entscheidung_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WissenLink" ADD CONSTRAINT "WissenLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WissenLink" ADD CONSTRAINT "WissenLink_seiteId_fkey" FOREIGN KEY ("seiteId") REFERENCES "WissenSeite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Art als Prüfregel (Prisma führt sie nicht, lässt sie aber stehen).
ALTER TABLE "WissenSeite" ADD CONSTRAINT "WissenSeite_art_check" CHECK ("art" IN ('stand', 'regeln', 'adressen', 'seite'));

-- ── Daten: ProjectContext → WissenSeite „stand“ (je Projekt mit mind. einer Fassung) ──
-- Ids deterministisch aus den Quellzeilen ('ws_' + Projekt, 'wv_' + Fassung): ein erneuter Lauf
-- auf einer Kopie erzeugt dieselben Ids, keine Doppel.
INSERT INTO "WissenSeite" ("id", "tenantId", "projectId", "slug", "titel", "art", "inhalt", "angepinnt", "createdAt", "aktualisiertAm", "aktualisiertVonId")
SELECT 'ws_' || p."id", p."tenantId", p."id", 'stand', 'Stand', 'stand', l."content", true, f."createdAt", l."createdAt", l."userId"
  FROM "Project" p
  JOIN LATERAL (SELECT c."content", c."createdAt", c."userId" FROM "ProjectContext" c WHERE c."projectId" = p."id" ORDER BY c."createdAt" DESC LIMIT 1) l ON true
  JOIN LATERAL (SELECT c."createdAt" FROM "ProjectContext" c WHERE c."projectId" = p."id" ORDER BY c."createdAt" ASC LIMIT 1) f ON true
ON CONFLICT DO NOTHING;

INSERT INTO "WissenVersion" ("id", "seiteId", "titel", "art", "inhalt", "userId", "vonName", "createdAt")
SELECT 'wv_' || c."id", 'ws_' || c."projectId", 'Stand', 'stand', c."content", c."userId", coalesce(u."name", '?'), c."createdAt"
  FROM "ProjectContext" c
  JOIN "WissenSeite" s ON s."id" = 'ws_' || c."projectId"
  LEFT JOIN "User" u ON u."id" = c."userId"
ON CONFLICT DO NOTHING;

-- Verweise der übernommenen Seiten (TOF-XXXX). [[slug]]-Verweise gab es im alten Kontext nicht.
INSERT INTO "WissenLink" ("id", "tenantId", "seiteId", "typ", "ziel")
SELECT DISTINCT 'wl_' || md5(s."id" || m[1]), s."tenantId", s."id", 'aufgabe', 'TOF-' || m[1]
  FROM "WissenSeite" s, regexp_matches(s."inhalt", '\mTOF-(\d{4})\M', 'g') AS m
ON CONFLICT DO NOTHING;

-- ── Mandanten-Schalter: „Marine“-Mandanten dürfen nie an externe KI (Projekt-Regel). ──
UPDATE "Tenant" SET "keineExterneKi" = true
 WHERE "slug" ILIKE '%marin%' OR "name" ILIKE '%marin%';
-- Weitere Mandanten von Hand: UPDATE "Tenant" SET "keineExterneKi" = true WHERE "slug" = '<slug>';

COMMIT;

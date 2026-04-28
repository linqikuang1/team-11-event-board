-- CreateTable
CREATE TABLE "SavedEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "savedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "SavedEvent_userId_savedAt_idx" ON "SavedEvent"("userId", "savedAt");

-- CreateIndex
CREATE INDEX "SavedEvent_eventId_idx" ON "SavedEvent"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedEvent_userId_eventId_key" ON "SavedEvent"("userId", "eventId");

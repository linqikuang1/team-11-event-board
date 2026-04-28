import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import Database from "better-sqlite3";

function resolveSqliteFilename(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return "prisma/dev.db";
  }
  if (url.startsWith("file:")) {
    return url.slice("file:".length);
  }
  return url;
}

function createPrismaClient(): PrismaClient {
  const filename = resolveSqliteFilename();
  const sqlite = new Database(filename);
  const adapter = new PrismaBetterSqlite3(sqlite);
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}


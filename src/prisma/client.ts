import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

function resolveSqliteFilename(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return "file:prisma/dev.db";
  }
  if (!url.startsWith("file:")) {
    return `file:${url}`;
  }
  return url;
}

function createPrismaClient(): PrismaClient {
  const url = resolveSqliteFilename();
  const adapter = new PrismaBetterSqlite3({ url });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
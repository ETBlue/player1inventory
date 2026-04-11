import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

// Prisma 7 with prisma.config.ts (earlyAccess: true) requires datasourceUrl
// to be passed explicitly — it does not read DATABASE_URL automatically.
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL,
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

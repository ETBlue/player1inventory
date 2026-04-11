import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

// DATABASE_URL is picked up automatically by Prisma from the environment.
// Do not pass it programmatically — the option does not exist in this Prisma version.
export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

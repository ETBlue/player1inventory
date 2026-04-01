/**
 * One-time migration: infer expirationMode for existing MongoDB items.
 *
 * Run before deploying the updated server:
 *   npx tsx apps/server/src/scripts/migrate-expiration-mode.ts
 *
 * Logic:
 *   - estimatedDueDays is set → 'days from purchase'
 *   - dueDate is set (no estimatedDueDays) → 'date'
 *   - neither → 'disabled'
 */
import mongoose from 'mongoose'
import { ItemModel } from '../models/Item.model.js'

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI environment variable is required')

  await mongoose.connect(uri)
  console.log('Connected to MongoDB')

  const items = await ItemModel.find({ expirationMode: { $exists: false } })
  console.log(`Found ${items.length} items without expirationMode`)

  let updated = 0
  for (const item of items) {
    const mode =
      item.estimatedDueDays != null
        ? 'days from purchase'
        : item.dueDate != null
          ? 'date'
          : 'disabled'

    await ItemModel.updateOne({ _id: item._id }, { $set: { expirationMode: mode } })
    updated++
  }

  console.log(`Updated ${updated} items`)
  await mongoose.disconnect()
  console.log('Done')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

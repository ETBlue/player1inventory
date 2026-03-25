import 'dotenv/config'
import mongoose from 'mongoose'
import { ItemModel } from '../src/models/Item.model.js'

const EPOCH_CUTOFF = new Date('2000-01-01')

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('Error: MONGODB_URI environment variable is not set.')
    process.exit(1)
  }

  console.log('Connecting to MongoDB...')
  await mongoose.connect(uri)
  console.log('Connected.')

  const query = { dueDate: { $exists: true, $lt: EPOCH_CUTOFF } }

  const count = await ItemModel.countDocuments(query)
  console.log(`Found ${count} items with epoch dueDate.`)

  if (count > 0) {
    const result = await ItemModel.updateMany(query, {
      $unset: { dueDate: '', estimatedDueDays: '', expirationThreshold: '' },
    })
    console.log(`Updated ${result.modifiedCount} items.`)
  } else {
    console.log('Updated 0 items.')
  }

  await mongoose.disconnect()
  console.log('Done.')
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})

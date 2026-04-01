import { prop, getModelForClass, modelOptions, index } from '@typegoose/typegoose'
import mongoose from 'mongoose'
import type { ExpirationMode, Item } from '@p1i/types'

@modelOptions({ schemaOptions: { timestamps: true, collection: 'items' } })
@index({ familyId: 1, updatedAt: 1 })
@index({ familyId: 1, name: 1 })
class ItemClass implements Omit<Item, 'id'> {
  @prop({ type: String, default: () => new mongoose.Types.ObjectId().toString() })
  _id!: string

  @prop({ required: true, type: String })
  name!: string

  @prop({ type: [String], default: [] })
  tagIds!: string[]

  @prop({ type: [String] })
  vendorIds?: string[]

  @prop({ type: String })
  packageUnit?: string

  @prop({ type: String })
  measurementUnit?: string

  @prop({ type: Number })
  amountPerPackage?: number

  @prop({ required: true, type: String, enum: ['package', 'measurement'] })
  targetUnit!: 'package' | 'measurement'

  @prop({ required: true, type: Number, default: 0 })
  targetQuantity!: number

  @prop({ required: true, type: Number, default: 0 })
  refillThreshold!: number

  @prop({ required: true, type: Number, default: 0 })
  packedQuantity!: number

  @prop({ required: true, type: Number, default: 0 })
  unpackedQuantity!: number

  @prop({ required: true, type: Number, default: 1 })
  consumeAmount!: number

  @prop({ type: Date })
  dueDate?: Date

  @prop({ type: Number })
  estimatedDueDays?: number

  @prop({ type: Number })
  expirationThreshold?: number

  @prop({ type: String, enum: ['disabled', 'date', 'days from purchase'], default: 'disabled' })
  expirationMode?: ExpirationMode

  // Multi-user fields
  @prop({ required: true, type: String })
  userId!: string

  @prop({ type: String })
  familyId?: string

  // Populated by @modelOptions timestamps: true
  createdAt!: Date
  updatedAt!: Date
}

export const ItemModel = getModelForClass(ItemClass)
export type { ItemClass }

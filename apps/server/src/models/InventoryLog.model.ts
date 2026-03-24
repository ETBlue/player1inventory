import { getModelForClass, index, modelOptions, prop } from '@typegoose/typegoose'
import mongoose from 'mongoose'

@modelOptions({ schemaOptions: { timestamps: false, collection: 'inventoryLogs' } })
@index({ itemId: 1, occurredAt: -1 })
class InventoryLogClass {
  @prop({ type: String, default: () => new mongoose.Types.ObjectId().toString() })
  _id!: string

  @prop({ required: true, type: String })
  itemId!: string

  @prop({ required: true, type: Number })
  delta!: number

  @prop({ required: true, type: Number })
  quantity!: number

  @prop({ required: true, type: Date })
  occurredAt!: Date

  @prop({ required: true, type: String })
  userId!: string

  @prop({ required: false, type: String })
  note?: string
}

export const InventoryLogModel = getModelForClass(InventoryLogClass)
export type { InventoryLogClass }

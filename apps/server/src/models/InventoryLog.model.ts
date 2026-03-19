import { getModelForClass, index, modelOptions, prop } from '@typegoose/typegoose'

@modelOptions({ schemaOptions: { timestamps: false, collection: 'inventoryLogs' } })
@index({ itemId: 1, occurredAt: -1 })
class InventoryLogClass {
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

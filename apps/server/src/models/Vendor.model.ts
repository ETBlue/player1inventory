import { getModelForClass, index, modelOptions, prop } from '@typegoose/typegoose'
import mongoose from 'mongoose'
import type { Vendor } from '@p1i/types'

@modelOptions({ schemaOptions: { timestamps: false, collection: 'vendors' } })
@index({ userId: 1, name: 1 })
@index({ familyId: 1, name: 1 })
class VendorClass implements Omit<Vendor, 'id' | 'createdAt'> {
  @prop({ type: String, default: () => new mongoose.Types.ObjectId().toString() })
  _id!: string

  @prop({ required: true, type: String })
  name!: string

  // Multi-user fields
  @prop({ required: true, type: String })
  userId!: string

  @prop({ type: String })
  familyId?: string
}

export const VendorModel = getModelForClass(VendorClass)
export type { VendorClass }

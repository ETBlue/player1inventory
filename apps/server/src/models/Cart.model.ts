import { getModelForClass, index, modelOptions, prop } from '@typegoose/typegoose'
import mongoose from 'mongoose'

@modelOptions({ schemaOptions: { timestamps: true, collection: 'carts' } })
@index({ userId: 1, status: 1 })
class CartClass {
  @prop({ type: String, default: () => new mongoose.Types.ObjectId().toString() })
  _id!: string

  @prop({ required: true, type: String })
  status!: 'active' | 'completed' | 'abandoned'

  @prop({ required: true, type: String })
  userId!: string

  @prop({ type: String })
  familyId?: string

  @prop({ type: Date })
  completedAt?: Date

  createdAt!: Date
  updatedAt!: Date
}

export const CartModel = getModelForClass(CartClass)
export type { CartClass }

@modelOptions({ schemaOptions: { timestamps: false, collection: 'cartItems' } })
@index({ cartId: 1 })
@index({ itemId: 1 })
class CartItemClass {
  @prop({ type: String, default: () => new mongoose.Types.ObjectId().toString() })
  _id!: string

  @prop({ required: true, type: String })
  cartId!: string

  @prop({ required: true, type: String })
  itemId!: string

  @prop({ required: true, type: Number })
  quantity!: number

  @prop({ required: true, type: String })
  userId!: string
}

export const CartItemModel = getModelForClass(CartItemClass)
export type { CartItemClass }

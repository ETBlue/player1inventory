import { getModelForClass, index, modelOptions, prop } from '@typegoose/typegoose'

@modelOptions({ schemaOptions: { timestamps: true, collection: 'carts' } })
@index({ userId: 1, status: 1 })
class CartClass {
  @prop({ required: true })
  status!: 'active' | 'completed' | 'abandoned'

  @prop({ required: true })
  userId!: string

  @prop()
  familyId?: string

  @prop()
  completedAt?: Date

  createdAt!: Date
  updatedAt!: Date
}

export const CartModel = getModelForClass(CartClass)

@modelOptions({ schemaOptions: { timestamps: false, collection: 'cartItems' } })
@index({ cartId: 1 })
@index({ itemId: 1 })
class CartItemClass {
  @prop({ required: true })
  cartId!: string

  @prop({ required: true })
  itemId!: string

  @prop({ required: true })
  quantity!: number

  @prop({ required: true })
  userId!: string
}

export const CartItemModel = getModelForClass(CartItemClass)

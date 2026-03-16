import { getModelForClass, index, modelOptions, prop } from '@typegoose/typegoose'
import type { Recipe } from '@p1i/types'

class RecipeItemClass {
  @prop({ required: true, type: String })
  itemId!: string

  @prop({ required: true, type: Number })
  defaultAmount!: number
}

@modelOptions({ schemaOptions: { timestamps: false, collection: 'recipes' } })
@index({ userId: 1, name: 1 })
@index({ familyId: 1, name: 1 })
class RecipeClass implements Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'> {
  @prop({ required: true, type: String })
  name!: string

  @prop({ type: () => [RecipeItemClass], default: [] })
  items!: RecipeItemClass[]

  @prop({ type: Date })
  lastCookedAt?: Date

  // Multi-user fields
  @prop({ required: true, type: String })
  userId!: string

  @prop({ type: String })
  familyId?: string

  createdAt!: Date
  updatedAt!: Date
}

export const RecipeModel = getModelForClass(RecipeClass)
export type { RecipeClass }

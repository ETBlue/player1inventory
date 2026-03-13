import { getModelForClass, index, modelOptions, prop } from '@typegoose/typegoose'

@modelOptions({ schemaOptions: { timestamps: true, collection: 'familygroups' } })
@index({ code: 1 }, { unique: true })
class FamilyGroupClass {
  @prop({ type: String, required: true })
  name!: string

  @prop({ type: String, required: true })
  code!: string

  @prop({ type: String, required: true })
  ownerUserId!: string

  @prop({ type: [String], default: [] })
  memberUserIds!: string[]

  createdAt!: Date
  updatedAt!: Date
}

export const FamilyGroupModel = getModelForClass(FamilyGroupClass)
export type { FamilyGroupClass }

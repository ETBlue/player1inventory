import { getModelForClass, index, modelOptions, prop } from '@typegoose/typegoose'
import type { Tag, TagColor, TagType } from '@p1i/types'

@modelOptions({ schemaOptions: { timestamps: false, collection: 'tagTypes' } })
@index({ userId: 1, name: 1 })
@index({ familyId: 1, name: 1 })
class TagTypeClass implements Omit<TagType, 'id'> {
  @prop({ required: true, type: String })
  name!: string

  @prop({ required: true, type: String })
  color!: TagColor

  // Multi-user fields
  @prop({ required: true, type: String })
  userId!: string

  @prop({ type: String })
  familyId?: string
}

@modelOptions({ schemaOptions: { timestamps: false, collection: 'tags' } })
@index({ userId: 1, typeId: 1 })
@index({ familyId: 1, typeId: 1 })
class TagClass implements Omit<Tag, 'id'> {
  @prop({ required: true, type: String })
  name!: string

  @prop({ required: true, type: String })
  typeId!: string

  // Multi-user fields
  @prop({ required: true, type: String })
  userId!: string

  @prop({ type: String })
  familyId?: string
}

export const TagTypeModel = getModelForClass(TagTypeClass)
export const TagModel = getModelForClass(TagClass)
export type { TagTypeClass, TagClass }

// Future feature (deferred from Phase B): OnboardingWelcome will include an "Import backup"
// option that reuses ImportCard logic. When triggered, a successful import skips the rest of
// onboarding and navigates to '/'. Deferred because it adds complexity (file picker, conflict
// dialog) to Phase B scope.

import { TagColor } from '@/types'

export interface TemplateTagType {
  key: string
  i18nKey: string
  color: TagColor
}

export interface TemplateTag {
  key: string
  i18nKey: string
  typeKey: string
  parentKey?: string
}

export interface TemplateItem {
  key: string
  i18nKey: string
  tagKeys: string[]
}

export interface TemplateVendor {
  key: string
  i18nKey: string
}

export const templateTagTypes: TemplateTagType[] = [
  {
    key: 'category',
    i18nKey: 'template.tagTypes.category',
    color: TagColor.pink,
  },
  {
    key: 'preservation',
    i18nKey: 'template.tagTypes.preservation',
    color: TagColor.cyan,
  },
]

export const templateTags: TemplateTag[] = [
  // Preservation (flat)
  {
    key: 'room-temperature',
    i18nKey: 'template.tags.room-temperature',
    typeKey: 'preservation',
  },
  {
    key: 'refrigerated',
    i18nKey: 'template.tags.refrigerated',
    typeKey: 'preservation',
  },
  { key: 'frozen', i18nKey: 'template.tags.frozen', typeKey: 'preservation' },

  // Category — top-level
  {
    key: 'food-and-dining',
    i18nKey: 'template.tags.food-and-dining',
    typeKey: 'category',
  },
  {
    key: 'health-and-beauty',
    i18nKey: 'template.tags.health-and-beauty',
    typeKey: 'category',
  },
  { key: 'household', i18nKey: 'template.tags.household', typeKey: 'category' },

  // Under food-and-dining
  {
    key: 'produce',
    i18nKey: 'template.tags.produce',
    typeKey: 'category',
    parentKey: 'food-and-dining',
  },
  {
    key: 'grains',
    i18nKey: 'template.tags.grains',
    typeKey: 'category',
    parentKey: 'food-and-dining',
  },
  {
    key: 'seasonings',
    i18nKey: 'template.tags.seasonings',
    typeKey: 'category',
    parentKey: 'food-and-dining',
  },
  {
    key: 'drinks',
    i18nKey: 'template.tags.drinks',
    typeKey: 'category',
    parentKey: 'food-and-dining',
  },
  {
    key: 'snacks',
    i18nKey: 'template.tags.snacks',
    typeKey: 'category',
    parentKey: 'food-and-dining',
  },
  {
    key: 'sweets',
    i18nKey: 'template.tags.sweets',
    typeKey: 'category',
    parentKey: 'food-and-dining',
  },
  {
    key: 'prepared',
    i18nKey: 'template.tags.prepared',
    typeKey: 'category',
    parentKey: 'food-and-dining',
  },
  {
    key: 'cooked',
    i18nKey: 'template.tags.cooked',
    typeKey: 'category',
    parentKey: 'food-and-dining',
  },

  // Under produce
  {
    key: 'meat',
    i18nKey: 'template.tags.meat',
    typeKey: 'category',
    parentKey: 'produce',
  },
  {
    key: 'vegetables',
    i18nKey: 'template.tags.vegetables',
    typeKey: 'category',
    parentKey: 'produce',
  },
  {
    key: 'fruits',
    i18nKey: 'template.tags.fruits',
    typeKey: 'category',
    parentKey: 'produce',
  },
  {
    key: 'mushrooms',
    i18nKey: 'template.tags.mushrooms',
    typeKey: 'category',
    parentKey: 'produce',
  },

  // Under health-and-beauty
  {
    key: 'cleansing',
    i18nKey: 'template.tags.cleansing',
    typeKey: 'category',
    parentKey: 'health-and-beauty',
  },
  {
    key: 'personal-care',
    i18nKey: 'template.tags.personal-care',
    typeKey: 'category',
    parentKey: 'health-and-beauty',
  },
  {
    key: 'oral-health',
    i18nKey: 'template.tags.oral-health',
    typeKey: 'category',
    parentKey: 'health-and-beauty',
  },

  // Under household
  {
    key: 'cleaning-and-sanitizing',
    i18nKey: 'template.tags.cleaning-and-sanitizing',
    typeKey: 'category',
    parentKey: 'household',
  },
  {
    key: 'kitchen-supplies',
    i18nKey: 'template.tags.kitchen-supplies',
    typeKey: 'category',
    parentKey: 'household',
  },
]

export const templateItems: TemplateItem[] = [
  {
    key: 'rice',
    i18nKey: 'template.items.rice',
    tagKeys: ['room-temperature', 'grains'],
  },
  {
    key: 'eggs',
    i18nKey: 'template.items.eggs',
    tagKeys: ['refrigerated', 'produce'],
  },
  {
    key: 'milk',
    i18nKey: 'template.items.milk',
    tagKeys: ['refrigerated', 'drinks'],
  },
  {
    key: 'chicken-breast',
    i18nKey: 'template.items.chicken-breast',
    tagKeys: ['frozen', 'meat'],
  },
  {
    key: 'pork-belly',
    i18nKey: 'template.items.pork-belly',
    tagKeys: ['frozen', 'meat'],
  },
  {
    key: 'tofu',
    i18nKey: 'template.items.tofu',
    tagKeys: ['refrigerated', 'produce'],
  },
  {
    key: 'spinach',
    i18nKey: 'template.items.spinach',
    tagKeys: ['refrigerated', 'vegetables'],
  },
  {
    key: 'tomato',
    i18nKey: 'template.items.tomato',
    tagKeys: ['room-temperature', 'vegetables'],
  },
  {
    key: 'potato',
    i18nKey: 'template.items.potato',
    tagKeys: ['room-temperature', 'vegetables'],
  },
  {
    key: 'carrot',
    i18nKey: 'template.items.carrot',
    tagKeys: ['refrigerated', 'vegetables'],
  },
  {
    key: 'apple',
    i18nKey: 'template.items.apple',
    tagKeys: ['room-temperature', 'fruits'],
  },
  {
    key: 'instant-noodles',
    i18nKey: 'template.items.instant-noodles',
    tagKeys: ['room-temperature', 'grains'],
  },
  {
    key: 'soy-sauce',
    i18nKey: 'template.items.soy-sauce',
    tagKeys: ['room-temperature', 'seasonings'],
  },
  {
    key: 'cooking-oil',
    i18nKey: 'template.items.cooking-oil',
    tagKeys: ['room-temperature', 'seasonings'],
  },
  {
    key: 'salt',
    i18nKey: 'template.items.salt',
    tagKeys: ['room-temperature', 'seasonings'],
  },
  {
    key: 'bottled-water',
    i18nKey: 'template.items.bottled-water',
    tagKeys: ['room-temperature', 'drinks'],
  },
  {
    key: 'toothpaste',
    i18nKey: 'template.items.toothpaste',
    tagKeys: ['room-temperature', 'oral-health'],
  },
  {
    key: 'shampoo',
    i18nKey: 'template.items.shampoo',
    tagKeys: ['room-temperature', 'cleansing'],
  },
  {
    key: 'dish-soap',
    i18nKey: 'template.items.dish-soap',
    tagKeys: ['room-temperature', 'cleaning-and-sanitizing'],
  },
  {
    key: 'toilet-paper',
    i18nKey: 'template.items.toilet-paper',
    tagKeys: ['room-temperature', 'kitchen-supplies'],
  },
]

export const templateVendors: TemplateVendor[] = [
  { key: 'costco', i18nKey: 'template.vendors.costco' },
  { key: 'px-mart', i18nKey: 'template.vendors.px-mart' },
  { key: 'simple-mart', i18nKey: 'template.vendors.simple-mart' },
  { key: 'rt-mart', i18nKey: 'template.vendors.rt-mart' },
  { key: 'carrefour', i18nKey: 'template.vendors.carrefour' },
  { key: 'i-mei', i18nKey: 'template.vendors.i-mei' },
  { key: 'lopia', i18nKey: 'template.vendors.lopia' },
  { key: 'city-super', i18nKey: 'template.vendors.city-super' },
  { key: 'mia-cbon', i18nKey: 'template.vendors.mia-cbon' },
  { key: 'jasons', i18nKey: 'template.vendors.jasons' },
  { key: 'poya', i18nKey: 'template.vendors.poya' },
  { key: 'nitori', i18nKey: 'template.vendors.nitori' },
  { key: 'ikea', i18nKey: 'template.vendors.ikea' },
  { key: 'cosmed', i18nKey: 'template.vendors.cosmed' },
  { key: 'watsons', i18nKey: 'template.vendors.watsons' },
  { key: 'family-mart', i18nKey: 'template.vendors.family-mart' },
  { key: '7-eleven', i18nKey: 'template.vendors.7-eleven' },
  { key: 'momo', i18nKey: 'template.vendors.momo' },
  { key: 'pchome', i18nKey: 'template.vendors.pchome' },
]

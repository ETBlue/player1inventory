export const DEFAULT_PACKAGE_UNIT = 'pack'

export type ExpirationMode = 'disabled' | 'date' | 'days from purchase'

export interface Item {
  id: string
  name: string
  tagIds: string[]
  vendorIds?: string[]

  // Dual-unit tracking
  packageUnit?: string
  measurementUnit?: string
  amountPerPackage?: number

  // Quantity tracking
  targetUnit: 'package' | 'measurement'
  targetQuantity: number
  refillThreshold: number
  packedQuantity: number
  unpackedQuantity: number

  // Consumption
  consumeAmount: number

  // Expiration
  dueDate?: Date
  estimatedDueDays?: number
  expirationThreshold?: number // Days before expiration to show warning
  expirationMode?: ExpirationMode

  // Metadata
  createdAt: Date
  updatedAt: Date
}

export interface Tag {
  id: string
  name: string
  typeId: string
  parentId?: string
}

export enum TagColor {
  orange = 'orange',
  brown = 'brown',
  amber = 'amber',
  lime = 'lime',
  green = 'green',
  teal = 'teal',
  cyan = 'cyan',
  blue = 'blue',
  indigo = 'indigo',
  purple = 'purple',
  pink = 'pink',
  rose = 'rose',
}

export interface TagType {
  id: string
  name: string
  color: TagColor
}

export interface InventoryLog {
  id: string
  itemId: string
  delta: number
  quantity: number
  note?: string
  occurredAt: Date
  createdAt: Date
}

export interface ShoppingCart {
  id: string
  status: 'active' | 'completed' | 'abandoned'
  createdAt: Date
  completedAt?: Date
}

export interface CartItem {
  id: string
  cartId: string
  itemId: string
  quantity: number
}

export interface Vendor {
  id: string
  name: string
  createdAt: Date
}

export interface RecipeItem {
  itemId: string
  defaultAmount: number // in item's native unit (measurement or package)
}

export interface Recipe {
  id: string
  name: string
  items: RecipeItem[]
  createdAt: Date
  updatedAt: Date
  lastCookedAt?: Date
}

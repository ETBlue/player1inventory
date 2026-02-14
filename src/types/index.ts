export interface Item {
  id: string
  name: string
  tagIds: string[]

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

  // Metadata
  createdAt: Date
  updatedAt: Date
}

export interface Tag {
  id: string
  name: string
  typeId: string
}

export enum TagColor {
  red = 'red',
  orange = 'orange',
  amber = 'amber',
  yellow = 'yellow',
  green = 'green',
  teal = 'teal',
  blue = 'blue',
  indigo = 'indigo',
  purple = 'purple',
  pink = 'pink',
  red_tint = 'red-tint',
  orange_tint = 'orange-tint',
  amber_tint = 'amber-tint',
  yellow_tint = 'yellow-tint',
  green_tint = 'green-tint',
  teal_tint = 'teal-tint',
  blue_tint = 'blue-tint',
  indigo_tint = 'indigo-tint',
  purple_tint = 'purple-tint',
  pink_tint = 'pink-tint',
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

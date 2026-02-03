export interface Item {
  id: string
  name: string
  unit?: string
  tagIds: string[]
  targetQuantity: number
  refillThreshold: number
  dueDate?: Date
  estimatedDueDays?: number
  createdAt: Date
  updatedAt: Date
}

export interface Tag {
  id: string
  name: string
  typeId: string
}

export interface TagType {
  id: string
  name: string
  color?: string
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

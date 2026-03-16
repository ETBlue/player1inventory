import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function load(filename: string): string {
  return readFileSync(join(__dirname, filename), 'utf-8')
}

export const typeDefs = [load('schema.graphql'), load('item.graphql'), load('tag.graphql'), load('vendor.graphql'), load('familyGroup.graphql'), load('import.graphql')]

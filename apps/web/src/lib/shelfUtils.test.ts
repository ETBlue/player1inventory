import { describe, expect, it } from 'vitest'
import type { FilterConfig, Item, Tag } from '@/types'
import { TagColor } from '@/types'
import {
  countSelectedFilters,
  defaultPicksFor,
  deriveFilterAxes,
  isFilterConfigSatisfiable,
  matchesFilterConfig,
} from './shelfUtils'

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'item-1',
    name: 'Test Item',
    tagIds: [],
    targetUnit: 'package' as const,
    consumeAmount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('matchesFilterConfig', () => {
  const noRecipes: { id: string; items: { itemId: string }[] }[] = []
  const noTags: Tag[] = []

  it('returns true when filterConfig is empty', () => {
    const item = makeItem()
    expect(matchesFilterConfig(item, {}, noRecipes, noTags)).toBe(true)
  })

  it('returns true for item with matching vendorId', () => {
    const item = makeItem({ vendorIds: ['vendor-1'] })
    expect(
      matchesFilterConfig(item, { vendorIds: ['vendor-1'] }, noRecipes, noTags),
    ).toBe(true)
  })

  it('returns false for item with non-matching vendorId', () => {
    const item = makeItem({ vendorIds: ['vendor-2'] })
    expect(
      matchesFilterConfig(item, { vendorIds: ['vendor-1'] }, noRecipes, noTags),
    ).toBe(false)
  })

  it('does not throw and returns false when item.vendorIds is null', () => {
    // Given an item whose vendorIds is null (imported from a backup JSON with null)
    const item = makeItem({
      vendorIds: null as unknown as string[],
    })

    // When matching against a vendor filter
    // Then it should not throw and return false (item has no vendors)
    expect(() =>
      matchesFilterConfig(item, { vendorIds: ['vendor-1'] }, noRecipes, noTags),
    ).not.toThrow()
    expect(
      matchesFilterConfig(item, { vendorIds: ['vendor-1'] }, noRecipes, noTags),
    ).toBe(false)
  })

  it('does not throw and returns false when item.vendorIds is undefined', () => {
    // Given an item with no vendorIds at all
    const item = makeItem()

    // When matching against a vendor filter
    // Then it should not throw and return false
    expect(() =>
      matchesFilterConfig(item, { vendorIds: ['vendor-1'] }, noRecipes, noTags),
    ).not.toThrow()
    expect(
      matchesFilterConfig(item, { vendorIds: ['vendor-1'] }, noRecipes, noTags),
    ).toBe(false)
  })

  it('does not throw when filterConfig.vendorIds is null (imported backup shelf)', () => {
    // Given a shelf filterConfig where vendorIds is null (from a backed-up JSON)
    // The default destructuring `const { vendorIds = [] } = filterConfig` does NOT
    // default null to [] — only undefined defaults. So null passes through and
    // vendorIds.length throws at runtime.
    const item = makeItem({ vendorIds: ['vendor-1'] })
    const filterConfigWithNull = {
      vendorIds: null as unknown as string[],
    }

    // When matching against the filterConfig
    // Then it should not throw
    expect(() =>
      matchesFilterConfig(item, filterConfigWithNull, noRecipes, noTags),
    ).not.toThrow()
  })
})

describe('isFilterConfigSatisfiable', () => {
  it('is true for a config whose vendor and recipe ids all resolve', () => {
    expect(
      isFilterConfigSatisfiable(
        { vendorIds: ['v1'], recipeIds: ['r1'] },
        [{ id: 'v1' }],
        [{ id: 'r1' }],
      ),
    ).toBe(true)
  })

  it('is false when every vendor id points at a deleted vendor', () => {
    // Given a vendor axis naming only ids absent from the catalog
    // Then no press could satisfy it without writing a dangling id
    expect(isFilterConfigSatisfiable({ vendorIds: ['gone'] }, [], [])).toBe(
      false,
    )
  })

  it('is false when every recipe id points at a deleted recipe', () => {
    expect(isFilterConfigSatisfiable({ recipeIds: ['gone'] }, [], [])).toBe(
      false,
    )
  })

  it('is true when a vendor axis has at least one resolvable id among dangling ones', () => {
    expect(
      isFilterConfigSatisfiable(
        { vendorIds: ['gone', 'v1'] },
        [{ id: 'v1' }],
        [],
      ),
    ).toBe(true)
  })

  it('is true for a tag-only config even when every tag id is dangling', () => {
    // matchesFilterConfig resolves tag ids through tags.find and SKIPS misses, so an
    // all-dangling tag axis is not a constraint at all — it cannot make a shelf unjoinable.
    expect(isFilterConfigSatisfiable({ tagIds: ['gone'] }, [], [])).toBe(true)
  })

  it('is true for an empty config', () => {
    expect(isFilterConfigSatisfiable({}, [], [])).toBe(true)
  })
})

describe('deriveFilterAxes', () => {
  // Fixtures — two tag types, so the AND-between-types rule is exercised.
  const tagTypes = [
    { id: 'tt-cat', name: 'Category', color: TagColor.blue },
    { id: 'tt-sto', name: 'Storage', color: TagColor.green },
  ]
  const tags = [
    { id: 'dairy', name: 'Dairy', typeId: 'tt-cat' },
    { id: 'frozen', name: 'Frozen', typeId: 'tt-cat' },
    { id: 'fridge', name: 'Fridge', typeId: 'tt-sto' },
  ]
  const vendors = [
    { id: 'v1', name: 'Costco' },
    { id: 'v2', name: '7-Eleven' },
  ]
  const recipes = [{ id: 'r1', name: 'Pancakes', items: [] }]
  const item = (over: Partial<Item> = {}) =>
    ({ id: 'i1', name: 'Oat Milk', tagIds: [], vendorIds: [], ...over }) as Item

  it('returns one axis per tag TYPE present in the config, labelled by the type name', () => {
    const axes = deriveFilterAxes(
      item(),
      { tagIds: ['dairy', 'frozen', 'fridge'] },
      tags,
      tagTypes,
      vendors,
      recipes,
    )
    expect(axes).toHaveLength(2)
    expect(axes.map((a) => a.typeName).sort()).toEqual(['Category', 'Storage'])
    // OR within a type: both Category options are offered as ONE axis.
    const category = axes.find((a) => a.key === 'tt-cat')
    expect(category?.options.map((o) => o.id)).toEqual(['dairy', 'frozen'])
  })

  it('marks a tag axis met when the item carries one of its tags', () => {
    const axes = deriveFilterAxes(
      item({ tagIds: ['frozen'] }),
      { tagIds: ['dairy', 'frozen'] },
      tags,
      tagTypes,
      vendors,
      recipes,
    )
    expect(axes[0]?.metBy).toBe('frozen')
  })

  it('marks a tag axis met when the item carries a DESCENDANT of a configured tag', () => {
    // Given 'whole-milk' is a child of 'dairy'
    const nested = [
      ...tags,
      {
        id: 'whole-milk',
        name: 'Whole Milk',
        typeId: 'tt-cat',
        parentId: 'dairy',
      },
    ]
    const axes = deriveFilterAxes(
      item({ tagIds: ['whole-milk'] }),
      { tagIds: ['dairy'] },
      nested,
      tagTypes,
      vendors,
      recipes,
    )
    // metBy names the CONFIGURED id, not the descendant the item actually carries —
    // the configured id is what a write would have to add, and it is already implied.
    expect(axes[0]?.metBy).toBe('dairy')
  })

  it('leaves a tag axis unmet when the item carries a tag of the same type but not a configured one', () => {
    const axes = deriveFilterAxes(
      item({ tagIds: ['fridge'] }),
      { tagIds: ['dairy', 'frozen'] },
      tags,
      tagTypes,
      vendors,
      recipes,
    )
    expect(axes[0]?.metBy).toBeUndefined()
  })

  it('drops dangling ids from a vendor axis but keeps the resolvable ones', () => {
    const axes = deriveFilterAxes(
      item(),
      { vendorIds: ['gone', 'v1'] },
      tags,
      tagTypes,
      vendors,
      recipes,
    )
    expect(axes[0]?.options).toEqual([{ id: 'v1', name: 'Costco', depth: 0 }])
  })

  it('marks the vendor axis met when the item already carries a configured vendor', () => {
    const axes = deriveFilterAxes(
      item({ vendorIds: ['v2'] }),
      { vendorIds: ['v1', 'v2'] },
      tags,
      tagTypes,
      vendors,
      recipes,
    )
    expect(axes[0]?.metBy).toBe('v2')
  })

  it('marks the recipe axis met when a configured recipe already holds the item', () => {
    const held = [{ id: 'r1', name: 'Pancakes', items: [{ itemId: 'i1' }] }]
    const axes = deriveFilterAxes(
      item(),
      { recipeIds: ['r1'] },
      tags,
      tagTypes,
      vendors,
      held,
    )
    expect(axes[0]?.metBy).toBe('r1')
  })

  it('returns axes in tag → vendor → recipe order', () => {
    const axes = deriveFilterAxes(
      item(),
      { tagIds: ['dairy'], vendorIds: ['v1'], recipeIds: ['r1'] },
      tags,
      tagTypes,
      vendors,
      recipes,
    )
    expect(axes.map((a) => a.kind)).toEqual(['tag', 'vendor', 'recipe'])
  })

  it('returns no axes for an empty config', () => {
    expect(
      deriveFilterAxes(item(), {}, tags, tagTypes, vendors, recipes),
    ).toEqual([])
  })

  describe('tag axis lists the child tags of each named tag', () => {
    // Dairy has two children; Milk has two children of its own. The names are
    // NOT in alphabetical order in the array, so a test that passes proves the
    // options are sorted the way the tag settings page sorts them.
    const treeTags: Tag[] = [
      { id: 'dairy', name: 'Dairy', typeId: 'tt-cat' },
      { id: 'milk', name: 'Milk', typeId: 'tt-cat', parentId: 'dairy' },
      { id: 'cheese', name: 'Cheese', typeId: 'tt-cat', parentId: 'dairy' },
      { id: 'oat-milk', name: 'Oat milk', typeId: 'tt-cat', parentId: 'milk' },
      { id: 'cow-milk', name: 'Cow milk', typeId: 'tt-cat', parentId: 'milk' },
      { id: 'frozen', name: 'Frozen', typeId: 'tt-cat' },
      { id: 'ice', name: 'Ice', typeId: 'tt-cat', parentId: 'frozen' },
      { id: 'fridge', name: 'Fridge', typeId: 'tt-sto' },
    ]
    const optionsOf = (tagIds: string[]) =>
      deriveFilterAxes(item(), { tagIds }, treeTags, tagTypes, vendors, recipes)
        .find((a) => a.key === 'tt-cat')
        ?.options.map((o) => `${o.id}@${o.depth}`)

    it('lists children and grandchildren after the named tag, by name, with depths', () => {
      expect(optionsOf(['dairy'])).toEqual([
        'dairy@0',
        'cheese@1',
        'milk@1',
        'cow-milk@2',
        'oat-milk@2',
      ])
    })

    it('keeps the named tags in rule order, each with its own subtree', () => {
      expect(optionsOf(['frozen', 'dairy'])).toEqual([
        'frozen@0',
        'ice@1',
        'dairy@0',
        'cheese@1',
        'milk@1',
        'cow-milk@2',
        'oat-milk@2',
      ])
    })

    it('lists a child the rule also names once, under its parent', () => {
      // Milk is named too, and named FIRST — it must not get its own top entry
      expect(optionsOf(['milk', 'dairy'])).toEqual([
        'dairy@0',
        'cheese@1',
        'milk@1',
        'cow-milk@2',
        'oat-milk@2',
      ])
    })

    it('depths are relative to the named tag, not to the top of the tree', () => {
      expect(optionsOf(['milk'])).toEqual([
        'milk@0',
        'cow-milk@1',
        'oat-milk@1',
      ])
    })

    it('keeps metBy on the named tag when the item carries a child tag', () => {
      const axes = deriveFilterAxes(
        item({ tagIds: ['oat-milk'] }),
        { tagIds: ['dairy'] },
        treeTags,
        tagTypes,
        vendors,
        recipes,
      )
      expect(axes[0]?.metBy).toBe('dairy')
    })

    it('gives vendor and recipe options depth 0 and no extra rows', () => {
      const axes = deriveFilterAxes(
        item(),
        { vendorIds: ['v1', 'v2'], recipeIds: ['r1'] },
        treeTags,
        tagTypes,
        vendors,
        recipes,
      )
      expect(axes.map((a) => a.options)).toEqual([
        [
          { id: 'v1', name: 'Costco', depth: 0 },
          { id: 'v2', name: '7-Eleven', depth: 0 },
        ],
        [{ id: 'r1', name: 'Pancakes', depth: 0 }],
      ])
    })

    it('every option, child tags included, makes the item match the shelf', () => {
      // This is what makes a child tag a valid pick: matchesFilterConfig
      // counts descendants, so adding ANY option satisfies the axis.
      const config: FilterConfig = { tagIds: ['dairy'] }
      const axis = deriveFilterAxes(
        item(),
        config,
        treeTags,
        tagTypes,
        vendors,
        recipes,
      )[0]
      expect(axis?.options.length).toBe(5)
      for (const option of axis?.options ?? []) {
        expect(
          matchesFilterConfig(
            item({ tagIds: [option.id] }),
            config,
            recipes,
            treeTags,
          ),
        ).toBe(true)
      }
    })
  })

  describe('agrees with matchesFilterConfig: every axis met ⇔ the item matches', () => {
    // This is the invariant the whole feature rests on. If it can drift, a press can
    // report success while leaving the row exactly where it was.
    //
    // A single all-met case does not pin this: an implementation that always sets
    // `metBy` (e.g. `typeTagIds[0]` / `safeVendorIds[0]`) would also pass an
    // all-met-only assertion, because `matchesFilterConfig` is exercised
    // independently and `deriveFilterAxes` cannot influence its result. Each case
    // below asserts the BICONDITIONAL itself, so an always-met axis fails on any
    // case where the item does not actually match.
    const nestedTags: Tag[] = [
      ...tags,
      {
        id: 'whole-milk',
        name: 'Whole Milk',
        typeId: 'tt-cat',
        parentId: 'dairy',
      },
    ]

    const cases: {
      name: string
      config: FilterConfig
      testItem: Item
      tagSet: Tag[]
    }[] = [
      {
        name: 'all axes met',
        config: { tagIds: ['dairy'], vendorIds: ['v1'] },
        testItem: item({ tagIds: ['dairy'], vendorIds: ['v1'] }),
        tagSet: tags,
      },
      {
        name: 'tag axis unmet',
        config: { tagIds: ['dairy'], vendorIds: ['v1'] },
        testItem: item({ tagIds: [], vendorIds: ['v1'] }),
        tagSet: tags,
      },
      {
        name: 'vendor axis unmet',
        config: { tagIds: ['dairy'], vendorIds: ['v1'] },
        testItem: item({ tagIds: ['dairy'], vendorIds: [] }),
        tagSet: tags,
      },
      {
        name: 'tag axis met via a descendant tag',
        config: { tagIds: ['dairy'] },
        testItem: item({ tagIds: ['whole-milk'], vendorIds: [] }),
        tagSet: nestedTags,
      },
      {
        // Every other configured axis is satisfied — only the recipe axis is
        // not — so this is the row that isolates a recipe-specific bug (e.g.
        // a `metBy` computation reading the wrong field, or one that treats a
        // deleted/empty recipe as satisfying). Without this row, the
        // tag/vendor cases above cannot catch a mistake confined to the
        // recipe branch.
        name: 'recipe axis unmet (everything else met)',
        config: { tagIds: ['dairy'], vendorIds: ['v1'], recipeIds: ['r1'] },
        testItem: item({ tagIds: ['dairy'], vendorIds: ['v1'] }),
        tagSet: tags,
      },
    ]

    it.each(cases)('$name', ({ config, testItem, tagSet }) => {
      const axes = deriveFilterAxes(
        testItem,
        config,
        tagSet,
        tagTypes,
        vendors,
        recipes,
      )
      expect(axes.every((a) => a.metBy !== undefined)).toBe(
        matchesFilterConfig(testItem, config, recipes, tagSet),
      )
    })
  })
})

describe('defaultPicksFor', () => {
  // Minimal axis fixtures — only the fields defaultPicksFor reads.
  const tagAxis = (
    over: Partial<ReturnType<typeof deriveFilterAxes>[number]> = {},
  ) =>
    ({
      key: 'tt-cat',
      kind: 'tag' as const,
      typeName: 'Category',
      options: [{ id: 'dairy', name: 'Dairy', depth: 0 }],
      ...over,
    }) as ReturnType<typeof deriveFilterAxes>[number]

  it('pre-picks a single-option UNMET tag axis', () => {
    const picks = defaultPicksFor([tagAxis()])
    expect(picks).toEqual({ tagIds: ['dairy'] })
  })

  it('pre-picks a single-option UNMET vendor axis', () => {
    const picks = defaultPicksFor([
      {
        key: 'vendor',
        kind: 'vendor',
        options: [{ id: 'v1', name: 'Costco', depth: 0 }],
      },
    ])
    expect(picks).toEqual({ tagIds: [], vendorId: 'v1' })
  })

  it('pre-picks a single-option UNMET recipe axis', () => {
    const picks = defaultPicksFor([
      {
        key: 'recipe',
        kind: 'recipe',
        options: [{ id: 'r1', name: 'Pancakes', depth: 0 }],
      },
    ])
    expect(picks).toEqual({ tagIds: [], recipeId: 'r1' })
  })

  it('skips a MET axis even when it has exactly one option', () => {
    // A met axis is already satisfied — re-picking its only option would write a
    // second tag of a type the item already carries.
    const picks = defaultPicksFor([tagAxis({ metBy: 'dairy' })])
    expect(picks).toEqual({ tagIds: [] })
  })

  it('skips an UNMET axis with two options — that one needs user input', () => {
    const picks = defaultPicksFor([
      tagAxis({
        options: [
          { id: 'dairy', name: 'Dairy', depth: 0 },
          { id: 'frozen', name: 'Frozen', depth: 0 },
        ],
      }),
    ])
    expect(picks).toEqual({ tagIds: [] })
  })

  it('pre-picks the ONE named tag even when its child tags are offered below it', () => {
    // Given a rule naming only Dairy, which has two children in the options
    const picks = defaultPicksFor([
      tagAxis({
        options: [
          { id: 'dairy', name: 'Dairy', depth: 0 },
          { id: 'milk', name: 'Milk', depth: 1 },
          { id: 'oat-milk', name: 'Oat Milk', depth: 2 },
        ],
      }),
    ])
    // Then Dairy is picked, the same result as before children were offered
    expect(picks).toEqual({ tagIds: ['dairy'] })
  })

  it('picks nothing when the rule names two tags, even if one has children', () => {
    const picks = defaultPicksFor([
      tagAxis({
        options: [
          { id: 'dairy', name: 'Dairy', depth: 0 },
          { id: 'milk', name: 'Milk', depth: 1 },
          { id: 'frozen', name: 'Frozen', depth: 0 },
        ],
      }),
    ])
    expect(picks).toEqual({ tagIds: [] })
  })

  it('returns { tagIds: [] } for no axes', () => {
    expect(defaultPicksFor([])).toEqual({ tagIds: [] })
  })
})

describe('countSelectedFilters', () => {
  it('sums every selected option across all three arrays', () => {
    // Given a config selecting 2 tags of the SAME tag type, 1 vendor and 1 recipe
    const filterConfig: FilterConfig = {
      tagIds: ['dairy', 'frozen'],
      vendorIds: ['vendor-1'],
      recipeIds: ['recipe-1'],
    }

    // When counting selected filters
    // Then it is 4 — the number of OPTIONS, not the number of axes (which is 3:
    // one tag-type axis + vendor + recipe)
    expect(countSelectedFilters(filterConfig)).toBe(4)
  })

  it('counts two tags of the same type as two, not one axis', () => {
    // Given two tags that would collapse into a single axis in deriveFilterAxes
    const filterConfig: FilterConfig = {
      tagIds: ['dairy', 'frozen'],
      vendorIds: ['vendor-1'],
    }

    // When counting selected filters
    // Then it is 3 selected options (axes would be 2)
    expect(countSelectedFilters(filterConfig)).toBe(3)
  })

  it('treats undefined fields as empty', () => {
    expect(countSelectedFilters({ tagIds: ['dairy'] })).toBe(1)
    expect(countSelectedFilters({})).toBe(0)
  })

  it('treats null fields as empty (restored backups store null)', () => {
    const filterConfig = {
      tagIds: null,
      vendorIds: ['vendor-1'],
      recipeIds: null,
    } as unknown as FilterConfig

    expect(() => countSelectedFilters(filterConfig)).not.toThrow()
    expect(countSelectedFilters(filterConfig)).toBe(1)
  })

  it('returns 0 for empty arrays and for an absent filterConfig', () => {
    expect(
      countSelectedFilters({ tagIds: [], vendorIds: [], recipeIds: [] }),
    ).toBe(0)
    expect(countSelectedFilters(undefined)).toBe(0)
  })
})

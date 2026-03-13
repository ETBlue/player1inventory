import { MockedProvider } from '@apollo/client/testing/react'
import type { Meta, StoryObj } from '@storybook/react'
import {
  CreateFamilyGroupDocument,
  DisbandFamilyGroupDocument,
  JoinFamilyGroupDocument,
  LeaveFamilyGroupDocument,
  MyFamilyGroupDocument,
} from '@/generated/graphql'
import { FamilyGroupCard } from '.'

// FamilyGroupCard uses:
//   - useUser() from @clerk/react — mocked via .storybook/mocks/clerk.tsx alias;
//     returns { user: { id: 'storybook-user-id', ... } }
//   - useMyFamilyGroupQuery() — Apollo, mocked with MockedProvider per story
//   - mutation hooks — mocked with MockedProvider per story
//
// OwnerOfGroup story: ownerUserId set to 'storybook-user-id' to match the
// Clerk stub so that isOwner = true and the Disband button renders.

const noGroupMocks = [
  {
    request: { query: MyFamilyGroupDocument },
    result: { data: { myFamilyGroup: null } },
  },
]

const memberGroupMocks = [
  {
    request: { query: MyFamilyGroupDocument },
    result: {
      data: {
        myFamilyGroup: {
          __typename: 'FamilyGroup',
          id: 'group-1',
          name: 'The Smiths',
          code: 'ABC123',
          ownerUserId: 'user-owner-1',
          memberUserIds: ['user-owner-1', 'user-member-2'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    },
  },
  {
    request: { query: LeaveFamilyGroupDocument },
    result: { data: { leaveFamilyGroup: true } },
  },
  // Refetch after leave
  {
    request: { query: MyFamilyGroupDocument },
    result: { data: { myFamilyGroup: null } },
  },
]

// For OwnerOfGroup: ownerUserId must match the user.id returned by the
// Storybook Clerk mock stub (.storybook/mocks/clerk.tsx → useUser → 'storybook-user-id').
// The component checks: group?.ownerUserId === user?.id → true → isOwner = true.
const ownerGroupMocks = [
  {
    request: { query: MyFamilyGroupDocument },
    result: {
      data: {
        myFamilyGroup: {
          __typename: 'FamilyGroup',
          id: 'group-1',
          name: 'The Smiths',
          code: 'ABC123',
          ownerUserId: 'storybook-user-id',
          memberUserIds: ['storybook-user-id'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    },
  },
  {
    request: { query: DisbandFamilyGroupDocument },
    result: { data: { disbandFamilyGroup: true } },
  },
  // Refetch after disband
  {
    request: { query: MyFamilyGroupDocument },
    result: { data: { myFamilyGroup: null } },
  },
]

const createGroupMocks = [
  {
    request: { query: MyFamilyGroupDocument },
    result: { data: { myFamilyGroup: null } },
  },
  {
    request: {
      query: CreateFamilyGroupDocument,
      variables: { name: 'My Family' },
    },
    result: {
      data: {
        createFamilyGroup: {
          __typename: 'FamilyGroup',
          id: 'group-new',
          name: 'My Family',
          code: 'XYZ789',
          ownerUserId: 'user-1',
          memberUserIds: ['user-1'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    },
  },
  // Refetch after create
  {
    request: { query: MyFamilyGroupDocument },
    result: {
      data: {
        myFamilyGroup: {
          __typename: 'FamilyGroup',
          id: 'group-new',
          name: 'My Family',
          code: 'XYZ789',
          ownerUserId: 'user-1',
          memberUserIds: ['user-1'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    },
  },
]

const joinGroupMocks = [
  {
    request: { query: MyFamilyGroupDocument },
    result: { data: { myFamilyGroup: null } },
  },
  {
    request: {
      query: JoinFamilyGroupDocument,
      variables: { code: 'ABC123' },
    },
    result: {
      data: {
        joinFamilyGroup: {
          __typename: 'FamilyGroup',
          id: 'group-1',
          name: 'The Smiths',
          code: 'ABC123',
          ownerUserId: 'user-owner-1',
          memberUserIds: ['user-owner-1', 'user-me'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    },
  },
]

const meta: Meta<typeof FamilyGroupCard> = {
  title: 'Settings/FamilyGroupCard',
  component: FamilyGroupCard,
  parameters: {
    layout: 'padded',
  },
}

export default meta
type Story = StoryObj<typeof FamilyGroupCard>

export const NotInGroup: Story = {
  name: 'NotInGroup — shows Create and Join buttons',
  decorators: [
    (Story) => (
      <MockedProvider mocks={noGroupMocks} addTypename={false}>
        <Story />
      </MockedProvider>
    ),
  ],
}

export const MemberOfGroup: Story = {
  name: 'MemberOfGroup — shows group info and Leave button',
  decorators: [
    (Story) => (
      <MockedProvider mocks={memberGroupMocks} addTypename={false}>
        <Story />
      </MockedProvider>
    ),
  ],
}

export const OwnerOfGroup: Story = {
  name: 'OwnerOfGroup — shows group info and Disband button',
  decorators: [
    (Story) => (
      <MockedProvider mocks={ownerGroupMocks} addTypename={false}>
        <Story />
      </MockedProvider>
    ),
  ],
}

export const CreateGroupDialog: Story = {
  name: 'NotInGroup — create group dialog open',
  decorators: [
    (Story) => (
      <MockedProvider mocks={createGroupMocks} addTypename={false}>
        <Story />
      </MockedProvider>
    ),
  ],
  play: async ({ canvasElement }) => {
    // Click the "Create group" button (first button in the actions row)
    const buttons = canvasElement.querySelectorAll('button')
    const createBtn = Array.from(buttons).find((b) =>
      b.textContent?.includes('Create group'),
    ) as HTMLButtonElement | undefined
    createBtn?.click()
  },
}

export const JoinGroupDialog: Story = {
  name: 'NotInGroup — join with code dialog open',
  decorators: [
    (Story) => (
      <MockedProvider mocks={joinGroupMocks} addTypename={false}>
        <Story />
      </MockedProvider>
    ),
  ],
  play: async ({ canvasElement }) => {
    const buttons = canvasElement.querySelectorAll('button')
    const joinBtn = Array.from(buttons).find((b) =>
      b.textContent?.includes('Join with code'),
    ) as HTMLButtonElement | undefined
    joinBtn?.click()
  },
}

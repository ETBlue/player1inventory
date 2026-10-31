import type { Meta, StoryObj } from '@storybook/react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from './accordion'

const meta: Meta<typeof Accordion> = {
  title: 'UI Library/Accordion',
  component: Accordion,
}

export default meta
type Story = StoryObj<typeof Accordion>

function Sections() {
  return (
    <>
      <AccordionItem value="household">
        <AccordionTrigger>My data</AccordionTrigger>
        <AccordionContent>
          Locations, shelves, vendors, recipes, tags
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="user">
        <AccordionTrigger>Account</AccordionTrigger>
        <AccordionContent>Theme, language, data mode</AccordionContent>
      </AccordionItem>
    </>
  )
}

export const Closed: Story = {
  render: () => (
    <Accordion type="single" collapsible>
      <Sections />
    </Accordion>
  ),
}

export const OneOpen: Story = {
  render: () => (
    <Accordion type="single" collapsible defaultValue="household">
      <Sections />
    </Accordion>
  ),
}

export const Multiple: Story = {
  render: () => (
    <Accordion type="multiple" defaultValue={['household', 'user']}>
      <Sections />
    </Accordion>
  ),
}

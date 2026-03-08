import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { RecipeNameForm } from '@/components/RecipeNameForm'
import { Toolbar } from '@/components/Toolbar'
import { Button } from '@/components/ui/button'
import { useAppNavigation } from '@/hooks/useAppNavigation'
import { useCreateRecipe } from '@/hooks/useRecipes'

export const Route = createFileRoute('/settings/recipes/new')({
  validateSearch: (search: Record<string, unknown>) => ({
    name: typeof search.name === 'string' ? search.name : '',
  }),
  component: NewRecipePage,
})

function NewRecipePage() {
  const navigate = useNavigate()
  const { goBack } = useAppNavigation('/settings/recipes/')
  const createRecipe = useCreateRecipe()
  const { name: prefillName = '' } = Route.useSearch()
  const [name, setName] = useState(prefillName)

  const isDirty = name.trim() !== ''

  const handleSave = () => {
    if (!isDirty) return
    createRecipe.mutate(
      { name: name.trim() },
      {
        onSuccess: (recipe) => {
          navigate({
            to: '/settings/recipes/$id',
            params: { id: recipe.id },
          })
        },
      },
    )
  }

  return (
    <div>
      <Toolbar>
        <Button variant="neutral-ghost" size="icon" onClick={goBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1>New Recipe</h1>
      </Toolbar>
      <div className="px-6 py-4">
        <RecipeNameForm
          name={name}
          onNameChange={setName}
          onSave={handleSave}
          isDirty={isDirty}
          isPending={createRecipe.isPending}
        />
      </div>
    </div>
  )
}

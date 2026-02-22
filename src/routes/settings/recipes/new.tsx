import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { RecipeNameForm } from '@/components/RecipeNameForm'
import { Button } from '@/components/ui/button'
import { useCreateRecipe } from '@/hooks/useRecipes'

export const Route = createFileRoute('/settings/recipes/new')({
  component: NewRecipePage,
})

function NewRecipePage() {
  const navigate = useNavigate()
  const createRecipe = useCreateRecipe()
  const [name, setName] = useState('')

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
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant="neutral-ghost"
          size="icon"
          onClick={() => navigate({ to: '/settings/recipes/' })}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">New Recipe</h1>
      </div>
      <RecipeNameForm
        name={name}
        onNameChange={setName}
        onSave={handleSave}
        isDirty={isDirty}
        isPending={createRecipe.isPending}
      />
    </div>
  )
}

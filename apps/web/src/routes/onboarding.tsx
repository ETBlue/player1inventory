import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { OnboardingWelcome } from '@/components/onboarding/OnboardingWelcome'
import { TemplateOverview } from '@/components/onboarding/TemplateOverview'
import { templateItems, templateVendors } from '@/data/template'

// Step state machine for the onboarding flow
type OnboardingStep =
  | { type: 'welcome' }
  | { type: 'template-overview' }
  | { type: 'items-browser' }
  | { type: 'vendors-browser' }
  | { type: 'progress' }

export const Route = createFileRoute('/onboarding')({
  component: OnboardingPage,
})

function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>({
    type: 'welcome',
  })
  const [selectedItemKeys, setSelectedItemKeys] = useState<Set<string>>(
    new Set(),
  )
  const [selectedVendorKeys, setSelectedVendorKeys] = useState<Set<string>>(
    new Set(),
  )

  const handleNavigate = (step: OnboardingStep) => {
    setCurrentStep(step)
  }

  return (
    <div className="min-h-screen">
      {currentStep.type === 'welcome' && (
        <OnboardingWelcome
          onChooseTemplate={() => handleNavigate({ type: 'template-overview' })}
          onStartFromScratch={() => handleNavigate({ type: 'progress' })}
        />
      )}
      {currentStep.type === 'template-overview' && (
        <TemplateOverview
          selectedItemCount={selectedItemKeys.size}
          selectedVendorCount={selectedVendorKeys.size}
          totalItemCount={templateItems.length}
          totalVendorCount={templateVendors.length}
          onEditItems={() => handleNavigate({ type: 'items-browser' })}
          onEditVendors={() => handleNavigate({ type: 'vendors-browser' })}
          onBack={() => handleNavigate({ type: 'welcome' })}
          onConfirm={() => handleNavigate({ type: 'progress' })}
        />
      )}
      {currentStep.type === 'items-browser' && (
        <ItemsBrowserPlaceholder
          onNavigate={handleNavigate}
          selectedItemKeys={selectedItemKeys}
          selectedVendorKeys={selectedVendorKeys}
          setSelectedItemKeys={setSelectedItemKeys}
          setSelectedVendorKeys={setSelectedVendorKeys}
        />
      )}
      {currentStep.type === 'vendors-browser' && (
        <VendorsBrowserPlaceholder
          onNavigate={handleNavigate}
          selectedItemKeys={selectedItemKeys}
          selectedVendorKeys={selectedVendorKeys}
          setSelectedItemKeys={setSelectedItemKeys}
          setSelectedVendorKeys={setSelectedVendorKeys}
        />
      )}
      {currentStep.type === 'progress' && (
        <ProgressPlaceholder
          onNavigate={handleNavigate}
          selectedItemKeys={selectedItemKeys}
          selectedVendorKeys={selectedVendorKeys}
          setSelectedItemKeys={setSelectedItemKeys}
          setSelectedVendorKeys={setSelectedVendorKeys}
        />
      )}
    </div>
  )
}

// Shared props for all step placeholders — mirrors the interface that real
// step components (Steps 5–9) will implement.
interface StepProps {
  onNavigate: (step: OnboardingStep) => void
  selectedItemKeys: Set<string>
  selectedVendorKeys: Set<string>
  setSelectedItemKeys: React.Dispatch<React.SetStateAction<Set<string>>>
  setSelectedVendorKeys: React.Dispatch<React.SetStateAction<Set<string>>>
}

function ItemsBrowserPlaceholder(_props: StepProps) {
  return (
    <div>
      <h1>Items Browser</h1>
    </div>
  )
}

function VendorsBrowserPlaceholder(_props: StepProps) {
  return (
    <div>
      <h1>Vendors Browser</h1>
    </div>
  )
}

function ProgressPlaceholder(_props: StepProps) {
  return (
    <div>
      <h1>Progress</h1>
    </div>
  )
}

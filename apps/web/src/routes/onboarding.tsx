import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { OnboardingProgress } from '@/components/onboarding/OnboardingProgress'
import { OnboardingWelcome } from '@/components/onboarding/OnboardingWelcome'
import { TemplateItemsBrowser } from '@/components/onboarding/TemplateItemsBrowser'
import { TemplateOverview } from '@/components/onboarding/TemplateOverview'
import { TemplateVendorsBrowser } from '@/components/onboarding/TemplateVendorsBrowser'
import { templateItems, templateVendors } from '@/data/template'
import { useOnboardingSetup } from '@/hooks'

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
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState<OnboardingStep>({
    type: 'welcome',
  })
  const [selectedItemKeys, setSelectedItemKeys] = useState<Set<string>>(
    new Set(),
  )
  const [selectedVendorKeys, setSelectedVendorKeys] = useState<Set<string>>(
    new Set(),
  )
  const [progressPct, setProgressPct] = useState(0)
  const setupMutation = useOnboardingSetup()

  const handleNavigate = (step: OnboardingStep) => {
    setCurrentStep(step)
  }

  // Trigger setup mutation when entering the progress step
  useEffect(() => {
    if (currentStep.type === 'progress' && setupMutation.status === 'idle') {
      setupMutation.mutate({
        itemKeys: [...selectedItemKeys],
        vendorKeys: [...selectedVendorKeys],
        onProgress: setProgressPct,
      })
    }
  }, [currentStep.type, setupMutation, selectedItemKeys, selectedVendorKeys])

  return (
    <div className="min-h-screen">
      {currentStep.type === 'welcome' && (
        <OnboardingWelcome
          onChooseTemplate={() => handleNavigate({ type: 'template-overview' })}
          onStartFromScratch={() => {
            localStorage.setItem('onboarding-dismissed', 'true')
            navigate({ to: '/' })
          }}
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
        <TemplateItemsBrowser
          selectedKeys={selectedItemKeys}
          onSelectionChange={setSelectedItemKeys}
          onBack={() => handleNavigate({ type: 'template-overview' })}
        />
      )}
      {currentStep.type === 'vendors-browser' && (
        <TemplateVendorsBrowser
          selectedKeys={selectedVendorKeys}
          onSelectionChange={setSelectedVendorKeys}
          onBack={() => handleNavigate({ type: 'template-overview' })}
        />
      )}
      {currentStep.type === 'progress' && (
        <OnboardingProgress
          progress={progressPct}
          isComplete={setupMutation.isSuccess}
          onGetStarted={() => {
            localStorage.removeItem('onboarding-dismissed')
            navigate({ to: '/' })
          }}
        />
      )}
    </div>
  )
}

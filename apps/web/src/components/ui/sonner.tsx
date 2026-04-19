import {
  CircleCheck,
  Info,
  LoaderCircle,
  OctagonX,
  TriangleAlert,
} from 'lucide-react'
import { Toaster as Sonner } from 'sonner'
import { useTheme } from '@/hooks/useTheme'

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme()

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: <CircleCheck className="h-4 w-4" />,
        info: <Info className="h-4 w-4" />,
        warning: <TriangleAlert className="h-4 w-4" />,
        error: <OctagonX className="h-4 w-4" />,
        loading: <LoaderCircle className="h-4 w-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background-base group-[.toaster]:text-foreground-default group-[.toaster]:border-accessory-default group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-foreground-muted',
          actionButton:
            'group-[.toast]:bg-importance-primary-background group-[.toast]:text-foreground-colorless-inverse',
          cancelButton:
            'group-[.toast]:bg-background-elevated group-[.toast]:text-foreground-muted',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }

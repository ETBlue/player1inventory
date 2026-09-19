import { ApolloLink, Observable } from '@apollo/client'
import { getMainDefinition } from '@apollo/client/utilities'
import { toast } from 'sonner'
import { isOffline } from '@/hooks/useIsOffline'
import i18n from '@/i18n'

/** Thrown when a mutation is attempted with no network connection. */
export class OfflineWriteError extends Error {
  constructor() {
    super('Offline: changes cannot be saved right now.')
    this.name = 'OfflineWriteError'
  }
}

/**
 * Fails every mutation at once while the device is offline, and tells the user
 * why.
 *
 * This is one place that covers every mutation, including ones added later.
 * Without it an offline write would hang until it timed out, or look like it
 * worked when it did not. Queries are left alone so cached reads still work.
 *
 * The message is shown here, not in each calling hook. A caller that forgets
 * to handle the error would otherwise leave the button looking broken.
 */
export const offlineWriteLink = new ApolloLink((operation, forward) => {
  const definition = getMainDefinition(operation.query)
  const isMutation =
    definition.kind === 'OperationDefinition' &&
    definition.operation === 'mutation'

  if (isMutation && isOffline()) {
    return new Observable((observer) => {
      toast.error(i18n.t('pwa.writeBlocked'))
      observer.error(new OfflineWriteError())
    })
  }

  return forward(operation)
})

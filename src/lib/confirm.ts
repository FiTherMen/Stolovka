import { isDemo } from './demo'

/** Підтвердження дії. У демо-сторінці системні діалоги заблоковані, тож там дія виконується одразу. */
export function confirmAction(message: string): boolean {
  if (isDemo) return true
  return window.confirm(message)
}

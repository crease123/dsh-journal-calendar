/**
 * Bring one conversation turn into view.
 *
 * The Web client marks every rendered turn with `data-chat-turn`; that
 * attribute is the only address another plugin has for a turn, because the
 * conversation view publishes no reveal API. A turn that never materialises —
 * an older turn outside the rendered window, or a UI that stopped emitting the
 * attribute — leaves the reader where the Session opened, which is still the
 * conversation the entry came from.
 *
 * @module dsh-journal-calendar/client/reveal
 */

import css from './CalendarCard.module.css'

/** The flash class, or `''` when the stylesheet did not load it. */
const REVEAL_CLASS = css['revealed'] ?? ''

/** How long to wait for the opened Session to render its turns. */
const REVEAL_DEADLINE_MS = 3000
/** Delay before the first probe: the switched Session mounts after the click returns. */
const REVEAL_DELAY_MS = 250
/** How long the landed turn stays highlighted. */
const REVEAL_FLASH_MS = 1600
/** Poll interval while the target turn is not rendered yet. */
const REVEAL_POLL_MS = 120

/**
 * Scroll the conversation to `turn` and flash it.
 * @param turn - one-based turn number of the open Session.
 */
export function revealTurn(turn: number): void {
  const deadline = Date.now() + REVEAL_DEADLINE_MS
  const probe = (): void => {
    const target = document.querySelector<HTMLElement>(`[data-chat-turn="${turn}"]`)
    if (target !== null) {
      target.scrollIntoView({ block: 'center' })
      if (REVEAL_CLASS !== '') {
        target.classList.add(REVEAL_CLASS)
        window.setTimeout(() => { target.classList.remove(REVEAL_CLASS) }, REVEAL_FLASH_MS)
      }
      return
    }
    if (Date.now() < deadline) window.setTimeout(probe, REVEAL_POLL_MS)
  }
  window.setTimeout(probe, REVEAL_DELAY_MS)
}

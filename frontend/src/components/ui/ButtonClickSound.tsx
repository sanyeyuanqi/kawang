import { useEffect, useRef } from "react"

type WebAudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext
}

function isInteractiveButton(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  const control = target.closest<HTMLElement>(
    'button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"]'
  )
  if (!control) return false
  if (control.getAttribute("aria-disabled") === "true") return false
  if (control instanceof HTMLButtonElement || control instanceof HTMLInputElement) {
    return !control.disabled
  }
  return true
}

function playClickTone(audioContext: AudioContext) {
  const now = audioContext.currentTime
  const oscillator = audioContext.createOscillator()
  const gain = audioContext.createGain()

  oscillator.type = "sine"
  oscillator.frequency.setValueAtTime(760, now)
  oscillator.frequency.exponentialRampToValueAtTime(520, now + 0.055)

  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.09, now + 0.006)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07)

  oscillator.connect(gain)
  gain.connect(audioContext.destination)
  oscillator.start(now)
  oscillator.stop(now + 0.075)
}

export function ButtonClickSound() {
  const audioContextRef = useRef<AudioContext | null>(null)
  const lastPlayedAtRef = useRef(0)

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || !isInteractiveButton(event.target)) return
      const elapsed = window.performance.now() - lastPlayedAtRef.current
      if (elapsed < 45) return

      const AudioContextCtor = window.AudioContext || (window as WebAudioWindow).webkitAudioContext
      if (!AudioContextCtor) return

      const audioContext = audioContextRef.current ?? new AudioContextCtor()
      audioContextRef.current = audioContext
      lastPlayedAtRef.current = window.performance.now()

      if (audioContext.state === "suspended") {
        void audioContext.resume().then(() => playClickTone(audioContext)).catch(() => undefined)
        return
      }

      playClickTone(audioContext)
    }

    document.addEventListener("click", handleClick)
    return () => {
      document.removeEventListener("click", handleClick)
      void audioContextRef.current?.close().catch(() => undefined)
      audioContextRef.current = null
    }
  }, [])

  return null
}

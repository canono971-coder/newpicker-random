"use client"

import { Button } from "@/components/ui/button"
import { Play, Loader2, Users, Sparkles, Maximize2, Minimize2 } from "lucide-react"
import type { Prize, Winner } from "@/components/random-picker"
import { cn } from "@/lib/utils"
import { useEffect, useState, useCallback, useRef } from "react"
import { ConfettiBurst } from "@/components/confetti-burst"

interface NameRevealerProps {
  selectedPrize: Prize | null
  isSpinning: boolean
  onSpin: () => void
  onPickAll: (revealSequentially?: boolean, isContinue?: boolean) => void
  onContinuePicking?: () => void
  winner: Winner | Winner[] | null
  displayedName?: string | null
  pickingMultiple?: boolean
}

export function NameRevealer({ selectedPrize, isSpinning, onSpin, onPickAll, onContinuePicking, winner, displayedName, pickingMultiple }: NameRevealerProps) {
  const canSpin = selectedPrize && selectedPrize.participants.length > 0 && !isSpinning
  const remainingSlots = selectedPrize ? selectedPrize.winnerSlots - selectedPrize.winners.length : 0
  const canPickAll = canSpin && remainingSlots > 0
  // Allow continue picking when participants >= winnerSlots (continue until participants < winnerSlots)
  const canContinuePicking = selectedPrize && selectedPrize.participants.length >= selectedPrize.winnerSlots && !isSpinning && onContinuePicking
  const isMultipleWinner = Array.isArray(winner)
  const winnerCount = isMultipleWinner ? winner.length : (winner ? 1 : 0)
  const [confettiTrigger, setConfettiTrigger] = useState(false)
  const [confettiListTrigger, setConfettiListTrigger] = useState(false)
  const [waitingForAudio, setWaitingForAudio] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Shuffling state for picking all winners
  const [shuffleName, setShuffleName] = useState<string | null>(null)
  const shuffleIntervalRef = useRef<number | null>(null)
  const shuffleStopTimeoutRef = useRef<number | null>(null)
  const winnersRevealedRef = useRef(false)
  const masterGainRef = useRef<GainNode | null>(null)
  const fadeIntervalRef = useRef<number | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const drumLoopRef = useRef<number | null>(null)
  const audioElemRef = useRef<HTMLAudioElement | null>(null)
  const drumFilePath = '/Drum Roll (Ending Celebration) - Sound Effect_ProSounds.mp3'
  const audioJustEndedRef = useRef(false)
  const winnersListRef = useRef<HTMLDivElement | null>(null)
  const lastWinnerNamesRef = useRef<string>('')
  const stableWinnersRef = useRef<Winner[] | null>(null)
  const onPickAllCalledRef = useRef(false)
  const isContinuingPickingRef = useRef(false)
  const [participantPage, setParticipantPage] = useState(0)
  const PARTICIPANTS_PER_PAGE = 10

  const playSpinSound = () => {
    // short percussive tick for single draws
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    const now = audioContext.currentTime
    const osc = audioContext.createOscillator()
    const gain = audioContext.createGain()
    osc.type = 'sine'
    osc.connect(gain)
    gain.connect(audioContext.destination)
    osc.frequency.setValueAtTime(150, now)
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.2)
    gain.gain.setValueAtTime(1, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25)
    osc.start(now)
    osc.stop(now + 0.3)
  }

  const playWinSound = () => {
    // final drum hit (three quick hits)
    const audioContext = audioContextRef.current ?? new (window.AudioContext || (window as any).webkitAudioContext)()
    audioContextRef.current = audioContext
    const now = audioContext.currentTime

    const hit = (timeOffset: number) => {
      const k = audioContext.createOscillator()
      const g = audioContext.createGain()
      k.type = 'sine'
      k.frequency.setValueAtTime(120, now + timeOffset)
      k.frequency.exponentialRampToValueAtTime(40, now + timeOffset + 0.15)
      g.gain.setValueAtTime(1, now + timeOffset)
      g.gain.exponentialRampToValueAtTime(0.001, now + timeOffset + 0.2)
      k.connect(g)
      g.connect(audioContext.destination)
      k.start(now + timeOffset)
      k.stop(now + timeOffset + 0.22)
    }

    hit(0)
    hit(0.08)
    hit(0.18)
  }

  // Play a ta-da-da-dang rhythmic pattern using AudioContext
  const playFinalPattern = () => {
    const ctx = audioContextRef.current ?? new (window.AudioContext || (window as any).webkitAudioContext)()
    audioContextRef.current = ctx
    const now = ctx.currentTime
    // pattern timings (seconds): ta (0), da (0.12), da (0.24), dang (0.42)
    const times = [0, 0.12, 0.24, 0.42]
    times.forEach((t, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'square'
      // descending pitch a bit for variety
      const baseFreq = 220 - i * 20
      o.frequency.setValueAtTime(baseFreq, now + t)
      g.gain.setValueAtTime(1.0 - i * 0.18, now + t)
      g.gain.exponentialRampToValueAtTime(0.001, now + t + 0.14)
      o.connect(g)
      g.connect(ctx.destination)
      o.start(now + t)
      o.stop(now + t + 0.16)
    })
  }

  const startDrumLoop = () => {
    // prefer playing the drum file from public folder
    const audioEl = audioElemRef.current
    if (audioEl) {
      try {
        audioEl.loop = true
        audioEl.currentTime = 0
        const p = audioEl.play()
        if (p && typeof p.then === 'function') p.catch(() => {
          // autoplay prevented, fallback to synth ticks
        })
        return
      } catch (e) {
        // fallback to synth ticks
      }
    }
    const audioContext = audioContextRef.current ?? new (window.AudioContext || (window as any).webkitAudioContext)()
    audioContextRef.current = audioContext
    // create a master gain so we can fade synth ticks down when needed
    if (!masterGainRef.current) {
      try {
        const mg = audioContext.createGain()
        mg.gain.setValueAtTime(1.2, audioContext.currentTime)
        mg.connect(audioContext.destination)
        masterGainRef.current = mg
      } catch (e) {
        masterGainRef.current = null
      }
    }
    // periodic soft tick to simulate drum-roll (fallback)
    if (drumLoopRef.current) return
    const tick = () => {
      const now = audioContext.currentTime
      const osc = audioContext.createOscillator()
      const g = audioContext.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(180, now)
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.15)
      g.gain.setValueAtTime(0.95, now)
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.18)
      osc.connect(g)
      if (masterGainRef.current) {
        g.connect(masterGainRef.current)
      } else {
        g.connect(audioContext.destination)
      }
      osc.start(now)
      osc.stop(now + 0.2)
    }
    // schedule ticks ~ every 120ms
    const id = window.setInterval(tick, 120)
    drumLoopRef.current = id
  }

  const stopDrumLoop = () => {
    if (audioElemRef.current) {
      try { audioElemRef.current.pause(); audioElemRef.current.currentTime = 0 } catch (e) { /* ignore */ }
    }
    if (drumLoopRef.current) {
      window.clearInterval(drumLoopRef.current)
      drumLoopRef.current = null
    }
    // reset master gain if present
    if (audioContextRef.current && masterGainRef.current) {
      try { masterGainRef.current.gain.setValueAtTime(1, audioContextRef.current.currentTime) } catch (e) {}
    }
  }

  // For single draws, play a drum-roll while spinning; stop when complete
  useEffect(() => {
    if (isSpinning && !pickingMultiple) {
      startDrumLoop()
    } else {
      stopDrumLoop()
    }
    return () => {
      stopDrumLoop()
    }
  }, [isSpinning, pickingMultiple])

  const fadeAudioToBackground = (durationMs = 3000, target = 0.25) => {
    // Fade HTMLAudioElement volume if used
    const audioEl = audioElemRef.current
    if (audioEl) {
      try {
        if (fadeIntervalRef.current) { window.clearInterval(fadeIntervalRef.current); fadeIntervalRef.current = null }
        const startVol = audioEl.volume
        const steps = Math.max(6, Math.floor(durationMs / 100))
        let current = 0
        const id = window.setInterval(() => {
          current++
          const progress = Math.min(1, current / steps)
          const v = startVol + (target - startVol) * progress
          try { audioEl.volume = Math.max(0, Math.min(1, v)) } catch (e) {}
          if (progress >= 1) {
            if (fadeIntervalRef.current) { window.clearInterval(fadeIntervalRef.current); fadeIntervalRef.current = null }
          }
        }, Math.max(30, Math.floor(durationMs / steps)))
        fadeIntervalRef.current = id
      } catch (e) {
        // ignore
      }
    }

    // Fade synth master gain if present
    if (audioContextRef.current && masterGainRef.current) {
      try {
        const ctx = audioContextRef.current
        const g = masterGainRef.current.gain
        const now = ctx.currentTime
        g.cancelScheduledValues(now)
        g.setValueAtTime(g.value || 1, now)
        g.linearRampToValueAtTime(target, now + durationMs / 1000)
      } catch (e) {
        // ignore
      }
    }
  }

  const openWinnerTab = useCallback((name: string) => {
    const html = `<!DOCTYPE html><html><head><title>Winner</title><style>body{margin:0;background:#0a3761;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:serif;}h1{font-size:5rem;margin:0 0 1rem 0;}@keyframes pop{0%{transform:scale(0.7);}60%{transform:scale(1.1);}100%{transform:scale(1);}}h1{animation:pop 0.7s cubic-bezier(.68,-0.55,.27,1.55);}div.confetti{position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:10;}</style></head><body><div class='confetti'></div><h1>${name}</h1><p style='font-size:2rem;opacity:0.7;'>Winner!</p><script>function confetti(){const c=document.querySelector('.confetti');for(let i=0;i<80;i++){const e=document.createElement('span');e.style.position='absolute';e.style.left=Math.random()*100+'vw';e.style.top=Math.random()*100+'vh';e.style.width=e.style.height=Math.random()*12+8+'px';e.style.background='hsl('+Math.random()*360+',90%,60%)';e.style.borderRadius=Math.random()>0.5?'50%':'20%';e.style.opacity=0.8;e.style.transform='rotate('+Math.random()*360+'deg)';e.style.transition='all 1.2s cubic-bezier(.68,-0.55,.27,1.55)';c.appendChild(e);setTimeout(()=>{e.style.top=(parseFloat(e.style.top)+Math.random()*60+40)+'px';e.style.opacity=0;},100);setTimeout(()=>c.removeChild(e),1400);}}confetti();</script></body></html>`;
    const w = window.open('', '_blank')
    if (w) {
      w.document.write(html)
      w.document.close()
    }
  }, [])

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (containerRef.current) await containerRef.current.requestFullscreen()
        setIsFullscreen(true)
      } else {
        if (document.exitFullscreen) await document.exitFullscreen()
        setIsFullscreen(false)
      }
    } catch (e) {
      // ignore
    }
  }

  const ensureFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (containerRef.current) await containerRef.current.requestFullscreen()
        setIsFullscreen(true)
      }
    } catch (e) {
      // ignore
    }
  }

  const handleSpin = async () => {
    await ensureFullscreen()
    const audioEl = audioElemRef.current
    if (audioEl) {
      try {
        try { audioEl.loop = false } catch (e) {}
        audioEl.volume = 1.0
        audioEl.currentTime = 0
        const p = audioEl.play()
        if (p && typeof p.then === 'function') {
          p.catch(() => {
            // autoplay prevented — fallback to synth drum-roll
            startDrumLoop()
          })
        }
      } catch (e) {
        startDrumLoop()
      }
    } else {
      startDrumLoop()
    }
    onSpin()
  }

  const handleContinuePickingWrapper = async () => {
    // Manual continue - don't auto-continue, user clicks each time
    // Each click will pick exactly winnerSlots winners
    isContinuingPickingRef.current = false // Don't auto-continue
    await handlePickAll(true) // Pass true to indicate this is a continue call
  }

  const handlePickAll = async (isContinue = false) => {
    await ensureFullscreen()
    // Reset the flag to track if onPickAll has been called for this pick operation
    onPickAllCalledRef.current = false
    // play the drum and reveal winners after 6 seconds (let remaining audio play as background)
    const audioEl = audioElemRef.current
    if (audioEl) try { audioEl.volume = 1.0 } catch (e) {}
    if (audioEl) {
      try {
        setWaitingForAudio(true)
        audioEl.currentTime = 0
        const SHUFFLE_DURATION_MS = 6500
        // play the drum clip once
        try { audioEl.loop = false } catch (e) {}
        // start the audio and only start the shuffle timeout once playback actually begins
        try {
          const playPromise = audioEl.play()
          if (playPromise && typeof playPromise.then === 'function') {
            playPromise.then(() => {
              // audio playback started — start the shuffle timeout relative to audio start
              if (shuffleStopTimeoutRef.current) { window.clearTimeout(shuffleStopTimeoutRef.current); shuffleStopTimeoutRef.current = null }
              shuffleStopTimeoutRef.current = window.setTimeout(() => {
                winnersRevealedRef.current = true
                audioJustEndedRef.current = true
                setWaitingForAudio(false)
                if (shuffleIntervalRef.current) {
                  window.clearInterval(shuffleIntervalRef.current)
                  shuffleIntervalRef.current = null
                }
                // do NOT stop the audio; allow it to finish while winners are shown
                // Mark that onPickAll has been called to prevent duplicate calls
                if (!onPickAllCalledRef.current) {
                  onPickAllCalledRef.current = true
                  onPickAll(false, isContinue)
                }
              }, SHUFFLE_DURATION_MS)
            }).catch(() => {
              // autoplay blocked — start synth fallback and begin the shuffle timeout now
              startDrumLoop()
              if (shuffleStopTimeoutRef.current) { window.clearTimeout(shuffleStopTimeoutRef.current); shuffleStopTimeoutRef.current = null }
              shuffleStopTimeoutRef.current = window.setTimeout(() => {
                winnersRevealedRef.current = true
                audioJustEndedRef.current = true
                setWaitingForAudio(false)
                if (shuffleIntervalRef.current) {
                  window.clearInterval(shuffleIntervalRef.current)
                  shuffleIntervalRef.current = null
                }
                // Mark that onPickAll has been called to prevent duplicate calls
                if (!onPickAllCalledRef.current) {
                  onPickAllCalledRef.current = true
                  onPickAll(false, isContinue)
                }
              }, SHUFFLE_DURATION_MS)
            })
          } else {
            // play() did not return a promise — assume playback started and start timeout
            if (shuffleStopTimeoutRef.current) { window.clearTimeout(shuffleStopTimeoutRef.current); shuffleStopTimeoutRef.current = null }
            shuffleStopTimeoutRef.current = window.setTimeout(() => {
              winnersRevealedRef.current = true
              audioJustEndedRef.current = true
              setWaitingForAudio(false)
              if (shuffleIntervalRef.current) {
                window.clearInterval(shuffleIntervalRef.current)
                shuffleIntervalRef.current = null
              }
              // Mark that onPickAll has been called to prevent duplicate calls
              if (!onPickAllCalledRef.current) {
                onPickAllCalledRef.current = true
                onPickAll(false)
              }
            }, SHUFFLE_DURATION_MS)
          }
        } catch (e) {
          // synchronous play error — fallback to synth and start timeout now
          startDrumLoop()
          if (shuffleStopTimeoutRef.current) { window.clearTimeout(shuffleStopTimeoutRef.current); shuffleStopTimeoutRef.current = null }
          shuffleStopTimeoutRef.current = window.setTimeout(() => {
            winnersRevealedRef.current = true
            audioJustEndedRef.current = true
            setWaitingForAudio(false)
            if (shuffleIntervalRef.current) {
              window.clearInterval(shuffleIntervalRef.current)
              shuffleIntervalRef.current = null
            }
            // Mark that onPickAll has been called to prevent duplicate calls
            if (!onPickAllCalledRef.current) {
              onPickAllCalledRef.current = true
              onPickAll(false)
            }
          }, SHUFFLE_DURATION_MS)
        }
        const onEnded = () => {
          audioEl.removeEventListener('ended', onEnded)
          if (shuffleStopTimeoutRef.current) { window.clearTimeout(shuffleStopTimeoutRef.current); shuffleStopTimeoutRef.current = null }
          setWaitingForAudio(false)
          // If onPickAll was already called (by timeout), just cleanup audio state
          // This prevents picking new winners when the audio ends after winners were already revealed
          if (onPickAllCalledRef.current || winnersRevealedRef.current) {
            winnersRevealedRef.current = false
            audioJustEndedRef.current = false
            stopDrumLoop()
            return
          }
          // otherwise, audio naturally ended before timeout — finalize winners now and mark so celebration isn't replayed
          winnersRevealedRef.current = true
          audioJustEndedRef.current = true
          stopDrumLoop()
          // Mark that onPickAll has been called to prevent duplicate calls
          if (!onPickAllCalledRef.current) {
            onPickAllCalledRef.current = true
            onPickAll(false)
          }
        }
        audioEl.addEventListener('ended', onEnded)
        return
      } catch (e) {
        if (shuffleStopTimeoutRef.current) { window.clearTimeout(shuffleStopTimeoutRef.current); shuffleStopTimeoutRef.current = null }
        setWaitingForAudio(false)
        if (!onPickAllCalledRef.current) {
          onPickAllCalledRef.current = true
          onPickAll(false)
        }
        return
      }
    }

    // fallback: no audio element, call immediately
    if (!onPickAllCalledRef.current) {
      onPickAllCalledRef.current = true
      onPickAll(false)
    }
  }

  // Shuffle management for both single draw and pick-all
  useEffect(() => {
    // Don't shuffle if winners are already displayed
    if (winner) {
      if (shuffleIntervalRef.current) {
        window.clearInterval(shuffleIntervalRef.current)
        shuffleIntervalRef.current = null
      }
      setShuffleName(null)
      return
    }

    // start shuffling when:
    // - single draw spinning (isSpinning && !pickingMultiple)
    // - picking multiple (pickingMultiple && isSpinning)
    // - waiting for audio to finish (waitingForAudio)
    const shouldShuffle = (isSpinning || waitingForAudio) && selectedPrize && selectedPrize.participants.length > 0
    if (shouldShuffle) {
      if (shuffleIntervalRef.current) window.clearInterval(shuffleIntervalRef.current)
      const participants = selectedPrize.participants
      // faster shuffle to better match drum-roll energy
      shuffleIntervalRef.current = window.setInterval(() => {
        const name = participants[Math.floor(Math.random() * participants.length)]
        setShuffleName(name)
      }, 20)
    }

    // stop shuffling when neither spinning nor waiting
    if (!(isSpinning || waitingForAudio)) {
      if (shuffleIntervalRef.current) {
        window.clearInterval(shuffleIntervalRef.current)
        shuffleIntervalRef.current = null
      }
      if (shuffleStopTimeoutRef.current) {
        window.clearTimeout(shuffleStopTimeoutRef.current)
        shuffleStopTimeoutRef.current = null
      }
      setShuffleName(null)
    }

    return () => {
      if (shuffleIntervalRef.current) {
        window.clearInterval(shuffleIntervalRef.current)
        shuffleIntervalRef.current = null
      }
    }
  }, [isSpinning, pickingMultiple, selectedPrize, waitingForAudio, winner])

  useEffect(() => {
    // Store stable winners when they're first set - only update if names actually change
    if (winner) {
      if (Array.isArray(winner)) {
        // Only update if we don't have stable winners or if the actual names changed
        const currentNames = stableWinnersRef.current?.map(w => w.winnerName).join(',') || ''
        const newNames = winner.map(w => w.winnerName).join(',')
        if (currentNames !== newNames || !stableWinnersRef.current) {
          // Create a deep copy to ensure stability
          stableWinnersRef.current = winner.map(w => ({
            prizeName: w.prizeName,
            winnerName: w.winnerName,
            timestamp: new Date(w.timestamp)
          }))
        }
      } else {
        // Single winner - store as array for consistency
        stableWinnersRef.current = [{
          prizeName: winner.prizeName,
          winnerName: winner.winnerName,
          timestamp: new Date(winner.timestamp)
        }]
      }
    } else if (!isSpinning) {
      // Clear stable winners when winner is null and not spinning
      stableWinnersRef.current = null
    }
    // Don't clear during spinning - keep previous winners visible
  }, [winner, isSpinning])

  useEffect(() => {
    // on reveal of winners, fade audio to background (instead of celebration sounds)
    if (winner) {
      if (shuffleIntervalRef.current) {
        window.clearInterval(shuffleIntervalRef.current)
        shuffleIntervalRef.current = null
      }
      if (shuffleStopTimeoutRef.current) {
        window.clearTimeout(shuffleStopTimeoutRef.current)
        shuffleStopTimeoutRef.current = null
      }
      setShuffleName(null)
      
      const isSingleWinner = !isMultipleWinner
      
      // if winners were revealed by the timeout (pick-all) or single draw, fade audio to background
      if (winnersRevealedRef.current || isSingleWinner) {
        winnersRevealedRef.current = false
        // fade down the audio so remaining portion plays as background
        fadeAudioToBackground(3000, 0.25)
        // clear flags
        audioJustEndedRef.current = false
      } else if (audioJustEndedRef.current) {
        // reveal was triggered by audio end — just clear the flag and avoid replaying celebration
        audioJustEndedRef.current = false
      } else {
        // play the ta-da-da-dang pattern then the full drum clip (fallback for unexpected cases)
        try {
          playFinalPattern()
          // schedule the full drum audio to play shortly after the pattern completes (~700ms)
          setTimeout(() => {
            try {
              const src = encodeURI(drumFilePath)
              const hit = new Audio(src)
              hit.volume = 1.0
              hit.loop = false
              hit.play().catch(() => {
                // fallback to additional synthesized hits
                playWinSound()
              })
            } catch (e) {
              playWinSound()
            }
          }, 700)
        } catch (e) {
          playWinSound()
        }
      }
    }
  }, [winner, isMultipleWinner])

  useEffect(() => {
    // reset participants page when switching prizes
    setParticipantPage(0)
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)

    // prepare audio element for drum file (public folder)
    try {
      const src = encodeURI(drumFilePath)
      const audio = new Audio(src)
      audio.preload = 'auto'
      audio.volume = 1.0
      audioElemRef.current = audio
    } catch (e) {
      audioElemRef.current = null
    }

    return () => {
      document.removeEventListener('fullscreenchange', onFsChange)
      if (audioElemRef.current) {
        try { audioElemRef.current.pause(); audioElemRef.current.src = '' } catch (e) {}
        audioElemRef.current = null
      }
      if (shuffleStopTimeoutRef.current) {
        window.clearTimeout(shuffleStopTimeoutRef.current)
        shuffleStopTimeoutRef.current = null
      }
      if (fadeIntervalRef.current) {
        window.clearInterval(fadeIntervalRef.current)
        fadeIntervalRef.current = null
      }
      if (masterGainRef.current && audioContextRef.current) {
        try { masterGainRef.current.gain.setValueAtTime(1, audioContextRef.current.currentTime) } catch (e) {}
        masterGainRef.current = null
      }
    }
  }, [])

  // cleanup audio and timers on unmount
  useEffect(() => {
    return () => {
      if (shuffleIntervalRef.current) {
        window.clearInterval(shuffleIntervalRef.current)
        shuffleIntervalRef.current = null
      }
      stopDrumLoop()
      if (audioContextRef.current) {
        try { audioContextRef.current.close() } catch (e) { /* ignore */ }
        audioContextRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (winner) {
      setConfettiTrigger(true)
      const timeout = setTimeout(() => setConfettiTrigger(false), 1200)
      return () => clearTimeout(timeout)
    }
  }, [winner])

  // Extra confetti when multiple winners are displayed (each reveal)
  useEffect(() => {
    if (Array.isArray(winner) && winner.length > 0) {
      setConfettiListTrigger(true)
      const timeout = setTimeout(() => setConfettiListTrigger(false), 1400)
      return () => clearTimeout(timeout)
    }
  }, [winner])

  // Removed auto-continue - user manually clicks "Continue Picking All Winners" button each time

  // Auto-scroll the winners list when multiple winners are shown
  useEffect(() => {
    if (!Array.isArray(winner) || winner.length === 0) {
      lastWinnerNamesRef.current = ''
      return
    }
    
    const el = winnersListRef.current
    if (!el) return

    // Create a stable reference to winner names to prevent unnecessary re-runs
    const winnerNames = winner.map(w => `${w.winnerName}-${w.timestamp.getTime()}`).join(',')
    
    // Only run if winner names have actually changed
    if (lastWinnerNamesRef.current === winnerNames && lastWinnerNamesRef.current !== '') {
      return
    }
    lastWinnerNamesRef.current = winnerNames

    // give the DOM a moment to render children
    const startTimeout = window.setTimeout(() => {
      // if there are many winners, step through them so the list 'slides' down
      const items = Array.from(el.children)
      if (items.length <= 8) {
        // short list: just scroll to bottom smoothly
        try { el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }) } catch (e) { el.scrollTop = el.scrollHeight }
        return
      }

      // for long lists, animate scrolling to each item in sequence
      let idx = 0
      const interval = window.setInterval(() => {
        idx = Math.min(idx + 1, items.length - 1)
        const child = items[idx] as HTMLElement
        if (child) {
          try { el.scrollTo({ top: child.offsetTop - 8, behavior: 'smooth' }) } catch (e) { el.scrollTop = child.offsetTop }
        }
        if (idx >= items.length - 1) {
          window.clearInterval(interval)
        }
      }, 500)

      // cleanup
      const cleanup = () => window.clearInterval(interval)
      // if user toggles view or component unmounts, stop
      ;(el as any).__autoScrollCleanup = cleanup
    }, 150)

    return () => {
      window.clearTimeout(startTimeout)
      const el2 = winnersListRef.current as any
      if (el2 && el2.__autoScrollCleanup) {
        try { el2.__autoScrollCleanup() } catch (e) {}
        delete el2.__autoScrollCleanup
      }
    }
  }, [winner])

  return (
    <div className="space-y-6">
      <ConfettiBurst trigger={confettiTrigger || confettiListTrigger} />
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className={`font-black bg-gradient-to-r from-primary via-primary to-primary/70 bg-clip-text text-transparent ${isFullscreen ? 'text-8xl md:text-8xl' : 'text-3xl'}`}>
          {"Winner Selection"}
        </h2>
        {selectedPrize ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {"Drawing for: "}
              <strong className="text-foreground text-base">{selectedPrize.name}</strong>
            </p>
            <div className="flex justify-center gap-4">
              <div className="px-3 py-1 bg-primary/10 rounded-full border border-primary/20">
                <p className="text-xs text-primary font-semibold">
                  {selectedPrize.participants.length} participant{selectedPrize.participants.length !== 1 ? "s" : ""}
                </p>
              </div>
              {remainingSlots > 0 && (
                <div className="px-3 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/20">
                  <p className="text-xs text-emerald-600 font-semibold">
                    {remainingSlots} slot{remainingSlots !== 1 ? "s" : ""} left
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{"Select a prize category to continue!"}</p>
        )}
      </div>

      {/* Name Display Container */}
      <div className="relative flex items-center justify-center">
        <div className="relative w-full max-w-lg">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 via-primary/10 to-transparent rounded-xl blur opacity-75" />
          <div
            ref={containerRef}
            className={`relative rounded-lg border-2 border-primary/30 shadow-2xl overflow-hidden p-8 ${isFullscreen ? 'w-full h-screen p-16 flex items-center justify-center' : ''}`}
            style={{
              backgroundImage: 'url(/new.jpg)',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat'
            }}
          >
            <button
              aria-label="Toggle fullscreen"
              onClick={toggleFullscreen}
              className="absolute top-3 right-3 p-2 rounded-md bg-white/60 hover:bg-white/80 text-primary shadow-sm"
              title="Toggle fullscreen"
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            {/* Display Area */}
            <div className={`text-center space-y-6 min-h-64 flex flex-col items-center ${isFullscreen ? 'justify-start pt-20' : 'justify-center' } overflow-hidden` }>
              {isSpinning && !displayedName && !isMultipleWinner ? (
                <div className="space-y-6">
                  <div className="inline-block">
                    <p className="text-lg text-white drop-shadow-[0_0_10px_rgba(0,0,0,0.8)] font-bold tracking-wider">
                      {"DRAWING..."}
                    </p>
                  </div>
                  <div className="flex flex-col items-center gap-6">
                    <div className="flex justify-center gap-3">
                      <div className="w-4 h-4 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0s" }} />
                      <div className="w-4 h-4 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
                      <div className="w-4 h-4 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0.4s" }} />
                    </div>
                    <p className={`font-black text-white drop-shadow-[0_0_8px_rgba(0,0,0,0.8)] animate-pulse tracking-wide ${isFullscreen ? 'text-6xl md:text-7xl' : 'text-3xl'}`}>{shuffleName ?? "..."}</p>
                  </div>
                </div>
              ) : pickingMultiple && isSpinning && displayedName ? (
                <div className="space-y-4 animate-in fade-in zoom-in duration-500 w-full">
                    <div className="inline-block mx-auto">
                    <div className="flex items-center gap-2 justify-center">
                      <Sparkles className={`${isFullscreen ? 'h-12 w-12' : 'h-8 w-8'} text-yellow-500 animate-spin`} />
                      <p className={`${isFullscreen ? 'text-4xl md:text-5xl' : 'text-3xl'} text-white drop-shadow-[0_0_12px_rgba(0,0,0,0.9)] font-bold uppercase tracking-widest`}>
                        {"Winner"}
                      </p>
                      <Sparkles className={`${isFullscreen ? 'h-12 w-12' : 'h-8 w-8'} text-yellow-500 animate-spin`} />
                    </div>
                  </div>
                  <p className={`${isFullscreen ? 'text-10xl md:text-11xl' : 'text-6xl'} font-black text-white drop-shadow-[0_0_12px_rgba(0,0,0,0.9)] break-words leading-tight`}>
                    {displayedName}
                  </p>
                </div>
              ) : (pickingMultiple && isSpinning && !displayedName) || waitingForAudio ? (
                <div className="space-y-4">
                  <div className="inline-block">
                  <p className="text-5xl text-white drop-shadow-[0_0_10px_rgba(0,0,0,0.8)] font-bold tracking-wider">
                      {"PICKING ALL WINNERS..."}
                    </p>
                  </div>
                  <div className="flex flex-col items-center">
                      <p className={`font-black text-white drop-shadow-[0_0_10px_rgba(0,0,0,0.9)] animate-pulse tracking-wide ${isFullscreen ? 'text-8xl md:text-9xl' : 'text-5xl'}`}>{shuffleName ?? "..."}</p>
                    <p className="text-sm text-muted-foreground mt-2">Shuffling all names...</p>
                  </div>
                </div>
              ) : displayedName && !isMultipleWinner ? (
                // Single winner display
                isFullscreen ? (
                  <div className="flex flex-col items-center justify-center w-full h-full gap-8">
                    <div className="flex items-center gap-4 justify-center">
                      <Sparkles className="h-12 w-12 text-yellow-500 animate-spin" />
                      <p className="text-5xl md:text-6xl font-extrabold text-white drop-shadow-[0_0_12px_rgba(0,0,0,0.9)] uppercase tracking-widest">WINNER</p>
                      <Sparkles className="h-12 w-12 text-yellow-500 animate-spin" />
                    </div>
                      <p
                        className="font-black text-white drop-shadow-[0_0_12px_rgba(0,0,0,0.9)] break-words break-all whitespace-normal leading-tight text-center cursor-pointer max-w-full px-6"
                        style={{ fontSize: isFullscreen ? 'clamp(3rem, 10vw, 10rem)' : undefined }}
                        onClick={() => openWinnerTab(displayedName!)}
                      >
                        {displayedName}
                      </p>
                  </div>
                ) : (
                  <div className="space-y-4 animate-in fade-in zoom-in duration-500 w-full">
                    <div className="inline-block mx-auto">
                      <div className="flex items-center gap-2 justify-center">
                        <Sparkles className="h-6 w-6 text-yellow-500 animate-spin" />
                        <p className={`${isFullscreen ? 'text-xl md:text-2xl' : 'text-2xl'} text-white drop-shadow-[0_0_12px_rgba(0,0,0,0.9)] font-bold uppercase tracking-widest`}>
                          {displayedName.includes("Winner") ? "Drawing" : "Winner"}
                        </p>
                        <Sparkles className="h-6 w-6 text-yellow-500 animate-spin" />
                      </div>
                    </div>
                    <p
                      className={`font-black text-white drop-shadow-[0_0_12px_rgba(0,0,0,0.9)] break-words break-all whitespace-normal animate-bounce cursor-pointer max-w-full px-4 ${isFullscreen ? 'text-7xl' : 'text-4xl'}`}
                      style={{ fontSize: isFullscreen ? 'clamp(2.5rem, 8vw, 6rem)' : undefined }}
                      onClick={() => openWinnerTab(displayedName!)}
                    >
                      {displayedName}
                    </p>
                  </div>
                )
              ) : isMultipleWinner ? (
                <div className={`w-full animate-in fade-in duration-500 flex flex-col items-center ${isFullscreen ? 'px-8' : ''}`}>
                  <div className="flex flex-col items-center gap-2 justify-center mb-4">
                    <div className="flex items-center gap-3 justify-center">
                      <Sparkles className={`${isFullscreen ? 'h-8 w-8' : 'h-6 w-6'} text-yellow-500 animate-spin`} />
                      <p className={`${isFullscreen ? 'text-4xl md:text-5xl' : 'text-2xl md:text-3xl'} text-white drop-shadow-[0_0_12px_rgba(0,0,0,0.9)] font-extrabold uppercase tracking-widest`}>
                        WINNER
                      </p>
                      <Sparkles className={`${isFullscreen ? 'h-8 w-8' : 'h-6 w-6'} text-yellow-500 animate-spin`} />
                    </div>
                    <p className={`${isFullscreen ? 'text-3xl md:text-4xl' : 'text-xl md:text-2xl'} text-white drop-shadow-[0_0_12px_rgba(0,0,0,0.9)] font-bold`}>
                      {selectedPrize?.name || 'PRIZE NAME'}
                    </p>
                  </div>

                  <div ref={winnersListRef} className={`w-full max-w-xl space-y-2 px-4`}> 
                    {(stableWinnersRef.current || winner).map((w, index) => (
                      <div
                        key={`${w.winnerName}-${w.timestamp.getTime()}-${index}`}
                        className="p-3 bg-white/95 backdrop-blur-sm border-2 border-primary/50 rounded-lg flex items-center justify-center cursor-pointer shadow-lg hover:bg-white hover:border-primary transition-all"
                        style={{ animationDelay: `${index * 80}ms` }}
                        onClick={() => openWinnerTab(w.winnerName)}
                      >
                        <p className={`text-center font-bold text-primary ${isFullscreen ? 'text-2xl md:text-3xl' : 'text-lg md:text-xl'}`}>
                          {w.winnerName}
                        </p>
                      </div>
                    ))}
                  </div>
                  {(canPickAll && remainingSlots > 1) || canContinuePicking ? (
                    <div className="mt-4 flex flex-col gap-2 items-center w-full">
                      {canPickAll && remainingSlots > 1 && (
                        <Button 
                          size="sm" 
                          onClick={() => handlePickAll(false)} 
                          disabled={!canPickAll || isSpinning || waitingForAudio} 
                          variant="outline"
                          className="px-4 py-2 border-2 border-primary/30 hover:bg-primary/5 hover:border-primary/50 w-full max-w-xs"
                        >
                          {pickingMultiple && isSpinning ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Picking Winners...
                            </>
                          ) : (
                            <>
                              <Users className="h-4 w-4 mr-2" />
                              Pick All the Winner
                            </>
                          )}
                        </Button>
                      )}
                      {canContinuePicking && (
                        <Button 
                          size="sm" 
                          onClick={handleContinuePickingWrapper} 
                          disabled={!canContinuePicking || isSpinning || waitingForAudio} 
                          variant="outline"
                          className="px-4 py-2 border-2 border-emerald-500/30 hover:bg-emerald-500/5 hover:border-emerald-500/50 w-full max-w-xs"
                        >
                          {pickingMultiple && isSpinning ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Continuing to Pick...
                            </>
                          ) : (
                            <>
                              <Users className="h-4 w-4 mr-2" />
                              Continue Picking All Winners
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-6">
                  <Sparkles className="h-12 w-12 text-muted-foreground/50 mx-auto" />
                  <p className="text-lg  text-muted-foreground font-semibold color = black text-white">
                    {"Ready to draw a winner?"}
                  </p>
                  <div className="flex flex-col gap-3 items-center">
                    {canSpin && (
                      <Button 
                        size="sm" 
                        onClick={handleSpin} 
                        disabled={!canSpin || waitingForAudio} 
                        variant="outline"
                        className="px-4 py-2 border-2 border-primary/30 hover:bg-primary/5 hover:border-primary/50"
                      >
                        {isSpinning && !pickingMultiple ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Drawing...
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4 mr-2" />
                            Pick One Winner
                          </>
                        )}
                      </Button>
                    )}
                    {canPickAll && remainingSlots > 1 && (
                      <Button 
                        size="sm" 
                        onClick={() => handlePickAll(false)} 
                        disabled={!canPickAll || isSpinning || waitingForAudio} 
                        variant="outline"
                        className="px-4 py-2 border-2 border-primary/30 hover:bg-primary/5 hover:border-primary/50"
                      >
                        {pickingMultiple && isSpinning ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Picking Winners...
                          </>
                        ) : (
                          <>
                            <Users className="h-4 w-4 mr-2" />
                            Pick All the Winner
                          </>
                        )}
                      </Button>
                    )}
                    {canContinuePicking && (
                      <Button 
                        size="sm" 
                        onClick={handleContinuePickingWrapper} 
                        disabled={!canContinuePicking || isSpinning || waitingForAudio} 
                        variant="outline"
                        className="px-4 py-2 border-2 border-emerald-500/30 hover:bg-emerald-500/5 hover:border-emerald-500/50"
                      >
                        {pickingMultiple && isSpinning ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Continuing to Pick...
                          </>
                        ) : (
                          <>
                            <Users className="h-4 w-4 mr-2" />
                            Continue Picking All Winners
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Participants List */}
      {selectedPrize && selectedPrize.participants.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-center flex-1">Available Participants ({selectedPrize.participants.length})</p>
          </div>
              <div className="flex flex-col items-center gap-2">
                <div className="flex flex-wrap gap-2 justify-center max-h-40 overflow-y-auto p-4 bg-gradient-to-br from-muted/50 to-muted/20 rounded-lg border border-muted/50 w-full">
                  {(() => {
                    const sorted = [...selectedPrize.participants].sort((a, b) => a.localeCompare(b))
                    const total = sorted.length
                    const totalPages = Math.max(1, Math.ceil(total / PARTICIPANTS_PER_PAGE))
                    const start = participantPage * PARTICIPANTS_PER_PAGE
                    const pageItems = sorted.slice(start, start + PARTICIPANTS_PER_PAGE)
                    return pageItems.map((participant, index) => (
                      <span
                        key={start + index}
                        className="px-3 py-1.5 bg-gradient-to-r from-primary/15 to-primary/10 text-primary rounded-full text-sm md:text-base font-medium border border-primary/30 whitespace-nowrap hover:bg-primary/20 transition-colors"
                        title={participant}
                      >
                        {participant.length > 18 ? participant.substring(0, 16) + '...' : participant}
                      </span>
                    ))
                  })()}
                </div>
                <div className="flex items-center justify-between w-full px-2">
                  <div className="text-sm text-muted-foreground">
                    {(() => {
                      const sorted = [...selectedPrize.participants].sort((a, b) => a.localeCompare(b))
                      const total = sorted.length
                      const start = participantPage * PARTICIPANTS_PER_PAGE + 1
                      const end = Math.min(total, (participantPage + 1) * PARTICIPANTS_PER_PAGE)
                      return `${start}-${end} of ${total}`
                    })()}
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="px-3 py-1 rounded-md bg-white/60 hover:bg-white/80 text-primary border"
                      onClick={() => setParticipantPage((p) => Math.max(0, p - 1))}
                      disabled={participantPage === 0}
                    >
                      Prev
                    </button>
                    <button
                      className="px-3 py-1 rounded-md bg-white/60 hover:bg-white/80 text-primary border"
                      onClick={() => setParticipantPage((p) => Math.min(Math.ceil(selectedPrize.participants.length / PARTICIPANTS_PER_PAGE) - 1, p + 1))}
                      disabled={(participantPage + 1) * PARTICIPANTS_PER_PAGE >= selectedPrize.participants.length}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
        </div>
      )}

      {/* Draw Buttons */}
      <div className="flex flex-col gap-3 pt-2">
        <div className="flex items-center gap-2">
          <Button 
            size="lg" 
            onClick={handleSpin} 
            disabled={!canSpin || waitingForAudio} 
            className="text-base px-8 py-6 font-bold flex-1 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80 shadow-lg"
          >
            {isSpinning && !pickingMultiple ? ( 
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Drawing Winner...
              </>
            ) : (
              <>
                <Play className="h-5 w-5 mr-2" />
                Draw One Winner
              </>
            )}
          </Button>
          {canPickAll && remainingSlots > 1 && (
            <Button 
              size="sm" 
              onClick={() => handlePickAll(false)} 
              disabled={!canPickAll || isSpinning || waitingForAudio} 
              variant="outline"
              className="px-4 py-6 border-2 border-primary/30 hover:bg-primary/5 hover:border-primary/50 flex-shrink-0"
              title={`Pick All ${remainingSlots} Winners`}
            >
              {pickingMultiple && isSpinning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Users className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
        {canPickAll && remainingSlots > 1 && (
          <Button 
            size="lg" 
            onClick={() => handlePickAll(false)} 
            disabled={!canPickAll || isSpinning || waitingForAudio} 
            variant="outline"
            className="text-base px-8 py-6 font-bold w-full border-2 border-primary/30 hover:bg-primary/5 hover:border-primary/50 shadow-lg"
          >
            {pickingMultiple && isSpinning ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Picking {remainingSlots} Winners...
              </>
            ) : (
              <>
                <Users className="h-5 w-5 mr-2" />
                Draw All {remainingSlots} Winners
              </>
            )}
          </Button>
        )}
        {canContinuePicking && (
          <Button 
            size="lg" 
            onClick={handleContinuePickingWrapper} 
            disabled={!canContinuePicking || isSpinning || waitingForAudio} 
            variant="outline"
            className="text-base px-8 py-6 font-bold w-full border-2 border-emerald-500/30 hover:bg-emerald-500/5 hover:border-emerald-500/50 shadow-lg"
          >
            {pickingMultiple && isSpinning ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Continuing to Pick...
              </>
            ) : (
              <>
                <Users className="h-5 w-5 mr-2" />
                Continue Picking All Winners
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  )
}

"use client"

import { v4 as uuidv4 } from 'uuid';
// import { useState } from "react" // removed duplicate
import { Card } from "@/components/ui/card"
import { PrizeForm } from "@/components/prize-form"
import { PrizesList } from "@/components/prizes-list"
import { WinnerDisplay } from "@/components/winner-display"
import { WinnersList } from "@/components/winners-list"
import { SetupManager } from "@/components/setup-manager"
import { Sparkles, Download } from "lucide-react"
import { HolidayBanner } from "./holiday-banner"
import { Button } from "@/components/ui/button"
import * as XLSX from "xlsx"
import { useEffect, useState } from "react"
import { NameRevealer } from "@/components/name-revealer"

export interface Prize {
  id: string
  name: string
  participants: string[]
  winnerSlots: number
  winners: Winner[]
}

export interface Winner {
  prizeName: string
  winnerName: string
  timestamp: Date
}

export function RandomPicker() {
  const [prizes, setPrizes] = useState<Prize[]>([])
  const [selectedPrize, setSelectedPrize] = useState<Prize | null>(null)
  const [winner, setWinner] = useState<Winner | Winner[] | null>(null)
  const [isSpinning, setIsSpinning] = useState(false)
  const [pickingMultiple, setPickingMultiple] = useState(false)
  const [displayedName, setDisplayedName] = useState<string | null>(null)
  const [globalParticipants, setGlobalParticipants] = useState<string[]>([])
  const [participantsHistory, setParticipantsHistory] = useState<string[]>([])

  const getAllWinners = () => {
    return prizes.flatMap((prize) => prize.winners.map((w) => w.winnerName))
  }


const addPrize = (prizeName: string, winnerSlots: number) => {
  const newPrize: Prize = {
    id: uuidv4(),
    name: prizeName,
    participants: [...globalParticipants],
    winnerSlots,
    winners: [],
  }

  setPrizes((prev) => [...prev, newPrize])
  setSelectedPrize(newPrize)
  setWinner(null)
}

    const removePrize = (id: string) => {
      setPrizes((prev) => prev.filter((p) => p.id !== id))
      if (selectedPrize?.id === id) setSelectedPrize(null)
    }

    const selectPrize = (prize: Prize) => {
      const updatedPrize = {
        ...prize,
        participants: [...new Set([...prize.participants, ...globalParticipants])],
      }
      setPrizes((prev) => prev.map((p) => (p.id === prize.id ? updatedPrize : p)))
      setSelectedPrize(updatedPrize)
      setWinner(null)
    }

    const addParticipantToPrize = (prizeId: string, participantName: string) => {
      setPrizes((prev) => prev.map((prize) => (prize.id === prizeId ? { ...prize, participants: [...prize.participants, participantName] } : prize)))
      setParticipantsHistory((prev) => (prev.includes(participantName) ? prev : [...prev, participantName]))
      if (selectedPrize?.id === prizeId) {
        setSelectedPrize({ ...selectedPrize, participants: [...new Set([...selectedPrize.participants, participantName])] })
      }
    }

    const removeParticipantFromPrize = (prizeId: string, participantIndex: number) => {
      const prize = prizes.find((p) => p.id === prizeId)
      if (!prize) return
      const participantToRemove = prize.participants[participantIndex]
      setPrizes((prev) => prev.map((p) => (p.id === prizeId ? { ...p, participants: p.participants.filter((_, i) => i !== participantIndex) } : p)))
      if (selectedPrize?.id === prizeId) {
        setSelectedPrize({ ...selectedPrize, participants: selectedPrize.participants.filter((p) => p !== participantToRemove) })
      }
    }

    // Single winner draw
    const handleSpin = () => {
      if (!selectedPrize || selectedPrize.participants.length === 0 || isSpinning) return
      if (selectedPrize.winners.length >= selectedPrize.winnerSlots) {
        alert("All winner slots for this prize are filled!")
        return
      }
      const globalWinners = getAllWinners()
      const availableParticipants = selectedPrize.participants.filter((p) => !globalWinners.includes(p))
      if (availableParticipants.length === 0) {
        alert("All participants have already won a prize or are ineligible!")
        return
      }
      setIsSpinning(true)
      setDisplayedName(null)
      setWinner(null)
      // Shuffle random names for 6 seconds (same as pick-all)
      const revealDuration = 6000
      const revealInterval = 100
      const startTime = Date.now()
      const randomIndex = Math.floor(Math.random() * availableParticipants.length)
      const winnerName = availableParticipants[randomIndex]
      const intervalId = setInterval(() => {
        const elapsed = Date.now() - startTime
        if (elapsed < revealDuration) {
          const randomParticipant = availableParticipants[Math.floor(Math.random() * availableParticipants.length)]
          setDisplayedName(randomParticipant)
        } else {
          clearInterval(intervalId)
          setDisplayedName(winnerName)
          setTimeout(() => {
            const newWinner: Winner = { prizeName: selectedPrize.name, winnerName, timestamp: new Date() }
            const updatedParticipants = selectedPrize.participants.filter((p) => p !== winnerName)
            const updatedPrize = { ...selectedPrize, winners: [...selectedPrize.winners, newWinner], participants: updatedParticipants }

            setPrizes((prev) => prev.map((p) => (p.id === selectedPrize.id ? updatedPrize : p)))
            setSelectedPrize(updatedPrize)
            setWinner(newWinner)
            setGlobalParticipants((prev) => prev.filter((p) => p !== winnerName))
            setIsSpinning(false)
            // keep displayedName showing the revealed winner until the next action
          }, 1200)
        }
      }, revealInterval)
    }

  // Multiple winners draw
  const handlePickAllWinners = (revealSequentially = true, isContinue = false) => {
    if (!selectedPrize || selectedPrize.participants.length === 0 || isSpinning) return
    const remainingSlots = selectedPrize.winnerSlots - selectedPrize.winners.length
    
    // Prevent re-picking if winners are already being processed
    if (pickingMultiple) return
    
    setIsSpinning(true)
    setPickingMultiple(true)
    setWinner(null)
    setDisplayedName(null)
    const globalWinners = getAllWinners()
    const availableParticipants = selectedPrize.participants.filter((p) => !globalWinners.includes(p))
    
    if (availableParticipants.length === 0) {
      alert("All participants have already won a prize or are ineligible!")
      setIsSpinning(false)
      setPickingMultiple(false)
      return
    }
    
    // If continue mode: always pick exactly winnerSlots winners (ignore remainingSlots)
    // Otherwise: respect the remaining slots limit (normal "Pick All" behavior)
    if (isContinue) {
      if (availableParticipants.length < selectedPrize.winnerSlots) {
        alert(`Not enough participants! Need at least ${selectedPrize.winnerSlots} participants to continue.`)
        setIsSpinning(false)
        setPickingMultiple(false)
        return
      }
    } else {
      // Normal "Pick All" mode - check remaining slots
      if (remainingSlots <= 0) {
        alert("All winner slots for this prize are filled!")
        setIsSpinning(false)
        setPickingMultiple(false)
        return
      }
    }
    
    // Shuffle and pick the required number of winners using Fisher-Yates shuffle
    const shuffled = [...availableParticipants]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const temp = shuffled[i]
      shuffled[i] = shuffled[j]
      shuffled[j] = temp
    }
    
    // If continue mode: pick exactly winnerSlots winners per click (strict limit)
    // Otherwise: respect the remaining slots limit
    let winnersToPick: number
    if (isContinue) {
      // When continuing, pick exactly winnerSlots winners (no more, no less)
      winnersToPick = Math.min(selectedPrize.winnerSlots, shuffled.length)
      // Ensure we don't pick more than winnerSlots
      if (winnersToPick > selectedPrize.winnerSlots) {
        winnersToPick = selectedPrize.winnerSlots
      }
    } else {
      // Normal "Pick All" mode - respect remaining slots
      winnersToPick = Math.min(remainingSlots, shuffled.length)
    }
    const newWinners: Winner[] = []
    const baseTimestamp = new Date()
    // Strictly pick exactly winnersToPick winners (never more)
    const actualWinnersToPick = isContinue 
      ? Math.min(winnersToPick, selectedPrize.winnerSlots, shuffled.length)
      : winnersToPick
    for (let i = 0; i < actualWinnersToPick; i++) {
      newWinners.push({ prizeName: selectedPrize.name, winnerName: shuffled[i], timestamp: new Date(baseTimestamp.getTime() + i) })
    }
    
    // Final safety check: if continuing, ensure we never have more than winnerSlots
    if (isContinue && newWinners.length > selectedPrize.winnerSlots) {
      console.warn(`Warning: Picked ${newWinners.length} winners but winnerSlots is ${selectedPrize.winnerSlots}. Trimming to ${selectedPrize.winnerSlots}.`)
      newWinners.splice(selectedPrize.winnerSlots)
    }
    if (revealSequentially) {
      // Sequentially reveal each winner
      let current = 0
      function revealNext() {
        if (current < newWinners.length) {
          setDisplayedName(newWinners[current].winnerName)
          setTimeout(() => {
            current++
            revealNext()
          }, 1200)
        } else {
          // Finalize all winners
          if (!selectedPrize) {
            setIsSpinning(false)
            setPickingMultiple(false)
            setDisplayedName(null)
            return
          }
          const winnerNames = newWinners.map((w) => w.winnerName)
          const updatedParticipants = selectedPrize.participants.filter((p) => !winnerNames.includes(p))
          const updatedPrize: Prize = {
            id: selectedPrize.id,
            name: selectedPrize.name,
            winnerSlots: selectedPrize.winnerSlots,
            participants: updatedParticipants,
            winners: [...selectedPrize.winners, ...newWinners],
          }
          setPrizes((prev) => prev.map((p) => (p.id === selectedPrize.id ? updatedPrize : p)))
          setSelectedPrize(updatedPrize)
          // If continue mode: show only the new winners picked in this round
          // Otherwise: show all winners (existing + new)
          setWinner(isContinue ? newWinners : updatedPrize.winners)
          setGlobalParticipants((prev) => prev.filter((p) => !winnerNames.includes(p)))
          setIsSpinning(false)
          setPickingMultiple(false)
          // keep displayedName showing last revealed winner until next draw
        }
      }
      revealNext()
    } else {
      // Immediately finalize and show all winners at once
      const winnerNames = newWinners.map((w) => w.winnerName)
      const updatedParticipants = selectedPrize.participants.filter((p) => !winnerNames.includes(p))
      const updatedPrize: Prize = {
        id: selectedPrize.id,
        name: selectedPrize.name,
        winnerSlots: selectedPrize.winnerSlots,
        participants: updatedParticipants,
        winners: [...selectedPrize.winners, ...newWinners],
      }
      setPrizes((prev) => prev.map((p) => (p.id === selectedPrize.id ? updatedPrize : p)))
      setSelectedPrize(updatedPrize)
      // If continue mode: show only the new winners picked in this round
      // Otherwise: show all winners (existing + new)
      setWinner(isContinue ? newWinners : updatedPrize.winners)
      setGlobalParticipants((prev) => prev.filter((p) => !winnerNames.includes(p)))
      setIsSpinning(false)
      setPickingMultiple(false)
      // displayedName remains null; NameRevealer will show the `winner` array
    }
  }

  // Continue picking - actual logic is handled in name-revealer to trigger audio/shuffle effects
  const handleContinuePicking = () => {
    // This is a no-op - the actual continue picking logic is in name-revealer's handleContinuePickingWrapper
    // which calls handlePickAll to trigger audio/shuffle effects
  }

  const resetAll = () => {
    setPrizes([])
    setSelectedPrize(null)
    setWinner(null)
    setGlobalParticipants([])
  }

  // Global participant management functions
  const addGlobalParticipant = (name: string) => {
    if (!globalParticipants.includes(name)) {
      const updatedGlobalParticipants = [...globalParticipants, name]
      setGlobalParticipants(updatedGlobalParticipants)
      // add to participants history
      setParticipantsHistory((prev) => (prev.includes(name) ? prev : [...prev, name]))
      
      // If a prize is selected, automatically add the new participant to it
      if (selectedPrize) {
        const updatedPrize = {
          ...selectedPrize,
          participants: [...new Set([...selectedPrize.participants, name])],
        }
        setPrizes(prizes.map((p) => (p.id === selectedPrize.id ? updatedPrize : p)))
        setSelectedPrize(updatedPrize)
      }
    }
  }

  const removeGlobalParticipant = (index: number) => {
    const participantToRemove = globalParticipants[index]
    setGlobalParticipants(globalParticipants.filter((_, i) => i !== index))
    
    // If a prize is selected, remove the participant from it too
    if (selectedPrize) {
      const updatedPrize = {
        ...selectedPrize,
        participants: selectedPrize.participants.filter((p) => p !== participantToRemove),
      }
      setPrizes(prizes.map((p) => (p.id === selectedPrize.id ? updatedPrize : p)))
      setSelectedPrize(updatedPrize)
    }
  }

  const importGlobalParticipants = (names: string[]) => {
    const uniqueNames = [...new Set([...globalParticipants, ...names])]
    setGlobalParticipants(uniqueNames)
    // add imported names to history
    setParticipantsHistory((prev) => {
      const merged = [...prev]
      names.forEach((n) => {
        if (!merged.includes(n)) merged.push(n)
      })
      return merged
    })
    
    // If a prize is selected, automatically add all new participants to it
    if (selectedPrize) {
      const updatedPrize = {
        ...selectedPrize,
        participants: [...new Set([...selectedPrize.participants, ...names])],
      }
      setPrizes(prizes.map((p) => (p.id === selectedPrize.id ? updatedPrize : p)))
      setSelectedPrize(updatedPrize)
    }
  }

  // Download all winners
  const downloadAllWinners = (format: "txt" | "excel") => {
    const allWinners = prizes.flatMap((prize) =>
      prize.winners.map((w) => ({
        prize: w.prizeName,
        winner: w.winnerName,
        timestamp: w.timestamp,
      }))
    )

    if (allWinners.length === 0) {
      alert("No winners to download yet!")
      return
    }

    if (format === "txt") {
      let result = "🎉 ALL WINNERS LIST 🎉\n\n"
      allWinners.forEach((w, index) => {
        result += `${index + 1}. Winner: ${w.winner}\n`
        result += `   Prize: ${w.prize}\n`
        result += `   Date: ${w.timestamp.toLocaleDateString()}\n`
        result += `   Time: ${w.timestamp.toLocaleTimeString()}\n\n`
      })
      result += `Total Winners: ${allWinners.length}\n`
      result += "Congratulations to all winners!"

      const blob = new Blob([result], { type: "text/plain" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `all-winners-${new Date().toISOString().split("T")[0]}.txt`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } else if (format === "excel") {
      const data = [
        ["All Winners List"],
        [],
        ["#", "Winner Name", "Prize", "Date", "Time", "Full Timestamp"],
      ]

      allWinners.forEach((w, index) => {
        data.push([
          (index + 1).toString(),
          w.winner,
          w.prize,
          w.timestamp.toLocaleDateString(),
          w.timestamp.toLocaleTimeString(),
          w.timestamp.toLocaleString(),
        ])
      })

      data.push([])
      data.push(["Total Winners", allWinners.length.toString()])

      const ws = XLSX.utils.aoa_to_sheet(data)
      ws["!cols"] = [
        { width: 5 },
        { width: 25 },
        { width: 25 },
        { width: 15 },
        { width: 15 },
        { width: 25 },
      ]

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "All Winners")

      XLSX.writeFile(wb, `all-winners-${new Date().toISOString().split("T")[0]}.xlsx`)
    }
  }

  const resetPrizeWinners = (prizeId: string) => {
    setPrizes(prizes.map((prize) => (prize.id === prizeId ? { ...prize, winners: [] } : prize)))
    if (selectedPrize?.id === prizeId) {
      setSelectedPrize({ ...selectedPrize, winners: [] })
      setWinner(null)
    }
  }

  const updatePrizeWinnerSlots = (prizeId: string, winnerSlots: number) => {
    const updatedPrize = prizes.find((p) => p.id === prizeId)
    if (!updatedPrize) return

    // Can't reduce below current winners
    if (winnerSlots < updatedPrize.winners.length) {
      alert(`Cannot set winner slots below ${updatedPrize.winners.length} (current winners)`)
      return
    }

    const newPrize = { ...updatedPrize, winnerSlots }
    setPrizes(prizes.map((p) => (p.id === prizeId ? newPrize : p)))
    if (selectedPrize?.id === prizeId) {
      setSelectedPrize(newPrize)
    }
  }

  const updatePrizeName = (prizeId: string, newName: string) => {
    if (!newName.trim()) {
      alert("Prize name cannot be empty!")
      return
    }

    const updatedPrize = prizes.find((p) => p.id === prizeId)
    if (!updatedPrize) return

    // Important: Existing winners keep their original prize name for historical accuracy
    // Only new winners drawn after this change will use the new prize name
    // This allows you to download winners, change the prize name, and download again
    // without affecting the historical record of existing winners
    const newPrize = { ...updatedPrize, name: newName.trim() }
    setPrizes(prizes.map((p) => (p.id === prizeId ? newPrize : p)))
    if (selectedPrize?.id === prizeId) {
      setSelectedPrize(newPrize)
    }
  }

  // Participants history management
  const removeParticipantHistory = (name: string) => {
    setParticipantsHistory((prev) => prev.filter((n) => n !== name))
    // Also remove from global participants to keep lists consistent
    setGlobalParticipants((prev) => prev.filter((p) => p !== name))
    // Also remove from prizes participants and winners if desired (we'll remove from participants)
    setPrizes((prev) =>
      prev.map((prize) => ({
        ...prize,
        participants: prize.participants.filter((p) => p !== name),
      })),
    )
  }

  const clearParticipantsHistory = () => {
    setParticipantsHistory([])
  }

  const editParticipantHistory = (oldName: string, newName: string) => {
    if (!newName || oldName === newName) return
    setParticipantsHistory((prev) => prev.map((n) => (n === oldName ? newName : n)))
    // Update global participants
    setGlobalParticipants((prev) => prev.map((p) => (p === oldName ? newName : p)))
    // Update prizes participants and winners
    setPrizes((prev) =>
      prev.map((prize) => ({
        ...prize,
        participants: prize.participants.map((p) => (p === oldName ? newName : p)),
        winners: prize.winners.map((w) => (w.winnerName === oldName ? { ...w, winnerName: newName } : w)),
      })),
    )
  }

  // Render NameRevealer instead of wheel
  return (
    <div className="space-y-8">
      {/* Holiday Banner + Header */}
      <HolidayBanner />

      {/* Main Content */}
      <div className="grid lg:grid-cols-2 gap-8">
        {/* Left Column - Setup and Prize Management */}
        <div className="space-y-6">
          <Card className="p-6">
            <SetupManager
              participants={globalParticipants}
              onAddParticipant={addGlobalParticipant}
              onRemoveParticipant={removeGlobalParticipant}
              onImportParticipants={importGlobalParticipants}
              onAddPrize={addPrize}
              prizeCount={prizes.length}
            />
          </Card>

          <Card className="p-6">
            <PrizesList
              prizes={prizes}
              selectedPrize={selectedPrize}
              onSelectPrize={selectPrize}
              onRemovePrize={removePrize}
              onAddParticipant={addParticipantToPrize}
              onRemoveParticipant={removeParticipantFromPrize}
              onReset={resetAll}
              onResetPrizeWinners={resetPrizeWinners}
              onUpdateWinnerSlots={updatePrizeWinnerSlots}
              onUpdatePrizeName={updatePrizeName}
              participantsHistory={participantsHistory}
              onRemoveHistoryName={removeParticipantHistory}
              onClearHistory={clearParticipantsHistory}
              onEditHistoryName={editParticipantHistory}
            />
          </Card>
        </div>

        {/* Right Column - Wheel and Winner */}
        <div className="space-y-6">
          <Card className="p-6">
            <NameRevealer
              selectedPrize={selectedPrize}
              isSpinning={isSpinning}
              onSpin={handleSpin}
              onPickAll={handlePickAllWinners}
              onContinuePicking={handleContinuePicking}
              winner={winner}
              displayedName={displayedName}
              pickingMultiple={pickingMultiple}
            />
          </Card>

          {winner && (
            <WinnerDisplay 
              winner={winner} 
              onClose={() => setWinner(null)}
              onRemove={() => {
                // Winner is already removed automatically, just close
                setWinner(null)
              }}
            />
          )}

          {prizes.some((p) => p.winners.length > 0) && (
            <>
              <WinnersList prizes={prizes} />
              <Card className="p-6">
                <div className="space-y-4">
                  <h3 className="text-xl font-bold">Download All Winners</h3>
                  <p className="text-sm text-muted-foreground">
                    Download the complete list of all winners from all prizes
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => downloadAllWinners("txt")}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download TXT
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => downloadAllWinners("excel")}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download Excel
                    </Button>
                  </div>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

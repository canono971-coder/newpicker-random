import React from "react"
import { Sparkles } from "lucide-react"

export function HolidayBanner() {
  return (
    <div className="holiday-banner">
      <div className="banner-badge">
        <span style={{display: 'flex', alignItems: 'center', gap: 8}}>
          <Sparkles className="h-5 w-5" />
          <span>Denim & Diamond</span>
        </span>
      </div>
      <div className="banner-title">
        <h2>Christmas Denim & Diamond Celebration</h2>
        <p>Add your prizes and names, then spin to reveal winners.</p>
      </div>
    </div>
  )
}

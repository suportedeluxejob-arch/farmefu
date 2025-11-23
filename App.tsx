"use client"

import React, { useState, useEffect, useMemo, useCallback } from "react"
import { ITEMS_DB, DPIX_PRICE_BRL, RENT_DURATION_MS, EXCHANGE_FEE } from "./constants"
import type { GameState, DBItem, InventoryItem, Tier, ToastMsg, ItemType } from "./types"

// --- HELPER FUNCTIONS (Moved outside to prevent re-creation) ---
const formatBRL = (val: number) => {
  if (val < 0.01 && val > 0) {
    return val.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }
  return val.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

const formatDPIX = (val: number) => {
  if (val >= 1000000) return `${(val / 1000000).toFixed(2)}M Ð`
  if (val >= 1000) return `${(val / 1000).toFixed(2)}K Ð`
  if (val >= 10) return `${val.toFixed(2)} Ð`
  return `${val.toFixed(4)} Ð`
}

const getAccountAgeDays = (createdAt: number) => {
  const diff = Date.now() - createdAt
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

const getWithdrawFee = (createdAt: number) => {
  const days = getAccountAgeDays(createdAt)
  if (days <= 10) return { rate: 0.3, label: "30%", color: "text-neon-red", barClass: "step-bad" }
  if (days <= 20) return { rate: 0.15, label: "15%", color: "text-neon-yellow", barClass: "step-mid" }
  return { rate: 0.05, label: "5%", color: "text-neon-green", barClass: "step-good" }
}

const getActiveDailyProduction = (inventory: InventoryItem[]) => {
  const rooms = inventory.filter((i) => i.type === "room")
  let total = 0
  rooms.forEach((room) => {
    if (room.power === false) return
    const timeLeft = (room.lastRentPaid || 0) + RENT_DURATION_MS - Date.now()
    if (timeLeft <= 0) return
    const shelves = inventory.filter((s) => s.parentId === room.uid)
    shelves.forEach((shelf) => {
      inventory
        .filter((m) => m.parentId === shelf.uid)
        .forEach((miner) => {
          const dbMiner = ITEMS_DB.miner.find((x) => x.id === miner.id)
          if (dbMiner) {
            const health = miner.health ?? 100
            if (health <= 0) return
            total += dbMiner.daily || 0
          }
        })
    })
  })
  return total
}

const getActivePower = (inventory: InventoryItem[]) => {
  const rooms = inventory.filter((i) => i.type === "room")
  let total = 0
  rooms.forEach((room) => {
    if (room.power === false) return
    const timeLeft = (room.lastRentPaid || 0) + RENT_DURATION_MS - Date.now()
    if (timeLeft <= 0) return
    const shelves = inventory.filter((s) => s.parentId === room.uid)
    shelves.forEach((shelf) => {
      inventory
        .filter((m) => m.parentId === shelf.uid)
        .forEach((miner) => {
          const dbMiner = ITEMS_DB.miner.find((x) => x.id === miner.id)
          if (dbMiner) {
            const health = miner.health ?? 100
            if (health <= 0) return
            total += dbMiner.power || 0
          }
        })
    })
  })
  return total
}

const getActiveWatts = (inv: InventoryItem[]) => {
  let total = 0
  const miners = inv.filter((i) => i.type === "miner")
  miners.forEach((m) => {
    if (m.parentId) {
      const shelf = inv.find((s) => s.uid === m.parentId)
      if (shelf && shelf.parentId) {
        const room = inv.find((r) => r.uid === shelf.parentId)
        if (room && room.power !== false) {
          const dbItem = ITEMS_DB.miner.find((x) => x.id === m.id)
          if (dbItem && dbItem.power) total += Math.floor(dbItem.power * 0.8)
        }
      }
    }
  })
  return total
}

const getTotalRentCost = (inv: InventoryItem[]) => {
  let total = 0
  inv
    .filter((i) => i.type === "room")
    .forEach((room) => {
      const dbRoom = ITEMS_DB.room.find((r) => r.id === room.id)
      if (dbRoom && dbRoom.rent) total += dbRoom.rent
    })
  return total
}

const getTierColor = (tier: Tier) => {
  switch (tier) {
    case "basic":
      return "#888888"
    case "common":
      return "#00b85f"
    case "rare":
      return "#00a3bf"
    case "epic":
      return "#8a1ccc"
    case "legendary":
      return "#cc9000"
    case "box":
      return "#ffb300"
    case "special":
      return "#ff0099"
    default:
      return "#888"
  }
}

const getRarityClass = (tier: Tier) => {
  switch (tier) {
    case "basic":
      return "bg-tier-basic text-[#222]"
    case "common":
      return "bg-tier-common text-[#000]"
    case "rare":
      return "bg-tier-rare text-[#000]"
    case "epic":
      return "bg-tier-epic text-[#fff]"
    case "legendary":
      return "bg-tier-legendary text-[#000] shadow-[0_0_10px_var(--tier-legendary)]"
    case "box":
      return "bg-tier-box text-[#000]"
    case "special":
      return "bg-tier-special text-white shadow-[0_0_10px_var(--tier-special)]"
    default:
      return "bg-gray-500"
  }
}

const getTierLabel = (tier: Tier) => {
  switch (tier) {
    case "basic":
      return "Item Básico"
    case "common":
      return "Item Comum"
    case "rare":
      return "Item Raro"
    case "epic":
      return "Item Épico"
    case "legendary":
      return "Item Lendário"
    case "special":
      return "Item Especial"
    default:
      return "Item"
  }
}

const Tooltip = ({ children, text }: { children: React.ReactNode; text: string }) => {
  const [show, setShow] = useState(false)
  return (
    <div className="relative inline-block" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-black/95 text-white text-xs rounded whitespace-nowrap z-50 pointer-events-none animate-fade-in border border-white/10">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-black/95"></div>
        </div>
      )}
    </div>
  )
}

// --- ISOLATED COMPONENTS (Prevents flickering) ---

const RarityBadge = React.memo(({ tier }: { tier: Tier }) => (
  <span
    className={`text-[9px] font-extrabold uppercase px-2 py-[3px] rounded tracking-widest mt-1 inline-block ${getRarityClass(tier)}`}
  >
    {tier}
  </span>
))

const FinancialTable = React.memo(({ inventory }: { inventory: InventoryItem[] }) => {
  const dailyDpix = getActiveDailyProduction(inventory)
  const dailyGross = dailyDpix * DPIX_PRICE_BRL
  const dailyRentCost = getTotalRentCost(inventory) * 2 // 12h cycle x2
  const dailyExchangeFee = dailyGross * EXCHANGE_FEE
  const dailyNet = dailyGross - dailyRentCost - dailyExchangeFee
  const margin = dailyGross > 0 ? (dailyNet / dailyGross) * 100 : 0

  const periods = [
    { name: "Dia (24h)", mult: 1 },
    { name: "Semana (7d)", mult: 7 },
    { name: "Mês (30d)", mult: 30 },
  ]

  return (
    <div className="animate-slide-in">
      <p className="text-[#888] mb-8">Projeções baseadas na sua infraestrutura atual ativa.</p>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-5 mb-8">
        <div className="bg-card-bg rounded-xl p-5 border border-border-color relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-dpix-color"></div>
          <div className="text-xs text-text-muted uppercase tracking-widest mb-2.5">Faturamento Diário</div>
          <div className="text-2xl font-bold text-dpix-color font-mono">{formatBRL(dailyGross)}</div>
          <div className="text-xs text-text-muted mt-1">
            {dailyDpix.toFixed(2)} DPIX/dia × R$ {DPIX_PRICE_BRL.toFixed(2)}
          </div>
        </div>
        <div className="bg-card-bg rounded-xl p-5 border border-border-color relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-neon-red"></div>
          <div className="text-xs text-text-muted uppercase tracking-widest mb-2.5">Custo Diário (Energia)</div>
          <div className="text-2xl font-bold text-neon-red font-mono">{formatBRL(dailyRentCost)}</div>
          <div className="text-xs text-text-muted mt-1">2 ciclos de 12h por dia</div>
        </div>
        <div className="bg-card-bg rounded-xl p-5 border border-border-color relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-neon-yellow"></div>
          <div className="text-xs text-text-muted uppercase tracking-widest mb-2.5">Taxas de Câmbio (5%)</div>
          <div className="text-2xl font-bold text-neon-yellow font-mono">{formatBRL(dailyExchangeFee)}</div>
          <div className="text-xs text-text-muted mt-1">5% sobre conversão DPIX → BRL</div>
        </div>
        <div className="bg-card-bg rounded-xl p-5 border border-border-color relative overflow-hidden">
          <div
            className={`absolute left-0 top-0 bottom-0 w-1 ${dailyNet >= 0 ? "bg-neon-green" : "bg-neon-red"}`}
          ></div>
          <div className="text-xs text-text-muted uppercase tracking-widest mb-2.5">Lucro Líquido Diário</div>
          <div className={`text-2xl font-bold font-mono ${dailyNet >= 0 ? "text-neon-green" : "text-neon-red"}`}>
            {formatBRL(dailyNet)}
          </div>
          <div className="text-xs text-text-muted mt-1">
            Margem:{" "}
            <span className={`font-bold ${dailyNet >= 0 ? "text-neon-green" : "text-neon-red"}`}>
              {margin.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      <h3 className="mt-8 mb-4 border-b border-[#333] pb-2 text-white font-bold text-lg">Projeções Futuras</h3>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-y-2.5">
          <thead>
            <tr>
              <th className="text-left text-[#888] p-2.5 text-xs uppercase border-b border-[#33]">Período</th>
              <th className="text-left text-[#888] p-2.5 text-xs uppercase border-b border-[#33]">Produção DPIX</th>
              <th className="text-left text-[#888] p-2.5 text-xs uppercase border-b border-[#33]">Faturamento Bruto</th>
              <th className="text-left text-[#888] p-2.5 text-xs uppercase border-b border-[#33]">Custo Energia</th>
              <th className="text-left text-[#888] p-2.5 text-xs uppercase border-b border-[#33]">Taxas (5%)</th>
              <th className="text-left text-[#888] p-2.5 text-xs uppercase border-b border-[#33]">Lucro Líquido</th>
            </tr>
          </thead>
          <tbody>
            {periods.map((p, idx) => {
              const dpixProd = dailyDpix * p.mult
              const gross = dailyGross * p.mult
              const cost = dailyRentCost * p.mult
              const fee = dailyExchangeFee * p.mult
              const net = dailyNet * p.mult
              const color = net >= 0 ? "text-neon-green" : "text-neon-red"
              return (
                <tr key={idx}>
                  <td className="bg-card-bg p-4 text-white border-y border-[#333] border-l rounded-l-lg font-medium">
                    {p.name}
                  </td>
                  <td className="bg-card-bg p-4 text-dpix-color border-y border-[#333] font-mono">
                    {dpixProd.toFixed(2)} Ð
                  </td>
                  <td className="bg-card-bg p-4 text-white border-y border-[#333] font-mono">{formatBRL(gross)}</td>
                  <td className="bg-card-bg p-4 text-neon-red border-y border-[#333] font-mono">{formatBRL(cost)}</td>
                  <td className="bg-card-bg p-4 text-neon-yellow border-y border-[#333] font-mono">{formatBRL(fee)}</td>
                  <td
                    className={`bg-card-bg p-4 font-bold border-y border-[#333] border-r rounded-r-lg ${color} font-mono`}
                  >
                    {formatBRL(net)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
})

// Renomeando ShopView para MarketView e adicionando prop onOpenBox
const MarketView = React.memo(
  ({
    filter,
    setFilter,
    onBuy,
    onOpenBox, // Keep this for now, even if not used directly in MarketView rendering
  }: {
    filter: string
    setFilter: (f: string) => void
    onBuy: (item: DBItem, type: string) => void
    onOpenBox: (tier: Tier, subtype: ItemType) => void
  }) => {
    const items = useMemo(() => {
      return filter === "special"
        ? ITEMS_DB.miner.filter((i) => i.isSpecial)
        : ITEMS_DB[filter].filter((i) => !i.hidden && !i.isSpecial)
    }, [filter])

    return (
      <div className="p-8 animate-slide-in max-w-6xl mx-auto w-full pb-20">
        <h2 className="text-2xl font-bold mb-5 text-white">Mercado Global</h2>
        <div className="flex gap-2.5 mb-5 flex-wrap">
          {["miner", "shelf", "room"].map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`px-5 py-2 rounded-full border font-bold transition-colors text-sm uppercase ${filter === t ? "bg-accent border-accent text-white" : "bg-transparent border-border-color text-[#888]"}`}
            >
              {t === "miner" ? "Mineradoras" : t === "shelf" ? "Prateleiras" : "Quartos"}
            </button>
          ))}
          <button
            onClick={() => setFilter("special")}
            className={`px-5 py-2 rounded-full border font-bold transition-colors text-sm uppercase flex items-center gap-2 ${filter === "special" ? "bg-tier-special border-tier-special text-white" : "bg-transparent border-tier-special text-tier-special"}`}
          >
            <i className="fa-solid fa-star"></i> Especiais (Skins)
          </button>
        </div>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5">
          {items.map((item) => {
            const isBox = item.tier === "box"
            const isSpecial = item.isSpecial
            let visual = null
            let stats = null

            if (item.type === "miner" || item.isSpecial) {
              const fanCount = item.fans || 1
              const styleClass = item.skinStyle ? `style-${item.skinStyle}` : ""
              const tierColor = getTierColor(item.tier)
              visual = (
                <div
                  className={`w-[180px] h-[80px] rounded-md border border-[#333] flex items-center justify-around px-[5px] shadow-lg transition-all bg-gradient-to-b from-[#2a2d3a] to-[#151621] ${styleClass}`}
                  style={{ borderBottom: item.tier !== "basic" && !isBox ? `2px solid ${tierColor}` : "" }}
                >
                  {[...Array(fanCount)].map((_, i) => (
                    <div
                      key={i}
                      className="w-[35px] h-[35px] rounded-full bg-[#0b0c15] border border-[#444] relative flex items-center justify-center"
                    >
                      <div
                        className={`w-full h-full rounded-full fan-blades-gradient opacity-80 animate-spin-slow`}
                      ></div>
                    </div>
                  ))}
                </div>
              )
              const roi = item.price ? (item.price / item.daily).toFixed(1) : 0

              stats = (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-white">Poder</span>
                    <span className="font-bold text-white">{item.power.toFixed(0)} MH/s</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-white">Produção</span>
                    <span className="font-bold text-dpix-color">{item.daily.toFixed(2)} Ð</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-[#999]">ROI Est.</span>
                    <span className="font-bold text-neon-green">{roi} Dias</span>
                  </div>
                </div>
              )
            } else if (item.type === "shelf") {
              visual = (
                <div className="w-[100px] h-[90px] bg-[#1a1c29] border border-[#444] rounded flex flex-col justify-between p-[5px]">
                  <div className="h-[6px] bg-[#0b0c15] mb-[2px] rounded-sm bg-neon-green"></div>
                  <div
                    className="h-[6px] bg-[#0b0c15] mb-[2px] rounded-sm"
                    style={{ background: (item.slots || 0) >= 4 ? "#00e676" : "#333" }}
                  ></div>
                  <div
                    className="h-[6px] bg-[#0b0c15] mb-[2px] rounded-sm"
                    style={{ background: (item.slots || 0) >= 6 ? "#00e676" : "#333" }}
                  ></div>
                </div>
              )

              stats = (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-white text-base">Capacidade</span>
                    <span className="font-bold text-neon-green text-base">{item.slots} Slots</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-[#999]">Custo/Slot</span>
                    <span className="font-bold text-white">{(item.price / (item.slots || 1)).toFixed(0)} Ð</span>
                  </div>
                </div>
              )
            } else if (item.type === "room") {
              visual = (
                <div className={`w-full h-full flex items-center justify-center relative theme-${item.tier}`}>
                  <i className={`fa-solid fa-house-laptop text-[50px] text-white/80 drop-shadow-lg`}></i>
                </div>
              )

              stats = (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-white text-base">Capacidade</span>
                    <span className="font-bold text-neon-green text-base">{item.slots} Racks</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-[#999]">Aluguel/12h</span>
                    <span className="font-bold text-neon-red">{formatBRL(item.rent || 0)}</span>
                  </div>
                </div>
              )
            } else if (isBox) {
              visual = (
                <div className="w-full h-full flex items-center justify-center bg-[radial-gradient(circle_at_center,#222_0%,#111_100%)]">
                  <i className="fa-solid fa-cube text-[42px] text-tier-box drop-shadow-lg group-hover:scale-105 transition-transform"></i>
                </div>
              )
              stats = (
                <div className="flex flex-col gap-2.5">
                  <div className="text-xs text-[#aaa] text-center mb-1">{item.desc}</div>
                  <div className="flex h-2 w-full bg-[#111] rounded overflow-hidden">
                    <div className="h-full bg-tier-basic w-[60%]"></div>
                    <div className="h-full bg-tier-common w-[25%]"></div>
                    <div className="h-full bg-tier-rare w-[10%]"></div>
                    <div className="h-full bg-tier-epic w-[4%]"></div>
                    <div className="h-full bg-tier-legendary w-[1%]"></div>
                  </div>
                  <div className="flex justify-between text-[9px] font-mono text-[#666] px-0.5 mt-1">
                    <span className="text-tier-basic">60%</span>
                    <span className="text-tier-common">25%</span>
                    <span className="text-tier-rare">10%</span>
                    <span className="text-tier-epic">4%</span>
                    <span className="text-tier-legendary">1%</span>
                  </div>
                </div>
              )
            }

            return (
              <div
                key={item.id}
                className="bg-card-bg border border-border-color rounded-xl flex flex-col overflow-hidden relative group hover:-translate-y-1 hover:shadow-2xl hover:shadow-accent/20 transition-all"
                data-tier={item.tier}
              >
                <div className="p-3 bg-black/20 flex flex-col items-center justify-center border-b border-white/5 text-center min-h-[70px]">
                  <span className="font-bold text-white text-base leading-tight mb-1">{item.name}</span>
                  <RarityBadge tier={item.tier} />
                </div>
                <div className="h-[120px] bg-black/20 flex items-center justify-center border-b border-white/5 relative overflow-hidden shrink-0">
                  {visual}
                </div>
                <div className="p-4 grow flex flex-col justify-between min-h-[140px]">
                  <div>{stats}</div>
                  <div className="mt-4 pt-3 border-t border-border-color flex justify-between items-center">
                    {/* Preço agora em R$ */}
                    <div className="font-bold text-lg">
                      <span className="text-white">R$</span>{" "}
                      <span className="text-white font-mono">{item.price.toLocaleString("pt-BR")}</span>
                    </div>
                    <button
                      onClick={() => (isBox ? onOpenBox(item.tier, item.subtype as ItemType) : onBuy(item, filter))}
                      className={`px-4 py-2 rounded text-xs font-bold uppercase transition-all border ${isBox ? "bg-[#333] border-[#555] text-white hover:bg-tier-box hover:text-black hover:border-tier-box" : isSpecial ? "bg-transparent border-tier-special text-tier-special hover:bg-tier-special hover:text-white" : "bg-transparent border-[#555] text-white hover:bg-white hover:text-black"}`}
                    >
                      Comprar
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {filter !== "special" && (
          <div className="mt-10 p-5 bg-[#151621] border border-[#2d2f3d] rounded-xl">
            <div className="text-xs text-[#888] uppercase tracking-widest mb-4 flex items-center gap-2 font-bold">
              <i className="fa-solid fa-chart-pie"></i> Probabilidades de Drop (Box)
            </div>
            <div className="grid grid-cols-5 gap-3">
              {[
                { tier: "basic", pct: "60%", label: "Básico", color: "text-white" },
                { tier: "common", pct: "25%", label: "Comum", color: "text-tier-common" },
                { tier: "rare", pct: "10%", label: "Raro", color: "text-tier-rare" },
                { tier: "epic", pct: "4%", label: "Épico", color: "text-tier-epic" },
                { tier: "legendary", pct: "1%", label: "Lendário", color: "text-tier-legendary" },
              ].map((p, i) => (
                <div
                  key={i}
                  className="bg-[#0b0c15] border border-[#333] rounded-lg p-4 text-center relative overflow-hidden transition-transform hover:-translate-y-0.5"
                >
                  <div
                    className="absolute bottom-0 left-0 w-full h-[3px]"
                    style={{ backgroundColor: getTierColor(p.tier as Tier) }}
                  ></div>
                  <div
                    className={`text-xl font-bold font-mono mb-1 ${p.color}`}
                    style={p.tier !== "basic" ? { textShadow: `0 0 10px ${getTierColor(p.tier as Tier)}4D` } : {}}
                  >
                    {p.pct}
                  </div>
                  <div className="text-[11px] text-[#aaa] uppercase tracking-wide">{p.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  },
)

const InfraView = React.memo(
  ({
    inventory,
    onPayRent,
    onInstall,
    onUninstall,
    onToggleAutoPay,
    setActiveView,
    setShopFilter,
    onRepairMiner,
    onPayAllEnergy, // Adicionando prop para pagar todos
    onDemolishRoom, // Adicionando prop para demolir quarto
  }: {
    inventory: InventoryItem[]
    onPayRent: (uid: string) => void
    onInstall: (type: string, uid: string) => void
    onUninstall: (uid: string) => void
    onToggleAutoPay: (uid: string) => void
    setActiveView: (v: string) => void
    setShopFilter: (f: string) => void
    onRepairMiner: (uid: string) => void
    onPayAllEnergy: (rarity: Tier) => void // Tipo da nova prop
    onDemolishRoom: (uid: string) => void // Tipo da nova prop
  }) => {
    const [, setTick] = useState(0)
    const [selectedSector, setSelectedSector] = useState<Tier | null>(null)

    // Independent timer loop for smooth visual updates without re-rendering parent
    useEffect(() => {
      const timer = setInterval(() => setTick((t) => t + 1), 1000)
      return () => clearInterval(timer)
    }, [])

    const rooms = inventory.filter((i) => i.type === "room")

    // Group rooms by tier
    const roomsBySector = rooms.reduce(
      (acc, room) => {
        const dbRoom = ITEMS_DB.room.find((x) => x.id === room.id)
        if (dbRoom) {
          if (!acc[dbRoom.tier]) acc[dbRoom.tier] = []
          acc[dbRoom.tier].push(room)
        }
        return acc
      },
      {} as Record<Tier, InventoryItem[]>,
    )

    // Check if sector has rooms with low energy (< 1h)
    const hasLowEnergy = (tier: Tier) => {
      const sectorRooms = roomsBySector[tier] || []
      return sectorRooms.some((room) => {
        const timeLeft = (room.lastRentPaid || 0) + RENT_DURATION_MS - Date.now()
        return timeLeft < 3600000 && timeLeft > 0 // Less than 1 hour
      })
    }

    // Check if sector has broken miners
    const hasBrokenMiners = (tier: Tier) => {
      const sectorRooms = roomsBySector[tier] || []
      return sectorRooms.some((room) => {
        const shelves = inventory.filter((i) => i.parentId === room.uid)
        return shelves.some((shelf) => {
          const miners = inventory.filter((m) => m.parentId === shelf.uid)
          return miners.some((miner) => (miner.health ?? 100) <= 0)
        })
      })
    }

    const sectors: { tier: Tier; name: string; icon: string }[] = [
      { tier: "basic", name: "Setor Básico", icon: "fa-house" },
      { tier: "common", name: "Setor Comum", icon: "fa-building" },
      { tier: "rare", name: "Setor Raro", icon: "fa-industry" },
      { tier: "epic", name: "Setor Épico", icon: "fa-city" },
      { tier: "legendary", name: "Setor Lendário", icon: "fa-tower-broadcast" },
    ]

    // If a sector is selected, show detailed view
    if (selectedSector) {
      const sectorRooms = roomsBySector[selectedSector] || []
      const sectorInfo = sectors.find((s) => s.tier === selectedSector)

      const rentCosts: Record<Tier, number> = {
        basic: 0.6,
        common: 1.5,
        rare: 3.5,
        epic: 8.0,
        legendary: 20.0,
      }

      const costPerRoom = rentCosts[selectedSector]

      const roomsNeedingEnergy = sectorRooms.filter((room) => {
        const timeLeft = (room.lastRentPaid || 0) + RENT_DURATION_MS - Date.now()
        return timeLeft <= 0 || timeLeft < RENT_DURATION_MS
      })

      const totalEnergyCost = costPerRoom * roomsNeedingEnergy.length
      const canPayAll = roomsNeedingEnergy.length > 0

      return (
        <div className="p-8 animate-slide-in max-w-6xl mx-auto w-full pb-20">
          {/* Header with back button */}
          <div className="flex justify-between items-center mb-5">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSelectedSector(null)}
                className="bg-[#1f202e] border border-[#444] text-white px-4 py-2 rounded hover:bg-[#2a2d3a] transition-all flex items-center gap-2"
              >
                <i className="fa-solid fa-arrow-left"></i> Voltar
              </button>
              <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <i className={`fa-solid ${sectorInfo?.icon}`} style={{ color: getTierColor(selectedSector) }}></i>
                {sectorInfo?.name}
              </h2>
            </div>
            <div className="text-xs text-[#888]">{sectorRooms.length} Quartos Ativos</div>
          </div>

          {canPayAll && (
            <div className="mb-6 flex justify-center">
              <button
                onClick={() => onPayAllEnergy(selectedSector)}
                className="bg-gradient-to-r from-neon-yellow to-neon-orange text-black px-6 py-3 rounded-lg text-sm font-bold uppercase hover:shadow-[0_0_20px_rgba(255,193,7,0.5)] transition-all flex items-center gap-3 border-2 border-neon-yellow"
              >
                <i className="fa-solid fa-bolt text-lg"></i>
                PAGAR TODOS ({roomsNeedingEnergy.length} {roomsNeedingEnergy.length === 1 ? "Quarto" : "Quartos"})
                <span className="ml-2 bg-black/30 px-3 py-1 rounded">Ð {totalEnergyCost.toFixed(2)}</span>
              </button>
            </div>
          )}

          <div className="flex flex-col gap-6">
            {/* Rooms in this sector */}
            {sectorRooms.length === 0 ? (
              <div className="border-2 border-dashed border-[#444] rounded-lg min-w-[200px] h-[200px] flex flex-col items-center justify-center text-[#555]">
                <i className="fa-solid fa-building text-[40px] mb-2.5"></i>
                <div>Nenhum quarto neste setor</div>
              </div>
            ) : (
              sectorRooms.map((room) => {
                const dbRoom = ITEMS_DB.room.find((x) => x.id === room.id)
                if (!dbRoom) return null
                const shelves = inventory.filter((i) => i.parentId === room.uid)
                const isPowerOff = room.power === false

                let roomPower = 0,
                  roomDaily = 0,
                  roomWatts = 0
                shelves.forEach((shelf) => {
                  inventory
                    .filter((m) => m.parentId === shelf.uid)
                    .forEach((miner) => {
                      const dbMiner = ITEMS_DB.miner.find((x) => x.id === miner.id)
                      if (dbMiner && (miner.health ?? 100) > 0) {
                        roomPower += dbMiner.power || 0
                        roomDaily += dbMiner.daily || 0
                        roomWatts += Math.floor((dbMiner.power || 0) * 0.8)
                      }
                    })
                })

                const timeLeft = (room.lastRentPaid || 0) + RENT_DURATION_MS - Date.now()
                const percentage = Math.max(0, Math.min(100, (timeLeft / RENT_DURATION_MS) * 100))
                const hoursLeft = Math.floor(Math.max(0, timeLeft) / 3600000)
                const minsLeft = Math.floor((Math.max(0, timeLeft) % 3600000) / 60000)
                const barColor = percentage < 10 ? "#ff5252" : percentage < 30 ? "#ffea00" : "#00e676"
                const allowedAuto = ["rare", "epic", "legendary"].includes(dbRoom.tier)

                return (
                  <div
                    key={room.uid}
                    className={`bg-[#111] border border-[#333] rounded-xl overflow-hidden relative shadow-xl transition-all ${isPowerOff ? "border-[#333] grayscale brightness-[0.3]" : ""}`}
                  >
                    <div className="bg-[#151621]/95 backdrop-blur-md p-4 border-b border-white/10 grid grid-cols-[1fr_max-content] gap-5 items-center z-10 relative">
                      <div className="flex flex-col gap-2">
                        <div className="font-bold text-white text-base flex items-center gap-2.5 whitespace-nowrap">
                          <i className="fa-solid fa-server" style={{ color: getTierColor(dbRoom.tier) }}></i>
                          {dbRoom.name}
                          <RarityBadge tier={dbRoom.tier} />
                          {isPowerOff && <span className="text-neon-red text-xs ml-2">(SEM ENERGIA)</span>}
                        </div>
                        <div className="flex gap-2.5 items-center text-[11px] text-[#aaa] flex-wrap">
                          <div className="flex items-center gap-1.5 bg-black/40 px-2.5 py-1 rounded border border-white/5 whitespace-nowrap">
                            <i className="fa-solid fa-bolt text-[10px]"></i>{" "}
                            <span className="text-white font-bold">{roomPower.toFixed(0)} MH/s</span>
                          </div>
                          <div className="flex items-center gap-1.5 bg-black/40 px-2.5 py-1 rounded border border-white/5 whitespace-nowrap">
                            <i className="fa-solid fa-coins text-[10px]"></i>{" "}
                            <span className="text-dpix-color font-bold">{roomDaily.toFixed(2)} Ð/dia</span>
                          </div>
                          <div className="flex items-center gap-1.5 bg-black/40 px-2.5 py-1 rounded border border-white/5 whitespace-nowrap">
                            <i className="fa-solid fa-plug text-[10px]"></i>{" "}
                            <span className="text-neon-red font-bold">{roomWatts.toFixed(0)} W</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 w-full">
                        {timeLeft > 0 ? (
                          <>
                            <button
                              onClick={() => onPayRent(room.uid)}
                              className="bg-transparent border border-neon-orange text-neon-orange px-4 py-1.5 rounded text-[11px] font-bold uppercase hover:bg-neon-orange hover:text-black transition-all shadow-[0_0_10px_rgba(255,145,0,0.1)] flex items-center gap-2 whitespace-nowrap mb-1"
                            >
                              <i className="fa-solid fa-bolt"></i> Pagar Energia
                            </button>
                            <div className="flex items-center gap-2.5 w-full justify-end whitespace-nowrap">
                              <div className="flex items-center gap-2 text-[11px] text-[#aaa]">
                                <span className={!allowedAuto ? "text-[#555]" : ""}>Auto</span>
                                {allowedAuto ? (
                                  <div className="relative inline-block w-[30px] h-[16px]">
                                    <input
                                      type="checkbox"
                                      checked={!!room.autoPay}
                                      onChange={() => onToggleAutoPay(room.uid)}
                                      className="opacity-0 w-0 h-0 peer absolute z-20 cursor-pointer"
                                    />
                                    <span className="absolute cursor-pointer inset-0 bg-[#333] transition-all rounded-full border border-[#555] before:absolute before:content-[''] before:h-[10px] before:w-[10px] before:left-[2px] before:bottom-[2px] before:bg-white before:transition-all before:rounded-full peer-checked:bg-neon-green peer-checked:border-neon-green peer-checked:before:translate-x-[14px] peer-checked:before:bg-black"></span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1 text-[#555] text-[10px]">
                                    <i className="fa-solid fa-lock"></i> Requer Raro+
                                  </div>
                                )}
                              </div>
                              <div className="w-[120px] h-[6px] bg-[#222] rounded-full overflow-hidden relative">
                                <div
                                  className="h-full transition-all duration-300"
                                  style={{ width: `${percentage}%`, background: barColor }}
                                ></div>
                              </div>
                            </div>
                            <div className="text-[10px] text-[#666] mt-0.5 font-mono text-right w-full">
                              Expira em: {hoursLeft}h {String(minsLeft).padStart(2, "0")}min
                            </div>
                          </>
                        ) : (
                          <button
                            onClick={() => onPayRent(room.uid)}
                            className="bg-neon-red text-white border-none px-5 py-2 rounded text-[11px] font-bold cursor-pointer animate-pulse-red uppercase w-full whitespace-nowrap"
                          >
                            RESTAURAR ENERGIA
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Rodapé com botão de demolir */}
                    <div className="bg-[#0a0a0f] border-t border-[#222] px-4 py-3 flex justify-between items-center">
                      <div className="text-[10px] text-[#666] flex items-center gap-2">
                        <i className="fa-solid fa-layer-group"></i>
                        {shelves.length}/{dbRoom.slots || 1} Racks Instalados
                      </div>
                      <Tooltip
                        text={
                          shelves.length > 0 ? "Remova todas as prateleiras primeiro" : "Vender este quarto por Ð 8.00"
                        }
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onDemolishRoom(room.uid)
                          }}
                          disabled={shelves.length > 0}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded text-[10px] font-bold uppercase transition-all ${
                            shelves.length > 0
                              ? "bg-[#222] text-[#555] cursor-not-allowed border border-[#333]"
                              : "bg-red-900/30 text-red-400 border border-red-700/50 hover:bg-red-900/50 hover:text-red-300 hover:border-red-600"
                          }`}
                        >
                          <i className="fa-solid fa-house-circle-xmark text-xs"></i>
                          Demolir
                        </button>
                      </Tooltip>
                    </div>

                    <div
                      className={`p-5 flex gap-5 overflow-x-auto min-h-[280px] relative z-[1] items-end theme-${dbRoom.tier}`}
                    >
                      {/* Background Icon */}
                      <i
                        className={`fa-solid fa-house-laptop absolute right-5 bottom-2.5 text-[120px] opacity-5 text-white pointer-events-none z-0`}
                      ></i>

                      {/* Shelves */}
                      {[...Array(dbRoom.slots || 1)].map((_, i) => {
                        const shelf = shelves[i]
                        if (shelf) {
                          const dbShelf = ITEMS_DB.shelf.find((x) => x.id === shelf.id)
                          if (!dbShelf) return null
                          const minersInShelf = inventory.filter((m) => m.parentId === shelf.uid)
                          return (
                            <div
                              key={shelf.uid}
                              className="min-w-[240px] bg-[#1f202e] border border-[#444] rounded flex flex-col shadow-[5px_0_15px_rgba(0,0,0,0.5)] relative z-[2] shrink-0 mb-0 after:content-[''] after:absolute after:-bottom-[10px] after:left-[10px] after:right-[10px] after:h-[10px] after:bg-[#111] shelf-bottom"
                            >
                              <div
                                className="px-2.5 py-2 bg-[#2a2d3a] border-b border-[#444] text-[11px] text-[#aaa] font-bold flex justify-between items-center"
                                style={{ borderTop: `3px solid ${getTierColor(dbShelf.tier)}` }}
                              >
                                <span>{dbShelf.name}</span>
                                <Tooltip text="Remover este rack">
                                  <i
                                    onClick={() => onUninstall(shelf.uid)}
                                    className="fa-solid fa-trash text-neon-red cursor-pointer text-[10px] opacity-40 hover:opacity-100 hover:scale-110 transition-all"
                                  ></i>
                                </Tooltip>
                              </div>
                              <div className="p-2.5 flex flex-col gap-1.5 grow bg-[#1a1a20]">
                                {[...Array(dbShelf.slots || 1)].map((__, j) => {
                                  const miner = minersInShelf[j]
                                  if (miner) {
                                    const dbMiner = ITEMS_DB.miner.find((x) => x.id === miner.id)
                                    const styleClass = dbMiner?.skinStyle ? `style-${dbMiner.skinStyle}` : ""
                                    const tierColor = getTierColor(dbMiner?.tier || "basic")
                                    const health = miner.health ?? 100
                                    const isBroken = health <= 0

                                    const healthColor =
                                      health > 50 ? "bg-green-500" : health > 20 ? "bg-yellow-500" : "bg-red-600"

                                    const daysRemaining = Math.floor((health / 100) * 30)

                                    return (
                                      <div
                                        key={miner.uid}
                                        className={`h-[36px] border border-[#333] bg-gradient-to-r from-[#222] to-[#1a1a20] flex flex-col justify-between px-2 py-1 cursor-default shadow-inner rounded-sm relative ${styleClass} ${isBroken ? "grayscale brightness-50" : ""}`}
                                        style={{ borderLeft: `3px solid ${tierColor}` }}
                                      >
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-1.5">
                                            <div
                                              className="w-[16px] h-[16px] rounded-full bg-black border border-[#444] relative slot-fan-mini flex items-center justify-center"
                                              style={{ borderColor: tierColor }}
                                            >
                                              {!isPowerOff && !isBroken && (
                                                <div className="w-full h-full rounded-full fan-blades-gradient opacity-60 animate-spin-fast"></div>
                                              )}
                                            </div>
                                            <span
                                              className="font-bold text-[10px]"
                                              style={{ color: isBroken ? "#666" : tierColor }}
                                            >
                                              {dbMiner?.name}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <Tooltip
                                              text={
                                                isBroken
                                                  ? "Superaquecida! Precisa de manutenção."
                                                  : `Temperatura: ${health.toFixed(0)}% | ${daysRemaining} dias restantes`
                                              }
                                            >
                                              <div className="flex items-center gap-1">
                                                <i
                                                  className={`fa-solid fa-temperature-${isBroken ? "full" : health > 50 ? "low" : health > 20 ? "half" : "high"} text-[10px]`}
                                                  style={{
                                                    color: isBroken
                                                      ? "#ff5252"
                                                      : health > 50
                                                        ? "#00e676"
                                                        : health > 20
                                                          ? "#ffea00"
                                                          : "#ff5252",
                                                  }}
                                                ></i>
                                                <span
                                                  className="text-[9px] font-mono font-bold"
                                                  style={{
                                                    color: isBroken
                                                      ? "#ff5252"
                                                      : health > 50
                                                        ? "#00e676"
                                                        : health > 20
                                                          ? "#ffea00"
                                                          : "#ff5252",
                                                  }}
                                                >
                                                  {health.toFixed(0)}%
                                                </span>
                                              </div>
                                            </Tooltip>
                                            <Tooltip text="Remover mineradora">
                                              <i
                                                onClick={() => onUninstall(miner.uid)}
                                                className="fa-solid fa-trash text-neon-red cursor-pointer text-[10px] opacity-40 hover:opacity-100 hover:scale-110 transition-all"
                                              ></i>
                                            </Tooltip>
                                          </div>
                                        </div>

                                        <div className="w-full h-[3px] bg-black/50 rounded-full overflow-hidden mt-0.5">
                                          <div
                                            className={`h-full transition-all duration-300 ${healthColor}`}
                                            style={{ width: `${health}%` }}
                                          ></div>
                                        </div>

                                        {isBroken && (
                                          <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-10 rounded-sm">
                                            <button
                                              onClick={() => onRepairMiner(miner.uid)} // Usando a prop em vez da função direta
                                              className="bg-neon-orange text-black text-[9px] font-bold px-2 py-1 rounded uppercase hover:bg-orange-400 transition-all flex items-center gap-1"
                                            >
                                              <i className="fa-solid fa-wrench"></i> MANUTENÇÃO (Ð 50)
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    )
                                  } else {
                                    return (
                                      <Tooltip key={j} text="Clique para adicionar uma mineradora">
                                        <div
                                          onClick={() => onInstall("miner", shelf.uid)}
                                          className="h-[36px] border border-dashed border-[#333] rounded-sm flex items-center justify-center text-[10px] text-[#555] cursor-pointer hover:border-accent hover:text-accent hover:bg-accent/10 transition-all"
                                        >
                                          + GPU
                                        </div>
                                      </Tooltip>
                                    )
                                  }
                                })}
                              </div>
                            </div>
                          )
                        } else {
                          return (
                            <Tooltip key={i} text="Clique para adicionar um rack">
                              <div
                                onClick={() => onInstall("shelf", room.uid)}
                                className="border-2 border-dashed border-[#444] rounded-lg min-w-[200px] h-[200px] flex flex-col items-center justify-center text-[#555] cursor-pointer hover:border-accent hover:text-accent hover:bg-accent/5 shrink-0 transition-all"
                              >
                                + Rack
                              </div>
                            </Tooltip>
                          )
                        }
                      })}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )
    }

    // Overview: Show sector cards
    return (
      <div className="p-8 animate-slide-in max-w-6xl mx-auto w-full pb-20">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-2xl font-bold text-white">Gestão de Setores</h2>
          <div className="text-xs text-[#888]">Organize seus quartos por categoria</div>
        </div>

        {rooms.length === 0 ? (
          <div
            onClick={() => {
              setShopFilter("room")
              setActiveView("shop")
            }}
            className="border-2 border-dashed border-[#444] rounded-lg min-w-[200px] h-[200px] flex flex-col items-center justify-center text-[#555] cursor-pointer hover:border-accent hover:text-accent hover:bg-accent/5 transition-all"
          >
            <i className="fa-solid fa-plus text-[40px] mb-2.5"></i>
            <div>Sem Quartos. Compre no Mercado.</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sectors.map((sector) => {
              const count = roomsBySector[sector.tier]?.length || 0
              const isInactive = count === 0
              const lowEnergy = hasLowEnergy(sector.tier)
              const brokenMiners = hasBrokenMiners(sector.tier)

              return (
                <div
                  key={sector.tier}
                  onClick={() => !isInactive && setSelectedSector(sector.tier)}
                  className={`relative bg-gradient-to-br from-[#1f202e] to-[#151621] border-2 rounded-xl p-6 transition-all duration-300 ${
                    isInactive
                      ? "border-[#333] opacity-40 cursor-not-allowed"
                      : "border-[#444] hover:border-current hover:shadow-2xl cursor-pointer hover:scale-105"
                  }`}
                  style={{
                    borderColor: isInactive ? "#333" : getTierColor(sector.tier),
                    boxShadow: isInactive ? "none" : `0 0 30px ${getTierColor(sector.tier)}20`,
                  }}
                >
                  {/* Alert indicators */}
                  {!isInactive && (lowEnergy || brokenMiners) && (
                    <div className="absolute top-2 right-2 flex gap-1">
                      {lowEnergy && (
                        <Tooltip text="Energia baixa em alguns quartos!">
                          <div className="w-3 h-3 bg-neon-red rounded-full animate-pulse-red"></div>
                        </Tooltip>
                      )}
                      {brokenMiners && (
                        <Tooltip text="Mineradoras quebradas neste setor!">
                          <div className="w-3 h-3 bg-neon-orange rounded-full animate-pulse"></div>
                        </Tooltip>
                      )}
                    </div>
                  )}

                  {/* Icon */}
                  <div className="flex items-center justify-center mb-4">
                    <div
                      className="w-20 h-20 rounded-full flex items-center justify-center"
                      style={{
                        background: isInactive
                          ? "#222"
                          : `linear-gradient(135deg, ${getTierColor(sector.tier)}20, ${getTierColor(sector.tier)}05)`,
                        border: `3px solid ${isInactive ? "#333" : getTierColor(sector.tier)}`,
                      }}
                    >
                      <i
                        className={`fa-solid ${sector.icon} text-4xl`}
                        style={{ color: isInactive ? "#555" : getTierColor(sector.tier) }}
                      ></i>
                    </div>
                  </div>

                  {/* Title */}
                  <h3
                    className="text-xl font-bold text-center mb-2"
                    style={{ color: isInactive ? "#555" : getTierColor(sector.tier) }}
                  >
                    {sector.name}
                  </h3>

                  {/* Counter */}
                  <div className="text-center mb-4">
                    {isInactive ? (
                      <div className="text-sm text-[#555]">Bloqueado</div>
                    ) : (
                      <div className="text-2xl font-bold" style={{ color: getTierColor(sector.tier) }}>
                        {count} {count === 1 ? "Quarto" : "Quartos"}
                      </div>
                    )}
                  </div>

                  {/* Action hint */}
                  {!isInactive && (
                    <div className="text-center text-xs text-[#888] flex items-center justify-center gap-2">
                      Clique para gerenciar <i className="fa-solid fa-arrow-right"></i>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  },
)

// --- BOX OPENING ANIMATION COMPONENT ---
const BoxOpeningModal = React.memo(
  ({ wonItem, tier, onClose }: { wonItem: DBItem; tier: Tier; onClose: () => void }) => {
    const [stage, setStage] = useState<"intro" | "shaking" | "violent" | "opening" | "reveal">("intro")
    const [flash, setFlash] = useState(false)

    useEffect(() => {
      const s1 = setTimeout(() => setStage("shaking"), 600)
      const s2 = setTimeout(() => setStage("violent"), 1600)
      const s3 = setTimeout(() => setStage("opening"), 2400) // New stage: rapid expansion
      const s4 = setTimeout(() => setFlash(true), 2600) // Flash starts
      const s5 = setTimeout(() => {
        setStage("reveal")
      }, 2700) // Content switch

      return () => {
        clearTimeout(s1)
        clearTimeout(s2)
        clearTimeout(s3)
        clearTimeout(s4)
        clearTimeout(s5)
      }
    }, [])

    return (
      <div className="fixed inset-0 bg-black/95 z-[3000] flex flex-col items-center justify-center">
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
          {/* Flash Overlay */}
          <div
            className={`fixed inset-0 bg-white z-[3001] pointer-events-none transition-opacity duration-[1500ms] ease-out ${flash ? "opacity-0" : "opacity-0 hidden"}`}
            style={flash ? { animation: "flashBang 0.8s forwards" } : {}}
          ></div>

          {/* STAGE 1-3: THE BOX */}
          {stage !== "reveal" && (
            <div className="relative flex items-center justify-center">
              {/* Glow behind box */}
              <div
                className={`absolute w-[200px] h-[200px] rounded-full bg-tier-box blur-[80px] transition-all duration-500
                            ${stage === "intro" ? "opacity-20 scale-75" : ""}
                            ${stage === "shaking" ? "opacity-40 scale-100" : ""}
                            ${stage === "violent" ? "opacity-80 scale-150 animate-pulse" : ""}
                            ${stage === "opening" ? "opacity-100 scale-[5] duration-200" : ""}
                        `}
              ></div>

              <div
                className={`text-[120px] text-tier-box drop-shadow-[0_0_50px_rgba(255,179,0,0.6)] transition-all duration-300 z-10
                            ${stage === "intro" ? "animate-float" : ""}
                            ${stage === "shaking" ? "animate-shake" : ""}
                            ${stage === "violent" ? "animate-violent-shake" : ""}
                            ${stage === "opening" ? "scale-[3] opacity-0 duration-300 rotate-12" : ""}
                        `}
              >
                <i className="fa-solid fa-cube"></i>
              </div>
            </div>
          )}

          {/* STAGE 4: THE REVEAL */}
          {stage === "reveal" && (
            <div className="relative z-[3002] animate-card-pop">
              {/* Rotating Rays */}
              <div
                className="absolute top-1/2 left-1/2 w-[1000px] h-[1000px] -translate-x-1/2 -translate-y-1/2 opacity-30 rounded-full blur-3xl z-[-1] animate-rays-spin"
                style={{
                  background: `conic-gradient(from 0deg, transparent 0%, ${getTierColor(tier)} 10%, transparent 20%, ${getTierColor(tier)} 30%, transparent 40%, ${getTierColor(tier)} 50%, transparent 60%, ${getTierColor(tier)} 70%, transparent 80%, ${getTierColor(tier)} 90%, transparent 100%)`,
                }}
              ></div>

              {/* Card */}
              <div className="flex flex-col w-[300px] bg-gradient-to-br from-[#1a1a20] to-[#0d0e15] border border-[#333] rounded-2xl p-[2px] shadow-[0_0_50px_rgba(0,0,0,0.8)] relative overflow-hidden">
                <div className="h-[6px] w-full rounded-t-xl" style={{ background: getTierColor(tier) }}></div>
                <div className="p-8 flex flex-col items-center text-center relative bg-black/20 backdrop-blur-sm">
                  {/* Inner Glow */}
                  <div
                    className="absolute top-[50px] left-1/2 -translate-x-1/2 w-[150px] h-[150px] blur-xl pointer-events-none opacity-60"
                    style={{ background: `radial-gradient(circle, ${getTierColor(tier)} 0%, transparent 70%)` }}
                  ></div>

                  <i
                    className={`fa-solid ${wonItem.type === "miner" ? "fa-microchip" : wonItem.type === "shelf" ? "fa-layer-group" : "fa-server"} text-[80px] mb-6 relative z-[2] drop-shadow-2xl`}
                    style={{ color: getTierColor(tier) }}
                  ></i>

                  <div className="text-xl font-extrabold text-white uppercase tracking-widest mb-2 relative z-[2] leading-tight">
                    {wonItem.name}
                  </div>
                  <div className="text-[10px] text-[#888] mb-6 relative z-[2]">
                    {wonItem.desc || getTierLabel(tier)}
                  </div>

                  <div
                    className="text-[11px] font-mono bg-black/60 text-white px-4 py-1.5 rounded-xl border border-[#555] mb-8 uppercase font-bold shadow-md relative z-[2]"
                    style={{ color: getTierColor(tier), borderColor: getTierColor(tier) }}
                  >
                    {tier}
                  </div>

                  <button
                    onClick={onClose}
                    className="bg-white text-black border-none py-3.5 w-full rounded-lg font-bold text-sm cursor-pointer shadow-lg uppercase relative z-[3] hover:-translate-y-1 hover:shadow-xl transition-all hover:bg-gray-100 active:scale-95"
                  >
                    COLETAR
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  },
)

// --- BANK MODAL COMPONENT ---
const BankModal = React.memo(
  ({
    type,
    balance,
    createdAt,
    onClose,
    onConfirm,
  }: {
    type: "deposit" | "withdraw"
    balance: number
    createdAt: number
    onClose: () => void
    onConfirm: (amount: number) => void
  }) => {
    const [val, setVal] = useState("")
    const amount = Number.parseFloat(val) || 0

    const feeInfo = getWithdrawFee(createdAt)
    const fee = type === "withdraw" ? amount * feeInfo.rate : 0
    const netAmount = Math.max(0, amount - fee)

    const handleConfirm = () => {
      if (amount <= 0) return
      onConfirm(amount)
    }

    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[2000] flex items-center justify-center">
        <div className="bg-card-bg border border-border-color p-6 rounded-xl w-[90%] max-w-[400px] shadow-2xl relative">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <i
              className={`fa-solid ${type === "deposit" ? "fa-arrow-up-from-bracket" : "fa-money-bill-wave"} ${type === "deposit" ? "text-neon-green" : "text-neon-red"}`}
            ></i>
            {type === "deposit" ? "Depositar (Compra DPIX)" : "Sacar BRL"}
          </h3>

          <div className="mb-4">
            <label className="text-xs text-[#888] uppercase block mb-1">
              Valor {type === "deposit" ? "do Pagamento" : "do Saque"}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-[#666] font-bold text-sm">R$</span>
              <input
                type="number"
                value={val}
                onChange={(e) => setVal(e.target.value)}
                step="0.01"
                min="0"
                className="w-full bg-[#111] border border-[#333] rounded-lg py-2 pl-10 pr-3 text-white font-bold font-mono focus:border-accent outline-none transition-colors text-base"
                placeholder="0.00"
                autoFocus
              />
            </div>
            <div className="text-[11px] text-[#666] mt-1.5 text-right">
              Saldo Disponível: <span className="text-white font-bold">{formatBRL(balance)}</span>
            </div>
          </div>

          {type === "withdraw" && amount > 0 && (
            <div className="bg-[#151621] border border-[#333] rounded-lg p-3 mb-4 text-sm">
              <div className="flex justify-between mb-1 text-[11px] text-[#aaa]">
                <span>Taxa de Fidelidade ({feeInfo.label})</span>
                <span className="text-neon-red font-mono">{formatBRL(fee)}</span>
              </div>
              <div className="flex justify-between font-bold pt-2 border-t border-[#333]">
                <span className="text-white">Total a Receber</span>
                <span className="text-neon-green font-mono text-lg">{formatBRL(netAmount)}</span>
              </div>
            </div>
          )}

          {type === "deposit" && amount > 0 && (
            <>
              <div className="bg-[#151621] border border-[#333] rounded-lg p-3 mb-4 text-sm">
                <div className="flex justify-between font-bold items-center">
                  <span className="text-white text-xs">Receber em DPIX</span>
                  <span className="text-dpix-color text-xl font-mono">{amount.toFixed(2)} Ð</span>
                </div>
                <div className="text-[10px] text-[#666] text-right mt-1.5">
                  Taxa de Câmbio: <span className="text-white font-bold">1 BRL = 1 DPIX</span>
                </div>
              </div>
              <div className="bg-blue-500/10 border border-blue-500/30 p-3 rounded-lg mb-4 flex gap-3 items-start">
                <i className="fa-solid fa-circle-info text-blue-400 mt-0.5 text-sm"></i>
                <div className="text-[11px] text-blue-200 leading-relaxed">
                  Depósitos em dinheiro são <strong className="text-blue-100">convertidos instantaneamente</strong> para
                  DPIX (moeda do jogo) para uso no Mercado.
                </div>
              </div>
            </>
          )}

          {type === "withdraw" && amount > balance && (
            <div className="text-neon-red text-xs mb-4 text-center font-bold">Saldo Insuficiente</div>
          )}

          <div className="flex justify-end gap-2.5">
            <button
              onClick={onClose}
              className="bg-transparent border border-[#555] text-[#aaa] px-4 py-2 rounded-lg text-xs font-bold hover:bg-white hover:text-black transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={amount <= 0 || (type === "withdraw" && amount > balance)}
              className={`border-none px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${type === "deposit" ? "bg-neon-green text-black hover:bg-green-400" : "bg-neon-red text-white hover:bg-red-600"} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              Confirmar
            </button>
          </div>
        </div>
      </div>
    )
  },
)

// --- MAIN COMPONENT ---
const App: React.FC = () => {
  const [state, setState] = useState<GameState>(() => {
    const saved = localStorage.getItem("cryptoProV6_infra")
    const defaultState: GameState = {
      wallet: 1000000.0,
      dpix: 0.0,
      miningPool: 0.0,
      inventory: [],
      logs: [],
      username: "CEO",
      createdAt: Date.now(),
      referral: {
        code: "USER-" + Math.floor(Math.random() * 90000 + 10000),
        users: { lvl1: 0, lvl2: 0, lvl3: 0 },
        balance: 0.0,
        totalEarned: 0.0,
      },
    }
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (parsed.inventory) {
          parsed.inventory = parsed.inventory.map((item: InventoryItem) => {
            if (item.type === "miner" && item.health === undefined) {
              return { ...item, health: 100, lastHealthUpdate: Date.now() }
            }
            return item
          })
        }
        return { ...defaultState, ...parsed }
      } catch (e) {
        return defaultState
      }
    }
    return defaultState
  })

  const [activeView, setActiveView] = useState("dashboard")
  const [dashTab, setDashTab] = useState("overview")
  const [shopFilter, setShopFilter] = useState("miner")
  const [invFilter, setInvFilter] = useState("all")
  const [toasts, setToasts] = useState<ToastMsg[]>([])
  const [terminalLogs, setTerminalLogs] = useState<string[]>([])

  // Modals State
  const [buyModal, setBuyModal] = useState<{ item: DBItem; type: string } | null>(null)
  const [payModal, setPayModal] = useState<{ roomUid: string } | null>(null)
  const [payAllModal, setPayAllModal] = useState<{ rarity: Tier; count: number; total: number } | null>(null)
  const [installModal, setInstallModal] = useState<{ typeNeeded: string; parentUid: string } | null>(null)
  const [boxAnim, setBoxAnim] = useState<{ wonItem: DBItem; tier: Tier } | null>(null)
  const [bankModal, setBankModal] = useState<{ type: "deposit" | "withdraw" } | null>(null)

  // Notification for demolishRoom
  const [notification, setNotification] = useState<{ message: string; color: "red" | "green" | "blue" } | null>(null)

  const [demolishModal, setDemolishModal] = useState<{
    roomUid: string
    roomName: string
    show: boolean
  } | null>(null)

  const notify = useCallback((msg: string, type: "success" | "error" | "info") => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, msg, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000)
  }, [])

  const addLog = useCallback((desc: string, amount: number | string, type: "in" | "out" | "coin") => {
    setState((prev) => ({
      ...prev,
      logs: [...prev.logs, { id: Date.now(), date: new Date().toLocaleString("pt-BR"), desc, amount, type }],
    }))
  }, [])

  const getScrapValue = useCallback((itemType: string): number => {
    switch (itemType) {
      case "miner":
        return 20
      case "room":
        return 8
      case "shelf":
        return 4
      default:
        return 0
    }
  }, [])

  // Function to demolish a room
  const demolishRoom = useCallback(
    (roomUid: string) => {
      const room = state.inventory.find((i) => i.uid === roomUid && i.type === "room") // Changed category to type for consistency
      if (!room) return

      const shelves = state.inventory.filter((i) => i.parentId === roomUid)

      // Validation: cannot demolish if there are shelves
      if (shelves.length > 0) {
        setNotification({
          message: "Remova todas as prateleiras antes de demolir o quarto.",
          color: "red",
        })
        return
      }

      const roomData = ITEMS_DB.room.find((r) => r.id === room.id)
      const roomName = roomData?.name || "Quarto"

      // Open confirmation modal
      setDemolishModal({
        roomUid,
        roomName,
        show: true,
      })
    },
    [state.inventory, setState, setNotification], // Added dependencies
  )

  const confirmDemolish = useCallback(() => {
    if (!demolishModal) return

    // Remove the room from inventory
    setState((prev) => ({
      ...prev,
      inventory: prev.inventory.filter((i) => i.uid !== demolishModal.roomUid),
      dpix: prev.dpix + 8.0,
    }))

    setNotification({
      message: `${demolishModal.roomName} demolido! +Ð 8.00`,
      color: "green",
    })

    setDemolishModal(null)
  }, [demolishModal, setState, setNotification])

  const recycleItem = useCallback(
    (uid: string) => {
      const item = state.inventory.find((i) => i.uid === uid)
      if (!item) return

      if (item.parentId) {
        notify("Remova o item antes de reciclar.", "error")
        return
      }

      const dbItem = ITEMS_DB[item.type]?.find((x) => x.id === item.id)
      if (!dbItem) return

      const scrapValue = getScrapValue(item.type)

      const confirmed = window.confirm(
        `Tem certeza? Você vai vender "${dbItem.name}" como sucata por Ð ${scrapValue.toFixed(2)}.\n\nEsta ação não pode ser desfeita.`,
      )

      if (!confirmed) return

      setState((prev) => ({
        ...prev,
        inventory: prev.inventory.filter((i) => i.uid !== uid),
        dpix: prev.dpix + scrapValue,
      }))

      notify(`Item reciclado! +Ð ${scrapValue.toFixed(2)} adicionados.`, "success")
    },
    [state.inventory, notify, getScrapValue],
  )

  const handleLogout = useCallback(() => {
    if (window.confirm("Tem certeza que deseja sair?")) {
      window.location.reload()
    }
  }, [])

  // --- INITIALIZATION ---
  useEffect(() => {
    let modified = false
    const newState = { ...state }

    if (newState.wallet < 1000000) {
      newState.wallet = 1000000.0
      modified = true
    }
    if (newState.dpix < 1000000) {
      newState.dpix = 1000000.0
      modified = true
      notify("Modo Milionário DPIX Ativado! +1M Ð", "success")
    }

    if (newState.inventory.length === 0) {
      const roomUid = "uid_" + Date.now() + "_starter_room"
      const shelfUid = "uid_" + Date.now() + "_starter_shelf"
      newState.inventory.push({
        uid: roomUid,
        id: "room_basic",
        type: "room",
        parentId: null,
        boughtAt: Date.now(),
        lastRentPaid: Date.now(),
        power: true,
        autoPay: false,
      })
      newState.inventory.push({
        uid: shelfUid,
        id: "shelf_basic",
        type: "shelf",
        parentId: roomUid,
        boughtAt: Date.now(),
      })
      newState.logs.push({
        id: Date.now(),
        date: new Date().toLocaleString("pt-BR"),
        desc: "Starter Kit: Recebido Quarto + Rack Grátis",
        amount: 0,
        type: "in",
      })
      modified = true
    }

    if (modified) setState(newState)
    // eslint-disable-next-line
  }, [])

  useEffect(() => {
    const healthDecayInterval = setInterval(() => {
      setState((prev) => {
        const now = Date.now()
        const updatedInventory = prev.inventory.map((item) => {
          // Apenas mineradoras instaladas em quartos com energia sofrem decaimento
          if (item.type === "miner" && item.parentId) {
            const shelf = prev.inventory.find((i) => i.uid === item.parentId)
            if (shelf && shelf.parentId) {
              const room = prev.inventory.find((r) => r.uid === shelf.parentId)
              if (room && room.power !== false) {
                // Mineradora está instalada e o quarto tem energia
                const currentHealth = item.health ?? 100
                const lastUpdate = item.lastHealthUpdate || now
                const timePassed = now - lastUpdate

                // Decai 3.33 pontos a cada 24h = 0.00003858 pontos por segundo
                const decayRate = 3.33 / (24 * 60 * 60) // pontos por segundo
                const decayAmount = (timePassed / 1000) * decayRate

                const newHealth = Math.max(0, currentHealth - decayAmount)

                if (currentHealth > 0 && newHealth <= 0) {
                  const dbRoom = ITEMS_DB.room.find((x) => x.id === room.id)
                  const dbMiner = ITEMS_DB.miner.find((x) => x.id === item.id)
                  setTimeout(() => {
                    notify(
                      `⚠️ Alerta: ${dbMiner?.name || "Uma mineradora"} parou de funcionar no ${dbRoom?.name || "quarto"}!`,
                      "error",
                    )
                  }, 100)
                }

                return {
                  ...item,
                  health: newHealth,
                  lastHealthUpdate: now,
                }
              }
            }
          }

          // Inicializa health se não existir (para itens antigos)
          if (item.type === "miner" && item.health === undefined) {
            return {
              ...item,
              health: 100,
              lastHealthUpdate: now,
            }
          }

          return item
        })

        return { ...prev, inventory: updatedInventory }
      })
    }, 5000) // Atualiza a cada 5 segundos

    return () => clearInterval(healthDecayInterval)
  }, [])

  // Rent Check Loop (Lower Frequency)
  useEffect(() => {
    const rentInterval = setInterval(() => {
      setState((prev) => {
        const now = Date.now()
        let updatedInv = [...prev.inventory]
        let updatedWallet = prev.wallet
        const logsToAdd: any[] = []
        let changed = false

        updatedInv = updatedInv.map((item) => {
          if (item.type !== "room") return item

          if (!item.lastRentPaid) {
            return { ...item, lastRentPaid: now, power: true }
          }

          const timeLeft = item.lastRentPaid + RENT_DURATION_MS - now

          if (timeLeft <= 0) {
            const dbRoom = ITEMS_DB.room.find((r) => r.id === item.id)
            if (!dbRoom || !dbRoom.rent) return item

            const allowedAuto = ["rare", "epic", "legendary"].includes(dbRoom.tier)

            if (allowedAuto && item.autoPay && updatedWallet >= dbRoom.rent) {
              updatedWallet -= dbRoom.rent
              logsToAdd.push({
                id: Date.now() + Math.random(),
                date: new Date().toLocaleString("pt-BR"),
                desc: `Auto-Aluguel: ${dbRoom.name}`,
                amount: -dbRoom.rent,
                type: "out",
              })
              changed = true
              return { ...item, lastRentPaid: now, power: true }
            } else {
              if (item.power !== false) {
                changed = true
                return { ...item, power: false, autoPay: allowedAuto && item.autoPay ? false : item.autoPay }
              }
            }
          }
          return item
        })

        if (changed) {
          return { ...prev, wallet: updatedWallet, inventory: updatedInv, logs: [...prev.logs, ...logsToAdd] }
        }
        return prev
      })
    }, 1000)
    return () => clearInterval(rentInterval)
  }, [])

  // Auto Save
  useEffect(() => {
    const saveInterval = setInterval(() => {
      localStorage.setItem("cryptoProV6_infra", JSON.stringify(state))
    }, 10000)
    return () => clearInterval(saveInterval)
  }, [state])

  // Terminal Effect
  useEffect(() => {
    const termInterval = setInterval(() => {
      const daily = getActiveDailyProduction(state.inventory)
      let msg = ""
      if (daily > 0) {
        const events = [
          `<span class="text-neon-blue">[NET]</span> Novo bloco encontrado na rede DPIX`,
          `<span class="text-dpix-color">[GPU]</span> Share aceito (Dif: ${(daily * 10).toFixed(0)}k) - ${Math.floor(Math.random() * 40) + 10}ms`,
          `<span class="text-neon-green">[SYS]</span> Eficiência térmica: 98%`,
          `<span class="text-neon-yellow">[WRK]</span> Processando hash: 0x${Math.random().toString(16).substr(2, 8)}...`,
        ]
        msg = events[Math.floor(Math.random() * events.length)]
      } else {
        const hasInventory = state.inventory.some((i) => i.type === "miner" && i.parentId === null)
        if (hasInventory) {
          msg = `<span class="text-neon-yellow">[TIP]</span> Hardware detectado no inventário. Instale em um Quarto para iniciar.`
        } else {
          const idleEvents = [
            `<span class="text-neon-red">[ERR]</span> Nenhuma mineradora ativa. Sistema em repouso.`,
            `<span class="text-neon-blue">[SYS]</span> Aguardando configuração de infraestrutura...`,
            `<span class="text-neon-blue">[NET]</span> Desconectado da Pool.`,
          ]
          msg = idleEvents[Math.floor(Math.random() * idleEvents.length)]
        }
      }
      setTerminalLogs((prev) => [...prev.slice(-7), msg])
    }, 2500)
    return () => clearInterval(termInterval)
  }, [state.inventory]) // Add dependency to avoid stale closure if inventory changes rarely

  // --- ACTIONS ---
  const handleCollect = useCallback(() => {
    if (state.miningPool >= 10) {
      setState((prev) => ({
        ...prev,
        dpix: prev.dpix + state.miningPool,
        miningPool: 0,
      }))
      addLog("Saque Pool", state.miningPool.toFixed(2) + " DPIX", "coin")
      notify("DPIX coletado!", "success")
    }
  }, [state.miningPool, addLog, notify, setState])

  const handleBuy = useCallback((item: DBItem, type: string) => {
    setBuyModal({ item, type })
  }, [])

  const processBoxOpening = useCallback(
    (boxItem: DBItem, boxType: string) => {
      const roll = Math.random() * 100
      let tier: Tier = "basic"
      if (roll > 99) tier = "legendary"
      else if (roll > 95) tier = "epic"
      else if (roll > 85) tier = "rare"
      else if (roll > 60) tier = "common"

      // Filter ITEMS_DB based on the type of items the box can contain (e.g., "miner", "shelf")
      const possibleItems = ITEMS_DB[boxType as keyof typeof ITEMS_DB].filter(
        (i) => i.tier === tier && i.type !== "box" && !i.isSpecial,
      )
      const wonItem = possibleItems[Math.floor(Math.random() * possibleItems.length)]

      if (wonItem) {
        const newItem: InventoryItem = {
          uid: "uid_" + Date.now() + Math.random().toString(36).substr(2, 9),
          id: wonItem.id,
          type: boxType as any, // The type of the item won (e.g., 'miner', 'shelf')
          parentId: null,
          boughtAt: Date.now(),
          lastRentPaid: boxType === "room" ? Date.now() : undefined,
          power: boxType === "room" ? true : undefined,
          autoPay: boxType === "room" ? false : undefined,
          health: boxType === "miner" ? 100 : undefined,
        }
        setState((prev) => ({ ...prev, inventory: [...prev.inventory, newItem] }))
        setBoxAnim({ wonItem, tier })
      } else {
        notify("Erro ao abrir box.", "error")
      }
    },
    [notify, setState],
  )

  const onBuy = useCallback(
    (item: DBItem, type: string) => {
      const cost = item.price
      const isBox = item.tier === "box" // Check tier for box

      if (state.dpix < cost) {
        notify("Saldo insuficiente em DPIX", "error")
        return
      }

      setState((prev) => ({ ...prev, dpix: prev.dpix - cost }))
      addLog(`Compra: ${item.name}`, -cost, "coin")

      if (isBox) {
        processBoxOpening(item, type) // Pass the type of the item, e.g., "miner", "shelf" for box contents
      } else {
        const newItem: InventoryItem = {
          uid: "uid_" + Date.now() + Math.random().toString(36).substr(2, 9),
          id: item.id,
          type: type === "special" ? "miner" : (type as any),
          parentId: null,
          boughtAt: Date.now(),
          lastRentPaid: type === "room" ? Date.now() : undefined,
          power: type === "room" ? true : undefined,
          autoPay: type === "room" ? false : undefined,
          health: type === "miner" || type === "special" ? 100 : undefined,
        }
        setState((prev) => ({ ...prev, inventory: [...prev.inventory, newItem] }))
        notify(`${item.name} adquirido!`, "success")
      }
    },
    [state.dpix, addLog, notify, processBoxOpening],
  )

  const handleInstall = useCallback(
    (itemUid: string) => {
      if (!installModal) return

      // Verificar se é mineradora quebrada
      const item = state.inventory.find((i) => i.uid === itemUid)
      if (item?.type === "miner") {
        const health = item.health ?? 100
        if (health <= 0) {
          notify("Esta mineradora está superaquecida e precisa de manutenção antes de ser instalada!", "error")
          return
        }
      }

      setState((prev) => ({
        ...prev,
        inventory: prev.inventory.map((i) => (i.uid === itemUid ? { ...i, parentId: installModal.parentUid } : i)),
      }))
      notify("Item instalado!", "success")
      setInstallModal(null)
    },
    [installModal, notify, setState, state.inventory],
  )

  const handleUninstall = useCallback(
    (itemUid: string) => {
      setState((prev) => {
        const item = prev.inventory.find((i) => i.uid === itemUid)
        if (!item) return prev
        if (item.type === "shelf") {
          const children = prev.inventory.filter((i) => i.parentId === itemUid)
          if (children.length > 0) {
            notify("Esvazie a prateleira antes!", "error")
            return prev
          }
        }
        return {
          ...prev,
          inventory: prev.inventory.map((i) => (i.uid === itemUid ? { ...i, parentId: null } : i)),
        }
      })
    },
    [notify, setState],
  )

  const handlePayRent = useCallback((uid: string) => {
    setPayModal({ roomUid: uid })
  }, [])

  const processPayRent = useCallback(() => {
    if (!payModal) return
    const room = state.inventory.find((r) => r.uid === payModal.roomUid)
    if (!room) return
    const dbRoom = ITEMS_DB.room.find((r) => r.id === room.id)
    if (dbRoom && dbRoom.rent) {
      if (state.dpix >= dbRoom.rent) {
        setState((prev) => ({
          ...prev,
          dpix: prev.dpix - (dbRoom.rent || 0),
          inventory: prev.inventory.map((i) =>
            i.uid === payModal.roomUid ? { ...i, lastRentPaid: Date.now(), power: true } : i,
          ),
        }))
        addLog(`Aluguel: ${dbRoom.name}`, -dbRoom.rent, "out")
        notify("Conta paga!", "success")
      } else {
        notify("Saldo insuficiente em DPIX", "error")
      }
    }
    setPayModal(null)
  }, [state.inventory, state.dpix, payModal, addLog, notify, setState])

  const toggleAutoPay = useCallback(
    (roomUid: string) => {
      setState((prev) => {
        const room = prev.inventory.find((r) => r.uid === roomUid)
        if (!room) return prev
        notify(`Pagamento Automático ${!room.autoPay ? "ATIVADO" : "DESATIVADO"}`, !room.autoPay ? "success" : "info")
        return {
          ...prev,
          inventory: prev.inventory.map((i) => (i.uid === roomUid ? { ...i, autoPay: !i.autoPay } : i)),
        }
      })
    },
    [notify, setState],
  )

  const openInstallModal = useCallback((type: string, uid: string) => {
    setInstallModal({ typeNeeded: type, parentUid: uid })
  }, [])

  const handleBankAction = useCallback(
    (amount: number) => {
      if (!bankModal) return
      if (bankModal.type === "deposit") {
        // Credit DPIX directly (1:1 ratio for simplicity in this game logic)
        setState((prev) => ({ ...prev, dpix: prev.dpix + amount }))
        addLog("Depósito (BRL -> DPIX)", amount, "coin")
        notify(`Depósito de ${formatBRL(amount)} convertido para ${amount} DPIX!`, "success")
      } else {
        const feeInfo = getWithdrawFee(state.createdAt)
        // Withdraw Logic: Deduct Gross from BRL Wallet
        if (amount > state.wallet) {
          notify("Saldo insuficiente", "error")
          return
        }
        setState((prev) => ({ ...prev, wallet: prev.wallet - amount }))
        addLog("Saque Bancário", -amount, "out")
        notify(`Saque processado!`, "success")
      }
      setBankModal(null)
    },
    [bankModal, state.createdAt, state.wallet, addLog, notify, setState],
  )

  const repairMiner = useCallback(
    (minerUid: string) => {
      const repairCost = 50

      if (state.dpix < repairCost) {
        notify(`Você precisa de ${repairCost} DPIX para reparar!`, "error")
        return
      }

      setState((prev) => ({
        ...prev,
        dpix: prev.dpix - repairCost,
        inventory: prev.inventory.map((item) =>
          item.uid === minerUid ? { ...item, health: 100, lastHealthUpdate: Date.now() } : item,
        ),
        logs: [
          {
            id: Date.now(),
            date: new Date().toLocaleString("pt-BR"),
            desc: "Reparo de Mineradora",
            amount: -repairCost,
            type: "coin",
          },
          ...prev.logs,
        ],
      }))

      notify("Mineradora reparada com sucesso!", "success")
    },
    [state.dpix, notify, setState],
  )

  const getMinersThatNeedRepair = useCallback(() => {
    return state.inventory.filter((item) => {
      if (item.type !== "miner" || !item.parentId) return false
      const health = item.health ?? 100
      return health <= 20 // Alerta quando health < 20%
    }).length
  }, [state.inventory])

  const payAllEnergy = useCallback(
    (rarity: Tier) => {
      const rentCosts: Record<Tier, number> = {
        basic: 0.6,
        common: 1.5,
        rare: 3.5,
        epic: 8.0,
        legendary: 20.0,
      }

      const cost = rentCosts[rarity]

      // Filtrar quartos que precisam de energia nessa raridade
      const roomsNeedingEnergy = state.inventory.filter((room) => {
        if (room.type !== "room") return false
        const dbRoom = ITEMS_DB.room.find((x) => x.id === room.id)
        if (!dbRoom || dbRoom.tier !== rarity) return false

        const timeLeft = (room.lastRentPaid || 0) + RENT_DURATION_MS - Date.now()
        return timeLeft <= 0 || timeLeft < RENT_DURATION_MS
      })

      if (roomsNeedingEnergy.length === 0) {
        notify("Todos os quartos já têm energia suficiente!", "info")
        return
      }

      const totalCost = cost * roomsNeedingEnergy.length

      // Abrir modal de confirmação
      setPayAllModal({ rarity, count: roomsNeedingEnergy.length, total: totalCost })
    },
    [state.inventory, notify],
  )

  const processPayAllEnergy = useCallback(() => {
    if (!payAllModal) return

    const { rarity, count, total } = payAllModal

    if (state.dpix < total) {
      notify(`Saldo insuficiente! Necessário: Ð ${total.toFixed(2)}`, "error")
      setPayAllModal(null)
      return
    }

    const rentCosts: Record<Tier, number> = {
      basic: 0.6,
      common: 1.5,
      rare: 3.5,
      epic: 8.0,
      legendary: 20.0,
    }

    const cost = rentCosts[rarity]

    const roomsNeedingEnergy = state.inventory.filter((room) => {
      if (room.type !== "room") return false
      const dbRoom = ITEMS_DB.room.find((x) => x.id === room.id)
      if (!dbRoom || dbRoom.tier !== rarity) return false

      const timeLeft = (room.lastRentPaid || 0) + RENT_DURATION_MS - Date.now()
      return timeLeft <= 0 || timeLeft < RENT_DURATION_MS
    })

    // Pagar todos
    setState((prev) => ({
      ...prev,
      dpix: prev.dpix - total,
      inventory: prev.inventory.map((i) => {
        if (roomsNeedingEnergy.find((r) => r.uid === i.uid)) {
          return { ...i, lastRentPaid: Date.now(), power: true }
        }
        return i
      }),
    }))

    addLog(`Energia: ${count} quartos`, -total, "out")
    notify(
      `⚡ Energia renovada para ${count} ${count === 1 ? "quarto" : "quartos"}! Custo: Ð ${total.toFixed(2)}`,
      "success",
    )
    setPayAllModal(null)
  }, [payAllModal, state.dpix, state.inventory, setState, addLog, notify])

  return (
    <div className="flex w-full h-full bg-bg-dark text-text-main">
      {/* SIDEBAR */}
      <div className="w-[260px] bg-sidebar-bg border-r border-border-color flex flex-col p-5 z-10 shrink-0 transition-all">
        <div className="text-[20px] font-bold text-white mb-10 flex items-center gap-2.5">
          <i className="fa-solid fa-bolt text-neon-green"></i> MINER PRO
        </div>
        <ul className="p-0 m-0 flex flex-col gap-2.5 list-none">
          {[
            { id: "dashboard", icon: "fa-chart-line", label: "Dashboard" },
            { id: "profile", icon: "fa-id-card", label: "Perfil" },
            { id: "rigs", icon: "fa-server", label: "Quartos (Infra)" },
            { id: "inventory", icon: "fa-boxes-stacked", label: "Inventário" },
            { id: "shop", icon: "fa-cart-shopping", label: "Mercado" },
            { id: "exchange", icon: "fa-money-bill-transfer", label: "Câmbio" },
            { id: "referrals", icon: "fa-users", label: "Indicações" },
          ].map((link) => (
            <li
              key={link.id}
              onClick={() => setActiveView(link.id)}
              className={`px-4 py-3 rounded-lg cursor-pointer transition-all flex items-center gap-3 font-medium ${activeView === link.id ? "bg-accent text-white shadow-[0_4px_15px_rgba(114,137,218,0.3)]" : "text-text-muted hover:bg-white/5 hover:text-white"}`}
            >
              <i className={`fa-solid ${link.icon}`}></i> {link.label}
            </li>
          ))}
          {/* Logout Item */}
          <li
            onClick={handleLogout}
            className="px-4 py-3 rounded-lg cursor-pointer transition-all flex items-center gap-3 font-medium text-text-muted hover:bg-neon-red/10 hover:text-neon-red mt-auto"
          >
            <i className="fa-solid fa-power-off"></i> Sair
          </li>
        </ul>
        <div className="mt-2 text-[11px] text-[#555] text-center">
          v9.3.0 Dash Merge
          <br />
          Server: São Paulo (BR)
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="grow overflow-y-auto flex flex-col relative">
        {/* HEADER */}
        <div className="h-[70px] border-b border-border-color flex items-center justify-between px-[30px] bg-[#0b0c15]/95 backdrop-blur-sm sticky top-0 z-20">
          <div className="text-sm text-[#888]">
            Bem-vindo, <strong>{state.username}</strong>
          </div>
          <div className="flex gap-4">
            <div className="bg-[#111] border border-border-color px-4 py-2 rounded-full font-bold font-mono flex items-center gap-2.5 text-dpix-color shadow-[0_0_10px_rgba(217,70,239,0.1)] border-dpix-color/30 whitespace-nowrap">
              <i className="fa-solid fa-coins"></i> {formatDPIX(state.dpix)}
            </div>
            <div className="bg-[#111] border border-border-color px-4 py-2 rounded-full font-bold font-mono flex items-center gap-2.5 text-neon-green shadow-[0_0_10px_rgba(0,230,118,0.1)] whitespace-nowrap">
              <i className="fa-solid fa-wallet"></i> {formatBRL(state.wallet)}
            </div>
          </div>
        </div>

        {/* VIEWS */}
        {activeView === "dashboard" && (
          <div className="p-8 animate-slide-in max-w-6xl mx-auto w-full pb-20">
            <h2 className="text-2xl font-bold mb-5 text-white">Dashboard</h2>
            <div className="flex gap-2.5 mb-5 flex-wrap">
              <button
                onClick={() => setDashTab("overview")}
                className={`px-5 py-2 rounded-full border font-bold transition-colors text-sm uppercase ${dashTab === "overview" ? "bg-accent border-accent text-white" : "bg-transparent border-border-color text-[#888]"}`}
              >
                <i className="fa-solid fa-chart-line"></i> Visão Geral
              </button>
              <button
                onClick={() => setDashTab("financial")}
                className={`px-5 py-2 rounded-full border font-bold transition-colors text-sm uppercase ${dashTab === "financial" ? "bg-accent border-accent text-white" : "bg-transparent border-border-color text-[#888]"}`}
              >
                <i className="fa-solid fa-chart-pie"></i> Financeiro
              </button>
            </div>

            {dashTab === "overview" ? (
              <>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-5 mb-8">
                  {/* Stats Cards */}
                  {[
                    {
                      title: "Poder Ativo",
                      val: `${getActivePower(state.inventory)} MH/s`,
                      sub: "Apenas máquinas instaladas",
                      color: "accent",
                    },
                    {
                      title: "Produção Real",
                      val: `${getActiveDailyProduction(state.inventory).toFixed(2)} DPIX`,
                      sub: "por dia",
                      color: "dpix-color",
                    },
                    {
                      title: "Consumo Energético",
                      val: `${getActiveWatts(state.inventory)} W`,
                      sub: `${state.inventory.filter((i) => i.type === "room" && i.power).length}/${state.inventory.filter((i) => i.type === "room").length} Quartos Ativos`,
                      color: "neon-red",
                    },
                    {
                      title: "Custo Operacional",
                      val: formatBRL(getTotalRentCost(state.inventory)),
                      sub: "Total de Aluguel / 12h",
                      color: "neon-yellow",
                    },
                  ].map((s, i) => (
                    <div
                      key={i}
                      className="bg-card-bg rounded-xl p-5 border border-border-color relative overflow-hidden pl-5 before:content-[''] before:absolute before:top-0 before:left-0 before:w-1 before:h-full"
                      style={{ borderLeftColor: `var(--${s.color})` }}
                    >
                      <div className={`absolute left-0 top-0 bottom-0 w-1 bg-${s.color}`}></div>
                      <div className="text-xs text-text-muted uppercase tracking-widest mb-2.5">{s.title}</div>
                      <div className="text-2xl font-bold text-white font-mono">{s.val}</div>
                      <div className="text-xs text-text-muted mt-1">{s.sub}</div>
                    </div>
                  ))}
                </div>

                <div className="bg-gradient-to-br from-[#1f202e] to-[#161722] border border-dpix-color rounded-xl p-6 text-center mb-8 shadow-[0_0_20px_rgba(217,70,239,0.05)]">
                  <div className="text-[#aaa] text-sm tracking-widest uppercase mb-1">Saldo Pendente (Pool)</div>
                  <div className="text-[42px] font-mono text-dpix-color my-2.5 drop-shadow-[0_0_15px_rgba(217,70,239,0.4)] leading-none">
                    {formatDPIX(state.miningPool)}
                  </div>
                  <div className="text-xs text-[#888] mb-2.5 mt-3">
                    <i className="fa-solid fa-lock mr-1"></i> Conversão mínima: 10.00 DPIX
                  </div>
                  <button
                    onClick={handleCollect}
                    disabled={state.miningPool < 10}
                    className="bg-dpix-color text-white border-none px-8 py-3 rounded-md font-bold cursor-pointer uppercase mt-2.5 disabled:bg-[#333] disabled:text-[#888] disabled:cursor-not-allowed transition-colors hover:bg-dpix-color/80 disabled:hover:bg-[#333]"
                  >
                    {state.miningPool >= 10
                      ? "Transferir para Carteira"
                      : `Faltam ${(10 - state.miningPool).toFixed(2)} DPIX`}
                  </button>
                </div>

                {/* Modifica getActiveDailyProduction para considerar health */}
                {/* Modifica getActivePower para considerar health */}
                <div className="bg-[#050505] border border-[#333] rounded-lg font-mono p-4 h-[200px] overflow-hidden relative flex flex-col shadow-inner mt-5">
                  <div className="border-b border-[#333] pb-1 mb-1 text-[#888] text-[11px] flex justify-between">
                    <span>SYSTEM TERMINAL // LIVE LOGS</span>
                    <span
                      className={getActiveDailyProduction(state.inventory) > 0 ? "text-neon-green" : "text-neon-red"}
                    >
                      {getActiveDailyProduction(state.inventory) > 0 ? "● ONLINE" : "● OFFLINE"}
                    </span>
                  </div>

                  {getMinersThatNeedRepair() > 0 && (
                    <div className="mb-3 bg-red-900/30 border border-red-500/50 rounded-lg p-3 animate-pulse">
                      <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
                        <i className="fa-solid fa-triangle-exclamation"></i>
                        <span>
                          {getMinersThatNeedRepair()} Mineradora{getMinersThatNeedRepair() > 1 ? "s" : ""} precisa
                          {getMinersThatNeedRepair() > 1 ? "m" : ""} de reparo!
                        </span>
                      </div>
                      <p className="text-xs text-red-300/80 mt-1 ml-6">
                        Corra para o quarto antes que pare de minerar!
                      </p>
                    </div>
                  )}

                  <div className="grow overflow-hidden flex flex-col justify-end text-xs text-[#aaa]">
                    {terminalLogs.map((log, i) => (
                      <div
                        key={i}
                        className="mb-0.5 whitespace-nowrap animate-slide-in"
                        dangerouslySetInnerHTML={{ __html: log }}
                      ></div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <FinancialTable inventory={state.inventory} />
            )}
          </div>
        )}

        {activeView === "profile" && (
          <div className="p-8 animate-slide-in max-w-6xl mx-auto w-full pb-20">
            <h2 className="text-2xl font-bold mb-5 text-white">Meu Perfil</h2>
            <div className="grid grid-cols-[300px_1fr] gap-8 max-[900px]:grid-cols-1">
              <div className="bg-card-bg border border-border-color rounded-2xl p-8 text-center relative overflow-hidden">
                <div className="w-[100px] h-[100px] rounded-full bg-[#111] border-2 border-accent mx-auto mb-5 flex items-center justify-center text-[40px] text-text-muted relative overflow-hidden">
                  <i className="fa-solid fa-user-astronaut"></i>
                </div>
                <div className="text-xl font-bold text-white mb-1 flex justify-center items-center gap-2">
                  {state.username}{" "}
                  <i
                    onClick={() => {
                      const n = prompt("Novo nome:")
                      if (n && n.length > 2) {
                        setState((p) => ({ ...p, username: n.substring(0, 12) }))
                        notify("Nome alterado!", "success")
                      }
                    }}
                    className="fa-solid fa-pen-to-square text-xs text-[#666] cursor-pointer"
                  ></i>
                </div>
                <div className="text-[11px] text-[#666] font-mono bg-[#111] px-2 py-1 rounded inline-block mb-4">
                  UID: {state.referral.code}
                </div>
                <div>
                  <span className="text-[11px] bg-accent/10 text-accent px-3 py-1 rounded-full inline-block font-bold">
                    <i className="fa-regular fa-clock"></i> {getAccountAgeDays(state.createdAt)} dias ativo
                  </span>
                </div>

                <div className="bg-[#151621] border border-[#333] rounded-xl p-5 mt-5">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-xs font-bold text-white">Taxa de Saque</span>
                    <span className="text-[11px] text-[#888]">Baseada em tempo ativo</span>
                  </div>
                  <div className="flex h-2 w-full bg-black rounded overflow-hidden mb-2.5">
                    {["step-bad", "step-mid", "step-good"].map((step, idx) => {
                      const feeInfo = getWithdrawFee(state.createdAt)
                      const active =
                        feeInfo.barClass === step ||
                        (idx === 0 && feeInfo.barClass === "step-mid") ||
                        (idx <= 1 && feeInfo.barClass === "step-good")
                      let bg = "bg-[#222]"
                      if (active) {
                        if (step === "step-bad") bg = "bg-neon-red shadow-[0_0_10px_rgba(255,82,82,0.5)]"
                        if (step === "step-mid") bg = "bg-neon-yellow shadow-[0_0_10px_rgba(255,234,0,0.5)]"
                        if (step === "step-good") bg = "bg-neon-green shadow-[0_0_10px_rgba(0,230,118,0.5)]"
                      }
                      return (
                        <div
                          key={step}
                          className={`flex-1 relative mr-0.5 opacity-30 transition-all last:mr-0 ${active ? "!opacity-100 " + bg : bg}`}
                        ></div>
                      )
                    })}
                  </div>
                  <div className="flex justify-between text-[10px] text-[#666] uppercase font-bold">
                    <span>0-10d (30%)</span>
                    <span>11-20d (15%)</span>
                    <span>21+d (5%)</span>
                  </div>
                  <div className="bg-black/30 p-2.5 rounded-md mt-4 text-xs text-[#aaa] flex items-center gap-2.5 border-l-[3px] border-[#555]">
                    <i className="fa-solid fa-circle-info text-accent"></i>
                    <span>
                      Sua taxa de saque atual é de{" "}
                      <strong className={getWithdrawFee(state.createdAt).color}>
                        {getWithdrawFee(state.createdAt).label}
                      </strong>
                      .
                    </span>
                  </div>
                </div>
              </div>
              <div className="bg-card-bg border border-border-color rounded-2xl p-8 flex flex-col justify-between">
                <div>
                  <div className="text-xs text-[#888] uppercase mb-1">Saldo Bancário Disponível</div>
                  <div className="text-4xl font-bold text-neon-green font-mono mb-6">{formatBRL(state.wallet)}</div>
                  <div className="text-[13px] text-[#666] mb-5">
                    Gerencie seus fundos. <strong className="text-white">Depósitos são convertidos 1:1</strong> para
                    DPIX (moeda do jogo). <strong className="text-white">Saques são processados em BRL</strong> com taxa
                    de fidelidade.
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setBankModal({ type: "deposit" })}
                    className="p-4 border border-neon-green/30 text-neon-green bg-neon-green/10 rounded-lg font-bold cursor-pointer hover:bg-neon-green hover:text-black transition-all flex flex-col items-center gap-1 text-sm"
                  >
                    <i className="fa-solid fa-arrow-up-from-bracket text-xl"></i> DEPOSITAR
                  </button>
                  <button
                    onClick={() => setBankModal({ type: "withdraw" })}
                    className="p-4 border border-neon-red/30 text-neon-red bg-neon-red/10 rounded-lg font-bold cursor-pointer hover:bg-neon-red hover:text-white transition-all flex flex-col items-center gap-1 text-sm"
                  >
                    <i className="fa-solid fa-money-bill-wave text-xl"></i> SACAR
                  </button>
                </div>
              </div>
            </div>

            <h3 className="mt-8 mb-4 border-b border-[#333] pb-2 text-white font-bold">
              <i className="fa-solid fa-clock-rotate-left"></i> Histórico de Transações
            </h3>
            <div className="bg-card-bg border border-border-color rounded-xl overflow-hidden">
              <div className="max-h-[400px] overflow-y-auto">
                <table className="w-full border-collapse">
                  <thead className="bg-[#151621] sticky top-0">
                    <tr>
                      <th className="text-left text-[#666] text-[11px] uppercase p-3 border-b border-[#333]">Data</th>
                      <th className="text-left text-[#666] text-[11px] uppercase p-3 border-b border-[#333]">Evento</th>
                      <th className="text-right text-[#666] text-[11px] uppercase p-3 border-b border-[#333]">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...state.logs]
                      .reverse()
                      .slice(0, 20)
                      .map((log) => (
                        <tr key={log.id} className="hover:bg-white/5">
                          <td className="p-3 border-b border-border-color text-[#e0e0e0] text-[13px]">{log.date}</td>
                          <td className="p-3 border-b border-border-color text-[#e0e0e0] text-[11px]">{log.desc}</td>
                          <td
                            className={`p-3 border-b border-border-color font-bold text-[13px] text-right ${log.type === "in" ? "text-neon-green" : log.type === "coin" ? "text-dpix-color" : "text-neon-red"}`}
                          >
                            {typeof log.amount === "number" && log.type !== "coin" ? formatBRL(log.amount) : log.amount}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeView === "inventory" && (
          <div className="p-8 animate-slide-in max-w-6xl mx-auto w-full pb-20">
            <h2 className="text-2xl font-bold mb-2 text-white">Gestão de Ativos</h2>
            <p className="text-[#888] mb-5">Gerencie todos os seus itens, instalados ou guardados.</p>
            <div className="flex gap-2.5 mb-5 flex-wrap">
              {["all", "used", "stored"].map((f) => (
                <button
                  key={f}
                  onClick={() => setInvFilter(f)}
                  className={`px-5 py-2 rounded-full border font-bold transition-colors text-sm uppercase ${invFilter === f ? "bg-accent text-white border-accent" : "bg-transparent text-[#888] border-border-color"}`}
                >
                  {f === "all" ? "Todos" : f === "used" ? "Em Uso" : "Guardados"}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {state.inventory.filter(
                (i) =>
                  i.type !== "room" &&
                  (invFilter === "all" ||
                    (invFilter === "used" && i.parentId) ||
                    (invFilter === "stored" && !i.parentId)),
              ).length === 0 ? (
                <div className="col-span-full text-center text-[#666] py-10">
                  Nenhum item encontrado nesta categoria.
                </div>
              ) : (
                state.inventory
                  .filter(
                    (i) =>
                      i.type !== "room" &&
                      (invFilter === "all" ||
                        (invFilter === "used" && i.parentId) ||
                        (invFilter === "stored" && !i.parentId)),
                  )
                  .map((item) => {
                    const dbItem = ITEMS_DB[item.type].find((x) => x.id === item.id)
                    if (!dbItem) return null
                    const isInstalled = !!item.parentId

                    let visual = null
                    let stats = null
                    if (item.type === "miner") {
                      const styleClass = dbItem.skinStyle ? `style-${dbItem.skinStyle}` : ""
                      visual = (
                        <div
                          className={`w-full max-w-[200px] h-[100px] mx-auto rounded-md border border-[#333] flex items-center justify-around px-3 shadow-lg transition-all bg-gradient-to-b from-[#2a2d3a] to-[#151621] ${styleClass}`}
                          style={{
                            borderBottom: dbItem.tier !== "basic" ? `3px solid ${getTierColor(dbItem.tier)}` : "",
                          }}
                        >
                          {[...Array(dbItem.fans || 2)].map((_, idx) => (
                            <div
                              key={idx}
                              className="w-[40px] h-[40px] rounded-full bg-[#0b0c15] border-2 border-[#444] relative flex items-center justify-center shadow-inner"
                            >
                              <div className={`w-full h-full rounded-full fan-blades-gradient opacity-80`}></div>
                            </div>
                          ))}
                        </div>
                      )
                      const roi = dbItem.price ? (dbItem.price / dbItem.daily).toFixed(1) : 0
                      stats = (
                        <div className="grid grid-cols-2 gap-2 mt-3 text-[11px]">
                          <Tooltip text="Capacidade de processamento">
                            <div className="bg-black/30 p-2 rounded text-center border border-white/5">
                              <div className="text-[#666] text-[10px] uppercase mb-1">Poder</div>
                              <div className="text-[#eee] font-bold font-mono text-[13px]">{dbItem.power} MH/s</div>
                            </div>
                          </Tooltip>
                          <Tooltip text="Lucro diário quando ativa">
                            <div className="bg-black/30 p-2 rounded text-center border border-white/5">
                              <div className="text-[#666] text-[10px] uppercase mb-1">Produção</div>
                              <div className="text-dpix-color font-bold font-mono text-[13px]">{dbItem.daily} Ð</div>
                            </div>
                          </Tooltip>
                          <Tooltip text="Tempo para recuperar investimento">
                            <div className="bg-black/30 p-2 rounded text-center border border-white/5 col-span-2">
                              <div className="text-[#666] text-[10px] uppercase mb-1">ROI Estimado</div>
                              <div className="text-neon-green font-bold font-mono text-[13px]">{roi} Dias</div>
                            </div>
                          </Tooltip>
                          {item.type === "miner" && (
                            <Tooltip
                              text={`Estado térmico da mineradora. Decai 3.33% por dia quando ativa (30 dias de vida útil).`}
                            >
                              <div className="bg-black/30 p-2 rounded text-center border border-white/5 col-span-2">
                                <div className="text-[#666] text-[10px] uppercase mb-1 flex items-center justify-center gap-1">
                                  <i className="fa-solid fa-temperature-half"></i> Temperatura
                                </div>
                                <div className="flex items-center gap-2 justify-center mb-1">
                                  <div className="w-20 h-1.5 bg-black/50 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full transition-all ${(item.health ?? 100) > 50 ? "bg-green-500" : (item.health ?? 100) > 20 ? "bg-yellow-500" : "bg-red-600"}`}
                                      style={{ width: `${item.health ?? 100}%` }}
                                    ></div>
                                  </div>
                                  <span className="text-white font-bold font-mono text-[11px] min-w-[40px]">
                                    {(item.health ?? 100).toFixed(0)}%
                                  </span>
                                </div>
                                <div className="text-[#888] text-[10px]">
                                  {Math.floor(((item.health ?? 100) / 100) * 30)} dias restantes
                                </div>
                                {(item.health ?? 100) <= 0 && (
                                  <button
                                    onClick={() => {
                                      repairMiner(item.uid)
                                    }}
                                    className="mt-2 w-full bg-neon-orange text-black text-[10px] font-bold px-2 py-1 rounded uppercase hover:bg-orange-400 transition-all flex items-center gap-1"
                                  >
                                    <i className="fa-solid fa-wrench"></i> MANUTENÇÃO (Ð 50)
                                  </button>
                                )}
                              </div>
                            </Tooltip>
                          )}
                        </div>
                      )
                    } else {
                      visual = (
                        <div className="w-[140px] h-[100px] mx-auto bg-[#1a1c29] border-2 border-[#444] rounded flex flex-col justify-between p-2 shadow-lg">
                          {[...Array(dbItem.slots || 1)].map((_, idx) => (
                            <div
                              key={idx}
                              className="h-[8px] bg-[#0b0c15] rounded-sm"
                              style={{ background: idx < (dbItem.slots || 1) ? "#00e676" : "#333" }}
                            ></div>
                          ))}
                        </div>
                      )
                      stats = (
                        <div className="grid grid-cols-1 gap-2 mt-3 text-[11px]">
                          <Tooltip text="Quantas mineradoras cabem neste rack">
                            <div className="bg-black/30 p-2 rounded text-center border border-white/5">
                              <div className="text-[#666] text-[10px] uppercase mb-1">Capacidade</div>
                              <div className="text-[#eee] font-bold font-mono text-[13px]">{dbItem.slots} Slots</div>
                            </div>
                          </Tooltip>
                        </div>
                      )
                    }

                    return (
                      <div
                        key={item.uid}
                        className="bg-card-bg border border-border-color rounded-xl flex flex-col overflow-hidden relative group hover:-translate-y-1 hover:shadow-lg transition-transform"
                        data-tier={dbItem.tier}
                      >
                        <div className="p-3 bg-black/20 flex flex-col items-center gap-1 border-b border-white/5 text-center">
                          <span className="font-bold text-white">{dbItem.name}</span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase border flex items-center gap-1 ${isInstalled ? "bg-neon-green/10 text-neon-green border-neon-green/30" : "bg-white/5 text-[#aaa] border-[#333]"}`}
                          >
                            {isInstalled ? (
                              <>
                                <i className="fa-solid fa-plug"></i> Em Uso
                              </>
                            ) : (
                              <>
                                <i className="fa-solid fa-box"></i> Guardado
                              </>
                            )}
                          </span>
                        </div>
                        <div className="h-[120px] bg-black/20 flex items-center justify-center border-b border-white/5 relative shrink-0">
                          {visual}
                        </div>
                        <div className="p-4 grow flex flex-col justify-between">
                          <div className="text-center mb-2">
                            <RarityBadge tier={dbItem.tier} />
                          </div>
                          {stats}
                          <div className="mt-4">
                            {isInstalled ? (
                              <button
                                onClick={() => handleUninstall(item.uid)}
                                className="w-full py-2 rounded text-[11px] font-bold uppercase bg-neon-red/10 text-neon-red border border-neon-red/30 hover:bg-neon-red/20 transition-all cursor-pointer"
                              >
                                Remover
                              </button>
                            ) : (
                              <div className="flex flex-col gap-2">
                                <button
                                  onClick={() => {
                                    // Bloquear instalação de mineradoras quebradas
                                    if (item.type === "miner" && (item.health ?? 100) <= 0) {
                                      notify("Repare a mineradora antes de instalar.", "error")
                                      return
                                    }
                                    setActiveView("rigs")
                                    notify("Selecione um slot vazio em um Quarto.", "info")
                                  }}
                                  disabled={item.type === "miner" && (item.health ?? 100) <= 0}
                                  className={`w-full py-2 rounded text-[11px] font-bold uppercase transition-all cursor-pointer ${
                                    item.type === "miner" && (item.health ?? 100) <= 0
                                      ? "bg-gray-600/50 text-gray-400 border border-gray-500/30 cursor-not-allowed"
                                      : "bg-neon-blue text-white hover:bg-blue-600"
                                  }`}
                                >
                                  Instalar
                                </button>
                                <Tooltip text={`Reciclar por +Ð ${getScrapValue(item.type)}`}>
                                  <button
                                    onClick={() => recycleItem(item.uid)}
                                    className={`w-full py-2 rounded text-[11px] font-bold uppercase transition-all cursor-pointer flex items-center justify-center gap-2 ${
                                      item.type === "miner" && (item.health ?? 100) <= 0
                                        ? "bg-neon-orange/20 text-neon-orange border-2 border-neon-orange/50 hover:bg-neon-orange/30 animate-pulse"
                                        : "bg-gray-700/50 text-gray-400 border border-gray-600/30 hover:bg-gray-600/50"
                                    }`}
                                  >
                                    <i className="fa-solid fa-recycle"></i>
                                    Reciclar (Ð {getScrapValue(item.type)})
                                  </button>
                                </Tooltip>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })
              )}
            </div>
          </div>
        )}

        {activeView === "shop" && (
          <MarketView filter={shopFilter} setFilter={setShopFilter} onBuy={handleBuy} onOpenBox={processBoxOpening} />
        )}
        {activeView === "rigs" && (
          <InfraView
            inventory={state.inventory}
            onPayRent={handlePayRent}
            onInstall={openInstallModal}
            onUninstall={handleUninstall}
            onToggleAutoPay={toggleAutoPay}
            setActiveView={setActiveView}
            setShopFilter={setShopFilter}
            onRepairMiner={repairMiner} // Passando a função repairMiner como prop
            onPayAllEnergy={payAllEnergy} // Passando a função para o InfraView
            onDemolishRoom={demolishRoom} // Passando a função demolishRoom
          />
        )}
        {activeView === "exchange" && (
          <div className="p-8 animate-slide-in max-w-6xl mx-auto w-full pb-20">
            <h2 className="text-2xl font-bold mb-5 text-white">Câmbio & Saque</h2>
            <div className="max-w-[450px] mx-auto mt-10">
              <div className="bg-card-bg border border-border-color rounded-2xl p-6 shadow-2xl relative">
                <div className="flex justify-between items-center mb-5 text-base font-bold text-white">
                  <span>Vender DPIX</span>
                  <span className="text-xs text-[#888]">Taxa: 5%</span>
                </div>

                <div className="bg-[#151621] border border-[#333] rounded-xl p-4 flex flex-col gap-1 mb-1">
                  <div className="flex justify-between text-xs text-[#888] mb-1">
                    <span>Vender</span>
                    <span>Saldo: {state.dpix.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="text-2xl font-bold text-white font-mono">{state.dpix.toFixed(2)}</div>
                    <div className="flex items-center gap-2 bg-[#2a2d3a] px-2.5 py-1.5 rounded-full text-sm font-bold text-dpix-color border border-[#444]">
                      <i className="fa-solid fa-coins"></i> DPIX
                    </div>
                  </div>
                </div>

                <div className="relative h-2.5 my-2.5 flex justify-center items-center z-[2]">
                  <div className="w-9 h-9 rounded-lg bg-[#2a2d3a] border-[3px] border-card-bg text-text-main flex items-center justify-center cursor-pointer hover:bg-accent hover:border-accent hover:text-white hover:rotate-180 transition-all">
                    <i className="fa-solid fa-arrow-down"></i>
                  </div>
                </div>

                <div className="bg-[#151621] border border-[#333] rounded-xl p-4 flex flex-col gap-1 mb-1">
                  <div className="flex justify-between text-xs text-[#888] mb-1">
                    <span>Receber (Estimado)</span>
                    <span>Saldo: {formatBRL(state.wallet)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="text-2xl font-bold text-neon-green font-mono">
                      {(state.dpix * DPIX_PRICE_BRL * (1 - EXCHANGE_FEE)).toFixed(2)}
                    </div>
                    <div className="flex items-center gap-2 bg-[#2a2d3a] px-2.5 py-1.5 rounded-full text-sm font-bold text-neon-green border border-[#444]">
                      <i className="fa-solid fa-wallet"></i> BRL
                    </div>
                  </div>
                </div>

                <div className="text-xs text-[#666] mt-4 flex justify-between">
                  <span>Cotação</span>
                  <span>1 DPIX = R$ 1,00</span>
                </div>
                <button
                  onClick={() => {
                    const brl = state.dpix * DPIX_PRICE_BRL
                    const fee = brl * EXCHANGE_FEE
                    const net = brl - fee
                    if (
                      state.dpix > 0 &&
                      confirm(`Vender ${state.dpix.toFixed(2)} DPIX?\n\nLíquido: ${formatBRL(net)}`)
                    ) {
                      setState((p) => ({ ...p, wallet: p.wallet + net, dpix: 0 }))
                      addLog("Venda DPIX", net, "in")
                      notify(`Recebido: ${formatBRL(net)}`, "success")
                    }
                  }}
                  className="bg-neon-green text-black w-full py-4 text-base mt-4 rounded font-bold hover:translate-y-[-2px] hover:shadow-[0_0_20px_rgba(0,230,118,0.4)] transition-all cursor-pointer"
                >
                  VENDER TUDO
                </button>
              </div>
            </div>
          </div>
        )}

        {activeView === "referrals" && (
          <div className="p-8 animate-slide-in max-w-6xl mx-auto w-full pb-20">
            <h2 className="text-2xl font-bold text-white">Programa de Indicações</h2>
            <p className="text-[#888] mb-8">
              Construa sua rede de afiliados e ganhe comissões sobre a mineração deles.
            </p>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-5 mb-8">
              <div className="bg-card-bg rounded-xl p-5 border border-border-color">
                <div className="text-xs text-text-muted uppercase tracking-widest mb-2.5">Total Ganho (Comissões)</div>
                <div className="text-2xl font-bold text-neon-blue font-mono">
                  {formatBRL(state.referral.totalEarned)}
                </div>
                <div className="text-xs text-text-muted mt-1">Acumulado vitalício</div>
              </div>
              <div className="bg-card-bg rounded-xl p-5 border border-border-color">
                <div className="text-xs text-text-muted uppercase tracking-widest mb-2.5">Saldo Disponível</div>
                <div className="text-2xl font-bold text-white font-mono">{formatBRL(state.referral.balance)}</div>
                <div className="text-xs text-text-muted mt-1">Pronto para saque</div>
              </div>
              <div className="bg-card-bg rounded-xl p-5 border border-border-color">
                <div className="text-xs text-text-muted uppercase tracking-widest mb-2.5">Tamanho da Rede</div>
                <div className="text-2xl font-bold text-white font-mono">
                  {state.referral.users.lvl1 + state.referral.users.lvl2 + state.referral.users.lvl3} Usuários
                </div>
                <div className="text-xs text-text-muted mt-1">Total de indicados</div>
              </div>
            </div>

            <div className="flex gap-4 mb-8">
              <button
                onClick={() => {
                  if (state.referral.balance > 0) {
                    setState((p) => ({
                      ...p,
                      wallet: p.wallet + p.referral.balance,
                      referral: { ...p.referral, balance: 0 },
                    }))
                    notify("Resgatado!", "success")
                  } else notify("Sem saldo", "error")
                }}
                className="bg-neon-blue text-white border-none px-8 py-3 rounded-md font-bold cursor-pointer uppercase grow flex items-center justify-center gap-2 hover:bg-blue-600 transition-all"
              >
                <i className="fa-solid fa-wallet"></i> Resgatar para Carteira Principal (R$)
              </button>
            </div>

            <div className="bg-[#151621] border border-[#333] rounded-xl p-5 flex flex-col gap-2.5 mb-8">
              <div className="text-xs text-[#aaa]">SEU LINK DE INDICAÇÃO</div>
              <div className="flex gap-2.5">
                <input
                  type="text"
                  readOnly
                  value={`https://cryptotycoon.pro/r/${state.referral.code}`}
                  className="grow bg-[#0b0c15] border border-[#333] p-2.5 text-neon-blue font-mono rounded"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`https://cryptotycoon.pro/r/${state.referral.code}`)
                    notify("Link copiado!", "info")
                  }}
                  className="bg-neon-blue text-white border-none px-5 rounded font-bold hover:bg-blue-600 cursor-pointer"
                >
                  <i className="fa-regular fa-copy"></i>
                </button>
              </div>
            </div>

            <h3 className="text-white font-bold mb-4">Sua Rede</h3>
            <div className="grid grid-cols-3 gap-5 max-md:grid-cols-1 mb-8">
              {[
                {
                  level: 1,
                  name: "Nível 1 (Diretos)",
                  pct: "5%",
                  count: state.referral.users.lvl1,
                  color: "neon-green",
                  border: "border-t-4 border-neon-green",
                },
                {
                  level: 2,
                  name: "Nível 2 (Indiretos)",
                  pct: "3%",
                  count: state.referral.users.lvl2,
                  color: "neon-yellow",
                  border: "border-t-4 border-neon-yellow",
                },
                {
                  level: 3,
                  name: "Nível 3 (Profundo)",
                  pct: "1%",
                  count: state.referral.users.lvl3,
                  color: "neon-red",
                  border: "border-t-4 border-neon-red",
                },
              ].map((l) => (
                <div
                  key={l.level}
                  className={`bg-card-bg border border-border-color rounded-xl p-5 relative ${l.border}`}
                >
                  <div className="flex justify-between mb-4 font-bold text-white border-b border-white/5 pb-2.5">
                    <span>{l.name}</span>
                    <span className={`bg-${l.color}/10 text-${l.color} px-2 py-0.5 rounded text-[11px]`}>{l.pct}</span>
                  </div>
                  <div className="flex justify-between text-[13px] text-[#aaa] mb-2">
                    <span>Usuários</span>
                    <span className="font-bold text-white">{l.count}</span>
                  </div>
                  <div className="flex justify-between text-[13px] text-[#aaa] mb-2">
                    <span>Renda Diária Est.</span>
                    <span className={`font-bold text-${l.color}`}>{formatBRL(0)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* TOASTS */}
      <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-2.5 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`bg-[#151621]/95 border-l-4 text-white px-5 py-4 rounded shadow-lg min-w-[300px] backdrop-blur pointer-events-auto animate-slide-in flex items-center justify-between text-[13px] ${t.type === "success" ? "border-neon-green" : t.type === "error" ? "border-neon-red" : "border-dpix-color"}`}
          >
            <div className="flex items-center gap-2.5">
              {t.type === "success" && <i className="fa-solid fa-check-circle text-neon-green"></i>}
              {t.type === "error" && <i className="fa-solid fa-circle-xmark text-neon-red"></i>}
              {t.type === "info" && <i className="fa-solid fa-info-circle text-dpix-color"></i>}
              <span>{t.msg}</span>
            </div>
          </div>
        ))}
      </div>

      {/* NOTIFICATION (for demolishRoom) */}
      {notification && (
        <div
          className={`fixed bottom-5 right-5 z-[9999] bg-[#151621]/95 border-l-4 text-white px-5 py-4 rounded shadow-lg min-w-[300px] backdrop-blur pointer-events-auto animate-slide-in flex items-center gap-2.5 text-[13px] border-${notification.color} `}
        >
          <i
            className={`fa-solid ${notification.color === "red" ? "fa-circle-xmark text-red-500" : notification.color === "green" ? "fa-check-circle text-green-500" : "fa-info-circle text-blue-500"}`}
          ></i>
          {notification.message}
        </div>
      )}

      {/* MODALS */}
      {buyModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[2000] flex items-center justify-center">
          <div className="bg-card-bg border border-border-color p-6 rounded-xl w-[90%] max-w-[500px] shadow-2xl">
            <div className="text-center mb-4">
              <div className="text-lg font-bold text-white mb-1">{buyModal.item.name}</div>
              <div className="text-xs text-[#888] uppercase">
                {buyModal.item.isSpecial
                  ? "Mineradora Especial (Skin)"
                  : buyModal.type === "room"
                    ? "Quarto"
                    : buyModal.type === "shelf"
                      ? "Prateleira"
                      : "Mineradora"}{" "}
                • {buyModal.item.tier}
              </div>
              {buyModal.item.tier === "box" && (
                <div className="mt-1 text-[11px] text-[#aaa]">
                  Probabilidades:
                  <br />
                  Basic: 60% | Comum: 25% | Raro: 10%
                  <br />
                  Épico: 4% | Lendário: 1%
                </div>
              )}
              {buyModal.item.desc && <div className="text-[11px] text-[#aaa] mt-2 italic">"{buyModal.item.desc}"</div>}
              {buyModal.item.isSpecial && (
                <div className="mt-1 text-tier-special text-[11px]">Item exclusivo comprado com DPIX</div>
              )}
            </div>
            <div className="bg-[#111] p-4 rounded-lg flex justify-between items-center border border-[#333]">
              <span className="text-[#aaa]">Preço:</span>
              <span className="font-bold text-lg text-dpix-color">Ð {buyModal.item.price}</span>
            </div>
            {buyModal.type === "room" && !buyModal.item.isSpecial && !buyModal.item.subtype && (
              <div className="mt-1 text-[11px] text-[#aaa] text-right">Aluguel: R$ {buyModal.item.rent}/12h</div>
            )}
            <div className="mt-2.5 text-[11px] text-[#666] text-center">Seu saldo: {state.dpix.toFixed(2)} DPIX</div>
            <div className="flex justify-end gap-2.5 mt-5">
              <button
                onClick={() => setBuyModal(null)}
                className="bg-transparent border border-[#555] text-[#aaa] px-4 py-1.5 rounded text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={onBuy.bind(null, buyModal.item, buyModal.type)} // Bind item and type to onBuy
                className="bg-neon-green text-black border-none px-4 py-1.5 rounded text-xs font-bold cursor-pointer hover:scale-105 transition-all"
              >
                CONFIRMAR
              </button>
            </div>
          </div>
        </div>
      )}

      {payModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[2000] flex items-center justify-center">
          <div className="bg-card-bg border border-border-color p-6 rounded-xl w-[90%] max-w-[500px] shadow-2xl">
            <div className="text-center mb-5 text-white font-bold text-lg flex flex-col items-center">
              <i className="fa-solid fa-bolt text-neon-orange mb-2 text-2xl"></i>
              Pagar Energia
            </div>

            <div className="text-center mb-5">
              <div className="text-base text-white font-bold">
                {ITEMS_DB.room.find((r) => r.id === state.inventory.find((i) => i.uid === payModal.roomUid)?.id)?.name}
              </div>
            </div>

            <div className="bg-[#111] border border-[#333] rounded-lg p-4 mb-4">
              <div className="flex justify-between mb-1.5">
                <span className="text-[#aaa]">Custo (12h):</span>
                <span className="text-neon-orange font-bold">
                  Ð{" "}
                  {
                    ITEMS_DB.room.find((r) => r.id === state.inventory.find((i) => i.uid === payModal.roomUid)?.id)
                      ?.rent
                  }
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-[#666]">Seu Saldo (DPIX):</span>
                <span className="text-neon-green">Ð {state.dpix.toFixed(2)}</span>
              </div>
            </div>
            <div className="text-[11px] text-[#888] text-center mb-5">
              Isso irá restaurar o timer de energia para 12 horas.
            </div>

            <div className="flex justify-end gap-2.5 mt-5">
              <button
                onClick={() => setPayModal(null)}
                className="bg-transparent border border-[#555] text-[#aaa] px-4 py-2 rounded text-sm font-bold cursor-pointer hover:bg-[#2a2d3a] transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={processPayRent}
                className="bg-neon-orange text-black border-none px-4 py-2 rounded text-sm font-bold cursor-pointer hover:bg-orange-400 transition-all"
              >
                PAGAR AGORA
              </button>
            </div>
          </div>
        </div>
      )}

      {payAllModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[2000] flex items-center justify-center">
          <div className="bg-card-bg border border-border-color p-6 rounded-xl w-[90%] max-w-[500px] shadow-2xl">
            <div className="text-center mb-5 text-white font-bold text-lg flex flex-col items-center">
              <i className="fa-solid fa-bolt text-neon-yellow mb-2 text-3xl animate-pulse"></i>
              Confirmar Pagamento em Massa
            </div>

            <div className="text-center mb-5">
              <div className="text-base text-white font-bold">
                Setor {payAllModal.rarity.charAt(0).toUpperCase() + payAllModal.rarity.slice(1)}
              </div>
              <div className="text-sm text-[#aaa] mt-1">
                {payAllModal.count} {payAllModal.count === 1 ? "quarto precisa" : "quartos precisam"} de energia
              </div>
            </div>

            <div className="bg-[#111] border border-[#333] rounded-lg p-4 mb-4">
              <div className="flex justify-between mb-1.5">
                <span className="text-[#aaa]">Custo Total (12h cada):</span>
                <span className="text-neon-orange font-bold text-lg">Ð {payAllModal.total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-[#666]">Seu Saldo (DPIX):</span>
                <span className={state.dpix >= payAllModal.total ? "text-neon-green" : "text-red-500"}>
                  Ð {state.dpix.toFixed(2)}
                </span>
              </div>
              {state.dpix < payAllModal.total && (
                <div className="text-xs text-red-500 mt-2 text-center">
                  Saldo insuficiente! Faltam: Ð {(payAllModal.total - state.dpix).toFixed(2)}
                </div>
              )}
            </div>
            <div className="text-[11px] text-[#888] text-center mb-5">
              Isso irá renovar a energia de todos os {payAllModal.count} quartos para 12 horas cada.
            </div>

            <div className="flex justify-end gap-2.5 mt-5">
              <button
                onClick={() => setPayAllModal(null)}
                className="bg-transparent border border-[#555] text-[#aaa] px-4 py-2 rounded text-sm font-bold cursor-pointer hover:bg-[#2a2d3a] transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={processPayAllEnergy}
                disabled={state.dpix < payAllModal.total}
                className="bg-gradient-to-r from-neon-yellow to-neon-orange text-black border-none px-6 py-2 rounded text-sm font-bold cursor-pointer hover:shadow-[0_0_20px_rgba(255,193,7,0.5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i className="fa-solid fa-bolt mr-2"></i>
                CONFIRMAR PAGAMENTO
              </button>
            </div>
          </div>
        </div>
      )}

      {installModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[2000] flex items-center justify-center">
          <div className="bg-card-bg border border-border-color p-6 rounded-xl w-[90%] max-w-[500px] shadow-2xl">
            <div className="text-lg font-bold text-white mb-4">Instalar Item</div>
            <div className="text-[#aaa] text-sm mb-2">Selecione um item do inventário:</div>
            <div className="max-h-[300px] overflow-y-auto flex flex-col gap-2.5 my-4">
              {state.inventory.filter((i) => i.type === installModal.typeNeeded && i.parentId === null).length === 0 ? (
                <div className="text-[#888] text-center py-4">
                  Sem itens disponíveis.
                  <br />
                  Vá ao Mercado comprar.
                </div>
              ) : (
                state.inventory
                  .filter((i) => i.type === installModal.typeNeeded && i.parentId === null)
                  .map((item) => {
                    const db = ITEMS_DB[item.type].find((x) => x.id === item.id)
                    const health = item.health ?? 100
                    const isBroken = health <= 0

                    return (
                      <div
                        key={item.uid}
                        className={`p-2.5 border rounded bg-[#111] flex justify-between items-center ${
                          isBroken ? "border-red-500 opacity-60" : "border-[#333] hover:border-accent"
                        } group relative`}
                        style={{ borderLeft: `3px solid ${isBroken ? "#ff5252" : getTierColor(db?.tier || "basic")}` }}
                      >
                        <div className="flex-1">
                          <div
                            className={`font-bold ${isBroken ? "text-red-500" : "text-white group-hover:text-accent"} transition-colors flex items-center gap-2`}
                          >
                            {db?.name}
                            {isBroken && (
                              <span className="text-[10px] bg-red-500/20 text-red-500 px-2 py-0.5 rounded uppercase font-bold">
                                Superaquecida
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[#888] uppercase">{db?.tier}</div>
                          {item.type === "miner" && (
                            <div className="flex items-center gap-1.5 mt-1">
                              <i
                                className={`fa-solid fa-temperature-${isBroken ? "full" : health > 50 ? "low" : health > 20 ? "half" : "high"} text-[10px]`}
                                style={{
                                  color: isBroken
                                    ? "#ff5252"
                                    : health > 50
                                      ? "#00e676"
                                      : health > 20
                                        ? "#ffea00"
                                        : "#ff5252",
                                }}
                              ></i>
                              <div className="w-20 h-1.5 bg-black/50 rounded-full overflow-hidden">
                                <div
                                  className={`h-full transition-all ${
                                    health > 50 ? "bg-green-500" : health > 20 ? "bg-yellow-500" : "bg-red-600"
                                  }`}
                                  style={{ width: `${health}%` }}
                                ></div>
                              </div>
                              <span
                                className="text-[10px] font-mono"
                                style={{
                                  color: isBroken
                                    ? "#ff5252"
                                    : health > 50
                                      ? "#00e676"
                                      : health > 20
                                        ? "#ffea00"
                                        : "#ff5252",
                                }}
                              >
                                {health.toFixed(0)}%
                              </span>
                            </div>
                          )}
                        </div>
                        {isBroken ? (
                          <button
                            onClick={() => {
                              repairMiner(item.uid)
                            }}
                            className="bg-neon-orange text-black px-3 py-1.5 rounded text-xs font-bold hover:bg-orange-400 cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <i className="fa-solid fa-wrench"></i>
                            MANUTENÇÃO (Ð 50)
                          </button>
                        ) : (
                          <button
                            onClick={() => handleInstall(item.uid)}
                            className="border border-neon-green text-neon-green px-3 py-1 rounded text-xs font-bold hover:bg-neon-green hover:text-black cursor-pointer"
                          >
                            INSTALAR
                          </button>
                        )}
                      </div>
                    )
                  })
              )}
            </div>
            <div className="text-right">
              <button
                onClick={() => setInstallModal(null)}
                className="bg-transparent border border-[#555] text-[#aaa] px-4 py-1.5 rounded text-xs font-bold cursor-pointer hover:bg-white hover:text-black"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BANK MODAL */}
      {bankModal && (
        <BankModal
          type={bankModal.type}
          balance={state.wallet}
          createdAt={state.createdAt}
          onClose={() => setBankModal(null)}
          onConfirm={handleBankAction}
        />
      )}

      {/* BOX ANIMATION */}
      {boxAnim && <BoxOpeningModal wonItem={boxAnim.wonItem} tier={boxAnim.tier} onClose={() => setBoxAnim(null)} />}

      {demolishModal?.show && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-red-500/30 rounded-lg p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <i className="fas fa-exclamation-triangle text-red-500 text-2xl"></i>
              <h3 className="text-xl font-bold text-red-500">Confirmar Demolição</h3>
            </div>

            <div className="space-y-4 mb-6">
              <p className="text-gray-300">Você está prestes a demolir o quarto:</p>
              <p className="text-center text-xl font-bold text-white bg-gray-800 p-3 rounded border border-gray-700">
                {demolishModal.roomName}
              </p>
              <div className="bg-green-500/10 border border-green-500/30 rounded p-3">
                <p className="text-green-400 text-center">
                  Você receberá: <span className="font-bold text-lg">Ð 8.00</span>
                </p>
              </div>
              <p className="text-red-400 text-sm text-center font-semibold">⚠ Esta ação é irreversível!</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setDemolishModal(null)}
                className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded font-semibold transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDemolish}
                className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded font-semibold transition-colors"
              >
                Demolir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App

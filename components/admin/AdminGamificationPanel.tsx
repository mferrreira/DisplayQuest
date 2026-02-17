"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Trash2, Plus } from "lucide-react"

type ChestDrop = {
  id: number
  chestId: string
  itemKey: string
  itemName: string
  rarity: string
  weight: number
  qtyMin: number
  qtyMax: number
  active: boolean
}

type QuestDefinition = {
  id: number
  code: string
  title: string
  description?: string | null
  questType: string
  scope: string
  minElo?: string | null
  minLevel?: number | null
  requirements?: { metric?: string; target?: number } | null
  rewards?: { xp?: number; coins?: number; trophies?: number } | null
  active: boolean
}

type StoryArcDefinition = {
  id: number
  code: string
  title: string
  description?: string | null
  chapter: number
  active: boolean
  startsAt?: string | null
  endsAt?: string | null
  metadata?: {
    totalSteps?: number
    minLevel?: number
    minElo?: string
    dependsOnArcCodes?: string[]
  } | null
}

type Chest = {
  id: string
  name: string
  description?: string | null
  rarity: string
  priceCoins: number
  minDrops: number
  maxDrops: number
  active: boolean
  drops: ChestDrop[]
}

const rarityOptions = ["common", "uncommon", "rare", "epic", "legendary"]

export function AdminGamificationPanel() {
  const [chests, setChests] = useState<Chest[]>([])
  const [quests, setQuests] = useState<QuestDefinition[]>([])
  const [storyArcs, setStoryArcs] = useState<StoryArcDefinition[]>([])
  const [loading, setLoading] = useState(false)
  const [newChest, setNewChest] = useState({
    id: "",
    name: "",
    description: "",
    rarity: "common",
    priceCoins: 100,
    minDrops: 1,
    maxDrops: 2,
  })
  const [newDropByChest, setNewDropByChest] = useState<Record<string, Omit<ChestDrop, "id" | "chestId">>>({})
  const [newQuest, setNewQuest] = useState({
    code: "",
    title: "",
    description: "",
    questType: "DAILY",
    scope: "PROJECT",
    metric: "TASKS_COMPLETED",
    target: 1,
    rewardXp: 50,
    rewardCoins: 20,
    rewardTrophies: 0,
    minLevel: 1,
  })
  const [newStoryArc, setNewStoryArc] = useState({
    code: "",
    title: "",
    description: "",
    chapter: 1,
    minLevel: 1,
    minElo: "",
    dependsOnArcCodes: [] as string[],
    startsAt: "",
    endsAt: "",
  })

  const loadChests = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/gamification/admin/chests")
      const payload = await response.json()
      setChests(Array.isArray(payload?.chests) ? payload.chests : [])
    } finally {
      setLoading(false)
    }
  }

  const loadQuests = async () => {
    try {
      const response = await fetch("/api/gamification/admin/quests")
      const payload = await response.json()
      setQuests(Array.isArray(payload?.quests) ? payload.quests : [])
    } catch {
      setQuests([])
    }
  }

  const loadStoryArcs = async () => {
    try {
      const response = await fetch("/api/gamification/admin/story-arcs")
      const payload = await response.json()
      setStoryArcs(Array.isArray(payload?.storyArcs) ? payload.storyArcs : [])
    } catch {
      setStoryArcs([])
    }
  }

  useEffect(() => {
    void loadChests()
    void loadQuests()
    void loadStoryArcs()
  }, [])

  const createChest = async () => {
    await fetch("/api/gamification/admin/chests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newChest),
    })
    setNewChest({
      id: "",
      name: "",
      description: "",
      rarity: "common",
      priceCoins: 100,
      minDrops: 1,
      maxDrops: 2,
    })
    await loadChests()
  }

  const updateChestField = async (chestId: string, field: string, value: string | number | boolean) => {
    await fetch(`/api/gamification/admin/chests/${chestId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    })
    await loadChests()
  }

  const createQuest = async () => {
    if (!newQuest.code || !newQuest.title) return
    await fetch("/api/gamification/admin/quests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: newQuest.code,
        title: newQuest.title,
        description: newQuest.description,
        questType: newQuest.questType,
        scope: newQuest.scope,
        minLevel: newQuest.minLevel,
        requirements: { metric: newQuest.metric, target: newQuest.target },
        rewards: { xp: newQuest.rewardXp, coins: newQuest.rewardCoins, trophies: newQuest.rewardTrophies },
        active: true,
      }),
    })
    setNewQuest({
      code: "",
      title: "",
      description: "",
      questType: "DAILY",
      scope: "PROJECT",
      metric: "TASKS_COMPLETED",
      target: 1,
      rewardXp: 50,
      rewardCoins: 20,
      rewardTrophies: 0,
      minLevel: 1,
    })
    await loadQuests()
  }

  const updateQuestField = async (questId: number, field: string, value: unknown) => {
    await fetch(`/api/gamification/admin/quests/${questId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    })
    await loadQuests()
  }

  const deleteQuest = async (questId: number) => {
    await fetch(`/api/gamification/admin/quests/${questId}`, { method: "DELETE" })
    await loadQuests()
  }

  const createStoryArc = async () => {
    if (!newStoryArc.code || !newStoryArc.title) return
    await fetch("/api/gamification/admin/story-arcs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: newStoryArc.code,
        title: newStoryArc.title,
        description: newStoryArc.description || null,
        chapter: newStoryArc.chapter,
        startsAt: newStoryArc.startsAt ? new Date(newStoryArc.startsAt).toISOString() : null,
        endsAt: newStoryArc.endsAt ? new Date(newStoryArc.endsAt).toISOString() : null,
        metadata: {
          minLevel: newStoryArc.minLevel,
          minElo: newStoryArc.minElo || null,
          dependsOnArcCodes: newStoryArc.dependsOnArcCodes,
        },
      }),
    })
    setNewStoryArc({
      code: "",
      title: "",
      description: "",
      chapter: 1,
      minLevel: 1,
      minElo: "",
      dependsOnArcCodes: [],
      startsAt: "",
      endsAt: "",
    })
    await loadStoryArcs()
  }

  const updateStoryArc = async (arcId: number, payload: Record<string, unknown>) => {
    await fetch(`/api/gamification/admin/story-arcs/${arcId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    await loadStoryArcs()
  }

  const deleteStoryArc = async (arcId: number) => {
    await fetch(`/api/gamification/admin/story-arcs/${arcId}`, { method: "DELETE" })
    await loadStoryArcs()
  }

  const toDatetimeLocal = (value?: string | null) => {
    if (!value) return ""
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ""
    const pad = (part: number) => String(part).padStart(2, "0")
    const year = date.getFullYear()
    const month = pad(date.getMonth() + 1)
    const day = pad(date.getDate())
    const hours = pad(date.getHours())
    const minutes = pad(date.getMinutes())
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }

  const toggleNewArcDependency = (code: string) => {
    setNewStoryArc((prev) => {
      const exists = prev.dependsOnArcCodes.includes(code)
      return {
        ...prev,
        dependsOnArcCodes: exists
          ? prev.dependsOnArcCodes.filter((item) => item !== code)
          : [...prev.dependsOnArcCodes, code],
      }
    })
  }

  const saveArcDependencies = async (arc: StoryArcDefinition, dependsOnArcCodes: string[]) => {
    await updateStoryArc(arc.id, {
      metadata: {
        dependsOnArcCodes,
      },
    })
  }

  const deleteChest = async (chestId: string) => {
    await fetch(`/api/gamification/admin/chests/${chestId}`, { method: "DELETE" })
    await loadChests()
  }

  const createDrop = async (chestId: string) => {
    const draft = newDropByChest[chestId]
    if (!draft || !draft.itemKey || !draft.itemName) return

    await fetch(`/api/gamification/admin/chests/${chestId}/drops`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    })
    setNewDropByChest((prev) => {
      const next = { ...prev }
      delete next[chestId]
      return next
    })
    await loadChests()
  }

  const updateDropField = async (dropId: number, field: string, value: string | number | boolean) => {
    await fetch(`/api/gamification/admin/drops/${dropId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    })
    await loadChests()
  }

  const deleteDrop = async (dropId: number) => {
    await fetch(`/api/gamification/admin/drops/${dropId}`, { method: "DELETE" })
    await loadChests()
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Configuração de Baús</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-7">
          <Input placeholder="id-do-bau" value={newChest.id} onChange={(e) => setNewChest((s) => ({ ...s, id: e.target.value }))} />
          <Input placeholder="Nome" value={newChest.name} onChange={(e) => setNewChest((s) => ({ ...s, name: e.target.value }))} />
          <Input placeholder="Descrição" value={newChest.description} onChange={(e) => setNewChest((s) => ({ ...s, description: e.target.value }))} />
          <Select value={newChest.rarity} onValueChange={(value) => setNewChest((s) => ({ ...s, rarity: value }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{rarityOptions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="number" min="1" value={newChest.priceCoins} onChange={(e) => setNewChest((s) => ({ ...s, priceCoins: Number(e.target.value) || 1 }))} />
          <Input type="number" min="1" value={newChest.minDrops} onChange={(e) => setNewChest((s) => ({ ...s, minDrops: Number(e.target.value) || 1 }))} />
          <div className="flex items-center gap-2">
            <Input type="number" min="1" value={newChest.maxDrops} onChange={(e) => setNewChest((s) => ({ ...s, maxDrops: Number(e.target.value) || 1 }))} />
            <Button onClick={() => void createChest()} disabled={!newChest.id || !newChest.name}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card><CardContent className="pt-6">Carregando baús...</CardContent></Card>
      ) : (
        chests.map((chest) => (
          <Card key={chest.id}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  {chest.name}
                  <Badge variant="outline">{chest.rarity}</Badge>
                </CardTitle>
                <Button variant="outline" size="sm" onClick={() => void deleteChest(chest.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-6">
                <div>
                  <Label>Preço</Label>
                  <Input type="number" defaultValue={chest.priceCoins} onBlur={(e) => void updateChestField(chest.id, "priceCoins", Number(e.target.value) || chest.priceCoins)} />
                </div>
                <div>
                  <Label>Min Drops</Label>
                  <Input type="number" defaultValue={chest.minDrops} onBlur={(e) => void updateChestField(chest.id, "minDrops", Number(e.target.value) || chest.minDrops)} />
                </div>
                <div>
                  <Label>Max Drops</Label>
                  <Input type="number" defaultValue={chest.maxDrops} onBlur={(e) => void updateChestField(chest.id, "maxDrops", Number(e.target.value) || chest.maxDrops)} />
                </div>
                <div>
                  <Label>Raridade</Label>
                  <Select value={chest.rarity} onValueChange={(value) => void updateChestField(chest.id, "rarity", value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{rarityOptions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Label>Nome</Label>
                  <Input defaultValue={chest.name} onBlur={(e) => void updateChestField(chest.id, "name", e.target.value)} />
                </div>
              </div>

              <div className="rounded-md border p-3 space-y-3">
                <p className="text-sm font-semibold">Drops</p>
                {chest.drops.map((drop) => (
                  <div key={drop.id} className="grid gap-2 md:grid-cols-8">
                    <Input defaultValue={drop.itemKey} onBlur={(e) => void updateDropField(drop.id, "itemKey", e.target.value)} />
                    <Input defaultValue={drop.itemName} onBlur={(e) => void updateDropField(drop.id, "itemName", e.target.value)} />
                    <Select value={drop.rarity} onValueChange={(value) => void updateDropField(drop.id, "rarity", value)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{rarityOptions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input type="number" defaultValue={drop.weight} onBlur={(e) => void updateDropField(drop.id, "weight", Number(e.target.value) || drop.weight)} />
                    <Input type="number" defaultValue={drop.qtyMin} onBlur={(e) => void updateDropField(drop.id, "qtyMin", Number(e.target.value) || drop.qtyMin)} />
                    <Input type="number" defaultValue={drop.qtyMax} onBlur={(e) => void updateDropField(drop.id, "qtyMax", Number(e.target.value) || drop.qtyMax)} />
                    <Select value={drop.active ? "true" : "false"} onValueChange={(value) => void updateDropField(drop.id, "active", value === "true")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Ativo</SelectItem>
                        <SelectItem value="false">Inativo</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={() => void deleteDrop(drop.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                <div className="grid gap-2 md:grid-cols-8">
                  <Input placeholder="itemKey" value={newDropByChest[chest.id]?.itemKey || ""} onChange={(e) => setNewDropByChest((prev) => ({ ...prev, [chest.id]: { ...(prev[chest.id] || { itemName: "", rarity: "common", weight: 1, qtyMin: 1, qtyMax: 1, active: true }), itemKey: e.target.value } }))} />
                  <Input placeholder="itemName" value={newDropByChest[chest.id]?.itemName || ""} onChange={(e) => setNewDropByChest((prev) => ({ ...prev, [chest.id]: { ...(prev[chest.id] || { itemKey: "", rarity: "common", weight: 1, qtyMin: 1, qtyMax: 1, active: true }), itemName: e.target.value } }))} />
                  <Select value={newDropByChest[chest.id]?.rarity || "common"} onValueChange={(value) => setNewDropByChest((prev) => ({ ...prev, [chest.id]: { ...(prev[chest.id] || { itemKey: "", itemName: "", weight: 1, qtyMin: 1, qtyMax: 1, active: true }), rarity: value } }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{rarityOptions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input type="number" placeholder="peso" value={newDropByChest[chest.id]?.weight || 1} onChange={(e) => setNewDropByChest((prev) => ({ ...prev, [chest.id]: { ...(prev[chest.id] || { itemKey: "", itemName: "", rarity: "common", qtyMin: 1, qtyMax: 1, active: true }), weight: Number(e.target.value) || 1 } }))} />
                  <Input type="number" placeholder="min" value={newDropByChest[chest.id]?.qtyMin || 1} onChange={(e) => setNewDropByChest((prev) => ({ ...prev, [chest.id]: { ...(prev[chest.id] || { itemKey: "", itemName: "", rarity: "common", weight: 1, qtyMax: 1, active: true }), qtyMin: Number(e.target.value) || 1 } }))} />
                  <Input type="number" placeholder="max" value={newDropByChest[chest.id]?.qtyMax || 1} onChange={(e) => setNewDropByChest((prev) => ({ ...prev, [chest.id]: { ...(prev[chest.id] || { itemKey: "", itemName: "", rarity: "common", weight: 1, qtyMin: 1, active: true }), qtyMax: Number(e.target.value) || 1 } }))} />
                  <Select value={newDropByChest[chest.id]?.active ? "true" : "false"} onValueChange={(value) => setNewDropByChest((prev) => ({ ...prev, [chest.id]: { ...(prev[chest.id] || { itemKey: "", itemName: "", rarity: "common", weight: 1, qtyMin: 1, qtyMax: 1 }), active: value === "true" } }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Ativo</SelectItem>
                      <SelectItem value="false">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={() => void createDrop(chest.id)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}

      <Card>
        <CardHeader>
          <CardTitle>Configuração de Quests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-6">
            <Input placeholder="code" value={newQuest.code} onChange={(e) => setNewQuest((s) => ({ ...s, code: e.target.value }))} />
            <Input placeholder="Título" value={newQuest.title} onChange={(e) => setNewQuest((s) => ({ ...s, title: e.target.value }))} />
            <Input placeholder="Descrição" value={newQuest.description} onChange={(e) => setNewQuest((s) => ({ ...s, description: e.target.value }))} />
            <Select value={newQuest.questType} onValueChange={(value) => setNewQuest((s) => ({ ...s, questType: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DAILY">DAILY</SelectItem>
                <SelectItem value="WEEKLY">WEEKLY</SelectItem>
                <SelectItem value="EVENT">EVENT</SelectItem>
                <SelectItem value="STORY">STORY</SelectItem>
              </SelectContent>
            </Select>
            <Select value={newQuest.scope} onValueChange={(value) => setNewQuest((s) => ({ ...s, scope: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PROJECT">PROJECT</SelectItem>
                <SelectItem value="GLOBAL">GLOBAL</SelectItem>
                <SelectItem value="CROSS_PROJECT">CROSS_PROJECT</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => void createQuest()} disabled={!newQuest.code || !newQuest.title}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid gap-2 md:grid-cols-7">
            <Select value={newQuest.metric} onValueChange={(value) => setNewQuest((s) => ({ ...s, metric: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TASKS_COMPLETED">TASKS_COMPLETED</SelectItem>
                <SelectItem value="WORK_SESSIONS_COMPLETED">WORK_SESSIONS_COMPLETED</SelectItem>
                <SelectItem value="WORK_HOURS">WORK_HOURS</SelectItem>
                <SelectItem value="POINTS">POINTS</SelectItem>
              </SelectContent>
            </Select>
            <Input type="number" min="1" placeholder="target" value={newQuest.target} onChange={(e) => setNewQuest((s) => ({ ...s, target: Number(e.target.value) || 1 }))} />
            <Input type="number" min="0" placeholder="XP" value={newQuest.rewardXp} onChange={(e) => setNewQuest((s) => ({ ...s, rewardXp: Number(e.target.value) || 0 }))} />
            <Input type="number" min="0" placeholder="Coins" value={newQuest.rewardCoins} onChange={(e) => setNewQuest((s) => ({ ...s, rewardCoins: Number(e.target.value) || 0 }))} />
            <Input type="number" min="0" placeholder="Trophies" value={newQuest.rewardTrophies} onChange={(e) => setNewQuest((s) => ({ ...s, rewardTrophies: Number(e.target.value) || 0 }))} />
            <Input type="number" min="1" placeholder="Min Level" value={newQuest.minLevel} onChange={(e) => setNewQuest((s) => ({ ...s, minLevel: Number(e.target.value) || 1 }))} />
            <div />
          </div>

          <div className="space-y-2">
            {quests.map((quest) => (
              <div key={quest.id} className="grid gap-2 md:grid-cols-10 rounded-md border p-2">
                <Input defaultValue={quest.code} onBlur={(e) => void updateQuestField(quest.id, "code", e.target.value)} />
                <Input defaultValue={quest.title} onBlur={(e) => void updateQuestField(quest.id, "title", e.target.value)} />
                <Input defaultValue={quest.questType} onBlur={(e) => void updateQuestField(quest.id, "questType", e.target.value)} />
                <Input defaultValue={quest.scope} onBlur={(e) => void updateQuestField(quest.id, "scope", e.target.value)} />
                <Input type="number" defaultValue={quest.minLevel ?? 1} onBlur={(e) => void updateQuestField(quest.id, "minLevel", Number(e.target.value) || 1)} />
                <Input type="number" defaultValue={quest.requirements?.target ?? 1} onBlur={(e) => void updateQuestField(quest.id, "requirements", { ...(quest.requirements || {}), target: Number(e.target.value) || 1 })} />
                <Input type="number" defaultValue={quest.rewards?.xp ?? 0} onBlur={(e) => void updateQuestField(quest.id, "rewards", { ...(quest.rewards || {}), xp: Number(e.target.value) || 0 })} />
                <Input type="number" defaultValue={quest.rewards?.coins ?? 0} onBlur={(e) => void updateQuestField(quest.id, "rewards", { ...(quest.rewards || {}), coins: Number(e.target.value) || 0 })} />
                <Select value={quest.active ? "true" : "false"} onValueChange={(value) => void updateQuestField(quest.id, "active", value === "true")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Ativa</SelectItem>
                    <SelectItem value="false">Inativa</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => void deleteQuest(quest.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configuração de Arcos Narrativos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-8">
            <Input placeholder="code" value={newStoryArc.code} onChange={(e) => setNewStoryArc((s) => ({ ...s, code: e.target.value }))} />
            <Input placeholder="Título" value={newStoryArc.title} onChange={(e) => setNewStoryArc((s) => ({ ...s, title: e.target.value }))} />
            <Input placeholder="Descrição" value={newStoryArc.description} onChange={(e) => setNewStoryArc((s) => ({ ...s, description: e.target.value }))} />
            <Input type="number" min="1" placeholder="Capítulo" value={newStoryArc.chapter} onChange={(e) => setNewStoryArc((s) => ({ ...s, chapter: Number(e.target.value) || 1 }))} />
            <Input type="number" min="1" placeholder="Min Level" value={newStoryArc.minLevel} onChange={(e) => setNewStoryArc((s) => ({ ...s, minLevel: Number(e.target.value) || 1 }))} />
            <Input placeholder="Min Elo (opcional)" value={newStoryArc.minElo} onChange={(e) => setNewStoryArc((s) => ({ ...s, minElo: e.target.value }))} />
            <div className="md:col-span-2 rounded-md border px-3 py-2">
              <p className="mb-2 text-xs text-muted-foreground">Dependências</p>
              <div className="flex flex-wrap gap-2">
                {storyArcs
                  .map((arc) => arc.code)
                  .filter((code) => code !== newStoryArc.code.trim().toUpperCase())
                  .map((code) => {
                    const selected = newStoryArc.dependsOnArcCodes.includes(code)
                    return (
                      <button
                        key={`new-arc-dep-${code}`}
                        type="button"
                        onClick={() => toggleNewArcDependency(code)}
                        className={`rounded-full border px-2 py-1 text-xs ${selected ? "border-blue-500 bg-blue-500/10 text-blue-700" : "border-muted-foreground/30 text-muted-foreground"}`}
                      >
                        {code}
                      </button>
                    )
                  })}
              </div>
            </div>
            <Button onClick={() => void createStoryArc()} disabled={!newStoryArc.code || !newStoryArc.title}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            <Input type="datetime-local" value={newStoryArc.startsAt} onChange={(e) => setNewStoryArc((s) => ({ ...s, startsAt: e.target.value }))} />
            <Input type="datetime-local" value={newStoryArc.endsAt} onChange={(e) => setNewStoryArc((s) => ({ ...s, endsAt: e.target.value }))} />
          </div>

          <div className="space-y-2">
            {storyArcs.map((arc) => (
              <div key={arc.id} className="rounded-md border p-3 space-y-3">
                <div className="grid gap-2 md:grid-cols-11">
                  <Input defaultValue={arc.code} onBlur={(e) => void updateStoryArc(arc.id, { code: e.target.value })} />
                  <Input defaultValue={arc.title} onBlur={(e) => void updateStoryArc(arc.id, { title: e.target.value })} />
                  <Input defaultValue={arc.description || ""} onBlur={(e) => void updateStoryArc(arc.id, { description: e.target.value })} />
                  <Input type="number" defaultValue={arc.chapter} onBlur={(e) => void updateStoryArc(arc.id, { chapter: Number(e.target.value) || arc.chapter })} />
                  <Input type="number" defaultValue={arc.metadata?.minLevel ?? 1} onBlur={(e) => void updateStoryArc(arc.id, { metadata: { minLevel: Number(e.target.value) || 1 } })} />
                  <Input defaultValue={arc.metadata?.minElo || ""} onBlur={(e) => void updateStoryArc(arc.id, { metadata: { minElo: e.target.value || null } })} />
                  <Input
                    type="datetime-local"
                    defaultValue={toDatetimeLocal(arc.startsAt)}
                    onBlur={(e) => void updateStoryArc(arc.id, { startsAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
                  />
                  <Input
                    type="datetime-local"
                    defaultValue={toDatetimeLocal(arc.endsAt)}
                    onBlur={(e) => void updateStoryArc(arc.id, { endsAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
                  />
                  <Select value={arc.active ? "true" : "false"} onValueChange={(value) => void updateStoryArc(arc.id, { active: value === "true" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Ativo</SelectItem>
                      <SelectItem value="false">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={() => void deleteStoryArc(arc.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="rounded-md border px-3 py-2">
                  <p className="mb-2 text-xs text-muted-foreground">Dependências ({arc.code})</p>
                  <div className="flex flex-wrap gap-2">
                    {storyArcs
                      .map((candidate) => candidate.code)
                      .filter((code) => code !== arc.code)
                      .map((code) => {
                        const selected = (arc.metadata?.dependsOnArcCodes || []).includes(code)
                        return (
                          <button
                            key={`arc-${arc.id}-dep-${code}`}
                            type="button"
                            onClick={() => {
                              const current = arc.metadata?.dependsOnArcCodes || []
                              const next = selected ? current.filter((item) => item !== code) : [...current, code]
                              void saveArcDependencies(arc, next)
                            }}
                            className={`rounded-full border px-2 py-1 text-xs ${selected ? "border-blue-500 bg-blue-500/10 text-blue-700" : "border-muted-foreground/30 text-muted-foreground"}`}
                          >
                            {code}
                          </button>
                        )
                      })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Sparkles,
  MoreHorizontal,
  Calendar as CalendarIcon,
} from "lucide-react";
import {
  DndContext,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { useStore, store } from "@/lib/store";
import type { Appointment, Practitioner, Customer, Treatment } from "@/lib/types";
import {
  HOUR_START,
  HOUR_END,
  SLOT_MIN,
  SLOT_PX,
  TOTAL_SLOTS,
  startOfWeek,
  addDays,
  sameDay,
  fmtTime,
  fmtTimeRange,
  fmtDateShort,
  fmtWeekday,
  isClinicOpen,
  appointmentsOnDate,
  topOffsetPx,
  heightPx,
  practitionerById,
  slotIdFor,
  parseSlotId,
} from "@/lib/calendar-utils";
import { TREATMENT_DURATIONS, TREATMENT_PRICES } from "@/lib/seed";
import {
  AppointmentSlideOver,
  RescheduleModal,
  CancelModal,
  NewAppointmentModal,
} from "@/components/calendar/AppointmentDialogs";

type ViewMode = "day" | "week" | "agenda";

export default function CalendarPage() {
  const customers = useStore((s) => s.customers);
  const practitioners = useStore((s) => s.practitioners);
  const appointments = useStore((s) => s.appointments);

  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "week";
    return (localStorage.getItem("lumiere.cal.view") as ViewMode) || "week";
  });
  useEffect(() => {
    localStorage.setItem("lumiere.cal.view", view);
  }, [view]);

  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [selectedPracs, setSelectedPracs] = useState<Set<string>>(
    new Set(practitioners.map((p) => p.id)),
  );
  useEffect(() => {
    if (selectedPracs.size === 0 && practitioners.length > 0) {
      setSelectedPracs(new Set(practitioners.map((p) => p.id)));
    }
  }, [practitioners]);

  const [pauseLive, setPauseLive] = useState(false);
  const [syncedAt, setSyncedAt] = useState<Date>(new Date(Date.now() - 2 * 60000));
  const [syncing, setSyncing] = useState(false);

  const [selectedAptId, setSelectedAptId] = useState<string | null>(null);
  const [reschedAptId, setReschedAptId] = useState<string | null>(null);
  const [reschedNewStart, setReschedNewStart] = useState<Date | null>(null);
  const [cancelAptId, setCancelAptId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newDefaultStart, setNewDefaultStart] = useState<Date | null>(null);
  const [aiPulseId, setAiPulseId] = useState<string | null>(null);

  const customerMap = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);

  const visibleAppointments = useMemo(
    () =>
      appointments.filter((a) => selectedPracs.has(a.practitioner_id) && a.status !== "cancelled"),
    [appointments, selectedPracs],
  );

  const days: Date[] = useMemo(() => {
    if (view === "day") return [anchor];
    if (view === "week")
      return Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i));
    return Array.from({ length: 14 }, (_, i) => addDays(startOfWeek(anchor), i));
  }, [anchor, view]);

  const dateRangeLabel = useMemo(() => {
    if (view === "day")
      return anchor.toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    const start = days[0];
    const end = days[days.length - 1];
    const sameMonth = start.getMonth() === end.getMonth();
    return sameMonth
      ? `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.getDate()}, ${end.getFullYear()}`
      : `${fmtDateShort(start)} – ${fmtDateShort(end)}, ${end.getFullYear()}`;
  }, [days, view, anchor]);

  const goPrev = () => setAnchor((d) => addDays(d, view === "day" ? -1 : -7));
  const goNext = () => setAnchor((d) => addDays(d, view === "day" ? 1 : 7));
  const goToday = () => setAnchor(new Date());

  const triggerSync = () => {
    setSyncing(true);
    setTimeout(() => {
      setSyncing(false);
      setSyncedAt(new Date());
    }, 900);
  };
  const syncedAgo = useRelativeTime(syncedAt);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key.toLowerCase() === "t") {
        e.preventDefault();
        goToday();
      } else if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        setNewDefaultStart(null);
        setNewOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view]);

  const aiTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (pauseLive) return;
    const schedule = () => {
      const delay = 45000 + Math.random() * 45000;
      aiTimerRef.current = window.setTimeout(() => {
        triggerAiBooking(customers, practitioners, store.get().appointments, (id) => {
          setAiPulseId(id);
          setTimeout(() => setAiPulseId(null), 2400);
        });
        schedule();
      }, delay);
    };
    schedule();
    return () => {
      if (aiTimerRef.current) window.clearTimeout(aiTimerRef.current);
    };
  }, [pauseLive, customers, practitioners]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const handleDragEnd = (e: DragEndEvent) => {
    const aptId = String(e.active.id);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId) return;
    const slot = parseSlotId(overId);
    const apt = appointments.find((a) => a.id === aptId);
    if (!slot || !apt) return;
    if (slot.date.getTime() === new Date(apt.start_time).getTime()) return;
    setReschedAptId(aptId);
    setReschedNewStart(slot.date);
  };

  const selectedApt = appointments.find((a) => a.id === selectedAptId) || null;
  const reschedApt = appointments.find((a) => a.id === reschedAptId) || null;
  const cancelApt = appointments.find((a) => a.id === cancelAptId) || null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Real-time bookings from clients and your AI assistant.
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap rounded-lg border bg-card px-3 py-2.5">
        <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
          <TabsList className="h-8">
            <TabsTrigger value="day" className="text-xs px-3">
              Day
            </TabsTrigger>
            <TabsTrigger value="week" className="text-xs px-3">
              Week
            </TabsTrigger>
            <TabsTrigger value="agenda" className="text-xs px-3">
              Agenda
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={goPrev} className="h-8 w-8 p-0">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday} className="h-8 px-3">
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={goNext} className="h-8 w-8 p-0">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="text-sm font-medium px-1">{dateRangeLabel}</div>

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                {selectedPracs.size === practitioners.length
                  ? "All practitioners"
                  : `${selectedPracs.size} selected`}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel>Practitioners</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {practitioners.map((p) => (
                <DropdownMenuCheckboxItem
                  key={p.id}
                  checked={selectedPracs.has(p.id)}
                  onCheckedChange={(chk) => {
                    const s = new Set(selectedPracs);
                    if (chk) s.add(p.id);
                    else s.delete(p.id);
                    if (s.size === 0) return;
                    setSelectedPracs(s);
                  }}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: p.color }}
                    />
                    {p.name}
                  </span>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border bg-background text-xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                  <span className="text-muted-foreground">Synced with Google Calendar</span>
                  <button
                    onClick={triggerSync}
                    className="text-muted-foreground hover:text-foreground ml-1"
                  >
                    <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
                  </button>
                </div>
              </TooltipTrigger>
              <TooltipContent>Last synced {syncedAgo}</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="inline-flex items-center gap-2">
            <Switch
              id="pause-live"
              checked={!pauseLive}
              onCheckedChange={(v) => setPauseLive(!v)}
            />
            <Label htmlFor="pause-live" className="text-xs text-muted-foreground cursor-pointer">
              Live updates
            </Label>
          </div>

          <Button
            size="sm"
            className="h-8"
            onClick={() => {
              setNewDefaultStart(null);
              setNewOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> New appointment
          </Button>
        </div>
      </div>

      {view === "agenda" ? (
        <AgendaView
          days={days}
          appointments={visibleAppointments}
          customerMap={customerMap}
          practitioners={practitioners}
          onSelect={(id) => setSelectedAptId(id)}
          onReschedule={(id) => {
            setReschedAptId(id);
            setReschedNewStart(new Date(appointments.find((a) => a.id === id)!.start_time));
          }}
          onCancel={(id) => setCancelAptId(id)}
        />
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <CalendarGrid
            days={days}
            appointments={visibleAppointments}
            customerMap={customerMap}
            practitioners={practitioners}
            aiPulseId={aiPulseId}
            onSelect={(id) => setSelectedAptId(id)}
            onSlotClick={(d) => {
              setNewDefaultStart(d);
              setNewOpen(true);
            }}
            view={view}
          />
        </DndContext>
      )}

      <AppointmentSlideOver
        appointment={selectedApt}
        customer={selectedApt ? customerMap.get(selectedApt.customer_id) || null : null}
        practitioners={practitioners}
        onClose={() => setSelectedAptId(null)}
        onReschedule={(a) => {
          setSelectedAptId(null);
          setReschedAptId(a.id);
          setReschedNewStart(new Date(a.start_time));
        }}
        onCancel={(a) => {
          setSelectedAptId(null);
          setCancelAptId(a.id);
        }}
      />
      <RescheduleModal
        appointment={reschedApt}
        customer={reschedApt ? customerMap.get(reschedApt.customer_id) || null : null}
        newStart={reschedNewStart}
        onClose={() => {
          setReschedAptId(null);
          setReschedNewStart(null);
        }}
        onConfirmed={() => {
          setReschedAptId(null);
          setReschedNewStart(null);
        }}
      />
      <CancelModal
        appointment={cancelApt}
        customer={cancelApt ? customerMap.get(cancelApt.customer_id) || null : null}
        onClose={() => setCancelAptId(null)}
        onConfirmed={() => setCancelAptId(null)}
      />
      <NewAppointmentModal
        open={newOpen}
        onClose={() => {
          setNewOpen(false);
          setNewDefaultStart(null);
        }}
        customers={customers}
        practitioners={practitioners}
        defaultStart={newDefaultStart}
      />
    </div>
  );
}

// ============= Calendar grid =============

function CalendarGrid({
  days,
  appointments,
  customerMap,
  practitioners,
  aiPulseId,
  onSelect,
  onSlotClick,
  view,
}: {
  days: Date[];
  appointments: Appointment[];
  customerMap: Map<string, Customer>;
  practitioners: Practitioner[];
  aiPulseId: string | null;
  onSelect: (id: string) => void;
  onSlotClick: (d: Date) => void;
  view: ViewMode;
}) {
  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
  const gridHeight = TOTAL_SLOTS * SLOT_PX;
  const dayApts = view === "day" ? appointmentsOnDate(appointments, days[0]) : [];
  const dayRevenue = dayApts.reduce((sum, a) => sum + a.price, 0);

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {view === "day" && (
        <div className="px-4 py-2.5 border-b flex items-center justify-between bg-muted/20 text-xs">
          <span className="text-muted-foreground">{dayApts.length} appointments</span>
          <span className="text-muted-foreground">
            Projected revenue:{" "}
            <span className="text-foreground font-medium">${dayRevenue.toLocaleString()}</span>
          </span>
        </div>
      )}
      <div
        className="grid border-b sticky top-14 bg-card z-10"
        style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0,1fr))` }}
      >
        <div></div>
        {days.map((d) => {
          const today = sameDay(d, new Date());
          return (
            <div
              key={d.toISOString()}
              className={`px-2 py-2 text-center border-l ${today ? "bg-primary/5" : ""}`}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {fmtWeekday(d)}
              </div>
              <div className={`text-sm font-semibold mt-0.5 ${today ? "text-primary" : ""}`}>
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>
      <div
        className="grid relative"
        style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0,1fr))` }}
      >
        <div className="relative" style={{ height: gridHeight }}>
          {hours.map((h, i) => (
            <div
              key={h}
              className="absolute left-0 right-0 text-[10px] text-muted-foreground text-right pr-2 -mt-1.5"
              style={{ top: i * slotsPerHourPx() }}
            >
              {fmtHour(h)}
            </div>
          ))}
        </div>
        {days.map((day) => (
          <DayColumn
            key={day.toISOString()}
            day={day}
            gridHeight={gridHeight}
            hours={hours}
            appointments={appointmentsOnDate(appointments, day)}
            customerMap={customerMap}
            practitioners={practitioners}
            aiPulseId={aiPulseId}
            onSelect={onSelect}
            onSlotClick={onSlotClick}
          />
        ))}
      </div>
    </div>
  );
}

function fmtHour(h: number) {
  const ampm = h >= 12 ? "pm" : "am";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh} ${ampm}`;
}
function slotsPerHourPx() {
  return SLOT_PX * (60 / SLOT_MIN);
}

function DayColumn({
  day,
  gridHeight,
  hours,
  appointments,
  customerMap,
  practitioners,
  aiPulseId,
  onSelect,
  onSlotClick,
}: {
  day: Date;
  gridHeight: number;
  hours: number[];
  appointments: Appointment[];
  customerMap: Map<string, Customer>;
  practitioners: Practitioner[];
  aiPulseId: string | null;
  onSelect: (id: string) => void;
  onSlotClick: (d: Date) => void;
}) {
  const today = sameDay(day, new Date());
  const dow = day.getDay();
  const closedDay = dow === 0 || dow === 1;

  const slots: { hour: number; minute: number; date: Date }[] = [];
  for (const h of hours) {
    for (let m = 0; m < 60; m += SLOT_MIN) {
      const d = new Date(day);
      d.setHours(h, m, 0, 0);
      slots.push({ hour: h, minute: m, date: d });
    }
  }

  return (
    <div
      className={`relative border-l ${today ? "bg-primary/[0.025]" : ""}`}
      style={{ height: gridHeight }}
    >
      {hours.map((h, i) => (
        <div
          key={h}
          className="absolute left-0 right-0 border-t border-border/60"
          style={{ top: i * slotsPerHourPx() }}
        />
      ))}
      {slots.map((s) => {
        const open = isClinicOpen(s.date);
        return (
          <SlotCell
            key={`${s.hour}-${s.minute}`}
            day={day}
            hour={s.hour}
            minute={s.minute}
            date={s.date}
            isOpen={open && !closedDay}
            onClick={() => open && !closedDay && onSlotClick(s.date)}
          />
        );
      })}
      {appointments.map((a) => (
        <DraggableAppointment
          key={a.id}
          appointment={a}
          customer={customerMap.get(a.customer_id) || null}
          practitioner={practitionerById(practitioners, a.practitioner_id) || null}
          isAiPulse={aiPulseId === a.id}
          onClick={() => onSelect(a.id)}
        />
      ))}
    </div>
  );
}

function SlotCell({
  day,
  hour,
  minute,
  date,
  isOpen,
  onClick,
}: {
  day: Date;
  hour: number;
  minute: number;
  date: Date;
  isOpen: boolean;
  onClick: () => void;
}) {
  const id = slotIdFor(day, hour, minute);
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      className={`absolute left-0 right-0 ${isOpen ? "cursor-pointer hover:bg-primary/5 group" : "cursor-not-allowed"} ${isOver ? "bg-primary/15" : ""} transition-colors`}
      style={{
        top: ((hour - HOUR_START) * 2 + minute / SLOT_MIN) * SLOT_PX,
        height: SLOT_PX,
        backgroundImage: !isOpen
          ? "repeating-linear-gradient(45deg, transparent, transparent 6px, oklch(0.95 0.005 240) 6px, oklch(0.95 0.005 240) 7px)"
          : undefined,
      }}
    >
      {isOpen && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity h-full flex items-center justify-center text-muted-foreground/50 text-xs">
          +
        </div>
      )}
    </div>
  );
}

function DraggableAppointment({
  appointment,
  customer,
  practitioner,
  isAiPulse,
  onClick,
}: {
  appointment: Appointment;
  customer: Customer | null;
  practitioner: Practitioner | null;
  isAiPulse: boolean;
  onClick: () => void;
}) {
  const a = appointment;
  const start = new Date(a.start_time);
  const end = new Date(a.end_time);
  const top = topOffsetPx(start);
  const h = Math.max(heightPx(a.duration_minutes) - 2, SLOT_PX - 2);
  const color = practitioner?.color || "#0F766E";

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: a.id });
  const style: React.CSSProperties = {
    top,
    height: h,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    borderColor: color,
    backgroundColor: hexToRgba(color, 0.08),
    color,
    zIndex: isDragging ? 30 : 5,
    opacity: isDragging ? 0.85 : 1,
  };

  const statusDot =
    a.status === "confirmed"
      ? "bg-success"
      : a.status === "pending"
        ? "bg-warning"
        : "bg-destructive";
  const compact = h < 50;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={style}
      className={`absolute left-1 right-1 rounded-md border-l-[3px] border bg-card px-2 py-1 text-[11px] cursor-grab active:cursor-grabbing overflow-hidden transition-shadow hover:shadow-md ${isAiPulse ? "ring-2 ring-primary animate-pulse" : ""}`}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate" style={{ color: "inherit" }}>
            {fmtTimeRange(start, end)}
          </div>
          {!compact && (
            <>
              <div className="truncate text-foreground font-medium mt-0.5">
                {customer?.name || "Client"}
              </div>
              <div className="truncate text-muted-foreground">{a.treatment}</div>
            </>
          )}
          {compact && (
            <div className="truncate text-foreground">
              {customer?.name?.split(" ")[0]} · {a.treatment}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
          <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
        </div>
      </div>
      {!compact && (
        <div className="absolute bottom-0.5 right-1 flex items-center gap-1">
          {a.source === "ai_booked" ? (
            <span className="inline-flex items-center gap-0.5 px-1 py-px rounded-sm bg-primary/15 text-primary text-[9px] font-bold">
              <Sparkles className="h-2 w-2" />
              AI
            </span>
          ) : (
            <span className="inline-flex px-1 py-px rounded-sm bg-muted text-muted-foreground text-[9px] font-bold">
              M
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const m = hex.replace("#", "").match(/.{1,2}/g);
  if (!m || m.length < 3) return hex;
  const [r, g, b] = m.map((x) => parseInt(x, 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ============= Agenda view =============

function AgendaView({
  days,
  appointments,
  customerMap,
  practitioners,
  onSelect,
  onReschedule,
  onCancel,
}: {
  days: Date[];
  appointments: Appointment[];
  customerMap: Map<string, Customer>;
  practitioners: Practitioner[];
  onSelect: (id: string) => void;
  onReschedule: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const groups = days
    .map((d) => ({
      day: d,
      items: appointmentsOnDate(appointments, d).sort((a, b) =>
        a.start_time.localeCompare(b.start_time),
      ),
    }))
    .filter((g) => g.items.length > 0);

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border bg-card py-16 text-center">
        <CalendarIcon className="h-8 w-8 mx-auto text-muted-foreground/40" />
        <h3 className="mt-3 text-sm font-medium">No appointments in this range</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Try a different date range or check the Week view.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {groups.map(({ day, items }) => (
        <div key={day.toISOString()}>
          <div className="sticky top-14 z-10 bg-muted/40 backdrop-blur px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b">
            {day.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
            <span className="ml-2 font-normal normal-case text-[11px]">
              {items.length} appt{items.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="divide-y">
            {items.map((a) => {
              const c = customerMap.get(a.customer_id);
              const p = practitionerById(practitioners, a.practitioner_id);
              const start = new Date(a.start_time);
              const end = new Date(a.end_time);
              return (
                <div
                  key={a.id}
                  className="px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors text-sm cursor-pointer"
                  onClick={() => onSelect(a.id)}
                >
                  <div className="w-32 text-xs text-muted-foreground flex-shrink-0">
                    {fmtTimeRange(start, end)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{c?.name || "Client"}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {a.treatment} · {a.room}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p?.color }} />
                    <span className="text-muted-foreground hidden md:inline">
                      {p?.name.split(" ").slice(0, 2).join(" ")}
                    </span>
                  </div>
                  <StatusPill status={a.status} />
                  <SourcePill source={a.source} />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onSelect(a.id)}>View</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onReschedule(a.id)}>
                        Reschedule
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onCancel(a.id)} className="text-destructive">
                        Cancel
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          store.upsertAppointment({ ...a, status: "no_show" });
                          toast.success("Marked as no-show");
                        }}
                      >
                        Mark no-show
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    confirmed: "bg-success/10 text-success border-success/20",
    pending: "bg-warning/15 text-warning-foreground border-warning/30",
    completed: "bg-muted text-muted-foreground border-border",
    cancelled: "bg-destructive/10 text-destructive border-destructive/20",
    no_show: "bg-destructive/10 text-destructive border-destructive/20",
  };
  const lbl: Record<string, string> = {
    confirmed: "Confirmed",
    pending: "Pending",
    completed: "Completed",
    cancelled: "Cancelled",
    no_show: "No-show",
  };
  return (
    <span
      className={`inline-flex px-2 py-0.5 text-[10px] font-medium rounded-md border ${map[status]}`}
    >
      {lbl[status]}
    </span>
  );
}
function SourcePill({ source }: { source: string }) {
  if (source === "ai_booked") {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded-md border bg-primary/10 text-primary border-primary/20">
        <Sparkles className="h-2.5 w-2.5" />
        AI Booked
      </span>
    );
  }
  return (
    <span className="inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded-md border bg-muted text-muted-foreground border-border">
      Manual
    </span>
  );
}

// ============= AI booking simulator =============

function triggerAiBooking(
  customers: Customer[],
  practitioners: Practitioner[],
  existing: Appointment[],
  onCreated: (id: string) => void,
) {
  if (customers.length === 0 || practitioners.length === 0) return;
  const TREATMENTS: Treatment[] = [
    "Botox",
    "HydraFacial",
    "Laser",
    "Microneedling",
    "IV Drip",
    "Filler",
  ];
  for (let attempt = 0; attempt < 20; attempt++) {
    const dayOffset = Math.floor(Math.random() * 14) + 1;
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    const dow = d.getDay();
    if (dow === 0 || dow === 1) continue;
    const hours = [10, 11, 12, 13, 14, 15, 16, 17, 18];
    d.setHours(hours[Math.floor(Math.random() * hours.length)], Math.random() < 0.5 ? 0 : 30, 0, 0);
    const treatment = TREATMENTS[Math.floor(Math.random() * TREATMENTS.length)];
    const dur = TREATMENT_DURATIONS[treatment];
    const prac = practitioners[Math.floor(Math.random() * practitioners.length)];
    const conflict = existing.some(
      (a) =>
        a.practitioner_id === prac.id &&
        a.status !== "cancelled" &&
        Math.abs(new Date(a.start_time).getTime() - d.getTime()) < dur * 60000,
    );
    if (conflict) continue;
    const cust = customers[Math.floor(Math.random() * customers.length)];
    const end = new Date(d.getTime() + dur * 60000);
    const id = `apt_ai_${Date.now()}`;
    const appt: Appointment = {
      id,
      customer_id: cust.id,
      treatment,
      duration_minutes: dur,
      start_time: d.toISOString(),
      end_time: end.toISOString(),
      practitioner_id: prac.id,
      room: Math.random() < 0.5 ? "Room 1" : "Room 2",
      status: "confirmed",
      source: "ai_booked",
      notes: "",
      price: TREATMENT_PRICES[treatment],
      created_at: new Date().toISOString(),
      reminder_status: { t_3day: false, t_1day: false, t_2hour: false },
    };
    store.upsertAppointment(appt);
    onCreated(id);
    const dayLabel = d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    toast(
      <div className="flex items-start gap-2">
        <Sparkles className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="font-semibold text-sm">AI just booked an appointment</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {cust.name} — {treatment} — {dayLabel}, {fmtTime(d)}
          </div>
        </div>
      </div>,
      { duration: 5000, className: "border-l-2 !border-l-primary" },
    );
    return;
  }
}

function useRelativeTime(d: Date): string {
  const [, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(i);
  }, []);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  return `${h} hr ago`;
}

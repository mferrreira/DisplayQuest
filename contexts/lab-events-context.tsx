import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { LabEventsAPI } from "@/contexts/api-client";

interface LabEvent {
  id: number;
  userId: number;
  userName: string;
  date: string;
  note: string;
  createdAt: string;
}

interface LabEventsContextType {
  events: LabEvent[];
  loading: boolean;
  error: string | null;
  fetchEvents: (date: Date) => Promise<void>;
  createEvent: (event: { date: string; note: string }) => Promise<LabEvent>;
  deleteEvent: (eventId: number) => Promise<void>;
}

const LabEventsContext = createContext<LabEventsContextType | undefined>(undefined);

export function LabEventsProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<LabEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async (date: Date) => {
    setLoading(true);
    setError(null);
    try {
      const day = date.getDate();
      const month = date.getMonth() + 1;
      const year = date.getFullYear();
      const { events } = await LabEventsAPI.getEventsByDate(day, month, year);
      setEvents(events);
    } catch (err) {
      setError("Erro ao carregar eventos do laboratório");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const createEvent = useCallback(async (event: { date: string; note: string }) => {
    setLoading(true);
    setError(null);
    try {
      const { event: newEvent } = await LabEventsAPI.createEvent(event);
      setEvents((prev) => [...prev, newEvent]);
      return newEvent;
    } catch (err) {
      setError("Erro ao criar evento do laboratório");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteEvent = useCallback(async (eventId: number) => {
    setLoading(true);
    setError(null);
    try {
      await LabEventsAPI.deleteEvent(eventId);
      setEvents((prev) => prev.filter((event) => event.id !== eventId));
    } catch (err) {
      setError("Erro ao remover evento do laboratório");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <LabEventsContext.Provider value={{ events, loading, error, fetchEvents, createEvent, deleteEvent }}>
      {children}
    </LabEventsContext.Provider>
  );
}

export function useLabEvents() {
  const context = useContext(LabEventsContext);
  if (context === undefined) {
    throw new Error("useLabEvents deve ser usado dentro de um LabEventsProvider");
  }
  return context;
} 

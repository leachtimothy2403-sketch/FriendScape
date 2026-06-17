import { create } from 'zustand';

interface TourStore {
  tourStepId: string | null;
  setTourStepId: (id: string | null) => void;
}

export const useTourStore = create<TourStore>((set) => ({
  tourStepId: null,
  setTourStepId: (id) => set({ tourStepId: id }),
}));

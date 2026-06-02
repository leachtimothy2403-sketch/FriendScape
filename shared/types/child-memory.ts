export interface EmotionalEntry {
  date: Date;
  mood: string;
  note: string;
}

export interface Milestone {
  id: string;
  title: string;
  description: string;
  achievedAt: Date;
  badgeId: string | null;
}

export interface ChildMemory {
  childId: string;
  friendId: string;
  facts: string[];                 // things the AI has learned about this child
  emotionalHistory: EmotionalEntry[];
  milestones: Milestone[];
  lastUpdated: Date;
}

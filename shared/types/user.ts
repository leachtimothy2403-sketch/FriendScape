export type ContentFilterLevel = 'strict' | 'moderate' | 'relaxed';

export interface ParentSettings {
  alertsEnabled: boolean;
  weeklyReportEnabled: boolean;
  contentFilterLevel: ContentFilterLevel;
  screenTimeLimitMinutes: number;
  bedtimeLockEnabled: boolean;
  bedtimeLockStart: string; // HH:mm
  bedtimeLockEnd: string;   // HH:mm
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  emailVerified: boolean;
  settings: ParentSettings;
  children: string[]; // child IDs
  createdAt: Date;
  updatedAt: Date;
}

export type UserPublic = Omit<User, 'passwordHash'>;

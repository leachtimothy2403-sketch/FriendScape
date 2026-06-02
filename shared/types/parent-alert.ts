export type AlertType = 'mood_flag' | 'milestone' | 'crisis' | 'learning';
export type AlertSeverity = 'info' | 'warning' | 'urgent';

export interface ParentAlert {
  id: string;
  childId: string;
  type: AlertType;
  message: string;
  severity: AlertSeverity;
  read: boolean;
  actionUrl: string | null;
  createdAt: Date;
}

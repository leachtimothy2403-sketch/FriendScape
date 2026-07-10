import db from '../db';

export interface GraduationMilestone {
  key: string;
  label: string;
  completed: boolean;
  completedAt: string | null;
}

export interface GraduationProgress {
  completed: number;
  total: number;
  milestones: GraduationMilestone[];
  allComplete: boolean;
}

export async function getGraduationProgress(childId: string): Promise<GraduationProgress> {
  const [
    child,
    firstPost,
    moodAlert,
  ] = await Promise.all([
    db('children').where({ id: childId }).first(),
    db('posts')
      .where({ child_id: childId, author_type: 'child' })
      .orderBy('created_at', 'asc')
      .select('created_at')
      .first(),
    db('parent_alerts')
      .where({ child_id: childId, type: 'mood_flag' })
      .first(),
  ]);

  // heart_to_heart: had a mood alert AND child sent ≥3 messages in some conversation
  let heartToHeart = false;
  if (moodAlert) {
    const deepConv = await db('conversations')
      .join('messages', 'messages.conversation_id', 'conversations.id')
      .where({ 'conversations.child_id': childId, 'messages.sender_type': 'child' })
      .groupBy('conversations.id')
      .havingRaw('COUNT(messages.id) >= 3')
      .select('conversations.id')
      .first();
    heartToHeart = !!deepConv;
  }

  const milestones: GraduationMilestone[] = [
    {
      key:         'joined_migo',
      label:       'Join Migo',
      completed:   !!child,
      completedAt: child?.created_at ? new Date(child.created_at as string).toISOString() : null,
    },
    {
      key:         'first_post',
      label:       'Share your first post',
      completed:   !!firstPost,
      completedAt: firstPost?.created_at ? new Date(firstPost.created_at as string).toISOString() : null,
    },
    {
      key:         'heart_to_heart',
      label:       'Have a heart-to-heart conversation',
      completed:   heartToHeart,
      completedAt: null,
    },
    {
      key:         'digital_citizenship_lesson',
      label:       'Complete all three levels of the social media safety course with Sophie',
      completed:   Number(child?.safety_class_level ?? 0) >= 3,
      completedAt: null,
    },
    {
      key:         'introduced_friend',
      label:       'Introduce a friend',
      completed:   false,
      completedAt: null,
    },
  ];

  const completedCount = milestones.filter(m => m.completed).length;

  return {
    completed:   completedCount,
    total:       5,
    milestones,
    allComplete: completedCount === 5,
  };
}

import { callStudio } from './studio'
import { supabase } from './supabase'

export {
  QUESTION_PHOTO_LIMIT,
  QUESTIONS_PER_REQUEST,
  answerNote,
  withoutWords,
} from '../../supabase/functions/_shared/questions'

/** A question the studio asked about one photograph, waiting for its owner. */
export type PhotoQuestion = {
  id: string
  photoId: string
  question: string
  /** Why it is asked, or who might know. */
  reason: string | null
}

type QuestionRow = { id: string; photo_id: string; body: string; reason: string | null }

function toQuestion(row: QuestionRow): PhotoQuestion {
  return { id: row.id, photoId: row.photo_id, question: row.body, reason: row.reason }
}

/** The questions still waiting in this album, oldest first. */
export async function listOpenQuestions(albumId: string): Promise<PhotoQuestion[]> {
  const { data, error } = await supabase
    .from('ai_suggestions')
    .select('id, photo_id, body, reason')
    .eq('album_id', albumId)
    .eq('status', 'open')
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return ((data ?? []) as QuestionRow[]).map(toQuestion)
}

/** Asks the studio for new questions about photographs with no words yet. */
export async function askForQuestions(
  albumId: string,
): Promise<{ questions: PhotoQuestion[]; used: number; limit: number }> {
  const answer = await callStudio<{ questions?: QuestionRow[]; used?: number; limit?: number }>(
    'album-questions',
    { albumId },
    'No questions could be asked.',
  )
  return {
    questions: (answer?.questions ?? []).map(toQuestion),
    used: answer?.used ?? 0,
    limit: answer?.limit ?? 0,
  }
}

/** Records that a question was answered or set aside; it is never deleted. */
export async function settleQuestion(id: string, outcome: 'answered' | 'dismissed'): Promise<void> {
  const { error } = await supabase.from('ai_suggestions').update({ status: outcome }).eq('id', id)
  if (error) throw new Error(error.message)
}

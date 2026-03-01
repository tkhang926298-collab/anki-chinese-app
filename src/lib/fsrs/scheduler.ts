import { addDays, addMinutes, isAfter } from "date-fns"

export type Rating = 'again' | 'hard' | 'good' | 'easy'
export type State = 'new' | 'learning' | 'review' | 'relearning'

export interface CardState {
    state: State
    due: string | null
    stability: number
    difficulty: number
    elapsed_days: number
    scheduled_days: number
    reps: number
    lapses: number
    last_review: string | null
}

/**
 * Thuật toán tính toán ngày ôn tập tiếp theo mô phỏng SuperMemo-2 / FSRS Đơn giản hóa
 */
export function calculateNextReview(current: CardState, rating: Rating, now: Date = new Date()): CardState {
    const isNew = current.state === 'new'
    const isLearning = current.state === 'learning' || current.state === 'relearning'
    const isReview = current.state === 'review'

    let nextState: State = current.state
    let nextDue: Date = now
    let nextStability = current.stability || 0
    let nextDifficulty = current.difficulty || 4.5
    let nextScheduledDays = current.scheduled_days || 0
    let newReps = (current.reps || 0) + 1
    let newLapses = current.lapses || 0

    // State Transition Logic
    if (isNew || isLearning) {
        if (rating === 'again') {
            nextDue = addMinutes(now, 1)
            nextState = 'learning'
        } else if (rating === 'hard') {
            nextDue = addMinutes(now, 10)
            nextState = 'learning'
        } else if (rating === 'good') {
            nextDue = addDays(now, 1)
            nextState = 'review'
            nextStability = 1 // Start with 1 day stability
            nextScheduledDays = 1
        } else if (rating === 'easy') {
            nextDue = addDays(now, 4)
            nextState = 'review'
            nextStability = 4
            nextScheduledDays = 4
        }
    } else if (isReview) {
        if (rating === 'again') {
            newLapses += 1
            nextDue = addMinutes(now, 10)
            nextState = 'relearning'
            nextStability = Math.max(1, nextStability * 0.5) // Decrease stability
            nextScheduledDays = 0 // Reset schedule counter
        } else {
            // Review Passed
            // Adjust difficulty (1 to 10 scale)
            if (rating === 'hard') {
                nextDifficulty = Math.min(10, nextDifficulty + 1)
                nextStability = nextStability * 1.2
            } else if (rating === 'good') {
                nextDifficulty = Math.max(1, nextDifficulty - 0.2)
                nextStability = nextStability * 2.5
            } else if (rating === 'easy') {
                nextDifficulty = Math.max(1, nextDifficulty - 1)
                nextStability = nextStability * 3.5
            }

            // Constrain stability bounds
            nextStability = Math.min(nextStability, 365 * 10) // Max 10 years

            // Calculate next due date
            nextScheduledDays = Math.round(nextStability * (11 - nextDifficulty) / 5) // Simplified formula
            nextScheduledDays = Math.max(1, nextScheduledDays) // Always at least 1 day later

            nextDue = addDays(now, nextScheduledDays)
            nextState = 'review'
        }
    }

    // Calculate elapsed
    const lastReviewDate = current.last_review ? new Date(current.last_review) : now
    const elapsedMs = Math.abs(now.getTime() - lastReviewDate.getTime())
    const elapsedDaysMs = Math.floor(elapsedMs / (1000 * 60 * 60 * 24))

    return {
        state: nextState,
        due: nextDue.toISOString(),
        stability: nextStability,
        difficulty: nextDifficulty,
        elapsed_days: elapsedDaysMs,
        scheduled_days: nextScheduledDays,
        reps: newReps,
        lapses: newLapses,
        last_review: now.toISOString(),
    }
}

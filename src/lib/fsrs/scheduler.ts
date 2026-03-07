import { fsrs, createEmptyCard, Card, Rating as FSRSRating, State as FSRSState } from 'ts-fsrs'

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

const f = fsrs()

function mapStateToFSRS(state: State): FSRSState {
    switch (state) {
        case 'new': return FSRSState.New;
        case 'learning': return FSRSState.Learning;
        case 'review': return FSRSState.Review;
        case 'relearning': return FSRSState.Relearning;
    }
}

function mapStateFromFSRS(state: FSRSState): State {
    switch (state) {
        case FSRSState.New: return 'new';
        case FSRSState.Learning: return 'learning';
        case FSRSState.Review: return 'review';
        case FSRSState.Relearning: return 'relearning';
    }
}

function mapRatingToFSRS(rating: Rating): FSRSRating {
    switch (rating) {
        case 'again': return FSRSRating.Again;
        case 'hard': return FSRSRating.Hard;
        case 'good': return FSRSRating.Good;
        case 'easy': return FSRSRating.Easy;
    }
}

/**
 * Thuật toán tính toán ngày ôn tập tiếp theo sử dụng FSRS (Free Spaced Repetition Scheduler)
 */
export function calculateNextReview(current: CardState, rating: Rating, now: Date = new Date()): CardState {
    let card: Card;
    if (current.state === 'new' && current.reps === 0) {
        // Thẻ hoàn toàn mới
        card = createEmptyCard(now);
    } else {
        // Phục hồi trạng thái thẻ hiện tại
        card = Object.assign(createEmptyCard(now), {
            due: current.due ? new Date(current.due) : now,
            stability: current.stability || 0,
            difficulty: current.difficulty || 0,
            elapsed_days: current.elapsed_days || 0,
            scheduled_days: current.scheduled_days || 0,
            reps: current.reps || 0,
            lapses: current.lapses || 0,
            state: mapStateToFSRS(current.state),
            last_review: current.last_review ? new Date(current.last_review) : undefined
        });
    }

    const fsrsRating = mapRatingToFSRS(rating);
    const schedulingCards = f.repeat(card, now);

    // Tìm thẻ schedule tương ứng với rating của người dùng
    let nextCard: Card;
    if (fsrsRating === FSRSRating.Again) nextCard = schedulingCards[FSRSRating.Again].card;
    else if (fsrsRating === FSRSRating.Hard) nextCard = schedulingCards[FSRSRating.Hard].card;
    else if (fsrsRating === FSRSRating.Good) nextCard = schedulingCards[FSRSRating.Good].card;
    else nextCard = schedulingCards[FSRSRating.Easy].card;

    return {
        state: mapStateFromFSRS(nextCard.state),
        due: nextCard.due.toISOString(),
        stability: nextCard.stability,
        difficulty: nextCard.difficulty,
        elapsed_days: nextCard.elapsed_days,
        scheduled_days: nextCard.scheduled_days,
        reps: nextCard.reps,
        lapses: nextCard.lapses,
        last_review: nextCard.last_review ? nextCard.last_review.toISOString() : now.toISOString(),
    };
}

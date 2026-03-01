import Dexie, { type EntityTable } from 'dexie';
import { Database } from '@/types/database';

// Map existing Supabase row types to LocalDB
export type ProfileMap = Database['public']['Tables']['profiles']['Row'];
export type DeckMap = Database['public']['Tables']['decks']['Row'];
export type __BaseCardMap = Database['public']['Tables']['cards']['Row'];
export interface CardMap extends __BaseCardMap {
    tags?: string[];
}
export type ReviewLogMap = Database['public']['Tables']['review_logs']['Row'];

export class AnkiDatabase extends Dexie {
    profiles!: EntityTable<ProfileMap, 'id'>;
    decks!: EntityTable<DeckMap, 'id'>;
    cards!: EntityTable<CardMap, 'id'>;
    review_logs!: EntityTable<ReviewLogMap, 'id'>;
    media!: EntityTable<{ id: string, data: Blob }, 'id'>;

    constructor() {
        super('AnkiChineseLocalDB');
        this.version(2).stores({
            // Primary key and indexed props
            profiles: 'id',
            decks: 'id, user_id, created_at',
            cards: 'id, deck_id, user_id, state, due',
            review_logs: 'id, card_id, user_id',
            media: 'id'
        });
    }
}

export const db = new AnkiDatabase();

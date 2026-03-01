export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          email: string
          display_name: string | null
          avatar_url: string | null
        }
        Insert: {
          id: string
          created_at?: string
          updated_at?: string
          email: string
          display_name?: string | null
          avatar_url?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          email?: string
          display_name?: string | null
          avatar_url?: string | null
        }
      }
      decks: {
        Row: {
          id: string
          user_id: string
          created_at: string
          name: string
          description: string | null
          last_reviewed: string | null
        }
        Insert: {
          id?: string
          user_id: string
          created_at?: string
          name: string
          description?: string | null
          last_reviewed?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          created_at?: string
          name?: string
          description?: string | null
          last_reviewed?: string | null
        }
      }
      cards: {
        Row: {
          id: string
          deck_id: string
          user_id: string
          created_at: string
          front_html: string
          back_html: string
          fields: Json | null
          // FSRS / SM-2 Fields
          state: 'new' | 'learning' | 'review' | 'relearning'
          due: string | null
          stability: number
          difficulty: number
          elapsed_days: number
          scheduled_days: number
          reps: number
          lapses: number
          last_review: string | null
        }
        Insert: {
          id?: string
          deck_id: string
          user_id: string
          created_at?: string
          front_html: string
          back_html: string
          fields?: Json | null

          state?: 'new' | 'learning' | 'review' | 'relearning'
          due?: string | null
          stability?: number
          difficulty?: number
          elapsed_days?: number
          scheduled_days?: number
          reps?: number
          lapses?: number
          last_review?: string | null
        }
        Update: {
          id?: string
          deck_id?: string
          user_id?: string
          created_at?: string
          front_html?: string
          back_html?: string
          fields?: Json | null

          state?: 'new' | 'learning' | 'review' | 'relearning'
          due?: string | null
          stability?: number
          difficulty?: number
          elapsed_days?: number
          scheduled_days?: number
          reps?: number
          lapses?: number
          last_review?: string | null
        }
      }
      review_logs: {
        Row: {
          id: string
          card_id: string
          user_id: string
          created_at: string
          rating: 'manual' | 'again' | 'hard' | 'good' | 'easy'
          state: 'new' | 'learning' | 'review' | 'relearning'
          due: string
          stability: number
          difficulty: number
          elapsed_days: number
          last_elapsed_days: number
          scheduled_days: number
          review: string
        }
        Insert: {
          id?: string
          card_id: string
          user_id: string
          created_at?: string
          rating: 'manual' | 'again' | 'hard' | 'good' | 'easy'
          state: 'new' | 'learning' | 'review' | 'relearning'
          due: string
          stability: number
          difficulty: number
          elapsed_days: number
          last_elapsed_days: number
          scheduled_days: number
          review: string
        }
        Update: {
          id?: string
          card_id?: string
          user_id?: string
          created_at?: string
          rating?: 'manual' | 'again' | 'hard' | 'good' | 'easy'
          state?: 'new' | 'learning' | 'review' | 'relearning'
          due?: string
          stability?: number
          difficulty?: number
          elapsed_days?: number
          last_elapsed_days?: number
          scheduled_days?: number
          review?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T]

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      abandoned_carts: {
        Row: {
          converted: boolean | null
          created_at: string | null
          email: string
          event_id: string
          id: string
          reminded_at: string | null
          ticket_type_id: string | null
        }
        Insert: {
          converted?: boolean | null
          created_at?: string | null
          email: string
          event_id: string
          id?: string
          reminded_at?: string | null
          ticket_type_id?: string | null
        }
        Update: {
          converted?: boolean | null
          created_at?: string | null
          email?: string
          event_id?: string
          id?: string
          reminded_at?: string | null
          ticket_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "abandoned_carts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abandoned_carts_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "ticket_types"
            referencedColumns: ["id"]
          },
        ]
      }
      add_on_sessions: {
        Row: {
          add_on_id: string
          session_id: string
        }
        Insert: {
          add_on_id: string
          session_id: string
        }
        Update: {
          add_on_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "add_on_sessions_add_on_id_fkey"
            columns: ["add_on_id"]
            isOneToOne: false
            referencedRelation: "add_ons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "add_on_sessions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      add_ons: {
        Row: {
          created_at: string | null
          currency: string | null
          description: string | null
          event_id: string
          id: string
          is_active: boolean | null
          name: string
          price_cents: number
          quantity: number | null
          quantity_sold: number | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          currency?: string | null
          description?: string | null
          event_id: string
          id?: string
          is_active?: boolean | null
          name: string
          price_cents?: number
          quantity?: number | null
          quantity_sold?: number | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          currency?: string | null
          description?: string | null
          event_id?: string
          id?: string
          is_active?: boolean | null
          name?: string
          price_cents?: number
          quantity?: number | null
          quantity_sold?: number | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "add_ons_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_drafts_log: {
        Row: {
          created_at: string
          id: string
          org_id: string
          prompt_chars: number
          surface: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          prompt_chars: number
          surface: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          prompt_chars?: number
          surface?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_drafts_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          audience_filter: Json
          body: string
          channel: Database["public"]["Enums"]["announcement_channel"] | null
          created_at: string | null
          created_by: string
          event_id: string
          exclude_filter: Json
          id: string
          recipient_count: number | null
          scheduled_at: string | null
          scheduled_for: string | null
          segment: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["announcement_status"] | null
          target_tags: string[] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          audience_filter?: Json
          body: string
          channel?: Database["public"]["Enums"]["announcement_channel"] | null
          created_at?: string | null
          created_by: string
          event_id: string
          exclude_filter?: Json
          id?: string
          recipient_count?: number | null
          scheduled_at?: string | null
          scheduled_for?: string | null
          segment?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["announcement_status"] | null
          target_tags?: string[] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          audience_filter?: Json
          body?: string
          channel?: Database["public"]["Enums"]["announcement_channel"] | null
          created_at?: string | null
          created_by?: string
          event_id?: string
          exclude_filter?: Json
          id?: string
          recipient_count?: number | null
          scheduled_at?: string | null
          scheduled_for?: string | null
          segment?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["announcement_status"] | null
          target_tags?: string[] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      attendee_follows: {
        Row: {
          created_at: string | null
          event_id: string
          followed_id: string
          follower_id: string
        }
        Insert: {
          created_at?: string | null
          event_id: string
          followed_id: string
          follower_id: string
        }
        Update: {
          created_at?: string | null
          event_id?: string
          followed_id?: string
          follower_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendee_follows_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      attendee_points: {
        Row: {
          event_id: string
          id: string
          last_updated: string
          total_points: number
          user_id: string
        }
        Insert: {
          event_id: string
          id?: string
          last_updated?: string
          total_points?: number
          user_id: string
        }
        Update: {
          event_id?: string
          id?: string
          last_updated?: string
          total_points?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendee_points_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      attendee_preferences: {
        Row: {
          created_at: string
          email_announcements: boolean
          email_marketing: boolean
          email_reminders: boolean
          email_surveys: boolean
          networking_accept_matches: boolean
          networking_allow_dms: boolean
          networking_show_in_dir: boolean
          push_announcements: boolean
          push_reminders: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_announcements?: boolean
          email_marketing?: boolean
          email_reminders?: boolean
          email_surveys?: boolean
          networking_accept_matches?: boolean
          networking_allow_dms?: boolean
          networking_show_in_dir?: boolean
          push_announcements?: boolean
          push_reminders?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_announcements?: boolean
          email_marketing?: boolean
          email_reminders?: boolean
          email_surveys?: boolean
          networking_accept_matches?: boolean
          networking_allow_dms?: boolean
          networking_show_in_dir?: boolean
          push_announcements?: boolean
          push_reminders?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      attendee_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          company: string | null
          created_at: string | null
          event_id: string
          icebreaker_answers: Json | null
          id: string
          interests: string[] | null
          is_visible: boolean
          job_title: string | null
          linkedin_url: string | null
          registration_id: string
          share_email: boolean
          twitter_url: string | null
          updated_at: string | null
          user_id: string | null
          website_url: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          company?: string | null
          created_at?: string | null
          event_id: string
          icebreaker_answers?: Json | null
          id?: string
          interests?: string[] | null
          is_visible?: boolean
          job_title?: string | null
          linkedin_url?: string | null
          registration_id: string
          share_email?: boolean
          twitter_url?: string | null
          updated_at?: string | null
          user_id?: string | null
          website_url?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          company?: string | null
          created_at?: string | null
          event_id?: string
          icebreaker_answers?: Json | null
          id?: string
          interests?: string[] | null
          is_visible?: boolean
          job_title?: string | null
          linkedin_url?: string | null
          registration_id?: string
          share_email?: boolean
          twitter_url?: string | null
          updated_at?: string | null
          user_id?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendee_profiles_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendee_profiles_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: true
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          created_at: string | null
          event_id: string | null
          id: string
          ip_address: unknown
          new_data: Json | null
          old_data: Json | null
          org_id: string | null
          record_id: string | null
          table_name: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          created_at?: string | null
          event_id?: string | null
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          org_id?: string | null
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          created_at?: string | null
          event_id?: string | null
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          org_id?: string | null
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      badge_templates: {
        Row: {
          created_at: string | null
          event_id: string
          id: string
          is_default: boolean
          is_template: boolean
          name: string
          org_id: string | null
          paper_size: string
          template_json: Json
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          event_id: string
          id?: string
          is_default?: boolean
          is_template?: boolean
          name: string
          org_id?: string | null
          paper_size?: string
          template_json?: Json
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          event_id?: string
          id?: string
          is_default?: boolean
          is_template?: boolean
          name?: string
          org_id?: string | null
          paper_size?: string
          template_json?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "badge_templates_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "badge_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      certificate_templates: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          org_id: string
          payload: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          org_id: string
          payload?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          org_id?: string
          payload?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificate_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      check_ins: {
        Row: {
          checked_in_at: string | null
          checked_in_by: string | null
          checked_in_source: string
          device_id: string | null
          event_id: string
          id: string
          method: Database["public"]["Enums"]["checkin_method"] | null
          registration_id: string
          session_id: string | null
          synced_at: string | null
        }
        Insert: {
          checked_in_at?: string | null
          checked_in_by?: string | null
          checked_in_source?: string
          device_id?: string | null
          event_id: string
          id?: string
          method?: Database["public"]["Enums"]["checkin_method"] | null
          registration_id: string
          session_id?: string | null
          synced_at?: string | null
        }
        Update: {
          checked_in_at?: string | null
          checked_in_by?: string | null
          checked_in_source?: string
          device_id?: string | null
          event_id?: string
          id?: string
          method?: Database["public"]["Enums"]["checkin_method"] | null
          registration_id?: string
          session_id?: string | null
          synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "check_ins_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      community_photos: {
        Row: {
          caption: string | null
          created_at: string
          event_id: string
          id: string
          photo_url: string
          user_id: string
          votes: number
        }
        Insert: {
          caption?: string | null
          created_at?: string
          event_id: string
          id?: string
          photo_url: string
          user_id: string
          votes?: number
        }
        Update: {
          caption?: string | null
          created_at?: string
          event_id?: string
          id?: string
          photo_url?: string
          user_id?: string
          votes?: number
        }
        Relationships: [
          {
            foreignKeyName: "community_photos_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          article_url: string | null
          author_id: string
          body: string | null
          created_at: string | null
          event_id: string
          id: string
          image_url: string | null
          is_deleted: boolean
          is_pinned: boolean
          location: string | null
          og_description: string | null
          og_image: string | null
          og_title: string | null
          post_type: string
          reply_count: number
          rsvp_count: number
          session_id: string | null
          starts_at: string | null
          updated_at: string | null
          upvote_count: number
        }
        Insert: {
          article_url?: string | null
          author_id: string
          body?: string | null
          created_at?: string | null
          event_id: string
          id?: string
          image_url?: string | null
          is_deleted?: boolean
          is_pinned?: boolean
          location?: string | null
          og_description?: string | null
          og_image?: string | null
          og_title?: string | null
          post_type?: string
          reply_count?: number
          rsvp_count?: number
          session_id?: string | null
          starts_at?: string | null
          updated_at?: string | null
          upvote_count?: number
        }
        Update: {
          article_url?: string | null
          author_id?: string
          body?: string | null
          created_at?: string | null
          event_id?: string
          id?: string
          image_url?: string | null
          is_deleted?: boolean
          is_pinned?: boolean
          location?: string | null
          og_description?: string | null
          og_image?: string | null
          og_title?: string | null
          post_type?: string
          reply_count?: number
          rsvp_count?: number
          session_id?: string | null
          starts_at?: string | null
          updated_at?: string | null
          upvote_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_posts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      community_replies: {
        Row: {
          author_id: string
          body: string
          created_at: string | null
          id: string
          is_deleted: boolean
          post_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string | null
          id?: string
          is_deleted?: boolean
          post_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string | null
          id?: string
          is_deleted?: boolean
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_replies_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_reply_milestones: {
        Row: {
          awarded_at: string
          id: string
          milestone: number
          post_id: string
        }
        Insert: {
          awarded_at?: string
          id?: string
          milestone: number
          post_id: string
        }
        Update: {
          awarded_at?: string
          id?: string
          milestone?: number
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_reply_milestones_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_reports: {
        Row: {
          created_at: string | null
          id: string
          post_id: string | null
          reason: string
          reply_id: string | null
          reporter_id: string
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          post_id?: string | null
          reason: string
          reply_id?: string | null
          reporter_id: string
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          post_id?: string | null
          reason?: string
          reply_id?: string | null
          reporter_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_reports_reply_id_fkey"
            columns: ["reply_id"]
            isOneToOne: false
            referencedRelation: "community_replies"
            referencedColumns: ["id"]
          },
        ]
      }
      community_rsvps: {
        Row: {
          created_at: string | null
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_rsvps_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_upvotes: {
        Row: {
          post_id: string
          user_id: string
        }
        Insert: {
          post_id: string
          user_id: string
        }
        Update: {
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_upvotes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string | null
          event_id: string | null
          id: string
          last_message_at: string | null
          participant_a: string
          participant_b: string
        }
        Insert: {
          created_at?: string | null
          event_id?: string | null
          id?: string
          last_message_at?: string | null
          participant_a: string
          participant_b: string
        }
        Update: {
          created_at?: string | null
          event_id?: string | null
          id?: string
          last_message_at?: string | null
          participant_a?: string
          participant_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_participant_a_fkey"
            columns: ["participant_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_participant_b_fkey"
            columns: ["participant_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_check_ins: {
        Row: {
          check_in_date: string
          checked_in_at: string | null
          checked_in_by: string | null
          event_id: string
          id: string
          registration_id: string
        }
        Insert: {
          check_in_date: string
          checked_in_at?: string | null
          checked_in_by?: string | null
          event_id: string
          id?: string
          registration_id: string
        }
        Update: {
          check_in_date?: string
          checked_in_at?: string | null
          checked_in_by?: string | null
          event_id?: string
          id?: string
          registration_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_check_ins_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_check_ins_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      dead_letter_items: {
        Row: {
          error_message: string | null
          event_id: string | null
          first_failed_at: string
          id: string
          last_failed_at: string
          payload: Json
          resolved_at: string | null
          resolved_by: string | null
          retry_count: number
          type: string
        }
        Insert: {
          error_message?: string | null
          event_id?: string | null
          first_failed_at?: string
          id?: string
          last_failed_at?: string
          payload: Json
          resolved_at?: string | null
          resolved_by?: string | null
          retry_count?: number
          type: string
        }
        Update: {
          error_message?: string | null
          event_id?: string | null
          first_failed_at?: string
          id?: string
          last_failed_at?: string
          payload?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          retry_count?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "dead_letter_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_codes: {
        Row: {
          code: string
          created_at: string | null
          discount_type: string
          discount_value: number
          event_id: string
          id: string
          is_active: boolean | null
          max_uses: number | null
          updated_at: string | null
          uses_count: number | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          discount_type: string
          discount_value: number
          event_id: string
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          updated_at?: string | null
          uses_count?: number | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          discount_type?: string
          discount_value?: number
          event_id?: string
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          updated_at?: string | null
          uses_count?: number | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "discount_codes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      email_suppressions: {
        Row: {
          email: string
          id: string
          raw_event: Json | null
          reason: string
          suppressed_at: string
        }
        Insert: {
          email: string
          id?: string
          raw_event?: Json | null
          reason: string
          suppressed_at?: string
        }
        Update: {
          email?: string
          id?: string
          raw_event?: Json | null
          reason?: string
          suppressed_at?: string
        }
        Relationships: []
      }
      event_documents: {
        Row: {
          created_at: string | null
          event_id: string
          file_size_bytes: number | null
          folder_id: string | null
          fts: unknown
          id: string
          is_public: boolean | null
          mime_type: string | null
          name: string
          sort_order: number | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          event_id: string
          file_size_bytes?: number | null
          folder_id?: string | null
          fts?: unknown
          id?: string
          is_public?: boolean | null
          mime_type?: string | null
          name: string
          sort_order?: number | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          event_id?: string
          file_size_bytes?: number | null
          folder_id?: string | null
          fts?: unknown
          id?: string
          is_public?: boolean | null
          mime_type?: string | null
          name?: string
          sort_order?: number | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_documents_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_documents_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "event_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_folders: {
        Row: {
          created_at: string | null
          event_id: string
          id: string
          name: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          event_id: string
          id?: string
          name: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          event_id?: string
          id?: string
          name?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "event_folders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_sponsors: {
        Row: {
          contact_email: string | null
          created_at: string
          description: string | null
          event_id: string
          id: string
          is_featured: boolean
          logo_url: string | null
          materials: Json | null
          name: string
          portal_access_token: string | null
          slug: string | null
          sort_order: number
          tier: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          contact_email?: string | null
          created_at?: string
          description?: string | null
          event_id: string
          id?: string
          is_featured?: boolean
          logo_url?: string | null
          materials?: Json | null
          name: string
          portal_access_token?: string | null
          slug?: string | null
          sort_order?: number
          tier?: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          contact_email?: string | null
          created_at?: string
          description?: string | null
          event_id?: string
          id?: string
          is_featured?: boolean
          logo_url?: string | null
          materials?: Json | null
          name?: string
          portal_access_token?: string | null
          slug?: string | null
          sort_order?: number
          tier?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_sponsors_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          org_id: string
          template_data: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          org_id: string
          template_data?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          org_id?: string
          template_data?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      event_waivers: {
        Row: {
          body: string
          created_at: string | null
          event_id: string
          id: string
          is_required: boolean | null
          title: string
        }
        Insert: {
          body: string
          created_at?: string | null
          event_id: string
          id?: string
          is_required?: boolean | null
          title: string
        }
        Update: {
          body?: string
          created_at?: string | null
          event_id?: string
          id?: string
          is_required?: boolean | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_waivers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          allow_public_attendee_list: boolean | null
          badge_rules: Json | null
          capacity: number | null
          category: string | null
          certificate_enabled: boolean
          certificate_min_session_attendance_pct: number
          certificate_template_id: string | null
          check_in_opens_at: string | null
          checked_in_count: number | null
          cover_image_url: string | null
          created_at: string | null
          created_by: string
          description: string | null
          end_at: string
          event_type: Database["public"]["Enums"]["event_type"] | null
          ghl_creator_email: string | null
          id: string
          is_discoverable: boolean
          leaderboard_point_config: Json | null
          lobby_token: string | null
          mc_token: string | null
          next_occurrence_date: string | null
          org_id: string
          parent_event_id: string | null
          pass_fees_to_registrant: boolean
          recurrence: string | null
          registration_count: number | null
          registration_domain_restrict: string | null
          registration_invite_code: string | null
          require_approval: boolean | null
          slug: string
          speaker_day_of_info: string | null
          speaker_form_schema: Json | null
          start_at: string
          status: Database["public"]["Enums"]["event_status"] | null
          tags: string[] | null
          timezone: string | null
          title: string
          updated_at: string | null
          venue_address: string | null
          venue_city: string | null
          venue_country: string | null
          venue_lat: number | null
          venue_lng: number | null
          venue_map_url: string | null
          venue_name: string | null
          venue_state: string | null
          venue_zip: string | null
          virtual_url: string | null
          visibility: Database["public"]["Enums"]["event_visibility"] | null
          waitlist_enabled: boolean | null
        }
        Insert: {
          allow_public_attendee_list?: boolean | null
          badge_rules?: Json | null
          capacity?: number | null
          category?: string | null
          certificate_enabled?: boolean
          certificate_min_session_attendance_pct?: number
          certificate_template_id?: string | null
          check_in_opens_at?: string | null
          checked_in_count?: number | null
          cover_image_url?: string | null
          created_at?: string | null
          created_by: string
          description?: string | null
          end_at: string
          event_type?: Database["public"]["Enums"]["event_type"] | null
          ghl_creator_email?: string | null
          id?: string
          is_discoverable?: boolean
          leaderboard_point_config?: Json | null
          lobby_token?: string | null
          mc_token?: string | null
          next_occurrence_date?: string | null
          org_id: string
          parent_event_id?: string | null
          pass_fees_to_registrant?: boolean
          recurrence?: string | null
          registration_count?: number | null
          registration_domain_restrict?: string | null
          registration_invite_code?: string | null
          require_approval?: boolean | null
          slug: string
          speaker_day_of_info?: string | null
          speaker_form_schema?: Json | null
          start_at: string
          status?: Database["public"]["Enums"]["event_status"] | null
          tags?: string[] | null
          timezone?: string | null
          title: string
          updated_at?: string | null
          venue_address?: string | null
          venue_city?: string | null
          venue_country?: string | null
          venue_lat?: number | null
          venue_lng?: number | null
          venue_map_url?: string | null
          venue_name?: string | null
          venue_state?: string | null
          venue_zip?: string | null
          virtual_url?: string | null
          visibility?: Database["public"]["Enums"]["event_visibility"] | null
          waitlist_enabled?: boolean | null
        }
        Update: {
          allow_public_attendee_list?: boolean | null
          badge_rules?: Json | null
          capacity?: number | null
          category?: string | null
          certificate_enabled?: boolean
          certificate_min_session_attendance_pct?: number
          certificate_template_id?: string | null
          check_in_opens_at?: string | null
          checked_in_count?: number | null
          cover_image_url?: string | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          end_at?: string
          event_type?: Database["public"]["Enums"]["event_type"] | null
          ghl_creator_email?: string | null
          id?: string
          is_discoverable?: boolean
          leaderboard_point_config?: Json | null
          lobby_token?: string | null
          mc_token?: string | null
          next_occurrence_date?: string | null
          org_id?: string
          parent_event_id?: string | null
          pass_fees_to_registrant?: boolean
          recurrence?: string | null
          registration_count?: number | null
          registration_domain_restrict?: string | null
          registration_invite_code?: string | null
          require_approval?: boolean | null
          slug?: string
          speaker_day_of_info?: string | null
          speaker_form_schema?: Json | null
          start_at?: string
          status?: Database["public"]["Enums"]["event_status"] | null
          tags?: string[] | null
          timezone?: string | null
          title?: string
          updated_at?: string | null
          venue_address?: string | null
          venue_city?: string | null
          venue_country?: string | null
          venue_lat?: number | null
          venue_lng?: number | null
          venue_map_url?: string | null
          venue_name?: string | null
          venue_state?: string | null
          venue_zip?: string | null
          virtual_url?: string | null
          visibility?: Database["public"]["Enums"]["event_visibility"] | null
          waitlist_enabled?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "events_certificate_template_id_fkey"
            columns: ["certificate_template_id"]
            isOneToOne: false
            referencedRelation: "certificate_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_parent_event_id_fkey"
            columns: ["parent_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      form_fields: {
        Row: {
          add_on_id: string | null
          created_at: string | null
          event_id: string
          field_key: string
          field_type: string
          id: string
          is_required: boolean | null
          label: string
          options: Json | null
          sort_order: number | null
          ticket_type_id: string | null
        }
        Insert: {
          add_on_id?: string | null
          created_at?: string | null
          event_id: string
          field_key: string
          field_type: string
          id?: string
          is_required?: boolean | null
          label: string
          options?: Json | null
          sort_order?: number | null
          ticket_type_id?: string | null
        }
        Update: {
          add_on_id?: string | null
          created_at?: string | null
          event_id?: string
          field_key?: string
          field_type?: string
          id?: string
          is_required?: boolean | null
          label?: string
          options?: Json | null
          sort_order?: number | null
          ticket_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_fields_add_on_id_fkey"
            columns: ["add_on_id"]
            isOneToOne: false
            referencedRelation: "add_ons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_fields_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_fields_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "ticket_types"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_location_links: {
        Row: {
          created_at: string
          ghl_account_id: string | null
          ghl_location_id: string
          org_id: string
        }
        Insert: {
          created_at?: string
          ghl_account_id?: string | null
          ghl_location_id: string
          org_id: string
        }
        Update: {
          created_at?: string
          ghl_account_id?: string | null
          ghl_location_id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ghl_location_links_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_sync_state: {
        Row: {
          created_at: string
          dead_lettered: boolean
          event_type: string
          external_event_id: string
          ghl_contact_id: string | null
          ghl_opportunity_id: string | null
          id: string
          internal_registration_id: string | null
          last_error: string | null
          location_id: string
          payload_hash: string
          pending_stage_id: string | null
          raw_payload: Json | null
          retries: number
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dead_lettered?: boolean
          event_type: string
          external_event_id: string
          ghl_contact_id?: string | null
          ghl_opportunity_id?: string | null
          id?: string
          internal_registration_id?: string | null
          last_error?: string | null
          location_id: string
          payload_hash: string
          pending_stage_id?: string | null
          raw_payload?: Json | null
          retries?: number
          source: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dead_lettered?: boolean
          event_type?: string
          external_event_id?: string
          ghl_contact_id?: string | null
          ghl_opportunity_id?: string | null
          id?: string
          internal_registration_id?: string | null
          last_error?: string | null
          location_id?: string
          payload_hash?: string
          pending_stage_id?: string | null
          raw_payload?: Json | null
          retries?: number
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ghl_sync_state_internal_registration_id_fkey"
            columns: ["internal_registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      group_conversation_members: {
        Row: {
          conversation_id: string
          joined_at: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          joined_at?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          joined_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "group_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      group_conversations: {
        Row: {
          created_at: string | null
          created_by: string
          event_id: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          created_by: string
          event_id: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          created_by?: string
          event_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_conversations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      group_messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string | null
          id: string
          sender_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string | null
          id?: string
          sender_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "group_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      group_tickets: {
        Row: {
          created_at: string | null
          discount_percent: number
          event_id: string
          group_size: number
          id: string
          member_registration_ids: string[] | null
          payer_registration_id: string | null
          ticket_type_id: string
        }
        Insert: {
          created_at?: string | null
          discount_percent: number
          event_id: string
          group_size: number
          id?: string
          member_registration_ids?: string[] | null
          payer_registration_id?: string | null
          ticket_type_id: string
        }
        Update: {
          created_at?: string | null
          discount_percent?: number
          event_id?: string
          group_size?: number
          id?: string
          member_registration_ids?: string[] | null
          payer_registration_id?: string | null
          ticket_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_tickets_payer_registration_id_fkey"
            columns: ["payer_registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_tickets_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "ticket_types"
            referencedColumns: ["id"]
          },
        ]
      }
      icebreaker_completions: {
        Row: {
          created_at: string
          event_id: string
          id: string
          question_id: string
          response: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          question_id: string
          response: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          question_id?: string
          response?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "icebreaker_completions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "icebreaker_completions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "icebreaker_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      icebreaker_questions: {
        Row: {
          category: string | null
          created_at: string
          event_id: string | null
          id: string
          is_active: boolean | null
          prompt: string | null
          question: string | null
          question_text: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          is_active?: boolean | null
          prompt?: string | null
          question?: string | null
          question_text?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          is_active?: boolean | null
          prompt?: string | null
          question?: string | null
          question_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "icebreaker_questions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_errors: {
        Row: {
          context: Json | null
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          operation: string
          org_id: string
          provider: string
        }
        Insert: {
          context?: Json | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          operation: string
          org_id: string
          provider: string
        }
        Update: {
          context?: Json | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          operation?: string
          org_id?: string
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_errors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          note: string | null
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          note?: string | null
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          note?: string | null
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: []
      }
      issued_certificates: {
        Row: {
          ce_credit_hours: number
          created_at: string
          emailed_at: string | null
          event_id: string
          id: string
          pdf_generated_at: string | null
          pdf_url: string | null
          registration_id: string
          sessions_attended: number
          template_id: string
          verification_id: string
        }
        Insert: {
          ce_credit_hours?: number
          created_at?: string
          emailed_at?: string | null
          event_id: string
          id?: string
          pdf_generated_at?: string | null
          pdf_url?: string | null
          registration_id: string
          sessions_attended?: number
          template_id: string
          verification_id?: string
        }
        Update: {
          ce_credit_hours?: number
          created_at?: string
          emailed_at?: string | null
          event_id?: string
          id?: string
          pdf_generated_at?: string | null
          pdf_url?: string | null
          registration_id?: string
          sessions_attended?: number
          template_id?: string
          verification_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "issued_certificates_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issued_certificates_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issued_certificates_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "certificate_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_points: {
        Row: {
          action: string
          created_at: string
          event_id: string
          id: string
          points: number
          registration_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          event_id: string
          id?: string
          points?: number
          registration_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          event_id?: string
          id?: string
          points?: number
          registration_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_points_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaderboard_points_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_requests: {
        Row: {
          created_at: string | null
          event_id: string
          id: string
          location: string | null
          meeting_at: string | null
          message: string | null
          proposed_times: Json | null
          recipient_id: string
          requester_id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          event_id: string
          id?: string
          location?: string | null
          meeting_at?: string | null
          message?: string | null
          proposed_times?: Json | null
          recipient_id: string
          requester_id: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          event_id?: string
          id?: string
          location?: string | null
          meeting_at?: string | null
          message?: string | null
          proposed_times?: Json | null
          recipient_id?: string
          requester_id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_requests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string | null
          id: string
          read_at: string | null
          sender_id: string
          status: Database["public"]["Enums"]["message_status"] | null
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string | null
          id?: string
          read_at?: string | null
          sender_id: string
          status?: Database["public"]["Enums"]["message_status"] | null
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          read_at?: string | null
          sender_id?: string
          status?: Database["public"]["Enums"]["message_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      offline_queue: {
        Row: {
          created_at: string | null
          device_id: string
          error: string | null
          event_id: string
          id: string
          processed_at: string | null
          qr_code: string
          scanned_at: string
        }
        Insert: {
          created_at?: string | null
          device_id: string
          error?: string | null
          event_id: string
          id?: string
          processed_at?: string | null
          qr_code: string
          scanned_at: string
        }
        Update: {
          created_at?: string | null
          device_id?: string
          error?: string | null
          event_id?: string
          id?: string
          processed_at?: string | null
          qr_code?: string
          scanned_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offline_queue_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      org_integrations: {
        Row: {
          created_at: string
          directionality_preferences: Json | null
          encrypted_refresh_token: string | null
          id: string
          last_synced_at: string | null
          org_id: string
          provider: string
          scopes: string[] | null
          status: Database["public"]["Enums"]["integration_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          directionality_preferences?: Json | null
          encrypted_refresh_token?: string | null
          id?: string
          last_synced_at?: string | null
          org_id: string
          provider: string
          scopes?: string[] | null
          status?: Database["public"]["Enums"]["integration_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          directionality_preferences?: Json | null
          encrypted_refresh_token?: string | null
          id?: string
          last_synced_at?: string | null
          org_id?: string
          provider?: string
          scopes?: string[] | null
          status?: Database["public"]["Enums"]["integration_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_integrations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_invites: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          email: string
          id: string
          invited_by: string | null
          org_id: string
          role: string
          token: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          email: string
          id?: string
          invited_by?: string | null
          org_id: string
          role?: string
          token?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          email?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          role?: string
          token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_member_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          org_id: string
          role: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id: string
          role?: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          role?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_member_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_member_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          id: string
          invited_by: string | null
          joined_at: string | null
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          role_id: string | null
          user_id: string
        }
        Insert: {
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          org_id: string
          role?: Database["public"]["Enums"]["org_role"]
          role_id?: string | null
          user_id: string
        }
        Update: {
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          org_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          role_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_members_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_session_types: {
        Row: {
          color: string | null
          created_at: string
          id: string
          label: string
          org_id: string
          slug: string
          sort_order: number
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          label: string
          org_id: string
          slug: string
          sort_order?: number
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          label?: string
          org_id?: string
          slug?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "org_session_types_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_speakers: {
        Row: {
          bio: string | null
          company: string | null
          created_at: string | null
          email: string | null
          id: string
          job_title: string | null
          last_spoken_at: string | null
          linkedin_url: string | null
          name: string
          org_id: string
          photo_url: string | null
          times_spoken: number
          twitter_handle: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          bio?: string | null
          company?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          job_title?: string | null
          last_spoken_at?: string | null
          linkedin_url?: string | null
          name: string
          org_id: string
          photo_url?: string | null
          times_spoken?: number
          twitter_handle?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          bio?: string | null
          company?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          job_title?: string | null
          last_spoken_at?: string | null
          linkedin_url?: string | null
          name?: string
          org_id?: string
          photo_url?: string | null
          times_spoken?: number
          twitter_handle?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_speakers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          org_id: string
          payload: Json
          surface: string
          updated_at: string
          usage_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          org_id: string
          payload: Json
          surface: string
          updated_at?: string
          usage_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          org_id?: string
          payload?: Json
          surface?: string
          updated_at?: string
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "org_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string | null
          charges_enabled: boolean
          city: string | null
          country: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          email: string | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          name: string
          payouts_enabled: boolean
          phone: string | null
          slug: string
          state: string | null
          stripe_account_id: string | null
          stripe_customer_id: string | null
          suspended: boolean
          timezone: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          charges_enabled?: boolean
          city?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          payouts_enabled?: boolean
          phone?: string | null
          slug: string
          state?: string | null
          stripe_account_id?: string | null
          stripe_customer_id?: string | null
          suspended?: boolean
          timezone?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          charges_enabled?: boolean
          city?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          payouts_enabled?: boolean
          phone?: string | null
          slug?: string
          state?: string | null
          stripe_account_id?: string | null
          stripe_customer_id?: string | null
          suspended?: boolean
          timezone?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      passport_locations: {
        Row: {
          code: string
          created_at: string
          event_id: string
          id: string
          name: string
          points: number
        }
        Insert: {
          code: string
          created_at?: string
          event_id: string
          id?: string
          name: string
          points?: number
        }
        Update: {
          code?: string
          created_at?: string
          event_id?: string
          id?: string
          name?: string
          points?: number
        }
        Relationships: [
          {
            foreignKeyName: "passport_locations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      passport_visits: {
        Row: {
          created_at: string
          event_id: string
          id: string
          location_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          location_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          location_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "passport_visits_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passport_visits_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "passport_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          key: string
          label: string
        }
        Insert: {
          category: string
          created_at?: string | null
          description?: string | null
          key: string
          label: string
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          key?: string
          label?: string
        }
        Relationships: []
      }
      photo_contest_entries: {
        Row: {
          caption: string | null
          created_at: string
          event_id: string
          id: string
          is_winner: boolean
          storage_path: string
          user_id: string | null
          vote_count: number
        }
        Insert: {
          caption?: string | null
          created_at?: string
          event_id: string
          id?: string
          is_winner?: boolean
          storage_path: string
          user_id?: string | null
          vote_count?: number
        }
        Update: {
          caption?: string | null
          created_at?: string
          event_id?: string
          id?: string
          is_winner?: boolean
          storage_path?: string
          user_id?: string | null
          vote_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "photo_contest_entries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      photo_contest_votes: {
        Row: {
          created_at: string
          entry_id: string
          id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          entry_id: string
          id?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          entry_id?: string
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "photo_contest_votes_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "photo_contest_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_templates: {
        Row: {
          body: string
          category: string
          created_at: string
          id: string
          options: Json
        }
        Insert: {
          body: string
          category?: string
          created_at?: string
          id?: string
          options?: Json
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          id?: string
          options?: Json
        }
        Relationships: []
      }
      poll_votes: {
        Row: {
          created_at: string
          id: string
          option_index: number
          question_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          option_index: number
          question_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          option_index?: number
          question_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "poll_votes_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "session_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          accepted_terms_at: string | null
          avatar_url: string | null
          bio: string | null
          company: string | null
          created_at: string | null
          email: string
          full_name: string | null
          handle: string
          handle_customized: boolean
          id: string
          job_title: string | null
          linkedin_url: string | null
          notification_email: boolean | null
          notification_push: boolean | null
          phone: string | null
          timezone: string | null
          twitter_handle: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          accepted_terms_at?: string | null
          avatar_url?: string | null
          bio?: string | null
          company?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          handle: string
          handle_customized?: boolean
          id: string
          job_title?: string | null
          linkedin_url?: string | null
          notification_email?: boolean | null
          notification_push?: boolean | null
          phone?: string | null
          timezone?: string | null
          twitter_handle?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          accepted_terms_at?: string | null
          avatar_url?: string | null
          bio?: string | null
          company?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          handle?: string
          handle_customized?: boolean
          id?: string
          job_title?: string | null
          linkedin_url?: string | null
          notification_email?: boolean | null
          notification_push?: boolean | null
          phone?: string | null
          timezone?: string | null
          twitter_handle?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string | null
          endpoint: string
          id: string
          p256dh: string
          registration_id: string | null
        }
        Insert: {
          auth: string
          created_at?: string | null
          endpoint: string
          id?: string
          p256dh: string
          registration_id?: string | null
        }
        Update: {
          auth?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          p256dh?: string
          registration_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_add_ons: {
        Row: {
          add_on_id: string
          created_at: string | null
          id: string
          price_cents: number
          quantity: number | null
          registration_id: string
        }
        Insert: {
          add_on_id: string
          created_at?: string | null
          id?: string
          price_cents: number
          quantity?: number | null
          registration_id: string
        }
        Update: {
          add_on_id?: string
          created_at?: string | null
          id?: string
          price_cents?: number
          quantity?: number | null
          registration_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_add_ons_add_on_id_fkey"
            columns: ["add_on_id"]
            isOneToOne: false
            referencedRelation: "add_ons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_add_ons_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_field_responses: {
        Row: {
          created_at: string | null
          field_id: string
          id: string
          registration_id: string
          value: string | null
        }
        Insert: {
          created_at?: string | null
          field_id: string
          id?: string
          registration_id: string
          value?: string | null
        }
        Update: {
          created_at?: string | null
          field_id?: string
          id?: string
          registration_id?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registration_field_responses_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "form_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_field_responses_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      registrations: {
        Row: {
          amount_paid_cents: number | null
          attendee_company: string | null
          attendee_email: string
          attendee_job_title: string | null
          attendee_name: string
          attendee_phone: string | null
          certificate_token: string | null
          confirmation_sent_at: string | null
          created_at: string | null
          currency: string | null
          custom_fields: Json | null
          delivery_method: string
          discount_amount_cents: number | null
          discount_code_id: string | null
          event_id: string
          external_order_id: string | null
          id: string
          notes: string | null
          paid_offline_at: string | null
          paid_offline_by: string | null
          payment_method: string
          pin: string
          press_token: string | null
          qr_code: string | null
          refund_amount_cents: number | null
          refunded_at: string | null
          sms_opt_in: boolean
          sms_opt_in_at: string | null
          status: Database["public"]["Enums"]["registration_status"] | null
          stripe_charge_id: string | null
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          tags: string[] | null
          ticket_type_id: string
          updated_at: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          waitlist_position: number | null
        }
        Insert: {
          amount_paid_cents?: number | null
          attendee_company?: string | null
          attendee_email: string
          attendee_job_title?: string | null
          attendee_name: string
          attendee_phone?: string | null
          certificate_token?: string | null
          confirmation_sent_at?: string | null
          created_at?: string | null
          currency?: string | null
          custom_fields?: Json | null
          delivery_method?: string
          discount_amount_cents?: number | null
          discount_code_id?: string | null
          event_id: string
          external_order_id?: string | null
          id?: string
          notes?: string | null
          paid_offline_at?: string | null
          paid_offline_by?: string | null
          payment_method?: string
          pin?: string
          press_token?: string | null
          qr_code?: string | null
          refund_amount_cents?: number | null
          refunded_at?: string | null
          sms_opt_in?: boolean
          sms_opt_in_at?: string | null
          status?: Database["public"]["Enums"]["registration_status"] | null
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          tags?: string[] | null
          ticket_type_id: string
          updated_at?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          waitlist_position?: number | null
        }
        Update: {
          amount_paid_cents?: number | null
          attendee_company?: string | null
          attendee_email?: string
          attendee_job_title?: string | null
          attendee_name?: string
          attendee_phone?: string | null
          certificate_token?: string | null
          confirmation_sent_at?: string | null
          created_at?: string | null
          currency?: string | null
          custom_fields?: Json | null
          delivery_method?: string
          discount_amount_cents?: number | null
          discount_code_id?: string | null
          event_id?: string
          external_order_id?: string | null
          id?: string
          notes?: string | null
          paid_offline_at?: string | null
          paid_offline_by?: string | null
          payment_method?: string
          pin?: string
          press_token?: string | null
          qr_code?: string | null
          refund_amount_cents?: number | null
          refunded_at?: string | null
          sms_opt_in?: boolean
          sms_opt_in_at?: string | null
          status?: Database["public"]["Enums"]["registration_status"] | null
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          tags?: string[] | null
          ticket_type_id?: string
          updated_at?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          waitlist_position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "registrations_discount_code_id_fkey"
            columns: ["discount_code_id"]
            isOneToOne: false
            referencedRelation: "discount_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_paid_offline_by_fkey"
            columns: ["paid_offline_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "ticket_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reserved_handles: {
        Row: {
          handle: string
        }
        Insert: {
          handle: string
        }
        Update: {
          handle?: string
        }
        Relationships: []
      }
      rls_baseline_capture: {
        Row: {
          captured_at: string | null
          detail: string | null
          id: number
          operation: string
          org_slug: string
          result: string
          role_name: string
          row_count: number | null
          table_name: string
          user_label: string
        }
        Insert: {
          captured_at?: string | null
          detail?: string | null
          id?: number
          operation: string
          org_slug: string
          result: string
          role_name: string
          row_count?: number | null
          table_name: string
          user_label: string
        }
        Update: {
          captured_at?: string | null
          detail?: string | null
          id?: number
          operation?: string
          org_slug?: string
          result?: string
          role_name?: string
          row_count?: number | null
          table_name?: string
          user_label?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          permission_key: string
          role_id: string
        }
        Insert: {
          permission_key: string
          role_id: string
        }
        Update: {
          permission_key?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_builtin: boolean
          name: string
          org_id: string
          slug: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_builtin?: boolean
          name: string
          org_id: string
          slug: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_builtin?: boolean
          name?: string
          org_id?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          capacity: number | null
          created_at: string | null
          event_id: string
          id: string
          location_hint: string | null
          name: string
          sort_order: number | null
        }
        Insert: {
          capacity?: number | null
          created_at?: string | null
          event_id: string
          id?: string
          location_hint?: string | null
          name: string
          sort_order?: number | null
        }
        Update: {
          capacity?: number | null
          created_at?: string | null
          event_id?: string
          id?: string
          location_hint?: string | null
          name?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rooms_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      run_of_show_items: {
        Row: {
          created_at: string | null
          cue_notification_sent: boolean
          description: string | null
          duration_minutes: number
          event_id: string
          id: string
          responsible_email: string | null
          responsible_person: string | null
          sort_order: number
          status: string
          time_at: string
          title: string
        }
        Insert: {
          created_at?: string | null
          cue_notification_sent?: boolean
          description?: string | null
          duration_minutes?: number
          event_id: string
          id?: string
          responsible_email?: string | null
          responsible_person?: string | null
          sort_order?: number
          status?: string
          time_at: string
          title: string
        }
        Update: {
          created_at?: string | null
          cue_notification_sent?: boolean
          description?: string | null
          duration_minutes?: number
          event_id?: string
          id?: string
          responsible_email?: string | null
          responsible_person?: string | null
          sort_order?: number
          status?: string
          time_at?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "run_of_show_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      session_attendance: {
        Row: {
          checked_in_at: string | null
          checked_in_by: string | null
          event_id: string
          id: string
          registration_id: string
          session_id: string
          source: string | null
          watch_duration_seconds: number | null
        }
        Insert: {
          checked_in_at?: string | null
          checked_in_by?: string | null
          event_id: string
          id?: string
          registration_id: string
          session_id: string
          source?: string | null
          watch_duration_seconds?: number | null
        }
        Update: {
          checked_in_at?: string | null
          checked_in_by?: string | null
          event_id?: string
          id?: string
          registration_id?: string
          session_id?: string
          source?: string | null
          watch_duration_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "session_attendance_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_attendance_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_bookmarks: {
        Row: {
          created_at: string | null
          session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          session_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_bookmarks_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_bookmarks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      session_documents: {
        Row: {
          created_at: string | null
          event_id: string
          file_size_bytes: number | null
          id: string
          is_public: boolean | null
          mime_type: string | null
          name: string
          session_id: string
          sort_order: number | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          event_id: string
          file_size_bytes?: number | null
          id?: string
          is_public?: boolean | null
          mime_type?: string | null
          name: string
          session_id: string
          sort_order?: number | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          event_id?: string
          file_size_bytes?: number | null
          id?: string
          is_public?: boolean | null
          mime_type?: string | null
          name?: string
          session_id?: string
          sort_order?: number | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_documents_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_documents_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      session_feedback: {
        Row: {
          comment: string | null
          created_at: string
          event_id: string
          id: string
          rating: number
          session_id: string
          user_id: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          event_id: string
          id?: string
          rating: number
          session_id: string
          user_id?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          event_id?: string
          id?: string
          rating?: number
          session_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_feedback_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_feedback_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_handouts: {
        Row: {
          created_at: string
          filename: string
          id: string
          is_latest: boolean
          session_id: string
          speaker_id: string
          storage_path: string
          superseded_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          filename: string
          id?: string
          is_latest?: boolean
          session_id: string
          speaker_id: string
          storage_path: string
          superseded_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          filename?: string
          id?: string
          is_latest?: boolean
          session_id?: string
          speaker_id?: string
          storage_path?: string
          superseded_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "session_handouts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_handouts_speaker_id_fkey"
            columns: ["speaker_id"]
            isOneToOne: false
            referencedRelation: "speakers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_handouts_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "session_handouts"
            referencedColumns: ["id"]
          },
        ]
      }
      session_messages: {
        Row: {
          body: string
          created_at: string | null
          id: string
          is_moderated: boolean | null
          session_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string | null
          id?: string
          is_moderated?: boolean | null
          session_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string | null
          id?: string
          is_moderated?: boolean | null
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      session_notes: {
        Row: {
          body: string
          id: string
          session_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          body?: string
          id?: string
          session_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          body?: string
          id?: string
          session_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_notes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      session_poll_votes: {
        Row: {
          created_at: string | null
          id: string
          option_index: number
          poll_id: string
          registration_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          option_index: number
          poll_id: string
          registration_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          option_index?: number
          poll_id?: string
          registration_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "session_polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_poll_votes_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      session_polls: {
        Row: {
          closed_at: string | null
          created_at: string | null
          event_id: string
          id: string
          is_active: boolean | null
          options: Json
          question: string
          session_id: string
          show_results: boolean | null
        }
        Insert: {
          closed_at?: string | null
          created_at?: string | null
          event_id: string
          id?: string
          is_active?: boolean | null
          options?: Json
          question: string
          session_id: string
          show_results?: boolean | null
        }
        Update: {
          closed_at?: string | null
          created_at?: string | null
          event_id?: string
          id?: string
          is_active?: boolean | null
          options?: Json
          question?: string
          session_id?: string
          show_results?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "session_polls_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_polls_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_question_upvotes: {
        Row: {
          question_id: string
          user_id: string
        }
        Insert: {
          question_id: string
          user_id: string
        }
        Update: {
          question_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_question_upvotes_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "session_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_question_upvotes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      session_questions: {
        Row: {
          answered_at: string | null
          body: string
          created_at: string
          event_id: string
          id: string
          is_anonymous: boolean
          is_hidden: boolean
          is_pinned: boolean
          is_poll: boolean
          organizer_answer: string | null
          poll_options: Json
          session_id: string
          upvote_count: number
          user_id: string | null
        }
        Insert: {
          answered_at?: string | null
          body: string
          created_at?: string
          event_id: string
          id?: string
          is_anonymous?: boolean
          is_hidden?: boolean
          is_pinned?: boolean
          is_poll?: boolean
          organizer_answer?: string | null
          poll_options?: Json
          session_id: string
          upvote_count?: number
          user_id?: string | null
        }
        Update: {
          answered_at?: string | null
          body?: string
          created_at?: string
          event_id?: string
          id?: string
          is_anonymous?: boolean
          is_hidden?: boolean
          is_pinned?: boolean
          is_poll?: boolean
          organizer_answer?: string | null
          poll_options?: Json
          session_id?: string
          upvote_count?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_questions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_questions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_speakers: {
        Row: {
          post_session_email_sent_at: string | null
          reminder_sent_at: string | null
          role: string
          session_id: string
          sort_order: number | null
          speaker_id: string
        }
        Insert: {
          post_session_email_sent_at?: string | null
          reminder_sent_at?: string | null
          role?: string
          session_id: string
          sort_order?: number | null
          speaker_id: string
        }
        Update: {
          post_session_email_sent_at?: string | null
          reminder_sent_at?: string | null
          role?: string
          session_id?: string
          sort_order?: number | null
          speaker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_speakers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_speakers_speaker_id_fkey"
            columns: ["speaker_id"]
            isOneToOne: false
            referencedRelation: "speakers"
            referencedColumns: ["id"]
          },
        ]
      }
      session_ticket_access: {
        Row: {
          session_id: string
          ticket_type_id: string
        }
        Insert: {
          session_id: string
          ticket_type_id: string
        }
        Update: {
          session_id?: string
          ticket_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_ticket_access_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_ticket_access_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "ticket_types"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          allow_rewatch: boolean
          capacity: number | null
          ce_credit_hours: number | null
          created_at: string | null
          description: string | null
          ends_at: string
          event_id: string
          id: string
          is_published: boolean | null
          livekit_room_name: string | null
          mux_asset_id: string | null
          mux_asset_playback_id: string | null
          mux_playback_id: string | null
          mux_stream_id: string | null
          recording_enabled: boolean
          recording_url: string | null
          room_id: string | null
          session_qr_token: string
          session_type: string | null
          simulive_scheduled_at: string | null
          simulive_started_at: string | null
          slides_url: string | null
          sort_order: number | null
          sponsored_by_id: string | null
          starts_at: string
          tags: string[] | null
          title: string
          track_id: string | null
          updated_at: string | null
          video_url: string | null
          visible_from: string | null
          visible_until: string | null
        }
        Insert: {
          allow_rewatch?: boolean
          capacity?: number | null
          ce_credit_hours?: number | null
          created_at?: string | null
          description?: string | null
          ends_at: string
          event_id: string
          id?: string
          is_published?: boolean | null
          livekit_room_name?: string | null
          mux_asset_id?: string | null
          mux_asset_playback_id?: string | null
          mux_playback_id?: string | null
          mux_stream_id?: string | null
          recording_enabled?: boolean
          recording_url?: string | null
          room_id?: string | null
          session_qr_token?: string
          session_type?: string | null
          simulive_scheduled_at?: string | null
          simulive_started_at?: string | null
          slides_url?: string | null
          sort_order?: number | null
          sponsored_by_id?: string | null
          starts_at: string
          tags?: string[] | null
          title: string
          track_id?: string | null
          updated_at?: string | null
          video_url?: string | null
          visible_from?: string | null
          visible_until?: string | null
        }
        Update: {
          allow_rewatch?: boolean
          capacity?: number | null
          ce_credit_hours?: number | null
          created_at?: string | null
          description?: string | null
          ends_at?: string
          event_id?: string
          id?: string
          is_published?: boolean | null
          livekit_room_name?: string | null
          mux_asset_id?: string | null
          mux_asset_playback_id?: string | null
          mux_playback_id?: string | null
          mux_stream_id?: string | null
          recording_enabled?: boolean
          recording_url?: string | null
          room_id?: string | null
          session_qr_token?: string
          session_type?: string | null
          simulive_scheduled_at?: string | null
          simulive_started_at?: string | null
          slides_url?: string | null
          sort_order?: number | null
          sponsored_by_id?: string | null
          starts_at?: string
          tags?: string[] | null
          title?: string
          track_id?: string | null
          updated_at?: string | null
          video_url?: string | null
          visible_from?: string | null
          visible_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_sponsored_by_id_fkey"
            columns: ["sponsored_by_id"]
            isOneToOne: false
            referencedRelation: "event_sponsors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      speaker_conversations: {
        Row: {
          created_at: string
          event_id: string
          id: string
          speaker_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          speaker_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          speaker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "speaker_conversations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "speaker_conversations_speaker_id_fkey"
            columns: ["speaker_id"]
            isOneToOne: false
            referencedRelation: "speakers"
            referencedColumns: ["id"]
          },
        ]
      }
      speaker_form_submissions: {
        Row: {
          created_at: string
          data: Json
          event_id: string
          id: string
          speaker_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: Json
          event_id: string
          id?: string
          speaker_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          event_id?: string
          id?: string
          speaker_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "speaker_form_submissions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "speaker_form_submissions_speaker_id_fkey"
            columns: ["speaker_id"]
            isOneToOne: false
            referencedRelation: "speakers"
            referencedColumns: ["id"]
          },
        ]
      }
      speaker_messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          sender_role: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          sender_role: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "speaker_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "speaker_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      speaker_tokens: {
        Row: {
          created_at: string
          event_id: string
          expires_at: string
          id: string
          speaker_id: string
          token: string
        }
        Insert: {
          created_at?: string
          event_id: string
          expires_at?: string
          id?: string
          speaker_id: string
          token?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          expires_at?: string
          id?: string
          speaker_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "speaker_tokens_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "speaker_tokens_speaker_id_fkey"
            columns: ["speaker_id"]
            isOneToOne: false
            referencedRelation: "speakers"
            referencedColumns: ["id"]
          },
        ]
      }
      speakers: {
        Row: {
          bio: string | null
          checked_in_at: string | null
          company: string | null
          confirmation_token: string | null
          confirmed_at: string | null
          created_at: string | null
          decline_alternative: string | null
          decline_reason: string | null
          email: string | null
          event_id: string
          event_role: string
          ghl_contact_id: string | null
          id: string
          is_published: boolean | null
          job_title: string | null
          linkedin_url: string | null
          name: string
          photo_url: string | null
          sort_order: number | null
          status: string
          twitter_handle: string | null
          updated_at: string | null
          user_id: string | null
          website: string | null
        }
        Insert: {
          bio?: string | null
          checked_in_at?: string | null
          company?: string | null
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          decline_alternative?: string | null
          decline_reason?: string | null
          email?: string | null
          event_id: string
          event_role?: string
          ghl_contact_id?: string | null
          id?: string
          is_published?: boolean | null
          job_title?: string | null
          linkedin_url?: string | null
          name: string
          photo_url?: string | null
          sort_order?: number | null
          status?: string
          twitter_handle?: string | null
          updated_at?: string | null
          user_id?: string | null
          website?: string | null
        }
        Update: {
          bio?: string | null
          checked_in_at?: string | null
          company?: string | null
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          decline_alternative?: string | null
          decline_reason?: string | null
          email?: string | null
          event_id?: string
          event_role?: string
          ghl_contact_id?: string | null
          id?: string
          is_published?: boolean | null
          job_title?: string | null
          linkedin_url?: string | null
          name?: string
          photo_url?: string | null
          sort_order?: number | null
          status?: string
          twitter_handle?: string | null
          updated_at?: string | null
          user_id?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "speakers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "speakers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_contacts: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          name: string
          portal_token: string | null
          sponsor_id: string
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          portal_token?: string | null
          sponsor_id: string
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          portal_token?: string | null
          sponsor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_contacts_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "event_sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_leads: {
        Row: {
          attendee_email: string | null
          attendee_name: string | null
          company: string | null
          created_at: string | null
          event_id: string
          id: string
          job_title: string | null
          note: string | null
          quality: string | null
          registration_id: string | null
          scanned_by_contact_name: string | null
          sponsor_id: string
        }
        Insert: {
          attendee_email?: string | null
          attendee_name?: string | null
          company?: string | null
          created_at?: string | null
          event_id: string
          id?: string
          job_title?: string | null
          note?: string | null
          quality?: string | null
          registration_id?: string | null
          scanned_by_contact_name?: string | null
          sponsor_id: string
        }
        Update: {
          attendee_email?: string | null
          attendee_name?: string | null
          company?: string | null
          created_at?: string | null
          event_id?: string
          id?: string
          job_title?: string | null
          note?: string | null
          quality?: string | null
          registration_id?: string | null
          scanned_by_contact_name?: string | null
          sponsor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_leads_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_leads_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_leads_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "event_sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_invites: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          email: string
          event_id: string
          id: string
          invited_by: string | null
          role: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          email: string
          event_id: string
          id?: string
          invited_by?: string | null
          role?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          email?: string
          event_id?: string
          id?: string
          invited_by?: string | null
          role?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_invites_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_answers: {
        Row: {
          answer_choice: string[] | null
          answer_number: number | null
          answer_text: string | null
          created_at: string | null
          id: string
          question_id: string
          response_id: string
        }
        Insert: {
          answer_choice?: string[] | null
          answer_number?: number | null
          answer_text?: string | null
          created_at?: string | null
          id?: string
          question_id: string
          response_id: string
        }
        Update: {
          answer_choice?: string[] | null
          answer_number?: number | null
          answer_text?: string | null
          created_at?: string | null
          id?: string
          question_id?: string
          response_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "survey_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_answers_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "survey_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_questions: {
        Row: {
          created_at: string | null
          id: string
          is_required: boolean | null
          options: Json | null
          question_text: string
          question_type: Database["public"]["Enums"]["question_type"] | null
          sort_order: number | null
          survey_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_required?: boolean | null
          options?: Json | null
          question_text: string
          question_type?: Database["public"]["Enums"]["question_type"] | null
          sort_order?: number | null
          survey_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_required?: boolean | null
          options?: Json | null
          question_text?: string
          question_type?: Database["public"]["Enums"]["question_type"] | null
          sort_order?: number | null
          survey_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_questions_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_responses: {
        Row: {
          id: string
          registration_id: string | null
          submitted_at: string | null
          survey_id: string
          user_id: string | null
        }
        Insert: {
          id?: string
          registration_id?: string | null
          submitted_at?: string | null
          survey_id: string
          user_id?: string | null
        }
        Update: {
          id?: string
          registration_id?: string | null
          submitted_at?: string | null
          survey_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "survey_responses_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_responses_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          questions: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          questions?: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          questions?: Json
        }
        Relationships: []
      }
      surveys: {
        Row: {
          audience: string | null
          closes_at: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          event_id: string
          id: string
          is_anonymous: boolean | null
          opens_at: string | null
          send_auto: boolean | null
          session_id: string | null
          status: Database["public"]["Enums"]["survey_status"] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          audience?: string | null
          closes_at?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          event_id: string
          id?: string
          is_anonymous?: boolean | null
          opens_at?: string | null
          send_auto?: boolean | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["survey_status"] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          audience?: string | null
          closes_at?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          event_id?: string
          id?: string
          is_anonymous?: boolean | null
          opens_at?: string | null
          send_auto?: boolean | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["survey_status"] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "surveys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surveys_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surveys_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_invite_allowlist: {
        Row: {
          created_at: string | null
          email: string
          id: string
          ticket_type_id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          ticket_type_id: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          ticket_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_invite_allowlist_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "ticket_types"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_type_product_mappings: {
        Row: {
          created_at: string
          currency: string | null
          event_id: string
          ghl_location_id: string
          ghl_price_id: string
          ghl_price_name: string | null
          ghl_product_id: string
          ghl_product_name: string | null
          id: string
          org_id: string
          price_cents: number | null
          ticket_type_id: string
        }
        Insert: {
          created_at?: string
          currency?: string | null
          event_id: string
          ghl_location_id: string
          ghl_price_id: string
          ghl_price_name?: string | null
          ghl_product_id: string
          ghl_product_name?: string | null
          id?: string
          org_id: string
          price_cents?: number | null
          ticket_type_id: string
        }
        Update: {
          created_at?: string
          currency?: string | null
          event_id?: string
          ghl_location_id?: string
          ghl_price_id?: string
          ghl_price_name?: string | null
          ghl_product_id?: string
          ghl_product_name?: string | null
          id?: string
          org_id?: string
          price_cents?: number | null
          ticket_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_type_product_mappings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_type_product_mappings_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "ticket_types"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_types: {
        Row: {
          confirmation_email_body: string | null
          confirmation_email_subject: string | null
          created_at: string | null
          currency: string | null
          delivery_method: string
          description: string | null
          early_bird_ends_at: string | null
          early_bird_price_cents: number | null
          event_id: string
          id: string
          invite_only: boolean
          is_active: boolean | null
          is_press: boolean
          is_visible: boolean | null
          max_per_order: number | null
          membership_provider: string | null
          membership_required: boolean
          name: string
          price_cents: number | null
          quantity: number | null
          quantity_sold: number | null
          sale_ends_at: string | null
          sale_starts_at: string | null
          sort_order: number | null
          type: Database["public"]["Enums"]["ticket_type"] | null
          updated_at: string | null
          waitlist_enabled: boolean
        }
        Insert: {
          confirmation_email_body?: string | null
          confirmation_email_subject?: string | null
          created_at?: string | null
          currency?: string | null
          delivery_method?: string
          description?: string | null
          early_bird_ends_at?: string | null
          early_bird_price_cents?: number | null
          event_id: string
          id?: string
          invite_only?: boolean
          is_active?: boolean | null
          is_press?: boolean
          is_visible?: boolean | null
          max_per_order?: number | null
          membership_provider?: string | null
          membership_required?: boolean
          name: string
          price_cents?: number | null
          quantity?: number | null
          quantity_sold?: number | null
          sale_ends_at?: string | null
          sale_starts_at?: string | null
          sort_order?: number | null
          type?: Database["public"]["Enums"]["ticket_type"] | null
          updated_at?: string | null
          waitlist_enabled?: boolean
        }
        Update: {
          confirmation_email_body?: string | null
          confirmation_email_subject?: string | null
          created_at?: string | null
          currency?: string | null
          delivery_method?: string
          description?: string | null
          early_bird_ends_at?: string | null
          early_bird_price_cents?: number | null
          event_id?: string
          id?: string
          invite_only?: boolean
          is_active?: boolean | null
          is_press?: boolean
          is_visible?: boolean | null
          max_per_order?: number | null
          membership_provider?: string | null
          membership_required?: boolean
          name?: string
          price_cents?: number | null
          quantity?: number | null
          quantity_sold?: number | null
          sale_ends_at?: string | null
          sale_starts_at?: string | null
          sort_order?: number | null
          type?: Database["public"]["Enums"]["ticket_type"] | null
          updated_at?: string | null
          waitlist_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ticket_types_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      tracks: {
        Row: {
          color: string | null
          created_at: string | null
          event_id: string
          id: string
          name: string
          sort_order: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          event_id: string
          id?: string
          name: string
          sort_order?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          event_id?: string
          id?: string
          name?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tracks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      trivia_answers: {
        Row: {
          answer_index: number
          created_at: string
          id: string
          is_correct: boolean
          question_id: string
          user_id: string
        }
        Insert: {
          answer_index: number
          created_at?: string
          id?: string
          is_correct?: boolean
          question_id: string
          user_id: string
        }
        Update: {
          answer_index?: number
          created_at?: string
          id?: string
          is_correct?: boolean
          question_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trivia_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "trivia_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      trivia_questions: {
        Row: {
          body: string | null
          category: string | null
          correct_index: number
          created_at: string
          difficulty: string | null
          event_id: string
          id: string
          is_active: boolean
          options: Json
          points: number
          question_text: string | null
          sort_order: number
        }
        Insert: {
          body?: string | null
          category?: string | null
          correct_index: number
          created_at?: string
          difficulty?: string | null
          event_id: string
          id?: string
          is_active?: boolean
          options?: Json
          points?: number
          question_text?: string | null
          sort_order?: number
        }
        Update: {
          body?: string | null
          category?: string | null
          correct_index?: number
          created_at?: string
          difficulty?: string | null
          event_id?: string
          id?: string
          is_active?: boolean
          options?: Json
          points?: number
          question_text?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "trivia_questions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          bio: string | null
          created_at: string
          display_name: string | null
          interests: string[] | null
          linkedin_url: string | null
          photo_url: string | null
          pronouns: string | null
          show_in_directory: boolean
          twitter_url: string | null
          updated_at: string
          user_id: string
          website_url: string | null
        }
        Insert: {
          bio?: string | null
          created_at?: string
          display_name?: string | null
          interests?: string[] | null
          linkedin_url?: string | null
          photo_url?: string | null
          pronouns?: string | null
          show_in_directory?: boolean
          twitter_url?: string | null
          updated_at?: string
          user_id: string
          website_url?: string | null
        }
        Update: {
          bio?: string | null
          created_at?: string
          display_name?: string | null
          interests?: string[] | null
          linkedin_url?: string | null
          photo_url?: string | null
          pronouns?: string | null
          show_in_directory?: boolean
          twitter_url?: string | null
          updated_at?: string
          user_id?: string
          website_url?: string | null
        }
        Relationships: []
      }
      venue_maps: {
        Row: {
          created_at: string | null
          event_id: string
          hotspots: Json | null
          id: string
          name: string
          sort_order: number | null
          storage_path: string
        }
        Insert: {
          created_at?: string | null
          event_id: string
          hotspots?: Json | null
          id?: string
          name?: string
          sort_order?: number | null
          storage_path: string
        }
        Update: {
          created_at?: string | null
          event_id?: string
          hotspots?: Json | null
          id?: string
          name?: string
          sort_order?: number | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_maps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      volunteer_alerts: {
        Row: {
          alert_type: string
          created_at: string | null
          event_id: string
          id: string
          message: string
          resolved: boolean
          resolved_at: string | null
          volunteer_id: string
        }
        Insert: {
          alert_type: string
          created_at?: string | null
          event_id: string
          id?: string
          message: string
          resolved?: boolean
          resolved_at?: string | null
          volunteer_id: string
        }
        Update: {
          alert_type?: string
          created_at?: string | null
          event_id?: string
          id?: string
          message?: string
          resolved?: boolean
          resolved_at?: string | null
          volunteer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "volunteer_alerts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "volunteer_alerts_volunteer_id_fkey"
            columns: ["volunteer_id"]
            isOneToOne: false
            referencedRelation: "volunteers"
            referencedColumns: ["id"]
          },
        ]
      }
      volunteers: {
        Row: {
          assigned_sessions: string[] | null
          clocked_in_at: string | null
          clocked_out_at: string | null
          created_at: string
          email: string
          event_id: string
          id: string
          name: string
          notes: string | null
          phone: string | null
          portal_access_token: string
          role: string
          shift_decline_reason: string | null
          shift_end: string | null
          shift_response: string | null
          shift_response_at: string | null
          shift_start: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          assigned_sessions?: string[] | null
          clocked_in_at?: string | null
          clocked_out_at?: string | null
          created_at?: string
          email: string
          event_id: string
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          portal_access_token?: string
          role: string
          shift_decline_reason?: string | null
          shift_end?: string | null
          shift_response?: string | null
          shift_response_at?: string | null
          shift_start?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          assigned_sessions?: string[] | null
          clocked_in_at?: string | null
          clocked_out_at?: string | null
          created_at?: string
          email?: string
          event_id?: string
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          portal_access_token?: string
          role?: string
          shift_decline_reason?: string | null
          shift_end?: string | null
          shift_response?: string | null
          shift_response_at?: string | null
          shift_start?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "volunteers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      waiver_signatures: {
        Row: {
          id: string
          registration_id: string | null
          signed_at: string | null
          user_id: string
          waiver_id: string
        }
        Insert: {
          id?: string
          registration_id?: string | null
          signed_at?: string | null
          user_id: string
          waiver_id: string
        }
        Update: {
          id?: string
          registration_id?: string | null
          signed_at?: string | null
          user_id?: string
          waiver_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waiver_signatures_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiver_signatures_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiver_signatures_waiver_id_fkey"
            columns: ["waiver_id"]
            isOneToOne: false
            referencedRelation: "event_waivers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      event_visible_profiles: {
        Row: {
          attendee_name: string | null
          avatar_url: string | null
          bio: string | null
          company: string | null
          created_at: string | null
          email: string | null
          event_id: string | null
          handle: string | null
          id: string | null
          interests: string[] | null
          job_title: string | null
          linkedin_url: string | null
          registration_id: string | null
          ticket_name: string | null
          twitter_url: string | null
          user_id: string | null
          website_url: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendee_profiles_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendee_profiles_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: true
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      event_org_id: { Args: { event_id: string }; Returns: string }
      generate_unique_handle: { Args: { base: string }; Returns: string }
      get_volunteer_by_token: {
        Args: { p_token: string }
        Returns: {
          assigned_sessions: string[] | null
          clocked_in_at: string | null
          clocked_out_at: string | null
          created_at: string
          email: string
          event_id: string
          id: string
          name: string
          notes: string | null
          phone: string | null
          portal_access_token: string
          role: string
          shift_decline_reason: string | null
          shift_end: string | null
          shift_response: string | null
          shift_response_at: string | null
          shift_start: string | null
          status: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "volunteers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_permission: {
        Args: { p_org_id: string; p_permission_key: string }
        Returns: boolean
      }
      increment_discount_uses: { Args: { code_id: string }; Returns: undefined }
      is_org_member: { Args: { org_id: string }; Returns: boolean }
      is_registered: { Args: { event_id: string }; Returns: boolean }
      role_org_id: { Args: { p_role_id: string }; Returns: string }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      announcement_channel: "email" | "push" | "both"
      announcement_status: "draft" | "scheduled" | "sent" | "sending" | "failed"
      audit_action:
        | "create"
        | "update"
        | "delete"
        | "login"
        | "logout"
        | "checkin"
        | "register"
        | "payment"
        | "export"
      checkin_method: "qr_scan" | "manual" | "kiosk" | "self"
      event_status:
        | "draft"
        | "published"
        | "live"
        | "ended"
        | "archived"
        | "cancelled"
      event_type: "in_person" | "virtual" | "hybrid"
      event_visibility: "public" | "private" | "unlisted"
      integration_status:
        | "awaiting_credentials"
        | "available"
        | "connected"
        | "error"
      message_status: "sent" | "delivered" | "read"
      org_role: "owner" | "admin" | "staff"
      question_type:
        | "text"
        | "textarea"
        | "single_choice"
        | "multiple_choice"
        | "rating"
        | "nps"
        | "boolean"
        | "yes_no"
      registration_status:
        | "pending"
        | "confirmed"
        | "cancelled"
        | "waitlisted"
        | "refunded"
      survey_status: "draft" | "active" | "closed"
      ticket_type: "free" | "paid" | "donation"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      announcement_channel: ["email", "push", "both"],
      announcement_status: ["draft", "scheduled", "sent", "sending", "failed"],
      audit_action: [
        "create",
        "update",
        "delete",
        "login",
        "logout",
        "checkin",
        "register",
        "payment",
        "export",
      ],
      checkin_method: ["qr_scan", "manual", "kiosk", "self"],
      event_status: [
        "draft",
        "published",
        "live",
        "ended",
        "archived",
        "cancelled",
      ],
      event_type: ["in_person", "virtual", "hybrid"],
      event_visibility: ["public", "private", "unlisted"],
      integration_status: [
        "awaiting_credentials",
        "available",
        "connected",
        "error",
      ],
      message_status: ["sent", "delivered", "read"],
      org_role: ["owner", "admin", "staff"],
      question_type: [
        "text",
        "textarea",
        "single_choice",
        "multiple_choice",
        "rating",
        "nps",
        "boolean",
        "yes_no",
      ],
      registration_status: [
        "pending",
        "confirmed",
        "cancelled",
        "waitlisted",
        "refunded",
      ],
      survey_status: ["draft", "active", "closed"],
      ticket_type: ["free", "paid", "donation"],
    },
  },
} as const

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      calendar_secrets: {
        Row: {
          access_token: string
          calendar_id: string
          refresh_token: string | null
          scope: string | null
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          calendar_id: string
          refresh_token?: string | null
          scope?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          calendar_id?: string
          refresh_token?: string | null
          scope?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_secrets_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: true
            referencedRelation: "calendars"
            referencedColumns: ["id"]
          },
        ]
      }
      calendars: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          last_error: string | null
          last_synced_at: string | null
          provider: Database["public"]["Enums"]["calendar_provider"]
          provider_account: string | null
          sync_cursor: string | null
          sync_state: Database["public"]["Enums"]["sync_status"]
          updated_at: string
          user_id: string
          writeback_enabled: boolean
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          provider: Database["public"]["Enums"]["calendar_provider"]
          provider_account?: string | null
          sync_cursor?: string | null
          sync_state?: Database["public"]["Enums"]["sync_status"]
          updated_at?: string
          user_id: string
          writeback_enabled?: boolean
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          provider?: Database["public"]["Enums"]["calendar_provider"]
          provider_account?: string | null
          sync_cursor?: string | null
          sync_state?: Database["public"]["Enums"]["sync_status"]
          updated_at?: string
          user_id?: string
          writeback_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "calendars_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      category_overrides: {
        Row: {
          category: string
          created_at: string
          state: Database["public"]["Enums"]["override_state"]
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          state: Database["public"]["Enums"]["override_state"]
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          state?: Database["public"]["Enums"]["override_state"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_writebacks: {
        Row: {
          calendar_id: string
          created_at: string
          proposal_id: string
          provider_event_id: string
          user_id: string
        }
        Insert: {
          calendar_id: string
          created_at?: string
          proposal_id: string
          provider_event_id: string
          user_id: string
        }
        Update: {
          calendar_id?: string
          created_at?: string
          proposal_id?: string
          provider_event_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_writebacks_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_writebacks_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_writebacks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          calendar_id: string
          category: string | null
          ends_at: string
          id: string
          is_all_day: boolean
          override: Database["public"]["Enums"]["override_state"] | null
          provider_busy: boolean
          provider_event_id: string
          starts_at: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          calendar_id: string
          category?: string | null
          ends_at: string
          id?: string
          is_all_day?: boolean
          override?: Database["public"]["Enums"]["override_state"] | null
          provider_busy?: boolean
          provider_event_id: string
          starts_at: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          calendar_id?: string
          category?: string | null
          ends_at?: string
          id?: string
          is_all_day?: boolean
          override?: Database["public"]["Enums"]["override_state"] | null
          provider_busy?: boolean
          provider_event_id?: string
          starts_at?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_invites: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string | null
          group_id: string
          id: string
          join_code: string | null
          max_uses: number | null
          revoked_at: string | null
          token: string
          use_count: number
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string | null
          group_id: string
          id?: string
          join_code?: string | null
          max_uses?: number | null
          revoked_at?: string | null
          token: string
          use_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string | null
          group_id?: string
          id?: string
          join_code?: string | null
          max_uses?: number | null
          revoked_at?: string | null
          token?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "group_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_invites_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          group_id: string
          joined_at: string
          role: Database["public"]["Enums"]["member_role"]
          status: Database["public"]["Enums"]["member_status"]
          user_id: string
        }
        Insert: {
          group_id: string
          joined_at?: string
          role?: Database["public"]["Enums"]["member_role"]
          status?: Database["public"]["Enums"]["member_status"]
          user_id: string
        }
        Update: {
          group_id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["member_role"]
          status?: Database["public"]["Enums"]["member_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          avatar_url: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          join_policy: Database["public"]["Enums"]["join_control"]
          name: string
          owner_id: string
          quorum: number | null
          slot_minutes: number
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          join_policy?: Database["public"]["Enums"]["join_control"]
          name: string
          owner_id: string
          quorum?: number | null
          slot_minutes?: number
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          join_policy?: Database["public"]["Enums"]["join_control"]
          name?: string
          owner_id?: string
          quorum?: number | null
          slot_minutes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_blocks: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          label: string | null
          rrule: string | null
          starts_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          label?: string | null
          rrule?: string | null
          starts_at: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          label?: string | null
          rrule?: string | null
          starts_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_blocks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          group_id: string | null
          id: string
          kind: string
          proposal_id: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          kind: string
          proposal_id?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          kind?: string
          proposal_id?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_invites: {
        Row: {
          created_at: string
          email: string
          expires_at: string | null
          group_id: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["member_role"]
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string | null
          group_id: string
          id?: string
          invited_by: string
          role?: Database["public"]["Enums"]["member_role"]
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string | null
          group_id?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["member_role"]
        }
        Relationships: [
          {
            foreignKeyName: "pending_invites_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          deleted_at: string | null
          display_name: string | null
          email: string
          first_name: string
          id: string
          last_name: string
          notif_prefs: Json
          time_zone: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          email: string
          first_name: string
          id: string
          last_name: string
          notif_prefs?: Json
          time_zone?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          notif_prefs?: Json
          time_zone?: string
          updated_at?: string
        }
        Relationships: []
      }
      proposal_options: {
        Row: {
          ends_at: string
          id: string
          proposal_id: string
          starts_at: string
        }
        Insert: {
          ends_at: string
          id?: string
          proposal_id: string
          starts_at: string
        }
        Update: {
          ends_at?: string
          id?: string
          proposal_id?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_options_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_responses: {
        Row: {
          created_at: string
          option_id: string
          proposal_id: string
          response: Database["public"]["Enums"]["rsvp"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          option_id: string
          proposal_id: string
          response: Database["public"]["Enums"]["rsvp"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          option_id?: string
          proposal_id?: string
          response?: Database["public"]["Enums"]["rsvp"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_responses_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "proposal_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_responses_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          final_option: string | null
          group_id: string
          id: string
          pinned_tz: string | null
          status: Database["public"]["Enums"]["proposal_status"]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          final_option?: string | null
          group_id: string
          id?: string
          pinned_tz?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          final_option?: string | null
          group_id?: string
          id?: string
          pinned_tz?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_final_option_fk"
            columns: ["final_option"]
            isOneToOne: false
            referencedRelation: "proposal_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_hangouts: {
        Row: {
          active: boolean
          created_at: string
          created_by: string
          description: string | null
          ends_at: string
          group_id: string
          id: string
          rrule: string
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by: string
          description?: string | null
          ends_at: string
          group_id: string
          id?: string
          rrule: string
          starts_at: string
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string
          description?: string | null
          ends_at?: string
          group_id?: string
          id?: string
          rrule?: string
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_hangouts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_hangouts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage_proposal: { Args: { p_proposal_id: string }; Returns: boolean }
      can_read_group_broadcast: { Args: { p_topic: string }; Returns: boolean }
      cancel_proposal: { Args: { p_proposal_id: string }; Returns: undefined }
      create_proposal: {
        Args: {
          p_description: string
          p_group_id: string
          p_options: Json
          p_pinned_tz: string
          p_title: string
        }
        Returns: string
      }
      dissolve_group: { Args: { p_group_id: string }; Returns: undefined }
      effective_event_busy_intervals: {
        Args: { p_from: string; p_to: string; p_user_id: string }
        Returns: {
          ends_at: string
          starts_at: string
        }[]
      }
      expand_block_occurrences: {
        Args: {
          p_end: string
          p_from: string
          p_rrule: string
          p_start: string
          p_to: string
        }
        Returns: {
          occ_end: string
          occ_start: string
        }[]
      }
      get_invite_preview: {
        Args: { p_token: string }
        Returns: {
          group_avatar_url: string
          group_id: string
          group_name: string
          inviter_name: string
          join_policy: Database["public"]["Enums"]["join_control"]
          member_count: number
        }[]
      }
      group_busy_intervals: {
        Args: { p_from: string; p_group_id: string; p_to: string }
        Returns: {
          ends_at: string
          starts_at: string
          user_id: string
        }[]
      }
      group_heatmap: {
        Args: {
          p_from: string
          p_group_id: string
          p_slot_minutes?: number
          p_to: string
        }
        Returns: {
          busy_count: number
          everyone_free: boolean
          free_count: number
          meets_quorum: boolean
          quorum: number
          slot_end: string
          slot_start: string
          total_members: number
        }[]
      }
      has_group_membership: { Args: { p_group_id: string }; Returns: boolean }
      is_group_admin: { Args: { p_group_id: string }; Returns: boolean }
      is_group_member: { Args: { p_group_id: string }; Returns: boolean }
      lock_proposal: {
        Args: { p_option_id: string; p_proposal_id: string }
        Returns: undefined
      }
      my_busy_intervals: {
        Args: { p_from: string; p_to: string }
        Returns: {
          ends_at: string
          starts_at: string
        }[]
      }
      proposal_group_id: { Args: { p_proposal_id: string }; Returns: string }
      proposal_results: {
        Args: { p_proposal_id: string }
        Returns: {
          available_count: number
          ends_at: string
          maybe_count: number
          meets_quorum: boolean
          no_count: number
          option_id: string
          quorum: number
          response_count: number
          starts_at: string
          total_members: number
          yes_count: number
        }[]
      }
      redeem_group_invite: {
        Args: { p_token: string }
        Returns: {
          group_id: string
          status: Database["public"]["Enums"]["member_status"]
        }[]
      }
      register_invite_signup: {
        Args: { p_token: string; p_email: string }
        Returns: undefined
      }
      shares_group_with: { Args: { p_user_id: string }; Returns: boolean }
      suggest_proposal_rsvps: {
        Args: { p_proposal_id: string }
        Returns: {
          option_id: string
          suggested: Database["public"]["Enums"]["rsvp"]
        }[]
      }
      transfer_group_ownership: {
        Args: { p_group_id: string; p_new_owner: string }
        Returns: undefined
      }
      upcoming_hangouts: {
        Args: { p_group_id: string; p_to: string }
        Returns: {
          description: string
          hangout_id: string
          occ_end: string
          occ_start: string
          title: string
        }[]
      }
    }
    Enums: {
      calendar_provider: "google" | "microsoft" | "apple_caldav" | "ics"
      join_control: "open" | "approval"
      member_role: "owner" | "admin" | "member"
      member_status: "active" | "pending"
      override_state: "free" | "blocked"
      proposal_status: "draft" | "open" | "locked" | "cancelled"
      rsvp: "yes" | "no" | "maybe"
      sync_status: "ok" | "syncing" | "error" | "revoked"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      calendar_provider: ["google", "microsoft", "apple_caldav", "ics"],
      join_control: ["open", "approval"],
      member_role: ["owner", "admin", "member"],
      member_status: ["active", "pending"],
      override_state: ["free", "blocked"],
      proposal_status: ["draft", "open", "locked", "cancelled"],
      rsvp: ["yes", "no", "maybe"],
      sync_status: ["ok", "syncing", "error", "revoked"],
    },
  },
} as const


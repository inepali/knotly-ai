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
      activity_events: {
        Row: {
          actor: string
          booking_id: string | null
          couple_visible: boolean
          created_at: string | null
          id: number
          payload: Json | null
          project_id: string | null
          summary: string
          thread_id: string | null
          type: string
          vendor_id: string | null
        }
        Insert: {
          actor: string
          booking_id?: string | null
          couple_visible?: boolean
          created_at?: string | null
          id?: number
          payload?: Json | null
          project_id?: string | null
          summary: string
          thread_id?: string | null
          type: string
          vendor_id?: string | null
        }
        Update: {
          actor?: string
          booking_id?: string | null
          couple_visible?: boolean
          created_at?: string | null
          id?: number
          payload?: Json | null
          project_id?: string | null
          summary?: string
          thread_id?: string | null
          type?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "couple_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_audit_log: {
        Row: {
          agent: string
          created_at: string | null
          decision: Json | null
          gate: Json | null
          id: number
          outcome: string | null
          thread_id: string | null
        }
        Insert: {
          agent: string
          created_at?: string | null
          decision?: Json | null
          gate?: Json | null
          id?: number
          outcome?: string | null
          thread_id?: string | null
        }
        Update: {
          agent?: string
          created_at?: string | null
          decision?: Json | null
          gate?: Json | null
          id?: number
          outcome?: string | null
          thread_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_audit_log_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          contract_due_at: string | null
          created_at: string | null
          event_date: string
          guest_count: number | null
          hold_expires_at: string | null
          hours: number | null
          id: string
          need_id: string | null
          note: string | null
          package_id: string
          price: number
          project_id: string
          retainer_amount: number | null
          start_time: string | null
          status: string
          thread_id: string | null
          updated_at: string | null
          vendor_id: string
          venue: string | null
        }
        Insert: {
          contract_due_at?: string | null
          created_at?: string | null
          event_date: string
          guest_count?: number | null
          hold_expires_at?: string | null
          hours?: number | null
          id?: string
          need_id?: string | null
          note?: string | null
          package_id: string
          price: number
          project_id: string
          retainer_amount?: number | null
          start_time?: string | null
          status?: string
          thread_id?: string | null
          updated_at?: string | null
          vendor_id: string
          venue?: string | null
        }
        Update: {
          contract_due_at?: string | null
          created_at?: string | null
          event_date?: string
          guest_count?: number | null
          hold_expires_at?: string | null
          hours?: number | null
          id?: string
          need_id?: string | null
          note?: string | null
          package_id?: string
          price?: number
          project_id?: string
          retainer_amount?: number | null
          start_time?: string | null
          status?: string
          thread_id?: string | null
          updated_at?: string | null
          vendor_id?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_need_id_fkey"
            columns: ["need_id"]
            isOneToOne: false
            referencedRelation: "needs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "vendor_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "couple_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_items: {
        Row: {
          booked: number | null
          booked_note: string | null
          booked_vendor_id: string | null
          booking_id: string | null
          category: string
          estimated: number
          id: string
          label: string | null
          paid: number
          planned: number | null
          planned_by: string | null
          project_id: string
          source: string
          updated_at: string
        }
        Insert: {
          booked?: number | null
          booked_note?: string | null
          booked_vendor_id?: string | null
          booking_id?: string | null
          category: string
          estimated?: number
          id?: string
          label?: string | null
          paid?: number
          planned?: number | null
          planned_by?: string | null
          project_id: string
          source?: string
          updated_at?: string
        }
        Update: {
          booked?: number | null
          booked_note?: string | null
          booked_vendor_id?: string | null
          booking_id?: string | null
          category?: string
          estimated?: number
          id?: string
          label?: string | null
          paid?: number
          planned?: number | null
          planned_by?: string | null
          project_id?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_items_booked_vendor_id_fkey"
            columns: ["booked_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_items_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "couple_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_items: {
        Row: {
          category: string | null
          created_at: string | null
          done_at: string | null
          due_date: string | null
          id: string
          need_id: string | null
          project_id: string
          snoozed_until: string | null
          status: string
          template_id: number | null
          title: string
          vendor_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          done_at?: string | null
          due_date?: string | null
          id?: string
          need_id?: string | null
          project_id: string
          snoozed_until?: string | null
          status?: string
          template_id?: number | null
          title: string
          vendor_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          done_at?: string | null
          due_date?: string | null
          id?: string
          need_id?: string | null
          project_id?: string
          snoozed_until?: string | null
          status?: string
          template_id?: number | null
          title?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_need_id_fkey"
            columns: ["need_id"]
            isOneToOne: false
            referencedRelation: "needs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "couple_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          category: string | null
          id: number
          months_before: number
          sort: number
          title: string
        }
        Insert: {
          category?: string | null
          id?: number
          months_before: number
          sort?: number
          title: string
        }
        Update: {
          category?: string | null
          id?: number
          months_before?: number
          sort?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_templates_category_fkey"
            columns: ["category"]
            isOneToOne: false
            referencedRelation: "vendor_categories"
            referencedColumns: ["slug"]
          },
        ]
      }
      consult_hours: {
        Row: {
          end_time: string
          id: string
          slot_minutes: number
          start_time: string
          timezone: string
          vendor_id: string
          weekday: number
        }
        Insert: {
          end_time: string
          id?: string
          slot_minutes?: number
          start_time: string
          timezone?: string
          vendor_id: string
          weekday: number
        }
        Update: {
          end_time?: string
          id?: string
          slot_minutes?: number
          start_time?: string
          timezone?: string
          vendor_id?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "consult_hours_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      consultations: {
        Row: {
          created_at: string | null
          ends_at: string
          id: string
          starts_at: string
          status: string
          thread_id: string
          vendor_id: string
        }
        Insert: {
          created_at?: string | null
          ends_at: string
          id?: string
          starts_at: string
          status?: string
          thread_id: string
          vendor_id: string
        }
        Update: {
          created_at?: string | null
          ends_at?: string
          id?: string
          starts_at?: string
          status?: string
          thread_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultations_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultations_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_templates: {
        Row: {
          body: string
          cancellation_policy: string | null
          custom_terms: string | null
          updated_at: string | null
          vendor_id: string
        }
        Insert: {
          body: string
          cancellation_policy?: string | null
          custom_terms?: string | null
          updated_at?: string | null
          vendor_id: string
        }
        Update: {
          body?: string
          cancellation_policy?: string | null
          custom_terms?: string | null
          updated_at?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_templates_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: true
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          body_rendered: string
          booking_id: string
          couple_signed_at: string | null
          couple_signed_ip: unknown
          couple_signed_name: string | null
          created_at: string | null
          id: string
          pdf_path: string | null
          status: string
          vendor_signed_at: string | null
        }
        Insert: {
          body_rendered: string
          booking_id: string
          couple_signed_at?: string | null
          couple_signed_ip?: unknown
          couple_signed_name?: string | null
          created_at?: string | null
          id?: string
          pdf_path?: string | null
          status?: string
          vendor_signed_at?: string | null
        }
        Update: {
          body_rendered?: string
          booking_id?: string
          couple_signed_at?: string | null
          couple_signed_ip?: unknown
          couple_signed_name?: string | null
          created_at?: string | null
          id?: string
          pdf_path?: string | null
          status?: string
          vendor_signed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      couple_projects: {
        Row: {
          budget_total: number | null
          calendar_token: string
          couple_id: string
          created_at: string | null
          guest_count: number | null
          id: string
          metro_slug: string | null
          needs: string[] | null
          partner_names: string | null
          style: string | null
          timeline_share_token: string
          venue: string | null
          venue_address: string | null
          wedding_date: string | null
        }
        Insert: {
          budget_total?: number | null
          calendar_token?: string
          couple_id: string
          created_at?: string | null
          guest_count?: number | null
          id?: string
          metro_slug?: string | null
          needs?: string[] | null
          partner_names?: string | null
          style?: string | null
          timeline_share_token?: string
          venue?: string | null
          venue_address?: string | null
          wedding_date?: string | null
        }
        Update: {
          budget_total?: number | null
          calendar_token?: string
          couple_id?: string
          created_at?: string | null
          guest_count?: number | null
          id?: string
          metro_slug?: string | null
          needs?: string[] | null
          partner_names?: string | null
          style?: string | null
          timeline_share_token?: string
          venue?: string | null
          venue_address?: string | null
          wedding_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "couple_projects_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "couple_projects_metro_slug_fkey"
            columns: ["metro_slug"]
            isOneToOne: false
            referencedRelation: "metros"
            referencedColumns: ["slug"]
          },
        ]
      }
      document_shares: {
        Row: {
          document_id: string
          vendor_id: string
        }
        Insert: {
          document_id: string
          vendor_id: string
        }
        Update: {
          document_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_shares_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_shares_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          booking_id: string | null
          created_at: string | null
          id: string
          name: string
          project_id: string
          size_bytes: number | null
          storage_path: string
          tag: string
          uploaded_by: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string | null
          id?: string
          name: string
          project_id: string
          size_bytes?: number | null
          storage_path: string
          tag?: string
          uploaded_by?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string | null
          id?: string
          name?: string
          project_id?: string
          size_bytes?: number | null
          storage_path?: string
          tag?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "couple_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      escalations: {
        Row: {
          created_at: string | null
          decision: Json
          due_at: string
          id: string
          reason: string
          resolution: string | null
          resolved_at: string | null
          status: string
          thread_id: string
          total: number | null
          vendor_id: string
          violations: string[]
        }
        Insert: {
          created_at?: string | null
          decision: Json
          due_at: string
          id?: string
          reason: string
          resolution?: string | null
          resolved_at?: string | null
          status?: string
          thread_id: string
          total?: number | null
          vendor_id: string
          violations: string[]
        }
        Update: {
          created_at?: string | null
          decision?: Json
          due_at?: string
          id?: string
          reason?: string
          resolution?: string | null
          resolved_at?: string | null
          status?: string
          thread_id?: string
          total?: number | null
          vendor_id?: string
          violations?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "escalations_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalations_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      guests: {
        Row: {
          created_at: string | null
          dietary: string | null
          email: string | null
          first_name: string
          household: string | null
          id: string
          last_name: string | null
          meal: string | null
          phone: string | null
          plus_one_allowed: boolean
          plus_one_name: string | null
          project_id: string
          rsvp: string
          rsvp_at: string | null
          side: string | null
          table_name: string | null
          tags: string[]
        }
        Insert: {
          created_at?: string | null
          dietary?: string | null
          email?: string | null
          first_name: string
          household?: string | null
          id?: string
          last_name?: string | null
          meal?: string | null
          phone?: string | null
          plus_one_allowed?: boolean
          plus_one_name?: string | null
          project_id: string
          rsvp?: string
          rsvp_at?: string | null
          side?: string | null
          table_name?: string | null
          tags?: string[]
        }
        Update: {
          created_at?: string | null
          dietary?: string | null
          email?: string | null
          first_name?: string
          household?: string | null
          id?: string
          last_name?: string | null
          meal?: string | null
          phone?: string | null
          plus_one_allowed?: boolean
          plus_one_name?: string | null
          project_id?: string
          rsvp?: string
          rsvp_at?: string | null
          side?: string | null
          table_name?: string | null
          tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "guests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "couple_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      help_usage: {
        Row: {
          day: string
          messages: number
          profile_id: string
        }
        Insert: {
          day?: string
          messages?: number
          profile_id: string
        }
        Update: {
          day?: string
          messages?: number
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "help_usage_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_credit_ledger: {
        Row: {
          created_at: string | null
          delta: number
          id: number
          quote_id: string | null
          reason: string
          vendor_id: string
        }
        Insert: {
          created_at?: string | null
          delta: number
          id?: number
          quote_id?: string | null
          reason: string
          vendor_id: string
        }
        Update: {
          created_at?: string | null
          delta?: number
          id?: number
          quote_id?: string | null
          reason?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_credit_ledger_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_credit_ledger_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          body: string
          channel: string
          event: string
          id: string
          subject: string | null
          updated_at: string | null
          vendor_id: string | null
        }
        Insert: {
          body: string
          channel: string
          event: string
          id?: string
          subject?: string | null
          updated_at?: string | null
          vendor_id?: string | null
        }
        Update: {
          body?: string
          channel?: string
          event?: string
          id?: string
          subject?: string | null
          updated_at?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          created_at: string | null
          emailed_at: string | null
          id: string
          payload: Json | null
          read_at: string | null
          sender: string
          status: string
          subject: string | null
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string | null
          emailed_at?: string | null
          id?: string
          payload?: Json | null
          read_at?: string | null
          sender: string
          status?: string
          subject?: string | null
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string | null
          emailed_at?: string | null
          id?: string
          payload?: Json | null
          read_at?: string | null
          sender?: string
          status?: string
          subject?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      metros: {
        Row: {
          lat: number
          lng: number
          name: string
          slug: string
          state: string
        }
        Insert: {
          lat: number
          lng: number
          name: string
          slug: string
          state: string
        }
        Update: {
          lat?: number
          lng?: number
          name?: string
          slug?: string
          state?: string
        }
        Relationships: []
      }
      needs: {
        Row: {
          booking_id: string | null
          budget: number | null
          category: string
          created_at: string | null
          id: string
          must_haves: string[]
          notes: string | null
          priority: number
          project_id: string
          status: string
        }
        Insert: {
          booking_id?: string | null
          budget?: number | null
          category: string
          created_at?: string | null
          id?: string
          must_haves?: string[]
          notes?: string | null
          priority?: number
          project_id: string
          status?: string
        }
        Update: {
          booking_id?: string | null
          budget?: number | null
          category?: string
          created_at?: string | null
          id?: string
          must_haves?: string[]
          notes?: string | null
          priority?: number
          project_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "needs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "needs_category_fkey"
            columns: ["category"]
            isOneToOne: false
            referencedRelation: "vendor_categories"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "needs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "couple_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      outbox: {
        Row: {
          attempts: number
          cancel_key: string | null
          channel: string
          created_at: string | null
          id: number
          last_error: string | null
          payload: Json
          send_after: string
          sent_at: string | null
          status: string
          template: string
          to_profile: string
        }
        Insert: {
          attempts?: number
          cancel_key?: string | null
          channel: string
          created_at?: string | null
          id?: number
          last_error?: string | null
          payload: Json
          send_after?: string
          sent_at?: string | null
          status?: string
          template: string
          to_profile: string
        }
        Update: {
          attempts?: number
          cancel_key?: string | null
          channel?: string
          created_at?: string | null
          id?: number
          last_error?: string | null
          payload?: Json
          send_after?: string
          sent_at?: string | null
          status?: string
          template?: string
          to_profile?: string
        }
        Relationships: [
          {
            foreignKeyName: "outbox_to_profile_fkey"
            columns: ["to_profile"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_verifications: {
        Row: {
          created_at: string | null
          email: string
          guest_id: string
          mode: string
        }
        Insert: {
          created_at?: string | null
          email: string
          guest_id: string
          mode: string
        }
        Update: {
          created_at?: string | null
          email?: string
          guest_id?: string
          mode?: string
        }
        Relationships: []
      }
      personal_events: {
        Row: {
          ends_at: string | null
          id: string
          notes: string | null
          project_id: string
          starts_at: string
          title: string
        }
        Insert: {
          ends_at?: string | null
          id?: string
          notes?: string | null
          project_id: string
          starts_at: string
          title: string
        }
        Update: {
          ends_at?: string | null
          id?: string
          notes?: string | null
          project_id?: string
          starts_at?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "couple_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_pricing: {
        Row: {
          estimate_view_cents: number
          monthly_price_cents: number | null
          plan: string
          sms_cents: number | null
          sms_included: number
        }
        Insert: {
          estimate_view_cents?: number
          monthly_price_cents?: number | null
          plan: string
          sms_cents?: number | null
          sms_included?: number
        }
        Update: {
          estimate_view_cents?: number
          monthly_price_cents?: number | null
          plan?: string
          sms_cents?: number | null
          sms_included?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          is_guest: boolean
          notify_prefs: Json
          onboarded: boolean
          phone: string | null
          phone_verified: boolean
          role: string
          sms_opt_in_at: string | null
          terms_accepted_at: string | null
          terms_version: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          is_guest?: boolean
          notify_prefs?: Json
          onboarded?: boolean
          phone?: string | null
          phone_verified?: boolean
          role?: string
          sms_opt_in_at?: string | null
          terms_accepted_at?: string | null
          terms_version?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_guest?: boolean
          notify_prefs?: Json
          onboarded?: boolean
          phone?: string | null
          phone_verified?: boolean
          role?: string
          sms_opt_in_at?: string | null
          terms_accepted_at?: string | null
          terms_version?: string | null
        }
        Relationships: []
      }
      quotes: {
        Row: {
          booking_id: string | null
          created_at: string | null
          first_viewed_at: string | null
          id: string
          line_items: Json
          package_id: string | null
          status: string
          thread_id: string
          total: number
          valid_until: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string | null
          first_viewed_at?: string | null
          id?: string
          line_items: Json
          package_id?: string | null
          status?: string
          thread_id: string
          total: number
          valid_until: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string | null
          first_viewed_at?: string | null
          id?: string
          line_items?: Json
          package_id?: string | null
          status?: string
          thread_id?: string
          total?: number
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "vendor_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      registry_links: {
        Row: {
          id: string
          kind: string
          note: string | null
          project_id: string
          sort: number
          title: string
          url: string | null
        }
        Insert: {
          id?: string
          kind?: string
          note?: string | null
          project_id: string
          sort?: number
          title: string
          url?: string | null
        }
        Update: {
          id?: string
          kind?: string
          note?: string | null
          project_id?: string
          sort?: number
          title?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registry_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "couple_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      testimonials: {
        Row: {
          author_name: string
          body: string
          booking_id: string | null
          created_at: string | null
          id: string
          rating: number | null
          review_token: string | null
          vendor_id: string
          verified: boolean
        }
        Insert: {
          author_name: string
          body: string
          booking_id?: string | null
          created_at?: string | null
          id?: string
          rating?: number | null
          review_token?: string | null
          vendor_id: string
          verified?: boolean
        }
        Update: {
          author_name?: string
          body?: string
          booking_id?: string | null
          created_at?: string | null
          id?: string
          rating?: number | null
          review_token?: string | null
          vendor_id?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "testimonials_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "testimonials_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      threads: {
        Row: {
          booking_id: string | null
          created_at: string | null
          id: string
          project_id: string
          status: string
          vendor_agent_paused: boolean
          vendor_id: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string | null
          id?: string
          project_id: string
          status?: string
          vendor_agent_paused?: boolean
          vendor_id: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string | null
          id?: string
          project_id?: string
          status?: string
          vendor_agent_paused?: boolean
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "threads_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "threads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "couple_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "threads_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      timeline_assignments: {
        Row: {
          event_id: string
          vendor_id: string
        }
        Insert: {
          event_id: string
          vendor_id: string
        }
        Update: {
          event_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timeline_assignments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "timeline_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_assignments_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      timeline_events: {
        Row: {
          duration_min: number | null
          id: string
          location: string | null
          notes: string | null
          project_id: string
          sort: number
          starts_at: string
          title: string
          visibility: string
        }
        Insert: {
          duration_min?: number | null
          id?: string
          location?: string | null
          notes?: string | null
          project_id: string
          sort?: number
          starts_at: string
          title: string
          visibility?: string
        }
        Update: {
          duration_min?: number | null
          id?: string
          location?: string | null
          notes?: string | null
          project_id?: string
          sort?: number
          starts_at?: string
          title?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "timeline_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "couple_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_addons: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          price: number
          vendor_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          price: number
          vendor_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          price?: number
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_addons_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_agent_rules: {
        Row: {
          active: boolean
          created_at: string | null
          id: string
          kind: string
          params: Json
          source_text: string | null
          vendor_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string | null
          id?: string
          kind: string
          params: Json
          source_text?: string | null
          vendor_id: string
        }
        Update: {
          active?: boolean
          created_at?: string | null
          id?: string
          kind?: string
          params?: Json
          source_text?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_agent_rules_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_agent_settings: {
        Row: {
          auto_countersign: boolean
          autonomy_level: number
          call_link: string | null
          call_min_notice_hours: number
          calls_per_day: number
          confidence_threshold: number
          contract_days: number
          followup_days: number[]
          hold_days: number
          holding_reply: string
          kb_ai_threshold: number
          kb_answer_threshold: number
          min_notice_days: number
          paused: boolean
          quiet_hours: Json | null
          quote_valid_days: number
          signature: string | null
          sms_enabled: boolean
          vendor_id: string
        }
        Insert: {
          auto_countersign?: boolean
          autonomy_level?: number
          call_link?: string | null
          call_min_notice_hours?: number
          calls_per_day?: number
          confidence_threshold?: number
          contract_days?: number
          followup_days?: number[]
          hold_days?: number
          holding_reply?: string
          kb_ai_threshold?: number
          kb_answer_threshold?: number
          min_notice_days?: number
          paused?: boolean
          quiet_hours?: Json | null
          quote_valid_days?: number
          signature?: string | null
          sms_enabled?: boolean
          vendor_id: string
        }
        Update: {
          auto_countersign?: boolean
          autonomy_level?: number
          call_link?: string | null
          call_min_notice_hours?: number
          calls_per_day?: number
          confidence_threshold?: number
          contract_days?: number
          followup_days?: number[]
          hold_days?: number
          holding_reply?: string
          kb_ai_threshold?: number
          kb_answer_threshold?: number
          min_notice_days?: number
          paused?: boolean
          quiet_hours?: Json | null
          quote_valid_days?: number
          signature?: string | null
          sms_enabled?: boolean
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_agent_settings_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: true
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_availability: {
        Row: {
          booking_id: string | null
          date: string
          hold_expires_at: string | null
          status: string
          thread_id: string
          vendor_id: string
        }
        Insert: {
          booking_id?: string | null
          date: string
          hold_expires_at?: string | null
          status: string
          thread_id: string
          vendor_id: string
        }
        Update: {
          booking_id?: string | null
          date?: string
          hold_expires_at?: string | null
          status?: string
          thread_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_availability_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_availability_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_categories: {
        Row: {
          active: boolean
          category_group: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          category_group: string
          name: string
          slug: string
          sort_order: number
        }
        Update: {
          active?: boolean
          category_group?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      vendor_knowledge: {
        Row: {
          answer: string | null
          chars: number | null
          created_at: string
          error: string | null
          file_path: string | null
          id: string
          kind: string
          question: string | null
          status: string
          title: string | null
          updated_at: string
          url: string | null
          vendor_id: string
        }
        Insert: {
          answer?: string | null
          chars?: number | null
          created_at?: string
          error?: string | null
          file_path?: string | null
          id?: string
          kind: string
          question?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          url?: string | null
          vendor_id: string
        }
        Update: {
          answer?: string | null
          chars?: number | null
          created_at?: string
          error?: string | null
          file_path?: string | null
          id?: string
          kind?: string
          question?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          url?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_knowledge_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_knowledge_chunks: {
        Row: {
          content: string
          embedding: string
          id: number
          page_url: string | null
          source_id: string
          vendor_id: string
        }
        Insert: {
          content: string
          embedding: string
          id?: number
          page_url?: string | null
          source_id: string
          vendor_id: string
        }
        Update: {
          content?: string
          embedding?: string
          id?: number
          page_url?: string | null
          source_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_knowledge_chunks_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "vendor_knowledge"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_knowledge_chunks_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_knowledge_pages: {
        Row: {
          chars: number | null
          error: string | null
          id: string
          source_id: string
          status: string
          title: string | null
          updated_at: string
          url: string
          vendor_id: string
        }
        Insert: {
          chars?: number | null
          error?: string | null
          id?: string
          source_id: string
          status?: string
          title?: string | null
          updated_at?: string
          url: string
          vendor_id: string
        }
        Update: {
          chars?: number | null
          error?: string | null
          id?: string
          source_id?: string
          status?: string
          title?: string | null
          updated_at?: string
          url?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_knowledge_pages_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "vendor_knowledge"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_knowledge_pages_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_packages: {
        Row: {
          active: boolean
          deliverables: Json
          description: string | null
          hours: number | null
          id: string
          inclusions: string[] | null
          name: string
          price: number
          retainer_amount: number | null
          sort: number
          vendor_id: string
        }
        Insert: {
          active?: boolean
          deliverables?: Json
          description?: string | null
          hours?: number | null
          id?: string
          inclusions?: string[] | null
          name: string
          price: number
          retainer_amount?: number | null
          sort?: number
          vendor_id: string
        }
        Update: {
          active?: boolean
          deliverables?: Json
          description?: string | null
          hours?: number | null
          id?: string
          inclusions?: string[] | null
          name?: string
          price?: number
          retainer_amount?: number | null
          sort?: number
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_packages_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_tasks: {
        Row: {
          booking_id: string | null
          created_at: string | null
          done_at: string | null
          due_at: string | null
          id: string
          title: string
          vendor_id: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string | null
          done_at?: string | null
          due_at?: string | null
          id?: string
          title: string
          vendor_id: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string | null
          done_at?: string | null
          due_at?: string | null
          id?: string
          title?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_tasks_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_tasks_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_usage: {
        Row: {
          amount_cents: number
          created_at: string | null
          id: number
          kind: string
          period: string
          ref_id: string | null
          vendor_id: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string | null
          id?: number
          kind: string
          period?: string
          ref_id?: string | null
          vendor_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string | null
          id?: number
          kind?: string
          period?: string
          ref_id?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_usage_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          bio: string | null
          business_name: string
          category: string
          embedding: string | null
          id: string
          instagram: string | null
          location: unknown
          metro_slug: string | null
          phone: string | null
          photos: string[]
          plan: string
          plan_renews_at: string | null
          price_max: number | null
          price_min: number | null
          published: boolean
          service_radius_miles: number | null
          slug: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          bio?: string | null
          business_name: string
          category: string
          embedding?: string | null
          id: string
          instagram?: string | null
          location?: unknown
          metro_slug?: string | null
          phone?: string | null
          photos?: string[]
          plan?: string
          plan_renews_at?: string | null
          price_max?: number | null
          price_min?: number | null
          published?: boolean
          service_radius_miles?: number | null
          slug?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          bio?: string | null
          business_name?: string
          category?: string
          embedding?: string | null
          id?: string
          instagram?: string | null
          location?: unknown
          metro_slug?: string | null
          phone?: string | null
          photos?: string[]
          plan?: string
          plan_renews_at?: string | null
          price_max?: number | null
          price_min?: number | null
          published?: boolean
          service_radius_miles?: number | null
          slug?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_category_fkey"
            columns: ["category"]
            isOneToOne: false
            referencedRelation: "vendor_categories"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "vendors_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_metro_slug_fkey"
            columns: ["metro_slug"]
            isOneToOne: false
            referencedRelation: "metros"
            referencedColumns: ["slug"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount_cents: number
          created_at: string | null
          id: number
          kind: string
          stripe_ref: string | null
          usage_id: number | null
          vendor_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string | null
          id?: number
          kind: string
          stripe_ref?: string | null
          usage_id?: number | null
          vendor_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string | null
          id?: number
          kind?: string
          stripe_ref?: string | null
          usage_id?: number | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_usage_id_fkey"
            columns: ["usage_id"]
            isOneToOne: false
            referencedRelation: "vendor_usage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      wedding_websites: {
        Row: {
          cover_path: string | null
          password_hash: string | null
          project_id: string
          published: boolean
          sections: Json
          slug: string
          template: string
          updated_at: string | null
        }
        Insert: {
          cover_path?: string | null
          password_hash?: string | null
          project_id: string
          published?: boolean
          sections?: Json
          slug: string
          template?: string
          updated_at?: string | null
        }
        Update: {
          cover_path?: string | null
          password_hash?: string | null
          project_id?: string
          published?: boolean
          sections?: Json
          slug?: string
          template?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wedding_websites_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "couple_projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
      vendor_agent_stats: {
        Row: {
          approved_as_is: number | null
          changed_by_human: number | null
          escalated: number | null
          sent_alone: number | null
          vendor_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "threads_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      charge_estimate_view: { Args: { p_quote: string }; Returns: undefined }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      find_rsvp: {
        Args: {
          p_first: string
          p_last: string
          p_password: string
          p_slug: string
        }
        Returns: Json
      }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      gettransactionid: { Args: never; Returns: unknown }
      is_vendor: { Args: never; Returns: boolean }
      longtransactionsenabled: { Args: never; Returns: boolean }
      mark_thread_read: { Args: { p_thread: string }; Returns: undefined }
      match_vendor_knowledge: {
        Args: { p_limit?: number; p_vendor: string; query_embedding: string }
        Returns: {
          content: string
          kind: string
          similarity: number
          source_id: string
          title: string
          url: string
        }[]
      }
      match_vendors: {
        Args: {
          p_category?: string
          p_lat?: number
          p_limit?: number
          p_lng?: number
          p_max_price?: number
          p_radius_miles?: number
          query_embedding: string
        }
        Returns: {
          avg_rating: number
          bio: string
          business_name: string
          category: string
          distance_miles: number
          id: string
          price_max: number
          price_min: number
          review_count: number
          similarity: number
        }[]
      }
      merge_guest_into_user: {
        Args: { p_guest: string; p_user: string }
        Returns: Json
      }
      owns_document: { Args: { d: string }; Returns: boolean }
      owns_project: { Args: { p: string }; Returns: boolean }
      owns_thread: { Args: { t: string }; Returns: boolean }
      owns_timeline_event: { Args: { e: string }; Returns: boolean }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      public_website: {
        Args: { p_password?: string; p_slug: string }
        Returns: Json
      }
      record_sms_usage: {
        Args: { p_outbox_id: number; p_vendor: string }
        Returns: number
      }
      set_website_password: {
        Args: { p_password: string; p_project: string }
        Returns: undefined
      }
      shared_timeline: { Args: { p_token: string }; Returns: Json }
      slugify: { Args: { t: string }; Returns: string }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      storage_owner_folder: { Args: { p_name: string }; Returns: string }
      submit_rsvp: {
        Args: {
          p_dietary?: string
          p_guest: string
          p_meal?: string
          p_password: string
          p_plus_one_name?: string
          p_rsvp: string
          p_slug: string
        }
        Returns: boolean
      }
      take_help_message: { Args: never; Returns: boolean }
      unlockrows: { Args: { "": string }; Returns: number }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
      vendor_credit_balance: { Args: { v: string }; Returns: number }
      vendor_was_contacted: { Args: { p_project: string }; Returns: boolean }
      view_quote: {
        Args: { p_quote: string }
        Returns: {
          booking_id: string | null
          created_at: string | null
          first_viewed_at: string | null
          id: string
          line_items: Json
          package_id: string | null
          status: string
          thread_id: string
          total: number
          valid_until: string
        }[]
        SetofOptions: {
          from: "*"
          to: "quotes"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      wallet_balance: { Args: { v: string }; Returns: number }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
    Enums: {},
  },
} as const

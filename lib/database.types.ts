// Generated from the live Supabase project (dos-tazas-pos) — do not hand-edit.
// Regenerate with the Supabase MCP `generate_typescript_types` tool (or
// `supabase gen types typescript`) after any migration that changes the
// public schema, so drift between the DB and these types is a compile
// error here rather than a silent runtime surprise in lib/queries.ts.

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
      cash_movements: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          location_id: string
          reason: string
          shift_id: string
          type: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          location_id: string
          reason: string
          shift_id: string
          type: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string
          reason?: string
          shift_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          location_id: string
          name: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          location_id: string
          name: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string
          name?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      location_members: {
        Row: {
          created_at: string
          location_id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          location_id: string
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          location_id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_members_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      location_settings: {
        Row: {
          address: string | null
          business_legal_name: string | null
          created_at: string
          currency: string
          location_id: string
          phone: string | null
          prices_include_tax: boolean
          receipt_footer: string | null
          tax_id: string | null
          tax_rate: number
          timezone: string
          tip_enabled: boolean
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_legal_name?: string | null
          created_at?: string
          currency?: string
          location_id: string
          phone?: string | null
          prices_include_tax?: boolean
          receipt_footer?: string | null
          tax_id?: string | null
          tax_rate?: number
          timezone?: string
          tip_enabled?: boolean
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_legal_name?: string | null
          created_at?: string
          currency?: string
          location_id?: string
          phone?: string | null
          prices_include_tax?: boolean
          receipt_footer?: string | null
          tax_id?: string | null
          tax_rate?: number
          timezone?: string
          tip_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_settings_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: true
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          archived_at: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_modifiers: {
        Row: {
          menu_item_id: string
          modifier_id: string
        }
        Insert: {
          menu_item_id: string
          modifier_id: string
        }
        Update: {
          menu_item_id?: string
          modifier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_modifiers_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_modifiers_modifier_id_fkey"
            columns: ["modifier_id"]
            isOneToOne: false
            referencedRelation: "modifiers"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          archived_at: string | null
          available_quantity: number | null
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_available: boolean
          location_id: string
          low_stock_threshold: number
          name: string
          price: number
          track_inventory: boolean
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          available_quantity?: number | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_available?: boolean
          location_id: string
          low_stock_threshold?: number
          name: string
          price: number
          track_inventory?: boolean
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          available_quantity?: number | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_available?: boolean
          location_id?: string
          low_stock_threshold?: number
          name?: string
          price?: number
          track_inventory?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      modifier_options: {
        Row: {
          archived_at: string | null
          created_at: string
          extra_price: number
          id: string
          modifier_id: string
          name: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          extra_price?: number
          id?: string
          modifier_id: string
          name: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          extra_price?: number
          id?: string
          modifier_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "modifier_options_modifier_id_fkey"
            columns: ["modifier_id"]
            isOneToOne: false
            referencedRelation: "modifiers"
            referencedColumns: ["id"]
          },
        ]
      }
      modifiers: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          is_multiple: boolean
          is_required: boolean
          location_id: string
          name: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          is_multiple?: boolean
          is_required?: boolean
          location_id: string
          name: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          is_multiple?: boolean
          is_required?: boolean
          location_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "modifiers_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      order_audit: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          location_id: string
          order_id: string | null
          order_snapshot: Json | null
          reason: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          location_id: string
          order_id?: string | null
          order_snapshot?: Json | null
          reason?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          location_id?: string
          order_id?: string | null
          order_snapshot?: Json | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_audit_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_audit_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_audit_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_counters: {
        Row: {
          last_number: number
          location_id: string
          order_date: string
        }
        Insert: {
          last_number?: number
          location_id: string
          order_date: string
        }
        Update: {
          last_number?: number
          location_id?: string
          order_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_counters_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      order_item_modifiers: {
        Row: {
          created_at: string
          extra_price: number
          id: string
          modifier_option_id: string
          name: string
          order_item_id: string
        }
        Insert: {
          created_at?: string
          extra_price?: number
          id?: string
          modifier_option_id: string
          name: string
          order_item_id: string
        }
        Update: {
          created_at?: string
          extra_price?: number
          id?: string
          modifier_option_id?: string
          name?: string
          order_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_item_modifiers_modifier_option_id_fkey"
            columns: ["modifier_option_id"]
            isOneToOne: false
            referencedRelation: "modifier_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_modifiers_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          menu_item_id: string
          notes: string | null
          order_id: string
          quantity: number
          tax_amount: number
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          menu_item_id: string
          notes?: string | null
          order_id: string
          quantity?: number
          tax_amount?: number
          total_price: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          menu_item_id?: string
          notes?: string | null
          order_id?: string
          quantity?: number
          tax_amount?: number
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          amount_tendered: number | null
          change_due: number | null
          client_charge: Json | null
          client_uuid: string | null
          created_at: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          device_id: string | null
          discount_amount: number
          discount_reason: string | null
          discount_scope: Json | null
          id: string
          location_id: string
          occurred_at: string | null
          offline_ref: string | null
          order_number: number | null
          payment_method: string | null
          payment_reference: string | null
          refund_shift_id: string | null
          refunded_at: string | null
          server_total_amount: number | null
          shift_id: string | null
          status: string
          subtotal: number
          sync_discrepancy: number | null
          sync_warnings: Json | null
          synced_at: string | null
          table_id: string | null
          tax_amount: number
          tax_rate: number
          tip_amount: number
          total_amount: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount_tendered?: number | null
          change_due?: number | null
          client_charge?: Json | null
          client_uuid?: string | null
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          device_id?: string | null
          discount_amount?: number
          discount_reason?: string | null
          discount_scope?: Json | null
          id?: string
          location_id: string
          occurred_at?: string | null
          offline_ref?: string | null
          order_number?: number | null
          payment_method?: string | null
          payment_reference?: string | null
          refund_shift_id?: string | null
          refunded_at?: string | null
          server_total_amount?: number | null
          shift_id?: string | null
          status?: string
          subtotal?: number
          sync_discrepancy?: number | null
          sync_warnings?: Json | null
          synced_at?: string | null
          table_id?: string | null
          tax_amount?: number
          tax_rate?: number
          tip_amount?: number
          total_amount?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount_tendered?: number | null
          change_due?: number | null
          client_charge?: Json | null
          client_uuid?: string | null
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          device_id?: string | null
          discount_amount?: number
          discount_reason?: string | null
          discount_scope?: Json | null
          id?: string
          location_id?: string
          occurred_at?: string | null
          offline_ref?: string | null
          order_number?: number | null
          payment_method?: string | null
          payment_reference?: string | null
          refund_shift_id?: string | null
          refunded_at?: string | null
          server_total_amount?: number | null
          shift_id?: string | null
          status?: string
          subtotal?: number
          sync_discrepancy?: number | null
          sync_warnings?: Json | null
          synced_at?: string | null
          table_id?: string | null
          tax_amount?: number
          tax_rate?: number
          tip_amount?: number
          total_amount?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          cash_variance: number | null
          client_uuid: string | null
          closed_at: string | null
          closed_by: string | null
          closing_note: string | null
          counted_breakdown: Json | null
          counted_cash: number | null
          created_at: string
          expected_cash: number | null
          id: string
          location_id: string
          opened_at: string
          opened_by: string | null
          opening_float: number
          status: string
          updated_at: string
        }
        Insert: {
          cash_variance?: number | null
          client_uuid?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closing_note?: string | null
          counted_breakdown?: Json | null
          counted_cash?: number | null
          created_at?: string
          expected_cash?: number | null
          id?: string
          location_id: string
          opened_at?: string
          opened_by?: string | null
          opening_float?: number
          status?: string
          updated_at?: string
        }
        Update: {
          cash_variance?: number | null
          client_uuid?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closing_note?: string | null
          counted_breakdown?: Json | null
          counted_cash?: number | null
          created_at?: string
          expected_cash?: number | null
          id?: string
          location_id?: string
          opened_at?: string
          opened_by?: string | null
          opening_float?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tables: {
        Row: {
          created_at: string
          id: string
          location_id: string
          name: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id: string
          name: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string
          name?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tables_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          active_location_id: string | null
          created_at: string
          first_name: string | null
          id: string
          last_name: string | null
          location_id: string
          role: string
          updated_at: string
        }
        Insert: {
          active_location_id?: string | null
          created_at?: string
          first_name?: string | null
          id: string
          last_name?: string | null
          location_id: string
          role?: string
          updated_at?: string
        }
        Update: {
          active_location_id?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          location_id?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_active_location_id_fkey"
            columns: ["active_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profiles_active_location_is_membership"
            columns: ["id", "active_location_id"]
            isOneToOne: false
            referencedRelation: "location_members"
            referencedColumns: ["user_id", "location_id"]
          },
          {
            foreignKeyName: "user_profiles_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _insert_priced_items: {
        Args: {
          items: Json
          p_location_id: string
          p_order_id: string
          p_strict?: boolean
          p_warnings?: Json
        }
        Returns: Json
      }
      _price_checkout: {
        Args: {
          p_discount_type: string
          p_discount_value: number
          p_gross: number
          p_strict?: boolean
          p_tax: number
          p_tip: number
          p_warnings?: Json
        }
        Returns: Json
      }
      _recompute_order_totals: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      add_member_by_email: {
        Args: { p_email: string; p_role: string }
        Returns: undefined
      }
      append_to_order: {
        Args: { items: Json; p_order_id: string }
        Returns: undefined
      }
      archive_location: { Args: { p_location_id: string }; Returns: undefined }
      close_shift: {
        Args: {
          p_counted_breakdown?: Json
          p_counted_cash: number
          p_note?: string
        }
        Returns: Json
      }
      complete_order: {
        Args: {
          p_amount_tendered?: number
          p_customer_email?: string
          p_customer_id?: string
          p_customer_name?: string
          p_discount_items?: Json
          p_discount_reason?: string
          p_discount_type?: string
          p_discount_value?: number
          p_order_id: string
          p_payment_method: string
          p_payment_reference?: string
          p_tip_amount?: number
        }
        Returns: undefined
      }
      create_location: {
        Args: { p_address?: string; p_copy_menu_from?: string; p_name: string }
        Returns: string
      }
      create_order: {
        Args: { items: Json; p_table_id?: string }
        Returns: string
      }
      current_shift_id: { Args: never; Returns: string }
      get_current_location_id: { Args: never; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      is_admin_at: { Args: { p_location_id: string }; Returns: boolean }
      is_member_of: { Args: { p_location_id: string }; Returns: boolean }
      delete_menu_item: {
        Args: { p_item_id: string }
        Returns: string
      }
      delete_modifier: {
        Args: { p_modifier_id: string }
        Returns: string
      }
      delete_modifier_option: {
        Args: { p_option_id: string }
        Returns: string
      }
      restore_menu_item: {
        Args: { p_item_id: string }
        Returns: undefined
      }
      next_order_number: {
        Args: { p_at?: string; p_location_id: string }
        Returns: number
      }
      open_shift: {
        Args: { p_client_uuid?: string; p_opening_float?: number }
        Returns: string
      }
      orders_for_export: {
        Args: { p_end: string; p_start: string }
        Returns: {
          amount_tendered: number
          change_due: number
          customer_email: string
          customer_id: string
          customer_name: string
          discount_amount: number
          discount_reason: string
          item_count: number
          local_time: string
          order_id: string
          order_number: number
          payment_method: string
          payment_reference: string
          staff_name: string
          status: string
          subtotal: number
          table_name: string
          tax_amount: number
          tip_amount: number
          total_amount: number
        }[]
      }
      provision_staff_member: {
        Args: {
          p_first_name: string
          p_last_name: string
          p_role: string
          p_user_id: string
        }
        Returns: undefined
      }
      recent_shifts: { Args: { p_limit?: number }; Returns: Json }
      record_cash_movement: {
        Args: { p_amount: number; p_reason: string; p_type: string }
        Returns: string
      }
      remove_location_membership: {
        Args: { p_location_id: string; p_user_id: string }
        Returns: undefined
      }
      restore_location: { Args: { p_location_id: string }; Returns: undefined }
      reverse_completed_order: {
        Args: { p_order_id: string; p_reason?: string }
        Returns: undefined
      }
      sales_summary: { Args: { p_end: string; p_start: string }; Returns: Json }
      session_context: { Args: never; Returns: Json }
      set_location_membership: {
        Args: { p_location_id: string; p_role: string; p_user_id: string }
        Returns: undefined
      }
      shares_location_with: { Args: { p_user_id: string }; Returns: boolean }
      shift_summary: { Args: { p_shift_id?: string }; Returns: Json }
      switch_location: { Args: { p_location_id: string }; Returns: Json }
      sync_offline_order: {
        Args: {
          p_client_age_seconds?: number
          p_client_charge?: Json
          p_client_uuid: string
          p_device_id?: string
          p_expected_shift_id?: string
          p_items: Json
          p_offline_ref?: string
          p_payment?: Json
          p_table_id?: string
        }
        Returns: Json
      }
      sync_offline_payment: {
        Args: {
          p_client_age_seconds?: number
          p_client_charge?: Json
          p_client_uuid: string
          p_expected_shift_id?: string
          p_order_id: string
          p_payment?: Json
        }
        Returns: Json
      }
      update_location: {
        Args: { p_address?: string; p_location_id: string; p_name: string }
        Returns: undefined
      }
      void_order: {
        Args: { p_order_id: string; p_reason?: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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

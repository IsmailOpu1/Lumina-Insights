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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      expenses: {
        Row: {
          amount: number
          created_at: string | null
          date: string
          id: string
          notes: string | null
          owner_id: string | null
          platform: string | null
          type: string
        }
        Insert: {
          amount?: number
          created_at?: string | null
          date?: string
          id?: string
          notes?: string | null
          owner_id?: string | null
          platform?: string | null
          type: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          date?: string
          id?: string
          notes?: string | null
          owner_id?: string | null
          platform?: string | null
          type?: string
        }
        Relationships: []
      }
      inventory: {
        Row: {
          cost_price: number
          created_at: string | null
          id: string
          low_stock_threshold: number
          owner_id: string | null
          product_name: string
          selling_price: number
          sku: string | null
          stock_quantity: number
          supplier: string | null
        }
        Insert: {
          cost_price?: number
          created_at?: string | null
          id?: string
          low_stock_threshold?: number
          owner_id?: string | null
          product_name: string
          selling_price?: number
          sku?: string | null
          stock_quantity?: number
          supplier?: string | null
        }
        Update: {
          cost_price?: number
          created_at?: string | null
          id?: string
          low_stock_threshold?: number
          owner_id?: string | null
          product_name?: string
          selling_price?: number
          sku?: string | null
          stock_quantity?: number
          supplier?: string | null
        }
        Relationships: []
      }
      invites: {
        Row: {
          created_at: string | null
          email: string
          expires_at: string
          id: string
          owner_id: string
          role: string
          token: string
          used: boolean | null
        }
        Insert: {
          created_at?: string | null
          email: string
          expires_at: string
          id?: string
          owner_id: string
          role?: string
          token: string
          used?: boolean | null
        }
        Update: {
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          owner_id?: string
          role?: string
          token?: string
          used?: boolean | null
        }
        Relationships: []
      }
      marketing_outputs: {
        Row: {
          caption: string | null
          created_at: string | null
          cta: string | null
          hashtags: string | null
          hook: string | null
          id: string
          owner_id: string | null
          platform: string
          product_features: string | null
          product_name: string
          script: string | null
          target_audience: string | null
          value_proposition: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          cta?: string | null
          hashtags?: string | null
          hook?: string | null
          id?: string
          owner_id?: string | null
          platform: string
          product_features?: string | null
          product_name: string
          script?: string | null
          target_audience?: string | null
          value_proposition?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          cta?: string | null
          hashtags?: string | null
          hook?: string | null
          id?: string
          owner_id?: string | null
          platform?: string
          product_features?: string | null
          product_name?: string
          script?: string | null
          target_audience?: string | null
          value_proposition?: string | null
        }
        Relationships: []
      }
      notes: {
        Row: {
          created_at: string | null
          id: string
          owner_id: string | null
          source_module: string | null
          title: string
          transcript: string | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          owner_id?: string | null
          source_module?: string | null
          title: string
          transcript?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          owner_id?: string | null
          source_module?: string | null
          title?: string
          transcript?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          owner_id: string | null
          title: string
          type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          owner_id?: string | null
          title: string
          type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          owner_id?: string | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          ad_cost: number
          created_at: string | null
          customer_name: string
          date: string
          id: string
          order_number: string
          owner_id: string | null
          product_id: string
          profit_per_order: number | null
          quantity: number
          selling_price: number
          shipping_cost: number
          source: string | null
          status: string
        }
        Insert: {
          ad_cost?: number
          created_at?: string | null
          customer_name: string
          date?: string
          id?: string
          order_number: string
          owner_id?: string | null
          product_id: string
          profit_per_order?: number | null
          quantity?: number
          selling_price?: number
          shipping_cost?: number
          source?: string | null
          status?: string
        }
        Update: {
          ad_cost?: number
          created_at?: string | null
          customer_name?: string
          date?: string
          id?: string
          order_number?: string
          owner_id?: string | null
          product_id?: string
          profit_per_order?: number | null
          quantity?: number
          selling_price?: number
          shipping_cost?: number
          source?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string | null
          email: string
          id: string
          invite_expires_at: string | null
          invite_token: string | null
          member_id: string | null
          owner_id: string
          role: string
          status: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          invite_expires_at?: string | null
          invite_token?: string | null
          member_id?: string | null
          owner_id: string
          role?: string
          status?: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          invite_expires_at?: string | null
          invite_token?: string | null
          member_id?: string | null
          owner_id?: string
          role?: string
          status?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          avatar_url: string | null
          business_description: string | null
          business_name: string | null
          business_type: string | null
          created_at: string | null
          currency: string | null
          dark_mode: boolean | null
          dashboard_filter: string | null
          dead_product_days: number | null
          font_style: string | null
          id: string
          notification_preferences: Json | null
          onboarding_complete: boolean | null
          owner_id: string | null
          roas_threshold: number | null
          role: string | null
          theme: string | null
          updated_at: string | null
          user_full_name: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          business_description?: string | null
          business_name?: string | null
          business_type?: string | null
          created_at?: string | null
          currency?: string | null
          dark_mode?: boolean | null
          dashboard_filter?: string | null
          dead_product_days?: number | null
          font_style?: string | null
          id?: string
          notification_preferences?: Json | null
          onboarding_complete?: boolean | null
          owner_id?: string | null
          roas_threshold?: number | null
          role?: string | null
          theme?: string | null
          updated_at?: string | null
          user_full_name?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          business_description?: string | null
          business_name?: string | null
          business_type?: string | null
          created_at?: string | null
          currency?: string | null
          dark_mode?: boolean | null
          dashboard_filter?: string | null
          dead_product_days?: number | null
          font_style?: string | null
          id?: string
          notification_preferences?: Json | null
          onboarding_complete?: boolean | null
          owner_id?: string | null
          roas_threshold?: number | null
          role?: string | null
          theme?: string | null
          updated_at?: string | null
          user_full_name?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_my_owner_id: { Args: never; Returns: string }
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

export const Constants = {
  public: {
    Enums: {},
  },
} as const

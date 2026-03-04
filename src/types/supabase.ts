export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5";
  };
  public: {
    Tables: {
      mylearning_assets: {
        Row: {
          ai_generated: boolean;
          created_at: string;
          description: string | null;
          file_path: string;
          file_size: number;
          file_type: string;
          id: string;
          mime_type: string;
          name: string;
          public_url: string;
          uploaded_by: string;
        };
        Insert: {
          ai_generated?: boolean;
          created_at?: string;
          description?: string | null;
          file_path: string;
          file_size?: number;
          file_type: string;
          id?: string;
          mime_type: string;
          name: string;
          public_url: string;
          uploaded_by: string;
        };
        Update: {
          ai_generated?: boolean;
          created_at?: string;
          description?: string | null;
          file_path?: string;
          file_size?: number;
          file_type?: string;
          id?: string;
          mime_type?: string;
          name?: string;
          public_url?: string;
          uploaded_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mylearning_assets_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      mylearning_courses: {
        Row: {
          cover_image_url: string | null;
          created_at: string | null;
          created_by: string | null;
          description: string | null;
          id: string;
          is_published: boolean | null;
          target_job_roles: string[] | null;
          title: string;
          updated_at: string | null;
        };
        Insert: {
          cover_image_url?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          is_published?: boolean | null;
          target_job_roles?: string[] | null;
          title: string;
          updated_at?: string | null;
        };
        Update: {
          cover_image_url?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          is_published?: boolean | null;
          target_job_roles?: string[] | null;
          title?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "mylearning_courses_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      mylearning_modules: {
        Row: {
          content_data: Json | null;
          content_type: string;
          course_id: string | null;
          created_at: string | null;
          description: string | null;
          duration_min: number | null;
          id: string;
          sequence_order: number | null;
          settings: Json | null;
          title: string;
          updated_at: string | null;
        };
        Insert: {
          content_data?: Json | null;
          content_type: string;
          course_id?: string | null;
          created_at?: string | null;
          description?: string | null;
          duration_min?: number | null;
          id?: string;
          sequence_order?: number | null;
          settings?: Json | null;
          title: string;
          updated_at?: string | null;
        };
        Update: {
          content_data?: Json | null;
          content_type?: string;
          course_id?: string | null;
          created_at?: string | null;
          description?: string | null;
          duration_min?: number | null;
          id?: string;
          sequence_order?: number | null;
          settings?: Json | null;
          title?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "mylearning_modules_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "mylearning_courses";
            referencedColumns: ["id"];
          },
        ];
      };
      mylearning_user_progress: {
        Row: {
          certificate_url: string | null;
          completion_date: string | null;
          course_id: string | null;
          created_at: string | null;
          current_module_id: string | null;
          id: string;
          module_states: Json | null;
          status: string | null;
          updated_at: string | null;
          user_id: string | null;
        };
        Insert: {
          certificate_url?: string | null;
          completion_date?: string | null;
          course_id?: string | null;
          created_at?: string | null;
          current_module_id?: string | null;
          id?: string;
          module_states?: Json | null;
          status?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Update: {
          certificate_url?: string | null;
          completion_date?: string | null;
          course_id?: string | null;
          created_at?: string | null;
          current_module_id?: string | null;
          id?: string;
          module_states?: Json | null;
          status?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "mylearning_user_progress_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "mylearning_courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mylearning_user_progress_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          can_delegate: boolean | null;
          claims_access: boolean | null;
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
          job_role: string | null;
          mylearning_access: boolean | null;
          role: string | null;
          setup_complete: boolean | null;
        };
        Insert: {
          can_delegate?: boolean | null;
          claims_access?: boolean | null;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
          job_role?: string | null;
          mylearning_access?: boolean | null;
          role?: string | null;
          setup_complete?: boolean | null;
        };
        Update: {
          can_delegate?: boolean | null;
          claims_access?: boolean | null;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          job_role?: string | null;
          mylearning_access?: boolean | null;
          role?: string | null;
          setup_complete?: boolean | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database[Extract<keyof Database, "public">];

export type Tables<
  PublicTableNameOrOptions extends
  | keyof PublicSchema["Tables"]
  | { schema: keyof Omit<Database, "__InternalSupabase"> },
  TableName extends PublicTableNameOrOptions extends {
    schema: keyof Omit<Database, "__InternalSupabase">;
  }
  ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
  : never = never,
> = PublicTableNameOrOptions extends {
  schema: keyof Omit<Database, "__InternalSupabase">;
}
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
    Row: infer R;
  }
  ? R
  : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
  ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
    Row: infer R;
  }
  ? R
  : never
  : never;

export type TablesInsert<
  PublicTableNameOrOptions extends
  | keyof PublicSchema["Tables"]
  | { schema: keyof Omit<Database, "__InternalSupabase"> },
  TableName extends PublicTableNameOrOptions extends {
    schema: keyof Omit<Database, "__InternalSupabase">;
  }
  ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
  : never = never,
> = PublicTableNameOrOptions extends {
  schema: keyof Omit<Database, "__InternalSupabase">;
}
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
    Insert: infer I;
  }
  ? I
  : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
  ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
    Insert: infer I;
  }
  ? I
  : never
  : never;

export type TablesUpdate<
  PublicTableNameOrOptions extends
  | keyof PublicSchema["Tables"]
  | { schema: keyof Omit<Database, "__InternalSupabase"> },
  TableName extends PublicTableNameOrOptions extends {
    schema: keyof Omit<Database, "__InternalSupabase">;
  }
  ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
  : never = never,
> = PublicTableNameOrOptions extends {
  schema: keyof Omit<Database, "__InternalSupabase">;
}
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
    Update: infer U;
  }
  ? U
  : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
  ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
    Update: infer U;
  }
  ? U
  : never
  : never;

export type Enums<
  PublicEnumNameOrOptions extends
  | keyof PublicSchema["Enums"]
  | { schema: keyof Omit<Database, "__InternalSupabase"> },
  EnumName extends PublicEnumNameOrOptions extends {
    schema: keyof Omit<Database, "__InternalSupabase">;
  }
  ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
  : never = never,
> = PublicEnumNameOrOptions extends {
  schema: keyof Omit<Database, "__InternalSupabase">;
}
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
  ? PublicSchema["Enums"][PublicEnumNameOrOptions]
  : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
  | keyof PublicSchema["CompositeTypes"]
  | { schema: keyof Omit<Database, "__InternalSupabase"> },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Omit<Database, "__InternalSupabase">;
  }
  ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
  : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof Omit<Database, "__InternalSupabase">;
}
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
  ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never;

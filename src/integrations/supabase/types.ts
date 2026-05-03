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
      categorias: {
        Row: {
          ativa: boolean
          created_at: string
          icone: string | null
          id: string
          nome: string
          ordem: number
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          icone?: string | null
          id?: string
          nome: string
          ordem?: number
        }
        Update: {
          ativa?: boolean
          created_at?: string
          icone?: string | null
          id?: string
          nome?: string
          ordem?: number
        }
        Relationships: []
      }
      clientes: {
        Row: {
          ativo: boolean
          created_at: string
          documento: string | null
          email: string | null
          endereco: string | null
          facebook: string | null
          id: string
          instagram: string | null
          limite_caderneta: number
          nome: string
          observacao_relacionamento: string | null
          observacoes: string | null
          saldo_devedor: number
          telefone: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          documento?: string | null
          email?: string | null
          endereco?: string | null
          facebook?: string | null
          id?: string
          instagram?: string | null
          limite_caderneta?: number
          nome: string
          observacao_relacionamento?: string | null
          observacoes?: string | null
          saldo_devedor?: number
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          documento?: string | null
          email?: string | null
          endereco?: string | null
          facebook?: string | null
          id?: string
          instagram?: string | null
          limite_caderneta?: number
          nome?: string
          observacao_relacionamento?: string | null
          observacoes?: string | null
          saldo_devedor?: number
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      contas_pagar: {
        Row: {
          categoria: string | null
          created_at: string
          data_pagamento: string | null
          descricao: string
          forma_pagamento: string | null
          fornecedor: string | null
          id: string
          observacoes: string | null
          recorrente: boolean
          status: Database["public"]["Enums"]["status_conta_pagar"]
          updated_at: string
          valor: number
          vencimento: string
        }
        Insert: {
          categoria?: string | null
          created_at?: string
          data_pagamento?: string | null
          descricao: string
          forma_pagamento?: string | null
          fornecedor?: string | null
          id?: string
          observacoes?: string | null
          recorrente?: boolean
          status?: Database["public"]["Enums"]["status_conta_pagar"]
          updated_at?: string
          valor?: number
          vencimento: string
        }
        Update: {
          categoria?: string | null
          created_at?: string
          data_pagamento?: string | null
          descricao?: string
          forma_pagamento?: string | null
          fornecedor?: string | null
          id?: string
          observacoes?: string | null
          recorrente?: boolean
          status?: Database["public"]["Enums"]["status_conta_pagar"]
          updated_at?: string
          valor?: number
          vencimento?: string
        }
        Relationships: []
      }
      cupons_enviados: {
        Row: {
          atendente_id: string | null
          cliente_id: string
          conteudo: string
          created_at: string
          enviado_via: string
          id: string
          venda_id: string | null
        }
        Insert: {
          atendente_id?: string | null
          cliente_id: string
          conteudo: string
          created_at?: string
          enviado_via?: string
          id?: string
          venda_id?: string | null
        }
        Update: {
          atendente_id?: string | null
          cliente_id?: string
          conteudo?: string
          created_at?: string
          enviado_via?: string
          id?: string
          venda_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cupons_enviados_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cupons_enviados_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      fluxo_caixa: {
        Row: {
          created_at: string
          data_movimento: string
          descricao: string
          id: string
          pagamento_id: string | null
          tipo: Database["public"]["Enums"]["tipo_movimento"]
          usuario_id: string | null
          valor: number
          venda_id: string | null
        }
        Insert: {
          created_at?: string
          data_movimento?: string
          descricao: string
          id?: string
          pagamento_id?: string | null
          tipo: Database["public"]["Enums"]["tipo_movimento"]
          usuario_id?: string | null
          valor: number
          venda_id?: string | null
        }
        Update: {
          created_at?: string
          data_movimento?: string
          descricao?: string
          id?: string
          pagamento_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_movimento"]
          usuario_id?: string | null
          valor?: number
          venda_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fluxo_caixa_pagamento_id_fkey"
            columns: ["pagamento_id"]
            isOneToOne: false
            referencedRelation: "pagamentos_caderneta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fluxo_caixa_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      itens_orcamento: {
        Row: {
          categoria_id: string | null
          created_at: string
          id: string
          orcamento_id: string
          preco_unitario: number
          produto_id: string | null
          produto_nome: string
          quantidade: number
          subtotal: number
        }
        Insert: {
          categoria_id?: string | null
          created_at?: string
          id?: string
          orcamento_id: string
          preco_unitario?: number
          produto_id?: string | null
          produto_nome: string
          quantidade?: number
          subtotal?: number
        }
        Update: {
          categoria_id?: string | null
          created_at?: string
          id?: string
          orcamento_id?: string
          preco_unitario?: number
          produto_id?: string | null
          produto_nome?: string
          quantidade?: number
          subtotal?: number
        }
        Relationships: [
          {
            foreignKeyName: "itens_orcamento_orcamento_id_fkey"
            columns: ["orcamento_id"]
            isOneToOne: false
            referencedRelation: "orcamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_orcamento_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      itens_venda: {
        Row: {
          categoria_id: string | null
          created_at: string
          id: string
          preco_unitario: number
          produto_id: string | null
          produto_nome: string
          quantidade: number
          subtotal: number
          venda_id: string
        }
        Insert: {
          categoria_id?: string | null
          created_at?: string
          id?: string
          preco_unitario?: number
          produto_id?: string | null
          produto_nome: string
          quantidade?: number
          subtotal?: number
          venda_id: string
        }
        Update: {
          categoria_id?: string | null
          created_at?: string
          id?: string
          preco_unitario?: number
          produto_id?: string | null
          produto_nome?: string
          quantidade?: number
          subtotal?: number
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "itens_venda_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_venda_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_venda_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      metas: {
        Row: {
          ano: number
          created_at: string
          id: string
          mes: number
          observacoes: string | null
          updated_at: string
          valor_meta: number
        }
        Insert: {
          ano: number
          created_at?: string
          id?: string
          mes: number
          observacoes?: string | null
          updated_at?: string
          valor_meta?: number
        }
        Update: {
          ano?: number
          created_at?: string
          id?: string
          mes?: number
          observacoes?: string | null
          updated_at?: string
          valor_meta?: number
        }
        Relationships: []
      }
      orcamentos: {
        Row: {
          atendente_id: string | null
          cliente_id: string | null
          cliente_nome: string | null
          created_at: string
          data_orcamento: string
          id: string
          numero: number
          observacoes: string | null
          status: Database["public"]["Enums"]["status_orcamento"]
          total: number
          updated_at: string
          validade: string | null
          venda_convertida_id: string | null
        }
        Insert: {
          atendente_id?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          created_at?: string
          data_orcamento?: string
          id?: string
          numero?: number
          observacoes?: string | null
          status?: Database["public"]["Enums"]["status_orcamento"]
          total?: number
          updated_at?: string
          validade?: string | null
          venda_convertida_id?: string | null
        }
        Update: {
          atendente_id?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          created_at?: string
          data_orcamento?: string
          id?: string
          numero?: number
          observacoes?: string | null
          status?: Database["public"]["Enums"]["status_orcamento"]
          total?: number
          updated_at?: string
          validade?: string | null
          venda_convertida_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orcamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamentos_venda_convertida_id_fkey"
            columns: ["venda_convertida_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      pagamentos_caderneta: {
        Row: {
          atendente_id: string | null
          cliente_id: string
          created_at: string
          data_pagamento: string
          forma_pagamento: Database["public"]["Enums"]["forma_pagamento"]
          id: string
          observacoes: string | null
          valor: number
        }
        Insert: {
          atendente_id?: string | null
          cliente_id: string
          created_at?: string
          data_pagamento?: string
          forma_pagamento: Database["public"]["Enums"]["forma_pagamento"]
          id?: string
          observacoes?: string | null
          valor: number
        }
        Update: {
          atendente_id?: string | null
          cliente_id?: string
          created_at?: string
          data_pagamento?: string
          forma_pagamento?: Database["public"]["Enums"]["forma_pagamento"]
          id?: string
          observacoes?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_caderneta_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          ativo: boolean
          categoria_id: string | null
          codigo_barras: string | null
          created_at: string
          descricao: string | null
          destaque: boolean
          estoque: number
          estoque_minimo: number | null
          id: string
          imagem_url: string | null
          nome: string
          preco: number
          preco_custo: number | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria_id?: string | null
          codigo_barras?: string | null
          created_at?: string
          descricao?: string | null
          destaque?: boolean
          estoque?: number
          estoque_minimo?: number | null
          id?: string
          imagem_url?: string | null
          nome: string
          preco?: number
          preco_custo?: number | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria_id?: string | null
          codigo_barras?: string | null
          created_at?: string
          descricao?: string | null
          destaque?: boolean
          estoque?: number
          estoque_minimo?: number | null
          id?: string
          imagem_url?: string | null
          nome?: string
          preco?: number
          preco_custo?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "produtos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          nome_completo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          nome_completo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          nome_completo?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vendas: {
        Row: {
          atendente_id: string | null
          cliente_id: string | null
          created_at: string
          data_venda: string
          forma_pagamento: Database["public"]["Enums"]["forma_pagamento"]
          id: string
          observacoes: string | null
          status: Database["public"]["Enums"]["status_venda"]
          total: number
        }
        Insert: {
          atendente_id?: string | null
          cliente_id?: string | null
          created_at?: string
          data_venda?: string
          forma_pagamento: Database["public"]["Enums"]["forma_pagamento"]
          id?: string
          observacoes?: string | null
          status?: Database["public"]["Enums"]["status_venda"]
          total?: number
        }
        Update: {
          atendente_id?: string | null
          cliente_id?: string | null
          created_at?: string
          data_venda?: string
          forma_pagamento?: Database["public"]["Enums"]["forma_pagamento"]
          id?: string
          observacoes?: string | null
          status?: Database["public"]["Enums"]["status_venda"]
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "vendas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancelar_venda: { Args: { _venda_id: string }; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "atendente"
      forma_pagamento:
        | "dinheiro"
        | "pix"
        | "cartao_debito"
        | "cartao_credito"
        | "caderneta"
      status_conta_pagar: "pendente" | "paga" | "atrasada" | "cancelada"
      status_orcamento:
        | "rascunho"
        | "enviado"
        | "convertido"
        | "cancelado"
        | "expirado"
      status_venda: "paga" | "pendente" | "cancelada"
      tipo_movimento:
        | "entrada_venda"
        | "entrada_pagamento_caderneta"
        | "saida_fornecedor"
        | "saida_despesa"
        | "entrada_outras"
        | "saida_outras"
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
      app_role: ["admin", "atendente"],
      forma_pagamento: [
        "dinheiro",
        "pix",
        "cartao_debito",
        "cartao_credito",
        "caderneta",
      ],
      status_conta_pagar: ["pendente", "paga", "atrasada", "cancelada"],
      status_orcamento: [
        "rascunho",
        "enviado",
        "convertido",
        "cancelado",
        "expirado",
      ],
      status_venda: ["paga", "pendente", "cancelada"],
      tipo_movimento: [
        "entrada_venda",
        "entrada_pagamento_caderneta",
        "saida_fornecedor",
        "saida_despesa",
        "entrada_outras",
        "saida_outras",
      ],
    },
  },
} as const

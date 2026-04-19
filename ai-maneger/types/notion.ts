export interface NotionRichTextItem {
  plain_text: string;
}

export interface NotionProperty {
  type?: string;
  title?: NotionRichTextItem[];
  rich_text?: NotionRichTextItem[];
  number?: number | null;
  formula?:
    | {
        type?: "string" | "number" | "boolean" | "date";
        string?: string | null;
        number?: number | null;
        boolean?: boolean | null;
        date?: { start?: string | null } | null;
      }
    | null;
  rollup?:
    | {
        type?: "number" | "date" | "array" | "incomplete" | "unsupported";
        number?: number | null;
        date?: { start?: string | null } | null;
        array?: NotionProperty[];
      }
    | null;
  checkbox?: boolean;
  url?: string | null;
  select?: { name?: string | null } | null;
  multi_select?: Array<{ name?: string | null }>;
  status?: { name?: string | null } | null;
  date?: { start?: string | null } | null;
  relation?: Array<{ id: string }>;
}

export interface NotionPage {
  id: string;
  url?: string;
  created_time?: string;
  last_edited_time: string;
  properties: Record<string, NotionProperty>;
}

export interface NotionBlock {
  id: string;
  type: string;
  has_children?: boolean;
  paragraph?: { rich_text?: NotionRichTextItem[] };
  heading_1?: { rich_text?: NotionRichTextItem[] };
  heading_2?: { rich_text?: NotionRichTextItem[] };
  heading_3?: { rich_text?: NotionRichTextItem[] };
  bulleted_list_item?: { rich_text?: NotionRichTextItem[] };
}

export interface MinimalPageBlock {
  id: string;
  type: "paragraph" | "heading_1" | "heading_2" | "heading_3" | "bulleted_list_item";
  text: string;
}

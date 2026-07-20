export type NotebookRow = {
  id: string;
  display_name: string | null;
  custom_display_name: string | null;
  is_default: number | null;
  last_modified_date_time: string | null;
  links_json: string | null;
  synced_at: string;
};

export type SectionRow = {
  id: string;
  display_name: string | null;
  last_modified_date_time: string | null;
  pages_url: string | null;
  parent_notebook_id: string | null;
  parent_notebook_name: string | null;
  parent_section_group_id: string | null;
  parent_section_group_name: string | null;
  section_group_path: string | null;
  order_index: number | null;
  links_json: string | null;
  synced_at: string;
  pages_scanned_at: string | null;
  pages_scan_complete: number | null;
  pages_seen_count: number | null;
  pages_scan_error: string | null;
};

export type PageRow = {
  id: string;
  title: string | null;
  created_date_time: string | null;
  last_modified_date_time: string | null;
  content_url: string | null;
  parent_section_id: string | null;
  parent_section_name: string | null;
  parent_notebook_id: string | null;
  parent_notebook_name: string | null;
  links_json: string | null;
  content_text: string | null;
  content_html: string | null;
  content_hash: string | null;
  content_source_modified_date_time: string | null;
  content_source_section_modified_date_time: string | null;
  content_chars: number | null;
  content_bytes: number | null;
  content_synced_at: string | null;
  metadata_synced_at: string | null;
  deleted_at: string | null;
  fetch_error: string | null;
  fetch_error_at: string | null;
  fetch_retry_after: string | null;
  fetch_error_count: number;
  fetch_error_terminal: number;
  fetch_error_source_modified_date_time: string | null;
  order_index: number | null;
  page_level: number | null;
};

export type SectionGroupRow = {
  id: string;
  display_name: string | null;
  parent_notebook_id: string | null;
  parent_notebook_name: string | null;
  parent_section_group_id: string | null;
  section_group_path: string | null;
  order_index: number | null;
  last_modified_date_time: string | null;
  synced_at: string;
};

export type CacheSearchResult = {
  id: string;
  title: string | null;
  parent_notebook_id: string | null;
  parent_notebook_name: string | null;
  parent_section_name: string | null;
  last_modified_date_time: string | null;
  content_synced_at: string | null;
  snippet: string | null;
  score: number;
};

export type BibleParseStateRow = {
  page_id: string;
  content_hash: string | null;
  module: string;
  parser_version: string;
  parsed_at: string | null;
  parse_error: string | null;
  refs_count: number;
  paragraphs_count: number;
};

export type PageAccessRow = {
  page_id: string;
  last_opened_at: string;
};

export type BibleReferenceSearchResult = {
  page_id: string;
  title: string | null;
  parent_notebook_id: string | null;
  parent_notebook_name: string | null;
  parent_section_name: string | null;
  paragraph_index: number;
  paragraph_text: string | null;
  original_text: string | null;
  normalized_ref: string | null;
  book_index: number | null;
  book_name: string | null;
  chapter: number | null;
  verse: number | null;
  top_chapter: number | null;
  top_verse: number | null;
};

export type WeightedBibleReferenceNote = {
  id: string;
  title: string | null;
  parent_notebook_id: string | null;
  parent_notebook_name: string | null;
  parent_section_name: string | null;
  paragraphIndex: number;
  paragraphIndexes: number[];
  snippet: string | null;
  bibleRef: string | null;
  bibleMatchScore: number;
  bibleWeight: number;
};


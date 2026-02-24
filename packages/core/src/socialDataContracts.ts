export type PageQuery = {
  limit: number;
  offset: number;
};

export type HttpJsonResult<T> = {
  res: Response;
  json: T | null;
};

export type FeedPagePayload<TItem = any> = {
  items: TItem[];
  source?: string | null;
};

export type NotificationsPayload<TItem = any> = {
  items: TItem[];
};

export type SavedCollectionSummaryRowPayload = {
  post_id: string;
  collection_key?: string | null;
  collection_label?: string | null;
  updated_at?: string | null;
};

export type SavedFeedRowPayload = SavedCollectionSummaryRowPayload & {
  created_at?: string | null;
};

export type SavedRowsPagePayload = {
  collectionAvailable: boolean;
  unsupportedCollectionFilter: boolean;
  rows: SavedFeedRowPayload[];
  totalCount: number | null;
};

export type SavedCollectionsSummaryRowsPayload = {
  available: boolean;
  rows: SavedCollectionSummaryRowPayload[];
  totalCount: number | null;
};

export type TimelineSignalsPayload = {
  followedAuthorIds: string[];
  savedPostIds: string[];
  openedPostIds: string[];
  weights?: TimelineSignalWeights | null;
  weightsSamples?: number | null;
  learningInput?: {
    openedCount?: number;
    savedCount?: number;
    followedCount?: number;
  } | null;
  degraded?: Record<string, boolean>;
};
import type { TimelineSignalWeights } from "./timelineRanking";

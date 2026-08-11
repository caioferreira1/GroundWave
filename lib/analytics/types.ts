export type DateCount = { date: string; count: number };
export type CommentsTrendPoint = { date: string; generated: number; posted: number };
export type ViewsTrendPoint = { date: string; postViews: number; commentViews: number };

export type OverviewTotals = {
  postsPosted: number;
  commentsPosted: number;
  reportedViews: number;
};

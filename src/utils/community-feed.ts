import feedData from "../data/community-feed.json";
import { FeedSchema, type Member, type Post, type Feed } from "../types/community-feed";

let _feed: Feed | null = null;

function getFeed(): Feed {
  if (!_feed) {
    _feed = FeedSchema.parse(feedData);
  }
  return _feed;
}

export function getAllMembers(): Member[] {
  return getFeed().members;
}

export function getMemberById(id: string): Member | undefined {
  return getFeed().members.find((m) => m.id === id);
}

export function getAllPosts(): Post[] {
  return getFeed()
    .posts.slice()
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function getFeaturedPost(): Post {
  const sorted = getAllPosts();
  return sorted[0];
}

export function getGridPosts(): Post[] {
  const sorted = getAllPosts();
  return sorted.slice(1);
}

export function getMembersWithPosts(): Member[] {
  const memberIds = new Set(getFeed().posts.map((p) => p.member));
  return getFeed().members.filter((m) => memberIds.has(m.id));
}

import { z } from "zod";

export const ALLOWED_TAGS = [
  "ai",
  "web-dev",
  "open-source",
  "creative-coding",
  "startups",
  "life-in-japan",
] as const;

export type TagId = (typeof ALLOWED_TAGS)[number];

export const TAG_LABELS: Record<TagId, { en: string; ja: string }> = {
  ai: { en: "AI / ML", ja: "AI / 機械学習" },
  "web-dev": { en: "Web Dev", ja: "ウェブ開発" },
  "open-source": { en: "Open Source", ja: "オープンソース" },
  "creative-coding": {
    en: "Creative / Design",
    ja: "クリエイティブ / デザイン",
  },
  startups: { en: "Startups", ja: "スタートアップ" },
  "life-in-japan": { en: "Life in Japan", ja: "日本生活" },
};

export const MemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  website: z.string().url(),
});

const BasePostSchema = z.object({
  member: z.string(),
  title: z.string(),
  url: z.string().url(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().optional(),
  thumbnail: z.string().url().optional(),
  tags: z
    .array(z.enum(ALLOWED_TAGS))
    .min(1)
    .max(3),
});

const BlogPostSchema = BasePostSchema.extend({
  type: z.literal("blog"),
  description: z.string(),
});

const VideoPostSchema = BasePostSchema.extend({
  type: z.literal("video"),
});

const ProjectPostSchema = BasePostSchema.extend({
  type: z.literal("project"),
  description: z.string(),
  repoUrl: z.string().url().optional(),
  techStack: z.array(z.string()).optional(),
});

export const PostSchema = z.discriminatedUnion("type", [
  BlogPostSchema,
  VideoPostSchema,
  ProjectPostSchema,
]);

export const FeedSchema = z.object({
  members: z.array(MemberSchema),
  posts: z.array(PostSchema),
});

export type Member = z.infer<typeof MemberSchema>;
export type Post = z.infer<typeof PostSchema>;
export type Feed = z.infer<typeof FeedSchema>;

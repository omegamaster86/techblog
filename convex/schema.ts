import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
	links: defineTable({
		title: v.string(),
		href: v.string(),
		description: v.optional(v.string()),
	}),
});

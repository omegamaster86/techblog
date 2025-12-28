import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// 全リンクを取得
export const list = query({
	handler: async (ctx) => {
		return await ctx.db.query("links").collect();
	},
});

// リンクを追加
export const create = mutation({
	args: {
		title: v.string(),
		href: v.string(),
		description: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		return await ctx.db.insert("links", {
			title: args.title,
			href: args.href,
			description: args.description,
		});
	},
});

// リンクを削除
export const remove = mutation({
	args: {
		id: v.id("links"),
	},
	handler: async (ctx, args) => {
		await ctx.db.delete(args.id);
	},
});

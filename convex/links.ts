import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

function compareLinks(
	a: { order?: number; _creationTime: number },
	b: { order?: number; _creationTime: number },
) {
	const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
	const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
	if (orderA !== orderB) return orderA - orderB;
	return a._creationTime - b._creationTime;
}

// 全リンクを取得（order 順）
export const list = query({
	handler: async (ctx) => {
		const links = await ctx.db.query("links").collect();
		return links.sort(compareLinks);
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
		const links = await ctx.db.query("links").collect();
		const maxOrder = links.reduce(
			(max, link) => Math.max(max, link.order ?? -1),
			-1,
		);

		return await ctx.db.insert("links", {
			title: args.title,
			href: args.href,
			description: args.description,
			order: maxOrder + 1,
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

// リンクの並び順を更新
export const reorder = mutation({
	args: {
		orderedIds: v.array(v.id("links")),
	},
	handler: async (ctx, args) => {
		await Promise.all(
			args.orderedIds.map((id, index) =>
				ctx.db.patch(id, { order: index }),
			),
		);
	},
});

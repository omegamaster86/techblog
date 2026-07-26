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

// 既存データに order が無い場合に 0..n-1 を付与
export const ensureOrders = mutation({
	handler: async (ctx) => {
		const links = (await ctx.db.query("links").collect()).sort(compareLinks);
		let updated = 0;

		for (const [index, link] of links.entries()) {
			if (link.order !== index) {
				await ctx.db.patch(link._id, { order: index });
				updated += 1;
			}
		}

		return { updated };
	},
});

// リンクの並び順を更新
export const reorder = mutation({
	args: {
		orderedIds: v.array(v.id("links")),
	},
	handler: async (ctx, args) => {
		const links = await ctx.db.query("links").collect();
		const linkIds = new Set(links.map((link) => link._id));

		if (args.orderedIds.length !== links.length) {
			throw new Error("並び替え対象の件数が一致しません");
		}

		for (const id of args.orderedIds) {
			if (!linkIds.has(id)) {
				throw new Error("存在しないリンクが含まれています");
			}
		}

		for (const [index, id] of args.orderedIds.entries()) {
			await ctx.db.patch(id, { order: index });
		}
	},
});

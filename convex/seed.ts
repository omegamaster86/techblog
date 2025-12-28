import { mutation } from "./_generated/server";

// 初期データをシードするための一度きりのmutation
export const seedLinks = mutation({
	handler: async (ctx) => {
		const existingLinks = await ctx.db.query("links").collect();
		if (existingLinks.length > 0) {
			return { message: "データは既に存在します", count: existingLinks.length };
		}

		const initialLinks = [
			{ title: "Zennへ移動", href: "https://zenn.dev/" },
			{ title: "qiitaへ移動", href: "https://qiita.com/" },
			{ title: "Expo Tech Blogへ移動", href: "https://expo.dev/blog" },
			{
				title: "ubie Tech Blogへ移動",
				href: "https://ubie-inc.notion.site/Ubie-e5ca482892574b198160de93b5ba067a",
			},
			{
				title: "令和トラベル Tech Blogへ移動",
				href: "https://engineering.reiwatravel.co.jp/category/all/",
			},
			{
				title: "future Tech Blogへ移動",
				href: "https://future-architect.github.io/",
			},
			{
				title: "loglass Tech Blogへ移動",
				href: "https://prd-blog.loglass.co.jp/entry/engineer_list",
			},
			{
				title: "AI・Techカタログへ移動",
				href: "https://findy-code.io/ai-tech-catalogs",
			},
			{
				title: "React コアチームのDan Blogへ移動",
				href: "https://overreacted.io/",
			},
		];

		for (const link of initialLinks) {
			await ctx.db.insert("links", link);
		}

		return { message: "初期データを追加しました", count: initialLinks.length };
	},
});

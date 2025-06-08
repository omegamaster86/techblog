import LinkCard from "./components/card";

export default function Home() {
	return (
		<div className="min-h-screen bg-linear-to-r/srgb from-indigo-500 to-teal-400 p-4">
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
				<LinkCard title="Zennへ移動" href="https://zenn.dev/" />
				<LinkCard title="qiitaへ移動" href="https://qiita.com/" />
				<LinkCard title="Expo Tech Blogへ移動" href="https://expo.dev/blog" />
				<LinkCard
					title="ubie Tech Blogへ移動"
					href="https://ubie-inc.notion.site/Ubie-e5ca482892574b198160de93b5ba067a"
				/>
				<LinkCard
					title="令和トラベル Tech Blogへ移動"
					href="https://engineering.reiwatravel.co.jp/category/all/"
				/>
				<LinkCard
					title="future Tech Blogへ移動"
					href="https://future-architect.github.io/"
				/>
				<LinkCard
					title="loglass Tech Blogへ移動"
					href="https://prd-blog.loglass.co.jp/entry/engineer_list"
				/>
				<LinkCard
					title="LINEヤフー株式会社 Tech Blogへ移動"
					href="https://techblog.lycorp.co.jp/ja"
				/>
			</div>
		</div>
	);
}

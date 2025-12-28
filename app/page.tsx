import { LinkList } from "./components/link-list";
import { LinkForm } from "./components/link-form";

export default function Home() {
	return (
		<div className="min-h-screen bg-linear-to-r/srgb from-indigo-500 to-teal-400 p-4">
			<LinkForm />
			<LinkList />
		</div>
	);
}

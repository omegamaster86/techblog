import { LinkForm } from "./components/link-form";
import { LinkList } from "./components/link-list";

export default function Home() {
	return (
		<div className="min-h-screen bg-linear-to-r/srgb from-indigo-500 to-teal-400 p-4">
			<LinkForm />
			<LinkList />
		</div>
	);
}

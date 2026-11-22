"use client";

import { Group, Modal, TextInput, Title } from "@mantine/core";
import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";

export function LinkForm() {
	const [title, setTitle] = useState("");
	const [href, setHref] = useState("");
	const [isOpen, setIsOpen] = useState(false);
	const createLink = useMutation(api.links.create);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!title.trim() || !href.trim()) return;

		await createLink({ title: title.trim(), href: href.trim() });
		setTitle("");
		setHref("");
		setIsOpen(false);
	};

	return (
		<>
			{/* FAB: 右下固定の+ボタン */}
			<button
				type="button"
				onClick={() => setIsOpen(true)}
				className="fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-3xl font-light text-[#eef5ff] hover:scale-110 transition-all duration-200 z-50"
				aria-label="リンクを追加"
				style={{
					fontSize: "1.875rem",
					lineHeight: 1,
					backgroundColor: "rgba(22, 36, 68, 0.55)",
					border: "1px solid rgba(210, 230, 255, 0.34)",
					backdropFilter: "blur(16px) saturate(160%)",
					WebkitBackdropFilter: "blur(16px) saturate(160%)",
					boxShadow:
						"0 8px 28px rgba(3, 8, 24, 0.58), inset 0 1px 0 rgba(255, 255, 255, 0.16)",
				}}
			>
				+
			</button>

			{/* モーダル */}
			<Modal
				opened={isOpen}
				onClose={() => setIsOpen(false)}
				title={<Title order={4}>新しいリンクを追加</Title>}
				centered
			>
				<form onSubmit={handleSubmit}>
					<TextInput
						label="タイトル"
						placeholder="例: Zennへ移動"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						required
						mb="sm"
					/>
					<TextInput
						label="URL"
						placeholder="https://example.com"
						value={href}
						onChange={(e) => setHref(e.target.value)}
						required
						mb="md"
					/>
					<Group justify="flex-end">
						<button
							type="button"
							className="bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300 transition-colors"
							onClick={() => setIsOpen(false)}
						>
							キャンセル
						</button>
						<button
							type="submit"
							className="bg-indigo-500 text-white px-4 py-2 rounded-md hover:bg-indigo-600 transition-colors"
						>
							追加
						</button>
					</Group>
				</form>
			</Modal>
		</>
	);
}

"use client";

import { Group, Paper, TextInput, Title } from "@mantine/core";
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

	if (!isOpen) {
		return (
			<div className="max-w-5xl mx-auto mb-4">
				<button
					type="button"
					onClick={() => setIsOpen(true)}
					className="bg-white p-2 border-white rounded-md"
				>
					+ リンクを追加
				</button>
			</div>
		);
	}

	return (
		<div className="max-w-5xl mx-auto mb-4">
			<Paper shadow="sm" p="md" radius="md" withBorder>
				<Title order={4} mb="md">
					新しいリンクを追加
				</Title>
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
					<Group>
						<button type="submit" className="bg-blue-500 text-white p-2 rounded-md">
							追加
						</button>
						<button
							type="button"
							className="bg-gray-500 text-white p-2 rounded-md"
							onClick={() => setIsOpen(false)}
						>
							キャンセル
						</button>
					</Group>
				</form>
			</Paper>
		</div>
	);
}

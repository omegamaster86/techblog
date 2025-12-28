"use client";

import { Button, Group, Paper, TextInput, Title } from "@mantine/core";
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
				<Button
					onClick={() => setIsOpen(true)}
					variant="filled"
					color="white"
					c="dark"
				>
					+ リンクを追加
				</Button>
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
						<Button type="submit" color="blue">
							追加
						</Button>
						<Button
							variant="light"
							color="gray"
							onClick={() => setIsOpen(false)}
						>
							キャンセル
						</Button>
					</Group>
				</form>
			</Paper>
		</div>
	);
}

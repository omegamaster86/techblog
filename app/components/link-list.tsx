"use client";

import { ActionIcon, Button, Card, Group, Text } from "@mantine/core";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export function LinkList() {
	const links = useQuery(api.links.list);
	const removeLink = useMutation(api.links.remove);

	const handleDelete = async (id: Id<"links">) => {
		await removeLink({ id });
	};

	if (links === undefined) {
		return <div className="text-white text-center py-8">読み込み中...</div>;
	}

	if (links.length === 0) {
		return (
			<div className="text-white text-center py-8">
				リンクがありません。追加してください。
			</div>
		);
	}

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
			{links.map((link) => (
				<Card
					key={link._id}
					shadow="sm"
					padding="lg"
					radius="md"
					withBorder
					className="flex flex-col h-[160px]"
				>
					<Group justify="space-between" mt="md" mb="xs" wrap="nowrap">
						<Text fw={500} lineClamp={1} className="flex-1">
							{link.title}
						</Text>
						<ActionIcon
							variant="light"
							color="red"
							size="sm"
							onClick={() => handleDelete(link._id)}
							aria-label="削除"
						>
							×
						</ActionIcon>
					</Group>

					<div className="mt-auto">
						<Link href={link.href} target="_blank" rel="noopener noreferrer">
							<Button color="blue" fullWidth radius="md">
								移動
							</Button>
						</Link>
					</div>
				</Card>
			))}
		</div>
	);
}

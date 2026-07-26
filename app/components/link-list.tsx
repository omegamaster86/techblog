"use client";

import {
	DragDropContext,
	Draggable,
	type DropResult,
	Droppable,
} from "@hello-pangea/dnd";
import { ActionIcon, Button, Card, Group, Text } from "@mantine/core";
import { IconGripVertical, IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";

type LinkItem = Doc<"links">;

function getOrderKey(items: LinkItem[]) {
	return items.map((item) => item._id).join(",");
}

function LinkCardContent({
	link,
	onDelete,
	dragHandleProps,
}: {
	link: LinkItem;
	onDelete: (id: Id<"links">) => void;
	dragHandleProps?: React.HTMLAttributes<HTMLButtonElement> | null;
}) {
	return (
		<Card
			shadow="sm"
			padding="lg"
			radius="md"
			withBorder
			className="flex flex-col h-[160px]"
			style={{
				backgroundColor: "rgba(255, 255, 255, 0.2)",
				borderColor: "rgba(255, 255, 255, 0.28)",
				backdropFilter: "blur(14px) saturate(160%)",
				WebkitBackdropFilter: "blur(14px) saturate(160%)",
			}}
		>
			<Group justify="space-between" mt="md" mb="xs" wrap="nowrap">
				<Group gap="xs" wrap="nowrap" className="flex-1 min-w-0">
					<button
						type="button"
						{...(dragHandleProps ?? {})}
						aria-label="ドラッグして並び替え"
						className="inline-flex items-center justify-center shrink-0 w-[22px] h-[22px] rounded cursor-grab active:cursor-grabbing text-white/80 hover:text-white hover:bg-white/10 border-0 bg-transparent p-0"
						style={{ touchAction: "none" }}
					>
						<IconGripVertical size={16} />
					</button>
					<Text fw={500} c="white" lineClamp={1} className="flex-1">
						{link.title}
					</Text>
				</Group>
				<ActionIcon
					variant="light"
					color="red"
					size="sm"
					onClick={() => onDelete(link._id)}
					aria-label="削除"
				>
					<IconTrash size={16} />
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
	);
}

function StaticLinkGrid({
	items,
	onDelete,
}: {
	items: LinkItem[];
	onDelete: (id: Id<"links">) => void;
}) {
	return (
		<div className="flex flex-wrap gap-5 max-w-5xl mx-auto">
			{items.map((link) => (
				<div
					key={link._id}
					className="w-full md:w-[calc(50%-10px)] lg:w-[calc(33.333%-14px)]"
				>
					<LinkCardContent link={link} onDelete={onDelete} />
				</div>
			))}
		</div>
	);
}

export function LinkList() {
	const links = useQuery(api.links.list);
	const removeLink = useMutation(api.links.remove);
	const reorderLinks = useMutation(api.links.reorder);
	const ensureOrders = useMutation(api.links.ensureOrders);
	const [items, setItems] = useState<LinkItem[]>([]);
	const [isMounted, setIsMounted] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const isPersistingRef = useRef(false);
	const hasEnsuredOrdersRef = useRef(false);

	useEffect(() => {
		setIsMounted(true);
	}, []);

	useEffect(() => {
		if (!links || isPersistingRef.current) return;

		setItems((current) => {
			if (current.length === 0) {
				return links;
			}

			if (getOrderKey(current) === getOrderKey(links)) {
				return current;
			}

			return links;
		});
	}, [links]);

	useEffect(() => {
		if (!links?.length || hasEnsuredOrdersRef.current) return;

		const needsOrder = links.some((link) => link.order === undefined);
		if (!needsOrder) {
			hasEnsuredOrdersRef.current = true;
			return;
		}

		hasEnsuredOrdersRef.current = true;
		void ensureOrders().catch((error) => {
			console.error("order の初期化に失敗しました:", error);
			hasEnsuredOrdersRef.current = false;
		});
	}, [links, ensureOrders]);

	const handleDelete = async (id: Id<"links">) => {
		await removeLink({ id });
	};

	const handleDragEnd = async (result: DropResult) => {
		setSaveError(null);

		if (!result.destination) return;

		const sourceIndex = result.source.index;
		const destinationIndex = result.destination.index;
		if (sourceIndex === destinationIndex) return;

		const reordered = [...items];
		const [moved] = reordered.splice(sourceIndex, 1);
		reordered.splice(destinationIndex, 0, moved);

		isPersistingRef.current = true;
		setItems(reordered);

		try {
			await reorderLinks({
				orderedIds: reordered.map((link) => link._id),
			});
		} catch (error) {
			console.error("並び替えの保存に失敗しました:", error);
			setSaveError(
				"並び替えの保存に失敗しました。Convex に最新の関数がデプロイされているか確認してください。",
			);
			if (links) setItems(links);
		} finally {
			isPersistingRef.current = false;
		}
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

	const displayItems = items.length > 0 ? items : links;

	return (
		<div>
			{saveError ? (
				<p className="text-red-300 text-center text-sm mb-4">{saveError}</p>
			) : null}

			{!isMounted ? (
				<StaticLinkGrid items={displayItems} onDelete={handleDelete} />
			) : (
				<DragDropContext onDragEnd={handleDragEnd}>
					<Droppable droppableId="links">
						{(provided) => (
							<div
								ref={provided.innerRef}
								{...provided.droppableProps}
								className="flex flex-wrap gap-5 max-w-5xl mx-auto touch-none"
							>
								{displayItems.map((link, index) => (
									<Draggable
										key={link._id}
										draggableId={link._id}
										index={index}
									>
										{(draggableProvided, snapshot) => (
											<div
												ref={draggableProvided.innerRef}
												{...draggableProvided.draggableProps}
												className="w-full md:w-[calc(50%-10px)] lg:w-[calc(33.333%-14px)]"
												style={{
													...draggableProvided.draggableProps.style,
													opacity: snapshot.isDragging ? 0.85 : 1,
												}}
											>
												<LinkCardContent
													link={link}
													onDelete={handleDelete}
													dragHandleProps={
														draggableProvided.dragHandleProps
													}
												/>
											</div>
										)}
									</Draggable>
								))}
								{provided.placeholder}
							</div>
						)}
					</Droppable>
				</DragDropContext>
			)}
		</div>
	);
}

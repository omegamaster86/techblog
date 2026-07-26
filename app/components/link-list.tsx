"use client";

import {
	DndContext,
	type DragOverEvent,
	KeyboardSensor,
	PointerSensor,
	closestCorners,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	SortableContext,
	arrayMove,
	rectSortingStrategy,
	sortableKeyboardCoordinates,
	useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ActionIcon, Button, Card, Group, Text } from "@mantine/core";
import { IconGripVertical, IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";

type LinkItem = Doc<"links">;

function SortableLinkCard({
	link,
	onDelete,
}: {
	link: LinkItem;
	onDelete: (id: Id<"links">) => void;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: link._id });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
		zIndex: isDragging ? 1 : 0,
	};

	return (
		<Card
			ref={setNodeRef}
			style={{
				...style,
				backgroundColor: "rgba(255, 255, 255, 0.2)",
				borderColor: "rgba(255, 255, 255, 0.28)",
				backdropFilter: "blur(14px) saturate(160%)",
				WebkitBackdropFilter: "blur(14px) saturate(160%)",
			}}
			shadow="sm"
			padding="lg"
			radius="md"
			withBorder
			className="flex flex-col h-[160px]"
		>
			<Group justify="space-between" mt="md" mb="xs" wrap="nowrap">
				<Group gap="xs" wrap="nowrap" className="flex-1 min-w-0">
					<ActionIcon
						variant="subtle"
						color="gray"
						size="sm"
						{...attributes}
						{...listeners}
						aria-label="ドラッグして並び替え"
						className="cursor-grab active:cursor-grabbing shrink-0"
						style={{ touchAction: "none" }}
					>
						<IconGripVertical size={16} color="white" />
					</ActionIcon>
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

export function LinkList() {
	const links = useQuery(api.links.list);
	const removeLink = useMutation(api.links.remove);
	const reorderLinks = useMutation(api.links.reorder);
	const [items, setItems] = useState<LinkItem[]>([]);
	const itemsRef = useRef<LinkItem[]>([]);

	useEffect(() => {
		if (links) {
			setItems(links);
			itemsRef.current = links;
		}
	}, [links]);

	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: { distance: 8 },
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const handleDelete = async (id: Id<"links">) => {
		await removeLink({ id });
	};

	const moveItem = (activeId: string, overId: string) => {
		setItems((current) => {
			const oldIndex = current.findIndex((link) => link._id === activeId);
			const newIndex = current.findIndex((link) => link._id === overId);
			if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
				return current;
			}
			const next = arrayMove(current, oldIndex, newIndex);
			itemsRef.current = next;
			return next;
		});
	};

	const handleDragOver = (event: DragOverEvent) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		moveItem(String(active.id), String(over.id));
	};

	const handleDragEnd = async () => {
		if (!links) return;

		const finalItems = itemsRef.current;
		const hasOrderChanged = finalItems.some(
			(link, index) => link._id !== links[index]?._id,
		);
		if (!hasOrderChanged) return;

		try {
			await reorderLinks({
				orderedIds: finalItems.map((link) => link._id),
			});
		} catch (error) {
			console.error("並び替えの保存に失敗しました:", error);
			setItems(links);
			itemsRef.current = links;
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

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCorners}
			onDragOver={handleDragOver}
			onDragEnd={handleDragEnd}
		>
			<SortableContext
				items={items.map((link) => link._id)}
				strategy={rectSortingStrategy}
			>
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
					{items.map((link) => (
						<SortableLinkCard
							key={link._id}
							link={link}
							onDelete={handleDelete}
						/>
					))}
				</div>
			</SortableContext>
		</DndContext>
	);
}

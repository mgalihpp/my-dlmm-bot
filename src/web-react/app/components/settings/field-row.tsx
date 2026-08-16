import { useRef } from "react";
import { useSubmit } from "react-router";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import type { EditableField } from "~/lib/settings";

export function FieldRow({
	field,
	value,
}: {
	field: EditableField;
	value: unknown;
}) {
	const submit = useSubmit();
	const formRef = useRef<HTMLFormElement>(null);

	const send = (formData: FormData) => {
		formData.set("op", "setField");
		formData.set("path", field.path);
		submit(formData, { method: "post", replace: true });
	};

	const label = (
		<>
			{field.label}
			<span className="text-muted-foreground/60">· {field.path}</span>
		</>
	);

	if (field.type === "boolean") {
		const checked = value === true;
		return (
			<form ref={formRef} method="post">
				<Field orientation="horizontal">
					<FieldLabel>
						<Checkbox
							checked={checked}
							onCheckedChange={(v) => {
								const fd = new FormData(formRef.current ?? undefined);
								fd.set("value", v === true ? "true" : "false");
								send(fd);
							}}
						/>
						{field.label}
					</FieldLabel>
					<FieldContent />
				</Field>
			</form>
		);
	}

	if (field.type === "enum") {
		return (
			<form ref={formRef} method="post">
				<Field>
					<FieldLabel>{label}</FieldLabel>
					<FieldContent>
						<Select
							value={typeof value === "string" ? value : ""}
							onValueChange={(v) => {
								const fd = new FormData(formRef.current ?? undefined);
								fd.set("value", v);
								send(fd);
							}}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select…" />
							</SelectTrigger>
							<SelectContent>
								{(field.values ?? []).map((v) => (
									<SelectItem key={v} value={v}>
										{v}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</FieldContent>
				</Field>
			</form>
		);
	}

	if (field.type === "list") {
		const text = Array.isArray(value) ? (value as unknown[]).join(", ") : "";
		return (
			<form ref={formRef} method="post">
				<Field>
					<FieldLabel>{label}</FieldLabel>
					<FieldContent>
						<Input
							defaultValue={text}
							placeholder="Comma-separated values"
							onBlur={(e) => {
								const fd = new FormData(formRef.current ?? undefined);
								fd.set("value", e.target.value);
								send(fd);
							}}
						/>
					</FieldContent>
				</Field>
			</form>
		);
	}

	const inputValue = value === null || value === undefined ? "" : String(value);
	return (
		<form ref={formRef} method="post">
			<Field>
				<FieldLabel>{label}</FieldLabel>
				<FieldContent>
					<Input
						type={field.type === "number" ? "number" : "text"}
						defaultValue={inputValue}
						onBlur={(e) => {
							const fd = new FormData(formRef.current ?? undefined);
							fd.set("value", e.target.value);
							send(fd);
						}}
					/>
					<FieldDescription>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-5 px-1 text-xs text-muted-foreground"
							onClick={() => {
								const fd = new FormData(formRef.current ?? undefined);
								fd.set("op", "resetField");
								fd.set("path", field.path);
								submit(fd, { method: "post", replace: true });
							}}
						>
							Reset to default
						</Button>
					</FieldDescription>
				</FieldContent>
			</Field>
		</form>
	);
}

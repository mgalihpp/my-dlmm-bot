"use client";

import { Button } from "~/components/ui/button";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";

export function LoginForm({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div className={cn("flex flex-col gap-6", className)} {...props}>
			<form>
				<FieldGroup>
					<div className="flex flex-col items-center gap-2 text-center">
						<a
							href="/"
							className="flex flex-col items-center gap-2 font-medium"
						>
							<div className="flex items-center justify-center rounded-md">
								<img src="/logo.png" alt="Vexis" width={200} />
							</div>
							<span className="sr-only">Vexis</span>
						</a>
						<h1 className="text-xl font-bold">Welcome back!</h1>
						<FieldDescription>
							Use your credentials to enter the dashboard.
						</FieldDescription>
					</div>
					<Field>
						<FieldLabel htmlFor="passwprd">Password</FieldLabel>
						<Input
							id="password"
							type="password"
							placeholder="Enter your password"
							required
						/>
					</Field>
					<Field>
						<Button type="submit">Login</Button>
					</Field>
				</FieldGroup>
			</form>
		</div>
	);
}

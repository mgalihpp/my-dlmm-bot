import { Form, redirect, useNavigation } from "react-router";
import { Button } from "~/components/ui/button";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { passwordMatches } from "~/lib/server/auth";
import { getWebPassword } from "~/lib/server/portfolio.server";
import { sessionCookieHeader } from "~/lib/server/session.server";
import { cn } from "~/lib/utils";
import type { Route } from "./+types/login";

export async function action({ request }: Route.ActionArgs) {
	const formData = await request.formData();
	const password = String(formData.get("password") ?? "");
	const expected = await getWebPassword();
	if (expected.length === 0) {
		return { error: "No web password is configured on the backend." };
	}
	if (!passwordMatches(password, expected)) {
		return { error: "Wrong password." };
	}
	throw redirect("/portfolio", {
		headers: { "set-cookie": sessionCookieHeader(expected) },
	});
}

export default function LoginPage({ actionData }: Route.ComponentProps) {
	const navigation = useNavigation();
	const submitting = navigation.state === "submitting";

	return (
		<div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
			<div className="w-full max-w-sm">
				<div className={cn("flex flex-col gap-6")}>
					<Form method="post">
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
									Use your dashboard password to enter.
								</FieldDescription>
							</div>
							<Field>
								<FieldLabel htmlFor="password">Password</FieldLabel>
								<Input
									id="password"
									name="password"
									type="password"
									placeholder="Enter your password"
									required
									autoFocus
								/>
								{actionData?.error ? (
									<FieldError>{actionData.error}</FieldError>
								) : null}
							</Field>
							<Field>
								<Button type="submit" disabled={submitting}>
									{submitting ? "Signing in…" : "Login"}
								</Button>
							</Field>
						</FieldGroup>
					</Form>
				</div>
			</div>
		</div>
	);
}

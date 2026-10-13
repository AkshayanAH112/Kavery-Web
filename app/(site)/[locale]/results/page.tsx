import { redirect } from "next/navigation";

// Results moved into the parent page, which asks for the student card (or the index number
// and the registered phone number) rather than the index number alone. Old links still land.
export default async function ResultsPage({ params }: PageProps<"/[locale]/results">) {
  redirect(`/${(await params).locale}/parents`);
}

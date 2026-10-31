import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <h1 className="font-display text-4xl">That page is not in the books.</h1>
      <Link href="/" className="mt-4 inline-block text-sm text-accent">
        Back to the desk
      </Link>
    </main>
  );
}

import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="flex flex-col justify-center text-center flex-1 gap-4">
      <h1 className="text-3xl font-bold">Learn Fullstack</h1>
      <p className="text-fd-muted-foreground">
        PostgreSQL, Redis, fullstack development ও AI — ধাপে ধাপে।
      </p>
      <Link href="/docs" className="font-medium underline">
        Start reading
      </Link>
    </div>
  );
}

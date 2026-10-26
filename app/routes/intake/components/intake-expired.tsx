/** The only thing an expired, replaced or unknown link shows (WI-003 E4, WI-004 E5). */
export function IntakeExpired({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <p role="alert" className="max-w-md text-center text-lg">
        {message}
      </p>
    </main>
  );
}

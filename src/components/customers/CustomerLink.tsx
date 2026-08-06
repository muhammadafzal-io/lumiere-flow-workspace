import Link from "next/link";

/** Links to a customer's profile when their id is known; otherwise renders plain text — never a
 * dead link (customer↔appointment correlation is best-effort phone/name matching, so an id is
 * often genuinely unavailable). */
export function CustomerLink({
  customerId,
  name,
  className,
}: {
  customerId: string | undefined | null;
  name: string;
  className?: string;
}) {
  if (!customerId) return <span className={className}>{name}</span>;
  return (
    <Link href={`/customers/${customerId}`} className={`hover:underline ${className ?? ""}`}>
      {name}
    </Link>
  );
}

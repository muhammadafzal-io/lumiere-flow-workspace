/**
 * The AI front desk's face — the robot mascot that stands in for the letter "L" everywhere the bot
 * speaks (chat header, each of its messages, the voice call). The picture is /bot-avatar.jpg in
 * public/, cropped to a square head-and-shoulders; swap that file to change it everywhere.
 */
export function BotAvatar({ className = "" }: { className?: string }) {
  return (
    <img
      src="/bot-avatar.jpg"
      alt=""
      width={120}
      height={120}
      className={`rounded-full bg-[#2a0f5c] object-cover ${className}`}
    />
  );
}

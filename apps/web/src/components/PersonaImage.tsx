type Props = { keyName: string; title: string; size?: "sm"|"md"|"lg"|"xl" };
export default function PersonaImage({ keyName, title, size="lg" }: Props) {
  const px = size==="xl" ? 192 : size==="lg" ? 160 : size==="md" ? 96 : 64;
  const src = `/persona-images/${encodeURIComponent(keyName)}.png`;
  return <img src={src} alt={title} width={px} height={px} className="rounded-2xl border object-cover aspect-square bg-white" />;
}

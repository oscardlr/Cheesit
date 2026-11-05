export default function CreditCoin({ size = 16, alt = '' }: { size?: number; alt?: string }) {
  return (
    <img
      src="/assets/cheesit-credit-coin.png"
      alt={alt}
      width={size}
      height={size}
      style={{ verticalAlign: 'middle', flexShrink: 0 }}
    />
  );
}

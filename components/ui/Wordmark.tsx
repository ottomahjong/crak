export function Wordmark({ small = false }: { small?: boolean }) {
  return (
    <h1 className={`wordmark ${small ? "wordmark--sm" : ""}`} aria-label="CRAK!">
      <span aria-hidden>CRAK</span>
      <span className="wordmark__bang" aria-hidden>!</span>
    </h1>
  );
}

"use client";

type Props = {
  bonus: number;
  round: number;
  onContinue: () => void;
};

export function MahjOverlay({ bonus, round, onContinue }: Props) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Hand complete">
      <div className="overlay__card celebrate">
        <div className="mahj-word">MAHJ!</div>
        <p className="overlay__sub">Hand complete</p>
        <div className="mahj-bonus">+{bonus.toLocaleString()}</div>
        <p className="overlay__note">Round {round + 1} begins — three low tiles clear for room.</p>
        <button className="btn btn--primary" onClick={onContinue} autoFocus>
          Keep playing
        </button>
      </div>
    </div>
  );
}

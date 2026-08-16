"use client";

/**
 * Small "Apply" button used by the AI price suggestion card on the quote
 * detail page. Clicking it fills the price form's `amount` input with the
 * suggested value (in dollars, two decimals) and focuses it so the admin
 * can review or tweak before submitting.
 *
 * The button is intentionally not auto-submitting — we want the admin to
 * eyeball the number first.
 */
export function ApplyPriceButton({
  cents,
  formSelector = "form[data-gyl-price-form]",
  inputName = "amount",
  className,
}: {
  cents: number;
  formSelector?: string;
  inputName?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={
        className ??
        "rounded-md border border-accent/40 bg-accent-tint px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/10"
      }
      onClick={() => {
        const form = document.querySelector<HTMLFormElement>(formSelector);
        if (!form) return;
        const input = form.querySelector<HTMLInputElement>(`input[name="${inputName}"]`);
        if (!input) return;
        const dollars = (cents / 100).toFixed(2);
        input.value = dollars;
        // Fire input/change so any controlled wrapper picks the value up.
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.focus();
      }}
    >
      Apply →
    </button>
  );
}

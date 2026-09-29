# Calculator architecture

Each calculator is a pure, deterministic function in its own file, e.g. `income-tax.mjs`,
exporting a `calculate(input) -> result` function with no network/AI calls. A thin Astro
island wires up a form to it.

Rules for adding a calculator:
1. Add the rate/slab/threshold table as a plain data object, dated and cited (Finance Act
   year, section, official source URL) in a comment above it.
2. Never let the research/generation pipeline (scripts/generate.mjs) auto-fill these numbers —
   `AI_PROVIDER` output must not be plugged into a calculator's data table without a human
   (or a separate, explicitly-cited verification step) confirming it against the primary source.
3. Write a couple of unit-testable example cases directly in the file as comments so a
   future change to the table is easy to sanity check by hand.
4. Only then flip the calculator's `status` in `src/pages/tax-calculators/index.astro` from
   "pending ... verification" to a real link.

No calculators are wired to real rate tables yet — see the index page for status.

# Misconception taxonomy

The misconception agent must pick exactly one `label` from this list. It also writes a one-sentence
`misconception_text` in plain language that names the student's wrong belief.

| label | meaning | example |
|---|---|---|
| condition_vs_prediction | mixes up the real-world condition with what the model predicted | Treats "actually positive" as "predicted positive" when reading precision |
| formula_inversion | swaps numerator/denominator or two related formulas | Computes precision as TP/(TP+FN) |
| definition_mixup | confuses two related terms | Says recall is "how many predictions were right" |
| scope_overgeneralization | applies a rule outside the case where it holds | "High accuracy always means a good model" |
| calculation_error | right idea, arithmetic or reading-the-table slip | Reads FP from the wrong cell |
| guess_or_unknown | no coherent belief visible (guess or blank) | Random option, "I don't know" |

## Few-shot

Question: A spam filter marks 10 emails as spam; 8 really are spam. What is its precision?
Student answered: 40% (the share of all real spam it caught)
-> {"label": "definition_mixup", "misconception_text": "Confuses precision (how many flagged emails are really spam) with recall (how many real spam emails were caught).", "severity_hint": "high"}

Question: Which cell counts emails the model called spam that were actually fine?
Student answered: False Negative
-> {"label": "condition_vs_prediction", "misconception_text": "Mixes up the real condition with the model's prediction, so a wrongly flagged email is read as a missed one.", "severity_hint": "high"}

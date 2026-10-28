import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import ksisJson from "../../form-definitions/ksis.v1.json";
import {
  blockStatus,
  blockSummaries,
  checkKsisAnswers,
  countsText,
  followUps,
  ksiCounts,
  normalizeKsisAnswers,
  type KsisAnswers,
  type KsisDefinition,
} from "./ksis";

/** WI-005 §3, E2, E5, E7: the tab 2 form definition and the shared status, count and check rules. */

const definition = ksisJson as KsisDefinition;
const design = readFileSync(path.join(process.cwd(), "openspec", "changes", "intake-ksis", "design.md"), "utf8");
const empty = () => normalizeKsisAnswers(definition, undefined);

function withAnswers(edit: (a: KsisAnswers) => void): KsisAnswers {
  const answers = empty();
  edit(answers);
  return answers;
}

describe("ksis.v1.json (E2)", () => {
  it("2.1 holds the seven Class A KSIs in playbook order, then the Vulnerability detection block", () => {
    expect(definition.ksis.map((b) => b.code)).toEqual(["KSI-CED-RAT", "KSI-CMT-LMC", "KSI-CNA-RNT", "KSI-IAM-AAM", "KSI-IAM-APM", "KSI-INR-RIR", "KSI-SVC-SIN"]);
    expect(definition.readiness.title).toBe("Vulnerability detection");
  });

  it("2.4 every question is word for word the §3 table, one per block and two for KSI-IAM-APM; intake 24 and 17 are not there", () => {
    const rows = [...design.matchAll(/^\| (KSI-[A-Z]{3}-[A-Z]{3})[^|]*\| (\w+)(?: \(new\))? \| (.+?) \| [^|]* \|$/gm)].map((m) => ({ code: m[1], id: m[2], text: m[3] }));
    expect(rows).toHaveLength(8);
    const questions = definition.ksis.flatMap((b) => b.questions.map((q) => ({ code: b.code, id: q.id, text: q.text })));
    expect(questions).toEqual(rows);
    expect(definition.ksis.map((b) => b.questions.length)).toEqual([1, 1, 1, 1, 2, 1, 1]);
    const ids = [...questions, ...definition.readiness.questions].map((q) => q.id);
    expect(ids).not.toContain("24");
    expect(ids).not.toContain("17");
  });

  it("2.3 the separate optional \"How often?\" line is on KSI-IAM-AAM, KSI-IAM-APM and KSI-SVC-SIN only; the three \"persistently reviewed\" KSIs ask it inside the question", () => {
    expect(definition.ksis.filter((b) => b.howOften === "optional").map((b) => b.code)).toEqual(["KSI-IAM-AAM", "KSI-IAM-APM", "KSI-SVC-SIN"]);
    expect(definition.ksis.filter((b) => b.howOften === "required").map((b) => b.code)).toEqual(["KSI-CED-RAT", "KSI-CNA-RNT", "KSI-INR-RIR"]);
    expect(definition.labels.howOftenHelp).toBe("FedRAMP expects ongoing activities to run on a known, documented cycle.");
    expect(design).toContain(`"${definition.labels.howOftenHelp}"`);
    expect(design).toContain(`"${definition.labels.needHelp}"`);
  });

  it("2.5 each \"why we ask\" line is Christina's customer-facing line verbatim", () => {
    for (const block of definition.ksis) expect(design).toContain(`${block.code}: "${block.why}"`);
    const [q18, q19] = definition.readiness.questions;
    expect(design).toContain(`question 18: "${q18!.why}"`);
    expect(design).toContain(`question 19: "${q19!.why}"`);
    expect(design).toContain(`"${definition.readiness.note}"`);
    expect(design).toContain(`intake 18, reworded "${q18!.text}"`);
    expect(design).toContain(`intake 19, reworded "${q19!.text}"`);
    expect(q19!.recommended).toBe(true);
    expect(definition.labels.recommended).toBe("Recommended");
  });

  it("holds no KSI name or statement: those come from the vendored rules", () => {
    const data = JSON.parse(JSON.stringify(definition, (key, value: unknown) => (key === "$comment" ? undefined : value))) as unknown;
    expect(JSON.stringify(data)).not.toMatch(/statement|Reviewing All Training|persistently reviewed/);
  });
});

describe("blockStatus (E5)", () => {
  const apm = definition.ksis.find((b) => b.code === "KSI-IAM-APM")!;
  const vuln = definition.readiness.questions;

  it("2.7 every question with text after trimming is Answered; the optional How often? line does not matter", () => {
    expect(blockStatus(apm.questions, { questions: { "14": "FIDO2", "14b": "Nowhere" }, need_help: false })).toBe("answered");
    const block = { questions: { "14": "FIDO2", "14b": "Nowhere" }, how_often: "", need_help: false };
    expect(blockStatus(apm.questions, block)).toBe("answered");
  });

  it("2.7 only the optional How often? line filled is Not answered; spaces only are not an answer", () => {
    const answers = withAnswers((a) => {
      a.ksi["KSI-IAM-APM"]!.how_often = "Quarterly";
      a.ksi["KSI-IAM-AAM"]!.questions["15"] = "   \n ";
    });
    const status = Object.fromEntries(blockSummaries(definition, answers).map((b) => [b.key, b.status]));
    expect(status["KSI-IAM-APM"]).toBe("not_answered");
    expect(status["KSI-IAM-AAM"]).toBe("not_answered");
  });

  it("2.7 Vulnerability detection: question 18 answered is Answered; only the recommended question 19 is Not answered", () => {
    expect(blockStatus(vuln, { questions: { "18": "Weekly scans", "19": "" }, need_help: false })).toBe("answered");
    expect(blockStatus(vuln, { questions: { "18": "", "19": "30 days" }, need_help: false })).toBe("not_answered");
  });

  it("2.8 some but not all questions is Partly answered; nothing and no help is Not answered", () => {
    expect(blockStatus(apm.questions, { questions: { "14": "FIDO2", "14b": "" }, need_help: false })).toBe("partly");
    expect(blockStatus(apm.questions, { questions: { "14": "", "14b": "" }, need_help: false })).toBe("not_answered");
  });

  it("2.6, 2.9 Needs help outranks Answered and Partly answered, and a ticked box alone is Needs help", () => {
    expect(blockStatus(apm.questions, { questions: { "14": "FIDO2", "14b": "Nowhere" }, need_help: true })).toBe("needs_help");
    expect(blockStatus(apm.questions, { questions: { "14": "FIDO2", "14b": "" }, need_help: true })).toBe("needs_help");
    expect(blockStatus(apm.questions, { questions: { "14": "", "14b": "" }, need_help: true })).toBe("needs_help");
  });

  it("a frequency inside the question is not detected: any text answers the required-frequency KSIs", () => {
    expect(blockStatus(definition.ksis[0]!.questions, { questions: { "22": "We run phishing tests." }, need_help: false })).toBe("answered");
  });
});

describe("ksiCounts (2.9, 2.10)", () => {
  it("counts a Needs help block with every answer in both counts, and one with only the box ticked only in needs help", () => {
    const answers = withAnswers((a) => {
      a.ksi["KSI-CED-RAT"]!.questions["22"] = "Quiz scores, yearly";
      a.ksi["KSI-CED-RAT"]!.need_help = true;
      a.ksi["KSI-CMT-LMC"]!.need_help = true;
    });
    expect(ksiCounts(definition, answers)).toEqual({ answered: 1, needsHelp: 2, total: 7 });
  });

  it("does not count the Vulnerability detection block, and reads like the spec's example", () => {
    const answers = withAnswers((a) => {
      for (const block of definition.ksis.slice(0, 5)) for (const q of block.questions) a.ksi[block.code]!.questions[q.id] = "Yes";
      a.ksi["KSI-SVC-SIN"]!.need_help = true;
      a.readiness.vulnerability_detection = { questions: { "18": "Scans", "19": "30 days" }, need_help: true };
    });
    expect(countsText(ksiCounts(definition, answers))).toBe("5/7 answered, 1 needs help");
  });
});

describe("followUps (2.6, 2.15)", () => {
  it("lists Needs help and Not answered blocks, never Partly answered or Answered", () => {
    const answers = withAnswers((a) => {
      a.ksi["KSI-CED-RAT"]!.questions["22"] = "Yes";
      a.ksi["KSI-IAM-APM"]!.questions["14"] = "FIDO2";
      a.ksi["KSI-SVC-SIN"]!.need_help = true;
      a.readiness.vulnerability_detection.questions["18"] = "Scans";
    });
    expect(followUps(definition, answers).map((b) => `${b.key}:${b.status}`)).toEqual([
      "KSI-CMT-LMC:not_answered",
      "KSI-CNA-RNT:not_answered",
      "KSI-IAM-AAM:not_answered",
      "KSI-INR-RIR:not_answered",
      "KSI-SVC-SIN:needs_help",
    ]);
  });
});

describe("checkKsisAnswers (2.12, 2.16, E3, E7)", () => {
  const ok = (input: unknown) => checkKsisAnswers(definition, input).ok;

  it("accepts the stored shape, partial blocks and an empty save, and fills the rest", () => {
    const result = checkKsisAnswers(definition, { ksi: { "KSI-IAM-APM": { questions: { "14b": "VPN" }, how_often: "Yearly", need_help: true } } });
    expect(result.ok && result.answers.ksi["KSI-IAM-APM"]).toEqual({ questions: { "14": "", "14b": "VPN" }, how_often: "Yearly", need_help: true });
    expect(result.ok && result.answers.ksi["KSI-CED-RAT"]).toEqual({ questions: { "22": "" }, how_often: null, need_help: false });
    expect(ok({})).toBe(true);
  });

  it("refuses any block, question or field id that is not in the form definition", () => {
    expect(ok({ ksi: { "KSI-MLA-OSM": { questions: {} } } })).toBe(false);
    expect(ok({ ksi: { "KSI-CED-RAT": { questions: { "24": "x" } } } })).toBe(false);
    expect(ok({ ksi: { "KSI-CED-RAT": { questions: { "22": "x" }, note: "x" } } })).toBe(false);
    expect(ok({ readiness: { other: {} } })).toBe(false);
    expect(ok({ readiness: { vulnerability_detection: { questions: { "17": "logs" } } } })).toBe(false);
    expect(ok({ extra: 1 })).toBe(false);
  });

  it("refuses rules_version from the browser: the server stamps it", () => {
    expect(ok({ rules_version: "anything", ksi: {} })).toBe(false);
  });

  it("2.16 refuses Ignyte's consultant fields wherever they are put", () => {
    for (const field of ["cmvp_validated", "cmvp_note", "log_context_note"]) {
      expect(ok({ [field]: "x" })).toBe(false);
      expect(ok({ ksi: { "KSI-SVC-SIN": { [field]: "x" } } })).toBe(false);
    }
  });

  it("refuses a How often? value on a block without the optional line, and wrong types", () => {
    expect(ok({ ksi: { "KSI-CED-RAT": { how_often: "Monthly" } } })).toBe(false);
    expect(ok({ ksi: { "KSI-CED-RAT": { how_often: null } } })).toBe(true);
    expect(ok({ ksi: { "KSI-IAM-AAM": { need_help: "yes" } } })).toBe(false);
    expect(ok({ ksi: { "KSI-IAM-AAM": { questions: { "15": 5 } } } })).toBe(false);
  });

  it("2.12 refuses an answer over 10,000 characters and a How often? over 200, and accepts exactly the limits", () => {
    const { answer, howOften } = definition.limits;
    expect([answer, howOften]).toEqual([10_000, 200]);
    expect(ok({ ksi: { "KSI-IAM-AAM": { questions: { "15": "x".repeat(answer) }, how_often: "y".repeat(howOften) } } })).toBe(true);
    expect(checkKsisAnswers(definition, { ksi: { "KSI-IAM-AAM": { questions: { "15": "x".repeat(answer + 1) } } } })).toEqual({
      ok: false,
      message: "An answer is longer than 10,000 characters. Shorten it and try again.",
    });
    expect(checkKsisAnswers(definition, { ksi: { "KSI-IAM-AAM": { how_often: "y".repeat(howOften + 1) } } })).toEqual({
      ok: false,
      message: '"How often?" is longer than 200 characters. Shorten it and try again.',
    });
    expect(ok({ readiness: { vulnerability_detection: { questions: { "19": "x".repeat(answer + 1) } } } })).toBe(false);
  });

  it("stores answers as typed, spaces included", () => {
    const result = checkKsisAnswers(definition, { ksi: { "KSI-CMT-LMC": { questions: { "21": "  CloudTrail \n" } } } });
    expect(result.ok && result.answers.ksi["KSI-CMT-LMC"]!.questions["21"]).toBe("  CloudTrail \n");
  });
});

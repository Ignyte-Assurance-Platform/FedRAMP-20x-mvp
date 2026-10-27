import { useId } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { isEmpty, packageIdFallback, type FormField } from "~/lib/form-definition";

/**
 * Draws one tab 1 field from the generated definition (WI-004): text, long text, url, email,
 * date, select (exact schema strings), multi-select, list of strings, yes/no, object groups and
 * repeating lists. Problems are matched by JSON pointer into the answers.
 */

export type Answers = Record<string, unknown>;
const isRecord = (v: unknown): v is Answers => typeof v === "object" && v !== null && !Array.isArray(v);
/** Controls that are a group of inputs: a <label for> cannot name them, aria-labelledby does. */
const GROUPED = new Set<FormField["kind"]>(["multiSelect", "boolean", "stringList"]);

export const PACKAGE_ID_PATH = "/serviceIdentification/fedRampPackageId";
export const PACKAGE_ID_NOTE = "Filled in automatically until FedRAMP assigns your ID";

export interface FieldContext {
  disabled: boolean;
  problems: ReadonlyMap<string, string>;
  /** The whole tab 1 object, for the package ID fallback. */
  root: Answers;
  renderLogo: (field: FormField, describedBy: string | undefined) => React.ReactNode;
}

/** A DOM id for a field path; problem links and focus use it. */
export function fieldDomId(pointer: string): string {
  return `q${pointer.replace(/[^A-Za-z0-9]+/g, "-")}`;
}

function Help({ field, id }: { field: FormField; id: string }) {
  if (!field.help && !field.note && !field.why) return null;
  return (
    <div id={id} className="grid gap-1 text-xs text-muted-foreground">
      {field.help && <p>{field.help}</p>}
      {field.note && <p>{field.note}</p>}
      {field.why?.map((line) => (
        <p key={line} className="italic">
          Why we ask: {line}
        </p>
      ))}
    </div>
  );
}

function RequiredMark({ required }: { required: boolean }) {
  return required ? (
    <span className="text-destructive">
      <span aria-hidden="true"> *</span>
      <span className="sr-only"> (required)</span>
    </span>
  ) : null;
}

export function Fields({
  fields,
  value,
  pointer,
  onChange,
  ctx,
}: {
  fields: FormField[];
  value: Answers;
  pointer: string;
  onChange: (next: Answers) => void;
  ctx: FieldContext;
}) {
  return (
    <>
      {fields.map((field) => (
        <FieldView
          key={field.key}
          field={field}
          value={value[field.key]}
          pointer={`${pointer}/${field.key}`}
          siblings={value}
          onChange={(next) => {
            const copy = { ...value };
            if (next === undefined) delete copy[field.key];
            else copy[field.key] = next;
            onChange(copy);
          }}
          ctx={ctx}
        />
      ))}
    </>
  );
}

function FieldView({
  field,
  value,
  pointer,
  siblings,
  onChange,
  ctx,
}: {
  field: FormField;
  value: unknown;
  pointer: string;
  siblings: Answers;
  onChange: (next: unknown) => void;
  ctx: FieldContext;
}) {
  const id = fieldDomId(pointer);
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const error = ctx.problems.get(pointer);
  const required = field.required || (field.requiredWhen !== undefined && siblings[field.requiredWhen.key] === field.requiredWhen.equals);
  const describedBy = [field.help || field.note || field.why ? helpId : "", error ? errorId : ""].filter(Boolean).join(" ") || undefined;
  const errorText = error ? (
    <p id={errorId} className="text-sm text-destructive">
      {error}
    </p>
  ) : null;

  if (field.kind === "group" || field.kind === "list") {
    return (
      <fieldset id={id} tabIndex={-1} className="grid gap-4 rounded-md border p-4" aria-describedby={describedBy}>
        <legend className="px-1 font-medium">
          {field.label}
          <RequiredMark required={required} />
        </legend>
        <Help field={field} id={helpId} />
        {errorText}
        {field.kind === "group" ? (
          <Fields fields={field.fields ?? []} value={isRecord(value) ? value : {}} pointer={pointer} onChange={(next) => onChange(isEmpty(next) ? undefined : next)} ctx={ctx} />
        ) : (
          <ListItems field={field} items={Array.isArray(value) ? value : []} pointer={pointer} onChange={onChange} ctx={ctx} />
        )}
      </fieldset>
    );
  }

  if (field.kind === "logo") {
    return (
      <div className="grid gap-1.5">
        <Label htmlFor={id}>
          {field.label}
          <RequiredMark required={required} />
        </Label>
        {ctx.renderLogo(field, describedBy)}
        <Help field={field} id={helpId} />
        {errorText}
      </div>
    );
  }

  const text = typeof value === "string" ? value : "";
  const fallback = pointer === PACKAGE_ID_PATH && text.trim() === "" ? packageIdFallback(ctx.root) : "";
  const common = {
    id,
    disabled: ctx.disabled,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": [describedBy, fallback ? `${id}-fallback` : ""].filter(Boolean).join(" ") || undefined,
    "aria-required": required || undefined,
  };
  const setText = (next: string) => onChange(next === "" ? undefined : next);

  let control: React.ReactNode;
  switch (field.kind) {
    case "longText":
      control = <textarea {...common} rows={3} value={text} onChange={(e) => setText(e.target.value)} className="rounded-md border bg-transparent px-3 py-2 text-sm" />;
      break;
    case "select":
      control = (
        <select {...common} value={text} onChange={(e) => setText(e.target.value)} className="h-9 rounded-md border bg-transparent px-3 text-sm">
          <option value="">Choose…</option>
          {field.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
      break;
    case "multiSelect": {
      const chosen = Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
      control = (
        <div id={id} tabIndex={-1} role="group" aria-labelledby={`${id}-label`} aria-describedby={common["aria-describedby"]} className="grid gap-1 sm:grid-cols-2">
          {field.options?.map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                disabled={ctx.disabled}
                checked={chosen.includes(option)}
                onChange={(e) => {
                  const next = e.target.checked ? [...chosen, option] : chosen.filter((x) => x !== option);
                  onChange(next.length ? field.options!.filter((o) => next.includes(o)) : undefined);
                }}
              />
              {option}
            </label>
          ))}
        </div>
      );
      break;
    }
    case "stringList":
      control = <StringList id={id} field={field} value={value} onChange={onChange} disabled={ctx.disabled} describedBy={common["aria-describedby"]} />;
      break;
    case "boolean":
      control = (
        <div id={id} tabIndex={-1} role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={common["aria-describedby"]} className="flex gap-4 text-sm">
          {[true, false].map((option) => (
            <label key={String(option)} className="flex items-center gap-2">
              <input type="radio" name={id} className="size-4 accent-primary" disabled={ctx.disabled} checked={value === option} onChange={() => onChange(option)} />
              {option ? "Yes" : "No"}
            </label>
          ))}
        </div>
      );
      break;
    default: {
      const type = field.kind === "url" ? "url" : field.kind === "email" ? "email" : field.kind === "date" ? "date" : "text";
      const listId = field.suggestions ? `${id}-suggestions` : undefined;
      control = (
        <>
          <Input {...common} type={type} value={text} list={listId} placeholder={fallback || field.placeholder} onChange={(e) => setText(e.target.value)} autoComplete="off" />
          {listId && (
            <datalist id={listId}>
              {field.suggestions!.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          )}
        </>
      );
    }
  }

  return (
    <div className="grid gap-1.5">
      <Label id={`${id}-label`} htmlFor={GROUPED.has(field.kind) ? undefined : id}>
        {field.label}
        <RequiredMark required={required} />
      </Label>
      {control}
      {fallback && (
        <p id={`${id}-fallback`} className="text-xs text-muted-foreground">
          {PACKAGE_ID_NOTE}
        </p>
      )}
      <Help field={field} id={helpId} />
      {errorText}
    </div>
  );
}

function StringList({ id, field, value, onChange, disabled, describedBy }: { id: string; field: FormField; value: unknown; onChange: (next: unknown) => void; disabled: boolean; describedBy?: string }) {
  const items = Array.isArray(value) ? value.map((x) => (typeof x === "string" ? x : "")) : [];
  const shown = items.length ? items : [""];
  const listId = `${id}-suggestions`;
  const commit = (next: string[]) => {
    const kept = next.filter((x) => x.trim() !== "");
    onChange(kept.length ? next : undefined);
  };
  return (
    <div id={id} tabIndex={-1} role="group" aria-labelledby={`${id}-label`} aria-describedby={describedBy} className="grid gap-2">
      {shown.map((item, i) => (
        <div key={i} className="flex gap-2">
          <Input
            aria-label={`${field.label} ${i + 1}`}
            value={item}
            list={field.suggestions ? listId : undefined}
            disabled={disabled}
            onChange={(e) => commit(shown.map((x, j) => (j === i ? e.target.value : x)))}
          />
          {shown.length > 1 && (
            <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => commit(shown.filter((_, j) => j !== i))}>
              Remove
            </Button>
          )}
        </div>
      ))}
      <div>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onChange([...shown, ""])}>
          Add another
        </Button>
      </div>
      {field.suggestions && (
        <datalist id={listId}>
          {field.suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  );
}

function ListItems({ field, items, pointer, onChange, ctx }: { field: FormField; items: unknown[]; pointer: string; onChange: (next: unknown) => void; ctx: FieldContext }) {
  const label = field.itemLabel ?? field.label;
  const headingId = useId();
  return (
    <div className="grid gap-3">
      {items.map((item, i) => (
        <section key={i} aria-labelledby={`${headingId}-${i}`} className="grid gap-3 rounded-md bg-muted/30 p-3">
          <div className="flex items-center justify-between">
            <h4 id={`${headingId}-${i}`} className="text-sm font-medium">
              {label} {i + 1}
            </h4>
            <Button type="button" variant="ghost" size="sm" disabled={ctx.disabled} onClick={() => onChange(items.length > 1 ? items.filter((_, j) => j !== i) : undefined)}>
              Remove
            </Button>
          </div>
          <Fields
            fields={field.fields ?? []}
            value={isRecord(item) ? item : {}}
            pointer={`${pointer}/${i}`}
            onChange={(next) => onChange(items.map((x, j) => (j === i ? next : x)))}
            ctx={ctx}
          />
        </section>
      ))}
      <div>
        <Button type="button" variant="outline" size="sm" disabled={ctx.disabled} onClick={() => onChange([...items, {}])}>
          Add {label.toLowerCase()}
        </Button>
      </div>
    </div>
  );
}

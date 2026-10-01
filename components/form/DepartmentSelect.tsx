import { DEPARTMENTS } from "@/lib/staff";

/** The controlled department list. A legacy value that isn't in the list is kept as an extra option so editing an old record never loses it. */
export default function DepartmentSelect({ name, value, defaultValue, onChange, style }: { name?: string; value?: string; defaultValue?: string; onChange?: (v: string) => void; style?: React.CSSProperties }) {
  const current = value ?? defaultValue ?? "";
  const extra = current && !(DEPARTMENTS as readonly string[]).includes(current) ? current : null;
  return (
    <select className="in" name={name} {...(value !== undefined ? { value } : { defaultValue: current })} onChange={onChange ? (e) => onChange(e.target.value) : undefined} style={style}>
      <option value="">Select department</option>
      {DEPARTMENTS.map((d) => (
        <option key={d} value={d}>
          {d}
        </option>
      ))}
      {extra && <option value={extra}>{extra} (old value)</option>}
    </select>
  );
}

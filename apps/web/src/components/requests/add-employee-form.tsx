import type { EmployeeOption } from '@peopleforge/contracts';
import { Button, Field, Select } from '@peopleforge/ui';
import type { ReactNode } from 'react';
import type { Translate } from '@/i18n/translator';

interface AddEmployeeFormProps {
  action: (formData: FormData) => Promise<never>;
  /** Fields the action needs besides the employee (request ID, or cycle/entity/idempotency key). */
  hidden: Readonly<Record<string, string>>;
  employees: readonly EmployeeOption[];
  t: Translate;
  /** Extra fields before the picker, e.g. a cycle choice. */
  children?: ReactNode;
}

/**
 * Figma: "Add employee [Search by name or ID ▾] [+ Add]". A native select keeps it keyboard
 * and screen-reader friendly without JavaScript; it lists only employees not yet added.
 * A type-ahead picker replaces it when subsidiary sizes are known (ADR-004).
 */
export function AddEmployeeForm({ action, hidden, employees, t, children }: AddEmployeeFormProps) {
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <Field label={t('request.addEmployee')} className="min-w-64 flex-1">
        {({ id }) => (
          <Select id={id} name="employeeId" required defaultValue="">
            <option value="" disabled>
              {t('request.chooseEmployee')}
            </option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.fullName} · {employee.employeeNumber} · {employee.grade}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Button type="submit" variant="outline" icon="plus">
        {t('request.add')}
      </Button>
    </form>
  );
}

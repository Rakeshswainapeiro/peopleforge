import { Badge, Button, Card, CardHeader, Field, Select } from '@peopleforge/ui';

export interface ReportChoice {
  value: string;
  label: string;
}

export interface GroupReportCardProps {
  title: string;
  description: string;
  cadence: string;
  /** The download route; the form sends period, subsidiary and format to it. */
  action: string;
  period: { label: string; options: readonly ReportChoice[] };
  /** Left out when the report is group-wide or the reader sees one subsidiary. */
  entity?: { label: string; options: readonly ReportChoice[] } | undefined;
  /** One submit button per format the report comes in; the first is the primary one. */
  formats: readonly ReportChoice[];
}

/**
 * One group report (R2-06, R2-07): a plain GET form to its download route, so it works without
 * JavaScript and the browser saves the attachment. Each format is its own submit button.
 */
export function GroupReportCard({
  title,
  description,
  cadence,
  action,
  period,
  entity,
  formats,
}: GroupReportCardProps) {
  return (
    <Card label={title} className="flex flex-col">
      <CardHeader
        level={3}
        title={title}
        description={description}
        actions={<Badge tone="neutral">{cadence}</Badge>}
      />
      <form
        method="get"
        action={action}
        aria-label={title}
        className="mt-auto grid gap-4 px-4 pt-4 pb-6 sm:grid-cols-2 sm:items-end sm:px-6"
      >
        <Field label={period.label}>
          {(ids) => (
            <Select id={ids.id} name="period">
              {period.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {entity === undefined ? null : (
          <Field label={entity.label}>
            {(ids) => (
              <Select id={ids.id} name="entity">
                {entity.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          {formats.map((format, index) => (
            <Button
              key={format.value}
              type="submit"
              name="format"
              value={format.value}
              icon="download"
              variant={index === 0 ? 'primary' : 'outline'}
            >
              {format.label}
            </Button>
          ))}
        </div>
      </form>
    </Card>
  );
}

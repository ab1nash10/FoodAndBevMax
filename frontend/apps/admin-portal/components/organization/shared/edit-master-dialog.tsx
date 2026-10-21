'use client';

import { Button } from '@aahar/ui';
import { Loader2 } from 'lucide-react';
import { useEffect, useId } from 'react';
import { useForm } from 'react-hook-form';
import { CheckboxLine } from '@/components/organization/shared/form-controls';
import { Field, Input } from '@/components/ui';
import { Modal } from '@/components/ui-controls';

export interface EditMasterValues {
  isActive: boolean;
  name: string;
}

/**
 * Edits a store's or kitchen's name and status in a popup. The location is shown but not
 * changed here: moving one that already holds stock would leave its history at the old place.
 */
export function EditMasterDialog({
  isPending,
  location,
  nameLabel,
  onClose,
  onSave,
  record,
  title,
}: Readonly<{
  isPending: boolean;
  location: string;
  nameLabel: string;
  onClose: () => void;
  onSave: (values: EditMasterValues) => void;
  /** The values being edited; null keeps the popup closed. */
  record: EditMasterValues | null;
  title: string;
}>) {
  const formId = useId();
  const form = useForm<EditMasterValues>({ defaultValues: { isActive: true, name: '' } });

  useEffect(() => {
    if (record) {
      form.reset(record);
    }
  }, [form, record]);

  const handleSubmit = form.handleSubmit((values) =>
    onSave({ isActive: values.isActive, name: values.name.trim() }),
  );

  return (
    <Modal
      side
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button disabled={isPending} form={formId} type="submit">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save changes
          </Button>
        </div>
      }
      onClose={onClose}
      open={record !== null}
      title={title}
    >
      <form
        className="grid gap-4"
        id={formId}
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <Field
          error={form.formState.errors.name?.message}
          label={nameLabel}
          name={`${formId}-name`}
          required
        >
          <Input
            id={`${formId}-name`}
            maxLength={150}
            {...form.register('name', {
              validate: (value) => value.trim() !== '' || `${nameLabel} is required.`,
            })}
          />
        </Field>
        <Field label="Location" name={`${formId}-location`}>
          <Input id={`${formId}-location`} readOnly value={location} />
        </Field>
        <CheckboxLine
          input={<input className="h-4 w-4" type="checkbox" {...form.register('isActive')} />}
        >
          Active
        </CheckboxLine>
      </form>
    </Modal>
  );
}

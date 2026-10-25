'use client';

import type { TimeSlot } from '@aahar/api-client';
import type { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { useLocationContext } from '@/components/location-context';
import { Field, Input, Select } from '@/components/ui';
import { CheckboxLine } from '@/components/master-data/shared/components';

const time = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Every location: a slot shared by all of them (hospitalId null on the server). */
export const everyLocation = '';

export const timeSlotSchema = z
  .object({
    endTime: z.string(),
    hospitalId: z.string(),
    isActive: z.boolean(),
    isAlwaysAvailable: z.boolean(),
    slotName: z
      .string()
      .trim()
      .min(1, 'Slot name is required.')
      .max(100)
      .regex(/[A-Za-z0-9]/, 'Slot name must include at least one letter or number.'),
    startTime: z.string(),
  })
  .superRefine((values, context) => {
    if (values.isAlwaysAvailable) return;
    if (!time.test(values.startTime)) {
      context.addIssue({ code: 'custom', message: 'Enter a start time.', path: ['startTime'] });
    }
    if (!time.test(values.endTime)) {
      context.addIssue({ code: 'custom', message: 'Enter an end time.', path: ['endTime'] });
    }
    if (values.startTime && values.endTime && values.endTime <= values.startTime) {
      context.addIssue({
        code: 'custom',
        message: 'End must be after start.',
        path: ['endTime'],
      });
    }
  });

export type TimeSlotFormValues = z.infer<typeof timeSlotSchema>;

export const emptyTimeSlot: TimeSlotFormValues = {
  endTime: '',
  hospitalId: everyLocation,
  isActive: true,
  isAlwaysAvailable: false,
  slotName: '',
  startTime: '',
};

export function timeSlotToFormValues(slot: TimeSlot): TimeSlotFormValues {
  return {
    endTime: slot.endTime ?? '',
    hospitalId: slot.hospitalId ?? everyLocation,
    isActive: slot.isActive,
    isAlwaysAvailable: slot.isAlwaysAvailable,
    slotName: slot.slotName,
    startTime: slot.startTime ?? '',
  };
}

/** What the API takes: times only for a slot that is not all day; no location means every one. */
export function timeSlotInput(values: TimeSlotFormValues) {
  return {
    endTime: values.isAlwaysAvailable ? undefined : values.endTime,
    hospitalId: values.hospitalId || null,
    isActive: values.isActive,
    isAlwaysAvailable: values.isAlwaysAvailable,
    slotName: values.slotName.trim(),
    startTime: values.isAlwaysAvailable ? undefined : values.startTime,
  };
}

const clock = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' });

/** "7:00 am – 10:30 am", "All day"; a window ending before it starts runs past midnight. */
export function slotHours(slot: Pick<TimeSlot, 'endTime' | 'isAlwaysAvailable' | 'startTime'>) {
  if (slot.isAlwaysAvailable || !slot.startTime || !slot.endTime) return 'All day';
  const at = (value: string) => clock.format(new Date(`2000-01-01T${value}:00`));
  const overnight = slot.endTime < slot.startTime ? ' (next day)' : '';

  return `${at(slot.startTime)} – ${at(slot.endTime)}${overnight}`;
}

export function TimeSlotFormFields({
  form,
}: Readonly<{ form: UseFormReturn<TimeSlotFormValues> }>) {
  const { availableLocations, canSelectAllLocations } = useLocationContext();
  const { errors } = form.formState;
  const allDay = form.watch('isAlwaysAvailable');
  const location = form.watch('hospitalId');

  return (
    <>
      <Field error={errors.slotName?.message} label="Slot Name" name="slot-name" required>
        <Input id="slot-name" placeholder="e.g. Breakfast" {...form.register('slotName')} />
      </Field>
      <CheckboxLine
        input={
          <input className="h-4 w-4" type="checkbox" {...form.register('isAlwaysAvailable')} />
        }
      >
        All day (no start or end time)
      </CheckboxLine>
      {allDay ? null : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field error={errors.startTime?.message} label="Starts" name="start-time" required>
            <Input id="start-time" type="time" {...form.register('startTime')} />
          </Field>
          <Field error={errors.endTime?.message} label="Ends" name="end-time" required>
            <Input id="end-time" type="time" {...form.register('endTime')} />
          </Field>
        </div>
      )}
      <Field error={errors.hospitalId?.message} label="Location" name="slot-location">
        <Select id="slot-location" {...form.register('hospitalId')}>
          {/* Only a user who reaches every location may share a slot with all of them; a slot
              already shared keeps the choice, so editing it never moves it to one location. */}
          {canSelectAllLocations || location === everyLocation ? (
            <option value={everyLocation}>Every location</option>
          ) : null}
          {availableLocations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.displayName || location.hospitalName}
            </option>
          ))}
        </Select>
      </Field>
      <CheckboxLine
        input={<input className="h-4 w-4" type="checkbox" {...form.register('isActive')} />}
      >
        Active
      </CheckboxLine>
    </>
  );
}

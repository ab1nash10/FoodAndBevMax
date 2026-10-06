'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { Grn, GrnInput, StoreItem } from '@aahar/api-client';
import { StatusChip } from '@/components/design-system';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Field, Input, Panel, Select } from '@/components/ui';
import { useAuth } from '@/components/auth-provider';
import { canOpenPath, recordHref } from '@/lib/navigation';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { invalidateGrnQueries } from '@/lib/query-invalidation';
import {
  emptyBatch,
  emptyLine,
  grnLinesSchema,
  headerSchema,
  lineTotals,
  quantity,
  rejectedQty,
  useMappedStoreItems,
  type BatchDraft,
  type GrnHeaderFormValues,
  type LineDraft,
} from '@/components/inventory/grns/grn-form';
import { HospitalSelect, PageHeader, StoreSelect } from '@/components/inventory/shared/components';
import {
  defaultReceivedDate,
  optionalValue,
  useHospitals,
  useStores,
} from '@/components/inventory/shared/utils';

export function CreateGrnPageClient() {
  const { isLocationSelectorLocked, scopedHospitalId } = useLocationContext();
  const { hasPermission } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [lines, setLines] = useState<LineDraft[]>(() => [emptyLine()]);
  const [formError, setFormError] = useState('');
  const [createdGrn, setCreatedGrn] = useState<Grn | null>(null);
  const form = useForm<GrnHeaderFormValues>({
    defaultValues: {
      hospitalId: scopedHospitalId ?? '',
      invoiceNumber: '',
      poNumber: '',
      receivedBy: 'Super Admin',
      receivedDate: defaultReceivedDate(),
      remarks: '',
      storeId: '',
      vendorName: '',
    },
  });
  const selectedHospitalId = form.watch('hospitalId');
  const selectedStoreId = form.watch('storeId');
  const hospitalsQuery = useHospitals();
  const storesQuery = useStores(selectedHospitalId);
  const mappedItemsQuery = useMappedStoreItems(selectedStoreId);
  const isReadOnly = createdGrn?.status === 'POSTED_TO_STOCK' || createdGrn?.status === 'CANCELLED';

  const itemOptions = mappedItemsQuery.data ?? [];
  const itemNameMap = useMemo(
    () => new Map(itemOptions.map((mapping) => [mapping.itemId, mapping.item.itemName] as const)),
    [itemOptions],
  );

  useEffect(() => {
    if (scopedHospitalId) {
      form.setValue('hospitalId', scopedHospitalId, { shouldValidate: true });
      form.setValue('storeId', '', { shouldValidate: true });
      setCreatedGrn(null);
    }
  }, [form, scopedHospitalId]);

  const saveMutation = useMutation({
    mutationFn: (body: GrnInput) => organizationApi.createGrn(body),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'GRN was not saved',
        variant: 'error',
      });
    },
    onSuccess(response) {
      const href = recordHref('/inventory/grns', { id: response.data.id });
      invalidateGrnQueries(queryClient);
      showToast({
        action: { href, label: `View ${response.data.grnNumber}` },
        description: response.data.grnNumber,
        title: 'Draft GRN saved',
        variant: 'success',
      });

      // Verify and post from the GRN itself; without GRN_VIEW, stay here with the result below.
      if (canOpenPath(href, hasPermission)) {
        router.push(href);
      } else {
        setCreatedGrn(response.data);
      }
    },
  });

  const postMutation = useMutation({
    mutationFn: (id: string) => organizationApi.postGrnToStock(id),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'GRN was not posted',
        variant: 'error',
      });
    },
    onSuccess(response) {
      setCreatedGrn(response.data);
      invalidateGrnQueries(queryClient);
      showToast({ title: 'GRN posted to stock', variant: 'success' });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => organizationApi.cancelGrn(id),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'GRN was not cancelled',
        variant: 'error',
      });
    },
    onSuccess(response) {
      setCreatedGrn(response.data);
      invalidateGrnQueries(queryClient);
      showToast({ title: 'GRN cancelled', variant: 'success' });
    },
  });

  function updateLine(lineIndex: number, patch: Partial<LineDraft>) {
    setLines((current) =>
      current.map((line, index) => (index === lineIndex ? { ...line, ...patch } : line)),
    );
  }

  function updateBatch(lineIndex: number, batchIndex: number, patch: Partial<BatchDraft>) {
    setLines((current) =>
      current.map((line, index) =>
        index === lineIndex
          ? {
              ...line,
              batches: line.batches.map((batch, currentBatchIndex) =>
                currentBatchIndex === batchIndex ? { ...batch, ...patch } : batch,
              ),
            }
          : line,
      ),
    );
  }

  function addBatch(lineIndex: number) {
    setLines((current) =>
      current.map((line, index) =>
        index === lineIndex ? { ...line, batches: [...line.batches, emptyBatch()] } : line,
      ),
    );
  }

  function removeBatch(lineIndex: number, batchIndex: number) {
    setLines((current) =>
      current.map((line, index) =>
        index === lineIndex && line.batches.length > 1
          ? {
              ...line,
              batches: line.batches.filter(
                (_, currentBatchIndex) => currentBatchIndex !== batchIndex,
              ),
            }
          : line,
      ),
    );
  }

  function addLine() {
    setLines((current) => [...current, emptyLine()]);
  }

  function removeLine(lineIndex: number) {
    setLines((current) =>
      current.length > 1 ? current.filter((_, index) => index !== lineIndex) : current,
    );
  }

  const handleSubmit = form.handleSubmit((values) => {
    setFormError('');
    const header = headerSchema.safeParse(values);
    const parsedLines = grnLinesSchema.safeParse(lines);

    if (!header.success) {
      const firstIssue = header.error.issues[0];
      setFormError(firstIssue?.message ?? 'Check GRN header details.');
      return;
    }

    if (!parsedLines.success) {
      const firstIssue = parsedLines.error.issues[0];
      setFormError(firstIssue?.message ?? 'Check GRN line details.');
      return;
    }

    const items = parsedLines.data.map((line) => {
      const totals = lineTotals(line);

      return {
        acceptedQty: Number(totals.accepted.toFixed(3)),
        batches: line.batches.map((batch) => ({
          acceptedQty: Number(quantity(batch.acceptedQty).toFixed(3)),
          batchNumber: batch.batchNumber.trim(),
          expiryDate: batch.expiryDate,
          manufacturingDate: optionalValue(batch.manufacturingDate),
          receivedQty: Number(quantity(batch.receivedQty).toFixed(3)),
          rejectedQty: Number(rejectedQty(batch).toFixed(3)),
          rejectionReason: optionalValue(batch.rejectionReason),
        })),
        itemId: line.itemId,
        orderedQty: line.orderedQty ? Number(quantity(line.orderedQty).toFixed(3)) : undefined,
        receivedQty: Number(totals.received.toFixed(3)),
        rejectedQty: Number(totals.rejected.toFixed(3)),
        rejectionReason: optionalValue(line.rejectionReason),
        remarks: optionalValue(line.remarks),
      };
    });

    saveMutation.mutate({
      hospitalId: header.data.hospitalId,
      invoiceNumber: optionalValue(header.data.invoiceNumber),
      items,
      poNumber: optionalValue(header.data.poNumber),
      receivedBy: header.data.receivedBy,
      receivedDate: new Date(header.data.receivedDate).toISOString(),
      remarks: optionalValue(header.data.remarks),
      storeId: header.data.storeId,
      vendorName: optionalValue(header.data.vendorName),
    });
  });

  return (
    <section className="space-y-5">
      <PageHeader
        action={
          <Button asChild variant="outline">
            <Link href="/inventory/grns">Back to GRNs</Link>
          </Button>
        }
        subtitle="Create a manual goods receipt note for mapped MRP items."
        title="Create GRN"
      />

      {createdGrn ? (
        <Panel className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div>
            <p className="text-sm font-semibold text-ds-muted">Generated GRN</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <p className="text-xl font-semibold text-ds-text">{createdGrn.grnNumber}</p>
              <StatusChip status={createdGrn.status} />
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              disabled={createdGrn.status !== 'DRAFT' || postMutation.isPending}
              onClick={() => postMutation.mutate(createdGrn.id)}
              type="button"
            >
              {postMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Post to Stock
            </Button>
            <Button
              disabled={createdGrn.status !== 'DRAFT' || cancelMutation.isPending}
              onClick={() => cancelMutation.mutate(createdGrn.id)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
          </div>
        </Panel>
      ) : null}

      <Panel className="p-4">
        <form
          className="space-y-6"
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <div>
            <h2 className="text-lg font-semibold tracking-normal text-ds-text">GRN Header</h2>
            <p className="text-sm text-ds-muted">
              Select the location and store before adding item batches.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              error={form.formState.errors.hospitalId?.message}
              label="Location"
              name="hospitalId"
            >
              <HospitalSelect
                disabled={isLocationSelectorLocked || isReadOnly}
                hospitals={hospitalsQuery.data ?? []}
                onChange={(value) => {
                  form.setValue('hospitalId', value, { shouldValidate: true });
                  form.setValue('storeId', '', { shouldValidate: true });
                  setCreatedGrn(null);
                }}
                value={selectedHospitalId}
              />
            </Field>
            <Field error={form.formState.errors.storeId?.message} label="Store" name="storeId">
              <StoreSelect
                disabled={!selectedHospitalId || isReadOnly}
                onChange={(value) => {
                  form.setValue('storeId', value, { shouldValidate: true });
                  setCreatedGrn(null);
                }}
                stores={storesQuery.data ?? []}
                value={selectedStoreId}
              />
            </Field>
            <Field
              error={form.formState.errors.receivedDate?.message}
              label="Received Date"
              name="receivedDate"
            >
              <Input
                disabled={isReadOnly}
                type="datetime-local"
                {...form.register('receivedDate')}
              />
            </Field>
            <Field
              error={form.formState.errors.receivedBy?.message}
              label="Received By"
              name="receivedBy"
            >
              <Input disabled={isReadOnly} {...form.register('receivedBy')} />
            </Field>
            <Field label="Vendor Name" name="vendorName">
              <Input
                disabled={isReadOnly}
                placeholder="Optional"
                {...form.register('vendorName')}
              />
            </Field>
            <Field label="PO Number" name="poNumber">
              <Input disabled={isReadOnly} placeholder="Optional" {...form.register('poNumber')} />
            </Field>
            <Field label="Invoice Number" name="invoiceNumber">
              <Input
                disabled={isReadOnly}
                placeholder="Optional"
                {...form.register('invoiceNumber')}
              />
            </Field>
            <Field label="Remarks" name="remarks">
              <Input disabled={isReadOnly} placeholder="Optional" {...form.register('remarks')} />
            </Field>
          </div>

          <div className="rounded-lg border bg-ds-subtle/60 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-normal text-ds-text">GRN Lines</h2>
                <p className="text-sm text-ds-muted">
                  Only MRP items mapped to the selected store are available.
                </p>
              </div>
              <Button
                disabled={!selectedStoreId || isReadOnly}
                onClick={addLine}
                type="button"
                variant="outline"
              >
                <Plus className="h-4 w-4" />
                Add Line
              </Button>
            </div>

            {!selectedStoreId ? (
              <div className="mt-4 rounded-md border border-ds-status-pending-fg/25 bg-ds-status-pending-bg p-3 text-sm font-medium text-ds-status-pending-fg">
                Select a location and store before adding GRN lines.
              </div>
            ) : null}

            {selectedStoreId && itemOptions.length === 0 && !mappedItemsQuery.isLoading ? (
              <div className="mt-4 rounded-md border border-ds-status-pending-fg/25 bg-ds-status-pending-bg p-3 text-sm font-medium text-ds-status-pending-fg">
                Map MRP items to this store before creating a GRN.
              </div>
            ) : null}

            <div className="mt-5 space-y-5">
              {lines.map((line, lineIndex) => {
                const totals = lineTotals(line);

                return (
                  <div className="rounded-lg border bg-white p-4" key={line.clientId}>
                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_140px_140px_140px_auto]">
                      <Field label="Item" name={`line-${line.clientId}-item`}>
                        <Select
                          disabled={!selectedStoreId || isReadOnly}
                          onChange={(event) =>
                            updateLine(lineIndex, { itemId: event.target.value })
                          }
                          value={line.itemId}
                        >
                          <option value="">Select mapped item</option>
                          {itemOptions.map((mapping: StoreItem) => (
                            <option key={mapping.id} value={mapping.itemId}>
                              {mapping.item.itemName} ({mapping.item.itemCode})
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Ordered Qty" name={`line-${line.clientId}-ordered`}>
                        <Input
                          disabled={isReadOnly}
                          min="0"
                          onChange={(event) =>
                            updateLine(lineIndex, { orderedQty: event.target.value })
                          }
                          type="number"
                          value={line.orderedQty}
                        />
                      </Field>
                      <div className="rounded-md border bg-ds-subtle p-3 text-sm">
                        <p className="text-ds-muted">Received</p>
                        <p className="font-semibold text-ds-text">{totals.received.toFixed(3)}</p>
                      </div>
                      <div className="rounded-md border bg-ds-subtle p-3 text-sm">
                        <p className="text-ds-muted">Accepted</p>
                        <p className="font-semibold text-ds-text">{totals.accepted.toFixed(3)}</p>
                      </div>
                      <div className="flex items-end justify-end">
                        <Button
                          className="border-ds-status-bad-fg/25 text-ds-status-bad-fg hover:bg-ds-status-bad-bg"
                          disabled={lines.length === 1 || isReadOnly}
                          onClick={() => removeLine(lineIndex)}
                          type="button"
                          variant="outline"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <Field label="Rejection Reason" name={`line-${line.clientId}-reason`}>
                        <Input
                          disabled={isReadOnly}
                          onChange={(event) =>
                            updateLine(lineIndex, { rejectionReason: event.target.value })
                          }
                          placeholder="Optional"
                          value={line.rejectionReason}
                        />
                      </Field>
                      <Field label="Remarks" name={`line-${line.clientId}-remarks`}>
                        <Input
                          disabled={isReadOnly}
                          onChange={(event) =>
                            updateLine(lineIndex, { remarks: event.target.value })
                          }
                          placeholder="Optional"
                          value={line.remarks}
                        />
                      </Field>
                    </div>
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-ds-text-2">
                          Batches for {itemNameMap.get(line.itemId) ?? 'selected item'}
                        </p>
                        <Button
                          disabled={isReadOnly}
                          onClick={() => addBatch(lineIndex)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <Plus className="h-4 w-4" />
                          Add Batch
                        </Button>
                      </div>
                      {line.batches.map((batch, batchIndex) => (
                        <div
                          className="grid gap-3 rounded-md border bg-ds-subtle p-3 min-[1400px]:grid-cols-[1fr_150px_150px_130px_130px_130px_1fr_auto]"
                          key={batch.clientId}
                        >
                          <Input
                            disabled={isReadOnly}
                            onChange={(event) =>
                              updateBatch(lineIndex, batchIndex, {
                                batchNumber: event.target.value,
                              })
                            }
                            placeholder="Batch number"
                            value={batch.batchNumber}
                          />
                          <Input
                            disabled={isReadOnly}
                            onChange={(event) =>
                              updateBatch(lineIndex, batchIndex, {
                                manufacturingDate: event.target.value,
                              })
                            }
                            type="date"
                            value={batch.manufacturingDate}
                          />
                          <Input
                            disabled={isReadOnly}
                            onChange={(event) =>
                              updateBatch(lineIndex, batchIndex, { expiryDate: event.target.value })
                            }
                            type="date"
                            value={batch.expiryDate}
                          />
                          <Input
                            disabled={isReadOnly}
                            min="0"
                            onChange={(event) =>
                              updateBatch(lineIndex, batchIndex, {
                                receivedQty: event.target.value,
                              })
                            }
                            placeholder="Received"
                            type="number"
                            value={batch.receivedQty}
                          />
                          <Input
                            disabled={isReadOnly}
                            min="0"
                            onChange={(event) =>
                              updateBatch(lineIndex, batchIndex, {
                                acceptedQty: event.target.value,
                              })
                            }
                            placeholder="Accepted"
                            type="number"
                            value={batch.acceptedQty}
                          />
                          <div className="rounded-md border bg-white px-3 py-2 text-sm">
                            <p className="text-xs text-ds-muted">Rejected</p>
                            <p className="font-semibold text-ds-text">
                              {rejectedQty(batch).toFixed(3)}
                            </p>
                          </div>
                          <Input
                            disabled={isReadOnly}
                            onChange={(event) =>
                              updateBatch(lineIndex, batchIndex, {
                                rejectionReason: event.target.value,
                              })
                            }
                            placeholder="Reason"
                            value={batch.rejectionReason}
                          />
                          <Button
                            className="border-ds-status-bad-fg/25 text-ds-status-bad-fg hover:bg-ds-status-bad-bg"
                            disabled={line.batches.length === 1 || isReadOnly}
                            onClick={() => removeBatch(lineIndex, batchIndex)}
                            type="button"
                            variant="outline"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {formError ? (
            <div className="rounded-md border border-ds-status-bad-fg/25 bg-ds-status-bad-bg p-3 text-sm font-medium text-ds-status-bad-fg">
              {formError}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button asChild variant="outline">
              <Link href="/inventory/grns">Close</Link>
            </Button>
            <Button
              disabled={saveMutation.isPending || Boolean(createdGrn) || isReadOnly}
              type="submit"
            >
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save Draft
            </Button>
          </div>
        </form>
      </Panel>
    </section>
  );
}

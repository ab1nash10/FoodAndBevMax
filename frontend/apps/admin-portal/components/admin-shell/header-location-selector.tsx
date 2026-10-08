'use client';

import { Button } from '@aahar/ui';
import type { HospitalSummary } from '@aahar/api-client';
import { Check, ChevronDown, MapPin } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatGlobalLocationLabel, useLocationContext } from '@/components/location-context';
import { cn } from '@/lib/utils';

function getLocationName(location: HospitalSummary): string {
  return location.displayName || location.title || location.hospitalName || 'Location';
}

function getLocationMeta(location: HospitalSummary): string {
  return [location.city, location.state].filter(Boolean).join(', ') || 'Location';
}

export function HeaderLocationSelector() {
  const {
    availableLocations,
    canSelectAllLocations,
    isLoadingLocations,
    isLocationSelectorLocked,
    locationLabel,
    selectedLocationValue,
    setSelectedLocation,
  } = useLocationContext();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  function selectLocation(locationId: string | null) {
    setSelectedLocation(locationId);
    setIsOpen(false);
  }

  const allLocationsSelected = selectedLocationValue === 'all';

  return (
    <div className="relative" ref={containerRef}>
      {/* A user who works at one location stays there: it shows, with nothing to pick. */}
      <Button
        aria-expanded={isLocationSelectorLocked ? undefined : isOpen}
        aria-label={
          isLocationSelectorLocked
            ? `Your location: ${locationLabel}`
            : `Select Location. Current selection: ${locationLabel}`
        }
        className={cn(
          'w-10 px-0 text-ds-text-2 xl:w-auto xl:px-3.5',
          !allLocationsSelected && 'border-ds-teal-border bg-ds-teal-soft',
          isLocationSelectorLocked && 'cursor-default',
        )}
        disabled={isLoadingLocations}
        onClick={() => {
          if (!isLocationSelectorLocked) setIsOpen((current) => !current);
        }}
        title={locationLabel}
        type="button"
        variant="outline"
      >
        <MapPin className="h-[18px] w-[18px] shrink-0 text-ds-teal-text" strokeWidth={1.8} />
        <span className="hidden max-w-40 truncate xl:inline">{locationLabel}</span>
        {isLocationSelectorLocked ? null : (
          <ChevronDown
            aria-hidden="true"
            className="hidden h-4 w-4 shrink-0 text-ds-muted xl:block"
          />
        )}
      </Button>

      {isOpen ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-card border border-ds-border bg-ds-surface shadow-xl shadow-ds-text/10">
          <div className="border-b border-ds-divider px-4 py-3">
            <p className="text-sm font-bold text-ds-text">Select Location</p>
            <p className="mt-1 text-xs text-ds-muted">
              Choose a location to view location-specific data
            </p>
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {canSelectAllLocations ? (
              <button
                className={cn(
                  'flex w-full items-center gap-3 rounded-control-lg px-3 py-3 text-left transition hover:bg-ds-subtle',
                  allLocationsSelected && 'bg-ds-teal-soft',
                )}
                onClick={() => selectLocation(null)}
                type="button"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-ds-primary-soft text-ds-link">
                  <MapPin className="h-4 w-4" strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ds-text">All Locations</span>
                  <span className="mt-0.5 block text-xs text-ds-muted">
                    View consolidated data across all locations
                  </span>
                </span>
                {allLocationsSelected ? (
                  <Check className="h-4 w-4 shrink-0 text-ds-teal-text" />
                ) : null}
              </button>
            ) : null}

            {availableLocations.map((location) => {
              const isSelected = selectedLocationValue === location.id;

              return (
                <button
                  className={cn(
                    'mt-1 flex w-full items-center gap-3 rounded-control-lg px-3 py-3 text-left transition hover:bg-ds-subtle',
                    isSelected && 'bg-ds-teal-soft',
                  )}
                  key={location.id}
                  onClick={() => selectLocation(location.id)}
                  title={formatGlobalLocationLabel(location)}
                  type="button"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-ds-tile-locations-bg text-ds-tile-locations-fg">
                    <MapPin className="h-4 w-4" strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ds-text">
                      {getLocationName(location)}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-ds-muted">
                      {getLocationMeta(location)}
                    </span>
                  </span>
                  {isSelected ? <Check className="h-4 w-4 shrink-0 text-ds-teal-text" /> : null}
                </button>
              );
            })}

            {!isLoadingLocations && availableLocations.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-ds-muted">
                No active locations available.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

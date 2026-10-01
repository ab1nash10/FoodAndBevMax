import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  MUTABLE_NOTIFICATION_CATEGORIES,
  THEMES,
  type ThemePreference,
} from '../../common/preferences';

/** A partial update: an omitted field is kept, and null clears it back to the default. */
export class UpdatePreferencesDto {
  @ApiPropertyOptional({ enum: THEMES, nullable: true })
  @IsOptional()
  @IsIn([...THEMES])
  theme?: ThemePreference | null;

  @ApiPropertyOptional({ description: '"all" or a location id', nullable: true })
  @IsOptional()
  @Matches(/^(all|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i, {
    message: 'defaultLocationId must be "all" or a location id',
  })
  defaultLocationId?: string | null;

  // A path inside the portal only: one leading slash, never "//", so it cannot redirect away.
  @ApiPropertyOptional({ example: '/inventory/grns', nullable: true })
  @IsOptional()
  @MaxLength(100)
  @Matches(/^\/(?!\/)[a-z0-9\-/]*$/, { message: 'startPage must be a portal path' })
  startPage?: string | null;

  @ApiPropertyOptional({ enum: MUTABLE_NOTIFICATION_CATEGORIES, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsIn([...MUTABLE_NOTIFICATION_CATEGORIES], { each: true })
  mutedNotificationCategories?: string[] | null;
}

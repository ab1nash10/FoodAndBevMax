// The F&B look on the phone: the portal's blue and white, big type, thumb-sized buttons.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const colors = {
  bad: '#B42339',
  badSoft: '#FDE8EB',
  border: '#E4E9F1',
  link: '#0A4886',
  muted: '#5B6880',
  ok: '#0B6B4F',
  okSoft: '#E3F4EE',
  page: '#F5F8FC',
  pending: '#92400E',
  pendingSoft: '#FDF1DC',
  primary: '#0B57A4',
  primaryBorder: '#CDE0F7',
  primarySoft: '#E8F1FC',
  surface: '#FFFFFF',
  text: '#0E1A2B',
} as const;

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({
  color = colors.text,
  name,
  size = 18,
}: {
  color?: string;
  name: IconName;
  size?: number;
}) {
  return (
    <Ionicons
      accessibilityElementsHidden
      color={color}
      importantForAccessibility="no"
      name={name}
      size={size}
    />
  );
}

type Variant = 'danger' | 'ghost' | 'onBlue' | 'outline' | 'primary' | 'white';

const buttonLooks: Record<Variant, { box: ViewStyle; text: string }> = {
  danger: { box: { backgroundColor: 'transparent' }, text: colors.bad },
  ghost: { box: { backgroundColor: 'transparent' }, text: colors.muted },
  /** A second button on a blue screen: white outline. */
  onBlue: { box: { borderColor: 'rgba(255,255,255,0.45)', borderWidth: 1 }, text: '#FFFFFF' },
  outline: {
    box: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
    text: colors.text,
  },
  primary: { box: { backgroundColor: colors.primary }, text: '#FFFFFF' },
  white: { box: { backgroundColor: '#FFFFFF' }, text: colors.primary },
};

export function Button({
  busy,
  disabled,
  icon,
  label,
  onPress,
  size = 'large',
  variant = 'primary',
}: {
  busy?: boolean;
  disabled?: boolean;
  icon?: IconName;
  label: string;
  onPress: () => void;
  size?: 'large' | 'medium';
  variant?: Variant;
}) {
  const look = buttonLooks[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: disabled || busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { minHeight: size === 'large' ? 54 : 46 },
        look.box,
        (pressed || disabled) && { opacity: disabled ? 0.5 : 0.85 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={look.text} />
      ) : icon ? (
        <Icon color={look.text} name={icon} size={20} />
      ) : null}
      <Text style={[styles.buttonText, { color: look.text, fontSize: size === 'large' ? 17 : 15 }]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A screen: safe-area padding, the page colour, and a header with an optional back arrow. */
export function Screen({
  back,
  children,
  right,
  subtitle,
  title,
}: {
  back?: boolean;
  children: ReactNode;
  right?: ReactNode;
  subtitle?: string | null;
  title: string;
}) {
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}>
        {back ? (
          <Pressable
            accessibilityLabel="Back to my deliveries"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            style={styles.back}
          >
            <Icon name="chevron-back" size={26} />
          </Pressable>
        ) : (
          <View style={styles.mark}>
            <Text style={styles.markText}>{'F&B'}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} style={styles.subtitle}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
      {children}
    </SafeAreaView>
  );
}

export function Pill({
  children,
  tone,
}: {
  children: ReactNode;
  tone: 'ok' | 'pending' | 'primary';
}) {
  const look = {
    ok: [colors.okSoft, colors.ok],
    pending: [colors.pendingSoft, colors.pending],
    primary: [colors.primarySoft, colors.link],
  }[tone];

  return (
    <View style={[styles.pill, { backgroundColor: look[0] }]}>
      {typeof children === 'string' ? (
        <Text style={[styles.pillText, { color: look[1] }]}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}

export const styles = StyleSheet.create({
  back: { alignItems: 'center', height: 44, justifyContent: 'center', marginLeft: -6, width: 40 },
  button: {
    alignItems: 'center',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonText: { fontWeight: '700' },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  header: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  mark: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 11,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  markText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  muted: { color: colors.muted, fontSize: 14 },
  pill: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillText: { fontSize: 13, fontWeight: '600' },
  screen: { backgroundColor: colors.page, flex: 1 },
  subtitle: { color: colors.muted, fontSize: 13 },
  title: { color: colors.text, fontSize: 21, fontWeight: '800', letterSpacing: -0.3 },
});

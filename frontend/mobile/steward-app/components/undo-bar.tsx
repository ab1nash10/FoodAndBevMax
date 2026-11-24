// "#0142 delivered · Undo": shown for the few seconds before a delivery is sent.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDeliveries } from '../lib/deliveries';
import { Icon } from '../lib/ui';

export function UndoBar() {
  const { held, undo } = useDeliveries();
  const insets = useSafeAreaInsets();

  if (!held) return null;

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[styles.bar, { bottom: Math.max(insets.bottom, 12) + 8 }]}
    >
      <Icon color="#7AD3AE" name="checkmark" size={22} />
      <Text style={styles.text}>#{held.orderNumber} delivered</Text>
      <Pressable accessibilityRole="button" onPress={undo} style={styles.undo}>
        <Icon color="#FFFFFF" name="arrow-undo" size={16} />
        <Text style={styles.undoText}>Undo</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: 'center',
    backgroundColor: '#0E1A2B',
    borderRadius: 16,
    elevation: 8,
    flexDirection: 'row',
    gap: 10,
    left: 14,
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 8,
    position: 'absolute',
    right: 14,
  },
  text: { color: '#FFFFFF', flex: 1, fontSize: 15 },
  undo: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 6,
    height: 44,
    paddingHorizontal: 14,
  },
  undoText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});

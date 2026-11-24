// Pieces of an order shared by the list and the order screen.
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Delivery } from '../lib/types';
import { colors, Icon } from '../lib/ui';

/** The clock the "Ready 6 min ago" badges count from, ticking each half minute. */
export function useNow() {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  return now;
}

export function Items({ order }: { order: Delivery }) {
  return (
    <View style={{ gap: 4 }}>
      {order.items.map((item, index) => (
        <Text key={`${item.name}-${index}`} style={styles.item}>
          <Text style={{ fontWeight: '700' }}>{item.quantity} ×</Text> {item.name}
          {item.note ? <Text style={{ color: colors.muted }}> · {item.note}</Text> : null}
        </Text>
      ))}
    </View>
  );
}

export function Instructions({ text }: { text: string }) {
  return (
    <View style={styles.note}>
      <Icon color={colors.pending} name="chatbox-outline" size={17} />
      <Text style={styles.noteText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  item: { color: colors.text, fontSize: 16 },
  note: {
    backgroundColor: colors.pendingSoft,
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    padding: 10,
  },
  noteText: { color: colors.pending, flex: 1, fontSize: 14 },
});

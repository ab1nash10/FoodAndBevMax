import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CodeDelivery } from '../../components/code-delivery';
import { Instructions, Items, useNow } from '../../components/order-parts';
import { isActive } from '../../lib/alerts';
import { useDeliveries } from '../../lib/deliveries';
import { agoText, itemCount, roomOf, timeOf } from '../../lib/format';
import { UNDELIVERED_REASONS } from '../../lib/types';
import { Button, colors, Screen, styles as ui } from '../../lib/ui';

/** One order, big, for carrying it to the bed: Delivered, or given back with why. */
export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { giveBack, markDelivered, orders } = useDeliveries();
  const now = useNow();
  const [askingWhy, setAskingWhy] = useState(false);
  const [busy, setBusy] = useState(false);
  const order = orders.find((candidate) => candidate.id === id && isActive(candidate));

  // Delivered, given back, or taken off them meanwhile: back to the list.
  if (!order) return <Redirect href="/" />;

  const rows: [string, string][] = [
    ['Ordered', timeOf(order.placedAt)],
    ...(order.stewardAssignedAt
      ? [['Given to you', timeOf(order.stewardAssignedAt)] as [string, string]]
      : []),
    [
      'Ready',
      order.readyAt
        ? `${timeOf(order.readyAt)} · ${agoText('', order.readyAt, now).trim()}`
        : 'Still being made',
    ],
  ];

  return (
    <Screen back title={`Order #${order.orderNumber}`}>
      <ScrollView contentContainerStyle={{ gap: 12, padding: 14 }}>
        <View style={styles.takeTo}>
          <Text style={styles.takeToLabel}>Take to</Text>
          <Text style={styles.takeToRoom}>{roomOf(order)}</Text>
          <Text style={styles.takeToFrom}>{`Pick up at ${order.restaurantName}`}</Text>
        </View>
        <View style={ui.card}>
          <Text style={styles.label}>What to take · {itemCount(order)}</Text>
          <Items order={order} />
        </View>
        {order.instructions ? <Instructions text={order.instructions} /> : null}
        <View style={[ui.card, { gap: 8 }]}>
          {rows.map(([label, value]) => (
            <View key={label} style={styles.time}>
              <Text style={ui.muted}>{label}</Text>
              <Text style={styles.timeValue}>{value}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.actions}>
        {askingWhy ? (
          <>
            <Text accessibilityRole="header" style={styles.why}>
              Why couldn’t you deliver it?
            </Text>
            {UNDELIVERED_REASONS.map((reason) => (
              <Button
                disabled={busy}
                key={reason}
                label={reason}
                onPress={async () => {
                  setBusy(true);
                  const given = await giveBack(order, reason);
                  setBusy(false);
                  if (given && router.canGoBack()) router.back();
                }}
                size="medium"
                variant="outline"
              />
            ))}
            <Button
              disabled={busy}
              label="Back"
              onPress={() => setAskingWhy(false)}
              size="medium"
              variant="ghost"
            />
          </>
        ) : (
          <>
            {/* Delivered, this screen goes: the order is no longer theirs to take. */}
            {order.status === 'READY' && order.needsCode ? (
              <CodeDelivery order={order} />
            ) : order.status === 'READY' ? (
              <Button
                icon="checkmark"
                label="Delivered"
                onPress={() => {
                  markDelivered(order);
                  if (router.canGoBack()) router.back();
                  else router.replace('/');
                }}
              />
            ) : (
              <Text style={[ui.muted, { paddingVertical: 8, textAlign: 'center' }]}>
                Still in the kitchen: it rings when it’s ready.
              </Text>
            )}
            <Button
              label="Couldn’t deliver"
              onPress={() => setAskingWhy(true)}
              size="medium"
              variant="danger"
            />
          </>
        )}
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  label: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  takeTo: { backgroundColor: colors.primary, borderRadius: 20, gap: 4, padding: 18 },
  takeToFrom: { color: 'rgba(255,255,255,0.88)', fontSize: 14 },
  takeToLabel: { color: 'rgba(255,255,255,0.78)', fontSize: 13, fontWeight: '700' },
  takeToRoom: { color: '#FFFFFF', fontSize: 30, fontWeight: '800', letterSpacing: -0.6 },
  time: { flexDirection: 'row', justifyContent: 'space-between' },
  timeValue: { color: colors.text, fontSize: 14, fontWeight: '600' },
  why: { color: colors.text, fontSize: 16, fontWeight: '800', paddingBottom: 2 },
});
